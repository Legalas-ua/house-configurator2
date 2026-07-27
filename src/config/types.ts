// Доменні типи всього застосунку. Інші файли імпортують типи звідси.

export type ConstructionType = 'frame' | 'modular' | 'brick'
export type HouseShape = 'rect' | 'square' | 'l-shape'
export type KitchenType = 'separate' | 'open'
export type ExtraRoom = 'office' | 'wardrobe' | 'pantry'
export type Floors = 1 | 2

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
  | 'master'

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
