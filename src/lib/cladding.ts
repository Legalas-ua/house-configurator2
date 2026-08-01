import type { FacadeSpec } from '../config/types'
import type { WallFace } from './wallFaces'
import { WALL_T } from './windows'

// ============================================================
// Оздоблення фасаду — РЕАЛЬНА геометрія, а не малюнок на стіні.
//
// Кожна цеглина / планка / панель — окрема коробка завтовшки CLAD_T, винесена
// за зовнішню грань стіни. Проміжки між ними НЕ заповнюються нічим: крізь них
// видно базову стіну, пофарбовану в антрацит, — саме вона й читається як
// темний шов. Тому окремого «кольору шва» ніде немає й бути не може.
//
// Штукатурка — суцільний шар PLASTER_T без елементів: у неї швів не буває.
// ============================================================

export const CLAD_T = 0.02 // цегла, термодерево, панелі — 20 мм
export const PLASTER_T = 0.01 // штукатурка — 10 мм суцільним шаром

// Клінкер: стандартна ложкова грань 250×65 із швом 12 мм.
export const BRICK_L = 0.25
export const BRICK_H = 0.065
export const BRICK_JOINT = 0.012

// Запобіжник від божевільної кількості елементів (наприклад, планка 60 мм на
// весь периметр двоповерхового будинку). Краще недомалювати верх стіни, ніж
// покласти сцену.
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

// Товщина шару під цей матеріал.
export const cladThickness = (spec: FacadeSpec) => (spec.kind === 'plaster' ? PLASTER_T : CLAD_T)

// Елементи оздоблення однієї грані. baseY/height — поверх, якому вона належить.
export function claddingBoxes(
  face: WallFace,
  baseY: number,
  height: number,
  holes: FaceHole[],
  spec: FacadeSpec,
  budget = MAX_ELEMENTS,
): CladBox[] {
  const t = cladThickness(spec)
  const n = face.horizontal ? face.nz : face.nx
  // Шар стоїть ЗА зовнішньою гранню стіни, з мікронапуском усередину, щоб на
  // стику не світилась щілина.
  const centre = face.line + n * (WALL_T / 2 + t / 2 - 0.001)
  const depth = t + 0.002

  const out: CladBox[] = []
  const push = (u: number, v: number, du: number, dv: number) => {
    if (du < 0.004 || dv < 0.004 || out.length >= budget) return
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
  if (!g) {
    // Штукатурка — суцільний шар на кожен вільний прямокутник.
    for (const [ua, ub, va, vb] of rects) push(ua, va, ub - ua, vb - va)
    return out
  }

  // Ряди рахуємо від НУЛЯ світу, а не від поверху: цегляна кладка на фасаді
  // наскрізна, і смуга на стику поверхів виглядала б обрізом.
  // Колонки — від початку САМОЇ грані: тоді на куті будинку лежить ціла
  // цеглина, а не випадковий обрубок.
  for (const [ua, ub, va, vb] of rects) {
    if (out.length >= budget) break
    const rowFrom = g.pv > 0 ? Math.floor(va / g.pv) : 0
    const rowTo = g.pv > 0 ? Math.ceil(vb / g.pv) : 1
    for (let row = rowFrom; row < rowTo; row++) {
      if (out.length >= budget) break
      const ry = g.pv > 0 ? row * g.pv : va
      const rh = g.pv > 0 ? g.ev : vb - va
      const v = Math.max(ry, va)
      const dv = Math.min(ry + rh, vb) - v
      if (dv < 0.004) continue
      if (g.pu <= 0) {
        // Планка вздовж стіни — одна на весь вільний проміжок.
        push(ua, v, ub - ua, dv)
        continue
      }
      // Перев'язка: кожен другий ряд зсунуто на пів елемента (для цегли).
      const stagger = spec.kind === 'clinker' && (((row % 2) + 2) % 2 === 1) ? g.pu / 2 : 0
      const base = face.a + stagger
      const colFrom = Math.floor((ua - base) / g.pu)
      const colTo = Math.ceil((ub - base) / g.pu)
      for (let col = colFrom; col < colTo; col++) {
        const cx = base + col * g.pu
        const u = Math.max(cx, ua)
        const du = Math.min(cx + g.eu, ub) - u
        if (du < 0.004) continue
        push(u, v, du, dv)
      }
    }
  }
  return out
}
