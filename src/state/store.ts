import { useMemo } from 'react'
import { create } from 'zustand'
import type {
  ConfigKey,
  ConfigValue,
  FacadeSpec,
  HouseConfig,
  HousePlan,
  PlanMode,
  PlanRect,
  RoofMatSpec,
  TerraceMatSpec,
} from '../config/types'
import { DEFAULT_TERRACE_MAT } from '../config/terraceMaterial'
import { normalizeTerrace, type TerraceZone } from '../lib/terrace'
import { DEFAULT_FACADE } from '../config/facade'
import { DEFAULT_FLAT_MAT, DEFAULT_ROOF_MAT } from '../config/roofMaterial'
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
import { generateRoof, type RoofPart } from '../lib/roof'
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
  selectedDoor: null,
  selectedRoofPart: null,
  // Разом із плануванням відкочуємо й дах: там міняють форму будинку, а зони
  // даху намальовані під стару.
  ...(index < ROOMS_STEP
    ? { planMode: 'template' as const, customPlan: null, roofMode: 'template' as const, customRoof: null }
    : {}),
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
  selectedDoor: number | null // індекс дверей усередині обраного вікна
  addingWindow: boolean // режим «обери стіну» — лише тоді стіни клікабельні
  // Дах: готовий варіант (тип із config.roof) або свій набір частин.
  roofMode: PlanMode
  customRoof: RoofPart[] | null
  selectedRoofPart: string | null // id обраної зони даху
  roofLevel: number // рівень даху, який зараз редагують
  // «Дах над терасою»: тераса лишається в контурі покриття, тож зону даху
  // можна протягнути й над нею.
  roofOverTerrace: boolean
  // Фасад: свій набір параметрів на КОЖЕН поверх (індекс = поверх). Тримаємо
  // завжди два записи — навіть в одноповерховому будинку, щоб додавання
  // другого поверху не скидало вже налаштоване.
  facades: FacadeSpec[]
  facadeFloor: number // поверх, оздоблення якого зараз правлять
  // 'template' — матеріал на ВЕСЬ поверх; 'custom' — на окремі стіни.
  // Стіна тут — грань із lib/wallFaces.ts; чого немає в мапі, те бере
  // оздоблення свого поверху.
  facadeMode: PlanMode
  wallFacades: Record<string, FacadeSpec>
  selectedFacadeWall: string | null
  // Оздоблення НЕ з'являється саме собою: доки користувач не клікнув матеріал,
  // будинок стоїть у базовому вигляді. І показуємо його лише на своєму кроці
  // та далі — повернувшись назад, людина бачить будинок таким, яким він був на
  // тому кроці, але сам вибір зберігається й повертається разом із кроком.
  facadeTouched: boolean
  // Покрівля: типовий матеріал (скатний і плоский окремо) + винятки на зони.
  roofMat: RoofMatSpec
  roofFlat: RoofMatSpec
  roofMats: Record<string, RoofMatSpec>
  roofMatTouched: boolean
  // Тераса 1-го поверху: зони на землі (крок «Тераса»).
  terraceZones: TerraceZone[]
  selectedTerrace: string | null
  // Покриття тераси по поверхах: 0 — зони на землі, 1 — кімната-тераса.
  terraceMats: TerraceMatSpec[]
  terraceFloor: number
  terraceMatTouched: boolean
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
  setSelectedDoor: (i: number | null) => void
  setAddingWindow: (on: boolean) => void
  setRoofMode: (mode: PlanMode) => void
  setCustomRoof: (parts: RoofPart[]) => void
  setSelectedRoofPart: (id: string | null) => void
  setRoofLevel: (level: number) => void
  setRoofOverTerrace: (on: boolean) => void
  setFacade: (floor: number, patch: Partial<FacadeSpec>) => void
  setFacadeFloor: (floor: number) => void
  setFacadeMode: (mode: PlanMode) => void
  setWallFacade: (id: string, patch: Partial<FacadeSpec>, base: FacadeSpec) => void
  setSelectedFacadeWall: (id: string | null) => void
  syncFacadeColor: () => void // «однаковий колір» — колір 1-го поверху на все
  setRoofMat: (patch: Partial<RoofMatSpec>, flat: boolean) => void
  setPartRoofMat: (id: string, patch: Partial<RoofMatSpec>, base: RoofMatSpec) => void
  setTerraceZones: (zones: TerraceZone[]) => void
  addTerraceZone: (zone: PlanRect) => void
  setSelectedTerrace: (id: string | null) => void
  setTerraceMat: (floor: number, patch: Partial<TerraceMatSpec>) => void
  setTerraceFloor: (floor: number) => void
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
  selectedDoor: null,
  addingWindow: false,
  roofMode: 'template',
  customRoof: null,
  selectedRoofPart: null,
  roofLevel: 0,
  roofOverTerrace: false,
  facades: [{ ...DEFAULT_FACADE }, { ...DEFAULT_FACADE }],
  facadeFloor: 0,
  facadeMode: 'template',
  wallFacades: {},
  selectedFacadeWall: null,
  facadeTouched: false,
  roofMat: { ...DEFAULT_ROOF_MAT },
  roofFlat: { ...DEFAULT_FLAT_MAT },
  roofMats: {},
  roofMatTouched: false,
  terraceZones: [],
  selectedTerrace: null,
  terraceMats: [{ ...DEFAULT_TERRACE_MAT }, { ...DEFAULT_TERRACE_MAT }],
  terraceFloor: 0,
  terraceMatTouched: false,
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
      // У ГОТОВОМУ даху набір зон — похідна від конфігурації: змінився тип
      // даху, форма чи кількість поверхів — набір рахується наново, а правки
      // поверх старого відпускаємо. У ручному режимі намальоване не чіпаємо
      // ніколи.
      const roofReset = s.roofMode === 'template' ? { customRoof: null, selectedRoofPart: null } : {}
      // Якщо будинок став одноповерховим — показуємо 1-й поверх
      return { config, viewFloor: Math.min(s.viewFloor, config.floors), ...roofReset }
    }),

  // Ручний режим НЕ починається з порожнечі: заморожуємо поточний обчислений
  // план як стартову точку. Повернення до шаблонів скидає ручні правки.
  // Планування тягне за собою дах: готові варіанти даху розраховані на обриси
  // ШАБЛОНУ, і на довільному плані дають нісенітницю. Тому своє планування —
  // це завжди і свій дах, намальований з нуля (порожній `customRoof`, а не
  // `null`: null означав би «порахуй готовий»).
  setPlanMode: (mode) =>
    set((s) => {
      if (mode === s.planMode) return s
      if (mode === 'template') {
        return {
          planMode: 'template',
          customPlan: null,
          selectedRoom: null,
          roofMode: 'template' as const,
          customRoof: null,
          selectedRoofPart: null,
        }
      }
      return {
        planMode: 'custom',
        customPlan: s.customPlan ?? normalizePlan(generateHousePlan(s.config)),
        selectedRoom: null,
        roofMode: 'custom' as const,
        customRoof: [],
        selectedRoofPart: null,
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

  setSelectedDoor: (i) => set({ selectedDoor: i }),

  // Вимикаючи режим, одразу знімаємо вибір стіни — інакше вона лишалась би
  // підсвіченою, хоч кліки по стінах уже не ловляться.
  setAddingWindow: (on) => set({ addingWindow: on, selectedWall: on ? null : null }),

  // Малювати свій дах — означає малювати з ЧИСТОГО аркуша. Раніше сюди
  // підставлявся готовий набір зон, і людина замість малювання спершу
  // розбирала чуже: зони лежали одна на одній і заважали ставити свої.
  setRoofMode: (mode) =>
    set((s) => {
      if (mode === s.roofMode) return s
      if (mode === 'template') return { roofMode: 'template', customRoof: null, selectedRoofPart: null }
      return { roofMode: 'custom', customRoof: [], selectedRoofPart: null }
    }),

  // РЕЖИМ тут навмисно не чіпаємо. Готовий дах теж можна правити по частинах:
  // картка задає базовий набір зон, а правки лягають поверх нього в
  // `customRoof`. Якби це перемикало режим на 'custom', перша ж правка ховала
  // б картки — і повернутись до базового варіанту стало б нічим.
  setCustomRoof: (parts) => set({ customRoof: parts }),

  setSelectedRoofPart: (id) => set({ selectedRoofPart: id }),

  setRoofLevel: (level) => set({ roofLevel: level, selectedRoofPart: null }),

  // Контур покриття змінився — готовий набір зон рахуємо наново.
  setRoofOverTerrace: (on) =>
    set((s) => (on === s.roofOverTerrace ? s : { roofOverTerrace: on, selectedRoofPart: null })),

  setFacade: (floor, patch) =>
    set((s) => ({
      facades: s.facades.map((f, i) => (i === floor ? { ...f, ...patch } : f)),
      facadeTouched: true,
    })),

  setFacadeFloor: (floor) => set({ facadeFloor: floor }),

  // Повернення до «на весь поверх» стирає винятки по стінах: інакше вони
  // тихо чекали б у сторі й вискакували при наступному вмиканні режиму.
  setFacadeMode: (mode) =>
    set((s) =>
      mode === s.facadeMode
        ? s
        : mode === 'template'
          ? { facadeMode: 'template', wallFacades: {}, selectedFacadeWall: null }
          : { facadeMode: 'custom', selectedFacadeWall: null },
    ),

  // `base` — оздоблення, яке ця стіна має ЗАРАЗ (своє або поверхове): перша ж
  // правка має лягти поверх видимого, а не поверх типового.
  setWallFacade: (id, patch, base) =>
    set((s) => ({
      wallFacades: { ...s.wallFacades, [id]: { ...base, ...s.wallFacades[id], ...patch } },
      facadeTouched: true,
    })),

  setSelectedFacadeWall: (id) => set({ selectedFacadeWall: id }),

  // Один колір на весь будинок: беремо колір 1-го поверху й розкладаємо на
  // решту поверхів і на всі стіни-винятки.
  syncFacadeColor: () =>
    set((s) => {
      const color = s.facades[0].color
      return {
        facades: s.facades.map((f) => (f.color === color ? f : { ...f, color })),
        wallFacades: Object.fromEntries(Object.entries(s.wallFacades).map(([k, f]) => [k, { ...f, color }])),
      }
    }),

  setRoofMat: (patch, flat) =>
    set((s) =>
      flat
        ? { roofFlat: { ...s.roofFlat, ...patch }, roofMatTouched: true }
        : { roofMat: { ...s.roofMat, ...patch }, roofMatTouched: true },
    ),

  setPartRoofMat: (id, patch, base) =>
    set((s) => ({
      roofMats: { ...s.roofMats, [id]: { ...base, ...s.roofMats[id], ...patch } },
      roofMatTouched: true,
    })),


  setTerraceZones: (zones) => set({ terraceZones: zones }),

  addTerraceZone: (zone) =>
    set((s) => {
      const id = `terr-${Date.now().toString(36)}`
      return { terraceZones: [...s.terraceZones, { id, ...normalizeTerrace(zone) }], selectedTerrace: id }
    }),

  setSelectedTerrace: (id) => set({ selectedTerrace: id }),

  setTerraceMat: (floor, patch) =>
    set((s) => ({
      terraceMats: s.terraceMats.map((m, i) => (i === floor ? { ...m, ...patch } : m)),
      terraceMatTouched: true,
    })),

  setTerraceFloor: (floor) => set({ terraceFloor: floor }),

  setSelectedRoom: (id) => set({ selectedRoom: id }),

  setDragging: (on) => set({ dragging: on }),

  setShowGrid: (on) => set({ showGrid: on }),

  setTopView: (on) => set({ topView: on }),
  setViewFloor: (floor) => set({ viewFloor: floor }),
  setHideFloor2: (on) => set({ hideFloor2: on }),

  nextStep: () =>
    set((s) => {
      const stepId = STEPS[s.currentStep].id
      // Ті самі ручні режими, що й у кнопці: там вибору картками немає.
      const custom =
        (stepId === 'windows' && s.windowsMode === 'custom') || (stepId === 'roof' && s.roofMode === 'custom')
      if (!custom && !STEPS[s.currentStep].isComplete(s.config)) return s
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

// Те саме для даху: свій набір частин або готовий за обраним типом.
export function useRoof(): RoofPart[] {
  const config = useConfigurator((s) => s.config)
  const customRoof = useConfigurator((s) => s.customRoof)
  const over = useConfigurator((s) => s.roofOverTerrace)
  const plan = useHousePlan()
  return useMemo(
    () => customRoof ?? generateRoof(plan, config.roof === 'pitched' ? 'gable' : 'flat', over),
    [customRoof, plan, config.roof, over],
  )
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
