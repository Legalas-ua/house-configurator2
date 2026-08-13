// ============================================================
// ПРЯМИЙ СКЕЛЕТ даху над складеною зоною.
//
// Зона з кількох прямокутників — це Г-, Т- або хрестоподібний контур. Один
// «намет» на габарит такого контуру архітектурно неправильний: над вирізом
// даху немає, а крило мусить ВРІЗАТИСЬ у головний схил, і на стику лягає
// єндова. Саме це й рахує цей модуль.
//
// Ключове спрощення, завдяки якому обійшлось без справжнього алгоритму
// wavefront: усі грані контуру осьові, кути тільки 90° і 270°. Для такого
// контуру прямий скелет — це відстань до карниза, узята в «ШАХОВІЙ» метриці
// (L∞: більша з двох координатних відстаней, а не гіпотенуза):
//
//     висота(p) = tan(кут) · min(шахова відстань від p до кожного КАРНИЗА)
//
// Саме шахова, а не звичайна. Звичайна відстань в увігнутому (270°) куті
// міряється до самої ВЕРШИНИ, і межа схилу виходить кривою (парабола), а не
// рівною лінією — на даху це читалось би як вигнута єндова. Шахова дає рівно
// те, що й розсув фронту: з опуклого кута — вальма під 45°, з увігнутого —
// єндова під 45°.
//
// Фронтон — це грань, від якої схил НЕ росте (`rising: false`): вона просто
// випадає з мінімуму, і сусідні схили сходяться над нею вертикальною стіною.
// Так одним механізмом виходять і вальмовий (усі грані карнизи), і двосхилий
// (карнизи лише вздовж гребеня), і врізка крила під власним гребенем.
// ============================================================

export interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
}

// Грань контуру. `horizontal` — іде вздовж X (нормаль по Z).
export interface SkelEdge {
  horizontal: boolean
  line: number // z для горизонтальної грані, x для вертикальної
  a: number // початок уздовж грані (x або z)
  b: number // кінець
  n: number // +1/-1 — куди дивиться ЗОВНІ по нормалі
  own: number // ЧИЯ це грань — індекс прямокутника зони за нею
  rising: boolean // карниз (від нього росте схил) чи фронтон (вертикальна стіна)
  // КУТОВА грань. Там, де карниз упирається в фронтон (а не переходить у
  // сусідній карниз), дах загортає за ріг окремим трикутником: висота там
  // задана не відстанню від карниза, а відстанню від його КІНЦЯ. Це не стіна
  // будинку — карниза, планок і кожуха на ній немає.
  corner?: boolean
  parent?: SkelEdge // для кутової грані — карниз, ріг якого вона загортає
}

// Профіль схилу: на відстані `t` від карниза скат займає [lo, hi] уздовж
// грані. Між вузлами — рівно лінійно (усі межі під 45° або паралельні
// карнизу), тож проміжних точок не треба.
export interface SkelStep {
  t: number
  lo: number
  hi: number
}

export interface SkelFace {
  edge: SkelEdge
  steps: SkelStep[]
}

const EPS = 1e-6

export const boxOf = (r: { x: number; z: number; width: number; depth: number }): Box => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})

export function insideBoxes(boxes: Box[], x: number, z: number, pad = 1e-4): boolean {
  return boxes.some((b) => x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad)
}

// ---- Контур об'єднання прямокутників ----

const uniqSorted = (v: number[]) => {
  const s = [...v].sort((p, q) => p - q)
  return s.filter((x, i) => i === 0 || x - s[i - 1] > 1e-6)
}

// Грані контуру об'єднання. Рахуємо по сітці з усіх координат прямокутників:
// клітинка або накрита, або ні, а грань контуру — там, де накрита межує з
// порожньою. Сусідні співлінійні відрізки зшиваються в одну грань — але
// ЛИШЕ доки за ними той самий прямокутник: одна пряма стіна може бути
// фронтоном головної частини й карнизом крила водночас, і зшити їх в одну
// грань означало б утратити врізку.
export function outlineEdges(boxes: Box[], main = -1): Omit<SkelEdge, 'rising'>[] {
  const xs = uniqSorted(boxes.flatMap((b) => [b.x0, b.x1]))
  const zs = uniqSorted(boxes.flatMap((b) => [b.z0, b.z1]))
  const nx = xs.length - 1
  const nz = zs.length - 1
  const cell = (i: number, j: number): [number, number] | null =>
    i >= 0 && j >= 0 && i < nx && j < nz ? [(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2] : null
  const filled = (i: number, j: number) => {
    const c = cell(i, j)
    return c !== null && insideBoxes(boxes, c[0], c[1])
  }
  // Чия клітинка. Спірні (накриті кількома) віддаємо ГОЛОВНІЙ частині — це
  // вона задає дах, а решта до неї врізається. Головної не задано — більшій.
  const covers = (b: Box, c: [number, number]) => c[0] >= b.x0 && c[0] <= b.x1 && c[1] >= b.z0 && c[1] <= b.z1
  const owner = (i: number, j: number) => {
    const c = cell(i, j)
    if (!c) return 0
    if (main >= 0 && main < boxes.length && covers(boxes[main], c)) return main
    let own = 0
    let area = -1
    boxes.forEach((b, k) => {
      if (!covers(b, c)) return
      const a = (b.x1 - b.x0) * (b.z1 - b.z0)
      if (a > area) {
        area = a
        own = k
      }
    })
    return own
  }

  const out: Omit<SkelEdge, 'rising'>[] = []
  const push = (horizontal: boolean, line: number, a: number, b: number, n: number, own: number) => {
    const last = out[out.length - 1]
    if (
      last &&
      last.horizontal === horizontal &&
      last.line === line &&
      last.n === n &&
      last.own === own &&
      Math.abs(last.b - a) < 1e-6
    ) {
      last.b = b
      return
    }
    out.push({ horizontal, line, a, b, n, own })
  }
  // Горизонтальні (уздовж X) — на кожній лінії z.
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i < nx; i++) {
      const below = filled(i, j - 1)
      const above = filled(i, j)
      if (below === above) continue
      push(true, zs[j], xs[i], xs[i + 1], below ? 1 : -1, owner(i, below ? j - 1 : j))
    }
  // Вертикальні (уздовж Z) — на кожній лінії x.
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j < nz; j++) {
      const left = filled(i - 1, j)
      const right = filled(i, j)
      if (left === right) continue
      push(false, xs[i], zs[j], zs[j + 1], left ? 1 : -1, owner(left ? i - 1 : i, j))
    }
  return out
}

// Клітинки, з яких складається контур: по них зшивається ДНО тіла даху.
export function unionCells(boxes: Box[]): Box[] {
  const xs = uniqSorted(boxes.flatMap((b) => [b.x0, b.x1]))
  const zs = uniqSorted(boxes.flatMap((b) => [b.z0, b.z1]))
  const out: Box[] = []
  for (let i = 0; i < xs.length - 1; i++)
    for (let j = 0; j < zs.length - 1; j++)
      if (insideBoxes(boxes, (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2))
        out.push({ x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] })
  return out
}

// ---- Висота даху ----

// Дві складові шахової відстані: `over` — наскільки точка вийшла ЗА кінець
// грані вздовж неї, `perp` — наскільки відійшла від її лінії. Відстань —
// більша з них; яка саме більша, вирішує, чи точка на самому схилі, чи вже
// за його рогом.
export function edgeParts(e: SkelEdge, x: number, z: number): [number, number] {
  const [u, v] = e.horizontal ? [x, z] : [z, x]
  return [Math.max(e.a - u, 0, u - e.b), Math.abs(v - e.line)]
}

export function edgeDist(e: SkelEdge, x: number, z: number): number {
  const [over, perp] = edgeParts(e, x, z)
  return Math.max(over, perp)
}

// Відстань у ПЛАНІ до найближчого карниза. Висота = ця відстань × tan(кут).
export function planRise(edges: SkelEdge[], x: number, z: number): number {
  let best = Infinity
  for (const e of edges) if (e.rising) best = Math.min(best, edgeDist(e, x, z))
  return best === Infinity ? 0 : best
}

// Точка на схилі грані `e`: `u` вздовж грані, `t` углиб від карниза.
export function facePoint(e: SkelEdge, u: number, t: number): [number, number] {
  const inward = -e.n * t
  return e.horizontal ? [u, e.line + inward] : [e.line + inward, u]
}

// Кутові грані: по одній з кожного кінця кожного карниза, перпендикулярно до
// нього й углиб. Де карниз переходить у сусідній карниз (звичайна вальма),
// така грань виходить порожньою й сама відпадає — її просто перебиває
// ближчий справжній карниз.
function cornerEdges(edges: SkelEdge[], reach: number): SkelEdge[] {
  const out: SkelEdge[] = []
  // Грань контуру, що впирається в кінець `end` грані `e`.
  const nextTo = (e: SkelEdge, end: number) =>
    edges.find(
      (o) =>
        o !== e &&
        o.horizontal !== e.horizontal &&
        Math.abs(o.line - end) < 0.01 &&
        e.line > o.a - 0.01 &&
        e.line < o.b + 0.01,
    )
  for (const e of edges) {
    if (!e.rising) continue
    // Углиб від грані — у бік, протилежний зовнішній нормалі.
    const from = e.line
    const to = e.line - e.n * reach
    for (const [end, n] of [
      [e.a, 1],
      [e.b, -1],
    ] as const) {
      // За кінцем карниза дах загортається двома гранями. ПЕРША — упоперек
      // карниза: вона й дає трикутник на розі. Якщо за рогом знову карниз, той
      // бік накриває власний схил, і ця грань лягала б поверх нього другим
      // шаром покриття.
      if (!nextTo(e, end)?.rising)
        out.push({
          horizontal: !e.horizontal,
          line: end,
          a: Math.min(from, to),
          b: Math.max(from, to),
          n,
          own: e.own,
          rising: true,
          corner: true,
          parent: e,
        })
    }
  }
  return out
}

// Співлінійні сусідні грані з однаковою нормаллю й однаковою роллю — це ОДНА
// грань. Розрізаними вони виходять із контуру лише тому, що за ними різні
// прямокутники зони; лишити їх нарізкою не можна — кожна з них розповзається
// за свій кінець, і сусідні схили накривають ту саму ділянку ДВІЧІ (покриття
// лягало другим шаром).
export function mergeEdges(edges: SkelEdge[]): SkelEdge[] {
  const sorted = [...edges].sort(
    (p, q) =>
      Number(p.horizontal) - Number(q.horizontal) ||
      p.line - q.line ||
      p.n - q.n ||
      Number(p.rising) - Number(q.rising) ||
      p.a - q.a,
  )
  const out: SkelEdge[] = []
  for (const e of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      last.horizontal === e.horizontal &&
      Math.abs(last.line - e.line) < 1e-6 &&
      last.n === e.n &&
      last.rising === e.rising &&
      Math.abs(last.b - e.a) < 1e-6
    ) {
      last.b = e.b
      continue
    }
    out.push({ ...e })
  }
  return out
}

// ---- Розкрій схилів ----

// Чи належить точка (u, t) саме цьому схилу: вона всередині контуру і жоден
// інший карниз не ближчий за власний.
function owns(
  boxes: Box[],
  edges: SkelEdge[],
  e: SkelEdge,
  u: number,
  t: number,
  // Точку вже накрив ВИЩИЙ сусід: тут наш дах закінчується єндовою.
  covered?: (x: number, z: number, t: number) => boolean,
): boolean {
  const [x, z] = facePoint(e, u, t)
  if (!insideBoxes(boxes, x, z)) return false
  if (covered?.(x, z, t)) return false
  // За кінцем грані точка вже далі за t — там схил і закінчується. Без цієї
  // перевірки схил «розповзався» вздовж власної лінії на весь контур.
  if (edgeDist(e, x, z) > t + 1e-4) return false
  // Кутова грань живе ЛИШЕ за рогом свого карниза — там, де точка вийшла за
  // його кінець далі, ніж відійшла від його лінії. Інакше вона залазила б на
  // сам карниз і псувала розкрій.
  // Кутова грань живе ЛИШЕ за рогом свого карниза — там, де точка вийшла за
  // його кінець далі, ніж відійшла від його лінії. Інакше вона залазила б на
  // сам карниз і псувала розкрій.
  if (e.parent) {
    const [over, perp] = edgeParts(e.parent, x, z)
    if (perp > over + 1e-4) return false
  }
  // І головне: висота даху в цій точці має збігатися з висотою НА ЦЬОМУ
  // схилі. Нижче — точку забрав ближчий карниз, вище — цей схил сюди просто
  // не дістає (так самі собою відпадають зайві кутові грані).
  const h = planRise(edges, x, z)
  return h > t - 1e-4 && h < t + 1e-4
}

// Смуга схилу на відстані t: [lo, hi] уздовж грані. Біля УВІГНУТОГО кута схил
// розширюється за власну грань, тож шукаємо ширше за [a, b]. Межі йдуть під
// 45° або паралельно карнизу, тож досить грубого проходу з уточненням
// поділом навпіл.
function spanAt(
  boxes: Box[],
  edges: SkelEdge[],
  e: SkelEdge,
  t: number,
  uMin: number,
  uMax: number,
  covered: ((x: number, z: number, t: number) => boolean) | undefined,
  // Смуга на попередній глибині. Межі схилу йдуть під 45°, тож нова смуга
  // лежить поруч — шукаємо спершу там, дрібним кроком. Без цього груба вибірка
  // по всій ширині зони просто ПЕРЕСТРИБУВАЛА вузьку смужку біля вістря, і на
  // вальмі лишався непокритий трикутник.
  hint?: [number, number],
): [number, number] | null {
  if (hint) {
    const near = scan(boxes, edges, e, t, Math.max(uMin, hint[0] - 0.35), Math.min(uMax, hint[1] + 0.35), covered)
    if (near) return near
  }
  return scan(boxes, edges, e, t, uMin, uMax, covered)
}

function scan(
  boxes: Box[],
  edges: SkelEdge[],
  e: SkelEdge,
  t: number,
  uMin: number,
  uMax: number,
  covered?: (x: number, z: number, t: number) => boolean,
): [number, number] | null {
  // Грубий прохід + уточнення поділом навпіл. Дрібніше не треба: усі межі
  // прямі, а дуже вузьких клаптів у прямокутного контуру не буває.
  const n = 64
  const step = (uMax - uMin) / n
  const at = (i: number) => uMin + step * i
  let bestA = -1
  let bestB = -1
  let runA = -1
  for (let i = 0; i <= n; i++) {
    if (owns(boxes, edges, e, at(i), t, covered)) {
      if (runA < 0) runA = i
      if (bestA < 0 || i - runA > bestB - bestA) {
        bestA = runA
        bestB = i
      }
    } else runA = -1
  }
  if (bestA < 0) return null
  // Уточнення краю: між останньою «своєю» і першою «чужою» точкою.
  const refine = (inside: number, outside: number) => {
    let lo = at(inside)
    let hi = at(outside)
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2
      if (owns(boxes, edges, e, m, t, covered)) lo = m
      else hi = m
    }
    return lo
  }
  const lo = bestA === 0 ? at(0) : refine(bestA, bestA - 1)
  const hi = bestB === n ? at(n) : refine(bestB, bestB + 1)
  return hi - lo > 1e-4 ? [lo, hi] : null
}

// Профіль схилу від карниза до самого верху. Вибірка дрібна, але вузли, що
// лежать на одній прямій, злипаються — лишаються тільки справжні злами
// (вальма, єндова, гребінь).
export function roofFaces(
  boxes: Box[],
  edges: SkelEdge[],
  step = 0.05,
  covered?: (x: number, z: number, t: number) => boolean,
): SkelFace[] {
  const x0 = Math.min(...boxes.map((b) => b.x0))
  const x1 = Math.max(...boxes.map((b) => b.x1))
  const z0 = Math.min(...boxes.map((b) => b.z0))
  const z1 = Math.max(...boxes.map((b) => b.z1))
  // Далі за половину найбільшого габариту схил не підніметься.
  const limit = Math.max(x1 - x0, z1 - z0) / 2 + step

  // Порівнюємо ЗАВЖДИ зі справжніми карнизами: висоту даху задають вони, а
  // кутові грані лише добирають те, що лишилось за кінцями карнизів.
  const field = edges.filter((e) => e.rising)
  const out: SkelFace[] = []
  for (const e of [...field, ...cornerEdges(edges, limit)]) {
    const uMin = e.a - limit
    const uMax = e.b + limit
    const span = (t: number, hint?: [number, number]) => spanAt(boxes, field, e, t, uMin, uMax, covered, hint)

    // Схил не обов'язково починається на карнизі: кутова грань виростає з
    // ТОЧКИ десь усередині даху. Тому проходимо всю глибину й беремо
    // найдовший суцільний відрізок, а не спиняємось на першій порожнечі.
    const raw: SkelStep[] = []
    let blank = 0
    for (let i = 0; ; i++) {
      const t = Math.min(i * step, limit)
      const last = raw[raw.length - 1]
      const s = span(t, last && [last.lo, last.hi])
      if (s) {
        blank = 0
        raw.push({ t, lo: s[0], hi: s[1] })
      } else if (raw.length > 0 && ++blank > 4) break
      if (t >= limit) break
    }
    if (raw.length < 2) continue
    // Вершина: уточнюємо, на якій відстані схил починається, і ставимо там
    // точку. Інакше замість вістря вийшов би обрубок завширшки з крок.
    if (raw[0].t > EPS) {
      let lo = Math.max(raw[0].t - step, 0)
      let hi = raw[0].t
      for (let k = 0; k < 20; k++) {
        const m = (lo + hi) / 2
        if (span(m)) hi = m
        else lo = m
      }
      const s = span(hi + 1e-4) ?? [raw[0].lo, raw[0].hi]
      raw.unshift({ t: hi, lo: (s[0] + s[1]) / 2, hi: (s[0] + s[1]) / 2 })
    }

    // СТРИБОК: край схилу впирається в гребінь сусіднього і далі йде вже по
    // іншій лінії. Уточнюємо, на якій саме відстані, і ставимо ДВА вузли на
    // одній — інакше на даху замість чіткої лінії гребеня була б похила
    // сходинка завширшки з крок вибірки.
    const nodes: SkelStep[] = [raw[0]]
    for (let i = 1; i < raw.length; i++) {
      const p = raw[i - 1]
      const c = raw[i]
      const dt = c.t - p.t
      const far = Math.max(Math.abs(c.lo - p.lo), Math.abs(c.hi - p.hi))
      if (far > dt * 1.5 + 1e-3) {
        // Точка, що зникла на цьому кроці, — по ній і шукаємо межу.
        const gone = Math.abs(c.lo - p.lo) > Math.abs(c.hi - p.hi) ? (p.lo + c.lo) / 2 : (p.hi + c.hi) / 2
        let lo = p.t
        let hi = c.t
        for (let k = 0; k < 20; k++) {
          const m = (lo + hi) / 2
          if (owns(boxes, field, e, gone, m, covered)) lo = m
          else hi = m
        }
        const before = span(Math.max(lo - 1e-4, p.t))
        const after = span(Math.min(hi + 1e-4, c.t))
        if (before) nodes.push({ t: lo, lo: before[0], hi: before[1] })
        if (after) nodes.push({ t: lo, lo: after[0], hi: after[1] })
      }
      nodes.push(c)
    }

    // Верхівка: там, де смуга стягується в точку (кінець гребеня, вершина
    // вальми). Остання вибірка не доходить до неї на частину кроку. Схил, що
    // упирається в ФРОНТОН, лишається широким — його не добудовуємо.
    const last = nodes[nodes.length - 1]
    const prev = nodes[nodes.length - 2]
    const gap = last.hi - last.lo
    if (gap > 1e-3 && last.t < limit - EPS && last.t > prev.t + EPS) {
      const dt = last.t - prev.t
      const kLo = (last.lo - prev.lo) / dt
      const kHi = (last.hi - prev.hi) / dt
      // Сходяться лише якщо смуга справді звужується, і вістря поруч — інакше
      // це не вістря, а схил, обрізаний фронтоном.
      const extra = gap / (kLo - kHi)
      if (kLo - kHi > 1e-6 && extra < 2.5 * step) {
        const u = last.lo + kLo * extra
        nodes.push({ t: last.t + extra, lo: u, hi: u })
      }
    }

    // Злипання співлінійних вузлів. Пару з однаковим t не чіпаємо — це злам.
    const steps: SkelStep[] = [nodes[0]]
    for (let i = 1; i < nodes.length - 1; i++) {
      const p = steps[steps.length - 1]
      const c = nodes[i]
      const q = nodes[i + 1]
      const dt = q.t - p.t
      if (dt < EPS || Math.abs(c.t - p.t) < EPS || Math.abs(q.t - c.t) < EPS) {
        steps.push(c)
        continue
      }
      const k = (c.t - p.t) / dt
      if (Math.abs(c.lo - (p.lo + k * (q.lo - p.lo))) > 1e-3 || Math.abs(c.hi - (p.hi + k * (q.hi - p.hi))) > 1e-3)
        steps.push(c)
    }
    steps.push(nodes[nodes.length - 1])
    out.push({ edge: e, steps })
  }
  return out
}

// Смуга схилу на довільній відстані t — лінійно між вузлами профілю.
export function faceSpan(face: SkelFace, t: number): [number, number] {
  const s = face.steps
  if (t <= s[0].t) return [s[0].lo, s[0].hi]
  for (let i = 1; i < s.length; i++) {
    if (t > s[i].t) continue
    const dt = s[i].t - s[i - 1].t
    if (dt < EPS) return [s[i].lo, s[i].hi]
    const k = (t - s[i - 1].t) / dt
    return [s[i - 1].lo + k * (s[i].lo - s[i - 1].lo), s[i - 1].hi + k * (s[i].hi - s[i - 1].hi)]
  }
  const e = s[s.length - 1]
  return [e.lo, e.hi]
}

// Силует ДАХУ над гранню: висота (у плані, до множення на tan) над кожною
// точкою грані. Уздовж карниза це нуль, а над фронтоном — та сама ламана, по
// якій його ріже дах. Вузли, що лежать на одній прямій, злипаються.
export function edgeProfile(
  h: (x: number, z: number) => number,
  e: SkelEdge,
  step = 0.02,
): { u: number; h: number }[] {
  const at = (u: number) => {
    const [x, z] = facePoint(e, u, 1e-3)
    return h(x, z)
  }
  const n = Math.max(2, Math.ceil((e.b - e.a) / step))
  const raw: { u: number; h: number }[] = []
  for (let i = 0; i <= n; i++) {
    const u = e.a + ((e.b - e.a) * i) / n
    raw.push({ u, h: at(u) })
  }
  const out = [raw[0]]
  for (let i = 1; i < raw.length - 1; i++) {
    const p = out[out.length - 1]
    const c = raw[i]
    const q = raw[i + 1]
    const k = (c.u - p.u) / Math.max(q.u - p.u, EPS)
    if (Math.abs(c.h - (p.h + k * (q.h - p.h))) > 1e-3) out.push(c)
  }
  out.push(raw[raw.length - 1])
  return out
}
