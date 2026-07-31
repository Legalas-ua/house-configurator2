import type { HousePlan, PlanRect } from '../config/types'
import { GRID, MIN_SIDE, snap } from './editPlan'
import { unionOutline } from './outline'

// ============================================================
// Дах як ДАНІ — за тим самим принципом, що план і вікна.
//
// Дах належить ПОКРИТТЮ поверху, а не його підлозі: рівень N — це те, що
// накриває поверх N. Тому доступні лише ті рівні, де покриття справді
// відкрите: над верхнім поверхом завжди, над нижнім — лише там, де його не
// накриває поверх вище.
//
// Кожна ЗОНА даху — прямокутник зі своїм типом. Так на різних частинах
// будинку можна зробити різний дах, а малюються вони так само, як зони
// планування, тільки на площині покриття.
// ============================================================

export type RoofKind = 'flat' | 'gable' | 'mono'

export interface RoofPart extends PlanRect {
  id: string
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

export const DEFAULTS: Omit<RoofPart, 'id' | 'level' | 'kind' | 'x' | 'z' | 'width' | 'depth'> = {
  parapetH: 0.45,
  parapetT: 0.2,
  pitch: 35,
  rotation: 0,
  overhang: 0.3,
}

const clampStep = (v: number, r: { min: number; max: number; step: number }) =>
  Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step))

// Приводимо параметри в дозволені межі, а прямокутник — на ту саму сітку,
// що й зони планування.
export function normalizeRoof(part: RoofPart): RoofPart {
  const width = Math.max(MIN_SIDE, snap(part.width))
  const depth = Math.max(MIN_SIDE, snap(part.depth))
  const x0 = snap(part.x - part.width / 2)
  const z0 = snap(part.z - part.depth / 2)
  return {
    ...part,
    x: x0 + width / 2,
    z: z0 + depth / 2,
    width,
    depth,
    parapetH: clampStep(part.parapetH, PARAPET_H),
    parapetT: clampStep(part.parapetT, PARAPET_T),
    pitch: clampStep(part.pitch, PITCH),
    // Скатний має два осмислені напрямки (гребінь уздовж / упоперек),
    // односхилий — чотири (куди дивиться схил). Плоскому поворот байдужий.
    rotation: ((Math.round(part.rotation / 90) * 90) % (part.kind === 'gable' ? 180 : 360) + 360) % 360,
    overhang: part.overhang < OVERHANG.min / 2 ? NO_OVERHANG : clampStep(part.overhang, OVERHANG),
  }
}

const area = (plan: HousePlan, i: number) =>
  (plan.floors[i]?.slab ?? []).reduce((s, r) => s + r.width * r.depth, 0)

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
    // Поверх вище менший — над різницею лишається відкрите покриття.
    if (area(plan, i) - area(plan, i + 1) > 2) out.push(i)
  }
  return out
}

// Контур покриття рівня — по ньому клієнт орієнтується, малюючи зони.
// Верхній рівень накриваємо цілком; нижній — лише те, що не під поверхом вище.
export function levelOutline(plan: HousePlan, level: number) {
  const fl = plan.floors[level]
  if (!fl) return []
  const above = level < plan.floors.length - 1 ? plan.floors[level + 1].slab : []
  return unionOutline(fl.slab, above)
}

// Габарит відкритого покриття — стартовий прямокутник зони.
function levelBox(plan: HousePlan, level: number): PlanRect | null {
  const pts = levelOutline(plan, level).flatMap((r) => r.pts)
  if (pts.length === 0) return null
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0 }
}

// Готовий варіант: одна зона на весь відкритий габарит кожного рівня.
export function generateRoof(plan: HousePlan, kind: RoofKind): RoofPart[] {
  return roofLevels(plan).flatMap((level) => {
    const box = levelBox(plan, level)
    if (!box) return []
    return [normalizeRoof({ id: `roof-${level}`, level, kind, ...box, ...DEFAULTS })]
  })
}

// Наступне/попереднє значення звісу з урахуванням «нуля» окремим щаблем.
export function stepOverhang(v: number, dir: 1 | -1): number {
  if (dir > 0) return v < OVERHANG.min ? OVERHANG.min : Math.min(OVERHANG.max, v + OVERHANG.step)
  return v <= OVERHANG.min + 1e-9 ? NO_OVERHANG : v - OVERHANG.step
}

export function updateRoofPart(parts: RoofPart[], id: string, patch: Partial<RoofPart>): RoofPart[] {
  return parts.map((p) => (p.id === id ? normalizeRoof({ ...p, ...patch }) : p))
}

export function removeRoofPart(parts: RoofPart[], id: string): RoofPart[] {
  return parts.filter((p) => p.id !== id)
}

// Нова зона на вказаному рівні: у вільному місці габариту покриття.
export function addRoofPart(
  plan: HousePlan,
  parts: RoofPart[],
  level: number,
  kind: RoofKind,
): { parts: RoofPart[]; id: string } | null {
  const box = levelBox(plan, level)
  if (!box) return null
  const mine = parts.filter((p) => p.level === level)
  const width = Math.max(MIN_SIDE, Math.min(4, box.width))
  const depth = Math.max(MIN_SIDE, Math.min(4, box.depth))
  // Ставимо праворуч від наявних зон рівня, щоб нова не лягла точно на стару.
  const right = mine.length ? Math.max(...mine.map((p) => p.x + p.width / 2)) : box.x - box.width / 2
  const id = `roof-${level}-${Date.now().toString(36)}`
  const part = normalizeRoof({
    id,
    level,
    kind,
    x: right + width / 2,
    z: box.z,
    width,
    depth,
    ...DEFAULTS,
  })
  return { parts: [...parts, part], id }
}

export { GRID as ROOF_GRID }
