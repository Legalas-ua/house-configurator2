import type { HousePlan, PlanRect, RoomType, RoomZone } from '../config/types'
import { roomLimit } from '../config/rooms'

// ============================================================
// Перевірки ручного планування. Чисті функції: план → список проблем.
// Кожна проблема знає, ЯКЕ місце підсвітити червоним (rect) і які кімнати
// в ній винні — щоб і на плані, і в панелі показувати одне й те саме.
// ============================================================

export type IssueKind = 'overlap' | 'gap' | 'stairsArea' | 'unsupported' | 'tooSmall'

export interface PlanIssue {
  kind: IssueKind
  floor: number // індекс поверху
  rooms: string[] // id залучених кімнат
  rect: PlanRect // місце, яке підсвічуємо
  value?: number // площа/розрив — для тексту помилки
}

// Розрив, менший за це, — майже напевно недогляд, а не задум.
export const MIN_GAP = 0.5
// Прямий марш 2 × 3 м — це нормальні сходи, і саме такі стоять у КАТАЛОЗІ.
// Поки тут було 8 м², помилка вилазила одразу при переході «готове -> своє»
// на кожному двоповерховому плануванні: людина ще нічого не змінила, а її вже
// не пускають далі.
export const MIN_STAIRS_AREA = 6

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

// Унікальні відсортовані координати — лінії різу нерівномірної сітки.
function axis(values: number[]): number[] {
  const out: number[] = []
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1] > EPS) out.push(v)
  }
  return out
}

// Частина кімнати, що ПОВИСЛА в повітрі — не спирається на поверх нижче.
// Ріжемо кімнату координатами нижніх прямокутників і дивимось, які комірки
// лишились непокритими; повертаємо їхній габарит (його й підсвітимо).
function unsupportedPart(room: PlanRect, below: PlanRect[]): PlanRect | null {
  const r = box(room)
  const under = below.map(box).filter((b) => b.x1 > r.x0 + EPS && b.x0 < r.x1 - EPS && b.z1 > r.z0 + EPS && b.z0 < r.z1 - EPS)
  const xs = axis([r.x0, r.x1, ...under.flatMap((b) => [b.x0, b.x1])].filter((v) => v >= r.x0 - EPS && v <= r.x1 + EPS))
  const zs = axis([r.z0, r.z1, ...under.flatMap((b) => [b.z0, b.z1])].filter((v) => v >= r.z0 - EPS && v <= r.z1 + EPS))

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < xs.length - 1; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2
    for (let j = 0; j < zs.length - 1; j++) {
      const cz = (zs[j] + zs[j + 1]) / 2
      if (under.some((b) => cx > b.x0 && cx < b.x1 && cz > b.z0 && cz < b.z1)) continue
      minX = Math.min(minX, xs[i])
      maxX = Math.max(maxX, xs[i + 1])
      minZ = Math.min(minZ, zs[j])
      maxZ = Math.max(maxZ, zs[j + 1])
    }
  }
  if (minX === Infinity || maxX - minX < 0.05 || maxZ - minZ < 0.05) return null
  return rectOf({ x0: minX, x1: maxX, z0: minZ, z1: maxZ })
}

export function validatePlan(plan: HousePlan): PlanIssue[] {
  const issues: PlanIssue[] = []

  plan.floors.forEach((fl, floor) => {
    // --- Верхній поверх не має звисати за межі нижнього ---
    if (floor > 0) {
      const below = plan.floors[floor - 1].rooms
      fl.rooms.forEach((r, i) => {
        const part = unsupportedPart(r, below)
        if (part) issues.push({ kind: 'unsupported', floor, rooms: [id(r, i)], rect: part })
      })
    }

    // --- Сходи: замала площа ---
    fl.rooms.forEach((r, i) => {
      if (r.type !== 'stairs') return
      const area = r.width * r.depth
      if (area < MIN_STAIRS_AREA - EPS) {
        issues.push({ kind: 'stairsArea', floor, rooms: [id(r, i)], rect: { ...r }, value: area })
      }
    })

    // --- Замалі приміщення ---
    // Рахуємо ПРИМІЩЕННЯМИ, а не прямокутниками: частини з однаковим `group` —
    // це одна кімната, і в неї сумарна площа. Найменшу СТОРОНУ перевіряємо лише
    // в цільних кімнат: у складеної вузька частина буває законною (смуга
    // гардероба вздовж спальні), і чіплятись до неї — марно нервувати людину.
    const groups = new Map<string, { type: RoomType; ids: string[]; parts: RoomZone[] }>()
    fl.rooms.forEach((r, i) => {
      if (r.type === 'stairs') return // у сходів своя перевірка, вище
      const key = r.group ?? id(r, i)
      const g = groups.get(key) ?? { type: r.type, ids: [], parts: [] }
      g.ids.push(id(r, i))
      g.parts.push(r)
      groups.set(key, g)
    })
    for (const g of groups.values()) {
      const lim = roomLimit(g.type)
      const area = g.parts.reduce((s, r) => s + r.width * r.depth, 0)
      const side = Math.min(...g.parts.map((r) => Math.min(r.width, r.depth)))
      const small = area < lim.area - EPS || (g.parts.length === 1 && side < lim.side - EPS)
      if (!small) continue
      const bx = g.parts.map(box)
      issues.push({
        kind: 'tooSmall',
        floor,
        rooms: g.ids,
        rect: rectOf({
          x0: Math.min(...bx.map((b) => b.x0)),
          x1: Math.max(...bx.map((b) => b.x1)),
          z0: Math.min(...bx.map((b) => b.z0)),
          z1: Math.max(...bx.map((b) => b.z1)),
        }),
        value: area,
      })
    }

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
