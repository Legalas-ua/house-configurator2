import type { RoofMatKind, RoofMatSpec } from './types'

// Дані кроку «Матеріали даху». Розкладка елементів — у lib/roofSkin.ts.

// Покриття СКАТНОГО даху.
export const ROOF_MAT_KINDS: RoofMatKind[] = ['clayTile', 'metalTile', 'seam', 'shingle', 'corrugated']
// Покриття ПЛОСКОГО. Насправді типових усього два: наплавлювана бітумна
// рулонна покрівля і полімерна мембрана (ПВХ/ТПУ) — решта екзотика.
export const FLAT_MAT_KINDS: RoofMatKind[] = ['builtUp', 'membrane']

export const ROOF_SWATCHES: Record<RoofMatKind, string[]> = {
  clayTile: ['#a5533a', '#7d4534', '#8a8f8c'],
  metalTile: ['#6b4a3a', '#3f4a52', '#2f3336'],
  seam: ['#3f4a52', '#8c9298', '#26292c'],
  shingle: ['#3a3f42', '#5a4636', '#2b6146'],
  corrugated: ['#7d8a90', '#3f4a52', '#8b3f36'],
  // Плоскі — по чотири базові кольори, як просив замовник.
  builtUp: ['#3c3a37', '#5a5751', '#7a6a55', '#2b2a28'],
  membrane: ['#d8d5cd', '#8f9aa0', '#5b6b62', '#3a3d40'],
}

// Торцева планка скатного даху й кожух парапету — той самий фарбований метал.
// Останній — теракота під керамічну черепицю.
export const TRIM_SWATCHES = ['#3f4a52', '#8c9298', '#2f3336', '#9c5136']
export const DEFAULT_TRIM_COLOR = '#3f4a52'

export const DEFAULT_ROOF_MAT: RoofMatSpec = { kind: 'metalTile', color: '#3f4a52', trim: DEFAULT_TRIM_COLOR }
export const DEFAULT_FLAT_MAT: RoofMatSpec = { kind: 'membrane', color: '#8f9aa0', trim: DEFAULT_TRIM_COLOR }
