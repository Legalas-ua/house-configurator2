import type { TerraceMatKind, TerraceMatSpec } from './types'

// Дані кроку «Покриття тераси». Розкладка — у lib/terraceSkin.ts.
//
// Три найходовіші покриття відкритої тераси. У кожного свій набір параметрів:
// у дошки — ширина й зазор (він там обов'язковий, дерево «дихає»), у плити на
// опорах — формат і шов, у каменю — формат і шов ширший.

export const TERRACE_MAT_KINDS: TerraceMatKind[] = ['decking', 'porcelain', 'stone']

export const DECK_WIDTH = { min: 0.09, max: 0.2, step: 0.01 }
export const DECK_GAP = { min: 0.003, max: 0.012, step: 0.001 }
export const TILE_SIZE = { min: 0.3, max: 1.2, step: 0.1 }
export const TILE_JOINT = { min: 0.003, max: 0.02, step: 0.001 }

export const TERRACE_SWATCHES: Record<TerraceMatKind, string[]> = {
  decking: ['#8a5a34', '#6a4a2e', '#4a4844', '#a8814f'],
  porcelain: ['#8d8b86', '#d9d5cd', '#4b4f52', '#a89c8c'],
  stone: ['#9a9186', '#7c8177', '#b7ac9a', '#5c5954'],
}

export const DEFAULT_TERRACE_MAT: TerraceMatSpec = {
  kind: 'decking',
  color: '#8a5a34',
  boardWidth: 0.14,
  gap: 0.006,
  dir: 'x',
  tile: 0.6,
  joint: 0.006,
}
