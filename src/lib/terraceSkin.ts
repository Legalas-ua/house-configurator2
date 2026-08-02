import type { HousePlan, PlanRect, TerraceMatSpec } from '../config/types'
import type { CladBox } from './cladding'
import type { TerraceZone } from './terrace'

// ============================================================
// Покриття тераси — теж ОБ'ЄМНЕ: дошка чи плита завтовшки 50 мм лежить на
// площині, а між елементами лишається зазор, крізь який видно темну основу.
// Той самий принцип, що й на фасаді, тільки горизонтально.
// ============================================================

// Тераса НА ЗЕМЛІ — це підлога на ґрунті: 50 мм, і її верх має збігтися з
// верхом фундаменту (нуль). Тераса НА ПОВЕРСІ — тонке покриття поверх плити
// перекриття: 20 мм на 5 мм основи, інакше вона задирає рівень підлоги.
export const TERRACE_T_GROUND = 0.05
export const TERRACE_T_UPPER = 0.02
// Темна підкладка. На ЗЕМЛІ це окремий шар під настилом; на ПОВЕРСІ окремого
// шару немає взагалі — там просто фарбуємо верх плити перекриття, інакше
// настил підіймався б над рівнем підлоги.
export const TERRACE_BASE = 0.004
export const TERRACE_GAP = 0.001 // зазор між підкладкою і настилом
// На стільки треба підняти те, що стоїть на терасі поверху (паркан).
export const TERRACE_UP_STACK = TERRACE_T_UPPER
const MAX_ELEMENTS = 60_000

export interface TerraceSurface {
  floor: number // 0 — зони на землі, 1 — кімната-тераса 2-го поверху
  deck: number // рівень НИЗУ настилу
  t: number // товщина настилу
  paint: boolean // true — темне це фарбування плити, а не окремий шар
  rects: PlanRect[]
}

// Поверхні, які треба накрити: намальовані зони 1-го поверху й кімнати-тераси
// верхніх поверхів. Кімнату-терасу розширюємо до ЗОВНІШНЬОЇ грані стін —
// прямокутник кімнати заданий по осях стін, і покриття не діставало краю.
export function terraceSurfaces(
  plan: HousePlan,
  zones: TerraceZone[],
  floorH: number,
  wallHalf: number,
): TerraceSurface[] {
  const out: TerraceSurface[] = []
  // На землі верх настилу має збігтися з верхом фундаменту (нуль), тож увесь
  // пиріг лежить НИЖЧЕ нуля.
  if (zones.length > 0) out.push({ floor: 0, deck: -TERRACE_T_GROUND, t: TERRACE_T_GROUND, paint: false, rects: zones })
  plan.floors.forEach((fl, i) => {
    if (i === 0) return
    const rects = fl.rooms
      .filter((r) => r.type === 'terrace')
      .map((r) => ({
        x: r.x,
        z: r.z,
        width: r.width + 2 * wallHalf,
        depth: r.depth + 2 * wallHalf,
      }))
    // Настил лягає НА плиту: рівень підлоги поверху — це верх плити. Окремої
    // підкладки тут немає, темне — це сама плита, пофарбована в зоні тераси.
    if (rects.length > 0) out.push({ floor: i, deck: i * floorH, t: TERRACE_T_UPPER, paint: true, rects })
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
    const y = surf.deck + surf.t / 2

    for (const r of surf.rects) {
      const u0 = r.x - r.width / 2
      const u1 = r.x + r.width / 2
      const v0 = r.z - r.depth / 2
      const v1 = r.z + r.depth / 2
      // На поверсі — тонке ФАРБУВАННЯ верху плити (втоплене в неї), на землі —
      // окремий шар під настилом. І там, і там між ним і настилом рівно 1 мм.
      base.push({
        x: r.x,
        y: surf.paint
          ? surf.deck - TERRACE_GAP - TERRACE_BASE / 2
          : surf.deck - TERRACE_GAP - TERRACE_BASE / 2,
        z: r.z,
        dx: r.width,
        dy: TERRACE_BASE,
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
            dy: surf.t,
            dz: vb - va,
          })
        }
      }
    }
    if (boxes.length === 0) continue
    out.push({
      key: `${surf.floor}|${spec.kind}|${spec.color}`,
      floor: surf.floor,
      top: surf.deck + surf.t + 0.05,
      spec,
      boxes,
      base,
    })
  }
  return out
}
