import type { ConfigKey, HouseConfig } from './types'
import { ALL_SHAPES, ROOF_TYPES, WINDOW_TYPES } from './availability'

// ============================================================
// Data-driven майстер кроків.
// Новий крок = новий запис у STEPS + тексти в locales/uk.ts.
// Компоненти UI нічого не знають про конкретні кроки.
// show3D визначає, чи видно 3D-вьюпорт на цьому кроці.
// ============================================================

export type StepId =
  | 'budget'
  | 'constructionType'
  | 'shape'
  | 'rooms'
  | 'windows'
  | 'roofZones'
  | 'roof'
  | 'facade'
  | 'roofMat'
  | 'terrace'
  | 'terraceMat'
  | 'interior'

export interface StepDef {
  id: StepId
  kind: 'slider' | 'cards' | 'rooms' | 'windows' | 'roofZones' | 'roof' | 'facade' | 'roofMat' | 'terrace' | 'terraceMat' | 'interior'
  configKey?: ConfigKey // композитні кроки (rooms) працюють з кількома ключами
  show3D: boolean
  slider?: { min: number; max: number; step: number }
  // Опції кроку можуть залежати від попередніх виборів —
  // тому це функція від поточної конфігурації.
  getOptions?: (config: HouseConfig) => string[]
  isComplete: (config: HouseConfig) => boolean
}

export const STEPS: StepDef[] = [
  {
    id: 'budget',
    kind: 'slider',
    configKey: 'budget',
    show3D: false,
    slider: { min: 500_000, max: 10_000_000, step: 100_000 },
    isComplete: () => true, // бюджет завжди має значення
  },
  {
    id: 'shape',
    kind: 'cards',
    configKey: 'shape',
    show3D: true,
    getOptions: () => ALL_SHAPES,
    isComplete: (c) => c.shape !== null,
  },
  {
    id: 'rooms',
    kind: 'rooms',
    show3D: true,
    isComplete: () => true,
  },
  {
    id: 'windows',
    kind: 'windows',
    configKey: 'windows',
    show3D: true,
    getOptions: () => WINDOW_TYPES,
    isComplete: (c) => c.windows !== null,
  },
  {
    // Спершу МАЛЮЄМО зони даху (плоскі площини на покритті), і лише на
    // наступному кроці дах виростає в об'ємі та налаштовується. Об'ємний дах
    // перекривав би ручки зон, і малювати було б нічим.
    id: 'roofZones',
    kind: 'roofZones',
    show3D: true,
    isComplete: () => true,
  },
  {
    id: 'roof',
    kind: 'roof',
    configKey: 'roof',
    show3D: true,
    getOptions: () => ROOF_TYPES,
    isComplete: (c) => c.roof !== null,
  },
  {
    // Оздоблення фасаду — окремо по поверхах. Живе НЕ в config, а у власному
    // зрізі стору (`facades`): це не одиничний вибір з переліку, а набір
    // параметрів на кожен поверх, тож configKey тут немає.
    id: 'facade',
    kind: 'facade',
    show3D: true,
    isComplete: () => true, // типовий фасад заданий одразу
  },
  {
    // Покрівля. Так само власний зріз стору: типовий матеріал + винятки на
    // окремі зони даху, які обирають кліком у 3D — як на кроці «Дах».
    id: 'roofMat',
    kind: 'roofMat',
    show3D: true,
    isComplete: () => true,
  },
  {
    // Тераса 1-го поверху — зони на землі, поза контуром будинку.
    id: 'terrace',
    kind: 'terrace',
    show3D: true,
    isComplete: () => true, // тераса не обов'язкова
  },
  {
    // Покриття тераси — окремо для землі й для тераси 2-го поверху.
    id: 'terraceMat',
    kind: 'terraceMat',
    show3D: true,
    isComplete: () => true,
  },
  {
    // Інтер'єр: поки що підлога по кімнатах. Далі сюди ляжуть двері, сходи
    // й опорядження стін.
    id: 'interior',
    kind: 'interior',
    show3D: true,
    isComplete: () => true,
  },
]

export const DEFAULT_CONFIG: HouseConfig = {
  budget: 2_500_000,
  constructionType: null,
  shape: null,
  floors: 1,
  bedrooms: 2,
  bathrooms: 1,
  kitchenType: 'open', // вибір кухні прибрано — завжди кухня-вітальня
  extras: [],
  bedrooms2: 1,
  extras2: [],
  windows: null,
  roof: null,
}
