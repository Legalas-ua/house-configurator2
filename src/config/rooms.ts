import type { ExtraRoom } from './types'

// ============================================================
// Дані кроку «Кімнати»: діапазони лічильників і внесок кожної
// кімнати в орієнтовну площу будинку (м²). Тільки дані.
// ============================================================

export const ROOM_LIMITS = {
  bedrooms: { min: 1, max: 5 },
  bathrooms: { min: 1, max: 3 },
}

export const AREA_M2 = {
  // вітальня + кухонна зона + хол + технічне приміщення
  base: 45,
  bedroom: 14,
  bathroom: 5,
  separateKitchen: 5, // окрема кухня потребує додаткової площі
  extras: {
    office: 10,
    wardrobe: 4,
    pantry: 3,
  } satisfies Record<ExtraRoom, number>,
}

export const ALL_EXTRAS: ExtraRoom[] = ['office', 'wardrobe', 'pantry']
