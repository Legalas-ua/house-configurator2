import type { HousePlan, PlanRect, RoofMatKind, RoofMatSpec } from '../config/types'
import { parapetEdges, slopeBox, ROOF_LIFT, type RoofPart } from './roof'
import { WALL_T } from './windows'

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
  // Плоскі — суцільний килим, розкладки як такої немає.
  builtUp: { eu: 1, pu: 1, es: 0, ps: 0, t: 0.02, stagger: 0 },
  membrane: { eu: 1, pu: 1, es: 0, ps: 0, t: 0.015, stagger: 0 },
}

// Торцева планка скатного даху (закриває товщину пирога) і кожух парапету.
export const FASCIA_W = 0.04 // ширина планки вздовж грані
export const CAP_OUT = 0.035 // звис кожуха за грань парапету
export const CAP_H = 0.05 // висота кожуха

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
  top: number // найвища точка групи — звідси покриття «спускається» при появі
  spec: RoofMatSpec
  boxes: SkinBox[]
  trim?: boolean // група торцевих планок / кожуха: свій колір, не покриття
}

// Торцеві планки. Дошка стоїть ВЕРТИКАЛЬНО — не перпендикулярно до схилу.
// Перпендикулярна смуга при будь-якому куті лишала торець плити відкритим:
// торець плити вертикальний, а смуга нахилена. Уздовж скату вертикальну
// дошку набираємо короткими відрізками, і її нижня грань іде рівною лінією.
function fasciaOf(sl: Slope, kind: RoofMatKind, out: SkinBox[], plateT: number) {
  const cover = LAYOUT[kind].t + (LAYOUT[kind].rib?.h ?? 0)
  const cos = Math.cos(sl.tilt)
  const sin = Math.sin(sl.tilt)
  const rc = Math.cos(sl.rotY)
  const rs = Math.sin(sl.rotY)
  // Вертикальна товщина пирога: перпендикулярна плита при нахилі «розтягується».
  const H = plateT / Math.max(Math.abs(cos), 0.2) + cover + 0.03
  const w = FASCIA_W
  const lap = 0.005

  // Точка на площині покриття (u вздовж гребеня, s уздовж падіння) -> світ.
  const at = (u: number, s: number) => {
    const n = cover
    const ly = s * sin + cos * n
    const lz = s * cos - sin * n
    return {
      x: sl.cx + u * rc + lz * rs,
      y: sl.cy + ly,
      z: sl.cz - u * rs + lz * rc,
    }
  }
  // Вертикальна коробка: верх на рівні покриття, далі вниз на H.
  const put = (u: number, s: number, du: number, ds: number) => {
    const p = at(u, s)
    out.push({
      x: p.x,
      y: p.y + 0.004 - H / 2,
      z: p.z,
      dx: du,
      dy: H,
      dz: ds,
      rotY: sl.rotY,
      tilt: 0,
    })
  }

  const hw = sl.width / 2
  const hl = sl.len / 2
  const low = sl.tilt > 0 ? -1 : 1 // де нижній край схилу вздовж s

  // Карниз — одна дошка на всю ширину, з напуском на роги.
  put(0, low * (hl + w / 2 - lap), sl.width + 2 * w, w)

  // Скатні краї: вертикальна дошка не може бути одним нахиленим бруском, тож
  // набираємо її відрізками — низ виходить рівною прямою вздовж усього скату.
  const segs = Math.max(2, Math.ceil(sl.len / 0.2))
  const ds = sl.len / segs
  for (const side of [-1, 1] as const) {
    const u = side * (hw + w / 2 - lap)
    for (let i = 0; i < segs; i++) {
      const sc = -hl + ds * (i + 0.5)
      // Глибина по горизонталі: похилий відрізок у плані коротший.
      put(u, sc, w, ds * Math.abs(cos) + 0.01)
    }
  }
}


// Покриття всіх зон даху, згруповане за РІВНЕМ і матеріалом: рівень — щоб
// покриття виростало разом зі своїм ярусом даху, матеріал — щоб кожен
// малювався одним InstancedMesh.
export function roofSkin(
  plan: HousePlan,
  parts: RoofPart[],
  base: RoofMatSpec,
  flatBase: RoofMatSpec,
  perPart: Record<string, RoofMatSpec>,
  floorH: number,
): RoofSkinGroup[] {
  const groups = new Map<string, RoofSkinGroup>()
  const take = (key: string, roofY: number, spec: RoofMatSpec, trim = false) => {
    let g = groups.get(key)
    if (!g) {
      g = { key, roofY, top: roofY, spec, boxes: [], trim }
      groups.set(key, g)
    }
    return g
  }

  for (const part of parts) {
    const flat = part.kind === 'flat'
    const spec = perPart[part.id] ?? (flat ? flatBase : base)
    const roofY = (part.level + 1) * floorH
    const g = take(`${roofY}|${spec.kind}|${spec.color}`, roofY, spec)
    // Торець ходить за СВОЄЮ частиною даху: окремий колір на окремій зоні.
    const trimSpec: RoofMatSpec = { ...spec, color: spec.trim }
    const gt = take(`${roofY}|trim|${spec.trim}`, roofY, trimSpec, true)
    const above = plan.floors[part.level + 1]?.slab ?? []

    for (const sl of slopesOf(part, above, roofY)) {
      if (flat) {
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
        // Металевий кожух надівається ЗВЕРХУ на парапет по всьому периметру.
        capBoxes(part, above, roofY, gt.boxes)
        g.top = Math.max(g.top, roofY + FLAT_T + 0.05)
        gt.top = Math.max(gt.top, roofY + part.parapetH + CAP_H)
        continue
      }
      layElements(sl, spec.kind, g.boxes, MAX_ELEMENTS)
      fasciaOf(sl, spec.kind, gt.boxes, ROOF_T)
      // Найвища точка — щоб поява йшла зверху вниз, а не знизу вгору.
      const topY = sl.cy + (sl.len / 2) * Math.abs(Math.sin(sl.tilt)) + 0.2
      g.top = Math.max(g.top, topY)
      gt.top = Math.max(gt.top, topY)
    }
  }
  return [...groups.values()].filter((g) => g.boxes.length > 0)
}

// Кожух парапету: П-подібна накривка поверх стінки, зі звисом на обидва боки.
// Робимо трьома брусками — верхня полиця й дві крапельниці, — щоб вона була
// саме об'ємною, а не пофарбованою гранню.
function capBoxes(part: RoofPart, above: PlanRect[], roofY: number, out: SkinBox[]) {
  for (const e of parapetEdges(part, above)) {
    const t = part.parapetT
    // Та сама вісь, що й у геометрії парапету: зовнішня грань — грань стіни.
    const line = e.line + (e.nx + e.nz) * (WALL_T / 2 - t / 2)
    const y = roofY + part.parapetH
    const w = t + 2 * CAP_OUT
    for (const [ra, rb] of e.spans) {
      // На РОЗІ кожух має дійти рівно до ЗОВНІШНЬОГО краю перпендикулярного —
      // це пів стіни плюс його звис. Раніше тут стояло пів ширини кожуха, і
      // на кожному куті він виступав на зайві 5 см.
      const grow = WALL_T / 2 + CAP_OUT
      const a = Math.abs(ra - e.min) < 1e-4 ? ra - grow : ra
      const b = Math.abs(rb - e.max) < 1e-4 ? rb + grow : rb
      const len = b - a
      if (len < 0.05) continue
      const mid = (a + b) / 2
      const box = (c: number, yy: number, thick: number, hh: number) =>
        out.push(
          e.horizontal
            ? { x: mid, y: yy, z: c, dx: len, dy: hh, dz: thick, rotY: 0, tilt: 0 }
            : { x: c, y: yy, z: mid, dx: thick, dy: hh, dz: len, rotY: 0, tilt: 0 },
        )
      // Полиця зверху…
      box(line, y + 0.012, w, 0.024)
      // …і дві крапельниці по краях.
      for (const s of [-1, 1] as const) box(line + (s * w) / 2, y - CAP_H / 2 + 0.012, 0.02, CAP_H)
    }
  }
}
