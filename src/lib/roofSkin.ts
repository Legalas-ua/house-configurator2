import type { HousePlan, PlanRect, RoofMatKind, RoofMatSpec } from '../config/types'
import { slopeBox, ROOF_LIFT, type RoofPart } from './roof'

// ============================================================
// Покрівля як ГЕОМЕТРІЯ. Кожен матеріал — своя розкладка об'ємних елементів на
// площині схилу: черепиця рядами з напуском, фальц — довгі картини зі стоячими
// ребрами, профнастил — листи з частою гофрою.
//
// Елемент описуємо у «схилових» координатах:
//   u — уздовж ГРЕБЕНЯ,
//   s — уздовж падіння, по САМІЙ площині схилу.
// Перетворення у світ зібране в одному місці (`place`), тож самі розкладки
// лишаються плоскою арифметикою без жодних кватерніонів.
// ============================================================

export interface SkinBox {
  x: number
  y: number
  z: number
  dx: number // уздовж гребеня
  dy: number // товщина, по нормалі до схилу
  dz: number // уздовж падіння
  rotY: number
  tilt: number // нахил схилу, радіани
}

interface Layout {
  eu: number // розмір елемента вздовж гребеня
  pu: number // крок вздовж гребеня
  es: number // розмір уздовж падіння (0 = на всю довжину схилу)
  ps: number // крок уздовж падіння (0 = один ряд)
  t: number // товщина
  stagger: number // зсув через ряд, частка кроку
  rib?: { pitch: number; w: number; h: number } // стояче ребро вздовж падіння
}

// Розміри взяті з реальних виробів — саме вони й дають упізнаваний вигляд.
const LAYOUT: Record<RoofMatKind, Layout> = {
  clayTile: { eu: 0.29, pu: 0.3, es: 0.36, ps: 0.29, t: 0.032, stagger: 0.5 },
  metalTile: { eu: 1.1, pu: 1.12, es: 0.42, ps: 0.35, t: 0.022, stagger: 0 },
  seam: { eu: 0.48, pu: 0.5, es: 0, ps: 0, t: 0.014, stagger: 0, rib: { pitch: 0.5, w: 0.028, h: 0.045 } },
  shingle: { eu: 0.33, pu: 0.335, es: 0.19, ps: 0.145, t: 0.009, stagger: 0.5 },
  corrugated: { eu: 0.99, pu: 1.0, es: 0, ps: 0, t: 0.012, stagger: 0, rib: { pitch: 0.185, w: 0.05, h: 0.028 } },
}

// Товщини покрівельних плит з HouseShell — покриття лягає ПОВЕРХ них.
const ROOF_T = 0.22
const FLAT_T = 0.02 // плоский дах: рулон, без розкладки
const MAX_ELEMENTS = 60_000

export const roofSkinHeight = (kind: RoofMatKind) => LAYOUT[kind].t + (LAYOUT[kind].rib?.h ?? 0)

interface Slope {
  cx: number // центр площини схилу у світі
  cy: number
  cz: number
  rotY: number // поворот системи «гребінь/падіння» навколо Y
  tilt: number // нахил площини
  width: number // уздовж гребеня
  len: number // уздовж падіння, по площині
}

function layElements(sl: Slope, kind: RoofMatKind, out: SkinBox[], budget: number) {
  const L = LAYOUT[kind]
  const cos = Math.cos(sl.tilt)
  const sin = Math.sin(sl.tilt)
  const rc = Math.cos(sl.rotY)
  const rs = Math.sin(sl.rotY)

  // (u, s) на площині + підйом по нормалі -> світ.
  const place = (u: number, s: number, du: number, ds: number, dy: number, lift: number) => {
    if (out.length >= budget || du < 0.005 || ds < 0.005) return
    const n = dy / 2 + lift
    const ly = s * sin + cos * n
    const lz = s * cos - sin * n
    out.push({
      x: sl.cx + u * rc + lz * rs,
      y: sl.cy + ly,
      z: sl.cz - u * rs + lz * rc,
      dx: du,
      dy,
      dz: ds,
      rotY: sl.rotY,
      tilt: sl.tilt,
    })
  }

  const u0 = -sl.width / 2
  const u1 = sl.width / 2
  const s0 = -sl.len / 2
  const s1 = sl.len / 2
  const rows = L.ps > 0 ? Math.ceil(sl.len / L.ps) + 1 : 1

  for (let r = 0; r < rows && out.length < budget; r++) {
    const sa = L.ps > 0 ? s0 + r * L.ps : s0
    if (sa >= s1) break
    const sb = Math.min(L.es > 0 ? sa + L.es : s1, s1)
    const ds = sb - sa
    if (ds < 0.01) continue
    const off = L.stagger > 0 && r % 2 === 1 ? L.pu * L.stagger : 0
    const cols = Math.ceil((sl.width + off) / L.pu) + 1
    for (let k = 0; k < cols && out.length < budget; k++) {
      const ca = Math.max(u0 - off + k * L.pu, u0)
      const cb = Math.min(u0 - off + k * L.pu + L.eu, u1)
      const du = cb - ca
      if (du < 0.01) continue
      place(ca + du / 2, sa + ds / 2, du, ds, L.t, 0)
    }
  }

  // Стоячі фальці / гофра — тонкі бруски на всю довжину падіння.
  if (L.rib) {
    const n = Math.floor(sl.width / L.rib.pitch)
    for (let k = 0; k <= n && out.length < budget; k++) {
      place(u0 + k * L.rib.pitch, 0, L.rib.w, sl.len, L.rib.h, L.t)
    }
  }
}

// Схили однієї зони. Мають ТОЧНО збігатися з геометрією HouseShell — інакше
// покриття «злітає» з даху.
function slopesOf(part: RoofPart, above: PlanRect[], roofY: number): Slope[] {
  // Плоский дах — рулон РІВНО по зоні: звісу в нього не буває, а `slopeBox`
  // додав би його й килим виліз би за парапет.
  if (part.kind === 'flat')
    return [{ cx: part.x, cy: roofY, cz: part.z, rotY: 0, tilt: 0, width: part.width, len: part.depth }]

  const g = slopeBox(part, above)
  const w = g.x1 - g.x0
  const d = g.z1 - g.z0
  const cx = (g.x0 + g.x1) / 2
  const cz = (g.z0 + g.z1) / 2

  const ridgeAlongZ = part.rotation % 180 === 0 ? d >= w : d < w
  const span = ridgeAlongZ ? w : d
  const across = ridgeAlongZ ? d : w
  // rotY геометрії; +90° переводить нашу систему (u вздовж гребеня) у ту, де
  // падіння йде вздовж локального X меша.
  const meshRotY = (ridgeAlongZ ? 0 : Math.PI / 2) + (part.kind === 'mono' && part.rotation >= 180 ? Math.PI : 0)
  const rotY = meshRotY + Math.PI / 2
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  const ang = Math.atan(tan)

  if (part.kind === 'mono') {
    const run = Math.max(span, 1e-6)
    const rise = span * tan
    // Вертикальна товщина плити — рівно як у monoGeometry.
    const tv = (ROOF_T * Math.hypot(run, rise)) / run
    return [
      {
        cx,
        cy: roofY + ROOF_LIFT + rise / 2 + tv,
        cz,
        rotY,
        tilt: ang,
        width: across,
        len: Math.hypot(span, rise),
      },
    ]
  }

  // Двосхилий: дві площини від карниза до гребеня посередині.
  const half = span / 2
  const run = Math.max(half, 1e-6)
  const rise = half * tan
  // Зі звісом дах — суцільна призма без окремої плити, тож і покриття лягає
  // рівно на схил. Без звісу зверху додано плиту, і покриття піднімається.
  const tv = part.overhang > 0 ? 0 : (ROOF_T * Math.hypot(run, rise)) / run
  const len = Math.hypot(half, rise)
  const c = Math.cos(meshRotY)
  const s = Math.sin(meshRotY)
  return ([-1, 1] as const).map((dir) => ({
    cx: cx + dir * (half / 2) * c,
    cy: roofY + ROOF_LIFT + rise / 2 + tv,
    cz: cz - dir * (half / 2) * s,
    rotY,
    // Схил падає ВІД гребеня, тож на половинах нахил дзеркальний.
    tilt: dir > 0 ? -ang : ang,
    width: across,
    len,
  }))
}

export interface RoofSkinGroup {
  key: string
  roofY: number
  spec: RoofMatSpec
  boxes: SkinBox[]
}

// Покриття всіх зон даху, згруповане за РІВНЕМ і матеріалом: рівень — щоб
// покриття виростало разом зі своїм ярусом даху, матеріал — щоб кожен
// малювався одним InstancedMesh.
export function roofSkin(
  plan: HousePlan,
  parts: RoofPart[],
  base: RoofMatSpec,
  perPart: Record<string, RoofMatSpec>,
  floorH: number,
): RoofSkinGroup[] {
  const groups = new Map<string, RoofSkinGroup>()
  for (const part of parts) {
    const spec = perPart[part.id] ?? base
    const roofY = (part.level + 1) * floorH
    const key = `${roofY}|${spec.kind}|${spec.color}`
    let g = groups.get(key)
    if (!g) {
      g = { key, roofY, spec, boxes: [] }
      groups.set(key, g)
    }
    const above = plan.floors[part.level + 1]?.slab ?? []
    for (const sl of slopesOf(part, above, roofY)) {
      if (part.kind === 'flat') {
        g.boxes.push({
          x: sl.cx,
          y: sl.cy + FLAT_T / 2,
          z: sl.cz,
          dx: sl.width,
          dy: FLAT_T,
          dz: sl.len,
          rotY: 0,
          tilt: 0,
        })
        continue
      }
      layElements(sl, spec.kind, g.boxes, MAX_ELEMENTS)
    }
  }
  return [...groups.values()].filter((g) => g.boxes.length > 0)
}
