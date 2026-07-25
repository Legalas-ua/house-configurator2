import type { FloorPlan, HouseConfig, HousePlan, PlanRect, RoomType, RoomZone } from '../config/types'

// ============================================================
// Параметричне Г-подібне планування (1 поверх) за референсом.
//
// Денне крило (внизу): гардеробна + санвузол + ванна | прихожа | кухня-вітальня
// Нічне крило (зліва, росте вгору): смуга шаф | коридор | стос кімнат,
//   у кінці — майстер-спальня з власним санвузлом.
//   1 спальня → майстер без ensuite (площа більша).
//   Нижній слот можна зробити кабінетом (extras.office).
// Тераса — у внутрішньому куті. Усі розміри тут; кожен легко змінити.
// ============================================================

const STORAGE_W = 1.0 // смуга вбудованих шаф уздовж коридору
const CORRIDOR_W = 1.4
const ROOM_W = 3.6 // ширина кімнат нічного крила
const NIGHT_W = STORAGE_W + CORRIDOR_W + ROOM_W // 6.0

const BEDROOM_LEN = 3.8 // довжина звичайної спальні вздовж коридору
const MASTER_LEN = 4.6
const ENSUITE_LEN = 2.2

const DAY_DEPTH = 7.0
const GARD_LEN = 3.4 // гардеробна (глибина від задньої стіни денного крила)
const HALL_W = 3.0
const GARD_W = 3.0 // гардеробна+санвузли займають ліві 3 м (під нічним крилом)
const KITCHEN_W = 6.0
const TERRACE_DEPTH = 4.5

const ROOMS_COL_X = STORAGE_W + CORRIDOR_W // 2.4 — лівий край стосу кімнат

// Прямокутник за лівим-верхнім кутом (x0,z0); z росте «вниз» (углиб екрана)
function rect(type: RoomType, x0: number, z0: number, width: number, depth: number): RoomZone {
  return { type, x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

export function generateLShapePlan(config: HouseConfig): HousePlan {
  const b = Math.max(1, config.bedrooms)
  const hasEnsuite = b >= 2
  const rooms: RoomZone[] = []

  // ---- Нічне крило: стос кімнат згори вниз ----
  let z = 0
  if (hasEnsuite) {
    rooms.push(rect('bathroom', ROOMS_COL_X, z, ROOM_W, ENSUITE_LEN)) // санвузол майстра
    z += ENSUITE_LEN
  }
  const masterLen = hasEnsuite ? MASTER_LEN : MASTER_LEN + ENSUITE_LEN
  rooms.push(rect('bedroom', ROOMS_COL_X, z, ROOM_W, masterLen)) // майстер-спальня
  z += masterLen

  const extraRooms = b - 1
  for (let i = 0; i < extraRooms; i++) {
    const isOffice = config.extras.includes('office') && i === extraRooms - 1
    rooms.push(rect(isOffice ? 'office' : 'bedroom', ROOMS_COL_X, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  const nightLen = z

  // Смуга шаф + коридор на всю довжину крила
  rooms.push(rect('storage', 0, 0, STORAGE_W, nightLen))
  rooms.push(rect('corridor', STORAGE_W, 0, CORRIDOR_W, nightLen))

  // ---- Денне крило (внизу) ----
  const dz = nightLen
  rooms.push(rect('wardrobe', 0, dz, GARD_W, GARD_LEN)) // гардеробна
  rooms.push(rect('bathroom', 0, dz + GARD_LEN, 1.5, DAY_DEPTH - GARD_LEN)) // санвузол
  rooms.push(rect('bathroom', 1.5, dz + GARD_LEN, 1.5, DAY_DEPTH - GARD_LEN)) // ванна
  rooms.push(rect('hall', GARD_W, dz, HALL_W, DAY_DEPTH)) // прихожа

  if (config.kitchenType === 'separate') {
    rooms.push(rect('living', NIGHT_W, dz, 3.6, DAY_DEPTH))
    rooms.push(rect('kitchen', NIGHT_W + 3.6, dz, KITCHEN_W - 3.6, DAY_DEPTH))
  } else {
    rooms.push(rect('livingKitchen', NIGHT_W, dz, KITCHEN_W, DAY_DEPTH))
  }

  // Тераса у внутрішньому куті (над кухнею, праворуч від нічного крила)
  const terraceDepth = Math.min(TERRACE_DEPTH, nightLen)
  rooms.push(rect('terrace', NIGHT_W, dz - terraceDepth, KITCHEN_W, terraceDepth))

  // ---- Плита (контур) ----
  const slab: PlanRect[] = [
    rect('corridor', 0, 0, NIGHT_W, nightLen), // нічне крило
    rect('corridor', 0, dz, NIGHT_W + KITCHEN_W, DAY_DEPTH), // денне крило
  ].map(({ x, z, width, depth }) => ({ x, z, width, depth }))

  // ---- Центрування за контуром ----
  const minX = 0
  const maxX = NIGHT_W + KITCHEN_W
  const minZ = 0
  const maxZ = dz + DAY_DEPTH
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const shift = <T extends { x: number; z: number }>(o: T): T => ({ ...o, x: o.x - cx, z: o.z - cz })

  const floor: FloorPlan = {
    floor: 1,
    rooms: rooms.map(shift),
    slab: slab.map(shift),
  }

  const totalArea = Math.round(
    floor.rooms
      .filter((r) => r.type !== 'terrace')
      .reduce((s, r) => s + r.width * r.depth, 0),
  )

  return { floors: [floor], totalArea }
}
