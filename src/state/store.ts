import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  ConfigKey,
  ConfigValue,
  HouseConfig,
  HousePlan,
  PlanMode,
} from '../config/types'
import { DEFAULT_CONFIG, STEPS } from '../config/steps'
import {
  floorsAvailable,
  nearestBedrooms,
  planBathrooms,
  supportedExtras,
} from '../config/layouts'
import { generateHousePlan } from '../lib/floorplan'
import { floor2Limits } from '../lib/lshape'

// ============================================================
// Єдине джерело правди про стан конфігуратора (zustand).
//
// Ключовий механізм — sanitize(): після БУДЬ-ЯКОЇ зміни значення
// проходимо кроки по порядку і скидаємо в null ті вибори, що стали
// недоступними (наприклад, обрали Г-подібну форму, а потім змінили
// тип конструкції на модульний, де Г-подібної немає).
// Скидання каскадне: скинуте значення впливає на опції наступних кроків.
// ============================================================

function sanitize(config: HouseConfig): HouseConfig {
  const next = { ...config }
  for (const step of STEPS) {
    if (!step.getOptions || !step.configKey) continue
    const value = next[step.configKey]
    if (value !== null && !step.getOptions(next).includes(value as string)) {
      ;(next as Record<ConfigKey, ConfigValue>)[step.configKey] = null
    }
  }

  // Підганяємо вибір під доступні планування:
  // поверхи — до підтримуваних формою, спальні — до найближчого наявного,
  // санвузли — зі шаблону, додаткові кімнати — тільки підтримувані.
  if (next.shape) {
    const floorOpts = floorsAvailable(next.shape)
    if (!floorOpts.includes(next.floors)) next.floors = floorOpts[0]
    next.bedrooms = nearestBedrooms(next.shape, next.floors, next.bedrooms)
    next.bathrooms = planBathrooms(next.shape, next.floors, next.bedrooms)
    const allowed = supportedExtras(next.shape, next.floors, next.bedrooms)
    next.extras = next.extras.filter((e) => allowed.includes(e))

    // 2-й поверх (Г-подібний): не можна додати кімнат так, щоб його основа стала
    // більшою за 1-й. Клампимо спальні до ліміту, тоді прибираємо кабінет/гардероб,
    // якщо вони вже не вміщуються (напр. після зменшення 1-го поверху).
    const lim = floor2Limits(next)
    next.bedrooms2 = Math.min(Math.max(1, next.bedrooms2), lim.maxBedrooms)
    const lim2 = floor2Limits(next)
    next.extras2 = next.extras2.filter((e) =>
      e === 'office'
        ? lim2.canOffice
        : e === 'wardrobe'
          ? lim2.canWardrobe
          : e === 'terrace'
            ? lim2.canTerrace
            : false,
    )
  }
  return next
}

interface ConfiguratorState {
  started: boolean // false = стартовий екран
  config: HouseConfig
  // Режим плану. У 'custom' план лежить у customPlan і БІЛЬШЕ не перераховується
  // з конфігурації — інакше правки користувача затирались би на кожен setValue.
  planMode: PlanMode
  customPlan: HousePlan | null
  currentStep: number // індекс у STEPS
  maxStepReached: number // до якого кроку дійшов користувач (для 3D і навігації)
  topView: boolean // камера летить у вид зверху; обертання мишею вимикає
  viewFloor: number // який поверх РЕДАГУЄМО/активний (1 або 2)
  hideFloor2: boolean // сховати 2-й поверх у 3D (галочка на кроці «Кімнати»)
  hovered: { name: string; area: number; mx: number; my: number } | null // підказка кімнати
  start: () => void
  setValue: (key: ConfigKey, value: string | number | string[] | null) => void
  setPlanMode: (mode: PlanMode) => void
  setCustomPlan: (plan: HousePlan) => void
  setTopView: (on: boolean) => void
  setViewFloor: (floor: number) => void
  setHideFloor2: (on: boolean) => void
  setHovered: (h: ConfiguratorState['hovered']) => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
}

export const useConfigurator = create<ConfiguratorState>((set) => ({
  started: false,
  config: DEFAULT_CONFIG,
  planMode: 'template',
  customPlan: null,
  currentStep: 0,
  maxStepReached: 0,
  topView: false,
  viewFloor: 1,
  hideFloor2: false,
  hovered: null,

  start: () => set({ started: true }),

  setHovered: (h) => set({ hovered: h }),

  setValue: (key, value) =>
    set((s) => {
      const config = sanitize({ ...s.config, [key]: value })
      // Якщо будинок став одноповерховим — показуємо 1-й поверх
      return { config, viewFloor: Math.min(s.viewFloor, config.floors) }
    }),

  // Ручний режим НЕ починається з порожнечі: заморожуємо поточний обчислений
  // план як стартову точку. Повернення до шаблонів скидає ручні правки.
  setPlanMode: (mode) =>
    set((s) => {
      if (mode === s.planMode) return s
      if (mode === 'template') return { planMode: 'template', customPlan: null }
      return { planMode: 'custom', customPlan: s.customPlan ?? generateHousePlan(s.config) }
    }),

  setCustomPlan: (plan) => set({ planMode: 'custom', customPlan: plan }),

  setTopView: (on) => set({ topView: on }),
  setViewFloor: (floor) => set({ viewFloor: floor }),
  setHideFloor2: (on) => set({ hideFloor2: on }),

  nextStep: () =>
    set((s) => {
      if (!STEPS[s.currentStep].isComplete(s.config)) return s
      const next = Math.min(s.currentStep + 1, STEPS.length - 1)
      return { currentStep: next, maxStepReached: Math.max(s.maxStepReached, next) }
    }),

  // З першого кроку «Назад» повертає на стартовий екран
  prevStep: () =>
    set((s) =>
      s.currentStep === 0 ? { started: false } : { currentStep: s.currentStep - 1 },
    ),

  // Перейти можна лише на пройдений крок або наступний після завершених
  goToStep: (index) =>
    set((s) => {
      const allowed =
        index >= 0 &&
        index <= s.maxStepReached &&
        STEPS.slice(0, index).every((st) => st.isComplete(s.config))
      return allowed ? { currentStep: index } : s
    }),
}))

// ЄДИНЕ джерело плану для всіх споживачів (3D, вид зверху, легенда, ціна).
// Режим шаблонів — чиста функція від конфігурації; ручний — план зі стору.
// Ніхто, крім цього хука, не має викликати generateHousePlan напряму.
export function useHousePlan(): HousePlan {
  const config = useConfigurator((s) => s.config)
  const customPlan = useConfigurator((s) => s.customPlan)
  return useMemo(() => customPlan ?? generateHousePlan(config), [customPlan, config])
}
