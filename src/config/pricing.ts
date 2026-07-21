import type { HouseShape } from './types'

// ============================================================
// УВАГА: усі числа тут — ТЕСТОВІ ЗАГЛУШКИ, не реальні ціни!
// Коли з'являться реальні дані (прайс компанії або зовнішнє
// джерело цін на матеріали/роботи), достатньо замінити значення
// або реалізувати інший PriceSource — решта коду не зміниться.
// ============================================================

export interface PriceConfig {
  currency: 'UAH'
  basePricePerM2: number // усереднена ставка, грн за м² площі будинку
  shapeMultiplier: Record<HouseShape, number> // складніша форма = дорожче
  // Коли повернеться крок вибору конструкції — ставка знову стане
  // Record<ConstructionType, number> (каркас ~18k, модуль ~15k, цегла ~26k).
  // майбутнє: roofPricePerM2, windowSurcharge, foundationPerM2…
}

export const PLACEHOLDER_PRICES: PriceConfig = {
  currency: 'UAH',
  basePricePerM2: 20_000,
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
