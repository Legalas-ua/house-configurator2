import type { HousePlan } from '../config/types'

// ============================================================
// Дах як ДАНІ — за тим самим принципом, що план і вікна.
//
// Дах належить ПОКРИТТЮ поверху, а не його підлозі: рівень N — це те, що
// накриває поверх N. Тому доступні лише ті рівні, де покриття справді
// відкрите: над верхнім поверхом завжди, над нижнім — лише там, де його не
// накриває поверх вище.
// ============================================================

export type RoofKind = 'flat' | 'gable' | 'mono'

export interface RoofPart {
  level: number // індекс поверху, ПОКРИТТЯ якого це дах
  kind: RoofKind
  parapetH: number // висота парапету (плоский)
  parapetT: number // товщина парапету (плоский)
  pitch: number // кут скату, градуси (скатний / односхилий)
  rotation: number // поворот гребеня/схилу, кратний 90°
  overhang: number // звіс, м
}

// ---- Межі, узгоджені з Lev ----
export const PARAPET_H = { min: 0.3, max: 1.5, step: 0.1 }
export const PARAPET_T = { min: 0.2, max: 0.5, step: 0.05 }
export const PITCH = { min: 10, max: 60, step: 5 }
// Звіс: або зовсім без нього, або від 300 мм. Проміжних значень не буває —
// 100-200 мм на фасаді просто не читаються.
export const OVERHANG = { min: 0.3, max: 1.0, step: 0.1 }
export const NO_OVERHANG = 0

export const DEFAULTS: Omit<RoofPart, 'level' | 'kind'> = {
  parapetH: 0.45,
  parapetT: 0.2,
  pitch: 35,
  rotation: 0,
  overhang: 0.3,
}

const clampStep = (v: number, r: { min: number; max: number; step: number }) =>
  Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step))

// Приводимо параметри в дозволені межі та до кратності кроку.
export function normalizeRoof(part: RoofPart): RoofPart {
  return {
    ...part,
    parapetH: clampStep(part.parapetH, PARAPET_H),
    parapetT: clampStep(part.parapetT, PARAPET_T),
    pitch: clampStep(part.pitch, PITCH),
    // Скатний має два осмислені напрямки (гребінь уздовж / упоперек),
    // односхилий — чотири (куди дивиться схил). Плоскому поворот байдужий.
    rotation: ((Math.round(part.rotation / 90) * 90) % (part.kind === 'gable' ? 180 : 360) + 360) % 360,
    overhang: part.overhang < OVERHANG.min / 2 ? NO_OVERHANG : clampStep(part.overhang, OVERHANG),
  }
}

// Рівні, де дах справді потрібен. Рівень N відкритий, якщо його покриття не
// сховане поверхом N+1 повністю.
export function roofLevels(plan: HousePlan): number[] {
  const out: number[] = []
  const n = plan.floors.length
  for (let i = 0; i < n; i++) {
    if (i === n - 1) {
      out.push(i) // верхній поверх завжди треба накрити
      continue
    }
    const mine = area(plan, i)
    const above = area(plan, i + 1)
    // Поверх вище менший — над різницею лишається відкрите покриття.
    if (mine - above > 2) out.push(i)
  }
  return out
}

const area = (plan: HousePlan, i: number) =>
  (plan.floors[i]?.slab ?? []).reduce((s, r) => s + r.width * r.depth, 0)

// Готовий варіант: усі відкриті рівні одним типом (те, що вибрано на кроці).
export function generateRoof(plan: HousePlan, kind: RoofKind): RoofPart[] {
  return roofLevels(plan).map((level) => normalizeRoof({ level, kind, ...DEFAULTS }))
}

// Наступне/попереднє значення звісу з урахуванням «нуля» окремим щаблем.
export function stepOverhang(v: number, dir: 1 | -1): number {
  if (dir > 0) return v < OVERHANG.min ? OVERHANG.min : Math.min(OVERHANG.max, v + OVERHANG.step)
  return v <= OVERHANG.min + 1e-9 ? NO_OVERHANG : v - OVERHANG.step
}

export function updateRoofPart(parts: RoofPart[], level: number, patch: Partial<RoofPart>): RoofPart[] {
  return parts.map((p) => (p.level === level ? normalizeRoof({ ...p, ...patch }) : p))
}
