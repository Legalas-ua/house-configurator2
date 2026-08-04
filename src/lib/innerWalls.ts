import type { HousePlan } from '../config/types'
import { bounds, neighborsOf, type Side } from './windows'

// ============================================================
// ВНУТРІШНІ перегородки як дані. Раніше вони існували лише всередині
// HouseShell разом із автоматичними дверима посередині — вибрати чи посунути
// такі двері було нічим.
//
// Тепер перегородка — сегмент зі стабільним id, а двері в ній задає
// користувач (крок «Інтер'єр»). Правила ті самі, що й для вікон: двері
// прив'язані до СЕГМЕНТА і зсуву вздовж нього, а не до світових координат.
// ============================================================

export const PART_T = 0.1 // товщина перегородки — як у HouseShell
export const IDOOR_H = 2.1 // типова висота дверей
export const IDOOR_W = 0.9
export const MIN_IDOOR_W = 0.6
export const MAX_IDOOR_W = 2.4
export const IDOOR_EDGE = 0.1 // відступ отвору від краю перегородки

export interface InnerWall {
  id: string
  floor: number
  horizontal: boolean // перегородка тягнеться вздовж X
  line: number
  a: number
  b: number
  rotY: number
}

export interface InnerDoor {
  id: string
  wallId: string
  u: number // зсув лівого краю отвору від початку перегородки
  width: number
  height: number
  arch: boolean // true — прохід без полотна
}

// Усі перегородки поверхів. Той самий обхід, що будував їх у сцені: сторона
// кімнати, за якою стоїть ІНША кімната (не частина тієї самої).
export function innerWalls(plan: HousePlan): InnerWall[] {
  const out: InnerWall[] = []
  const seen = new Set<string>()
  plan.floors.forEach((fl, idx) => {
    for (const room of fl.rooms) {
      if (room.type === 'terrace') continue
      const b = bounds(room)
      const cand: { side: Side; horizontal: boolean; line: number; a: number; b: number; rotY: number }[] = [
        { side: 'xmax', horizontal: false, line: b.x1, a: b.z0, b: b.z1, rotY: Math.PI / 2 },
        { side: 'xmin', horizontal: false, line: b.x0, a: b.z0, b: b.z1, rotY: Math.PI / 2 },
        { side: 'zmax', horizontal: true, line: b.z1, a: b.x0, b: b.x1, rotY: 0 },
        { side: 'zmin', horizontal: true, line: b.z0, a: b.x0, b: b.x1, rotY: 0 },
      ]
      for (const sd of cand) {
        // Перегородка йде РІВНО по перекриттю з сусідом, і по кожному сусідові
        // окремо. Раніше брали першого-ліпшого і будували на ВСЮ сторону
        // кімнати: якщо сусід коротший, решта смуги лягала в зовнішню стіну —
        // 100 мм глухої перегородки рівно в отворі вікна, і отвір не
        // прорізався (`cutOpenings` перегородок не чіпає).
        for (const nb of neighborsOf(fl.rooms, room, sd.side, false)) {
          if (nb.group && nb.group === room.group) continue // одна кімната
          const c = bounds(nb)
          const a = Math.max(sd.a, sd.horizontal ? c.x0 : c.z0)
          const b = Math.min(sd.b, sd.horizontal ? c.x1 : c.z1)
          if (b - a < 0.1) continue
          const key = `${idx}-${sd.horizontal ? 'h' : 'v'}-${sd.line.toFixed(2)}-${((a + b) / 2).toFixed(2)}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({
            id: key,
            floor: idx,
            horizontal: sd.horizontal,
            line: sd.line,
            a,
            b,
            rotY: sd.rotY,
          })
        }
      }
    }
  })
  return out
}

// Проміжок, у якому може жити отвір на цій перегородці.
export function doorRange(wall: InnerWall): { from: number; to: number } {
  const len = wall.b - wall.a
  const from = Math.min(IDOOR_EDGE, len / 2)
  return { from, to: Math.max(from, len - from) }
}

const snap = (v: number) => Math.round(v / 0.05) * 0.05

// Посунути/змінити отвір у межах його перегородки.
export function fitDoor(door: InnerDoor, wall: InnerWall, u: number, width: number): InnerDoor {
  const { from, to } = doorRange(wall)
  const span = to - from
  const w = Math.max(Math.min(MIN_IDOOR_W, span), Math.min(snap(width), span, MAX_IDOOR_W))
  return { ...door, width: w, u: Math.max(from, Math.min(snap(u), to - w)) }
}

export const updateDoor = (doors: InnerDoor[], id: string, patch: Partial<InnerDoor>) =>
  doors.map((d) => (d.id === id ? { ...d, ...patch } : d))

export const removeDoor = (doors: InnerDoor[], id: string) => doors.filter((d) => d.id !== id)

export const doorsOnWall = (doors: InnerDoor[], wallId: string) => doors.filter((d) => d.wallId === wallId)

// Новий отвір у найбільшу вільну щілину перегородки.
export function addDoor(wall: InnerWall, doors: InnerDoor[], arch: boolean): InnerDoor | null {
  const { from, to } = doorRange(wall)
  const taken = doorsOnWall(doors, wall.id)
    .map((d) => [d.u, d.u + d.width] as [number, number])
    .sort((p, q) => p[0] - q[0])
  let gap: [number, number] = [from, from]
  let cur = from
  for (const [p, q] of taken) {
    if (p - cur > gap[1] - gap[0]) gap = [cur, p]
    cur = Math.max(cur, q)
  }
  if (to - cur > gap[1] - gap[0]) gap = [cur, to]
  const free = gap[1] - gap[0]
  if (free < MIN_IDOOR_W) return null
  const width = Math.min(IDOOR_W, free)
  return {
    id: `door-${wall.id}-${Date.now().toString(36)}`,
    wallId: wall.id,
    u: gap[0] + (free - width) / 2,
    width,
    height: IDOOR_H,
    arch,
  }
}

// Геометрія отвору у світі.
export interface ResolvedDoor extends InnerDoor {
  floor: number
  horizontal: boolean
  line: number
  a: number
  b: number
  baseY: number
  rotY: number
}

export function resolveDoors(walls: InnerWall[], doors: InnerDoor[], floorH: number): ResolvedDoor[] {
  const byId = new Map(walls.map((w) => [w.id, w]))
  const out: ResolvedDoor[] = []
  for (const d of doors) {
    const w = byId.get(d.wallId)
    if (!w) continue // перегородку прибрали — двері зникають разом із нею
    const { from, to } = doorRange(w)
    const width = Math.min(d.width, to - from)
    const u = Math.max(from, Math.min(d.u, to - width))
    out.push({
      ...d,
      width,
      u,
      floor: w.floor,
      horizontal: w.horizontal,
      line: w.line,
      a: w.a + u,
      b: w.a + u + width,
      baseY: w.floor * floorH,
      rotY: w.rotY,
    })
  }
  return out
}
