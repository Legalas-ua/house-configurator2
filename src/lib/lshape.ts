import type { FloorPlan, HouseConfig, HousePlan, PlanRect, RoomType, RoomZone } from '../config/types'

// ============================================================
// Параметричне Г-подібне планування (1 поверх) за референсом.
//
// Уздовж лівого краю йде СУЦІЛЬНИЙ коридор: від прихожої (спереду)
// повз усі кімнати аж до майстер-спальні. З коридору двері праворуч
// у кожну кімнату. Ванна майстра — маленька, у верхньому лівому куті,
// тому коридор проходить повз неї й заходить у майстер-спальню.
//
// Денне крило (внизу): [коридор] | гардеробна / санвузол / прихожа | кухня-вітальня
// Нічне крило (вгору):  [коридор] | спальні; зверху майстер + ванна в куті.
//   1 спальня → майстер без ванни (площа більша).
//   Нижній слот можна зробити кабінетом (extras.office).
// ============================================================

const CORRIDOR_W = 1.5
const ROOM_W = 3.8 // ширина кімнат (праворуч від коридору)
const NIGHT_W = CORRIDOR_W + ROOM_W // 5.3

const MASTER_LEN = 4.4
const ENSUITE_LEN = 2.2 // ванна майстра у верхньому куті
const BEDROOM_LEN = 3.6

const DAY_DEPTH = 7.0
const SERVICE_W = 1.8 // кластер санвузол+гардеробна (праворуч від коридору)
const BATH_LEN = 2.6 // санвузол (згори, ближче до спалень)
const HALL_W = 1.5 // прихожа — вертикальна смуга праворуч від кластера
const KITCHEN_W = 6.0

// Прямокутник за лівим-верхнім кутом; z росте «вниз» (до фасаду)
function rect(type: RoomType, x0: number, z0: number, width: number, depth: number): RoomZone {
  return { type, x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

export function generateLShapePlan(config: HouseConfig): HousePlan {
  const b = Math.max(1, config.bedrooms)
  const hasEnsuite = b >= 2
  const rooms: RoomZone[] = []

  // ---- Майстер-спальня (зверху) ----
  const masterLen = hasEnsuite ? MASTER_LEN : MASTER_LEN + 1.4
  rooms.push(rect('bedroom', CORRIDOR_W, 0, ROOM_W, masterLen)) // сама спальня праворуч
  if (hasEnsuite) {
    rooms.push(rect('bathroom', 0, 0, CORRIDOR_W, ENSUITE_LEN)) // ванна — маленька, у куті
  }
  const corridorTop = hasEnsuite ? ENSUITE_LEN : 0

  // ---- Решта спалень (донизу) ----
  let z = masterLen
  const extraRooms = b - 1
  for (let i = 0; i < extraRooms; i++) {
    const isOffice = config.extras.includes('office') && i === extraRooms - 1
    rooms.push(rect(isOffice ? 'office' : 'bedroom', CORRIDOR_W, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  const nightLen = z

  // ---- Денне крило (за референсом, зліва направо) ----
  // [коридор] | [санвузол згори + гардеробна знизу] | [прихожа] | [кухня-вітальня]
  const dz = nightLen

  // Суцільний коридор-спина: від ванни майстра донизу до фасаду
  rooms.push(rect('corridor', 0, corridorTop, CORRIDOR_W, dz + DAY_DEPTH - corridorTop))

  // Кластер праворуч від коридору: санвузол (згори) + гардеробна (знизу, до входу)
  const clusterX = CORRIDOR_W
  rooms.push(rect('bathroom', clusterX, dz, SERVICE_W, BATH_LEN)) // санвузол (об'єднаний)
  rooms.push(rect('wardrobe', clusterX, dz + BATH_LEN, SERVICE_W, DAY_DEPTH - BATH_LEN)) // гардеробна

  // Прихожа — вертикальна смуга праворуч від кластера, вхід спереду
  const hallX = clusterX + SERVICE_W
  rooms.push(rect('hall', hallX, dz, HALL_W, DAY_DEPTH))

  // Кухня-вітальня (праворуч)
  const kitchenX = hallX + HALL_W
  if (config.kitchenType === 'separate') {
    rooms.push(rect('living', kitchenX, dz, 3.6, DAY_DEPTH))
    rooms.push(rect('kitchen', kitchenX + 3.6, dz, KITCHEN_W - 3.6, DAY_DEPTH))
  } else {
    rooms.push(rect('livingKitchen', kitchenX, dz, KITCHEN_W, DAY_DEPTH))
  }

  // ---- Плита (контур) ----
  const dayW = CORRIDOR_W + SERVICE_W + HALL_W + KITCHEN_W
  const slab: PlanRect[] = [
    { x: NIGHT_W / 2, z: nightLen / 2, width: NIGHT_W, depth: nightLen },
    { x: dayW / 2, z: dz + DAY_DEPTH / 2, width: dayW, depth: DAY_DEPTH },
  ]

  // ---- Центрування за контуром ----
  const cx = dayW / 2
  const cz = (dz + DAY_DEPTH) / 2
  const shift = <T extends { x: number; z: number }>(o: T): T => ({ ...o, x: o.x - cx, z: o.z - cz })

  const floor: FloorPlan = { floor: 1, rooms: rooms.map(shift), slab: slab.map(shift) }
  const totalArea = Math.round(floor.rooms.reduce((s, r) => s + r.width * r.depth, 0))

  return { floors: [floor], totalArea }
}
