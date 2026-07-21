import type { ExtraRoom } from './types'

// Діапазони лічильників кроку «Кімнати». Площі кімнат — у config/plan.ts.
export const ROOM_LIMITS = {
  bedrooms: { min: 1, max: 5 },
  bathrooms: { min: 1, max: 3 },
}

export const ALL_EXTRAS: ExtraRoom[] = ['office', 'wardrobe', 'pantry']
