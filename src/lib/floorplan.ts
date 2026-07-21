import type {
  ExtraRoom,
  FloorPlan,
  HouseConfig,
  HousePlan,
  PlanRect,
  RoomType,
  RoomZone,
} from '../config/types'
import { findTemplate, LAYOUTS, type LayoutTemplate } from '../config/layouts'

// ============================================================
// Парсер каталогу планувань: текстова сітка -> зони кімнат.
// 1 символ = 1×1 м. Однакові символи = одна кімната (прямокутник).
// План завжди центрується відносно (0,0) — будинок по центру ділянки.
// ============================================================

const CHAR_TYPE: Record<string, RoomType> = {
  H: 'hall',
  L: 'living', // або livingKitchen — вирішується конфігурацією
  K: 'kitchen',
  C: 'corridor',
  R: 'stairs',
  S: 'bathroom',
  T: 'bathroom',
  U: 'bathroom',
  O: 'office',
  W: 'wardrobe',
  P: 'pantry',
  E: 'terrace',
  '1': 'bedroom',
  '2': 'bedroom',
  '3': 'bedroom',
  '4': 'bedroom',
  '5': 'bedroom',
}

const CHAR_EXTRA: Record<string, ExtraRoom> = {
  O: 'office',
  W: 'wardrobe',
  P: 'pantry',
}

// Перемикачі конфігурації = перейменування символів ДО парсингу:
// невибрана опційна кімната віддає клітинки за fallbacks,
// кухня-вітальня вливає K у L.
function applyToggles(rows: string[], config: HouseConfig, template: LayoutTemplate): string[] {
  let result = rows
  const replace = (from: string, to: string) =>
    (result = result.map((row) => row.split(from).join(to)))

  for (const [ch, target] of Object.entries(template.fallbacks)) {
    const extra = CHAR_EXTRA[ch]
    if (extra && !config.extras.includes(extra)) replace(ch, target)
  }
  if (config.kitchenType !== 'separate') replace('K', 'L')
  return result
}

interface BBox {
  minR: number
  maxR: number
  minC: number
  maxC: number
  count: number
}

function parseFloor(
  rows: string[],
  floorNum: number,
  cx: number,
  cz: number,
  livingType: RoomType,
): FloorPlan {
  // Обмежувальні прямокутники кожного символу
  const boxes = new Map<string, BBox>()
  rows.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch === '.') return
      const b = boxes.get(ch)
      if (!b) {
        boxes.set(ch, { minR: r, maxR: r, minC: c, maxC: c, count: 1 })
      } else {
        b.minR = Math.min(b.minR, r)
        b.maxR = Math.max(b.maxR, r)
        b.minC = Math.min(b.minC, c)
        b.maxC = Math.max(b.maxC, c)
        b.count++
      }
    })
  })

  const rooms: RoomZone[] = []
  for (const [ch, b] of boxes) {
    const width = b.maxC - b.minC + 1
    const depth = b.maxR - b.minR + 1
    if (import.meta.env.DEV && b.count !== width * depth) {
      console.warn(`[layouts] кімната '${ch}' на поверсі ${floorNum} не прямокутна`)
    }
    const type = ch === 'L' ? livingType : CHAR_TYPE[ch]
    if (!type) {
      if (import.meta.env.DEV) console.warn(`[layouts] невідомий символ '${ch}'`)
      continue
    }
    rooms.push({
      type,
      x: (b.minC + b.maxC + 1) / 2 - cx,
      z: (b.minR + b.maxR + 1) / 2 - cz,
      width,
      depth,
    })
  }

  // Плита поверху: зайняті клітинки -> горизонтальні смуги -> злиття по вертикалі
  const strips: { r0: number; r1: number; c0: number; c1: number }[] = []
  rows.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (row[c] === '.') {
        c++
        continue
      }
      let end = c
      while (end + 1 < row.length && row[end + 1] !== '.') end++
      const prev = strips.find((s) => s.r1 === r - 1 && s.c0 === c && s.c1 === end)
      if (prev) prev.r1 = r
      else strips.push({ r0: r, r1: r, c0: c, c1: end })
      c = end + 1
    }
  })
  const slab: PlanRect[] = strips.map((s) => ({
    x: (s.c0 + s.c1 + 1) / 2 - cx,
    z: (s.r0 + s.r1 + 1) / 2 - cz,
    width: s.c1 - s.c0 + 1,
    depth: s.r1 - s.r0 + 1,
  }))

  return { floor: floorNum, rooms, slab }
}

export function generateHousePlan(config: HouseConfig): HousePlan {
  if (!config.shape) return { floors: [], totalArea: 0 }

  const template = findTemplate(config.shape, config.floors, config.bedrooms)
  if (!template) return { floors: [], totalArea: 0 }

  // Центр зайнятої області 1-го поверху -> (0,0); однаковий зсув
  // для всіх поверхів (контур у них спільний)
  const rows0 = template.grid[0]
  let minR = Infinity,
    maxR = -Infinity,
    minC = Infinity,
    maxC = -Infinity
  rows0.forEach((row, r) => {
    ;[...row].forEach((ch, c) => {
      if (ch === '.') return
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      minC = Math.min(minC, c)
      maxC = Math.max(maxC, c)
    })
  })
  const cx = (minC + maxC + 1) / 2
  const cz = (minR + maxR + 1) / 2

  const livingType: RoomType = config.kitchenType === 'separate' ? 'living' : 'livingKitchen'

  const floors = template.grid
    .slice(0, config.floors)
    .map((rows, i) => parseFloor(applyToggles(rows, config, template), i + 1, cx, cz, livingType))

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

// ---- Dev-валідація всього каталогу (ловить помилки в сітках) ----

function validateLayouts() {
  for (const t of LAYOUTS) {
    for (const [f, rows] of t.grid.entries()) {
      const widths = new Set(rows.map((r) => r.length))
      if (widths.size !== 1)
        console.warn(`[layouts] ${t.id}: рядки поверху ${f + 1} різної довжини`)
    }
    if (t.grid.length === 2) {
      const [a, b] = t.grid
      const contour = (rows: string[]) => rows.map((r) => [...r].map((c) => (c === '.' ? '.' : '#')).join(''))
      if (contour(a).join('\n') !== contour(b).join('\n'))
        console.warn(`[layouts] ${t.id}: контури поверхів різні`)
      const stairs = (rows: string[]) =>
        rows.map((r) => [...r].map((c) => (c === 'R' ? 'R' : '.')).join('')).join('\n')
      if (stairs(a) !== stairs(b)) console.warn(`[layouts] ${t.id}: сходи не збігаються`)
    }
  }
}

if (import.meta.env.DEV) validateLayouts()
