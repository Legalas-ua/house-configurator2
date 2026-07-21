import type { HouseShape } from './types'

// Габарити (в метрах) для кожної форми будинку. Просто дані.
export const WALL_HEIGHT = 3

export interface ShapeSpec {
  // Кожна форма = 1..N прямокутних блоків (x/z — центр блоку відносно центру будинку)
  blocks: { x: number; z: number; width: number; depth: number }[]
}

export const SHAPE_SPECS: Record<HouseShape, ShapeSpec> = {
  rect: {
    blocks: [{ x: 0, z: 0, width: 10, depth: 7 }],
  },
  square: {
    blocks: [{ x: 0, z: 0, width: 8, depth: 8 }],
  },
  'l-shape': {
    blocks: [
      { x: 0, z: -1.5, width: 10, depth: 6 }, // основний об'єм
      { x: -2.5, z: 4, width: 5, depth: 5 }, // прибудова, що утворює «Г»
    ],
  },
}
