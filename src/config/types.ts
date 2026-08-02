// Доменні типи всього застосунку. Інші файли імпортують типи звідси.

export type ConstructionType = 'frame' | 'modular' | 'brick'
export type HouseShape = 'rect' | 'square' | 'l-shape'
export type KitchenType = 'separate' | 'open'
export type ExtraRoom = 'office' | 'wardrobe' | 'pantry' | 'terrace'
export type Floors = 1 | 2
export type WindowType = 'standard' | 'panoramic'
export type RoofType = 'flat' | 'pitched'

// null = «ще не обрано» або «скинуто, бо змінився попередній крок»
export interface HouseConfig {
  budget: number
  constructionType: ConstructionType | null
  shape: HouseShape | null
  floors: Floors
  bedrooms: number
  bathrooms: number
  kitchenType: KitchenType | null
  extras: ExtraRoom[]
  // 2-й поверх (Г-подібний, коли floors === 2): свої кімнати, незалежні від 1-го,
  // але не більше спалень, ніж на 1-му. Комора на 2-му недоступна.
  bedrooms2: number
  extras2: ExtraRoom[]
  // Тип вікон (крок «Вікна»): звичайні чи панорамні (в підлогу). null = ще не обрано.
  windows: WindowType | null
  // Тип даху (крок «Дах»): плоский (з парапетами) чи скатний. null = ще не обрано.
  roof: RoofType | null
  // майбутні кроки додають поля сюди
}

export type ConfigKey = keyof HouseConfig
export type ConfigValue = HouseConfig[ConfigKey]

// ===== Поверховий план =====

export type RoomType =
  | 'livingKitchen'
  | 'living'
  | 'kitchen'
  | 'hall'
  | 'corridor'
  | 'bedroom'
  | 'bathroom'
  | 'office'
  | 'wardrobe'
  | 'pantry'
  | 'stairs'
  | 'terrace'
  | 'storage'
  | 'closet'

// Прямокутник на плані (x/z — центр, метри)
export interface PlanRect {
  x: number
  z: number
  width: number
  depth: number
}

export interface RoomZone extends PlanRect {
  type: RoomType
  // Кілька прямокутників з однаковим group — це одне приміщення
  // (Г-подібне): рендеряться без внутрішнього шва й підсвічуються разом.
  group?: string
  // Стабільний ідентифікатор кімнати (роль, а не порядковий номер) — не
  // «пливе», коли додають/прибирають однотипні кімнати. Використовується як
  // ключ анімації (плавна поява/зникнення) та для роздільної підсвітки.
  id?: string
  // Під час появи/зникнення фіксувати цю грань по осі Z замість центру, щоб
  // коробка росла/зникала ВІД грані й не залазила на сусіда. 'min' = верхня
  // грань (менший z), 'max' = нижня. Без значення — росте симетрично з центру.
  anchorZ?: 'min' | 'max'
  // Розтягуватись ПОВІЛЬНІШЕ при рості й стягуватись ШВИДШЕ при зменшенні —
  // щоб «відставати» від сусіда, що рухається, і не колізити з ним (коридор).
  lazyStretch?: boolean
  // Час згладжування (smoothTime) ЛИШЕ для росту/появи: більший = повільніший
  // ріст. Дає коробці «відставати» від сусіда, що рухається, щоб довше не
  // перетинатись (гардероб від майстра; коридор від майстра). Зменшення —
  // звичайне (або швидке, якщо lazyStretch).
  growEase?: number
}

export interface FloorPlan {
  floor: number // 1 або 2
  rooms: RoomZone[]
  slab: PlanRect[] // контур поверху (плита)
}

export interface HousePlan {
  floors: FloorPlan[]
  totalArea: number // м², сума всіх приміщень
}

// ===== Оздоблення фасаду (крок 7) =====
// Фасад задається ОКРЕМО для кожного поверху і не залежить від того, звідки
// взявся план (шаблон чи своє планування) — це властивість стіни, а не плану.
// Усі параметри всіх типів лежать в одному об'єкті: перемикання типу тоді не
// втрачає раніше налаштоване, а UI просто показує потрібну частину.

export type FacadeKind = 'clinker' | 'plaster' | 'thermowood' | 'panels'
export type PlankDir = 'horizontal' | 'vertical'
export type PanelShape = 'square' | 'rect'

export interface FacadeSpec {
  kind: FacadeKind
  color: string // hex, довільний
  // Термодерево навісне
  plankWidth: number // ширина планки, м
  plankThickness: number // товщина планки, м (глибина тіні у шві)
  plankGap: number // зазор між планками, м
  plankDir: PlankDir
  // Навісні панелі
  panelShape: PanelShape // квадратні = висота дорівнює ширині
  panelWidth: number
  panelHeight: number
}

// ===== Матеріали даху (крок 8) =====
// Прив'язані до ЧАСТИНИ даху (id зони), як фасад — до стіни. Тип задає
// розкладку об'ємних елементів, колір — довільний.

// Перші п'ять — скатний дах, останні два — плоский.
export type RoofMatKind =
  | 'clayTile'
  | 'metalTile'
  | 'seam'
  | 'shingle'
  | 'corrugated'
  | 'builtUp'
  | 'membrane'

export interface RoofMatSpec {
  kind: RoofMatKind
  color: string
  // Торцева планка (скатний) / кожух парапету (плоский) — фарбований метал.
  // Живе в тій самій специфікації, щоб на окремо обраній частині даху
  // мінявся й він, а не одразу на всьому будинку.
  trim: string
}

// ===== Покриття тераси (крок 10) =====
// Задається окремо для 1-го поверху (зони на землі) і 2-го (кімната-тераса).

export type TerraceMatKind = 'decking' | 'porcelain' | 'stone'

export interface TerraceMatSpec {
  kind: TerraceMatKind
  color: string
  // Терасна дошка
  boardWidth: number
  gap: number
  dir: 'x' | 'z'
  // Плита / камінь
  tile: number
  joint: number
}

// ===== Інтер'єр: підлога (крок 11) =====
// Задається на поверх, з винятками на окремі кімнати.

export type InteriorKind = 'board' | 'tile' | 'stone' | 'carpet'

export interface InteriorSpec {
  kind: InteriorKind
  color: string
  boardWidth: number // дошка
  dir: 'x' | 'z'
  tile: number // плитка / камінь
  joint: number
}

// Звідки береться план:
// 'template' — виводиться з конфігурації (generateHousePlan), як і раніше;
// 'custom'   — лежить у сторі й редагується користувачем, конфігурація його не чіпає.
export type PlanMode = 'template' | 'custom'
