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

const MASTER_LEN = 4.7 // майстер із ванною (≈18 м²)
const MASTER_SINGLE_LEN = 4.9 // одна спальня без коридору, на всю ширину (≈26 м²)
const ENSUITE_LEN = 3.4 // ванна майстра у куті (≈5 м²)
const BEDROOM_LEN = 3.6 // звичайна спальня (≈14 м²)
const OFFICE_LEN = 2.6 // кабінет (≈10 м²)

const DAY_DEPTH = 7.0
const HCORR_LEN = 1.4 // горизонтальний коридор угорі денного крила
const SERVICE_W = 2.4 // кластер санвузол+гардеробна (ліворуч)
const BATH_LEN = 2.6 // санвузол (згори кластера)
const HALL_W = 1.8 // прихожа — вертикальна смуга праворуч від кластера
const KITCHEN_W = 6.0

// Прямокутник за лівим-верхнім кутом; z росте «вниз» (до фасаду)
function rect(type: RoomType, x0: number, z0: number, width: number, depth: number): RoomZone {
  return { type, x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

export function generateLShapePlan(config: HouseConfig): HousePlan {
  const b = Math.max(1, config.bedrooms)
  const hasEnsuite = b >= 2
  const rooms: RoomZone[] = []

  const hasOffice = config.extras.includes('office')
  // Коридор потрібен, коли в нічному крилі більше однієї кімнати
  // (кілька спалень АБО спальня + кабінет). Ванна майстра — лише 2+ спальні.
  const hasCorridor = b >= 2 || hasOffice

  // ---- Майстер-спальня (зверху) ----
  let z: number
  let corridorTop: number
  if (hasCorridor) {
    if (hasEnsuite) rooms.push(rect('bathroom', 0, 0, CORRIDOR_W, ENSUITE_LEN)) // ванна ≈5 м²
    rooms.push(rect('bedroom', CORRIDOR_W, 0, ROOM_W, MASTER_LEN)) // спальня праворуч
    corridorTop = hasEnsuite ? ENSUITE_LEN : 0
    z = MASTER_LEN
  } else {
    // одна спальня без кабінету: без коридору, на всю ширину крила, більша
    rooms.push(rect('bedroom', 0, 0, NIGHT_W, MASTER_SINGLE_LEN))
    corridorTop = 0
    z = MASTER_SINGLE_LEN
  }

  // ---- Решта спалень + кабінет (донизу) ----
  for (let i = 0; i < b - 1; i++) {
    rooms.push(rect('bedroom', CORRIDOR_W, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  // Кабінет — окрема кімната в кінці (додається, а не замінює спальню)
  if (hasOffice) {
    rooms.push(rect('office', CORRIDOR_W, z, ROOM_W, OFFICE_LEN))
    z += OFFICE_LEN
  }
  const nightLen = z

  // ---- Денне крило ----
  const dz = nightLen

  // Вертикальний коридор уздовж спалень (немає лише при 1 спальні без кабінету)
  if (hasCorridor) {
    rooms.push(rect('corridor', 0, corridorTop, CORRIDOR_W, dz - corridorTop))
  }

  // Горизонтальний коридор угорі денного крила:
  // з'єднує коридор спалень (ліворуч), прихожу та кухню-вітальню (праворуч)
  const leftW = SERVICE_W + HALL_W
  rooms.push(rect('corridor', 0, dz, leftW, HCORR_LEN))

  // Кластер ліворуч: санвузол (згори) + гардеробна (знизу, до входу)
  const bz = dz + HCORR_LEN
  rooms.push(rect('bathroom', 0, bz, SERVICE_W, BATH_LEN)) // санвузол (об'єднаний)
  rooms.push(rect('wardrobe', 0, bz + BATH_LEN, SERVICE_W, DAY_DEPTH - HCORR_LEN - BATH_LEN)) // гардеробна

  // Прихожа — праворуч від кластера, вхід спереду
  rooms.push(rect('hall', SERVICE_W, bz, HALL_W, DAY_DEPTH - HCORR_LEN))

  // Кухня-вітальня (праворуч, на всю висоту денного крила)
  const kitchenX = leftW
  rooms.push(rect('livingKitchen', kitchenX, dz, KITCHEN_W, DAY_DEPTH))

  // ---- Плита (контур) ----
  const dayW = leftW + KITCHEN_W
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
