import type { FloorPlan, HousePlan } from '../config/types'
import { ringContains, unionOutline, type Point, type Ring } from './outline'
import { WALL_T } from './windows'

// На стільки грань «загортається» за ріг. Значення фіксоване, а не за
// товщиною матеріалу: на сусідніх стінах матеріали можуть бути різні, а стик
// має зійтись однаково. Збігається з CLAD_T у lib/cladding.ts.
const CORNER = 0.02

// ============================================================
// Зовнішні стіни поверху, розібрані на ГРАНІ — те, що на кроці «Фасад» можна
// вибрати й оздобити окремо.
//
// Межі грані задані двома правилами замовника:
//   • довга стіна ріжеться по СЕРЕДИНАХ внутрішніх перегородок (а середина
//     перегородки — це і є межа кімнати на плані, стіни ж симетричні осі);
//   • на зовнішньому куті грань доходить рівно до кута.
//
// Ідентифікатор грані складається з її геометрії. Плани стоять на сітці 0.5,
// тож id стабільний, поки не змінили саме планування — а фасад іде вже після.
// ============================================================

export interface WallFace {
  id: string
  floor: number
  horizontal: boolean // стіна тягнеться вздовж X
  line: number // координата ОСІ стіни
  nx: number // зовнішня нормаль
  nz: number
  a: number // межі вздовж стіни
  b: number
  // Відстань від `line` до зовнішньої ПЛОЩИНИ. У стіни це пів товщини; у
  // фронтону над дахом площина збігається з `line`, тож там 0.
  halfT?: number
}

const EPS = 1e-4
const MIN_FACE = 0.4 // вужчий клапоть окремою стіною не вважаємо

// Контур СТІН поверху: плита мінус тераси — тераса відкрита, її не обносять.
export const wallRings = (fl: FloorPlan): Ring[] =>
  unionOutline(
    fl.slab,
    fl.rooms.filter((r) => r.type === 'terrace'),
  )

// Точка всередині фігури? Кільця вкладені (виріз усередині контуру), тож
// рахуємо парність перетинів.
function insideRings(rings: Ring[], p: Point): boolean {
  let n = 0
  for (const r of rings) if (ringContains(r.pts, p)) n++
  return n % 2 === 1
}

// Де цю стіну перетинають внутрішні перегородки. Перегородка — межа кімнати,
// що ПРИЛЯГАЄ до цієї стіни; беремо саме її координату, бо стіна симетрична
// своїй осі, і «середина перегородки» = ця координата.
function partitionCuts(fl: FloorPlan, horizontal: boolean, line: number, a: number, b: number): number[] {
  const set = new Set<number>()
  for (const r of fl.rooms) {
    if (r.type === 'terrace') continue
    const x0 = r.x - r.width / 2
    const x1 = r.x + r.width / 2
    const z0 = r.z - r.depth / 2
    const z1 = r.z + r.depth / 2
    const touches = horizontal
      ? Math.abs(z0 - line) < 0.05 || Math.abs(z1 - line) < 0.05
      : Math.abs(x0 - line) < 0.05 || Math.abs(x1 - line) < 0.05
    if (!touches) continue
    for (const v of horizontal ? [x0, x1] : [z0, z1]) {
      if (v > a + MIN_FACE && v < b - MIN_FACE) set.add(Math.round(v * 1000) / 1000)
    }
  }
  return [...set].sort((p, q) => p - q)
}

export function wallFaces(plan: HousePlan): WallFace[] {
  const out: WallFace[] = []
  plan.floors.forEach((fl, floor) => {
    const rings = wallRings(fl)
    for (const { pts } of rings) {
      for (let i = 0; i < pts.length; i++) {
        const [x0, z0] = pts[i]
        const [x1, z1] = pts[(i + 1) % pts.length]
        const horizontal = Math.abs(z1 - z0) < EPS
        const line = horizontal ? z0 : x0
        const a = Math.min(horizontal ? x0 : z0, horizontal ? x1 : z1)
        const b = Math.max(horizontal ? x0 : z0, horizontal ? x1 : z1)
        if (b - a < MIN_FACE) continue
        // Зовнішня нормаль — той бік, де будинку НЕМАЄ. Напрямок обходу кілець
        // тут навмисно не використовуємо: він залежить від реалізації
        // unionOutline, а проба точкою — ні.
        const mid = (a + b) / 2
        const probe = (s: number): Point => (horizontal ? [mid, line + s] : [line + s, mid])
        const sign = insideRings(rings, probe(0.25)) ? -1 : 1
        // Кінці ребра — справжні роги будинку. Оздоблення має доходити до
        // рогу, а не спинятись на ОСІ перпендикулярної стіни (звідки й бралась
        // непокрита смуга шириною в пів стіни на кожному куті).
        //
        // На ОПУКЛОМУ розі грань «загортається» за ріг, на ВГНУТОМУ —
        // навпаки, підрізається, щоб не влізти в оздоблення сусідньої стіни:
        // саме таке накладання давало миготіння у внутрішніх кутах.
        // Горизонтальна стіна завжди «володіє» рогом, вертикальна поступається
        // — тоді два шари стикаються, а не сходяться в одній площині.
        const endShift = (at: number, dir: -1 | 1) => {
          const probe: Point = horizontal ? [at + dir * 0.06, line + sign * 0.06] : [line + sign * 0.06, at + dir * 0.06]
          const convex = !insideRings(rings, probe)
          if (convex) return horizontal ? WALL_T / 2 + CORNER : WALL_T / 2
          return horizontal ? -(WALL_T / 2 + CORNER) : 0
        }
        const ea = endShift(a, -1)
        const eb = endShift(b, 1)

        const cuts = partitionCuts(fl, horizontal, line, a, b)
        const stops = [a - ea, ...cuts, b + eb]
        for (let k = 0; k + 1 < stops.length; k++) {
          const fa = stops[k]
          const fb = stops[k + 1]
          if (fb - fa < MIN_FACE) continue
          out.push({
            id: `${floor}|${horizontal ? 'h' : 'v'}|${line.toFixed(2)}|${fa.toFixed(2)}|${fb.toFixed(2)}`,
            floor,
            horizontal,
            line,
            nx: horizontal ? 0 : sign,
            nz: horizontal ? sign : 0,
            a: fa,
            b: fb,
          })
        }
      }
    }
  })
  return out
}
