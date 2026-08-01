import type { RoofMatKind, RoofMatSpec } from './types'

// Дані кроку «Матеріали даху». Розкладка елементів — у lib/roofSkin.ts.

export const ROOF_MAT_KINDS: RoofMatKind[] = ['clayTile', 'metalTile', 'seam', 'shingle', 'corrugated']

export const ROOF_SWATCHES: Record<RoofMatKind, [string, string, string]> = {
  clayTile: ['#a5533a', '#7d4534', '#8a8f8c'],
  metalTile: ['#6b4a3a', '#3f4a52', '#2f3336'],
  seam: ['#3f4a52', '#8c9298', '#26292c'],
  shingle: ['#3a3f42', '#5a4636', '#2b6146'],
  corrugated: ['#7d8a90', '#3f4a52', '#8b3f36'],
}

export const DEFAULT_ROOF_MAT: RoofMatSpec = { kind: 'metalTile', color: '#3f4a52' }
