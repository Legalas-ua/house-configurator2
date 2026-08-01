import type { PlanRect } from '../config/types'
import type { Clip } from './cladding'
import { slopeBox, ROOF_LIFT, type RoofPart } from './roof'
import type { WallFace } from './wallFaces'

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
  clip: Clip
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

  // Проміжок уздовж падіння, де стіна ще існує на висоті v (від низу панелі).
  const clip: Clip = (_v0, v1) => {
    const need = (v1 - ROOF_LIFT) / Math.max(tan, 1e-6)
    if (need <= 0) return [f0, f1]
    if (mono) return highAtMax ? [f0 + need, f1] : [f0, f1 - need]
    const k = Math.min(need, span / 2)
    return [f0 + k, f1 - k]
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
      clip,
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
      clip: () => [r0, r1],
    })
  }
  return out
}
