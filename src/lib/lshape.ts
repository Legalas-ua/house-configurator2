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

// Час згладжування ЛИШЕ для росту (передається у PlanView як growEase). Більший =
// повільніший ріст. Дає коробці відставати від сусіда, що рухається, щоб довше не
// перетинатись. Пор.: звичайний ROOM_EASE=0.45, лінивий ріст коридору=0.75.
const LSHAPE_SLOW_GROW = 1.1 // коридор 2-го поверху росте помітно повільніше

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
const STAIR_W = ROOM_W // сходи: у лінію з кабінетом/спальнею (без гапу справа)
const STAIR_LEN = 2.5 // сходи: сторона вздовж крила — 2.5 м

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

// Нічне крило (майстер + ensuite/гардероб + спальні + кабінет) — СПІЛЬНИЙ
// генератор для 1-го і 2-го поверхів. Тому додавання спалень/гардероба/кабінета
// й анімації на обох поверхах однакові. pfx — префікс id ('' або 'f2-').
function buildNightWing(
  b: number,
  hasOffice: boolean,
  hasCloset: boolean,
  pfx: string,
): { rooms: RoomZone[]; endZ: number; corridorTop: number } {
  const hasEnsuite = b >= 2
  const rooms: RoomZone[] = []
  let z: number
  let corridorTop: number
  if (hasEnsuite && hasCloset) {
    // Санвузол + гардероб — дві скриньки в куті; майстер Г-подібний навколо колони.
    rooms.push(rect(`${pfx}ensuite-bath`, 'bathroom', 0, 0, COL_W, SAN_BOX))
    // Гардероб-квадрат (коли з'являється санвузол) з'являється З ЦЕНТРУ — без
    // прив'язки грані, як і було. Він у власній кутовій колоні, тож симетричний
    // ріст сусідів не «зачіпає».
    rooms.push(rect(`${pfx}closet-box`, 'closet', 0, SAN_BOX, COL_W, CLO_BOX))
    const colBottom = SAN_BOX + CLO_BOX
    rooms.push({ ...rect(`${pfx}master-a`, 'master', COL_W, 0, NIGHT_W - COL_W, MASTER_WC_LEN), group: `${pfx}master` })
    rooms.push({ ...rect(`${pfx}master-b`, 'master', CORRIDOR_W, colBottom, COL_W - CORRIDOR_W, MASTER_WC_LEN - colBottom), group: `${pfx}master` })
    corridorTop = colBottom
    z = MASTER_WC_LEN
  } else if (hasEnsuite) {
    // Лише ванна у куті, майстер праворуч, коридор повз ванну
    rooms.push(rect(`${pfx}ensuite-bath`, 'bathroom', 0, 0, CORRIDOR_W, ENSUITE_LEN))
    rooms.push(rect(`${pfx}master-a`, 'master', CORRIDOR_W, 0, ROOM_W, MASTER_LEN))
    corridorTop = ENSUITE_LEN
    z = MASTER_LEN
  } else {
    // Одна спальня — на всю ширину крила (більша); коридор лише нижче.
    const cLen = hasCloset ? CLOSET_STRIP : 0
    // anchorZ:'min' — гардероб-смуга (прямокутний, у кінці майстра, без санвузла)
    // з'являється від ВЕРХНЬОЇ грані (не суміжної з майстром). Швидкість — звичайна.
    if (hasCloset) rooms.push({ ...rect(`${pfx}closet-strip`, 'closet', 0, 0, NIGHT_W, cLen), anchorZ: 'min' as const })
    rooms.push(rect(`${pfx}master-a`, 'master', 0, cLen, NIGHT_W, MASTER_SINGLE_LEN - cLen))
    corridorTop = MASTER_SINGLE_LEN
    z = MASTER_SINGLE_LEN
  }
  // Решта спалень
  for (let i = 0; i < b - 1; i++) {
    rooms.push(rect(`${pfx}bedroom-${i + 1}`, 'bedroom', CORRIDOR_W, z, ROOM_W, BEDROOM_LEN))
    z += BEDROOM_LEN
  }
  // Кабінет — окрема кімната в кінці (додається, а не замінює спальню)
  if (hasOffice) {
    rooms.push(rect(`${pfx}office`, 'office', CORRIDOR_W, z, ROOM_W, OFFICE_LEN))
    z += OFFICE_LEN
  }
  return { rooms, endZ: z, corridorTop }
}

// Довжина нічного крила (без сходів) — для порівняння площ поверхів.
function nightWingLen(b: number, hasOffice: boolean, hasCloset: boolean): number {
  const masterLen = b >= 2 ? (hasCloset ? MASTER_WC_LEN : MASTER_LEN) : MASTER_SINGLE_LEN
  const beds = b >= 2 ? (b - 1) * BEDROOM_LEN : 0
  return masterLen + beds + (hasOffice ? OFFICE_LEN : 0)
}

// Ліміти 2-го поверху: не можна додати кімнат так, щоб основа 2-го стала БІЛЬШОЮ
// за 1-й (бо звисатиме). Порівнюємо довжини нічного крила (денне крило однакове).
export function floor2Limits(config: HouseConfig): {
  maxBedrooms: number
  canOffice: boolean
  canWardrobe: boolean
  canTerrace: boolean
} {
  const b1 = Math.max(1, config.bedrooms)
  const cap = nightWingLen(b1, config.extras.includes('office'), config.extras.includes('wardrobe'))
  const o2 = config.extras2.includes('office')
  const w2 = config.extras2.includes('wardrobe')
  // Найбільша к-сть спалень 2-го, що вміщується в межі 1-го (і не більше за 1-й)
  let maxBedrooms = 1
  while (maxBedrooms < b1 && nightWingLen(maxBedrooms + 1, o2, w2) <= cap + 0.01) maxBedrooms++
  const b2 = Math.min(Math.max(1, config.bedrooms2), maxBedrooms)
  // Чи вміститься кабінет / гардероб при поточній к-сті спалень 2-го
  const canOffice = nightWingLen(b2, true, w2) <= cap + 0.01
  const canWardrobe = nightWingLen(b2, o2, true) <= cap + 0.01
  // Тераса доступна, коли основа 2-го МЕНША за 1-й (є вільне місце на даху)
  const canTerrace = cap - nightWingLen(b2, o2, w2) > 0.01
  return { maxBedrooms, canOffice, canWardrobe, canTerrace }
}

export function generateLShapePlan(config: HouseConfig): HousePlan {
  const b = Math.max(1, config.bedrooms)
  const twoFloors = config.floors === 2
  const hasOffice = config.extras.includes('office')
  const hasCloset = config.extras.includes('wardrobe') // гардероб у майстрі
  // Коридор потрібен, коли в нічному крилі більше однієї кімнати
  // (кілька спалень АБО спальня + кабінет), а також коли є сходи (2 поверхи).
  const hasCorridor = b >= 2 || hasOffice || twoFloors

  // ---- Нічне крило (спільний генератор із 2-м поверхом) ----
  const nw = buildNightWing(b, hasOffice, hasCloset, '')
  const rooms: RoomZone[] = [...nw.rooms]
  let z = nw.endZ
  const corridorTop = nw.corridorTop

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

  // ---- 2-й поверх (без кухні-вітальні) ----
  if (twoFloors) {
    const f2 = buildFloor2(config)
    // Прив'язка до СХОДІВ: посуваємо весь 2-й поверх по Z так, щоб його сходи
    // стали рівно під сходами 1-го (різниця довжин нічних крил). Заодно збігається
    // фасад. Генерація 2-го — компактна й незмінна; рухаємо лише позицію.
    const zOffset = nightLen - (f2.length - DAY_DEPTH)
    const shiftF2 = <T extends { x: number; z: number }>(o: T): T => ({ ...o, x: o.x - cx, z: o.z + zOffset - cz })
    const f2rooms = f2.rooms.map(shiftF2)

    // Тераса на даху 1-го поверху — за майстром, у «хвіст» до заднього краю 1-го.
    // Розмір = різниця основ (zOffset). Доступна лише коли ця різниця > 0.
    const hasTerrace = config.extras2.includes('terrace') && zOffset > 0.01
    if (hasTerrace) {
      f2rooms.push(shift(rect('f2-terrace', 'terrace', 0, 0, NIGHT_W, zOffset)))
    }
    // Плита 2-го: компактна; з терасою — на всю глибину лівого стовпця 1-го.
    const backZ = hasTerrace ? 0 : zOffset
    const frontZ = nightLen + DAY_DEPTH
    const f2slab: PlanRect[] = [
      shift({ x: NIGHT_W / 2, z: (backZ + frontZ) / 2, width: NIGHT_W, depth: frontZ - backZ }),
    ]
    floors.push({ floor: 2, rooms: f2rooms, slab: f2slab })
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

// 2-й поверх Г-подібного = дублікат лівого стовпця 1-го поверху (без кухні-вітальні),
// на всю висоту 1-го (nightLen1 + денне крило). Сходи — ЯКІР: та сама позиція, що й
// на 1-му. Нічне крило (над сходами) заповнюють спальні (їхня кількість — своя);
// крайня зверху стає майстром при 2+ спальнях у крилі (тобто 3+ всього). Денне крило
// внизу: горизонтальний коридор + санвузол (дубль 1:1) + одна ОБОВ'ЯЗКОВА спальня
// замість прихожої+гардеробної. Ліміт спалень: 1-й поверх + 1 (щоб не звисало).
function buildFloor2(config: HouseConfig): { rooms: RoomZone[]; length: number } {
  // Нічне крило 2-го поверху — ТОЧНА копія 1-го (спальні/гардероб/кабінет/ensuite
  // майстра, ті самі id-з-префіксом → ті самі анімації). КОМПАКТНО: усе за власним
  // вмістом, без прив'язки висоти до 1-го (2-й поверх може бути меншим).
  const b2 = Math.min(Math.max(1, config.bedrooms2), floor2Limits(config).maxBedrooms)
  const hasOffice2 = config.extras2.includes('office')
  const hasCloset2 = config.extras2.includes('wardrobe')
  const nw = buildNightWing(b2, hasOffice2, hasCloset2, 'f2-')
  const rooms: RoomZone[] = [...nw.rooms]
  let z = nw.endZ

  // Сходи — одразу під нічним крилом (як на 1-му); коли поверхи однакові — збігаються
  rooms.push(rect('f2-stairs', 'stairs', CORRIDOR_W, z, STAIR_W, STAIR_LEN))
  z += STAIR_LEN
  const nightLen2 = z
  // Коридор — уздовж крила до денного крила (як на 1-му), той самий lazyStretch.
  // growEase — на 2-му поверсі коридор РОЗТЯГУЄТЬСЯ ПОВІЛЬНІШЕ (більше відстає від
  // майстра, що рухається), тож не «насідає» при додаванні спальні. Стягування —
  // як є (швидке через lazyStretch). На 2-му помітніше через зсув поверху за сходами.
  rooms.push({ ...rect('f2-corridor-v', 'corridor', 0, nw.corridorTop, CORRIDOR_W, nightLen2 - nw.corridorTop), lazyStretch: true, growEase: LSHAPE_SLOW_GROW })

  // ---- Денне крило (без кухні): горизонтальний коридор + санвузол(дубль) + спальня ----
  const bz = nightLen2 + HCORR_LEN
  const dayRest = DAY_DEPTH - HCORR_LEN
  rooms.push(rect('f2-corridor-h', 'corridor', 0, nightLen2, NIGHT_W, HCORR_LEN))
  rooms.push(rect('f2-bath-day', 'bathroom', 0, bz, SERVICE_W, BATH_LEN)) // санвузол дубль 1:1
  // Обов'язкова спальня замість прихожої+гардеробної (Г-подібна навколо санвузла)
  rooms.push({ ...rect('f2-entry-bed-a', 'bedroom', SERVICE_W, bz, NIGHT_W - SERVICE_W, dayRest), group: 'f2-entry-bed' })
  rooms.push({ ...rect('f2-entry-bed-b', 'bedroom', 0, bz + BATH_LEN, SERVICE_W, dayRest - BATH_LEN), group: 'f2-entry-bed' })

  return { rooms, length: nightLen2 + DAY_DEPTH }
}
