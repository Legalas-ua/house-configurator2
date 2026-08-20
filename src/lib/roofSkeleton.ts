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
  // Грань БЕЗ кінців: відстань до неї міряється лише впоперек. Так описано
  // карниз односхилого даху — у нього ОДНА площина на всю зону, і за кінцем
  // карниза вона не загортається, а просто триває далі тією ж площиною.
  infinite?: boolean
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
  return [e.infinite ? 0 : Math.max(e.a - u, 0, u - e.b), Math.abs(v - e.line)]
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

// Смуги схилу на глибині t: [lo, hi] уздовж грані. Їх буває КІЛЬКА — коли зону
// перетинає чужий дах, суцільна смуга розпадається на окремі клапті. Раніше тут
// поверталась одна, найдовша: на ХРЕСТІ двох дахів так губилось 11% площі, а на
// Т-подібній зоні — ті самі відомі 6%.
function scanRuns(
  boxes: Box[],
  edges: SkelEdge[],
  e: SkelEdge,
  t: number,
  uMin: number,
  uMax: number,
  covered?: (x: number, z: number, t: number) => boolean,
  // Точки, де смуга БУЛА на попередній глибині. Груба вибірка перестрибує
  // смугу, вужчу за свій крок, — а саме такою смуга й стає, коли її підтискає
  // чужий дах. Далі вона знову розширюється, але профіль уже обірвано, і схил
  // лишався недобудованим на всю висоту (11% дірок на хресті).
  seeds: number[] = [],
): [number, number][] {
  // Крок вибірки тримаємо близько до 10 см незалежно від розміру зони: вузька
  // смужка біля рогу (там, де сусідній дах щойно скінчився) буває сантиметрів
  // тридцять, і на грубій сітці великої зони вона просто не траплялась під
  // пробу — на даху лишався порожній трикутник біля стику.
  const n = Math.min(384, Math.max(96, Math.ceil((uMax - uMin) / 0.1)))
  const du = (uMax - uMin) / n
  const at = (i: number) => uMin + du * i
  const has = (u: number) => owns(boxes, edges, e, u, t, covered)
  // Усі межі схилу прямі (45° або паралельно карнизу), тож край уточнюємо
  // поділом навпіл — двадцяти кроків вистачає з запасом.
  const bisect = (inside: number, outside: number) => {
    let lo = inside
    let hi = outside
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2
      if (has(m)) lo = m
      else hi = m
    }
    return lo
  }
  const runs: [number, number][] = []
  let from = -1
  for (let i = 0; i <= n; i++) {
    if (has(at(i))) {
      if (from < 0) from = i
      if (i === n) runs.push([from === 0 ? at(0) : bisect(at(from), at(from - 1)), at(n)])
    } else if (from >= 0) {
      runs.push([from === 0 ? at(0) : bisect(at(from), at(from - 1)), bisect(at(i - 1), at(i))])
      from = -1
    }
  }
  // Смуга навколо підказки: розповзаємось від неї дрібним кроком, поки не
  // випадемо назовні, і уточнюємо обидва краї.
  const grow = (u: number): [number, number] | null => {
    if (!has(u)) return null
    const st = du / 4
    let lo = u
    for (let k = 0; k < 80 && lo - st > uMin && has(lo - st); k++) lo -= st
    let hi = u
    for (let k = 0; k < 80 && hi + st < uMax && has(hi + st); k++) hi += st
    const a = lo - st > uMin ? bisect(lo, lo - st) : uMin
    const b = hi + st < uMax ? bisect(hi, hi + st) : uMax
    return b - a > 1e-4 ? [a, b] : null
  }
  for (const u of seeds) {
    if (u < uMin || u > uMax) continue
    if (runs.some(([a, b]) => u > a - 1e-6 && u < b + 1e-6)) continue
    const r = grow(u)
    if (r && !runs.some(([a, b]) => Math.min(b, r[1]) - Math.max(a, r[0]) > 1e-6)) runs.push(r)
  }
  runs.sort((p, q) => p[0] - q[0])
  return runs.filter(([a, b]) => b - a > 1e-4)
}

const overlapOf = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0])

// Профіль однієї смуги: вузли, між якими схил іде рівно лінійно.
function profileOf(
  boxes: Box[],
  field: SkelEdge[],
  e: SkelEdge,
  raw: SkelStep[],
  near: (t: number, hint: [number, number]) => [number, number] | null,
  step: number,
  limit: number,
  covered?: (x: number, z: number, t: number) => boolean,
  // Клапоть не скінчився, а ЗЛИВСЯ із сусіднім (той самий схил далі веде інший
  // профіль). Продовжувати його не можна: обидва накриють ту саму ділянку.
  merged = false,
): SkelStep[] | null {
  if (raw.length < 2) return null

  // Вершина: уточнюємо, на якій відстані смуга починається, і ставимо там
  // точку. Інакше замість вістря вийшов би обрубок завширшки з крок.
  if (raw[0].t > EPS) {
    const hint: [number, number] = [raw[0].lo, raw[0].hi]
    let lo = Math.max(raw[0].t - step, 0)
    let hi = raw[0].t
    for (let k = 0; k < 20; k++) {
      const m = (lo + hi) / 2
      if (near(m, hint)) hi = m
      else lo = m
    }
    const s = near(hi + 1e-4, hint) ?? hint
    // Вістря — лише якщо смуга ТАМ справді вузька (вершина вальми, кінець
    // гребеня). Клапоть, що виринає з-під чужого даху, з'являється одразу на
    // всю ширину — стягнути його в точку означає лишити замість початку
    // трикутник, а решту без даху (смуга дірок уздовж лінії врізки).
    const wide = s[1] - s[0] > 0.05
    raw.unshift(wide ? { t: hi, lo: s[0], hi: s[1] } : { t: hi, lo: (s[0] + s[1]) / 2, hi: (s[0] + s[1]) / 2 })
  }

  // КІНЕЦЬ СМУГИ. Вибірка йде кроком 50 мм, а справжній край схилу — гребінь,
  // ребро вальми чи лінія врізки — лежить МІЖ кроками. Обрив на останній вдалій
  // пробі лишав уздовж усього гребеня щілину до 50 мм: на скріншоті Lev це
  // чорна смуга по коньку. Уточнюємо край поділом навпіл і ставимо там вузол.
  const tail = raw[raw.length - 1]
  if (!merged && tail.t < limit - EPS) {
    const hint: [number, number] = [tail.lo, tail.hi]
    let lo = tail.t
    let hi = tail.t + step
    for (let k = 0; k < 12; k++) {
      const m = (lo + hi) / 2
      if (near(m, hint)) lo = m
      else hi = m
    }
    const s = lo > tail.t + 1e-4 ? near(lo, hint) : null
    if (s) raw.push({ t: lo, lo: s[0], hi: s[1] })
  }

  // СТРИБОК: край смуги впирається в гребінь сусіднього схилу й далі йде вже по
  // іншій лінії. Уточнюємо, на якій саме відстані, і ставимо ДВА вузли на одній
  // — інакше замість чіткої лінії гребеня була б похила сходинка завширшки з
  // крок вибірки.
  const nodes: SkelStep[] = [raw[0]]
  for (let i = 1; i < raw.length; i++) {
    const p = raw[i - 1]
    const c = raw[i]
    const dt = c.t - p.t
    const far = Math.max(Math.abs(c.lo - p.lo), Math.abs(c.hi - p.hi))
    // Пара вузлів на ОДНІЙ глибині — це вже готовий злам (його поставило
    // злиття клаптів). Уточнювати нічого.
    if (dt > EPS && far > dt * 1.5 + 1e-3) {
      // Точка, що змінила стан на цьому кроці, — по ній і шукаємо межу.
      const gone = Math.abs(c.lo - p.lo) > Math.abs(c.hi - p.hi) ? (p.lo + c.lo) / 2 : (p.hi + c.hi) / 2
      // Смуга могла і ЗНИКНУТИ (кінець схилу під чужим дахом), і РОЗШИРИТИСЬ
      // (виринула з-під нього). Раніше межу шукали лише за першим випадком, і
      // на другому вона з'їжджала на цілий крок угору — уздовж лінії врізки
      // лишався рядок дірок. Тепер бік визначає сам стан на початку відрізка.
      const was = owns(boxes, field, e, gone, p.t, covered)
      let lo = p.t
      let hi = c.t
      for (let k = 0; k < 20; k++) {
        const m = (lo + hi) / 2
        if (owns(boxes, field, e, gone, m, covered) === was) lo = m
        else hi = m
      }
      const before = near(Math.max(lo - 1e-4, p.t), [p.lo, p.hi])
      const after = near(Math.min(hi + 1e-4, c.t), [c.lo, c.hi])
      if (before) nodes.push({ t: lo, lo: before[0], hi: before[1] })
      if (after) nodes.push({ t: lo, lo: after[0], hi: after[1] })
    }
    nodes.push(c)
  }

  // Верхівка: там, де смуга стягується в точку (кінець гребеня, вершина
  // вальми). Остання вибірка не доходить до неї на частину кроку. Схил, що
  // упирається у ФРОНТОН, лишається широким — його не добудовуємо.
  const last = nodes[nodes.length - 1]
  const prev = nodes[nodes.length - 2]
  const gap = last.hi - last.lo
  if (gap > 1e-3 && last.t < limit - EPS && last.t > prev.t + EPS) {
    const dt = last.t - prev.t
    const kLo = (last.lo - prev.lo) / dt
    const kHi = (last.hi - prev.hi) / dt
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
  return steps.length < 2 ? null : steps
}

// Схили від кожного карниза догори. Один карниз дає СТІЛЬКИ схилів, на скільки
// клаптів його смугу розрізали чужі дахи: кожен клапоть живе далі своїм
// профілем.
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
  // Далі за половину найбільшого габариту схил не підніметься — бо назустріч
  // іде схил із протилежного карниза. Виняток — ОДНОСХИЛИЙ: у нього карниз
  // один, і його площина тягнеться через увесь габарит.
  const solo = edges.some((e) => e.infinite)
  const limit = Math.max(x1 - x0, z1 - z0) / (solo ? 1 : 2) + step

  // Порівнюємо ЗАВЖДИ зі справжніми карнизами: висоту даху задають вони, а
  // кутові грані лише добирають те, що лишилось за кінцями карнизів.
  const field = edges.filter((e) => e.rising)
  const out: SkelFace[] = []
  for (const e of [...field, ...cornerEdges(edges, limit)]) {
    const uMin = e.a - limit
    const uMax = e.b + limit
    const runsAt = (t: number, seeds: number[] = []) => scanRuns(boxes, field, e, t, uMin, uMax, covered, seeds)
    // Смуга, найближча до підказки: нею тягнеться профіль конкретного клаптя.
    const near = (t: number, hint: [number, number]): [number, number] | null => {
      let best: [number, number] | null = null
      let bestOv = -Infinity
      for (const r of runsAt(t, [hint[0] + 1e-3, (hint[0] + hint[1]) / 2, hint[1] - 1e-3])) {
        const ov = overlapOf(r, hint)
        if (ov > bestOv) {
          bestOv = ov
          best = r
        }
      }
      return bestOv > 1e-9 ? best : null
    }

    interface Branch {
      raw: SkelStep[]
      last: [number, number]
      alive: boolean
      merged?: boolean // помер не сам — його смугу забрав сусідній клапоть
      // На якому кроці клапоть обірвався. Підказку від нього тримаємо ще
      // кілька кроків: смуга спершу зникає зовсім (її цілком накрив чужий дах),
      // а трохи вище виринає знову вузенькою — і без підказки її вже не знайти.
      diedAt?: number
    }
    const SEED_HOLD = 6
    const all: Branch[] = []
    for (let i = 0; ; i++) {
      const t = Math.min(i * step, limit)
      // Підказки — краї та середини смуг із попередньої глибини.
      const seeds: number[] = []
      for (const b of all)
        if (b.alive || (b.diedAt !== undefined && i - b.diedAt <= SEED_HOLD))
          seeds.push(b.last[0] + 1e-3, (b.last[0] + b.last[1]) / 2, b.last[1] - 1e-3)
      const rs = runsAt(t, seeds)
      const taken = new Set<number>()
      // Хто веде яку смугу на цьому кроці й з якою смугою прийшов — це потрібно
      // нижче, щоб ЗЛИТТЯ двох клаптів сталося в обох рівно на одній глибині.
      const owner = new Map<number, Branch>()
      const came = new Map<Branch, [number, number]>()
      const merges: { b: Branch; run: number }[] = []
      for (const b of all) {
        if (!b.alive) continue
        let pick = -1
        let bestOv = 1e-9
        let stolen = -1
        rs.forEach((r, j) => {
          const ov = overlapOf(r, b.last)
          if (ov <= bestOv) return
          if (taken.has(j)) {
            stolen = j // смуга є, але її вже веде інший клапоть
            return
          }
          bestOv = ov
          pick = j
        })
        if (pick < 0) {
          b.alive = false
          b.diedAt = i
          b.merged = stolen >= 0
          if (stolen >= 0) merges.push({ b, run: stolen })
          continue
        }
        taken.add(pick)
        owner.set(pick, b)
        came.set(b, b.last)
        b.raw.push({ t, lo: rs[pick][0], hi: rs[pick][1] })
        b.last = rs[pick]
      }

      // ЗЛИТТЯ. Смуга не скінчилась — її просто повів далі сусідній клапоть.
      // Обидва мусять зійтися на ОДНІЙ глибині: якщо один обірвати на пробі, а
      // другий розширити на уточненій, між ними лишиться тонка щілина вздовж
      // площини даху — та сама «щілина від кута скату» зі скріншота Lev.
      for (const { b, run } of merges) {
        const own = b.last[1] - b.last[0]
        const from = b.raw[b.raw.length - 1].t
        let lo = from
        let hi = t
        for (let k = 0; k < 16; k++) {
          const m = (lo + hi) / 2
          const r = near(m, b.last)
          // Поки смуга не поглинула сусідню, її ширина лишається своєю.
          if (r && r[1] - r[0] < own + 0.1) lo = m
          else hi = m
        }
        if (lo <= from + 1e-4) continue
        const mine = near(lo, b.last)
        if (mine) b.raw.push({ t: lo, lo: mine[0], hi: mine[1] })
        // …і той самий злам у клаптя, що забрав смугу: спершу його ВЛАСНА
        // ширина на тій самій глибині, одразу за нею — вже спільна.
        const s = owner.get(run)
        const before = s && came.get(s)
        if (!s || !before) continue
        const own2 = near(lo, before)
        const both = near(Math.min(hi, t), rs[run]) ?? rs[run]
        const tail = s.raw.pop()
        if (own2) s.raw.push({ t: lo, lo: own2[0], hi: own2[1] })
        s.raw.push({ t: lo, lo: both[0], hi: both[1] })
        if (tail) s.raw.push(tail)
      }
      // Смуга, яку не підхопив жоден клапоть, — або вістря схилу, або новий
      // клапоть, що відділився за чужим дахом.
      rs.forEach((r, j) => {
        if (!taken.has(j)) all.push({ raw: [{ t, lo: r[0], hi: r[1] }], last: r, alive: true })
      })
      // Раннього виходу тут НЕМАЄ навмисно. Схил, який чужий дах накрив
      // цілком, виринає знову вище — біля самого коника лишається тонка
      // смужка, і саме вона світилась дірою на скріншоті. Проходимо всю
      // глибину: скелет кешується, а перебудова пари зон коштує ~5 мс.
      if (t >= limit) break
    }

    for (const b of all) {
      const steps = profileOf(boxes, field, e, b.raw, near, step, limit, covered, b.merged)
      if (steps) out.push({ edge: e, steps })
    }
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
