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

// Верх грані в точці `u` (світова висота). Для фронтону це лінія схилу.
//
// Обрізали ми це раніше цілими РЯДАМИ — і на панелі 1,2 м «сходинка» вздовж
// схилу виходила в пів метра голої основи. Тепер ріжемо КОЖЕН елемент і, якщо
// схил перетинає його, ще й ділимо на вузькі смуги: так само різали б панель
// на будові, і зріз читається як рівна діагональ.
export type HeightAt = (u: number) => number

// Крок дроблення елемента на діагоналі. Дрібний навмисно: при 80 мм і куті 35°
// «сходинка» виходила 5–6 см і читалась зубцями. Смуги, що лягли на повну
// висоту, потім зливаються назад в один елемент — тож дрібний крок нічого не
// коштує там, де схил елемент не перетинає.
const SLOPE_STEP = 0.022
// Наскільки елемент заходить ЗА лінію схилу. Точно по лінії лишався
// волосяний шов: сходинка завжди трохи не добирає. Надлишок ховається під
// похилою плитою (вона завтовшки 220 мм), тож назовні його не видно.
const SLOPE_OVER = 0.05

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

// Наскільки ЗОВНІШНЯ площина готового оздоблення відстоїть від площини стіни.
// Саме до неї підрізається оздоблення сусідньої стіни на розі: підрізання «до
// голої грані стіни» лишало смужку чужого матеріалу назовні.
export const cladOuter = (spec: FacadeSpec) => BACK_OUT + CLAD_GAP + cladThickness(spec)

// Елементи оздоблення однієї грані. baseY/height — прямокутник грані у світі.
export function claddingBoxes(
  face: WallFace,
  baseY: number,
  height: number,
  holes: FaceHole[],
  spec: FacadeSpec,
  heightAt?: HeightAt,
  withBacking = true,
  // Прив'язка розкладки для панелей: одна на ВЕСЬ будинок (ріг габариту).
  // Прив'язувати їх до початку кожної грані не можна — грані ріжуться
  // перегородками, і на кожному поверсі та на фронтоні шви розходились.
  panelAnchor = 0,
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

  // Елемент під схилом. Якщо схил його перетинає — ділимо на вузькі смуги й
  // кожну підрізаємо окремо: вийде рівний діагональний зріз, а не сходинка
  // заввишки з цілу панель.
  const putSloped = (u: number, v: number, du: number, dv: number) => {
    if (!heightAt) {
      put(elements, u, v, du, dv, cladC, t)
      return
    }
    const top = v + dv
    // Швидкий шлях: увесь елемент нижчий за схил — різати нічого.
    if (heightAt(u) >= top && heightAt(u + du) >= top && heightAt(u + du / 2) >= top) {
      put(elements, u, v, du, dv, cladC, t)
      return
    }
    // Смуги однакової висоти зливаємо назад в одну коробку: інакше суцільна
    // частина елемента розсипалась би на сотні дрібних, а шва між ними все
    // одно не видно.
    const steps = Math.max(1, Math.ceil(du / SLOPE_STEP))
    let runFrom = -1
    let runH = 0
    const flush = (until: number) => {
      if (runFrom < 0) return
      const su = u + (du * runFrom) / steps
      const sdu = (du * (until - runFrom)) / steps
      if (runH > 0.004) put(elements, su, v, sdu, runH, cladC, t)
      runFrom = -1
    }
    for (let i = 0; i < steps; i++) {
      const su = u + (du * i) / steps
      const sdu = du / steps
      // Беремо ВИЩИЙ кінець смуги плюс напуск: краще зайти під плиту, ніж
      // лишити волосяний шов — сходинка завжди трохи не добирає.
      const lim = Math.max(heightAt(su), heightAt(su + sdu)) + SLOPE_OVER
      const h = Math.min(top, lim) - v
      if (runFrom >= 0 && Math.abs(h - runH) > 1e-4) flush(i)
      if (runFrom < 0) {
        runFrom = i
        runH = h
      }
    }
    flush(steps)
  }

  const rects = freeRects(face.a, face.b, baseY, baseY + height, holes)
  const g = grid(spec)

  for (const [ua, ub, va, vb] of rects) {
    if (elements.length >= MAX_ELEMENTS) break

    // ---- Штукатурка: суцільний шар, без елементів ----
    if (!g) {
      if (heightAt) {
        // Під схилом кладемо вузькими смугами — зріз по діагоналі.
        const steps = Math.max(1, Math.ceil((ub - ua) / SLOPE_STEP))
        for (let i = 0; i < steps; i++) {
          const su = ua + ((ub - ua) * i) / steps
          const sdu = (ub - ua) / steps
          const lim = Math.max(heightAt(su), heightAt(su + sdu)) + SLOPE_OVER
          const h = Math.min(vb, lim) - va
          if (h > 0.004) put(elements, su, va, sdu, h, cladC, t)
        }
      } else {
        put(elements, ua, va, ub - ua, vb - va, cladC, t)
      }
      continue
    }

    // ---- Підкладка. На фронтоні її не треба: сам клин уже темний ----
    if (withBacking && !heightAt) {
      // На розі підкладка спиняється раніше за елементи (див. WallFace.backA).
      const ba = Math.max(ua, face.backA ?? ua)
      const bb = Math.min(ub, face.backB ?? ub)
      if (bb - ba > 0.004) put(backing, ba, va, bb - ba, vb - va, backC, BACK_OUT + 0.002)
    }
    void baseY

    // ---- Ряди елементів. Прив'язка до СВІТОВОГО нуля по обох осях ----
    // Усе рахуємо від СВІТОВОГО нуля: тільки так розкладка лишається суцільною
    // між поверхами й переходить на фронтон.
    const rowBase = 0
    const rowFrom = g.pv > 0 ? Math.floor((va - rowBase) / g.pv) : 0
    const rowTo = g.pv > 0 ? Math.ceil((vb - rowBase) / g.pv) : 1
    for (let row = rowFrom; row < rowTo; row++) {
      if (elements.length >= MAX_ELEMENTS) break
      const ry = g.pv > 0 ? rowBase + row * g.pv : va
      const rh = g.pv > 0 ? g.ev : vb - va
      const v = Math.max(ry, va)
      const dv = Math.min(ry + rh, vb) - v
      if (dv < 0.004) continue

      if (g.pu <= 0) {
        // Планка вздовж стіни — одна на весь вільний проміжок.
        putSloped(ua, v, ub - ua, dv)
        continue
      }
      // Перев'язка: кожен другий ряд зсунуто на пів елемента (для цегли).
      const stagger = spec.kind === 'clinker' && ((row % 2) + 2) % 2 === 1 ? g.pu / 2 : 0
      // Панелі кладуть від РОГУ БУДИНКУ цілою плитою: прив'язка спільна на
      // весь будинок, тож шви збігаються на всіх поверхах і на фронтоні.
      const anchor = spec.kind === 'panels' ? panelAnchor + stagger : stagger
      const colFrom = Math.floor((ua - anchor) / g.pu)
      const colTo = Math.ceil((ub - anchor) / g.pu)
      for (let col = colFrom; col < colTo; col++) {
        const cx = anchor + col * g.pu
        const u = Math.max(cx, ua)
        const du = Math.min(cx + g.eu, ub) - u
        if (du < 0.004) continue
        putSloped(u, v, du, dv)
      }
    }
  }
  return { elements, backing }
}
