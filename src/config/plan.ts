import type { RoomType } from './types'

// Кольори зон на плані (пастельні, добре розрізняються).
// Самі планування — у config/layouts.ts.
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
