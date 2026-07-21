import { create } from 'zustand'
import type { ConfigKey, ConfigValue, HouseConfig } from '../config/types'
import { DEFAULT_CONFIG, STEPS } from '../config/steps'

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
    if (!step.getOptions) continue
    const value = next[step.configKey]
    if (value !== null && !step.getOptions(next).includes(value as string)) {
      ;(next as Record<ConfigKey, ConfigValue>)[step.configKey] = null
    }
  }
  return next
}

interface ConfiguratorState {
  started: boolean // false = стартовий екран
  config: HouseConfig
  currentStep: number // індекс у STEPS
  maxStepReached: number // до якого кроку дійшов користувач (для 3D і навігації)
  topView: boolean // камера летить у вид зверху; обертання мишею вимикає
  viewFloor: number // який поверх показувати на плані (1 або 2)
  start: () => void
  setValue: (key: ConfigKey, value: string | number | string[] | null) => void
  setTopView: (on: boolean) => void
  setViewFloor: (floor: number) => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
}

export const useConfigurator = create<ConfiguratorState>((set) => ({
  started: false,
  config: DEFAULT_CONFIG,
  currentStep: 0,
  maxStepReached: 0,
  topView: false,
  viewFloor: 1,

  start: () => set({ started: true }),

  setValue: (key, value) =>
    set((s) => {
      const config = sanitize({ ...s.config, [key]: value })
      // Якщо будинок став одноповерховим — показуємо 1-й поверх
      return { config, viewFloor: Math.min(s.viewFloor, config.floors) }
    }),

  setTopView: (on) => set({ topView: on }),
  setViewFloor: (floor) => set({ viewFloor: floor }),

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
