import type { HousePlan, PlanRect, RoomZone } from '../config/types'

// ============================================================
// Перевірки ручного планування. Чисті функції: план → список проблем.
// Кожна проблема знає, ЯКЕ місце підсвітити червоним (rect) і які кімнати
// в ній винні — щоб і на плані, і в панелі показувати одне й те саме.
// ============================================================

export type IssueKind = 'overlap' | 'gap' | 'stairsArea'

export interface PlanIssue {
  kind: IssueKind
  floor: number // індекс поверху
  rooms: string[] // id залучених кімнат
  rect: PlanRect // місце, яке підсвічуємо
  value?: number // площа/розрив — для тексту помилки
}

// Розрив, менший за це, — майже напевно недогляд, а не задум.
export const MIN_GAP = 0.5
export const MIN_STAIRS_AREA = 8

const EPS = 1e-4

interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
}
const box = (r: PlanRect): Box => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})
const rectOf = (b: Box): PlanRect => ({
  x: (b.x0 + b.x1) / 2,
  z: (b.z0 + b.z1) / 2,
  width: b.x1 - b.x0,
  depth: b.z1 - b.z0,
})

const id = (r: RoomZone, i: number) => r.id ?? `#${i}`

export function validatePlan(plan: HousePlan): PlanIssue[] {
  const issues: PlanIssue[] = []

  plan.floors.forEach((fl, floor) => {
    // --- Сходи: замала площа ---
    fl.rooms.forEach((r, i) => {
      if (r.type !== 'stairs') return
      const area = r.width * r.depth
      if (area < MIN_STAIRS_AREA - EPS) {
        issues.push({ kind: 'stairsArea', floor, rooms: [id(r, i)], rect: { ...r }, value: area })
      }
    })

    // --- Пари кімнат: накладання і замалі розриви ---
    for (let i = 0; i < fl.rooms.length; i++) {
      for (let j = i + 1; j < fl.rooms.length; j++) {
        const a = box(fl.rooms[i])
        const b = box(fl.rooms[j])
        const ids = [id(fl.rooms[i], i), id(fl.rooms[j], j)]

        // Накладання: перетин має ненульову площу
        const ix0 = Math.max(a.x0, b.x0)
        const ix1 = Math.min(a.x1, b.x1)
        const iz0 = Math.max(a.z0, b.z0)
        const iz1 = Math.min(a.z1, b.z1)
        if (ix1 - ix0 > EPS && iz1 - iz0 > EPS) {
          issues.push({ kind: 'overlap', floor, rooms: ids, rect: rectOf({ x0: ix0, x1: ix1, z0: iz0, z1: iz1 }) })
          continue // накладання вже помилка — розрив тут рахувати нічого
        }

        // Розрив: кімнати «дивляться» одна на одну (проєкції перетинаються по
        // другій осі), але між ними лишилась вузька щілина.
        const zOverlap = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0)
        if (zOverlap > EPS) {
          const gap = a.x0 > b.x1 ? a.x0 - b.x1 : b.x0 > a.x1 ? b.x0 - a.x1 : -1
          if (gap > EPS && gap <= MIN_GAP + EPS) {
            const x0 = a.x0 > b.x1 ? b.x1 : a.x1
            issues.push({
              kind: 'gap',
              floor,
              rooms: ids,
              rect: rectOf({
                x0,
                x1: x0 + gap,
                z0: Math.max(a.z0, b.z0),
                z1: Math.min(a.z1, b.z1),
              }),
              value: gap,
            })
          }
        }
        const xOverlap = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
        if (xOverlap > EPS) {
          const gap = a.z0 > b.z1 ? a.z0 - b.z1 : b.z0 > a.z1 ? b.z0 - a.z1 : -1
          if (gap > EPS && gap <= MIN_GAP + EPS) {
            const z0 = a.z0 > b.z1 ? b.z1 : a.z1
            issues.push({
              kind: 'gap',
              floor,
              rooms: ids,
              rect: rectOf({
                x0: Math.max(a.x0, b.x0),
                x1: Math.min(a.x1, b.x1),
                z0,
                z1: z0 + gap,
              }),
              value: gap,
            })
          }
        }
      }
    }
  })

  return issues
}

// Кімнати, підсвічені червоним на конкретному поверсі.
export function badRooms(issues: PlanIssue[], floor: number): Set<string> {
  const out = new Set<string>()
  for (const it of issues) if (it.floor === floor) for (const r of it.rooms) out.add(r)
  return out
}
