import type { HouseConfig, Wing } from '../config/types'
import { SHAPE_SPECS, WALL_HEIGHT } from '../config/shapes'

// Чиста функція: конфігурація -> список «крил» (прямокутних блоків).
// 3D-компоненти працюють тільки з крилами і не знають про форми.
export function buildFootprint(config: HouseConfig): Wing[] {
  if (!config.shape) return []
  return SHAPE_SPECS[config.shape].blocks.map((b) => ({
    ...b,
    wallHeight: WALL_HEIGHT,
  }))
}
