import type { PlanRect } from '../config/types'
import type { HeightAt } from './cladding'
import { parapetEdges, partRects, roofSkeleton, slopeBox, ROOF_LIFT, type RoofPart } from './roof'
import { edgeProfile, facePoint, insideBoxes, planRise } from './roofSkeleton'
import { WALL_T } from './windows'
import type { WallFace } from './wallFaces'

// Так само, як у стін: горизонтальна грань «володіє» рогом і загортається за
// нього, вертикальна поступається. Збігається з CORNER у lib/wallFaces.ts.
const CORNER = 0.02

// ============================================================
// Фронтони — те, що лишається СТІНОЮ над дахом: трикутник під двосхилим і
// трапеції з високою стіною під односхилим. Оздоблення фасаду має заходити
// туди так само, як на стіну під ними.
//
// Ключове спрощення: гребінь даху завжди осьовий (поворот кратний 90°), тож
// усі ці площини теж осьові — і їх можна віддати тим самим `WallFace`, що й
// звичайні стіни. Ніяких кватерніонів.
//
// Розкладка зшивається зі стіною сама собою: `claddingBoxes` прив'язує сітку
// до світового нуля, а низ фронтону збігається з верхом стіни.
// ============================================================

export interface GablePanel {
  face: WallFace
  baseY: number
  height: number
  heightAt?: HeightAt
}

// Стінка ПАРАПЕТУ — це теж зовнішня стіна, тільки над покриттям: оздоблення
// має продовжуватись на неї. Зовнішня грань парапету навмисно зроблена
// врівень зі стіною, тож площина та сама, що й у стіни під ним, — розкладка
// зшивається сама (сітка прив'язана до світового нуля).
export function parapetPanels(part: RoofPart, above: PlanRect[], roofY: number, floor: number): GablePanel[] {
  if (part.kind !== 'flat') return []
  const out: GablePanel[] = []
  for (const e of parapetEdges(part, above)) {
    const horizontal = e.horizontal
    // Загортання за ріг — те саме правило, що й у стін, інакше на кожному
    // куті парапету лишалась непокрита смуга в пів товщини стіни.
    const grow = horizontal ? WALL_T / 2 + CORNER : WALL_T / 2
    // Чи стоїть поруч із цією точкою ребра стіна поверху ВИЩЕ. Якщо так — це
    // не вільний ріг: загортати оздоблення туди не можна, воно лізе в
    // оздоблення тієї стіни (обидва в одній площині) і мерехтить.
    const nearUpper = (u: number) =>
      above.some((r) => {
        const c = {
          x0: r.x - r.width / 2,
          x1: r.x + r.width / 2,
          z0: r.z - r.depth / 2,
          z1: r.z + r.depth / 2,
        }
        const along = horizontal ? [c.x0, c.x1] : [c.z0, c.z1]
        const across = horizontal ? [c.z0, c.z1] : [c.x0, c.x1]
        return (
          u > along[0] - 0.3 && u < along[1] + 0.3 && e.line > across[0] - 0.3 && e.line < across[1] + 0.3
        )
      })
    for (const [a, b] of e.spans) {
      const freeA = Math.abs(a - e.min) < 1e-4 && !nearUpper(a)
      const freeB = Math.abs(b - e.max) < 1e-4 && !nearUpper(b)
      // Вільний ріг — загортаємо за нього; кінець біля стіни поверху вище —
      // навпаки підрізаємо.
      const fa = freeA ? a - grow : a + CORNER + 0.01
      const fb = freeB ? b + grow : b - CORNER - 0.01
      if (fb - fa < 0.1) continue
      // Вісь стіни поверху ВИЩЕ на «упертому» кінці. `parapetEdges` спиняє
      // смугу на її голій грані (вісь ∓ пів стіни), а оздоблення тієї стіни
      // виходить ще далі — і парапет заходив у нього на 5 см: планки лізли
      // просто в сусідній матеріал. Далі сцена підставить справжню товщину.
      const upperAxis = (u: number, end: number) =>
        Math.abs(u - end) < 1e-4 ? u : u + (end === e.min ? -WALL_T / 2 : WALL_T / 2)
      out.push({
        face: {
          id: `${floor}|parapet|${part.id}|${horizontal ? 'h' : 'v'}|${e.line.toFixed(2)}|${fa.toFixed(2)}`,
          floor,
          horizontal,
          line: e.line,
          nx: e.nx,
          nz: e.nz,
          a: fa,
          b: fb,
          // Ріг парапету — такий самий ріг: сцена доведе оздоблення до
          // площини матеріалу сусідньої стінки (див. WallFace.cornerA). На
          // ВІЛЬНОМУ розі рогом володіє лише горизонтальна грань; кінець, що
          // впирається в поверх вище, підрізають обидві.
          cornerA: freeA ? (horizontal ? a : undefined) : upperAxis(a, e.min),
          cornerB: freeB ? (horizontal ? b : undefined) : upperAxis(b, e.max),
        },
        baseY: roofY,
        height: part.parapetH,
      })
    }
  }
  return out
}

export function gablePanels(
  part: RoofPart,
  above: PlanRect[],
  roofY: number,
  floor: number,
  siblings: PlanRect[] = [],
): GablePanel[] {
  // У вальмового фронтонів немає взагалі — схили сходяться з усіх боків.
  if (part.kind === 'flat' || part.kind === 'hip') return []
  // Двосхилий ЗІ ЗВІСОМ — суцільна призма даху, стіни там немає (див.
  // HouseShell: wallLike лише за overhang === 0).
  if (part.kind === 'gable' && part.overhang > 0) return []

  const tan = Math.tan((part.pitch * Math.PI) / 180)

  // СКЛАДЕНА зона — дах по прямому скелету, і стіни під ним ідуть по тому
  // самому контуру. Рахувати їх по габариту зони не можна: саме через це на
  // Г-подібному даху світив голий трикутник — оздоблення стояло по габариту, а
  // геометрія по частинах.
  // Односхилий сюди НЕ заходить: його геометрія — одна похила площина на всю
  // зону, скелета під нею немає. Інакше, перемкнувши двосхилий на односхилий,
  // клієнт бачив оздоблення, підрізане ще по-двосхилому.
  if (partRects(part).length > 1 && part.kind === 'gable') {
    const sk = roofSkeleton(part, above, siblings)
    const out: GablePanel[] = []
    for (const e of sk.edges) {
      // Ріг ВЛАСНЕ рогом є лише там, де стіна повертає (90°). На увігнутому
      // куті (270°) вона йде далі, і загортати оздоблення нікуди.
      const turns = (u: number, dir: 1 | -1) => {
        const [x, z] = facePoint(e, u + dir * 0.01, 0.01)
        return !insideBoxes(sk.boxes, x, z)
      }
      const face: WallFace = {
        id: `${floor}|gable|${part.id}|${e.horizontal ? 'h' : 'v'}|${e.line.toFixed(2)}|${e.a.toFixed(2)}`,
        floor,
        horizontal: e.horizontal,
        line: e.line,
        nx: e.horizontal ? 0 : e.n,
        nz: e.horizontal ? e.n : 0,
        a: e.a,
        b: e.b,
        halfT: 0,
        // Те саме правило, що й у стін: рогом володіє ГОРИЗОНТАЛЬНА грань і
        // загортається за нього, вертикальна поступається. Без цього на кожному
        // розі фронтону лишалась смуга голої основи завширшки з матеріал
        // сусідньої грані.
        cornerA: e.horizontal && turns(e.a, -1) ? e.a : undefined,
        cornerB: e.horizontal && turns(e.b, 1) ? e.b : undefined,
      }
      // Карниз — сама лише вузька грань клина під схилом.
      if (e.rising) {
        out.push({ face, baseY: roofY, height: ROOF_LIFT })
        continue
      }
      // Фронтон — стіна до самої лінії даху над нею.
      const top = Math.max(...edgeProfile(sk.edges, e).map((p) => p.h)) * tan
      out.push({
        face,
        baseY: roofY,
        height: ROOF_LIFT + top,
        heightAt: (u) => {
          const [x, z] = facePoint(e, u, 1e-3)
          return roofY + ROOF_LIFT + planRise(sk.edges, x, z) * tan
        },
      })
    }
    return out
  }

  const g = slopeBox(part, above, undefined, siblings)
  const w = g.x1 - g.x0
  const d = g.z1 - g.z0
  const ridgeAlongZ = part.rotation % 180 === 0 ? d >= w : d < w
  const span = ridgeAlongZ ? w : d
  const mono = part.kind === 'mono'
  const rise = mono ? span * tan : (span / 2) * tan
  const height = ROOF_LIFT + rise
  // Уздовж падіння: [f0, f1]; поперек (уздовж гребеня): [r0, r1].
  const f0 = ridgeAlongZ ? g.x0 : g.z0
  const f1 = ridgeAlongZ ? g.x1 : g.z1
  const r0 = ridgeAlongZ ? g.z0 : g.x0
  const r1 = ridgeAlongZ ? g.z1 : g.x1
  const highAtMax = !(mono && part.rotation >= 180)

  // Верх стіни в точці u — це лінія схилу. Саме до неї підрізаються елементи,
  // тож оздоблення доходить упритул до похилої плити, без сходинок.
  const heightAt: HeightAt = (u) => {
    const p = mono ? (highAtMax ? u - f0 : f1 - u) : Math.min(u - f0, f1 - u)
    return roofY + ROOF_LIFT + Math.max(0, p) * tan
  }

  const out: GablePanel[] = []
  const id = (tag: string) => `${floor}|gable|${part.id}|${tag}`
  // Ріг простої зони завжди вільний і завжди на 90°, тож рогом володіє
  // ГОРИЗОНТАЛЬНА грань — те саме правило, що й у стін. Без цього на кожному
  // розі лишалась смуга голої основи завширшки з матеріал сусідньої грані:
  // саме те, на що Lev показував на односхилому зі звісом.
  const corners = (horizontal: boolean, a: number, b: number) =>
    horizontal ? { cornerA: a, cornerB: b } : {}

  // Два ТОРЦІ — площини, перпендикулярні гребеню.
  for (const side of [-1, 1] as const) {
    const line = side < 0 ? r0 : r1
    out.push({
      face: {
        id: id(`end${side < 0 ? 0 : 1}`),
        floor,
        horizontal: ridgeAlongZ,
        line,
        nx: ridgeAlongZ ? 0 : side,
        nz: ridgeAlongZ ? side : 0,
        a: f0,
        b: f1,
        halfT: 0,
        ...corners(ridgeAlongZ, f0, f1),
      },
      baseY: roofY,
      height,
      heightAt,
    })
  }

  // КАРНИЗНІ смуги — вузькі грані клина під самим схилом (заввишки ROOF_LIFT).
  // Їх оздоблення не діставало, і між верхом стіни та торцевою планкою
  // лишалась світла смуга: саме той шов, на який скаржився замовник.
  const eave = (line: number, n: number) => ({
    face: {
      id: id(`eave${n > 0 ? 1 : 0}`),
      floor,
      horizontal: !ridgeAlongZ,
      line,
      nx: ridgeAlongZ ? n : 0,
      nz: ridgeAlongZ ? 0 : n,
      a: r0,
      b: r1,
      halfT: 0,
      ...corners(!ridgeAlongZ, r0, r1),
    },
    baseY: roofY,
    height: ROOF_LIFT,
  })
  // В односхилого низька грань одна, у двосхилого — обидві.
  if (mono) out.push(eave(highAtMax ? f0 : f1, highAtMax ? -1 : 1))
  else out.push(eave(f0, -1), eave(f1, 1))

  // Односхилий: висока стіна під верхньою кромкою схилу. Прямокутник на всю
  // ширину — обрізати нічого.
  if (mono) {
    const line = highAtMax ? f1 : f0
    const n = highAtMax ? 1 : -1
    out.push({
      face: {
        id: id('high'),
        floor,
        horizontal: !ridgeAlongZ,
        line,
        nx: ridgeAlongZ ? n : 0,
        nz: ridgeAlongZ ? 0 : n,
        a: r0,
        b: r1,
        halfT: 0,
        ...corners(!ridgeAlongZ, r0, r1),
      },
      baseY: roofY,
      height,
    })
  }
  return out
}
