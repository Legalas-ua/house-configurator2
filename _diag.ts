import { generateHousePlan } from './src/lib/floorplan'
import { generateRoof, roofWindowClashes, validateRoof, roofLevels } from './src/lib/roof'
import { generateWindows, resolveWindows } from './src/lib/windows'
import { DEFAULT_CONFIG } from './src/config/steps'
import { availableBedrooms, floorsAvailable } from './src/config/layouts'

for (const shape of ['rect', 'square', 'l-shape'] as const)
  for (const floors of floorsAvailable(shape))
    for (const bedrooms of availableBedrooms(shape, floors))
      for (const roof of ['flat', 'pitched', null] as const) {
        const config = { ...DEFAULT_CONFIG, shape, floors, bedrooms, windows: 'standard' as const, roof }
        try {
          const plan = generateHousePlan(config as never)
          if (plan.floors.length === 0) continue
          const parts = generateRoof(plan, roof === 'pitched' ? 'gable' : 'flat')
          const specs = generateWindows(plan, config as never)
          const res = resolveWindows(plan, specs, 3.2)
          roofWindowClashes(plan, parts, res.map((w) => ({ id: w.id, floor: w.floor, sill: w.sill, horizontal: w.horizontal, line: w.line, a: w.a, b: w.b })))
          validateRoof(plan, parts, false)
          roofLevels(plan, false)
        } catch (e) {
          console.log(`ПАДІННЯ ${shape}/${floors}/${bedrooms}/${roof}:`, (e as Error).message)
        }
      }
console.log('крок «Дах»: чисті виклики пройшли')
