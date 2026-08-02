import type { HousePlan, PlanRect, TerraceMatSpec } from '../config/types'
import type { CladBox } from './cladding'
import type { TerraceZone } from './terrace'

// ============================================================
// Покриття тераси — теж ОБ'ЄМНЕ: дошка чи плита завтовшки 50 мм лежить на
// площині, а між елементами лишається зазор, крізь який видно темну основу.
// Той самий принцип, що й на фасаді, тільки горизонтально.
// ============================================================

export const TERRACE_T = 0.05 // товщина покриття
const BASE_DROP = 0.012 // на скільки основа нижча — вона й читається як шов
const MAX_ELEMENTS = 60_000

export interface TerraceSurface {
  floor: number // 0 — зони на землі, 1 — кімната-тераса 2-го поверху
  y: number // рівень, на якому лежить покриття
  rects: PlanRect[]
}

// Поверхні, які треба накрити: намальовані зони 1-го поверху й кімнати-тераси
// верхніх поверхів.
export function terraceSurfaces(plan: HousePlan, zones: TerraceZone[], floorH: number): TerraceSurface[] {
  const out: TerraceSurface[] = []
  if (zones.length > 0) out.push({ floor: 0, y: 0, rects: zones })
  plan.floors.forEach((fl, i) => {
    if (i === 0) return
    const rects = fl.rooms.filter((r) => r.type === 'terrace')
    if (rects.length > 0) out.push({ floor: i, y: i * floorH, rects })
  })
  return out
}

// Чи є на 2-му поверсі кімната-тераса — від цього залежить, чи активний
// перемикач поверху на кроці «Покриття тераси».
export const hasUpperTerrace = (plan: HousePlan) =>
  plan.floors.some((fl, i) => i > 0 && fl.rooms.some((r) => r.type === 'terrace'))

// Крок сітки та розмір елемента для цього покриття.
function grid(s: TerraceMatSpec) {
  if (s.kind === 'decking') {
    const pitch = Math.max(0.05, s.boardWidth + s.gap)
    // Дошка суцільна вздовж себе; поперек — крок «дошка + зазор».
    return s.dir === 'x'
      ? { pu: 0, eu: 0, pv: pitch, ev: s.boardWidth }
      : { pu: pitch, eu: s.boardWidth, pv: 0, ev: 0 }
  }
  const p = Math.max(0.2, s.tile)
  const e = Math.max(0.1, s.tile - s.joint)
  return { pu: p, eu: e, pv: p, ev: e }
}

export interface TerraceSkin {
  key: string
  floor: number
  top: number
  spec: TerraceMatSpec
  boxes: CladBox[]
  base: CladBox[]
}

// Розкладка по всіх поверхнях. u — вісь X, v — вісь Z; прив'язка до світового
// нуля, тож на сусідніх зонах візерунок не збивається.
export function terraceSkin(surfaces: TerraceSurface[], specs: TerraceMatSpec[]): TerraceSkin[] {
  const out: TerraceSkin[] = []
  for (const surf of surfaces) {
    const spec = specs[surf.floor] ?? specs[0]
    const g = grid(spec)
    const boxes: CladBox[] = []
    const base: CladBox[] = []
    const y = surf.y + TERRACE_T / 2

    for (const r of surf.rects) {
      const u0 = r.x - r.width / 2
      const u1 = r.x + r.width / 2
      const v0 = r.z - r.depth / 2
      const v1 = r.z + r.depth / 2
      // Темна основа під покриттям — у зазори видно саме її.
      base.push({
        x: r.x,
        y: surf.y + (TERRACE_T - BASE_DROP) / 2,
        z: r.z,
        dx: r.width,
        dy: TERRACE_T - BASE_DROP,
        dz: r.depth,
      })

      const cols = g.pu > 0 ? Math.ceil((u1 - u0) / g.pu) + 1 : 1
      const rows = g.pv > 0 ? Math.ceil((v1 - v0) / g.pv) + 1 : 1
      for (let i = 0; i < rows && boxes.length < MAX_ELEMENTS; i++) {
        const vz = g.pv > 0 ? Math.floor(v0 / g.pv) * g.pv + i * g.pv : v0
        const va = Math.max(vz, v0)
        const vb = Math.min(g.pv > 0 ? vz + g.ev : v1, v1)
        if (vb - va < 0.01) continue
        for (let k = 0; k < cols && boxes.length < MAX_ELEMENTS; k++) {
          const ux = g.pu > 0 ? Math.floor(u0 / g.pu) * g.pu + k * g.pu : u0
          const ua = Math.max(ux, u0)
          const ub = Math.min(g.pu > 0 ? ux + g.eu : u1, u1)
          if (ub - ua < 0.01) continue
          boxes.push({
            x: (ua + ub) / 2,
            y,
            z: (va + vb) / 2,
            dx: ub - ua,
            dy: TERRACE_T,
            dz: vb - va,
          })
        }
      }
    }
    if (boxes.length === 0) continue
    out.push({
      key: `${surf.floor}|${spec.kind}|${spec.color}`,
      floor: surf.floor,
      top: surf.y + TERRACE_T + 0.05,
      spec,
      boxes,
      base,
    })
  }
  return out
}
