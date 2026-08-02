import type { HousePlan, PlanRect } from '../config/types'
import { GRID, MIN_SIDE, snap } from './editPlan'
import { unionOutline } from './outline'

// ============================================================
// Тераса 1-го поверху як ЗОНИ на землі. Малюється так само, як зони планування
// й зони даху: прямокутники на сітці 0,5 м.
//
// Дві межі, вироблені із замовником:
//   • тераса живе тільки НАДВОРІ — заходити в контур будинку не можна,
//     дозволено лише дотик;
//   • тераса має триматися будинку — окремий острівець посеред ділянки це
//     вже не тераса. Дотик РАХУЄТЬСЯ ланцюжком: зона, що торкається іншої
//     зони, яка торкається будинку, теж на місці.
// ============================================================

export interface TerraceZone extends PlanRect {
  id: string
}

export { GRID as TERRACE_GRID, MIN_SIDE as TERRACE_MIN }

const EPS = 0.01

export const tbox = (r: PlanRect) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})

// Площа перекриття двох прямокутників.
function overlapArea(a: PlanRect, b: PlanRect): number {
  const p = tbox(a)
  const q = tbox(b)
  const w = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)
  const d = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0)
  return w > 0 && d > 0 ? w * d : 0
}

// Прямокутники СТИКАЮТЬСЯ: спільна грань, а не просто близькі кути.
function touches(a: PlanRect, b: PlanRect): boolean {
  const p = tbox(a)
  const q = tbox(b)
  const xOver = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)
  const zOver = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0)
  if (xOver > 0.1 && Math.min(Math.abs(p.z1 - q.z0), Math.abs(q.z1 - p.z0)) < EPS) return true
  if (zOver > 0.1 && Math.min(Math.abs(p.x1 - q.x0), Math.abs(q.x1 - p.x0)) < EPS) return true
  return false
}

// Слід будинку на землі — усе, що стоїть на 1-му поверсі.
export const houseFootprint = (plan: HousePlan): PlanRect[] => plan.floors[0]?.slab ?? []

export const houseOutline = (plan: HousePlan) => unionOutline(houseFootprint(plan))

// Прив'язка до сітки — по ГРАНІ, як і в зон планування: розміри кратні кроку,
// тож зсув центру на пів клітинки не «поїде».
export function normalizeTerrace(r: PlanRect): PlanRect {
  const width = Math.max(MIN_SIDE, snap(r.width))
  const depth = Math.max(MIN_SIDE, snap(r.depth))
  const x0 = snap(r.x - r.width / 2)
  const z0 = snap(r.z - r.depth / 2)
  return { x: x0 + width / 2, z: z0 + depth / 2, width, depth }
}

export function updateTerrace(zones: TerraceZone[], id: string, patch: Partial<PlanRect>): TerraceZone[] {
  return zones.map((z) => (z.id === id ? { ...z, ...normalizeTerrace({ ...z, ...patch }) } : z))
}

export const removeTerrace = (zones: TerraceZone[], id: string) => zones.filter((z) => z.id !== id)

// Нова зона — притулена до будинку ЗЗОВНІ, збоку від уже наявних.
export function addTerrace(plan: HousePlan, zones: TerraceZone[]): { zones: TerraceZone[]; id: string } | null {
  const foot = houseFootprint(plan)
  if (foot.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const r of foot) {
    const b = tbox(r)
    minX = Math.min(minX, b.x0)
    maxX = Math.max(maxX, b.x1)
    minZ = Math.min(minZ, b.z0)
    maxZ = Math.max(maxZ, b.z1)
  }
  const depth = 3
  const width = Math.max(MIN_SIDE, snap(Math.min(6, maxX - minX)))
  // Праворуч від уже поставлених — щоб нова не лягла точно на стару.
  const right = zones.length ? Math.max(...zones.map((z) => z.x + z.width / 2)) : minX
  const id = `terr-${Date.now().toString(36)}`
  const zone: TerraceZone = { id, ...normalizeTerrace({ x: right + width / 2, z: maxZ + depth / 2, width, depth }) }
  return { zones: [...zones, zone], id }
}

// ---- Перевірка ----

export interface TerraceIssue {
  id: string
  kind: 'inside' | 'detached'
}

export function validateTerrace(plan: HousePlan, zones: TerraceZone[]): TerraceIssue[] {
  const foot = houseFootprint(plan)
  const out: TerraceIssue[] = []

  // 1. Заходить у контур будинку.
  const inside = new Set<string>()
  for (const z of zones) {
    if (foot.some((r) => overlapArea(z, r) > 0.02)) {
      inside.add(z.id)
      out.push({ id: z.id, kind: 'inside' })
    }
  }

  // 2. Не тримається будинку. Ланцюжком: зона біля зони біля будинку — ок.
  const linked = new Set<string>()
  let grew = true
  while (grew) {
    grew = false
    for (const z of zones) {
      if (linked.has(z.id)) continue
      const ok =
        foot.some((r) => touches(z, r)) || zones.some((o) => o.id !== z.id && linked.has(o.id) && touches(z, o))
      if (ok) {
        linked.add(z.id)
        grew = true
      }
    }
  }
  for (const z of zones) {
    if (!linked.has(z.id) && !inside.has(z.id)) out.push({ id: z.id, kind: 'detached' })
  }
  return out
}
