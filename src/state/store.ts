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
import { normalizePlan } from '../lib/editPlan'
import { validatePlan } from '../lib/validatePlan'
import { generateWindows, validateWindows, type WindowSpec } from '../lib/windows'
import { floor2Limits } from '../lib/lshape'

// Крок, з якого починається планування. Повернення НА ПОПЕРЕДНІЙ крок скидає
// ручне планування: там міняють форму будинку, і заморожений план не давав би
// це зробити — форма змінюється, а на екрані лишається старий власний план.
const ROOMS_STEP = STEPS.findIndex((s) => s.id === 'rooms')
const WINDOWS_STEP = STEPS.findIndex((s) => s.id === 'windows')

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

// Повернулись раніше за крок → відповідне ручне редагування більше не діє.
// План скидається на кроці «форма» (там міняють форму будинку), вікна — щойно
// виходимо з кроку «Вікна» назад (там міняється планування, а з ним і стіни).
const planReset = (index: number) => ({
  selectedRoom: null,
  selectedWindow: null,
  selectedWall: null,
  ...(index < ROOMS_STEP ? { planMode: 'template' as const, customPlan: null } : {}),
  ...(index < WINDOWS_STEP ? { windowsMode: 'template' as const, customWindows: null } : {}),
})

interface ConfiguratorState {
  started: boolean // false = стартовий екран
  config: HouseConfig
  // Режим плану. У 'custom' план лежить у customPlan і БІЛЬШЕ не перераховується
  // з конфігурації — інакше правки користувача затирались би на кожен setValue.
  planMode: PlanMode
  customPlan: HousePlan | null
  // Вікна: так само як план — або готовий варіант, або свій набір у сторі.
  windowsMode: PlanMode
  customWindows: WindowSpec[] | null
  selectedWindow: string | null
  selectedWall: string | null // стіна, обрана для додавання вікна
  selectedRoom: string | null // id кімнати, яку зараз редагують (ручний режим)
  dragging: boolean // тягнуть зону на плані → камеру треба знерухомити
  showGrid: boolean // сітка прив'язки під планом (лише в ручному режимі)
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
  setWindowsMode: (mode: PlanMode) => void
  setCustomWindows: (specs: WindowSpec[]) => void
  setSelectedWindow: (id: string | null) => void
  setSelectedWall: (key: string | null) => void
  setSelectedRoom: (id: string | null) => void
  setDragging: (on: boolean) => void
  setShowGrid: (on: boolean) => void
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
  windowsMode: 'template',
  customWindows: null,
  selectedWindow: null,
  selectedWall: null,
  selectedRoom: null,
  dragging: false,
  showGrid: true,
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
      if (mode === 'template') return { planMode: 'template', customPlan: null, selectedRoom: null }
      return {
        planMode: 'custom',
        customPlan: s.customPlan ?? normalizePlan(generateHousePlan(s.config)),
        selectedRoom: null,
      }
    }),

  setCustomPlan: (plan) => set({ planMode: 'custom', customPlan: plan }),

  // Перехід у ручний режим вікон бере готовий набір як стартовий — людина
  // правит наявні вікна, а не розставляє їх з нуля.
  setWindowsMode: (mode) =>
    set((s) => {
      if (mode === s.windowsMode) return s
      if (mode === 'template') return { windowsMode: 'template', customWindows: null, selectedWindow: null }
      const plan = s.customPlan ?? generateHousePlan(s.config)
      return {
        windowsMode: 'custom',
        customWindows: s.customWindows ?? generateWindows(plan, s.config),
        selectedWindow: null,
      }
    }),

  setCustomWindows: (specs) => set({ windowsMode: 'custom', customWindows: specs }),

  setSelectedWindow: (id) => set({ selectedWindow: id }),

  setSelectedWall: (key) => set({ selectedWall: key }),

  setSelectedRoom: (id) => set({ selectedRoom: id }),

  setDragging: (on) => set({ dragging: on }),

  setShowGrid: (on) => set({ showGrid: on }),

  setTopView: (on) => set({ topView: on }),
  setViewFloor: (floor) => set({ viewFloor: floor }),
  setHideFloor2: (on) => set({ hideFloor2: on }),

  nextStep: () =>
    set((s) => {
      if (!STEPS[s.currentStep].isComplete(s.config)) return s
      // Друга лінія оборони поруч із неактивною кнопкою: помилки ручного
      // планування не дають піти далі жодним шляхом.
      if (s.currentStep === ROOMS_STEP && s.customPlan && validatePlan(s.customPlan).length > 0) return s
      if (s.currentStep === WINDOWS_STEP && s.customWindows) {
        const plan = s.customPlan ?? generateHousePlan(s.config)
        if (validateWindows(plan, s.customWindows).length > 0) return s
      }
      const next = Math.min(s.currentStep + 1, STEPS.length - 1)
      return { currentStep: next, maxStepReached: Math.max(s.maxStepReached, next) }
    }),

  // З першого кроку «Назад» повертає на стартовий екран
  prevStep: () =>
    set((s) =>
      s.currentStep === 0
        ? { started: false }
        : { currentStep: s.currentStep - 1, ...planReset(s.currentStep - 1) },
    ),

  // Перейти можна лише на пройдений крок або наступний після завершених
  goToStep: (index) =>
    set((s) => {
      const allowed =
        index >= 0 &&
        index <= s.maxStepReached &&
        STEPS.slice(0, index).every((st) => st.isComplete(s.config))
      return allowed ? { currentStep: index, ...planReset(index) } : s
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

// Те саме для вікон: свій набір, якщо він є, інакше готовий за планом.
export function useWindows(): WindowSpec[] {
  const config = useConfigurator((s) => s.config)
  const customWindows = useConfigurator((s) => s.customWindows)
  const plan = useHousePlan()
  return useMemo(
    () => customWindows ?? generateWindows(plan, config),
    [customWindows, plan, config],
  )
}
