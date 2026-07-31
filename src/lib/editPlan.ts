import type { HousePlan, PlanRect, RoomType, RoomZone } from '../config/types'

// ============================================================
// Ручне редагування планування: чисті операції над HousePlan.
// Тут НЕМАЄ React і Three.js — лише перерахунок даних.
//
// У ручному режимі плита поверху = самі кімнати: контур будинку виводиться
// з їхнього об'єднання (unionOutline), тож окремо його вести не треба.
// ============================================================

export const GRID = 0.5 // крок прив'язки, м
export const MIN_SIDE = 1.5 // найменша сторона кімнати, м

export const snap = (v: number) => Math.round(v / GRID) * GRID

// Площа житла: тераса — надвір, її не рахуємо (як і в генераторі з сітки).
function livingArea(rooms: RoomZone[]): number {
  return rooms.filter((r) => r.type !== 'terrace').reduce((s, r) => s + r.width * r.depth, 0)
}

// Після будь-якої правки плита й площа мають наздогнати кімнати.
function recompute(floors: HousePlan['floors']): HousePlan {
  const next = floors.map((fl) => ({
    ...fl,
    slab: fl.rooms.map(({ x, z, width, depth }) => ({ x, z, width, depth })),
  }))
  return { floors: next, totalArea: Math.round(next.reduce((s, fl) => s + livingArea(fl.rooms), 0)) }
}

// Приводимо прямокутник до сітки й не даємо кімнаті виродитись у смужку.
// Прив'язуємо ГРАНЬ, а не центр: розміри кратні GRID, тож коли на сітці ліва
// грань — на ній і права, і сусідні кімнати сходяться впритул без щілин.
export function normalize(rect: PlanRect): PlanRect {
  const width = Math.max(MIN_SIDE, snap(rect.width))
  const depth = Math.max(MIN_SIDE, snap(rect.depth))
  const x0 = snap(rect.x - rect.width / 2)
  const z0 = snap(rect.z - rect.depth / 2)
  return { x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

// Готове планування приходить з довільними координатами, а редагуємо ми по
// сітці — тож при переході в ручний режим одразу кладемо все на сітку,
// інакше перша ж правка «смикне» кімнату на пів кроку.
export function normalizePlan(plan: HousePlan): HousePlan {
  return recompute(plan.floors.map((fl) => ({ ...fl, rooms: fl.rooms.map((r) => ({ ...r, ...normalize(r) })) })))
}

// Сходи — наскрізні: їхня зона мусить збігатися на всіх поверхах, тож правка
// на одному одразу переносить решту.
const isStairs = (plan: HousePlan, floorIdx: number, id: string) =>
  plan.floors[floorIdx]?.rooms.find((r) => r.id === id)?.type === 'stairs'

export function updateRoom(plan: HousePlan, floorIdx: number, id: string, rect: PlanRect): HousePlan {
  const r = normalize(rect)
  const sync = isStairs(plan, floorIdx, id)
  return recompute(
    plan.floors.map((fl, i) => ({
      ...fl,
      rooms: fl.rooms.map((room) => {
        if (i === floorIdx && room.id === id) return { ...room, ...r }
        if (sync && i !== floorIdx && room.type === 'stairs') return { ...room, ...r }
        return room
      }),
    })),
  )
}

export function removeRoom(plan: HousePlan, floorIdx: number, id: string): HousePlan {
  const sync = isStairs(plan, floorIdx, id)
  return recompute(
    plan.floors.map((fl, i) => ({
      ...fl,
      rooms: fl.rooms.filter((room) => {
        if (i === floorIdx) return room.id !== id
        return !(sync && room.type === 'stairs')
      }),
    })),
  )
}

// ---- Складні кімнати: об'єднання сусідніх прямокутників ----
// Кімната складної форми — це кілька прямокутників зі СПІЛЬНИМ group. Такі
// частини не розділяються перегородкою (HouseShell) і підсвічуються разом
// (PlanView) — тобто це одне приміщення.

const EDGE_EPS = 0.01

export interface Junction {
  otherId: string
  x: number // середина спільного ребра — там і буде кнопка
  z: number
  alongX: boolean // спільне ребро йде вздовж X (важливо, куди зсувати кнопку)
  joined: boolean
}

// Спільне ребро двох прямокутників: дотик по одній осі + перекриття по другій.
function sharedEdge(a: RoomZone, b: RoomZone): { x: number; z: number; alongX: boolean } | null {
  const ax0 = a.x - a.width / 2
  const ax1 = a.x + a.width / 2
  const az0 = a.z - a.depth / 2
  const az1 = a.z + a.depth / 2
  const bx0 = b.x - b.width / 2
  const bx1 = b.x + b.width / 2
  const bz0 = b.z - b.depth / 2
  const bz1 = b.z + b.depth / 2

  // Вертикальне ребро (дотик по X): спільний відрізок тягнеться вздовж Z.
  const zOver = Math.min(az1, bz1) - Math.max(az0, bz0)
  if (zOver > EDGE_EPS) {
    const z = (Math.max(az0, bz0) + Math.min(az1, bz1)) / 2
    if (Math.abs(ax1 - bx0) < EDGE_EPS) return { x: ax1, z, alongX: false }
    if (Math.abs(bx1 - ax0) < EDGE_EPS) return { x: ax0, z, alongX: false }
  }
  // Горизонтальне ребро (дотик по Z): спільний відрізок тягнеться вздовж X.
  const xOver = Math.min(ax1, bx1) - Math.max(ax0, bx0)
  if (xOver > EDGE_EPS) {
    const x = (Math.max(ax0, bx0) + Math.min(ax1, bx1)) / 2
    if (Math.abs(az1 - bz0) < EDGE_EPS) return { x, z: az1, alongX: true }
    if (Math.abs(bz1 - az0) < EDGE_EPS) return { x, z: az0, alongX: true }
  }
  return null
}

// Усі стики обраної кімнати з сусідами — по одному на спільне ребро.
export function junctionsOf(rooms: RoomZone[], id: string): Junction[] {
  const self = rooms.find((r) => r.id === id)
  if (!self) return []
  const out: Junction[] = []
  for (const other of rooms) {
    if (other === self || !other.id) continue
    const mid = sharedEdge(self, other)
    if (!mid) continue
    out.push({
      otherId: other.id,
      x: mid.x,
      z: mid.z,
      alongX: mid.alongX,
      joined: !!self.group && self.group === other.group,
    })
  }
  return out
}

// Об'єднати/роз'єднати дві сусідні кімнати.
export function toggleJoin(plan: HousePlan, floorIdx: number, idA: string, idB: string): HousePlan {
  const fl = plan.floors[floorIdx]
  const a = fl?.rooms.find((r) => r.id === idA)
  const b = fl?.rooms.find((r) => r.id === idB)
  if (!a || !b) return plan
  const joined = !!a.group && a.group === b.group
  const group = a.group ?? `join-${idA}`
  const oldB = b.group

  return recompute(
    plan.floors.map((f, i) => {
      if (i !== floorIdx) return f
      return {
        ...f,
        rooms: f.rooms.map((r) => {
          if (joined) {
            // Роз'єднуємо: знімаємо групу з B (решта групи лишається цілою).
            if (r.id !== idB) return r
            const { group: _drop, ...rest } = r
            return rest
          }
          // Об'єднуємо: B і вся його попередня група переходять у групу A.
          if (r.id === idA || r.id === idB || (oldB && r.group === oldB)) return { ...r, group }
          return r
        }),
      }
    }),
  )
}

// Нова кімната стає праворуч від наявних, впритул — щоб одразу була частиною
// будинку, а не висіла окремим островом.
export function addRoom(
  plan: HousePlan,
  floorIdx: number,
  type: RoomType,
): { plan: HousePlan; id: string } {
  const fl = plan.floors[floorIdx]
  const id = `custom-${type}-${Date.now().toString(36)}`
  const width = 3
  const depth = 4
  let x = 0
  let z = 0
  if (fl && fl.rooms.length > 0) {
    const right = Math.max(...fl.rooms.map((r) => r.x + r.width / 2))
    const zs = fl.rooms.map((r) => r.z)
    x = right + width / 2
    z = snap(zs.reduce((s, v) => s + v, 0) / zs.length)
  }
  const room: RoomZone = { id, type, ...normalize({ x, z, width, depth }) }
  return {
    plan: recompute(plan.floors.map((f, i) => (i !== floorIdx ? f : { ...f, rooms: [...f.rooms, room] }))),
    id,
  }
}
