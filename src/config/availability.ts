import type { ConstructionType, HouseShape } from './types'

// Матриця залежностей: які форми доступні для якого типу конструкції.
// Це ПРОСТО ДАНІ — редагуй список, і UI та 3D підлаштуються самі.
export const ALL_SHAPES: HouseShape[] = ['rect', 'square', 'l-shape']

// Тип конструкції поки прибраний з майстра (рішення від 21.07.2026:
// це питання вирішується з архітектором пізніше). Дані лишаємо —
// крок легко повернути, додавши його назад у STEPS.
export const CONSTRUCTION_TYPES: ConstructionType[] = ['frame', 'modular', 'brick']

export const SHAPES_BY_CONSTRUCTION: Record<ConstructionType, HouseShape[]> = {
  frame: ['rect', 'square', 'l-shape'],
  modular: ['rect', 'square'], // модульна технологія — обмежені форми
  brick: ['rect', 'square', 'l-shape'],
}
