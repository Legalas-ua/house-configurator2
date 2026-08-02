import type { InteriorKind, InteriorSpec } from './types'

// Дані кроку «Інтер'єр». Розкладка — у lib/interiorSkin.ts.

export const INTERIOR_KINDS: InteriorKind[] = ['board', 'tile', 'stone', 'carpet']

export const BOARD_WIDTH = { min: 0.09, max: 0.3, step: 0.01 }
export const FLOOR_TILE = { min: 0.2, max: 1.2, step: 0.1 }
export const FLOOR_JOINT = { min: 0.001, max: 0.008, step: 0.001 }

export const INTERIOR_SWATCHES: Record<InteriorKind, string[]> = {
  board: ['#c2a074', '#8a6642', '#d9cbb6', '#5d4a3a'],
  tile: ['#d9d5cd', '#8d8b86', '#3f4245', '#b8a894'],
  stone: ['#c9c3b6', '#8f8a80', '#5c5954', '#a8a49b'],
  carpet: ['#9aa39a', '#7c7b86', '#c4b6a4', '#4a4f55'],
}

// Кімнати, яким підлога інтер'єру не потрібна: тераса має власний крок.
export const NO_INTERIOR = ['terrace']

export const DEFAULT_INTERIOR: InteriorSpec = {
  kind: 'board',
  color: '#c2a074',
  boardWidth: 0.18,
  dir: 'x',
  tile: 0.6,
  joint: 0.003,
}
