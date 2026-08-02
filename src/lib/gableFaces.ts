import type { PlanRect } from '../config/types'
import type { HeightAt } from './cladding'
import { parapetEdges, slopeBox, ROOF_LIFT, type RoofPart } from './roof'
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
    for (const [a, b] of e.spans) {
      const fa = Math.abs(a - e.min) < 1e-4 ? a - grow : a
      const fb = Math.abs(b - e.max) < 1e-4 ? b + grow : b
      if (fb - fa < 0.1) continue
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
        },
        baseY: roofY,
        height: part.parapetH,
      })
    }
  }
  return out
}

export function gablePanels(part: RoofPart, above: PlanRect[], roofY: number, floor: number): GablePanel[] {
  if (part.kind === 'flat') return []
  // Двосхилий ЗІ ЗВІСОМ — суцільна призма даху, стіни там немає (див.
  // HouseShell: wallLike лише за overhang === 0).
  if (part.kind === 'gable' && part.overhang > 0) return []

  const g = slopeBox(part, above)
  const w = g.x1 - g.x0
  const d = g.z1 - g.z0
  const ridgeAlongZ = part.rotation % 180 === 0 ? d >= w : d < w
  const span = ridgeAlongZ ? w : d
  const tan = Math.tan((part.pitch * Math.PI) / 180)
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
      },
      baseY: roofY,
      height,
      heightAt,
    })
  }

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
      },
      baseY: roofY,
      height,
    })
  }
  return out
}
