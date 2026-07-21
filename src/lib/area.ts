import type { HouseConfig } from '../config/types'
import { AREA_M2 } from '../config/rooms'

// Чиста функція: конфігурація -> орієнтовна площа будинку (м²).
// Це «цільова» площа, під яку масштабується 3D-модель (див. footprint.ts).
export function calculateTargetArea(config: HouseConfig): number {
  let area =
    AREA_M2.base +
    config.bedrooms * AREA_M2.bedroom +
    config.bathrooms * AREA_M2.bathroom

  if (config.kitchenType === 'separate') area += AREA_M2.separateKitchen

  for (const extra of config.extras) {
    area += AREA_M2.extras[extra]
  }

  return Math.round(area)
}
