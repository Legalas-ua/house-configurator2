import type { HousePlan, PlanRect } from '../config/types'
import { GRID, MIN_SIDE, snap } from './editPlan'
import { ringContains, unionOutline } from './outline'

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

// Площа кільця (шнурівка) — потрібна лише за модулем.
function ringArea(pts: [number, number][]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]
    const [x1, z1] = pts[(i + 1) % pts.length]
    a += x0 * z1 - x1 * z0
  }
  return Math.abs(a) / 2
}

// Рівні, де дах справді потрібен: там, де ПІСЛЯ вирахування поверху вище й
// власних терас лишилась помітна площа. Тераса — надвір, над нею даху не буває,
// а те, що накрите поверхом вище, — це вже не дах.
export function roofLevels(plan: HousePlan): number[] {
  const out: number[] = []
  for (let i = 0; i < plan.floors.length; i++) {
    const open = levelOutline(plan, i)
      .filter((r) => !r.hole)
      .reduce((s, r) => s + ringArea(r.pts), 0)
    if (open > 2) out.push(i)
  }
  return out
}

// Контур покриття рівня — по ньому клієнт орієнтується, малюючи зони.
// Верхній рівень накриваємо цілком; нижній — лише те, що не під поверхом вище.
export function levelOutline(plan: HousePlan, level: number) {
  const fl = plan.floors[level]
  if (!fl) return []
  const above = level < plan.floors.length - 1 ? plan.floors[level + 1].slab : []
  // Тераса САМОГО цього рівня — відкрита ділянка, даху над нею не треба.
  const terraces = fl.rooms.filter((r) => r.type === 'terrace')
  return unionOutline(fl.slab, [...above, ...terraces])
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

// ---- Перевірка покриття ----

export interface RoofIssue {
  level: number
  kind: 'uncovered' | 'outside'
  rect: PlanRect
}

const EPS = 1e-4
const box = (r: PlanRect) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})

function axis(values: number[]): number[] {
  const out: number[] = []
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1] > EPS) out.push(v)
  }
  return out
}

// Ріжемо площину координатами контуру та зон і дивимось на кожну комірку:
// «під дахом, але поза контуром» і «в контурі, але без даху» — дві помилки.
export function validateRoof(plan: HousePlan, parts: RoofPart[]): RoofIssue[] {
  const issues: RoofIssue[] = []
  for (const level of roofLevels(plan)) {
    const rings = levelOutline(plan, level).filter((r) => !r.hole)
    if (rings.length === 0) continue
    const zones = parts.filter((p) => p.level === level).map(box)
    const pts = rings.flatMap((r) => r.pts)
    const xs = axis([...pts.map((p) => p[0]), ...zones.flatMap((z) => [z.x0, z.x1])])
    const zs = axis([...pts.map((p) => p[1]), ...zones.flatMap((z) => [z.z0, z.z1])])

    const gaps: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null
    const collect = (want: boolean) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
      for (let i = 0; i < xs.length - 1; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2
        for (let j = 0; j < zs.length - 1; j++) {
          const cz = (zs[j] + zs[j + 1]) / 2
          const inOutline = rings.some((r) => ringContains(r.pts, [cx, cz]))
          const inZone = zones.some((z) => cx > z.x0 && cx < z.x1 && cz > z.z0 && cz < z.z1)
          // want=true шукаємо «в контурі без даху», false — «дах поза контуром»
          if (want ? !(inOutline && !inZone) : !(!inOutline && inZone)) continue
          minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i + 1])
          minZ = Math.min(minZ, zs[j]); maxZ = Math.max(maxZ, zs[j + 1])
        }
      }
      if (minX === Infinity || maxX - minX < 0.2 || maxZ - minZ < 0.2) return null
      return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ }
    }
    void gaps
    const un = collect(true)
    if (un) issues.push({ level, kind: 'uncovered', rect: un })
    const out = collect(false)
    if (out) issues.push({ level, kind: 'outside', rect: out })
  }
  return issues
}

// ---- Парапет: які ділянки СПРАВДІ існують ----
// Там, де зверху стоїть поверх, парапету немає — його місце займає зовнішня
// стіна верхнього поверху. Геометрія в HouseShell і перевірка колізій мусять
// різати ці ділянки ОДНАКОВО, інакше вікно «б'ється» з парапетом, якого нема.

export interface ParapetEdge {
  horizontal: boolean
  line: number // координата площини грані (вісь стіни)
  min: number // повна межа грані — по ній видно, де ріг, а де обрив від вирізу
  max: number
  nx: number // зовнішня нормаль
  nz: number
  spans: [number, number][] // ділянки, де парапет є
}

export function parapetEdges(part: RoofPart, above: PlanRect[]): ParapetEdge[] {
  const b = box(part)
  const upper = above.map(box)
  const raw = [
    { horizontal: true, line: b.z0, min: b.x0, max: b.x1, nx: 0, nz: -1 },
    { horizontal: true, line: b.z1, min: b.x0, max: b.x1, nx: 0, nz: 1 },
    { horizontal: false, line: b.x0, min: b.z0, max: b.z1, nx: -1, nz: 0 },
    { horizontal: false, line: b.x1, min: b.z0, max: b.z1, nx: 1, nz: 0 },
  ]
  return raw.map((e) => {
    // Відрізаємо накриті ділянки ребра, а не пропускаємо ребро цілком.
    const cuts = upper
      .filter((u) =>
        e.horizontal ? e.line > u.z0 - 0.05 && e.line < u.z1 + 0.05 : e.line > u.x0 - 0.05 && e.line < u.x1 + 0.05,
      )
      .map((u) =>
        e.horizontal
          ? ([Math.max(u.x0, e.min), Math.min(u.x1, e.max)] as [number, number])
          : ([Math.max(u.z0, e.min), Math.min(u.z1, e.max)] as [number, number]),
      )
      .filter(([p0, p1]) => p1 - p0 > 0.1)
      .sort((p0, p1) => p0[0] - p1[0])
    const spans: [number, number][] = []
    let cur = e.min
    for (const [c0, c1] of cuts) {
      if (c0 > cur + 0.05) spans.push([cur, c0])
      cur = Math.max(cur, c1)
    }
    if (e.max > cur + 0.05) spans.push([cur, e.max])
    return { ...e, spans }
  })
}

// ---- Колізії даху з вікнами ----
// Скат чи парапет може перекрити вікно. Рахуємо на рівні ВИСОТ: беремо низ
// даху над віконним отвором і дивимось, чи він нижчий за верх вікна.

export interface RoofWindowClash {
  windowId: string
  partId: string
}

// Висота НИЗУ даху над точкою (x,z) у межах зони, від рівня покриття.
function roofBottomAt(part: RoofPart, x: number, z: number, above: PlanRect[]): number | null {
  const b = box(part)
  if (x < b.x0 - EPS || x > b.x1 + EPS || z < b.z0 - EPS || z > b.z1 + EPS) return null
  if (part.kind === 'flat') {
    // Парапет — це смуга по периметру, а не суцільна кришка над усією зоною:
    // усередині плоского даху заважати вікну просто нічому. І там, де стінки
    // парапету немає (виріз під поверхом вище), її не повинно бути й тут.
    for (const e of parapetEdges(part, above)) {
      const perp = e.horizontal ? z : x
      const along = e.horizontal ? x : z
      if (Math.abs(perp - e.line) > part.parapetT + EPS) continue
      if (e.spans.some(([a, c]) => along > a - EPS && along < c + EPS)) return part.parapetH
    }
    return 0
  }
  const w = b.x1 - b.x0
  const d = b.z1 - b.z0
  const alongZ = part.rotation % 180 === 0 ? d >= w : d < w
  const span = alongZ ? w : d
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  // Відстань від НИЖЧОГО краю схилу вздовж напрямку падіння.
  const u = alongZ ? x - b.x0 : z - b.z0
  if (part.kind === 'mono') {
    const fromLow = part.rotation >= 180 ? span - u : u
    return fromLow * tan
  }
  // Двосхилий: від найближчого краю до гребеня посередині.
  return Math.min(u, span - u) * tan
}

// Вікна, які перекриває дах. Дах над рівнем L лежить рівно на підлозі поверху
// L+1, тож ріже він саме ТАМТЕШНІ вікна: якщо схил (чи парапет) над місцем
// вікна піднявся вище за його підвіконня — вікно виходить у дах.
export function roofWindowClashes(
  plan: HousePlan,
  parts: RoofPart[],
  windows: { id: string; floor: number; sill: number; fx: number; fz: number }[],
): RoofWindowClash[] {
  const out: RoofWindowClash[] = []
  for (const w of windows) {
    for (const part of parts) {
      if (part.level !== w.floor - 1) continue
      const h = roofBottomAt(part, w.fx, w.fz, plan.floors[part.level + 1]?.slab ?? [])
      if (h == null) continue
      if (h > w.sill + 0.05) out.push({ windowId: w.id, partId: part.id })
    }
  }
  return out
}
