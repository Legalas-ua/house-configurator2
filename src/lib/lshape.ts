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
const STAIR_W = 3.0 // сходи: ширина (2-3 м), праворуч від коридору
const STAIR_LEN = 2.5 // сходи: довжина (сторона 2.5 м)

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

  const twoFloors = config.floors === 2
  const hasOffice = config.extras.includes('office')
  const hasCloset = config.extras.includes('wardrobe') // гардероб у майстрі
  // Коридор потрібен, коли в нічному крилі більше однієї кімнати
  // (кілька спалень АБО спальня + кабінет), а також коли є сходи (2 поверхи).
  const hasCorridor = b >= 2 || hasOffice || twoFloors

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
    // anchorZ:'min' — смуга з'являється/зникає від ВЕРХНЬОЇ грані (не з центру),
    // тому не наштовхується на майстер, що відсувається знизу.
    if (hasCloset) rooms.push({ ...rect('closet-strip', 'closet', 0, 0, NIGHT_W, cLen), anchorZ: 'min' as const })
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
  // Сходи (лише 2 поверхи) — знизу нічного крила, впритул над горизонтальним
  // коридором; усі спальні/кабінет додаються ЗВЕРХУ від них.
  if (twoFloors) {
    rooms.push(rect('stairs', 'stairs', CORRIDOR_W, z, STAIR_W, STAIR_LEN))
    z += STAIR_LEN
  }
  const nightLen = z

  // ---- Денне крило ----
  const dz = nightLen

  // Вертикальний коридор уздовж спалень (немає лише при 1 спальні без кабінету)
  if (hasCorridor) {
    // lazyStretch — коридор розтягується повільніше / стягується швидше за майстер,
    // тому не наздоганяє його верхньою гранню при 1↔2 спальнях (без колізії).
    rooms.push({ ...rect('corridor-v', 'corridor', 0, corridorTop, CORRIDOR_W, dz - corridorTop), lazyStretch: true })
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

  const floors: FloorPlan[] = [{ floor: 1, rooms: rooms.map(shift), slab: slab.map(shift) }]

  // ---- 2-й поверх (прямокутник над нічним крилом, без кухні-вітальні) ----
  if (twoFloors) {
    const f2 = buildFloor2(config)
    const f2slab: PlanRect[] = [
      { x: NIGHT_W / 2, z: f2.length / 2, width: NIGHT_W, depth: f2.length },
    ]
    floors.push({ floor: 2, rooms: f2.rooms.map(shift), slab: f2slab.map(shift) })
  }

  // Сумарна площа приміщень (сходи не рахуємо як житлову площу)
  const totalArea = Math.round(
    floors.reduce(
      (s, fl) => s + fl.rooms.filter((r) => r.type !== 'stairs').reduce((a, r) => a + r.width * r.depth, 0),
      0,
    ),
  )

  return { floors, totalArea }
}

// 2-й поверх Г-подібного: прямокутник шириною нічного крила (без денного крила/
// кухні). Коридор і санвузол — на тих самих місцях, що й на 1-му; замість
// гардеробної/прихожої — спальні. При 3+ спальнях крайня (на місці майстра 1-го
// поверху) стає майстром → доступні гардероб і кабінет (комора — ні).
function buildFloor2(config: HouseConfig): { rooms: RoomZone[]; length: number } {
  const b2 = Math.min(Math.max(1, config.bedrooms2), Math.max(1, config.bedrooms))
  const isMaster = b2 >= 3
  const hasCloset2 = isMaster && config.extras2.includes('wardrobe') // гардероб — у майстрі
  const hasOffice2 = config.extras2.includes('office') // кабінет — окрема кімната, завжди
  const rooms: RoomZone[] = []
  let z: number
  let corridorTop: number

  if (isMaster && hasCloset2) {
    // Майстер із кутовою колоною санвузол+гардероб (як на 1-му поверсі)
    rooms.push(rect('f2-ensuite-bath', 'bathroom', 0, 0, COL_W, SAN_BOX))
    rooms.push(rect('f2-closet', 'closet', 0, SAN_BOX, COL_W, CLO_BOX))
    const colBottom = SAN_BOX + CLO_BOX
    rooms.push({ ...rect('f2-master-a', 'master', COL_W, 0, NIGHT_W - COL_W, MASTER_WC_LEN), group: 'f2-master' })
    rooms.push({ ...rect('f2-master-b', 'master', CORRIDOR_W, colBottom, COL_W - CORRIDOR_W, MASTER_WC_LEN - colBottom), group: 'f2-master' })
    corridorTop = colBottom
    z = MASTER_WC_LEN
  } else if (isMaster) {
    // Майстер + ванна в куті
    rooms.push(rect('f2-corner-bath', 'bathroom', 0, 0, CORRIDOR_W, ENSUITE_LEN))
    rooms.push(rect('f2-master-a', 'master', CORRIDOR_W, 0, ROOM_W, MASTER_LEN))
    corridorTop = ENSUITE_LEN
    z = MASTER_LEN
  } else {
    // Без майстра: санвузол у верхньому лівому куті (на тому ж місці, що й на 1-му),
    // перша спальня — праворуч від нього
    rooms.push(rect('f2-corner-bath', 'bathroom', 0, 0, CORRIDOR_W, ENSUITE_LEN))
    rooms.push(rect('f2-bedroom-1', 'bedroom', CORRIDOR_W, 0, ROOM_W, BEDROOM_LEN))
    corridorTop = ENSUITE_LEN
    z = Math.max(ENSUITE_LEN, BEDROOM_LEN)
  }

  // Решта звичайних спалень (перша вже стоїть зверху — майстер або спальня)
  for (let i = 1; i < b2; i++) {
    rooms.push(rect(`f2-bedroom-${i + 1}`, 'bedroom', CORRIDOR_W, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  // Кабінет (лише коли є майстер)
  if (hasOffice2) {
    rooms.push(rect('f2-office', 'office', CORRIDOR_W, z, ROOM_W, OFFICE_LEN))
    z += OFFICE_LEN
  }
  // Сходи — на тому ж місці, що й на 1-му поверсі (низ крила)
  rooms.push(rect('f2-stairs', 'stairs', CORRIDOR_W, z, STAIR_W, STAIR_LEN))
  z += STAIR_LEN
  // Коридор — уздовж усього крила
  rooms.push({ ...rect('f2-corridor-v', 'corridor', 0, corridorTop, CORRIDOR_W, z - corridorTop), lazyStretch: true })

  return { rooms, length: z }
}
