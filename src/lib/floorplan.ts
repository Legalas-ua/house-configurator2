import type {
  FloorPlan,
  HouseConfig,
  HousePlan,
  PlanRect,
  RoomType,
  RoomZone,
} from '../config/types'
import { ROOM_AREA, SHAPE_BANDS, STAIRS_WIDTH, STRETCH_CAP } from '../config/plan'

// ============================================================
// Чистий генератор поверхового плану: конфігурація -> зони кімнат.
//
// Схема — класичний котеджний план з центральним коридором:
//   [передній ряд: прихожа, вітальня/кухня + частина кімнат]
//   [коридор]
//   [задній ряд: спальні, санвузли, ... , сходи]
// Кожна кімната тримає СВОЮ цільову площу (config/plan.ts).
// Нова кімната додається у менш заповнений ряд — будинок
// прибудовується вшир, а існуючі кімнати не роздуваються.
// Кожна кімната відкривається у коридор або вітальню.
// При 2 поверхах сходи стоять в одному місці на обох поверхах.
// ============================================================

interface RoomSpec {
  type: RoomType
  area?: number // м² — ширина виводиться з глибини ряду
  fixedWidth?: number // сходи: фіксована ширина
}

// Кімнати, які мають бути у передньому ряді (фасад, вхід)
const FRONT_ONLY: RoomType[] = ['hall', 'living', 'livingKitchen', 'kitchen']

// ---- Розподіл кімнат по поверхах ----

function roomsForFloor(config: HouseConfig, floor: number): { front: RoomSpec[]; back: RoomSpec[] } {
  const front: RoomSpec[] = []
  const back: RoomSpec[] = []
  const twoFloors = config.floors === 2

  if (floor === 1) {
    front.push({ type: 'hall', area: ROOM_AREA.hall })
    if (config.kitchenType === 'separate') {
      front.push({ type: 'kitchen', area: ROOM_AREA.kitchen })
      front.push({ type: 'living', area: ROOM_AREA.living })
    } else {
      front.push({ type: 'livingKitchen', area: ROOM_AREA.livingKitchen })
    }
  }

  if (!twoFloors || floor === 2) {
    for (let i = 0; i < config.bedrooms; i++) back.push({ type: 'bedroom', area: ROOM_AREA.bedroom })
  }

  // Санвузли: на 1 поверсі завжди є один (гостьовий), решта — нагорі
  const bathroomsHere = !twoFloors
    ? config.bathrooms
    : floor === 1
      ? Math.min(1, config.bathrooms)
      : config.bathrooms - Math.min(1, config.bathrooms)
  for (let i = 0; i < bathroomsHere; i++) back.push({ type: 'bathroom', area: ROOM_AREA.bathroom })

  // Додаткові кімнати: кабінет і комора внизу, гардеробна біля спалень
  if (config.extras.includes('office') && (!twoFloors || floor === 1))
    back.push({ type: 'office', area: ROOM_AREA.office })
  if (config.extras.includes('wardrobe') && (!twoFloors || floor === 2))
    back.push({ type: 'wardrobe', area: ROOM_AREA.wardrobe })
  if (config.extras.includes('pantry') && (!twoFloors || floor === 1))
    back.push({ type: 'pantry', area: ROOM_AREA.pantry })

  if (twoFloors) back.push({ type: 'stairs', fixedWidth: STAIRS_WIDTH })

  return { front, back }
}

// ---- Балансування рядів ----

const widthOf = (r: RoomSpec, depth: number) => r.fixedWidth ?? r.area! / depth
const rowWidth = (row: RoomSpec[], depth: number) =>
  row.reduce((s, r) => s + widthOf(r, depth), 0)

// Переносимо «рухомі» кімнати між рядами, поки різниця ширин зменшується.
function balanceRows(front: RoomSpec[], back: RoomSpec[], dayD: number, nightD: number) {
  const movable = (r: RoomSpec) => !FRONT_ONLY.includes(r.type) && r.type !== 'stairs'

  for (let guard = 0; guard < 20; guard++) {
    const diff = rowWidth(back, nightD) - rowWidth(front, dayD)
    const [src, dst, srcD, dstD] =
      diff > 0
        ? ([back, front, nightD, dayD] as const)
        : ([front, back, dayD, nightD] as const)

    let bestIdx = -1
    let bestGain = 0.01
    src.forEach((r, i) => {
      if (!movable(r)) return
      const newDiff = Math.abs(Math.abs(diff) - widthOf(r, srcD) - widthOf(r, dstD))
      const gain = Math.abs(diff) - newDiff
      if (gain > bestGain) {
        bestGain = gain
        bestIdx = i
      }
    })

    if (bestIdx === -1) break
    dst.push(src.splice(bestIdx, 1)[0])
  }

  // Сходи — завжди останні у задньому ряді (правий край, однаково на поверхах)
  back.sort((a, b) => (a.type === 'stairs' ? 1 : 0) - (b.type === 'stairs' ? 1 : 0))
}

// ---- Розкладання ряду в зони ----

// Ряд правовирівняний до xRight; нефіксовані кімнати трохи розтягуються
// до W (не більше STRETCH_CAP), залишок ширини стає терасою зліва.
function layoutRow(row: RoomSpec[], W: number, xRight: number, z: number, depth: number): RoomZone[] {
  if (row.length === 0 || W <= 0) return []

  const fixedW = row.filter((r) => r.fixedWidth).reduce((s, r) => s + r.fixedWidth!, 0)
  const flexW = rowWidth(row, depth) - fixedW
  let k = flexW > 0 ? (W - fixedW) / flexW : 1
  let items = row
  if (k > STRETCH_CAP) {
    const fillerW = W - fixedW - flexW * STRETCH_CAP
    k = STRETCH_CAP
    if (fillerW > 0.4) items = [{ type: 'terrace', fixedWidth: fillerW }, ...row]
  }

  let x = xRight - W
  return items.map((r) => {
    const w = r.fixedWidth ?? widthOf(r, depth) * k
    const zone: RoomZone = { type: r.type, x: x + w / 2, z, width: w, depth }
    x += w
    return zone
  })
}

// ---- Прямокутний / квадратний план ----

function bandFloors(config: HouseConfig, floorNums: number[], bands: { day: number; corridor: number; night: number }): FloorPlan[] {
  const perFloor = floorNums.map((f) => {
    const { front, back } = roomsForFloor(config, f)
    balanceRows(front, back, bands.day, bands.night)
    const W = Math.max(rowWidth(front, bands.day), rowWidth(back, bands.night))
    return { floor: f, front, back, W }
  })

  // Спільний правий край: сходи на поверхах стають один над одним
  const Wg = Math.max(...perFloor.map((p) => p.W))
  const xRight = Wg / 2
  const D = bands.day + bands.corridor + bands.night

  const frontZ = D / 2 - bands.day / 2
  const corridorZ = D / 2 - bands.day - bands.corridor / 2
  const backZ = -D / 2 + bands.night / 2

  return perFloor.map(({ floor, front, back, W }) => {
    const rooms: RoomZone[] = [
      ...layoutRow(front, front.length ? W : 0, xRight, frontZ, bands.day),
      { type: 'corridor', x: xRight - W / 2, z: corridorZ, width: W, depth: bands.corridor },
      ...layoutRow(back, W, xRight, backZ, bands.night),
    ]
    const slab: PlanRect[] = [{ x: xRight - W / 2, z: 0, width: W, depth: D }]
    return { floor, rooms, slab }
  })
}

// ---- Г-подібний план: передній ряд + перпендикулярне крило ----

function lShapeFloors(config: HouseConfig, floorNums: number[], bands: { day: number; corridor: number; night: number }): FloorPlan[] {
  const wingW = bands.corridor + bands.night

  const perFloor = floorNums.map((f) => {
    const { front, back } = roomsForFloor(config, f)
    // У Г-подібному плані не балансуємо: передній ряд = денна зона,
    // крило = всі інші кімнати (стеком назад)
    return { floor: f, front, back }
  })

  const dayW = Math.max(...perFloor.map((p) => rowWidth(p.front, bands.day)), wingW + 1)
  const wingLen = Math.max(...perFloor.map((p) => rowWidth(p.back, bands.night)))

  return perFloor.map(({ floor, front, back }) => {
    const rooms: RoomZone[] = []
    const dayZ = 0
    const wingZ0 = dayZ - bands.day / 2

    if (front.length) {
      rooms.push(...layoutRow(front, dayW, dayW / 2, dayZ, bands.day))
    }

    // Вертикальний коридор — внутрішній бік крила
    const corridorX = -dayW / 2 + bands.night + bands.corridor / 2
    rooms.push({
      type: 'corridor',
      x: corridorX,
      z: wingZ0 - wingLen / 2,
      width: bands.corridor,
      depth: wingLen,
    })

    // Кімнати крила — зовнішній бік; сходи біля стику (першими)
    const ordered = [...back].sort(
      (a, b) => (a.type === 'stairs' ? 0 : 1) - (b.type === 'stairs' ? 0 : 1),
    )
    let z = wingZ0
    const roomX = -dayW / 2 + bands.night / 2
    for (const r of ordered) {
      const d = r.fixedWidth ?? r.area! / bands.night
      rooms.push({ type: r.type, x: roomX, z: z - d / 2, width: bands.night, depth: d })
      z -= d
    }
    // Якщо крило на цьому поверсі коротше за спільну довжину — залишок стає терасою
    const usedLen = wingZ0 - z
    if (wingLen - usedLen > 0.4) {
      const d = wingLen - usedLen
      rooms.push({ type: 'terrace', x: roomX, z: z - d / 2, width: bands.night, depth: d })
    }

    const wingSlab: PlanRect = {
      x: -dayW / 2 + wingW / 2,
      z: wingZ0 - wingLen / 2,
      width: wingW,
      depth: wingLen,
    }
    const slab: PlanRect[] =
      floor === 1
        ? [{ x: 0, z: dayZ, width: dayW, depth: bands.day }, wingSlab]
        : [wingSlab]

    return { floor, rooms, slab }
  })
}

// ---- Головна функція ----

export function generateHousePlan(config: HouseConfig): HousePlan {
  if (!config.shape) return { floors: [], totalArea: 0 }

  const bands = SHAPE_BANDS[config.shape]
  const floorNums = config.floors === 2 ? [1, 2] : [1]

  const floors =
    config.shape === 'l-shape'
      ? lShapeFloors(config, floorNums, bands)
      : bandFloors(config, floorNums, bands)

  // Тераса не входить у загальну (опалювану) площу будинку
  const totalArea = floors.reduce(
    (sum, fl) =>
      sum +
      fl.rooms
        .filter((r) => r.type !== 'terrace')
        .reduce((s, r) => s + r.width * r.depth, 0),
    0,
  )

  return { floors, totalArea: Math.round(totalArea) }
}
