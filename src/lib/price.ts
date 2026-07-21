import type { HouseConfig } from '../config/types'
import type { PriceConfig } from '../config/pricing'
import { generateHousePlan } from './floorplan'

// Чистий розрахунок ціни: конфігурація + прайс -> кошторис.
// ЗАРАЗ НЕ ПОКАЗУЄТЬСЯ В UI — чекає на реальні ціни (див. config/pricing.ts).

export type BudgetStatus = 'within' | 'over' | 'incomplete'

export interface PriceEstimate {
  total: number
  areaM2: number
  budgetStatus: BudgetStatus
  overBy: number // на скільки перевищено бюджет (0, якщо не перевищено)
}

export function calculatePrice(config: HouseConfig, prices: PriceConfig): PriceEstimate {
  if (!config.shape) {
    return { total: 0, areaM2: 0, budgetStatus: 'incomplete', overBy: 0 }
  }

  const areaM2 = generateHousePlan(config).totalArea

  const base = areaM2 * prices.basePricePerM2
  const total = Math.round(base * prices.shapeMultiplier[config.shape])

  const over = total - config.budget
  return {
    total,
    areaM2,
    budgetStatus: over > 0 ? 'over' : 'within',
    overBy: Math.max(over, 0),
  }
}
