import type { HouseConfig, Wing } from '../config/types'
import { SHAPE_SPECS, WALL_HEIGHT } from '../config/shapes'
import { calculateTargetArea } from './area'

// Чиста функція: конфігурація -> список «крил» (прямокутних блоків).
// 3D-компоненти працюють тільки з крилами і не знають про форми.
//
// Форма задає ПРОПОРЦІЇ будинку (SHAPE_SPECS), а кімнати — ПЛОЩУ:
// блоки форми рівномірно масштабуються так, щоб сумарна площа
// дорівнювала calculateTargetArea(config).
export function buildFootprint(config: HouseConfig): Wing[] {
  if (!config.shape) return []

  const blocks = SHAPE_SPECS[config.shape].blocks
  const baseArea = blocks.reduce((sum, b) => sum + b.width * b.depth, 0)
  const k = Math.sqrt(calculateTargetArea(config) / baseArea)

  return blocks.map((b) => ({
    x: b.x * k,
    z: b.z * k,
    width: b.width * k,
    depth: b.depth * k,
    wallHeight: WALL_HEIGHT,
  }))
}
