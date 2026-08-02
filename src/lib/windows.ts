import type { FloorPlan, HouseConfig, HousePlan, RoomType, RoomZone, WindowType } from '../config/types'
import { unionOutline, type Ring } from './outline'

// ============================================================
// Вікна як ДАНІ. Раніше отвори обчислювались просто в HouseShell і ніде не
// зберігались — тож користувач не мав де їх правити. Тепер:
//   generateWindows() — готовий варіант (та сама логіка, що й була)
//   WindowSpec[]      — те, що можна покласти в стор і редагувати
//   resolveWindow()   — spec + план -> конкретна геометрія отвору
//
// Вікно прив'язане до КІМНАТИ та СТОРОНИ, а не до абсолютних координат: посунув
// кімнату — вікно поїхало з нею.
// ============================================================

export type Side = 'xmin' | 'xmax' | 'zmin' | 'zmax'

export interface WindowSpec {
  id: string
  floor: number // індекс поверху
  roomId: string
  side: Side
  u: number // зсув ЛІВОГО краю вікна від початку стіни, м
  width: number
  sill: number // низ отвору від підлоги
  top: number // верх отвору
  mullions: number // -1 = автоматично за шириною
  doors: DoorSpec[] // порожньо = звичайне вікно
}

// Двері всередині вікна: займають одну секцію між імпостами.
export interface DoorSpec {
  width: number
  slot: number // індекс секції, 0 = ліва
}

export const DOOR_LEAF = 0.95 // типова ширина дверної стулки
export const MIN_DOOR_W = 0.8 // вужчих дверей не буває

// Скільки дверей узагалі влізе у вікно такої ширини.
export const maxDoors = (width: number) => Math.max(0, Math.floor(width / MIN_DOOR_W))

// Секції, ще не зайняті дверима.
export function freeSlots(spec: WindowSpec, exceptIndex = -1): number[] {
  const taken = new Set(spec.doors.filter((_, i) => i !== exceptIndex).map((d) => d.slot))
  const n = panelCount(spec.mullions, spec.width)
  return Array.from({ length: n }, (_, i) => i).filter((i) => !taken.has(i))
}

// Скільки секцій має вікно при заданій кількості імпостів.
export const panelCount = (mullions: number, width: number) =>
  (mullions >= 0 ? mullions : autoMullions(width)) + 1

// Стільки імпостів ставимо, коли задано «авто».
export function autoMullions(width: number): number {
  return width > 1.4 ? Math.max(1, Math.round(width / MULLION_STEP) - 1) : 0
}

// ---- Розміри та правила готового варіанту ----
export const WIN_TOP = 2.7 // СПІЛЬНИЙ верх усіх вікон; змінюється лише низ
export const WIN_MARGIN = 0.5
export const MIN_WIN_W = 0.6
export const MULLION_STEP = 1.4

export const WIN_WIDTH: Partial<Record<RoomType, number>> = {
  bedroom: 1.6,
  livingKitchen: 2.6,
  living: 1.9,
  office: 1.3,
  bathroom: 1.0,
  closet: 0.6,
  wardrobe: 0.8,
  hall: 1.0,
  stairs: 1.2,
  corridor: 100, // галерея на всю стіну
}

// Приміщення, яким вікно не потрібне (комора — за вимогою замовника; тераса
// взагалі надворі; шафи/гардероб — глухі).
const NO_WINDOW_NEEDED: RoomType[] = ['pantry', 'terrace', 'storage', 'closet', 'wardrobe']

// Двері (панорама в підлогу): кухня-вітальня та прихожа завжди; спальні/майстер
// 1-го поверху — вихід у двір.
export const isDoorRoom = (type: RoomType, floorIdx: number) =>
  type === 'livingKitchen' || type === 'hall' || (floorIdx === 0 && type === 'bedroom')

// Підвіконня (верх завжди WIN_TOP). Санвузол/сходи — фіксовані.
export function sillFor(floorIdx: number, type: RoomType, win: WindowType, asDoor: boolean): number {
  if (type === 'bathroom') return WIN_TOP - 0.6
  if (type === 'stairs') return floorIdx >= 1 ? 0.3 : 0
  if (asDoor) return 0
  if (win === 'panoramic') return floorIdx >= 1 ? 0.3 : 0
  return 0.9
}

// ---- Геометрія сторін ----

export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}
export const bounds = (r: { x: number; z: number; width: number; depth: number }): Rect => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})

const segOverlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05

// Сусідня кімната за стороною (або наявність тераси за нею).
export function neighborOf(rooms: RoomZone[], room: RoomZone, side: Side, wantTerrace: boolean): RoomZone | undefined {
  const b = bounds(room)
  return rooms.find((r2) => {
    if (r2 === room) return false
    if (wantTerrace ? r2.type !== 'terrace' : r2.type === 'terrace') return false
    const c = bounds(r2)
    if (side === 'xmax') return Math.abs(c.x0 - b.x1) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'xmin') return Math.abs(c.x1 - b.x0) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'zmax') return Math.abs(c.z0 - b.z1) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
    return Math.abs(c.z1 - b.z0) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
  })
}

// Стіна ЗОВНІШНЯ, якщо за нею немає іншої кімнати. Тільки на таких можна
// ставити вікна — на перетині приміщень вікна не буває.
export const isExterior = (rooms: RoomZone[], room: RoomZone, side: Side) => !neighborOf(rooms, room, side, false)
export const facesTerrace = (rooms: RoomZone[], room: RoomZone, side: Side) => !!neighborOf(rooms, room, side, true)

export interface WallSeg {
  side: Side
  horizontal: boolean // стіна тягнеться вздовж X
  line: number // координата площини стіни
  uStart: number // початок стіни вздовж її осі
  len: number
  rotY: number
  // Найдовший ВІЛЬНИЙ проміжок стіни (у координатах від uStart), якщо його
  // рахували. Стіна буває зовнішньою лише частиною: у кутовій терасі до однієї
  // й тієї ж грані з одного боку притулена кімната, а з іншого — відкрито.
  free?: [number, number]
}

// Контур СТІН поверху (плита мінус тераси) — той самий, що будує HouseShell.
// Кешуємо на об'єкті поверху: у нього десятки звернень на кожен перерахунок.
const outlineCache = new WeakMap<FloorPlan, Ring[]>()
function floorOutline(fl: FloorPlan): Ring[] {
  let r = outlineCache.get(fl)
  if (!r) {
    r = unionOutline(
      fl.slab,
      fl.rooms.filter((x) => x.type === 'terrace'),
    )
    outlineCache.set(fl, r)
  }
  return r
}

// Ділянки КОНТУРУ, що лежать на цій стороні кімнати. Стіна існує лише там —
// і саме тому цього перетину бракувало: сторона, вільна від сусідів, могла
// виявитись усередині плити (порожнє місце в розкладці кімнат), вікно туди
// ставилось, а стіни, у якій прорізати отвір, там не було зовсім.
function outlineSpans(fl: FloorPlan, room: RoomZone, side: Side): [number, number][] {
  const b = bounds(room)
  const vertical = side === 'xmax' || side === 'xmin'
  const line = side === 'xmax' ? b.x1 : side === 'xmin' ? b.x0 : side === 'zmax' ? b.z1 : b.z0
  const u0 = vertical ? b.z0 : b.x0
  const u1 = vertical ? b.z1 : b.x1
  const out: [number, number][] = []
  for (const { pts } of floorOutline(fl)) {
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i]
      const [x1, z1] = pts[(i + 1) % pts.length]
      const eHorizontal = Math.abs(z1 - z0) < 1e-4
      if (eHorizontal === vertical) continue // орієнтація не та
      const eLine = eHorizontal ? z0 : x0
      if (Math.abs(eLine - line) > 0.05) continue
      const a = Math.min(eHorizontal ? x0 : z0, eHorizontal ? x1 : z1)
      const c = Math.max(eHorizontal ? x0 : z0, eHorizontal ? x1 : z1)
      const lo = Math.max(a, u0)
      const hi = Math.min(c, u1)
      if (hi - lo > 0.05) out.push([lo - u0, hi - u0])
    }
  }
  return out
}

// Перетин двох наборів проміжків.
function intersectSpans(a: [number, number][], b: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  for (const [p0, p1] of a) {
    for (const [q0, q1] of b) {
      const lo = Math.max(p0, q0)
      const hi = Math.min(p1, q1)
      if (hi - lo > 0.05) out.push([lo, hi])
    }
  }
  return out.sort((p, q) => p[0] - q[0])
}

// Ділянки сторони, ПРИДАТНІ для вікна: там є стіна (контур) і за нею немає
// сусідньої кімнати. Тераса за сусіда не рахується — на неї вікна й двері
// саме що виходять.
export function exteriorSpans(fl: FloorPlan, room: RoomZone, side: Side): [number, number][] {
  const b = bounds(room)
  const vertical = side === 'xmax' || side === 'xmin'
  const len = vertical ? b.z1 - b.z0 : b.x1 - b.x0
  const u0 = vertical ? b.z0 : b.x0
  const busy: [number, number][] = []
  for (const r2 of fl.rooms) {
    if (r2 === room || r2.type === 'terrace') continue
    const c = bounds(r2)
    const adj =
      side === 'xmax'
        ? Math.abs(c.x0 - b.x1) < 0.05
        : side === 'xmin'
          ? Math.abs(c.x1 - b.x0) < 0.05
          : side === 'zmax'
            ? Math.abs(c.z0 - b.z1) < 0.05
            : Math.abs(c.z1 - b.z0) < 0.05
    if (!adj) continue
    const lo = Math.max(vertical ? c.z0 : c.x0, u0)
    const hi = Math.min(vertical ? c.z1 : c.x1, u0 + len)
    if (hi - lo > 0.05) busy.push([lo - u0, hi - u0])
  }
  busy.sort((p, q) => p[0] - q[0])
  const free: [number, number][] = []
  let cur = 0
  for (const [p, q] of busy) {
    if (p - cur > 0.05) free.push([cur, p])
    cur = Math.max(cur, q)
  }
  if (len - cur > 0.05) free.push([cur, len])
  return intersectSpans(free, outlineSpans(fl, room, side))
}

// Найдовша вільна ділянка сторони.
const widest = (spans: [number, number][]): [number, number] | undefined =>
  spans.length === 0 ? undefined : spans.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a))

export function wallOf(room: RoomZone, side: Side, fl?: FloorPlan): WallSeg {
  const b = bounds(room)
  const base =
    side === 'xmax'
      ? { side, horizontal: false, line: b.x1, uStart: b.z0, len: b.z1 - b.z0, rotY: Math.PI / 2 }
      : side === 'xmin'
        ? { side, horizontal: false, line: b.x0, uStart: b.z0, len: b.z1 - b.z0, rotY: -Math.PI / 2 }
        : side === 'zmax'
          ? { side, horizontal: true, line: b.z1, uStart: b.x0, len: b.x1 - b.x0, rotY: 0 }
          : { side, horizontal: true, line: b.z0, uStart: b.x0, len: b.x1 - b.x0, rotY: Math.PI }
  const seg = base as WallSeg
  if (fl) seg.free = widest(exteriorSpans(fl, room, side))
  return seg
}

export const ALL_SIDES: Side[] = ['xmax', 'xmin', 'zmax', 'zmin']

// Сторони кімнати, на які МОЖНА ставити вікно. Не «зовсім вільна сторона», а
// «є куди вставити вікно»: інакше стіна, до якої з краю притулилась сусідня
// кімната, вважалась глухою цілком — і на кутовій терасі одна з двох стін
// не давала себе клікнути.
const USABLE = MIN_WIN_W + 2 * 0.1
export function openSides(floor: FloorPlan, room: RoomZone): Side[] {
  return ALL_SIDES.filter((s) => exteriorSpans(floor, room, s).some(([a, b]) => b - a >= USABLE))
}

// ---- Готовий варіант ----

export function generateWindows(plan: HousePlan, config: HouseConfig): WindowSpec[] {
  const win: WindowType = config.windows ?? 'standard'
  const pitched = config.roof === 'pitched'
  const out: WindowSpec[] = []

  plan.floors.forEach((fl, floorIdx) => {
    // Чи за цією стіною лежить дах нижнього рівня (напр. скат над кухнею-вітальнею).
    // При СКАТНОМУ даху такі вікна прибираємо — їх перекриває схил.
    const lowerSlab = floorIdx > 0 ? plan.floors[floorIdx - 1].slab.map(bounds) : []
    const overLowerRoof = (side: Side, b: Rect) => {
      if (!pitched || lowerSlab.length === 0) return false
      const off = 0.6
      const px = side === 'xmax' ? b.x1 + off : side === 'xmin' ? b.x0 - off : (b.x0 + b.x1) / 2
      const pz = side === 'zmax' ? b.z1 + off : side === 'zmin' ? b.z0 - off : (b.z0 + b.z1) / 2
      return lowerSlab.some((r) => px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1)
    }

    fl.rooms.forEach((room) => {
      const specW = WIN_WIDTH[room.type]
      if (specW == null || !room.id) return
      const b = bounds(room)
      let sides = openSides(fl, room)
        .filter((s) => !(overLowerRoof(s, b) && !facesTerrace(fl.rooms, room, s)))
        .map((s) => wallOf(room, s, fl))
      // Гардероб-смуга, розтягнута вздовж стіни: вікна лише на ДОВГІЙ грані.
      // На торцях смуги вони теж виростали — і фасад рябів зайвими отворами
      // там, де за ними стоять полиці.
      if (room.type === 'wardrobe') {
        const short = Math.min(room.width, room.depth)
        if (Math.max(room.width, room.depth) - short > 0.5) sides = sides.filter((s) => s.len > short + 0.05)
      }
      if (sides.length === 0) return
      sides.sort((a, c) => c.len - a.len)

      const doorRoom = isDoorRoom(room.type, floorIdx)
      // Прихожа і кухня-вітальня — двері спереду (фасад); решта — у двір.
      const pref: Side = room.type === 'hall' || room.type === 'livingKitchen' ? 'zmax' : 'zmin'
      const doorSide = doorRoom ? (sides.find((s) => s.side === pref) ?? sides[0]) : null

      for (const sd of sides) {
        const terraceExit = facesTerrace(fl.rooms, room, sd.side)
        const asDoor = terraceExit || sd === doorSide
        const kitchenDoor = asDoor && room.type === 'livingKitchen'
        const range = wallRange(sd)
        const span = range.to - range.from
        const width = terraceExit
          ? Math.max(span, MIN_WIN_W)
          : kitchenDoor
            ? Math.max(span - 0.6, 0.9)
            : Math.min(specW, span, sd.len - WIN_MARGIN)
        if (width < 0.4) continue
        out.push({
          id: `${floorIdx}-${room.id}-${sd.side}`,
          floor: floorIdx,
          roomId: room.id,
          side: sd.side,
          u: range.from + (span - width) / 2, // по центру дозволеного проміжку
          width,
          sill: asDoor ? 0 : sillFor(floorIdx, room.type, win, false),
          top: WIN_TOP,
          mullions: -1,
          doors: asDoor ? [{ width: DOOR_LEAF, slot: 0 }] : [],
        })
      }
    })
  })
  return out
}

// ---- spec -> геометрія ----

export interface ResolvedWindow extends WindowSpec {
  baseY: number
  horizontal: boolean
  line: number
  a: number // початок отвору вздовж стіни
  b: number
  rotY: number
  fx: number // центр отвору у світі
  fz: number
}

export function resolveWindows(plan: HousePlan, specs: WindowSpec[], floorH: number): ResolvedWindow[] {
  const out: ResolvedWindow[] = []
  for (const spec of specs) {
    const fl = plan.floors[spec.floor]
    const room = fl?.rooms.find((r) => r.id === spec.roomId)
    if (!room) continue // кімнату прибрали — вікно зникає разом з нею
    const w = wallOf(room, spec.side, fl)
    const { from, to } = wallRange(w)
    const width = Math.min(spec.width, to - from)
    const u = Math.max(from, Math.min(spec.u, to - width))
    const a = w.uStart + u
    const b = a + width
    const center = (a + b) / 2
    out.push({
      ...spec,
      width,
      u,
      baseY: spec.floor * floorH,
      horizontal: w.horizontal,
      line: w.line,
      a,
      b,
      rotY: w.rotY,
      fx: w.horizontal ? center : w.line,
      fz: w.horizontal ? w.line : center,
    })
  }
  return out
}

// ---- Перевірка ----

export interface WindowIssue {
  floor: number
  roomId: string
  roomType: RoomType
}

// Приміщення без жодного вікна. Комору й решту глухих не чіпаємо.
export function validateWindows(plan: HousePlan, specs: WindowSpec[]): WindowIssue[] {
  const out: WindowIssue[] = []
  plan.floors.forEach((fl, floor) => {
    for (const room of fl.rooms) {
      if (!room.id || NO_WINDOW_NEEDED.includes(room.type)) continue
      // Глуха кімната всередині будинку — вікно поставити просто нікуди.
      if (openSides(fl, room).length === 0) continue
      if (specs.some((s) => s.floor === floor && s.roomId === room.id)) continue
      out.push({ floor, roomId: room.id, roomType: room.type })
    }
  })
  return out
}

// ---- Редагування ----

export const WIN_GRID = 0.1 // крок прив'язки вікна вздовж стіни
const snapW = (v: number) => Math.round(v / WIN_GRID) * WIN_GRID

// Вікно рухається по ВНУТРІШНЬОМУ контуру стіни, з відступом від рогу.
// Стіна — рівно 100 мм, а відступ дібраний так, щоб WIN_EDGE теж був кратний
// кроку сітки вікна: інакше межі руху лежали б на 190 мм, вікно впиралось у них
// «між клітинками», і напрямні від сусідніх вікон ніколи точно не збігались.
// ЄДИНЕ джерело товщини зовнішньої стіни: нею користуються і сцена, і дах
// (звіси, парапет). Дві копії однієї константи вже колись розводили геометрію
// з перевірками — більше не тримаємо.
export const WALL_T = 0.1
export const WIN_EDGE = WALL_T / 2 + 0.05 // = WIN_GRID, тобто рівно на сітці

// Проміжок, у якому може жити вікно на цій стіні. Якщо стіна зовнішня лише
// частиною — беремо саме цю частину, з тим самим відступом від країв.
export function wallRange(wall: WallSeg): { from: number; to: number } {
  const [s0, s1] = wall.free ?? [0, wall.len]
  const edge = Math.min(WIN_EDGE, (s1 - s0) / 2)
  return { from: s0 + edge, to: Math.max(s0 + edge, s1 - edge) }
}

// Двері, які вже НЕ вміщаються у вікно, просто прибираємо. Раніше тут була лише
// підказка «завузьке вікно», а самі двері лишались висіти в отворі, вужчому за
// стулку. Тепер правило одне на обидва боки: вужче за MIN_DOOR_W — дверей не
// поставити і наявні зникають.
function clampDoors(spec: WindowSpec): WindowSpec {
  if (spec.doors.length === 0) return spec
  const panels = panelCount(spec.mullions, spec.width)
  const limit = Math.max(0, Math.min(maxDoors(spec.width), panels))
  const doors = spec.doors
    .slice(0, limit)
    .map((d) => ({ width: Math.min(d.width, spec.width), slot: Math.min(d.slot, panels - 1) }))
  const same =
    doors.length === spec.doors.length &&
    doors.every((d, i) => d.width === spec.doors[i].width && d.slot === spec.doors[i].slot)
  return same ? spec : { ...spec, doors }
}

export function updateWindow(specs: WindowSpec[], id: string, patch: Partial<WindowSpec>): WindowSpec[] {
  return specs.map((s) => (s.id === id ? clampDoors({ ...s, ...patch }) : s))
}

export function removeWindow(specs: WindowSpec[], id: string): WindowSpec[] {
  return specs.filter((s) => s.id !== id)
}

// Посунути/змінити вікно в межах його стіни. Вікно не виходить за дозволений
// проміжок і не стає вужчим за MIN_WIN_W.
export function fitToWall(spec: WindowSpec, wall: WallSeg, u: number, width: number): WindowSpec {
  const { from, to } = wallRange(wall)
  const span = to - from
  const w = Math.max(Math.min(MIN_WIN_W, span), Math.min(snapW(width), span))
  return { ...spec, width: w, u: Math.max(from, Math.min(snapW(u), to - w)) }
}

// Нове вікно на найдовшій вільній зовнішній стіні кімнати.
// Скільки вікон уже стоїть на цій стіні.
export const MAX_PER_WALL = 3
export const countOnWall = (specs: WindowSpec[], floor: number, roomId: string, side: Side) =>
  specs.filter((s) => s.floor === floor && s.roomId === roomId && s.side === side).length

// Нове вікно: на вказаній стіні (side) або на найдовшій вільній зовнішній.
export function addWindow(
  plan: HousePlan,
  specs: WindowSpec[],
  floor: number,
  roomId: string,
  win: WindowType,
  side?: Side,
): { specs: WindowSpec[]; id: string } | null {
  const fl = plan.floors[floor]
  const room = fl?.rooms.find((r) => r.id === roomId)
  // Тераса — надворі, вікон на ній не буває.
  if (!room || room.type === 'terrace') return null
  const walls = openSides(fl, room)
    .map((s) => wallOf(room, s, fl))
    .filter((w) => countOnWall(specs, floor, roomId, w.side) < MAX_PER_WALL)
    .sort((a, b) => b.len - a.len)
  if (walls.length === 0) return null

  // Спершу пробуємо стіну, де ще немає вікон, — щоб не громадити їх поруч.
  const busy = new Set(specs.filter((s) => s.floor === floor && s.roomId === roomId).map((s) => s.side))
  const wall = side ? (walls.find((w) => w.side === side) ?? null) : (walls.find((w) => !busy.has(w.side)) ?? walls[0])
  if (!wall) return null

  // Ставимо в НАЙБІЛЬШУ вільну щілину на стіні — інакше кожне наступне вікно
  // лягало б рівно на попереднє.
  const { from, to } = wallRange(wall)
  const taken = specs
    .filter((s) => s.floor === floor && s.roomId === roomId && s.side === wall.side)
    .map((s) => [s.u, s.u + s.width] as [number, number])
    .sort((a, b) => a[0] - b[0])
  // Стартуємо з ПОРОЖНЬОГО проміжку, інакше «найбільшим» назавжди лишиться
  // вся стіна і кожне нове вікно лягало б на попереднє.
  let gap: [number, number] = [from, from]
  let cur = from
  for (const [a, b] of taken) {
    if (a - cur > gap[1] - gap[0]) gap = [cur, a]
    cur = Math.max(cur, b)
  }
  if (to - cur > gap[1] - gap[0]) gap = [cur, to]

  const free = gap[1] - gap[0]
  if (free < MIN_WIN_W) return null
  const width = Math.min(1.6, free - Math.min(0.4, free - MIN_WIN_W))
  const id = `win-${roomId}-${wall.side}-${Date.now().toString(36)}`
  const spec: WindowSpec = {
    id,
    floor,
    roomId,
    side: wall.side,
    u: gap[0] + (free - width) / 2,
    width,
    sill: sillFor(floor, room.type, win, false),
    top: WIN_TOP,
    mullions: -1,
    doors: [],
  }
  return { specs: [...specs, spec], id }
}
