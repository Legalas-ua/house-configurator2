import type { ExtraRoom, RoomType } from './types'

// Список усіх додаткових кімнат (чи доступні вони в конкретному
// плануванні — вирішує каталог config/layouts.ts).
export const ALL_EXTRAS: ExtraRoom[] = ['office', 'wardrobe', 'pantry']

// ============================================================
// Найменші РОЗМІРИ приміщень. Сітка редактора дозволяє звести кімнату до
// 1×1 м — спальня такою бути не може, і людині треба про це сказати.
//
// Два числа на тип, бо однієї площі мало: 8 м² можна набрати і смугою
// 0,5 × 16 м, у яку не стане ліжко. Площа — про меблі, сторона — про прохід.
//
// Значення близькі до ДБН для житла (спальня від 8 м², вітальня від 15,
// кухня від 6, коридор від 0,9 м завширшки) і навмисно не суворіші: це
// конфігуратор, а не експертиза.
// ============================================================

export interface RoomLimit {
  area: number // найменша площа, м²
  side: number // найменша сторона, м
}

const DEFAULT_LIMIT: RoomLimit = { area: 2, side: 1 }

const LIMITS: Partial<Record<RoomType, RoomLimit>> = {
  bedroom: { area: 8, side: 2.5 },
  livingKitchen: { area: 15, side: 3 },
  living: { area: 12, side: 3 },
  // Кабінет у каталозі буває 2 × 2 м — це і є нижня межа.
  office: { area: 4, side: 2 },
  bathroom: { area: 3, side: 1.5 },
  hall: { area: 3, side: 1.5 },
  corridor: { area: 2, side: 1 },
  wardrobe: { area: 2, side: 1 },
  pantry: { area: 1, side: 1 },
  storage: { area: 1, side: 1 },
  closet: { area: 1, side: 1 },
  // Сходів тут немає навмисно: у них своя перевірка (MIN_STAIRS_AREA у
  // lib/validatePlan.ts), і два пороги на одне приміщення розійшлися б.
  terrace: { area: 4, side: 1.5 },
}

export const roomLimit = (type: RoomType): RoomLimit => LIMITS[type] ?? DEFAULT_LIMIT
