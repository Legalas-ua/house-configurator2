import type { ConfigKey, HouseConfig } from './types'
import { CONSTRUCTION_TYPES, SHAPES_BY_CONSTRUCTION } from './availability'

// ============================================================
// Data-driven майстер кроків.
// Новий крок = новий запис у STEPS + тексти в locales/uk.ts.
// Компоненти UI нічого не знають про конкретні кроки.
// ============================================================

export type StepId = 'budget' | 'constructionType' | 'shape'

export interface StepDef {
  id: StepId
  kind: 'slider' | 'cards' // майбутнє: 'toggle', 'form'…
  configKey: ConfigKey
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
    slider: { min: 500_000, max: 10_000_000, step: 50_000 },
    isComplete: () => true, // бюджет завжди має значення
  },
  {
    id: 'constructionType',
    kind: 'cards',
    configKey: 'constructionType',
    getOptions: () => CONSTRUCTION_TYPES,
    isComplete: (c) => c.constructionType !== null,
  },
  {
    id: 'shape',
    kind: 'cards',
    configKey: 'shape',
    getOptions: (c) =>
      c.constructionType ? SHAPES_BY_CONSTRUCTION[c.constructionType] : [],
    isComplete: (c) => c.shape !== null,
  },
]

export const DEFAULT_CONFIG: HouseConfig = {
  budget: 2_500_000,
  constructionType: null,
  shape: null,
}
