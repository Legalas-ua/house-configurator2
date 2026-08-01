import type { FacadeKind, FacadeSpec } from './types'

// Дані кроку «Фасад»: перелік типів, межі параметрів і швидкі кольори.
// Малювання самої текстури — у scene/facadeMaterial.ts; тут ТІЛЬКИ числа.

export const FACADE_KINDS: FacadeKind[] = ['clinker', 'plaster', 'thermowood', 'panels']

// Межі — реальні розміри матеріалів, а не абстрактні повзунки.
export const PLANK_WIDTH = { min: 0.06, max: 0.25, step: 0.01 } // ширина планки
export const PLANK_THICKNESS = { min: 0.015, max: 0.045, step: 0.005 } // товщина
export const PLANK_GAP = { min: 0, max: 0.04, step: 0.005 } // зазор
export const PANEL_WIDTH = { min: 0.3, max: 1.5, step: 0.1 }
export const PANEL_HEIGHT = { min: 0.3, max: 3.0, step: 0.1 }

// Три швидкі комірки на тип — найходовіші кольори саме цього матеріалу.
// Повзунок кольору лишається довільним, це лише скорочення.
export const SWATCHES: Record<FacadeKind, [string, string, string]> = {
  clinker: ['#9c5f45', '#c9b49a', '#4a4340'],
  plaster: ['#ece7de', '#d5cec0', '#8f9695'],
  thermowood: ['#8a5a34', '#6a4a2e', '#463a30'],
  panels: ['#d9d3c6', '#6f7a73', '#33383b'],
}

// Стартовий фасад — рівно той вигляд, що був до появи кроку: світла штукатурка
// у колишньому WALL_COLOR. Тож перші шість кроків виглядають як і виглядали.
export const DEFAULT_FACADE: FacadeSpec = {
  kind: 'plaster',
  color: '#ece7de',
  plankWidth: 0.14,
  plankThickness: 0.02,
  plankGap: 0.015,
  plankDir: 'horizontal',
  panelShape: 'rect',
  panelWidth: 0.6,
  panelHeight: 1.2,
}
