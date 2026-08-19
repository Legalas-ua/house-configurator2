import type { HousePlan, PlanRect } from '../config/types'
import { GRID, MIN_SIDE, snap } from './editPlan'
import { outlineRects, ringContains, unionOutline } from './outline'
import { freeSpot, touches } from './place'
import { WALL_T } from './windows'
import { mergeEdges, outlineEdges, planRise, roofFaces, type SkelEdge } from './roofSkeleton'

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

export type RoofKind = 'flat' | 'gable' | 'mono' | 'hip'

export interface RoofPart extends PlanRect {
  id: string
  level: number // індекс поверху, ПОКРИТТЯ якого це дах
  // Зона може складатись із КІЛЬКОХ прямокутників — так виходить після
  // об'єднання сусідніх зон. Тоді x/z/width/depth — це габарит усього набору,
  // а `rects` — самі частини. Порожнє поле означає одну частину = габарит.
  rects?: PlanRect[]
  kind: RoofKind
  // ГОЛОВНА на стику з сусідньою зоною. Питання виникає лише тоді, коли в двох
  // сусідів однакова висота коника: за різної висоти головним стає вищий сам
  // собою, і галочка ні на що не впливає.
  mainZone?: boolean
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

// Частини зони. Одна вона чи складена — далі код працює однаково.
export const partRects = (p: RoofPart): PlanRect[] =>
  p.rects && p.rects.length > 0 ? p.rects : [{ x: p.x, z: p.z, width: p.width, depth: p.depth }]

// Габарит набору прямокутників.
export function rectsBox(rects: PlanRect[]): PlanRect {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x - r.width / 2)
    x1 = Math.max(x1, r.x + r.width / 2)
    z0 = Math.min(z0, r.z - r.depth / 2)
    z1 = Math.max(z1, r.z + r.depth / 2)
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0 }
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
  // Складену зону РУХАЄМО цілком: частини їдуть за габаритом, не розсипаючись.
  const dx = x0 + width / 2 - part.x
  const dz = z0 + depth / 2 - part.z
  const rects =
    part.rects && part.rects.length > 0
      ? part.rects.map((r) => ({ ...r, x: snap(r.x + dx - r.width / 2) + r.width / 2, z: snap(r.z + dz - r.depth / 2) + r.depth / 2 }))
      : undefined
  return {
    ...part,
    rects,
    x: x0 + width / 2,
    z: z0 + depth / 2,
    width,
    depth,
    parapetH: clampStep(part.parapetH, PARAPET_H),
    parapetT: clampStep(part.parapetT, PARAPET_T),
    pitch: clampStep(part.pitch, PITCH),
    // Скатний має два осмислені напрямки (гребінь уздовж / упоперек),
    // односхилий — чотири (куди дивиться схил). Плоскому поворот байдужий.
    // Вальмовий симетричний: гребінь сам іде вздовж довшої сторони, поворот
    // йому нічого не додає — тому, як і в скатного, лише 0/90.
    rotation:
      ((Math.round(part.rotation / 90) * 90) % (part.kind === 'gable' || part.kind === 'hip' ? 180 : 360) + 360) %
      360,
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
export function roofLevels(plan: HousePlan, overTerrace = false): number[] {
  const out: number[] = []
  for (let i = 0; i < plan.floors.length; i++) {
    const open = levelOutline(plan, i, overTerrace)
      .filter((r) => !r.hole)
      .reduce((s, r) => s + ringArea(r.pts), 0)
    if (open > 2) out.push(i)
  }
  return out
}

// Контур покриття рівня — по ньому клієнт орієнтується, малюючи зони.
// Верхній рівень накриваємо цілком; нижній — лише те, що не під поверхом вище.
// `overTerrace` — режим «дах над терасою»: тераса лишається В КОНТУРІ, тож
// зону даху можна протягнути й над нею. Без нього тераса вирізається — над
// відкритою терасою даху за замовчуванням не буває.
export function levelOutline(plan: HousePlan, level: number, overTerrace = false) {
  const fl = plan.floors[level]
  if (!fl) return []
  const above = level < plan.floors.length - 1 ? plan.floors[level + 1].slab : []
  const terraces = overTerrace ? [] : fl.rooms.filter((r) => r.type === 'terrace')
  return unionOutline(fl.slab, [...above, ...terraces])
}

// Габарит відкритого покриття — стартовий прямокутник зони.
function levelBox(plan: HousePlan, level: number, overTerrace = false): PlanRect | null {
  const pts = levelOutline(plan, level, overTerrace).flatMap((r) => r.pts)
  if (pts.length === 0) return null
  const xs = pts.map((p) => p[0])
  const zs = pts.map((p) => p[1])
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  const z0 = Math.min(...zs)
  const z1 = Math.max(...zs)
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0 }
}

// Готовий варіант: одна зона на кожен рівень — але СКЛАДЕНА, точно по контуру
// відкритого покриття. Раніше сюди йшов габаритний прямокутник, і на
// Г-подібному покритті дах накривав і виріз, і терасу: парапет ішов просто в
// повітрі, без стіни під собою.
export function generateRoof(plan: HousePlan, kind: RoofKind, overTerrace = false): RoofPart[] {
  return roofLevels(plan, overTerrace).flatMap((level) => {
    const rects = outlineRects(levelOutline(plan, level, overTerrace))
    if (rects.length === 0) return []
    // ПЛОСКИЙ — одна складена зона: парапет обійде весь контур одним кільцем.
    if (kind === 'flat') {
      const box = rectsBox(rects)
      const parts = rects.length > 1 ? { rects } : {}
      return [normalizeRoof({ id: `roof-${level}`, level, kind, ...box, ...parts, ...DEFAULTS })]
    }
    // СКАТНИЙ — ОКРЕМА зона на кожне крило. Габаритом накривати не можна: у
    // Г-подібного будинку габарит рівня 0 накриває й другий поверх, і дах іде
    // просто крізь нього. Складеною зоною теж не можна: у неї гребінь спільний
    // на всі частини, і маленьке крило отримує підйом великого — скат
    // виїжджає за свої стіни (це й було видно на скріншоті).
    return rects.map((r, i) =>
      normalizeRoof({ id: `roof-${level}${i ? `-${i}` : ''}`, level, kind, ...r, ...DEFAULTS }),
    )
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
  overTerrace = false,
): { parts: RoofPart[]; id: string } | null {
  const box = levelBox(plan, level, overTerrace)
  if (!box) return null
  const mine = parts.filter((p) => p.level === level).flatMap(partRects)
  const width = Math.max(MIN_SIDE, Math.min(4, box.width))
  const depth = Math.max(MIN_SIDE, Math.min(4, box.depth))
  // Ставимо праворуч від наявних зон рівня, щоб нова не лягла точно на стару.
  const right = mine.length ? Math.max(...mine.map((p) => p.x + p.width / 2)) : box.x - box.width / 2
  const start = { x: right + width / 2, z: box.z, width, depth }
  // Нова зона не має з'являтись уже з помилкою: шукаємо місце, де вона нікого
  // не перетинає й лежить НА ПОКРИТТІ, а не поза ним.
  const rings = levelOutline(plan, level, overTerrace)
  // Зона має лежати на покритті ЦІЛКОМ. Перевіряємо не кутами, а сіткою: кут
  // може потрапити в контур, а середина сторони — вже ні (Г-подібне покриття).
  const onRoof = (r: PlanRect) => {
    for (let x = r.x - r.width / 2 + GRID / 2; x < r.x + r.width / 2; x += GRID) {
      for (let z = r.z - r.depth / 2 + GRID / 2; z < r.z + r.depth / 2; z += GRID) {
        if (rings.filter((g) => ringContains(g.pts, [x, z])).length % 2 === 0) return false
      }
    }
    return true
  }
  // Якщо цілої зони нікуди покласти — пробуємо меншу, аж до 1 × 1 м. Краще
  // маленька зона в вільному куті, ніж велика внахлест і з помилкою; а коли
  // покриття зайняте геть усе, зона не додається зовсім.
  let spot: PlanRect | null = null
  for (const k of [1, 0.75, 0.5, 0.35, 0.25]) {
    const w = Math.max(MIN_SIDE, snap(width * k))
    const d = Math.max(MIN_SIDE, snap(depth * k))
    spot = freeSpot({ ...start, width: w, depth: d }, mine, onRoof, 24, box)
    if (spot) break
  }
  if (!spot) return null
  const id = `roof-${level}-${Date.now().toString(36)}`
  const part = normalizeRoof({ id, level, kind, ...spot, ...DEFAULTS })
  return { parts: [...parts, part], id }
}

// ---- Об'єднання зон ----
// Дві сусідні зони одного рівня можна злити в одну, якщо їхнє об'єднання —
// знову ПРЯМОКУТНИК: зона даху прямокутна за визначенням, і з Г-подібного
// об'єднання коректного скату вже не збудувати. Кнопка «+» з'являється рівно
// там, де таке злиття можливе.
export interface RoofJunction {
  a: string
  b: string
  x: number // де малювати кнопку
  z: number
}

export function roofJunctions(parts: RoofPart[], level: number): RoofJunction[] {
  const mine = parts.filter((p) => p.level === level)
  const out: RoofJunction[] = []
  for (let i = 0; i < mine.length; i++) {
    for (let k = i + 1; k < mine.length; k++) {
      const p = box(mine[i])
      const q = box(mine[k])
      const xOver = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)
      const zOver = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0)
      const touchX = Math.min(Math.abs(p.x1 - q.x0), Math.abs(q.x1 - p.x0)) < 0.01
      const touchZ = Math.min(Math.abs(p.z1 - q.z0), Math.abs(q.z1 - p.z0)) < 0.01
      // Об'єднати можна БУДЬ-ЯКІ дві зони, що стикаються помітною ділянкою:
      // складена зона тримає свої частини окремо (`rects`), тож Г-подібний
      // союз більше не треба зводити до прямокутника.
      if (zOver > 0.2 && touchX) {
        out.push({ a: mine[i].id, b: mine[k].id, x: (Math.max(p.x0, q.x0) + Math.min(p.x1, q.x1)) / 2, z: (Math.max(p.z0, q.z0) + Math.min(p.z1, q.z1)) / 2 })
      } else if (xOver > 0.2 && touchZ) {
        out.push({ a: mine[i].id, b: mine[k].id, x: (Math.max(p.x0, q.x0) + Math.min(p.x1, q.x1)) / 2, z: (Math.max(p.z0, q.z0) + Math.min(p.z1, q.z1)) / 2 })
      }
    }
  }
  return out
}

// Зливаємо b у a: параметри лишаються від a, а ЧАСТИНИ складаються. Габарит
// перераховуємо з частин — він потрібен лише для ручок і підпису.
export function joinRoofParts(parts: RoofPart[], a: string, b: string): RoofPart[] {
  const pa = parts.find((p) => p.id === a)
  const pb = parts.find((p) => p.id === b)
  if (!pa || !pb) return parts
  const rects = [...partRects(pa), ...partRects(pb)]
  // Головна частина зони після об'єднання рахується наново: старий індекс
  // указував би на зовсім інший прямокутник.
  const merged: RoofPart = { ...pa, rects, ...rectsBox(rects) }
  return parts.filter((r) => r.id !== b).map((r) => (r.id === a ? merged : r))
}

// Розібрати складену зону назад на окремі частини.
export function splitRoofPart(parts: RoofPart[], id: string): RoofPart[] {
  const p = parts.find((r) => r.id === id)
  if (!p || !p.rects || p.rects.length < 2) return parts
  const pieces = p.rects.map((r, i) => ({ ...p, rects: undefined, id: `${p.id}~${i}`, ...r }))
  return parts.flatMap((r) => (r.id === id ? pieces : [r]))
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
export function validateRoof(plan: HousePlan, parts: RoofPart[], overTerrace = false): RoofIssue[] {
  const issues: RoofIssue[] = []
  for (const level of roofLevels(plan, overTerrace)) {
    const rings = levelOutline(plan, level, overTerrace).filter((r) => !r.hole)
    if (rings.length === 0) continue
    const zones = parts.filter((p) => p.level === level).flatMap((p) => partRects(p).map(box))
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
  const upper = above.map(box)
  const rects = partRects(part)
  // Контур ЗОНИ, а не габариту: після об'єднання зона буває Г-подібною, і
  // парапет має йти саме по її контуру. Для однієї частини це той самий
  // прямокутник, тож поведінка не змінюється.
  const rings = unionOutline(rects)
  const inside = (x: number, z: number) => {
    let n = 0
    for (const r of rings) if (ringContains(r.pts, [x, z])) n++
    return n % 2 === 1
  }
  const raw: { horizontal: boolean; line: number; min: number; max: number; nx: number; nz: number }[] = []
  for (const { pts } of rings) {
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i]
      const [x1, z1] = pts[(i + 1) % pts.length]
      const horizontal = Math.abs(z1 - z0) < 1e-4
      const line = horizontal ? z0 : x0
      const min = Math.min(horizontal ? x0 : z0, horizontal ? x1 : z1)
      const max = Math.max(horizontal ? x0 : z0, horizontal ? x1 : z1)
      if (max - min < 0.05) continue
      // Зовнішня нормаль — той бік, де зони НЕМАЄ.
      const mid = (min + max) / 2
      const probe = horizontal ? [mid, line + 0.2] : [line + 0.2, mid]
      const sign = inside(probe[0], probe[1]) ? -1 : 1
      raw.push({ horizontal, line, min, max, nx: horizontal ? 0 : sign, nz: horizontal ? sign : 0 })
    }
  }
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
      // Виріз — це стіна поверху ВИЩЕ. Її межа задана по ОСІ, тож парапет,
      // доведений до неї, входив у ту стіну до середини. Відступаємо на пів
      // товщини: парапет спиняється на ЗОВНІШНІЙ площині стіни.
      if (c0 - WALL_T / 2 > cur + 0.05) spans.push([cur, c0 - WALL_T / 2])
      cur = Math.max(cur, c1 + WALL_T / 2)
    }
    if (e.max > cur + 0.05) spans.push([cur, e.max])
    return { ...e, spans }
  })
}

// Ріг парапету. `u` — кінець грані `e`; шукаємо ПЕРПЕНДИКУЛЯРНУ грань, що
// стоїть на цій осі, і кажемо, куди дивиться її зовнішня нормаль уздовж нашої
// грані. Далі з цього рахують, де саме починається/закінчується її смуга.
// Порожньо, якщо поперечного парапету там НЕМАЄ (грань накрита поверхом вище):
// тоді це не ріг, а впирання в стіну.
export function perpNormal(edges: ParapetEdge[], e: ParapetEdge, u: number): number | null {
  const p = edges.find(
    (q) =>
      q.horizontal !== e.horizontal &&
      Math.abs(q.line - u) < 1e-4 &&
      q.spans.some(([s0, s1]) => e.line > s0 - 1e-4 && e.line < s1 + 1e-4),
  )
  if (!p) return null
  return e.horizontal ? p.nx : p.nz
}

// Де має спинитись смуга парапету (чи кожуха) на РОЗІ.
//
// Смуга завтовшки `t` стоїть зовнішньою гранню врівень зі стіною, тож поперек
// вона займає [вісь + n·(WALL_T/2 − t/2) ± half]. На розі рогом «володіє»
// ГОРИЗОНТАЛЬНА грань: вона перекриває весь квадрат перетину (доходить до
// дальнього краю поперечної смуги), а вертикальна відступає до ближнього.
// Так стик виходить рівно встик: ані щілини, ані двох коробок в одному місці
// (саме вони й давали ту сходинку на розі).
// Ріг у числах: `c` — вісь ПОПЕРЕЧНОЇ смуги в координатах нашої грані, `np` —
// куди дивиться її зовнішній бік, `dir` — у який бік від грані лежить ріг.
export interface ParapetCorner {
  c: number
  np: number
  dir: -1 | 1
}
export function parapetCorner(
  edges: ParapetEdge[],
  e: ParapetEdge,
  u: number,
  t: number,
): ParapetCorner | null {
  const np = perpNormal(edges, e, u)
  if (np === null) return null
  return { c: u + np * (WALL_T / 2 - t / 2), np, dir: Math.abs(u - e.min) < 1e-4 ? -1 : 1 }
}

// `wallGap` — на скільки ще відступити, якщо на розі стоїть не поперечний
// парапет, а СТІНА поверху вище: на ній є оздоблення, і деталь, доведена до
// голої грані, входить просто в нього.
export function cornerStop(
  edges: ParapetEdge[],
  e: ParapetEdge,
  u: number,
  t: number,
  half: number,
  wallGap = 0,
): number {
  const k = parapetCorner(edges, e, u, t)
  if (!k) return u - (Math.abs(u - e.min) < 1e-4 ? -1 : 1) * (WALL_T / 2 + wallGap)
  return k.c + k.dir * (e.horizontal ? half : -half)
}

// ---- Габарит скату: звіси по кожній стороні окремо ----

// На скільки скат виходить за грань зони ще ДО звісу — рівно на пів стіни
// (плюс мікрозапас, щоб грані не збігались). Мусить збігатися з HouseShell.
export const EAVE_BASE = WALL_T / 2 + 0.002
// На скільки схили підняті над верхом стіни. Теж спільне з HouseShell: без
// цього перевірка колізій рахувала б дах на 90 мм нижче, ніж він насправді.
export const ROOF_LIFT = 0.09

export type SideKey = 'xmin' | 'xmax' | 'zmin' | 'zmax'

// Прямокутник сусідньої зони, що пам'ятає, ЧИЙ він: за ним видно висоту
// коника, а отже — хто на стику головний.
export type ZoneRect = PlanRect & { part?: RoofPart }

// Прямокутники всіх ІНШИХ зон рівня — саме в такому вигляді їх чекає
// `slopeBox`: складена зона віддає свої частини, і кожна знає свою зону.
export function zoneRects(parts: RoofPart[], part: RoofPart): ZoneRect[] {
  return parts
    .filter((o) => o.level === part.level && o.id !== part.id)
    .flatMap((o) => partRects(o).map((r) => ({ ...r, part: o })))
}

// Сторони, ПРИТИСНУТІ до стіни поверху вище. Ознака та сама, що й для
// парапету, — грань накрита плитою поверху вище.
export function pinnedSides(part: RoofPart, above: PlanRect[]): Record<SideKey, boolean> {
  const out: Record<SideKey, boolean> = { xmin: false, xmax: false, zmin: false, zmax: false }
  for (const e of parapetEdges(part, above)) {
    const key: SideKey = e.horizontal ? (e.nz < 0 ? 'zmin' : 'zmax') : e.nx < 0 ? 'xmin' : 'xmax'
    const full = e.max - e.min
    const open = e.spans.reduce((s, [a, b]) => s + (b - a), 0)
    // Досить, щоб грань упиралась у стіну ХОЧ ЧАСТИНОЮ: пускати звіс лише на
    // вільний шматок прямокутна геометрія все одно не вміє.
    if (open < full - 0.05) out[key] = true
  }
  return out
}

// На скільки скат виходить ЗА грань зони по кожній стороні. Знак важливий:
//
//   вільна сторона  -> назовні: пів стіни (до зовнішньої грані) + звіс;
//   притиснута      -> УСЕРЕДИНУ: дах має спинитись рівно на ЗОВНІШНІЙ грані
//                      стіни поверху вище. Раніше тут теж стояв «+пів стіни»,
//                      і скат прошивав ту стіну наскрізь — до її середини й
//                      далі в кімнату. Мінус 2 мм лишаємо як напуск, щоб на
//                      стику не світилась волосяна щілина.
// Сторони, до яких ВПРИТУЛ стоїть сусідня зона даху того ж рівня. Звісу там
// бути не може: два скати мусять зійтися рівно на спільній лінії. Інакше вони
// налазять один на одного на два звіси (0,7 м) — саме це й читалось як брудний
// стик замість єндови.
//
// Сусід мусить закривати грань МАЙЖЕ ЦІЛКОМ. Раніше досить було торкнутись
// півметром — і вся грань лишалась без звісу, зокрема та її частина, де сусіда
// й близько немає: дах спинявся на осі стіни й не доходив до її зовнішньої
// площини. Прямокутна геометрія не вміє «звіс на половині грані», тож із двох
// зол вибираємо менше: торкання частиною — це вже не спільна лінія, а
// звичайний вільний край зі звісом.
export function zoneSides(part: RoofPart, siblings: PlanRect[]): Record<SideKey, ZoneRect | null> {
  const out: Record<SideKey, ZoneRect | null> = { xmin: null, xmax: null, zmin: null, zmax: null }
  const b = box(part)
  const full = { x: b.x1 - b.x0, z: b.z1 - b.z0 }
  for (const s of siblings) {
    const c = box(s)
    const xOver = Math.min(b.x1, c.x1) - Math.max(b.x0, c.x0)
    const zOver = Math.min(b.z1, c.z1) - Math.max(b.z0, c.z0)
    if (zOver > full.z * 0.85) {
      if (Math.abs(c.x1 - b.x0) < 0.01) out.xmin = s
      if (Math.abs(c.x0 - b.x1) < 0.01) out.xmax = s
    }
    if (xOver > full.x * 0.85) {
      if (Math.abs(c.z1 - b.z0) < 0.01) out.zmin = s
      if (Math.abs(c.z0 - b.z1) < 0.01) out.zmax = s
    }
  }
  return out
}

// Куди дивиться ГРЕБІНЬ зони: вздовж Z чи вздовж X. Схил падає впоперек.
export function ridgeAlongZ(p: RoofPart): boolean {
  return p.rotation % 180 === 0 ? p.depth >= p.width : p.depth < p.width
}

// Висота коника зони над карнизом — рахується з самої зони, без плану й
// сусідів. Саме за нею вирішується, хто на стику головний.
export function ridgeHeight(p: RoofPart): number {
  if (p.kind === 'flat') return p.parapetH
  const tan = Math.tan((p.pitch * Math.PI) / 180)
  const alongZ = p.rotation % 180 === 0 ? p.depth >= p.width : p.depth < p.width
  const span = alongZ ? p.width : p.depth
  return (p.kind === 'mono' ? span : span / 2) * tan
}

// Хто головний на стику. Вищий коник перемагає; за рівних вирішує галочка, а
// коли її ніде немає — стабільний порядок за id, щоб дах не миготів.
export function mainOfPair(a: RoofPart, b: RoofPart): RoofPart {
  const ha = ridgeHeight(a)
  const hb = ridgeHeight(b)
  if (Math.abs(ha - hb) > 0.01) return ha > hb ? a : b
  if (!!a.mainZone !== !!b.mainZone) return a.mainZone ? a : b
  return a.id < b.id ? a : b
}

export function sideExtend(
  part: RoofPart,
  above: PlanRect[],
  siblings: PlanRect[] = [],
): Record<SideKey, number> {
  const pin = pinnedSides(part, above)
  const nb = zoneSides(part, siblings)
  // НИЖЧА зона врізається у скат вищої, тож її схил має зайти в сусіда рівно
  // настільки, щоб дійти до лінії їхнього перетину. Вища лишається як є.
  const reach = (s: ZoneRect | null, alongZ: boolean) => {
    const o = s?.part
    // Заходить лише той, кого ми вміємо підрізати по сусідському скату.
    if (part.kind !== 'gable' && part.kind !== 'hip') return 0
    if (!o || mainOfPair(part, o) === part) return 0
    const tan = o.kind === 'flat' ? 0 : Math.tan((o.pitch * Math.PI) / 180)
    if (tan < 1e-6) return 0
    // Заходити є куди лише тоді, коли схил сусіда РОСТЕ від нашого стику,
    // тобто його гребінь іде вздовж стику. Якщо гребені паралельні, обидва
    // схили однакові — заходити нікуди, вийшло б накладання двох дахів.
    if (ridgeAlongZ(o) !== alongZ) return 0
    return Math.min(ridgeHeight(part) / tan, o.kind === 'mono' ? Infinity : ridgeHeight(o) / tan)
  }
  // Стик по грані x — це лінія вздовж Z, по грані z — вздовж X.
  const value = (p: boolean, n: ZoneRect | null, k: SideKey) =>
    p ? -(WALL_T / 2 - 0.002) : n ? reach(n, k === 'xmin' || k === 'xmax') : EAVE_BASE + part.overhang
  return {
    xmin: value(pin.xmin, nb.xmin, 'xmin'),
    xmax: value(pin.xmax, nb.xmax, 'xmax'),
    zmin: value(pin.zmin, nb.zmin, 'zmin'),
    zmax: value(pin.zmax, nb.zmax, 'zmax'),
  }
}

// Габарит СКАТУ у світі — рівно те, що будує HouseShell. `rect` дозволяє взяти
// окрему ЧАСТИНУ складеної зони; без нього — габарит усієї зони. `siblings` —
// сусідні зони того ж рівня: до них скат доходить упритул, без звісу.
export function slopeBox(
  part: RoofPart,
  above: PlanRect[],
  rect?: PlanRect,
  siblings: PlanRect[] = [],
) {
  const b = box(rect ?? part)
  const o = sideExtend(part, above, siblings)
  return {
    x0: b.x0 - o.xmin,
    x1: b.x1 + o.xmax,
    z0: b.z0 - o.zmin,
    z1: b.z1 + o.zmax,
  }
}

// Підйом гребеня, СПІЛЬНИЙ на всю зону. Частини складеної зони мають
// сходитись на одній висоті — інакше «другорядна» частина вріжеться в головну
// під випадковим кутом. Керує НАЙБІЛЬША частина: вона й є головною.
export function zoneRise(part: RoofPart, above: PlanRect[], siblings: PlanRect[] = []): number {
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  // ОДНОСХИЛИЙ і ДВОСХИЛИЙ — одна площина («намет») на всю зону, тож і проліт
  // беремо по ЗОНІ, а не по найбільшій частині. Інакше нахил площини не
  // збігається з кутом даху, і покриття (воно рахує кут) відривається від
  // геометрії (вона рахує підйом).
  if (part.kind === 'mono' || part.kind === 'gable') {
    const g = slopeBox(part, above, undefined, siblings)
    const w = g.x1 - g.x0
    const d = g.z1 - g.z0
    const ridgeAlongZ = part.rotation % 180 === 0 ? d >= w : d < w
    const span = ridgeAlongZ ? w : d
    return (part.kind === 'mono' ? span : span / 2) * tan
  }
  let best = 0
  let area = -1
  for (const r of partRects(part)) {
    const a = r.width * r.depth
    if (a <= area) continue
    area = a
    const g = slopeBox(part, above, r, siblings)
    const w = g.x1 - g.x0
    const d = g.z1 - g.z0
    if (part.kind === 'hip') {
      best = (Math.min(w, d) / 2) * tan
    } else {
      const ridgeAlongZ = part.rotation % 180 === 0 ? d >= w : d < w
      best = ((ridgeAlongZ ? w : d) / 2) * tan
    }
  }
  return best
}

// Габарит для ПЕРЕВІРКИ колізій. Відрізняється від скату лише притиснутими
// сторонами: там скат навмисно спиняється НЕ доходячи до осі стіни, і вікно,
// що стоїть рівно на цій осі, випадало з перевірки — дах його перекривав, а
// панель мовчала. Тут край повертаємо до зовнішньої грані стіни: площина
// схилу лінійна, тож продовжити її на ці 5 см цілком коректно.
function clashBox(part: RoofPart, above: PlanRect[]) {
  const b = box(part)
  const pin = pinnedSides(part, above)
  const o = sideExtend(part, above)
  const e = (p: boolean, v: number) => (p ? EAVE_BASE : v)
  return {
    x0: b.x0 - e(pin.xmin, o.xmin),
    x1: b.x1 + e(pin.xmax, o.xmax),
    z0: b.z0 - e(pin.zmin, o.zmin),
    z1: b.z1 + e(pin.zmax, o.zmax),
  }
}

// ---- Колізії даху з вікнами ----
// Скат чи парапет може перекрити вікно. Рахуємо на рівні ВИСОТ: беремо низ
// даху над віконним отвором і дивимось, чи він нижчий за верх вікна.

export interface RoofWindowClash {
  windowId: string
  partId: string
}

// Висота НИЗУ даху над точкою (x,z), від рівня покриття.
//
// Рахуємо в координатах РЕАЛЬНОЇ геометрії, а не зони: скат починається за
// гранню зони (пів стіни + звіс) і піднятий на ROOF_LIFT. Поки тут стояли самі
// межі зони, дах виходив на пів метра нижчим за справжній — і панель писала
// «колізій немає», коли низ вікна ще сидів у схилі.
function roofBottomAt(part: RoofPart, x: number, z: number, above: PlanRect[]): number | null {
  // Складена зона — беремо найвищий дах серед її частин.
  const rects = partRects(part)
  if (rects.length > 1) {
    let best: number | null = null
    for (const r of rects) {
      const v = roofBottomAt({ ...part, rects: undefined, ...r }, x, z, above)
      if (v != null && (best == null || v > best)) best = v
    }
    return best
  }
  const b = box(part)
  if (part.kind !== 'flat') {
    // Належність перевіряємо ШИРШИМ габаритом, а висоту рахуємо площиною
    // самого скату: інакше вікно рівно на осі притиснутої стіни випадає.
    const c = clashBox(part, above)
    if (x < c.x0 - EPS || x > c.x1 + EPS || z < c.z0 - EPS || z > c.z1 + EPS) return null
    const g = slopeBox(part, above)
    const gw = g.x1 - g.x0
    const gd = g.z1 - g.z0
    // Той самий вибір напрямку гребеня, що й у геометрії HouseShell.
    const alongZ = part.rotation % 180 === 0 ? gd >= gw : gd < gw
    const span = alongZ ? gw : gd
    const u = alongZ ? x - g.x0 : z - g.z0
    const tan = Math.tan((part.pitch * Math.PI) / 180)
    if (part.kind === 'mono') {
      const fromLow = part.rotation >= 180 ? span - u : u
      return ROOF_LIFT + fromLow * tan
    }
    // Вальмовий: схили з УСІХ чотирьох боків, тож рахуємо найближчу грань.
    if (part.kind === 'hip') {
      const near = Math.min(x - g.x0, g.x1 - x, z - g.z0, g.z1 - z)
      return ROOF_LIFT + Math.max(0, near) * tan
    }
    // Двосхилий: від найближчого краю до гребеня посередині.
    return ROOF_LIFT + Math.min(u, span - u) * tan
  }
  if (x < b.x0 - EPS || x > b.x1 + EPS || z < b.z0 - EPS || z > b.z1 + EPS) return null
  {
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
}

// Вікно — це відрізок [a..b] уздовж стіни, а не точка. Дах над ним нахилений,
// тож беремо НАЙВИЩУ точку його низу по всій ширині отвору: раніше рахували
// лише центр, і на похилому даху виходило «колізії немає», хоч один край
// вікна ще стирчав у схилі. Двосхилий дах угнутий (гребінь посередині) —
// тому не лише кінці, а й кілька точок між ними.
export interface ClashWindow {
  id: string
  floor: number
  sill: number
  horizontal: boolean
  line: number
  a: number
  b: number
}

const SAMPLES = [0, 0.25, 0.5, 0.75, 1]

// Вікна, які перекриває дах. Дах над рівнем L лежить рівно на підлозі поверху
// L+1, тож ріже він саме ТАМТЕШНІ вікна: якщо схил (чи парапет) над місцем
// вікна піднявся вище за його підвіконня — вікно виходить у дах.
export function roofWindowClashes(plan: HousePlan, parts: RoofPart[], windows: ClashWindow[]): RoofWindowClash[] {
  const out: RoofWindowClash[] = []
  for (const w of windows) {
    for (const part of parts) {
      if (part.level !== w.floor - 1) continue
      const above = plan.floors[part.level + 1]?.slab ?? []
      let h = -Infinity
      for (const s of SAMPLES) {
        const u = w.a + (w.b - w.a) * s
        const v = roofBottomAt(part, w.horizontal ? u : w.line, w.horizontal ? w.line : u, above)
        if (v != null && v > h) h = v
      }
      // Колізія зникає лише коли вікно ВИЙШЛО з даху цілком, тож допуск —
      // міліметр на похибку float, а не колишні 50 мм «майже вийшло».
      if (h > w.sill + 1e-3) out.push({ windowId: w.id, partId: part.id })
    }
  }
  return out
}

// ---- Складена зона: дах по прямому скелету ----

// Найбільша частина СКЛАДЕНОЇ зони: спірні клітинки контуру дістаються їй.
function mainRect(part: RoofPart): number {
  const rects = partRects(part)
  let best = 0
  let area = -1
  rects.forEach((r, i) => {
    const a = r.width * r.depth
    if (a > area) {
      area = a
      best = i
    }
  })
  return best
}

// Контур зони, розмітка «карниз чи фронтон» і схили. Карниз — грань,
// ПАРАЛЕЛЬНА гребеню своєї частини: у вальмового такі всі, у двосхилого —
// лише дві з чотирьох, і саме через це крило, повернуте поперек головної
// частини, отримує власний нижчий гребінь і врізається в неї єндовою.
// Скелет рахують ТРИ місця (геометрія, покриття, оздоблення фронтонів), і всі
// три — на кожен кадр перетягування зони. Тримаємо останні відповіді: ключ
// повністю описує вхід, тож зайвого не віддамо.
const skelCache = new Map<string, ReturnType<typeof buildSkeleton>>()

export function roofSkeleton(
  part: RoofPart,
  above: PlanRect[],
  siblings: PlanRect[] = [],
  // Дах ВИЩОГО сусіда: усе, що під ним, з нашого схилу зрізається.
  covered?: (x: number, z: number, t: number) => boolean,
  coverKey = '',
) {
  const rect = (r: PlanRect) => `${r.x},${r.z},${r.width},${r.depth}`
  const key = [
    part.kind,
    part.rotation,
    part.overhang,
    part.pitch,
    partRects(part).map(rect).join(';'),
    above.map(rect).join(';'),
    siblings.map(rect).join(';'),
    coverKey,
  ].join('|')
  const hit = skelCache.get(key)
  if (hit) return hit
  const made = buildSkeleton(part, above, siblings, covered)
  // Кеш маленький навмисно: під час перетягування ключ інший щокадру, і
  // тримати всю історію немає сенсу.
  if (skelCache.size > 16) skelCache.clear()
  skelCache.set(key, made)
  return made
}

// Нижня (нульова) грань односхилого даху: до неї падає єдина площина.
// `perp` — чи ця грань іде впоперек X (тобто лінія сталого x).
function monoLow(part: RoofPart, boxes: { x0: number; x1: number; z0: number; z1: number }[]) {
  if (part.kind !== 'mono' || boxes.length === 0) return null
  const g = {
    x0: Math.min(...boxes.map((b) => b.x0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    z0: Math.min(...boxes.map((b) => b.z0)),
    z1: Math.max(...boxes.map((b) => b.z1)),
  }
  const alongZ = ridgeAlongZ(part)
  const line = part.rotation < 180 ? (alongZ ? g.x0 : g.z1) : alongZ ? g.x1 : g.z0
  return { line, perp: alongZ }
}

function buildSkeleton(
  part: RoofPart,
  above: PlanRect[],
  siblings: PlanRect[] = [],
  covered?: (x: number, z: number, t: number) => boolean,
) {
  const boxes = partRects(part).map((r) => {
    const b = slopeBox(part, above, r, siblings)
    return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }
  })
  const main = mainRect(part)
  // Гребінь ГОЛОВНОЇ частини задає дах: решта лягає під нього. Власний,
  // перпендикулярний гребінь дістається лише тій частині, що ЯВНО витягнута
  // поперек — саме вона й врізається в головну єндовою. Квадратне крило
  // власного гребеня не отримує: інакше дах ламався б від міліметра різниці
  // між сторонами.
  //
  // Напрям беремо з ВЛАСНОГО прямокутника зони, а не з габариту схилу: у
  // габарит входить іще й захід у сусіда, і від нього зона могла стати
  // «глибшою за широку». Через це, коли клієнт лише міняв кут нахилу, дах
  // раптом сам перекидався на 90°.
  const own = partRects(part)
  const along = (r: PlanRect) => (part.rotation % 180 === 0 ? r.depth >= r.width : r.depth < r.width)
  const mainAlongZ = along(own[main])
  const CROSS = 1.2
  // ОДНОСХИЛИЙ — одна площина: карниз у нього рівно один (нижня грань), і
  // висота в будь-якій точці = відстань УПОПЕРЕК до неї. Решта граней —
  // фронтони: якби вони теж «піднімали» дах, площина зламалась би.
  const lowEdge = monoLow(part, boxes)
  const edges: SkelEdge[] = outlineEdges(boxes, main).map((e) => {
    if (part.kind === 'mono') {
      const atLow = lowEdge !== null && lowEdge.perp === !e.horizontal && Math.abs(e.line - lowEdge.line) < 1e-3
      return { ...e, rising: atLow, infinite: atLow }
    }
    if (part.kind === 'hip') return { ...e, rising: true }
    const r = own[e.own]
    const ratio = r.depth / Math.max(r.width, 1e-6)
    const ridgeAlongZ =
      e.own === main ? mainAlongZ : mainAlongZ ? ratio > 1 / CROSS : ratio > CROSS
    return { ...e, rising: ridgeAlongZ ? !e.horizontal : e.horizontal }
  })
  // Розмітка могла лишити одну пряму грань нарізаною по частинах зони —
  // зшиваємо назад, інакше сусідні схили накриють ту саму ділянку двічі.
  const whole = mergeEdges(edges)
  return { boxes, edges: whole, faces: roofFaces(boxes, whole, 0.05, covered) }
}

// ---- Стик двох зон ----
//
// Правило, узгоджене з Lev: вирішує ВИСОТА коника. Нижчий дах врізається у скат
// вищого — його схил заходить у сусіда рівно до лінії їхнього перетину (див.
// `sideExtend`), а вищий лишається як є. Питання «хто головний» виникає лише за
// РІВНОЇ висоти: тоді його вирішує галочка в панелі, і одразу на одній зоні з
// пари — сусідові вона вже недоступна.

// Зони того ж рівня, що торкаються цієї СПІЛЬНОЮ ГРАННЮ (а не кутом).
export function zoneNeighbours(parts: RoofPart[], part: RoofPart): RoofPart[] {
  const mine = partRects(part)
  return parts.filter(
    (o) =>
      o.level === part.level &&
      o.id !== part.id &&
      partRects(o).some((r) => mine.some((m) => touches(m, r))),
  )
}

// Сусіди РІВНОЇ висоти: лише з ними галочка «головна» щось вирішує.
export function tiedNeighbours(parts: RoofPart[], part: RoofPart): RoofPart[] {
  const h = ridgeHeight(part)
  return zoneNeighbours(parts, part).filter((o) => Math.abs(ridgeHeight(o) - h) <= 0.01)
}

// Висота даху зони в точці. Поза її схилами — нуль: там даху просто немає.
// Це «чистий» дах сусіда, без підрізань: вищий ніколи не ріжеться.
// Поза своїм габаритом даху зони НЕМАЄ — і це не «висота нуль», а «нічого».
// Нуль там означав би, що на карнизі сусіда дах ніби є врівень із землею, і
// точка на самому стику лишалась непідрізаною.
export const NO_ROOF = -Infinity

function zoneHeightField(plan: HousePlan, parts: RoofPart[], part: RoofPart): (x: number, z: number) => number {
  const above = plan.floors[part.level + 1]?.slab ?? []
  const sibs = zoneRects(parts, part)
  const boxes = partRects(part).map((r) => slopeBox(part, above, r, sibs))
  const inside = (x: number, z: number) =>
    boxes.some((q) => x > q.x0 - 1e-4 && x < q.x1 + 1e-4 && z > q.z0 - 1e-4 && z < q.z1 + 1e-4)
  if (part.kind === 'flat') return (x, z) => (inside(x, z) ? 0 : NO_ROOF)
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  if (part.kind === 'mono') {
    // Нижню грань беремо ТИМ САМИМ хелпером, що й скелет: інакше зона різала б
    // сусіда по одній площині, а сама будувалась по іншій.
    const lo = monoLow(part, boxes)
    if (!lo) return () => NO_ROOF
    return (x, z) => (inside(x, z) ? Math.abs((lo.perp ? x : z) - lo.line) * tan : NO_ROOF)
  }
  const sk = roofSkeleton(part, above, sibs)
  return (x, z) => (inside(x, z) ? planRise(sk.edges, x, z) * tan : NO_ROOF)
}

// Габарити двох зон РІЗАЛИСЬ би одна об одну: перетин має площу, а не спільну
// грань. Тільки такі пари й треба підрізати; ті, що просто стоять поруч,
// лишаються на швидкому шляху (проста призма).
function slopesOverlap(plan: HousePlan, parts: RoofPart[], a: RoofPart, b: RoofPart): boolean {
  const boxes = (p: RoofPart) => {
    const above = plan.floors[p.level + 1]?.slab ?? []
    const sibs = zoneRects(parts, p)
    return partRects(p).map((r) => slopeBox(p, above, r, sibs))
  }
  const A = boxes(a)
  const B = boxes(b)
  return A.some((p) =>
    B.some((q) => Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 0.02 && Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0) > 0.02),
  )
}

// Чи цю зону ріже сусідній дах — тоді її треба будувати скелетом, а не
// простою призмою: підрізати призму нічим.
//
// Підрізка ВЗАЄМНА. Раніше різали лише «нижчого» — того, у кого нижчий коник, —
// і два крила з ПАРАЛЕЛЬНИМИ гребенями просто проходили одне крізь одне: у
// смузі між лінією перетину площин і карнизом сусіда кожне з них справді вище,
// тож жодне себе підрізаним не вважало. На плані Г-подібного будинку так
// накривалось двічі до 12% площі. Тепер у кожній точці лишається ВЕРХНЯ
// площина, а нижня зрізається — незалежно від того, хто головний на стику.
export function cutByNeighbour(plan: HousePlan, parts: RoofPart[], part: RoofPart): boolean {
  if (part.kind === 'flat') return false
  return roofRivals(plan, parts, part).length > 0
}

// Зони, чиї схили СПРАВДІ накладаються на наші, — тільки їх і треба підрізати.
//
// Раніше тут стояли `zoneNeighbours`, а вони вимагають СПІЛЬНОЇ ГРАНІ
// (`touches`). Дві зони, покладені ХРЕСТОМ — а саме так їх і малює клієнт, —
// спільної грані не мають: вони накладаються площею. Тому вони не вважались
// сусідами взагалі, підрізка до них не доходила, і два дахи просто проходили
// один крізь одного (52% площі під двома дахами на перевірці, і рівно це видно
// на скріншоті Lev). Тепер вирішує сам факт накладання габаритів схилів.
export function roofRivals(plan: HousePlan, parts: RoofPart[], part: RoofPart): RoofPart[] {
  return parts.filter(
    (o) =>
      o.id !== part.id &&
      o.level === part.level &&
      o.kind !== 'flat' &&
      slopesOverlap(plan, parts, part, o),
  )
}

// Скелет зони З УРАХУВАННЯМ сусідів: усе, що опинилось під дахом вищої зони,
// зрізається — саме там і проходить єндова.
export function zoneSkeleton(
  plan: HousePlan,
  parts: RoofPart[],
  part: RoofPart,
): ReturnType<typeof roofSkeleton> & { hidden: (x: number, z: number) => boolean } {
  const above = plan.floors[part.level + 1]?.slab ?? []
  const sibs = zoneRects(parts, part)
  const rivals = roofRivals(plan, parts, part)
  const none = () => false
  if (rivals.length === 0 || part.kind === 'flat')
    return { ...roofSkeleton(part, above, sibs), hidden: none }
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  // Площини сусіда — це і є ножі. Беремо його ЧИСТИЙ дах, без його власних
  // підрізань: різати треба по зовнішній площині, а не по вже обрізаному краю,
  // інакше на стику лишається недоріз.
  const fields = rivals.map((o) => ({ at: zoneHeightField(plan, parts, o), main: mainOfPair(part, o) === o }))
  const covered = (x: number, z: number, t: number) => {
    const h = t * tan
    return fields.some(({ at, main }) => {
      const hn = at(x, z)
      if (hn === NO_ROOF) return false
      // Сусід вище — наша площина під його дахом, її немає.
      if (hn > h + 1e-4) return true
      // Рівно на лінії перетину двох площин виграє головний на стику: інакше
      // обидві зони зрізали б себе (щілина) або жодна (шов у два шари).
      return main && hn > h - 1e-4
    })
  }
  const key = rivals.map((o) => `${o.id}:${o.x},${o.z},${o.width},${o.depth},${o.pitch},${o.rotation},${o.kind}`).join('|')
  const sk = roofSkeleton(part, above, sibs, covered, key)
  // Чи наш дах у цій точці вже НАКРИТИЙ сусідським. Цим одним запитанням
  // підрізається все інше: стіни тіла даху, його дно й лінія, на якій треба
  // покласти єндову.
  const hidden = (x: number, z: number) => covered(x, z, planRise(sk.edges, x, z))
  return { ...sk, hidden }
}
