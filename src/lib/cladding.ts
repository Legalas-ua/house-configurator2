import type { FacadeSpec } from '../config/types'
import type { WallFace } from './wallFaces'
import { WALL_T } from './windows'

// ============================================================
// Оздоблення фасаду — РЕАЛЬНА геометрія, а не малюнок на стіні.
//
// Кожна цеглина / планка / панель — окрема коробка завтовшки CLAD_T, винесена
// за зовнішню грань стіни. У проміжки між ними видно ПІДКЛАДКУ — тонкий
// темний шар рівно на зовнішній площині стіни. Саме він читається як шов, і
// саме тому окремого «кольору шва» ніде немає. Фарбувати всю коробку стіни в
// антрацит не можна: тоді темними стають і кімнати всередині.
//
// Шар стоїть із мікрозазором ПЕРЕД стіною, а не втоплений у неї: сходження
// граней у товщі стіни давало миготіння (z-fighting) на кожній стіні.
//
// Розкладка прив'язана до СВІТОВОГО нуля, а не до початку грані. Довга стіна
// ріжеться перегородками на кілька граней, і прив'язка «від початку грані»
// збивала візерунок на кожному стику. Так само це зшиває розкладку стіни з
// розкладкою фронтону над нею.
// ============================================================

export const CLAD_T = 0.02 // цегла, термодерево, панелі — 20 мм
export const PLASTER_T = 0.01 // штукатурка — 10 мм суцільним шаром
export const BACK_OUT = 0.004 // наскільки темна підкладка виступає за стіну
export const CLAD_GAP = 0.001 // ледь помітний зазор між підкладкою і елементом

// Клінкер: стандартна ложкова грань 250×65 із швом 12 мм.
export const BRICK_L = 0.25
export const BRICK_H = 0.065
export const BRICK_JOINT = 0.012

// Запобіжник від божевільної кількості елементів (наприклад, планка 60 мм на
// весь периметр двоповерхового будинку).
const MAX_ELEMENTS = 90_000

export interface CladBox {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
}

// Отвір у координатах ГРАНІ: вздовж стіни та по висоті у світі.
export interface FaceHole {
  a: number
  b: number
  y0: number
  y1: number
}

// Обрізка грані по висоті — для фронтонів: на висоті [v0,v1] стіна існує лише
// в цьому проміжку вздовж себе. null = на цій висоті стіни немає.
export type Clip = (v0: number, v1: number) => [number, number] | null

export interface CladResult {
  elements: CladBox[]
  backing: CladBox[]
}

// Вільні прямокутники грані = грань мінус отвори. Ріжемо по горизонталях
// (низ/верх кожного отвору), у кожній смузі беремо доповнення зайнятих
// проміжків. Того самого прийому вживають простінки стін у HouseShell.
function freeRects(u0: number, u1: number, v0: number, v1: number, holes: FaceHole[]): number[][] {
  const rows = new Set<number>([v0, v1])
  for (const h of holes) {
    if (h.y0 > v0 + 0.002 && h.y0 < v1 - 0.002) rows.add(h.y0)
    if (h.y1 > v0 + 0.002 && h.y1 < v1 - 0.002) rows.add(h.y1)
  }
  const ys = [...rows].sort((p, q) => p - q)
  const out: number[][] = []
  for (let i = 0; i + 1 < ys.length; i++) {
    const ya = ys[i]
    const yb = ys[i + 1]
    if (yb - ya < 0.005) continue
    const mid = (ya + yb) / 2
    const busy = holes
      .filter((h) => h.y0 < mid && h.y1 > mid)
      .map((h) => [Math.max(h.a, u0), Math.min(h.b, u1)])
      .filter(([p, q]) => q - p > 0.002)
      .sort((p, q) => p[0] - q[0])
    let cur = u0
    for (const [p, q] of busy) {
      if (p - cur > 0.005) out.push([cur, p, ya, yb])
      cur = Math.max(cur, q)
    }
    if (u1 - cur > 0.005) out.push([cur, u1, ya, yb])
  }
  return out
}

// Крок сітки елементів (уздовж стіни, по висоті) і розмір самого елемента.
function grid(spec: FacadeSpec): { pu: number; pv: number; eu: number; ev: number } | null {
  if (spec.kind === 'plaster') return null
  if (spec.kind === 'clinker') {
    return { pu: BRICK_L + BRICK_JOINT, pv: BRICK_H + BRICK_JOINT, eu: BRICK_L, ev: BRICK_H }
  }
  if (spec.kind === 'thermowood') {
    const pitch = Math.max(0.03, spec.plankWidth + spec.plankGap)
    // Планка — суцільна вздовж себе; поперек іде крок «планка + зазор».
    return spec.plankDir === 'horizontal'
      ? { pu: 0, pv: pitch, eu: 0, ev: spec.plankWidth }
      : { pu: pitch, pv: 0, eu: spec.plankWidth, ev: 0 }
  }
  const w = Math.max(0.15, spec.panelWidth)
  const h = spec.panelShape === 'square' ? w : Math.max(0.15, spec.panelHeight)
  const gap = 0.008
  return { pu: w, pv: h, eu: w - gap, ev: h - gap }
}

export const cladThickness = (spec: FacadeSpec) => (spec.kind === 'plaster' ? PLASTER_T : CLAD_T)

// Елементи оздоблення однієї грані. baseY/height — прямокутник грані у світі.
export function claddingBoxes(
  face: WallFace,
  baseY: number,
  height: number,
  holes: FaceHole[],
  spec: FacadeSpec,
  clip?: Clip,
  withBacking = true,
): CladResult {
  const t = cladThickness(spec)
  const n = face.horizontal ? face.nz : face.nx
  const outer = face.line + n * (face.halfT ?? WALL_T / 2) // зовнішня площина стіни
  const backC = outer + n * (BACK_OUT / 2 - 0.002) // підкладка: 2 мм у стіну, 4 мм назовні
  const cladC = outer + n * (BACK_OUT + CLAD_GAP + t / 2)

  const elements: CladBox[] = []
  const backing: CladBox[] = []
  const put = (out: CladBox[], u: number, v: number, du: number, dv: number, centre: number, depth: number) => {
    if (du < 0.004 || dv < 0.004 || out.length >= MAX_ELEMENTS) return
    const uc = u + du / 2
    const vc = v + dv / 2
    out.push(
      face.horizontal
        ? { x: uc, y: vc, z: centre, dx: du, dy: dv, dz: depth }
        : { x: centre, y: vc, z: uc, dx: depth, dy: dv, dz: du },
    )
  }

  const rects = freeRects(face.a, face.b, baseY, baseY + height, holes)
  const g = grid(spec)

  for (const [ua0, ub0, va, vb] of rects) {
    if (elements.length >= MAX_ELEMENTS) break

    // ---- Штукатурка: суцільний шар, без елементів і без підкладки ----
    if (!g) {
      if (clip) {
        // На фронтоні ріжемо шар тонкими смугами по нахилу.
        const steps = Math.max(1, Math.ceil((vb - va) / 0.1))
        for (let i = 0; i < steps; i++) {
          const y0 = va + ((vb - va) * i) / steps
          const y1 = va + ((vb - va) * (i + 1)) / steps
          const c = clip(y0, y1)
          if (!c) continue
          const a = Math.max(ua0, c[0])
          const b = Math.min(ub0, c[1])
          if (b - a > 0.005) put(elements, a, y0, b - a, y1 - y0, cladC, t)
        }
      } else {
        put(elements, ua0, va, ub0 - ua0, vb - va, cladC, t)
      }
      continue
    }

    // ---- Підкладка: суцільна темна площина під елементами ----
    if (withBacking && !clip) put(backing, ua0, va, ub0 - ua0, vb - va, backC, BACK_OUT + 0.002)

    // ---- Ряди елементів. Прив'язка до СВІТОВОГО нуля по обох осях ----
    const rowFrom = g.pv > 0 ? Math.floor(va / g.pv) : 0
    const rowTo = g.pv > 0 ? Math.ceil(vb / g.pv) : 1
    for (let row = rowFrom; row < rowTo; row++) {
      if (elements.length >= MAX_ELEMENTS) break
      const ry = g.pv > 0 ? row * g.pv : va
      const rh = g.pv > 0 ? g.ev : vb - va
      const v = Math.max(ry, va)
      const dv = Math.min(ry + rh, vb) - v
      if (dv < 0.004) continue

      // Обрізка фронтону: беремо ВЕРХ ряду, щоб нічого не стирчало за схил.
      let ua = ua0
      let ub = ub0
      if (clip) {
        const c = clip(v, v + dv)
        if (!c) continue
        ua = Math.max(ua, c[0])
        ub = Math.min(ub, c[1])
        if (ub - ua < 0.005) continue
        if (withBacking) put(backing, ua, v, ub - ua, dv, backC, BACK_OUT + 0.002)
      }

      if (g.pu <= 0) {
        // Планка вздовж стіни — одна на весь вільний проміжок.
        put(elements, ua, v, ub - ua, dv, cladC, t)
        continue
      }
      // Перев'язка: кожен другий ряд зсунуто на пів елемента (для цегли).
      const stagger = spec.kind === 'clinker' && ((row % 2) + 2) % 2 === 1 ? g.pu / 2 : 0
      const colFrom = Math.floor((ua - stagger) / g.pu)
      const colTo = Math.ceil((ub - stagger) / g.pu)
      for (let col = colFrom; col < colTo; col++) {
        const cx = stagger + col * g.pu
        const u = Math.max(cx, ua)
        const du = Math.min(cx + g.eu, ub) - u
        if (du < 0.004) continue
        put(elements, u, v, du, dv, cladC, t)
      }
    }
  }
  return { elements, backing }
}
