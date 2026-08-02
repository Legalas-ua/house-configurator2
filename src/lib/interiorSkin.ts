import type { HousePlan, InteriorSpec, PlanRect } from '../config/types'
import type { CladBox } from './cladding'
import { NO_INTERIOR } from '../config/interior'

// ============================================================
// Підлога в кімнатах — така сама об'ємна розкладка, що й на терасі, тільки
// тонша: 15 мм покриття на 3 мм основи. Основа лежить ПІД покриттям із
// зазором, тож у шви видно її, а перетину немає.
// ============================================================

export const FLOOR_T = 0.015
export const FLOOR_BASE = 0.003
const GAP = 0.001
const MAX_ELEMENTS = 80_000

export interface FloorSurface {
  floor: number
  y: number // рівень підлоги поверху (верх плити)
  room: PlanRect & { id: string; name: string }
}

// Кімнати, які треба накрити. Прямокутник беремо як є: він заданий по осях
// стін, тож підлога заходить під стіну — і біля плінтуса не лишається щілини.
export function interiorSurfaces(plan: HousePlan, floorH: number): FloorSurface[] {
  const out: FloorSurface[] = []
  plan.floors.forEach((fl, i) => {
    for (const r of fl.rooms) {
      if (!r.id || NO_INTERIOR.includes(r.type)) continue
      out.push({
        floor: i,
        y: i * floorH,
        room: { x: r.x, z: r.z, width: r.width, depth: r.depth, id: r.id, name: r.type },
      })
    }
  })
  return out
}

function grid(s: InteriorSpec) {
  if (s.kind === 'carpet') return null // суцільне покриття, без розкладки
  if (s.kind === 'board') {
    const pitch = Math.max(0.05, s.boardWidth + 0.002)
    return s.dir === 'x'
      ? { pu: 1.6, eu: 1.58, pv: pitch, ev: s.boardWidth }
      : { pu: pitch, eu: s.boardWidth, pv: 1.6, ev: 1.58 }
  }
  const p = Math.max(0.15, s.tile)
  const e = Math.max(0.08, s.tile - s.joint)
  return { pu: p, eu: e, pv: p, ev: e }
}

export interface InteriorSkin {
  key: string
  floor: number
  top: number
  spec: InteriorSpec
  boxes: CladBox[]
  base: CladBox[]
}

// Розкладка прив'язана до світового нуля — на суміжних кімнатах візерунок
// продовжується, як і на справжній підлозі, укладеній наскрізь.
export function interiorSkin(
  surfaces: FloorSurface[],
  perFloor: InteriorSpec[],
  perRoom: Record<string, InteriorSpec>,
): InteriorSkin[] {
  const groups = new Map<string, InteriorSkin>()
  for (const s of surfaces) {
    const spec = perRoom[`${s.floor}|${s.room.id}`] ?? perFloor[s.floor] ?? perFloor[0]
    const key = `${s.floor}|${spec.kind}|${spec.color}|${spec.boardWidth}|${spec.dir}|${spec.tile}|${spec.joint}`
    let g = groups.get(key)
    if (!g) {
      g = { key, floor: s.floor, top: s.y + FLOOR_T + 0.05, spec, boxes: [], base: [] }
      groups.set(key, g)
    }
    const r = s.room
    const u0 = r.x - r.width / 2
    const u1 = r.x + r.width / 2
    const v0 = r.z - r.depth / 2
    const v1 = r.z + r.depth / 2
    // Основа — тонкий шар, утоплений у плиту: у шви видно її, а покриття
    // лежить вище з мікрозазором.
    g.base.push({
      x: r.x,
      y: s.y - GAP - FLOOR_BASE / 2,
      z: r.z,
      dx: r.width,
      dy: FLOOR_BASE,
      dz: r.depth,
    })

    const gr = grid(spec)
    if (!gr) {
      g.boxes.push({ x: r.x, y: s.y + FLOOR_T / 2, z: r.z, dx: r.width, dy: FLOOR_T, dz: r.depth })
      continue
    }
    const cols = Math.ceil((u1 - u0) / gr.pu) + 1
    const rows = Math.ceil((v1 - v0) / gr.pv) + 1
    for (let i = 0; i < rows && g.boxes.length < MAX_ELEMENTS; i++) {
      const vz = Math.floor(v0 / gr.pv) * gr.pv + i * gr.pv
      const va = Math.max(vz, v0)
      const vb = Math.min(vz + gr.ev, v1)
      if (vb - va < 0.01) continue
      // Дошку кладуть врозбіг: кожен ряд зсунуто на третину довжини.
      const off = spec.kind === 'board' ? (i % 3) * (gr.pu / 3) : 0
      for (let k = 0; k < cols && g.boxes.length < MAX_ELEMENTS; k++) {
        const ux = Math.floor(u0 / gr.pu) * gr.pu + k * gr.pu - off
        const ua = Math.max(ux, u0)
        const ub = Math.min(ux + gr.eu, u1)
        if (ub - ua < 0.01) continue
        g.boxes.push({
          x: (ua + ub) / 2,
          y: s.y + FLOOR_T / 2,
          z: (va + vb) / 2,
          dx: ub - ua,
          dy: FLOOR_T,
          dz: vb - va,
        })
      }
    }
  }
  return [...groups.values()].filter((g) => g.boxes.length > 0)
}
