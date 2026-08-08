import type { PlanRect } from '../config/types'
import { GRID } from './editPlan'

// ============================================================
// Куди покласти НОВУ зону. Спільне для кімнат, зон даху й тераси: усі три
// кнопки «додати» ставили зону за простим правилом «праворуч від крайньої», і
// вона регулярно з'являлась одразу з помилкою — поверх сусіда або в порожнечі.
//
// Правило одне: шукаємо найближче до якоря місце, де зона нікого не перетинає
// й задовольняє умову кроку (бути в контурі покриття, торкатись будинку тощо).
// ============================================================

const bx = (r: PlanRect) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2,
})

// Перетин по ПЛОЩІ. Дотик гранями — не перетин: саме так зони й стикують.
export function overlaps(a: PlanRect, b: PlanRect, eps = 0.01): boolean {
  const p = bx(a)
  const q = bx(b)
  return Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > eps && Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0) > eps
}

// Спільна ГРАНЬ (а не дотик кутами).
export function touches(a: PlanRect, b: PlanRect, eps = 0.01): boolean {
  const p = bx(a)
  const q = bx(b)
  const xOver = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)
  const zOver = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0)
  if (xOver > 0.1 && Math.min(Math.abs(p.z1 - q.z0), Math.abs(q.z1 - p.z0)) < eps) return true
  return zOver > 0.1 && Math.min(Math.abs(p.x1 - q.x0), Math.abs(q.x1 - p.x0)) < eps
}

// Місце для зони поруч із `start`: спершу сам `start`, далі — кільцями навколо
// нього з кроком сітки. Порядок обходу — вправо, вниз, вліво, вгору: так копія
// лягає впритул збоку, а не по діагоналі.
//
// `fits` — додаткова умова кроку (наприклад «центр усередині покриття»).
export function freeSpot(
  start: PlanRect,
  obstacles: PlanRect[],
  fits: (r: PlanRect) => boolean = () => true,
  rings = 24,
): PlanRect | null {
  const ok = (r: PlanRect) => fits(r) && !obstacles.some((o) => overlaps(r, o))
  if (ok(start)) return start
  for (let n = 1; n <= rings; n++) {
    // Крок кільця — розмір самої зони, поки він більший за клітинку: інакше
    // зона повзла б до вільного місця по 0,5 м і перебирала сотні позицій.
    const stepX = Math.max(GRID, Math.min(start.width, n * GRID))
    const stepZ = Math.max(GRID, Math.min(start.depth, n * GRID))
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ] as const) {
      const spot = { ...start, x: start.x + dx * n * stepX, z: start.z + dz * n * stepZ }
      if (ok(spot)) return spot
    }
  }
  return null
}
