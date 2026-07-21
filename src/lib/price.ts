import type { HouseConfig } from '../config/types'
import type { PriceConfig } from '../config/pricing'
import { buildFootprint } from './footprint'

// Чистий розрахунок ціни: конфігурація + прайс -> кошторис.
// Жодного стану, жодного UI — легко тестувати і замінювати.

export type BudgetStatus = 'within' | 'over' | 'incomplete'

export interface PriceEstimate {
  total: number
  areaM2: number
  budgetStatus: BudgetStatus
  overBy: number // на скільки перевищено бюджет (0, якщо не перевищено)
}

export function calculatePrice(config: HouseConfig, prices: PriceConfig): PriceEstimate {
  if (!config.constructionType || !config.shape) {
    return { total: 0, areaM2: 0, budgetStatus: 'incomplete', overBy: 0 }
  }

  // Площа = сума площ усіх крил
  const areaM2 = buildFootprint(config).reduce((sum, w) => sum + w.width * w.depth, 0)

  const base = areaM2 * prices.basePricePerM2[config.constructionType]
  const total = Math.round(base * prices.shapeMultiplier[config.shape])

  const over = total - config.budget
  return {
    total,
    areaM2,
    budgetStatus: over > 0 ? 'over' : 'within',
    overBy: Math.max(over, 0),
  }
}
