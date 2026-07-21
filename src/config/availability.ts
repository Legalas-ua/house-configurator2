import type { ConstructionType, HouseShape } from './types'

// Матриця залежностей: які форми доступні для якого типу конструкції.
// Це ПРОСТО ДАНІ — редагуй список, і UI та 3D підлаштуються самі.
export const CONSTRUCTION_TYPES: ConstructionType[] = ['frame', 'modular', 'brick']

export const SHAPES_BY_CONSTRUCTION: Record<ConstructionType, HouseShape[]> = {
  frame: ['rect', 'square', 'l-shape'],
  modular: ['rect', 'square'], // модульна технологія — обмежені форми
  brick: ['rect', 'square', 'l-shape'],
}
