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
