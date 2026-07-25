import type { RoomType } from './types'

// Кольори зон на плані (пастельні, добре розрізняються).
// Самі планування — у config/layouts.ts.
export const ROOM_COLORS: Record<RoomType, string> = {
  livingKitchen: '#f2c23e',
  living: '#f2c23e',
  kitchen: '#ee8534',
  hall: '#d3c4ac',
  corridor: '#c2baa8',
  bedroom: '#6ba6e0',
  bathroom: '#4bc6b8',
  office: '#a482e0',
  wardrobe: '#e293c0',
  pantry: '#a8cd6f',
  stairs: '#847d70',
  terrace: '#d8c39a',
  storage: '#c9a9bd',
}
