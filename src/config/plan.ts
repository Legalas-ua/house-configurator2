import type { HouseShape, RoomType } from './types'

// ============================================================
// Дані для генератора поверхового плану. Тільки числа й кольори.
//
// Схема плану — «смуги» (band layout), перевірена планувальна логіка:
//   [денна зона: прихожа, вітальня, кухня]  — вікна на фасад
//   [коридор]                               — з'єднує всі кімнати
//   [нічна зона: спальні, санвузли, ...]    — вікна на тихий бік
// Кожна кімната відкривається у коридор або вітальню —
// «замурованих» кімнат не буває за побудовою.
// ============================================================

// Глибини смуг (метри) для кожної форми: rect — ширший і мілкіший,
// square — глибший і вужчий (контур ближчий до квадрата).
export const SHAPE_BANDS: Record<HouseShape, { day: number; corridor: number; night: number }> = {
  rect: { day: 4.2, corridor: 1.4, night: 3.4 },
  square: { day: 5.4, corridor: 1.4, night: 4.4 },
  'l-shape': { day: 4.2, corridor: 1.4, night: 3.6 }, // night = ширина кімнат у крилі
}

// Цільові площі приміщень, м² (типові для приватних будинків)
export const ROOM_AREA: Record<Exclude<RoomType, 'corridor' | 'stairs' | 'terrace'>, number> = {
  hall: 5,
  living: 18,
  kitchen: 9,
  livingKitchen: 26,
  bedroom: 14,
  bathroom: 5,
  office: 10,
  wardrobe: 4.5,
  pantry: 3,
}

export const STAIRS_WIDTH = 1.3 // м, фіксована ширина сходової клітки

// Кольори зон на плані (пастельні, добре розрізняються)
export const ROOM_COLORS: Record<RoomType, string> = {
  livingKitchen: '#e8c15a',
  living: '#e8c15a',
  kitchen: '#e08d4e',
  hall: '#cbbfae',
  corridor: '#b8b2a6',
  bedroom: '#8fb8dd',
  bathroom: '#72c5bb',
  office: '#a996d6',
  wardrobe: '#d9a3c3',
  pantry: '#b3c98a',
  stairs: '#8a857c',
  terrace: '#d6c6a8',
}

// Наскільки максимум можна розтягнути кімнату понад цільову площу
// при вирівнюванні ширини рядів; залишок стає терасою.
export const STRETCH_CAP = 1.25
