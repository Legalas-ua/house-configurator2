import type { FloorPlan, HouseConfig, HousePlan, PlanRect, RoomType, RoomZone } from '../config/types'

// ============================================================
// Параметричне Г-подібне планування (1 поверх) за референсом.
//
// Ключова ідея — СУЦІЛЬНИЙ коридор уздовж лівого краю: він веде від
// прихожої (спереду) вгору повз усі кімнати до майстер-спальні.
// Кімнати відкриваються праворуч від коридору, службові (гардеробна,
// санвузол) — теж праворуч, тому коридор ніде не перекривається.
//
// Денне крило (внизу): [коридор] | гардеробна / санвузол / прихожа | кухня-вітальня
// Нічне крило (вгору):  [коридор] | спальні; зверху майстер із ванною ЗЛІВА.
//   1 спальня → майстер без ванни (площа більша).
//   Нижній слот можна зробити кабінетом (extras.office).
// ============================================================

const CORRIDOR_W = 1.5
const ROOM_W = 3.8 // ширина спалень (праворуч від коридору)
const NIGHT_W = CORRIDOR_W + ROOM_W // 5.3

const MASTER_LEN = 4.4
const BEDROOM_LEN = 3.6

const DAY_DEPTH = 7.0
const SERVICE_W = 2.8 // ширина колонки гардеробна/санвузол (праворуч від коридору)
const GARD_LEN = 2.6
const BATH_LEN = 2.4
const HALL_LEN = DAY_DEPTH - GARD_LEN - BATH_LEN // прихожа спереду
const KITCHEN_W = 6.0

// Прямокутник за лівим-верхнім кутом; z росте «вниз» (до фасаду)
function rect(type: RoomType, x0: number, z0: number, width: number, depth: number): RoomZone {
  return { type, x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

export function generateLShapePlan(config: HouseConfig): HousePlan {
  const b = Math.max(1, config.bedrooms)
  const hasEnsuite = b >= 2
  const rooms: RoomZone[] = []

  // ---- Нічне крило: майстер згори, спальні донизу ----
  const masterLen = hasEnsuite ? MASTER_LEN : MASTER_LEN + 1.5
  if (hasEnsuite) {
    // ванна майстра — ЗЛІВА, на всю висоту майстер-спальні
    rooms.push(rect('bathroom', 0, 0, CORRIDOR_W, masterLen))
    rooms.push(rect('bedroom', CORRIDOR_W, 0, ROOM_W, masterLen))
  } else {
    // одна спальня — на всю ширину, без ванни
    rooms.push(rect('bedroom', 0, 0, NIGHT_W, masterLen))
  }
  let z = masterLen

  const extraRooms = b - 1
  for (let i = 0; i < extraRooms; i++) {
    const isOffice = config.extras.includes('office') && i === extraRooms - 1
    rooms.push(rect(isOffice ? 'office' : 'bedroom', CORRIDOR_W, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  const nightLen = z

  // ---- Денне крило ----
  const dz = nightLen
  // Службова колонка праворуч від коридору: гардеробна → санвузол (згори вниз)
  rooms.push(rect('wardrobe', CORRIDOR_W, dz, SERVICE_W, GARD_LEN)) // гардеробна
  rooms.push(rect('bathroom', CORRIDOR_W, dz + GARD_LEN, SERVICE_W, BATH_LEN)) // санвузол (об'єднаний)

  // Прихожа — спереду, на всю ширину лівої частини, окремий колір
  rooms.push(rect('hall', 0, dz + GARD_LEN + BATH_LEN, CORRIDOR_W + SERVICE_W, HALL_LEN))

  // Суцільний коридор: від майстра донизу до прихожої
  rooms.push(rect('corridor', 0, masterLen, CORRIDOR_W, dz + GARD_LEN + BATH_LEN - masterLen))

  // Кухня-вітальня (праворуч)
  const kitchenX = CORRIDOR_W + SERVICE_W
  if (config.kitchenType === 'separate') {
    rooms.push(rect('living', kitchenX, dz, 3.6, DAY_DEPTH))
    rooms.push(rect('kitchen', kitchenX + 3.6, dz, KITCHEN_W - 3.6, DAY_DEPTH))
  } else {
    rooms.push(rect('livingKitchen', kitchenX, dz, KITCHEN_W, DAY_DEPTH))
  }

  // ---- Плита (контур) ----
  const dayW = CORRIDOR_W + SERVICE_W + KITCHEN_W
  const slab: PlanRect[] = [
    { x: NIGHT_W / 2, z: nightLen / 2, width: NIGHT_W, depth: nightLen },
    { x: dayW / 2, z: dz + DAY_DEPTH / 2, width: dayW, depth: DAY_DEPTH },
  ]

  // ---- Центрування за контуром ----
  const cx = dayW / 2
  const cz = (dz + DAY_DEPTH) / 2
  const shift = <T extends { x: number; z: number }>(o: T): T => ({ ...o, x: o.x - cx, z: o.z - cz })

  const floor: FloorPlan = { floor: 1, rooms: rooms.map(shift), slab: slab.map(shift) }

  const totalArea = Math.round(
    floor.rooms.reduce((s, r) => s + r.width * r.depth, 0),
  )

  return { floors: [floor], totalArea }
}
