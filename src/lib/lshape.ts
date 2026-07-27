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

const MASTER_LEN = 5.0 // майстер із ванною, без гардероба (≈19 м²)
const MASTER_WC_LEN = 5.6 // майстер, коли є кутова колона санвузол+гардероб
const MASTER_SINGLE_LEN = 4.9 // одна спальня без коридору, на всю ширину (≈26 м²)
const ENSUITE_LEN = 3.4 // ванна майстра у куті (без гардероба)
const COL_W = 2.2 // ширина кутової колони санвузол+гардероб (заходить у спальню)
const SAN_BOX = 2.3 // санвузол у куті (≈5 м²)
const CLO_BOX = 2.3 // гардероб у куті (≈5 м²)
const CLOSET_STRIP = 1.3 // гардероб смугою (варіант 1 спальні)
const BEDROOM_LEN = 3.6 // звичайна спальня (≈14 м²)
const OFFICE_LEN = 2.6 // кабінет (≈10 м²)

const DAY_DEPTH = 7.0
const HCORR_LEN = 1.4 // горизонтальний коридор угорі денного крила
const SERVICE_W = 2.4 // кластер санвузол+гардеробна (ліворуч)
const BATH_LEN = 2.6 // санвузол (згори кластера)
const HALL_W = 1.8 // прихожа — вертикальна смуга праворуч від кластера
const KITCHEN_W = 6.0
const PANTRY_W = 1.5 // комора біля кухні (ширина)
const PANTRY_LEN = 3.5 // комора біля кухні (довжина, спереду)

// Прямокутник за лівим-верхнім кутом; z росте «вниз» (до фасаду).
// id — стабільна РОЛЬ кімнати (напр. 'bedroom-2'), а не порядковий номер:
// не «пливе» при додаванні/прибиранні однотипних кімнат.
function rect(id: string, type: RoomType, x0: number, z0: number, width: number, depth: number): RoomZone {
  return { id, type, x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

export function generateLShapePlan(config: HouseConfig): HousePlan {
  const b = Math.max(1, config.bedrooms)
  const hasEnsuite = b >= 2
  const rooms: RoomZone[] = []

  const hasOffice = config.extras.includes('office')
  const hasCloset = config.extras.includes('wardrobe') // гардероб у майстрі
  // Коридор потрібен, коли в нічному крилі більше однієї кімнати
  // (кілька спалень АБО спальня + кабінет).
  const hasCorridor = b >= 2 || hasOffice

  // ---- Майстер-спальня (зверху) ----
  let z: number
  let corridorTop: number
  if (hasEnsuite && hasCloset) {
    // Санвузол + гардероб — дві скриньки в куті (ширші за коридор,
    // трохи заходять у спальню). Майстер — Г-подібний навколо колони.
    rooms.push(rect('ensuite-bath', 'bathroom', 0, 0, COL_W, SAN_BOX))
    rooms.push(rect('closet-box', 'closet', 0, SAN_BOX, COL_W, CLO_BOX))
    const colBottom = SAN_BOX + CLO_BOX
    rooms.push({ ...rect('master-a', 'master', COL_W, 0, NIGHT_W - COL_W, MASTER_WC_LEN), group: 'master' }) // праворуч
    rooms.push({ ...rect('master-b', 'master', CORRIDOR_W, colBottom, COL_W - CORRIDOR_W, MASTER_WC_LEN - colBottom), group: 'master' }) // під колоною
    corridorTop = colBottom
    z = MASTER_WC_LEN
  } else if (hasEnsuite) {
    // Лише ванна у куті, майстер праворуч, коридор повз ванну
    rooms.push(rect('ensuite-bath', 'bathroom', 0, 0, CORRIDOR_W, ENSUITE_LEN))
    rooms.push(rect('master-a', 'master', CORRIDOR_W, 0, ROOM_W, MASTER_LEN))
    corridorTop = ENSUITE_LEN
    z = MASTER_LEN
  } else {
    // Одна спальня — на всю ширину крила (більша); коридор лише нижче
    const cLen = hasCloset ? CLOSET_STRIP : 0
    if (hasCloset) rooms.push(rect('closet-strip', 'closet', 0, 0, NIGHT_W, cLen))
    // Той самий id 'master-a', що й у конфігураціях із 2+ спальнями, — тому
    // майстер не зникає, а той самий меш плавно морфить форму/позицію.
    rooms.push(rect('master-a', 'master', 0, cLen, NIGHT_W, MASTER_SINGLE_LEN - cLen))
    corridorTop = MASTER_SINGLE_LEN
    z = MASTER_SINGLE_LEN
  }

  // ---- Решта спалень + кабінет (донизу) ----
  for (let i = 0; i < b - 1; i++) {
    rooms.push(rect(`bedroom-${i + 1}`, 'bedroom', CORRIDOR_W, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  // Кабінет — окрема кімната в кінці (додається, а не замінює спальню)
  if (hasOffice) {
    rooms.push(rect('office', 'office', CORRIDOR_W, z, ROOM_W, OFFICE_LEN))
    z += OFFICE_LEN
  }
  const nightLen = z

  // ---- Денне крило ----
  const dz = nightLen

  // Вертикальний коридор уздовж спалень (немає лише при 1 спальні без кабінету)
  if (hasCorridor) {
    rooms.push(rect('corridor-v', 'corridor', 0, corridorTop, CORRIDOR_W, dz - corridorTop))
  }

  // Комора (за бажанням) — вузька довга колона між прихожою і кухнею
  const hasPantry = config.extras.includes('pantry')
  const leftW = SERVICE_W + HALL_W
  const kitchenX = leftW + (hasPantry ? PANTRY_W : 0)

  // Горизонтальний коридор угорі денного крила:
  // з'єднує коридор спалень (ліворуч), прихожу та кухню-вітальню (праворуч)
  rooms.push(rect('corridor-h', 'corridor', 0, dz, kitchenX, HCORR_LEN))

  // Кластер ліворуч: санвузол (згори) + гардеробна (знизу, до входу)
  const bz = dz + HCORR_LEN
  rooms.push(rect('bath-day', 'bathroom', 0, bz, SERVICE_W, BATH_LEN)) // санвузол (об'єднаний)
  rooms.push(rect('wardrobe-day', 'wardrobe', 0, bz + BATH_LEN, SERVICE_W, DAY_DEPTH - HCORR_LEN - BATH_LEN)) // гардеробна

  // Прихожа — праворуч від кластера, вхід спереду
  rooms.push({ ...rect('hall-main', 'hall', SERVICE_W, bz, HALL_W, DAY_DEPTH - HCORR_LEN), group: 'hall' })

  // Комора — коротша й ширша, спереду біля кухні; простір над нею
  // віддається прихожі як ніша (під шафу).
  if (hasPantry) {
    const pFrontZ = dz + DAY_DEPTH - PANTRY_LEN
    rooms.push(rect('pantry', 'pantry', leftW, pFrontZ, PANTRY_W, PANTRY_LEN))
    rooms.push({ ...rect('hall-niche', 'hall', leftW, bz, PANTRY_W, pFrontZ - bz), group: 'hall' }) // ніша над коморою
  }

  // Кухня-вітальня — суцільний блок праворуч на всю висоту денного крила
  rooms.push(rect('kitchen', 'livingKitchen', kitchenX, dz, KITCHEN_W, DAY_DEPTH))

  // ---- Плита (контур) ----
  const dayW = kitchenX + KITCHEN_W
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
