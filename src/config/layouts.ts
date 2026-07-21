import type { ExtraRoom, Floors, HouseShape } from './types'

// ============================================================
// КАТАЛОГ ГОТОВИХ ПЛАНУВАНЬ.
//
// Кожен план — текстова сітка: 1 символ = 1×1 метр.
// Рядки йдуть від задньої стіни до фасаду (останній рядок = вхід).
//
//   H прихожа        L вітальня (при кухні-вітальні сюди вливається K)
//   K кухня окрема   C коридор        R сходи
//   1..5 спальня №n  S T U санвузли   E тераса/балкон
//   O кабінет        W гардеробна     P комора
//   . поза контуром будинку
//
// Правила: кожна кімната — суцільний прямокутник; контур усіх
// поверхів однаковий; сходи на однакових клітинках обох поверхів.
// fallbacks: куди віддати клітинки, якщо опційну кімнату не обрано
// (символ має бути сусідом по прямокутнику або 'E' — стане терасою).
//
// Додати планування = дописати об'єкт у LAYOUTS. Більше нічого.
// ============================================================

export interface LayoutTemplate {
  id: string
  shape: HouseShape
  floors: Floors
  bedrooms: number
  bathrooms: number // скільки санвузлів закладено в цей план
  extras: ExtraRoom[] // які додаткові кімнати підтримує план
  fallbacks: Record<string, string>
  grid: string[][] // grid[поверх] = рядки сітки
}

export const LAYOUTS: LayoutTemplate[] = [
  // ---------- Прямокутні, 1 поверх ----------
  {
    id: 'rect-1fl-1bed',
    shape: 'rect',
    floors: 1,
    bedrooms: 1,
    bathrooms: 1,
    extras: ['pantry'],
    fallbacks: { P: 'E' },
    grid: [
      [
        '1111SSPP',
        '1111SSPP',
        '1111SSPP',
        'CCCCCCCC',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
      ],
    ],
  },
  {
    id: 'rect-1fl-2bed',
    shape: 'rect',
    floors: 1,
    bedrooms: 2,
    bathrooms: 1,
    extras: ['office', 'pantry'],
    fallbacks: { O: 'E', P: 'K' },
    grid: [
      [
        '11112222SSOO',
        '11112222SSOO',
        '11112222SSOO',
        'CCCCCCCCCCCC',
        'HHLLLLLLKKPP',
        'HHLLLLLLKKPP',
        'HHLLLLLLKKPP',
      ],
    ],
  },
  {
    id: 'rect-1fl-3bed',
    shape: 'rect',
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    extras: ['wardrobe', 'pantry'],
    fallbacks: { W: 'T', P: 'S' },
    grid: [
      [
        '11112222TTWW',
        '11112222TTWW',
        '11112222SSPP',
        '11112222SSPP',
        'CCCCCCCCCCCC',
        '3333HHLLLLKK',
        '3333HHLLLLKK',
        '3333HHLLLLKK',
      ],
    ],
  },

  // ---------- Прямокутні, 2 поверхи ----------
  {
    id: 'rect-2fl-3bed',
    shape: 'rect',
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    extras: ['pantry', 'wardrobe'],
    fallbacks: { P: 'E', W: 'T' },
    grid: [
      [
        '1111SSPPRR',
        '1111SSPPRR',
        '1111SSPPRR',
        'CCCCCCCCCC',
        'HHLLLLLLKK',
        'HHLLLLLLKK',
        'HHLLLLLLKK',
      ],
      [
        '2222TTWWRR',
        '2222TTWWRR',
        '2222TTWWRR',
        'CCCCCCCCCC',
        '33333EEEEE',
        '33333EEEEE',
        '33333EEEEE',
      ],
    ],
  },
  {
    id: 'rect-2fl-4bed',
    shape: 'rect',
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    extras: ['pantry', 'wardrobe'],
    fallbacks: { P: 'E', W: 'T' },
    grid: [
      [
        '1111SSPPRR',
        '1111SSPPRR',
        '1111SSPPRR',
        'CCCCCCCCCC',
        'HHLLLLLLKK',
        'HHLLLLLLKK',
        'HHLLLLLLKK',
      ],
      [
        '2222TTWWRR',
        '2222TTWWRR',
        '2222TTWWRR',
        'CCCCCCCCCC',
        '3333344444',
        '3333344444',
        '3333344444',
      ],
    ],
  },
  {
    id: 'rect-2fl-5bed',
    shape: 'rect',
    floors: 2,
    bedrooms: 5,
    bathrooms: 3,
    extras: ['pantry', 'office'],
    fallbacks: { P: 'E', O: 'E' },
    grid: [
      [
        '1111SSPPOORR',
        '1111SSPPOORR',
        '1111SSPPOORR',
        'CCCCCCCCCCCC',
        'HHLLLLLLLLKK',
        'HHLLLLLLLLKK',
        'HHLLLLLLLLKK',
      ],
      [
        '22223333TTRR',
        '22223333TTRR',
        '22223333TTRR',
        'CCCCCCCCCCCC',
        '44445555UUEE',
        '44445555UUEE',
        '44445555UUEE',
      ],
    ],
  },

  // ---------- Квадратні, 1 поверх ----------
  {
    id: 'square-1fl-1bed',
    shape: 'square',
    floors: 1,
    bedrooms: 1,
    bathrooms: 1,
    extras: ['pantry'],
    fallbacks: { P: 'E' },
    grid: [
      [
        '1111SSPP',
        '1111SSPP',
        '1111SSPP',
        'CCCCCCCC',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
      ],
    ],
  },
  {
    id: 'square-1fl-2bed',
    shape: 'square',
    floors: 1,
    bedrooms: 2,
    bathrooms: 1,
    extras: ['office'],
    fallbacks: { O: 'H' },
    grid: [
      [
        '11112222SS',
        '11112222SS',
        '11112222SS',
        'CCCCCCCCCC',
        'HHLLLLLLKK',
        'HHLLLLLLKK',
        'HHLLLLLLKK',
        'OOLLLLLLKK',
        'OOLLLLLLKK',
      ],
    ],
  },
  {
    id: 'square-1fl-3bed',
    shape: 'square',
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        '11112222SS',
        '11112222SS',
        '11112222SS',
        'CCCCCCCCCC',
        '3333LLLLKK',
        '3333LLLLKK',
        '3333LLLLKK',
        'HHTTLLLLKK',
        'HHTTLLLLKK',
        'HHTTLLLLKK',
      ],
    ],
  },

  // ---------- Квадратні, 2 поверхи ----------
  {
    id: 'square-2fl-3bed',
    shape: 'square',
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        '1111SSRR',
        '1111SSRR',
        '1111SSRR',
        'CCCCCCCC',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
      ],
      [
        '2222TTRR',
        '2222TTRR',
        '2222TTRR',
        'CCCCCCCC',
        '3333EEEE',
        '3333EEEE',
        '3333EEEE',
        '3333EEEE',
      ],
    ],
  },
  {
    id: 'square-2fl-4bed',
    shape: 'square',
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        '1111SSRR',
        '1111SSRR',
        '1111SSRR',
        'CCCCCCCC',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
        'HHLLLLKK',
      ],
      [
        '2222TTRR',
        '2222TTRR',
        '2222TTRR',
        'CCCCCCCC',
        '33334444',
        '33334444',
        '33334444',
        '33334444',
      ],
    ],
  },

  // ---------- Г-подібні, 1 поверх ----------
  {
    id: 'l-1fl-2bed',
    shape: 'l-shape',
    floors: 1,
    bedrooms: 2,
    bathrooms: 1,
    extras: ['wardrobe'],
    fallbacks: { W: 'E' },
    grid: [
      [
        '1111CC.....',
        '1111CC.....',
        '1111CC.....',
        '2222CC.....',
        '2222CC.....',
        '2222CC.....',
        'WWSSCC.....',
        'WWSSCC.....',
        'HHLLLLLLKKK',
        'HHLLLLLLKKK',
        'HHLLLLLLKKK',
      ],
    ],
  },
  {
    id: 'l-1fl-3bed',
    shape: 'l-shape',
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        '1111CC......',
        '1111CC......',
        '1111CC......',
        '2222CC......',
        '2222CC......',
        '2222CC......',
        'TTSSCC......',
        'TTSSCC......',
        '3333HHLLLLKK',
        '3333HHLLLLKK',
        '3333HHLLLLKK',
      ],
    ],
  },

  // ---------- Г-подібні, 2 поверхи ----------
  {
    id: 'l-2fl-3bed',
    shape: 'l-shape',
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    extras: ['pantry', 'wardrobe'],
    fallbacks: { P: 'H', W: 'T' },
    grid: [
      [
        '1111CC.....',
        '1111CC.....',
        '1111CC.....',
        'SSRRCC.....',
        'SSRRCC.....',
        'PPRRCC.....',
        'PPRRCC.....',
        'HHLLLLLLKKK',
        'HHLLLLLLKKK',
        'HHLLLLLLKKK',
      ],
      [
        '2222CC.....',
        '2222CC.....',
        '2222CC.....',
        'TTRRCC.....',
        'TTRRCC.....',
        'WWRRCC.....',
        'WWRRCC.....',
        '3333EEEEEEE',
        '3333EEEEEEE',
        '3333EEEEEEE',
      ],
    ],
  },
  {
    id: 'l-2fl-4bed',
    shape: 'l-shape',
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    extras: ['pantry', 'wardrobe'],
    fallbacks: { P: 'H', W: 'T' },
    grid: [
      [
        '1111CC.....',
        '1111CC.....',
        '1111CC.....',
        'SSRRCC.....',
        'SSRRCC.....',
        'PPRRCC.....',
        'PPRRCC.....',
        'HHLLLLLLKKK',
        'HHLLLLLLKKK',
        'HHLLLLLLKKK',
      ],
      [
        '2222CC.....',
        '2222CC.....',
        '2222CC.....',
        'TTRRCC.....',
        'TTRRCC.....',
        'WWRRCC.....',
        'WWRRCC.....',
        '33334444EEE',
        '33334444EEE',
        '33334444EEE',
      ],
    ],
  },
]

// ---- Запити до каталогу ----

export function availableBedrooms(shape: HouseShape, floors: Floors): number[] {
  return LAYOUTS.filter((l) => l.shape === shape && l.floors === floors)
    .map((l) => l.bedrooms)
    .sort((a, b) => a - b)
}

export function findTemplate(
  shape: HouseShape,
  floors: Floors,
  bedrooms: number,
): LayoutTemplate | undefined {
  return LAYOUTS.find(
    (l) => l.shape === shape && l.floors === floors && l.bedrooms === bedrooms,
  )
}

export function nearestBedrooms(shape: HouseShape, floors: Floors, wanted: number): number {
  const options = availableBedrooms(shape, floors)
  return options.reduce((best, o) =>
    Math.abs(o - wanted) < Math.abs(best - wanted) ? o : best,
  )
}
