import type { ConstructionType, HouseShape } from './types'

// ============================================================
// УВАГА: усі числа тут — ТЕСТОВІ ЗАГЛУШКИ, не реальні ціни!
// Коли з'являться реальні дані (прайс компанії або зовнішнє
// джерело цін на матеріали/роботи), достатньо замінити значення
// або реалізувати інший PriceSource — решта коду не зміниться.
// ============================================================

export interface PriceConfig {
  currency: 'UAH'
  basePricePerM2: Record<ConstructionType, number> // грн за м² площі будинку
  shapeMultiplier: Record<HouseShape, number> // складніша форма = дорожче
  // майбутнє: roofPricePerM2, windowSurcharge, foundationPerM2…
}

export const PLACEHOLDER_PRICES: PriceConfig = {
  currency: 'UAH',
  basePricePerM2: {
    frame: 18_000,
    modular: 15_000,
    brick: 26_000,
  },
  shapeMultiplier: {
    rect: 1,
    square: 1,
    'l-shape': 1.12,
  },
}

// «Шов» для майбутнього зовнішнього джерела цін (API, парсер тощо):
// реалізуй цей інтерфейс і підстав замість staticPriceSource.
export interface PriceSource {
  getPriceConfig(): Promise<PriceConfig>
}

export const staticPriceSource: PriceSource = {
  getPriceConfig: async () => PLACEHOLDER_PRICES,
}
