import type { PlanRect } from '../config/types'

// ============================================================
// Контур ДОВІЛЬНОГО набору прямокутників (об'єднання мінус виріз).
//
// Раніше контур поверху вмів лише один-два прямокутники (прямокутник і Г).
// Коли зони розставляє користувач, слід будинку — довільна ортогональна фігура:
// кілька окремих частин, вирізи (тераса), навіть внутрішній двір.
//
// Метод: координати всіх граней утворюють нерівномірну сітку. Кожна комірка —
// заповнена або ні. Межа = ребро між заповненою і порожньою коміркою. Ребра
// випускаємо НАПРЯМЛЕНИМИ (заповнене завжди з одного боку) і зшиваємо в кільця.
// ============================================================

export type Point = [number, number] // [x, z]

export interface Ring {
  pts: Point[]
  hole: boolean // true = внутрішній виріз (двір), false = зовнішній контур
}

const EPS = 1e-4

interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
}

const box = (r: PlanRect): Box => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})

// Унікальні відсортовані координати — лінії різу сітки.
function axis(values: number[]): number[] {
  const out: number[] = []
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1] > EPS) out.push(v)
  }
  return out
}

const covers = (boxes: Box[], x: number, z: number) =>
  boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1)

const key = (p: Point) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`

interface DirEdge {
  a: Point
  b: Point
}

// Площа зі знаком (шнурівка). Наша орієнтація ребер дає «+» зовнішньому
// контуру і «−» вирізу — цим і відрізняємо дірку від контуру.
function signedArea(pts: Point[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]
    const [x1, z1] = pts[(i + 1) % pts.length]
    s += x0 * z1 - x1 * z0
  }
  return s / 2
}

// Прибираємо проміжні вершини на прямій ділянці.
function simplify(pts: Point[]): Point[] {
  const out: Point[] = []
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length]
    const cur = pts[i]
    const next = pts[(i + 1) % pts.length]
    const collinear =
      (Math.abs(prev[0] - cur[0]) < EPS && Math.abs(cur[0] - next[0]) < EPS) ||
      (Math.abs(prev[1] - cur[1]) < EPS && Math.abs(cur[1] - next[1]) < EPS)
    if (!collinear) out.push(cur)
  }
  return out
}

/**
 * Контур об'єднання `rects` за вирахуванням `subtract`.
 * Повертає кільця: зовнішні контури (можливо кілька, якщо фігура з окремих
 * частин) і вирізи всередині них.
 */
export function unionOutline(rects: PlanRect[], subtract: PlanRect[] = []): Ring[] {
  const add = rects.map(box)
  if (add.length === 0) return []
  const cut = subtract.map(box)
  const all = [...add, ...cut]
  const xs = axis(all.flatMap((b) => [b.x0, b.x1]))
  const zs = axis(all.flatMap((b) => [b.z0, b.z1]))
  const nx = xs.length - 1
  const nz = zs.length - 1
  if (nx < 1 || nz < 1) return []

  const filled: boolean[] = new Array(nx * nz).fill(false)
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2
    for (let j = 0; j < nz; j++) {
      const cz = (zs[j] + zs[j + 1]) / 2
      filled[i + j * nx] = covers(add, cx, cz) && !covers(cut, cx, cz)
    }
  }
  const at = (i: number, j: number) =>
    i >= 0 && i < nx && j >= 0 && j < nz && filled[i + j * nx]

  // Напрямок обрано так, щоб заповнене завжди лишалось з одного боку ребра.
  const edges: DirEdge[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!at(i, j)) continue
      const x0 = xs[i]
      const x1 = xs[i + 1]
      const z0 = zs[j]
      const z1 = zs[j + 1]
      if (!at(i, j - 1)) edges.push({ a: [x0, z0], b: [x1, z0] })
      if (!at(i + 1, j)) edges.push({ a: [x1, z0], b: [x1, z1] })
      if (!at(i, j + 1)) edges.push({ a: [x1, z1], b: [x0, z1] })
      if (!at(i - 1, j)) edges.push({ a: [x0, z1], b: [x0, z0] })
    }
  }

  const from = new Map<string, number[]>()
  edges.forEach((e, i) => {
    const k = key(e.a)
    const list = from.get(k)
    if (list) list.push(i)
    else from.set(k, [i])
  })

  const used = new Array(edges.length).fill(false)
  const rings: Ring[] = []
  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue
    const pts: Point[] = []
    let cur = start
    while (!used[cur]) {
      used[cur] = true
      pts.push(edges[cur].a)
      const cands = (from.get(key(edges[cur].b)) ?? []).filter((i) => !used[i])
      if (cands.length === 0) break
      if (cands.length === 1) {
        cur = cands[0]
        continue
      }
      // Вершина, де стикаються дві частини «по діагоналі»: беремо найкрутіший
      // поворот у бік заповненого — так частини не зливаються в одне кільце.
      const [dx, dz] = [edges[cur].b[0] - edges[cur].a[0], edges[cur].b[1] - edges[cur].a[1]]
      cur = cands.reduce((best, i) => {
        const cross = (e: number) =>
          dx * (edges[e].b[1] - edges[e].a[1]) - dz * (edges[e].b[0] - edges[e].a[0])
        return cross(i) > cross(best) ? i : best
      }, cands[0])
    }
    if (pts.length < 4) continue
    rings.push({ pts: simplify(pts), hole: signedArea(pts) < 0 })
  }
  return rings
}

// Контур -> набір ПРЯМОКУТНИКІВ, що покривають рівно його площу.
//
// Потрібно там, де фігура має бути прямокутною за визначенням, а сама площа —
// ні: готовий дах над Г-подібним покриттям. Габаритний прямокутник туди не
// годиться — він накриває і виріз, і терасу, і парапет повисає в повітрі.
//
// Ріжемо нерівномірною сіткою з координат самих ребер (комірок мало — рівно
// стільки, скільки зламів контуру), лишаємо зайняті комірки й жадібно склеюємо
// їх у широкі смуги, а смуги — вниз. Для Г-подібного це рівно два прямокутники.
export function outlineRects(rings: Ring[]): PlanRect[] {
  const uniq = (vs: number[]) => {
    const out: number[] = []
    for (const v of [...vs].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > EPS) out.push(v)
    return out
  }
  const xs = uniq(rings.flatMap((r) => r.pts.map((p) => p[0])))
  const zs = uniq(rings.flatMap((r) => r.pts.map((p) => p[1])))
  if (xs.length < 2 || zs.length < 2) return []

  // Кільця вкладені (виріз усередині контуру), тож усередині = непарна
  // кількість кілець, що містять точку.
  const nx = xs.length - 1
  const nz = zs.length - 1
  const on: boolean[][] = []
  for (let i = 0; i < nx; i++) {
    on[i] = []
    for (let j = 0; j < nz; j++) {
      const p: Point = [(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2]
      on[i][j] = rings.filter((r) => ringContains(r.pts, p)).length % 2 === 1
    }
  }

  const out: PlanRect[] = []
  const used: boolean[][] = on.map((col) => col.map(() => false))
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!on[i][j] || used[i][j]) continue
      let i2 = i
      while (i2 + 1 < nx && on[i2 + 1][j] && !used[i2 + 1][j]) i2++
      let j2 = j
      while (j2 + 1 < nz) {
        let full = true
        for (let k = i; k <= i2 && full; k++) full = on[k][j2 + 1] && !used[k][j2 + 1]
        if (!full) break
        j2++
      }
      for (let k = i; k <= i2; k++) for (let m = j; m <= j2; m++) used[k][m] = true
      out.push({
        x: (xs[i] + xs[i2 + 1]) / 2,
        z: (zs[j] + zs[j2 + 1]) / 2,
        width: xs[i2 + 1] - xs[i],
        depth: zs[j2 + 1] - zs[j],
      })
    }
  }
  return out
}

// Чи лежить точка всередині кільця (промінь уздовж +x).
export function ringContains(pts: Point[], p: Point): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i]
    const [xj, zj] = pts[j]
    if (zi > p[1] !== zj > p[1] && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) {
      inside = !inside
    }
  }
  return inside
}
