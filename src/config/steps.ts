import type { ConfigKey, HouseConfig } from './types'
import { ALL_SHAPES } from './availability'

// ============================================================
// Data-driven майстер кроків.
// Новий крок = новий запис у STEPS + тексти в locales/uk.ts.
// Компоненти UI нічого не знають про конкретні кроки.
// show3D визначає, чи видно 3D-вьюпорт на цьому кроці.
// ============================================================

export type StepId = 'budget' | 'constructionType' | 'shape' | 'rooms'

export interface StepDef {
  id: StepId
  kind: 'slider' | 'cards' | 'rooms' // майбутнє: 'toggle', 'form'…
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
    isComplete: (c) => c.kitchenType !== null,
  },
]

export const DEFAULT_CONFIG: HouseConfig = {
  budget: 2_500_000,
  constructionType: null,
  shape: null,
  bedrooms: 2,
  bathrooms: 1,
  kitchenType: null,
  extras: [],
}
