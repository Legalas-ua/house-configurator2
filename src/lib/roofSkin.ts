import type { HousePlan, PlanRect, RoofMatKind, RoofMatSpec } from '../config/types'
import { cutByNeighbour, zoneSkeleton } from './roof'
import { facePoint, faceSpan, outlineEdges, planRise } from './roofSkeleton'
import {
  cornerStop,
  parapetCorner,
  parapetEdges,
  partRects,
  rectsBox,
  slopeBox,
  zoneRects,
  zoneRise,
  ROOF_LIFT,
  type RoofPart,
  type SideKey,
} from './roof'
import { WALL_T } from './windows'
import { CLAD_MAX_OUT } from './cladding'

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
const DRIP_T = 0.02 // товщина крапельниці по краю кожуха
// Жолоб єндови: ширина по обидва боки від лінії стику й підйом над карнизом.
const VALLEY_W = 0.36
const VALLEY_UP = 0.075

// Стіна, що йде ВИЩЕ за дах: межі вже розсунуті на пів стіни та її оздоблення,
// тож планка, підрізана рівно по цьому прямокутнику, спиняється саме на
// видимій поверхні стіни — не раніше й не пізніше.
export interface Blocker {
  x0: number
  x1: number
  z0: number
  z1: number
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
  // Вальмовий дах: схил не прямокутний, а трапеція/трикутник. Функція каже,
  // який проміжок уздовж гребеня існує на відстані s від центру схилу.
  clipU?: (s: number) => [number, number]
  noRake?: boolean // краї схилу — вальми, торцевої планки там не буває
  // Схил, якого немає в контурі: кутовий трикутник прямого скелета. Він
  // лежить УСЕРЕДИНІ даху, тож ні карнизної, ні торцевої планки на ньому не
  // буває — тільки саме покриття.
  inner?: boolean
  // Місце, де тіло даху ПІДРІЗАНЕ сусіднім: покриття там класти нікуди — воно
  // висітиме в повітрі. Підрізання по `clipU` цього не ловить: воно ріже смугу
  // вздовж гребеня, а виріз буває й посеред схилу.
  hidden?: (x: number, z: number) => boolean
  cap?: number // довжина кожуха на ВЕРХНЬОМУ краї (0/undefined — кожуха немає)
}

function layElements(sl: Slope, kind: RoofMatKind, out: SkinBox[], budget: number) {
  const L = LAYOUT[kind]
  const cos = Math.cos(sl.tilt)
  const sin = Math.sin(sl.tilt)
  const rc = Math.cos(sl.rotY)
  const rs = Math.sin(sl.rotY)

  // Ряди з НАПУСКОМ (черепиця, металочерепиця, ґонт) перекривають одне одного:
  // якщо класти їх пласко, кожен ряд врізається в наступний. Тому кожен
  // елемент ще й трохи «задирається» — нижній край піднімається рівно на
  // товщину, і ряд лягає НА сусідній знизу, як на справжньому даху.
  const lap = L.es > L.ps && L.ps > 0 ? Math.atan2(L.t, L.es) : 0
  const lapLift = (ds: number) => (ds / 2) * Math.sin(lap)

  // (u, s) на площині + підйом по нормалі -> світ.
  const place = (u: number, s: number, du: number, ds: number, dy: number, lift: number, bow = 0) => {
    if (out.length >= budget || du < 0.005 || ds < 0.005) return
    const n = dy / 2 + lift + bow
    const ly = s * sin + cos * n
    const lz = s * cos - sin * n
    const x = sl.cx + u * rc + lz * rs
    const z = sl.cz - u * rs + lz * rc
    if (sl.hidden?.(x, z)) return
    out.push({
      x,
      y: sl.cy + ly,
      z,
      dx: du,
      dy,
      dz: ds,
      rotY: sl.rotY,
      // Додатковий нахил елемента піднімає його НИЖНІЙ край над сусіднім рядом.
      tilt: sl.tilt + lap,
    })
  }

  const u0 = -sl.width / 2
  const u1 = sl.width / 2
  const s0 = -sl.len / 2
  const s1 = sl.len / 2

  // Елемент, підрізаний ребром ВАЛЬМИ. Ребро йде по діагоналі, тож обрізати
  // цілий ряд однією шириною не можна — виходили зубці. Елемент, який ребро
  // перетинає, ділимо на вузькі смуги по падінню й кожну ріжемо своєю
  // шириною: зріз читається рівною лінією вздовж ребра.
  const cutToHip = (ea: number, eb: number, sa: number, sb: number) => {
    const emit = (a: number, b: number, p: number, q: number) => {
      if (b - a < 0.01 || q - p < 0.005 || out.length >= budget) return
      // Верхній край елемента лишається на площині, нижній — задирається.
      place((a + b) / 2, (p + q) / 2, b - a, q - p, L.t, 0, lapLift(q - p))
    }
    if (!sl.clipU) {
      emit(Math.max(ea, u0), Math.min(eb, u1), sa, sb)
      return
    }
    const lo = sl.clipU(sa)
    const hi = sl.clipU(sb)
    // Елемент цілком усередині на обох кінцях — різати нічого.
    if (ea >= Math.max(lo[0], hi[0]) - 1e-6 && eb <= Math.min(lo[1], hi[1]) + 1e-6) {
      emit(ea, eb, sa, sb)
      return
    }
    const steps = Math.max(1, Math.ceil((sb - sa) / 0.03))
    for (let i = 0; i < steps; i++) {
      const p = sa + ((sb - sa) * i) / steps
      const q = sa + ((sb - sa) * (i + 1)) / steps
      const [ca, cb] = sl.clipU((p + q) / 2)
      emit(Math.max(ea, ca), Math.min(eb, cb), p, q)
    }
  }
  // На трапецієподібному схилі суцільна «картина» на всю довжину не годиться:
  // її довелося б різати по діагоналі. Тому там, де ширина змінна, ділимо на
  // ряди й кожен обрізаємо окремо — стик між ними на металі не видно.
  const ps = L.ps > 0 ? L.ps : sl.clipU ? 0.35 : 0
  const es = L.es > 0 ? L.es : sl.clipU ? 0.35 : 0
  const rows = ps > 0 ? Math.ceil(sl.len / ps) + 1 : 1

  for (let r = 0; r < rows && out.length < budget; r++) {
    const sa = ps > 0 ? s0 + r * ps : s0
    if (sa >= s1) break
    const sb = Math.min(es > 0 ? sa + es : s1, s1)
    const ds = sb - sa
    if (ds < 0.01) continue
    const off = L.stagger > 0 && r % 2 === 1 ? L.pu * L.stagger : 0
    const cols = Math.ceil((sl.width + off) / L.pu) + 1
    for (let k = 0; k < cols && out.length < budget; k++) {
      const ea = u0 - off + k * L.pu
      const eb = ea + L.eu
      cutToHip(ea, eb, sa, sb)
    }
  }

  // Стоячі фальці / гофра — тонкі бруски на всю довжину падіння.
  if (L.rib) {
    const n = Math.floor(sl.width / L.rib.pitch)
    for (let k = 0; k <= n && out.length < budget; k++) {
      const u = u0 + k * L.rib.pitch
      if (!sl.clipU) {
        place(u, 0, L.rib.w, sl.len, L.rib.h, L.t)
        continue
      }
      // На вальмі ребро обрізається там, де схил закінчився. Крок дрібний —
      // інакше кінець фальцу закінчувався б помітною сходинкою.
      const steps = Math.max(2, Math.ceil(sl.len / 0.06))
      for (let i = 0; i < steps; i++) {
        const sc = -sl.len / 2 + (sl.len * (i + 0.5)) / steps
        const [a, b] = sl.clipU(sc)
        if (u < a - 0.01 || u > b + 0.01) continue
        place(u, sc, L.rib.w, sl.len / steps + 0.01, L.rib.h, L.t)
      }
    }
  }
}


// Обмеження вздовж гребеня на відстані `s` по падінню — там, де під схилом
// справді є частини зони. Відображення (u, s) -> світ лінійне, тож достатньо
// однієї опорної точки й напрямку.
function clipToRects(
  rects: PlanRect[],
  ridgeAlongZ: boolean,
  tilt: number,
  rotY: number,
  cx: number,
  cz: number,
): (s: number) => [number, number] {
  const cos = Math.cos(tilt)
  const rc = Math.cos(rotY)
  const rs = Math.sin(rotY)
  return (s: number) => {
    const lz = s * cos
    const x0 = cx + lz * rs
    const z0 = cz + lz * rc
    // Координата ПАДІННЯ в цій точці й напрямок осі гребеня.
    const fall = ridgeAlongZ ? x0 : z0
    const r0 = ridgeAlongZ ? z0 : x0
    const k = ridgeAlongZ ? -rs : rc
    let lo = Infinity
    let hi = -Infinity
    for (const r of rects) {
      const fa = ridgeAlongZ ? r.x - r.width / 2 : r.z - r.depth / 2
      const fb = ridgeAlongZ ? r.x + r.width / 2 : r.z + r.depth / 2
      if (fall < fa - 0.01 || fall > fb + 0.01) continue
      lo = Math.min(lo, ridgeAlongZ ? r.z - r.depth / 2 : r.x - r.width / 2)
      hi = Math.max(hi, ridgeAlongZ ? r.z + r.depth / 2 : r.x + r.width / 2)
    }
    if (lo === Infinity || Math.abs(k) < 1e-9) return [0, 0]
    const a = (lo - r0) / k
    const b = (hi - r0) / k
    return [Math.min(a, b), Math.max(a, b)]
  }
}

// Схили однієї зони. Мають ТОЧНО збігатися з геометрією HouseShell — інакше
// покриття «злітає» з даху.
function slopesOf(
  part: RoofPart,
  above: PlanRect[],
  roofY: number,
  siblings: PlanRect[],
  plan: HousePlan,
  parts: RoofPart[],
): Slope[] {
  const rects = partRects(part)
  // Зона, що ВРІЗАЄТЬСЯ в сусідню, теж іде через скелет: інакше її нічим
  // підрізати по чужому скату.
  if (rects.length <= 1 && !cutByNeighbour(parts, part))
    return slopesOfRect(part, above, roofY, rects[0], siblings)
  // СКАТНИЙ І ВАЛЬМОВИЙ — один дах по прямому скелету: стільки схилів, скільки
  // карнизів у контуру, кожен підрізаний по своїй ділянці скелета.
  if (part.kind === 'gable' || part.kind === 'hip') return skeletonSlopes(part, roofY, zoneSkeleton(plan, parts, part))
  // ОДНОСХИЛИЙ — одна площина на всю зону, підрізана по її контуру. Скелет
  // йому не потрібен: у односхилого немає ні гребеня, ні єндов.
  if (part.kind === 'mono') {
    const boxes = rects.map((r) => {
      const b = slopeBox(part, above, r, siblings)
      return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, width: b.x1 - b.x0, depth: b.z1 - b.z0 }
    })
    return slopesOfRect(part, above, roofY, rectsBox(rects), siblings, boxes)
  }
  // Решта типів поки лишається сумою схилів своїх частин.
  return rects.flatMap((r) => slopesOfRect(part, above, roofY, r, siblings))
}

// Схили складеної зони: по одному на кожен КАРНИЗ контуру плюс кутові
// трикутники. Мають ТОЧНО збігатися з тілом даху в HouseShell — обидва
// беруть ті самі схили того самого скелета.
function skeletonSlopes(part: RoofPart, roofY: number, sk: ReturnType<typeof zoneSkeleton>): Slope[] {
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  const ang = Math.atan(tan)
  // Зі звісом покрівля лягає просто на тіло даху; без звісу зверху ще плита.
  const tv = part.kind === 'gable' && part.overhang === 0 ? ROOF_T / Math.cos(ang) : 0
  return sk.faces.map((f) => {
    const e = f.edge
    let uMin = Infinity
    let uMax = -Infinity
    for (const s of f.steps) {
      uMin = Math.min(uMin, s.lo)
      uMax = Math.max(uMax, s.hi)
    }
    const tMax = f.steps[f.steps.length - 1].t
    const rise = tMax * tan
    const len = Math.hypot(tMax, rise)
    const uc = (uMin + uMax) / 2
    const [cx, cz] = facePoint(e, uc, tMax / 2)
    // Той самий лад, що й у вальмового: rotY розвертає схил карнизом униз,
    // а u йде вздовж карниза.
    const rotY = e.horizontal ? (e.n < 0 ? 0 : Math.PI) : e.n < 0 ? Math.PI / 2 : -Math.PI / 2
    const sign = e.horizontal ? -e.n : e.n
    const cos = Math.cos(ang)
    return {
      cx,
      cy: roofY + ROOF_LIFT + rise / 2 + tv,
      cz,
      rotY,
      tilt: ang,
      width: uMax - uMin,
      len,
      clipU: (s: number): [number, number] => {
        const [lo, hi] = faceSpan(f, Math.min(Math.max((s + len / 2) * cos, 0), tMax))
        const a = (lo - uc) * sign
        const b = (hi - uc) * sign
        return [Math.min(a, b), Math.max(a, b)]
      },
      // Кожух — по верхньому краю; де там не гребінь, а вальма, підрізання
      // стягує його в нуль і він сам зникає.
      cap: e.corner ? 0 : uMax - uMin,
      // Боки схилу тут — не фронтони, а лінії єндов і вальм: вертикальна
      // дошка на них стирчала б поперек даху.
      noRake: true,
      inner: e.corner,
      hidden: sk.hidden,
    }
  })
}

function slopesOfRect(
  part: RoofPart,
  above: PlanRect[],
  roofY: number,
  rect: PlanRect,
  siblings: PlanRect[],
  // Складена зона: сюди йдуть ЇЇ частини, і покриття підрізається по них.
  clipRects?: PlanRect[],
): Slope[] {
  // Плоский дах — рулон РІВНО по зоні: звісу в нього не буває, а `slopeBox`
  // додав би його й килим виліз би за парапет.
  if (part.kind === 'flat')
    return [{ cx: rect.x, cy: roofY, cz: rect.z, rotY: 0, tilt: 0, width: rect.width, len: rect.depth }]

  const zone = zoneRise(part, above, siblings)
  const g = slopeBox(part, above, rect, siblings)
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

  if (part.kind === 'hip') {
    // Вальмовий: схили з чотирьох боків, гребінь уздовж ДОВШОЇ сторони.
    // Кожен схил — трапеція (довгі боки) або трикутник (короткі): при
    // підйомі проміжок уздовж гребеня звужується на пройдену в плані відстань.
    const shortSide = Math.min(w, d)
    const rise = zone || (shortSide / 2) * tan
    const len = Math.hypot(shortSide / 2, rise)
    // Вальмовий — СУЦІЛЬНЕ тіло, окремої похилої плити в нього немає. Тому
    // покриття лягає рівно на поверхню: жодного зсуву на товщину плити.
    const cy = roofY + ROOF_LIFT + rise / 2
    const inset = shortSide / 2
    const along = w >= d
    const ridgeLen = Math.abs(w - d)
    const sides: { rotY: number; cx: number; cz: number; base: number; cap: number }[] = [
      { rotY: 0, cx, cz: g.z0 + inset / 2, base: w, cap: along ? ridgeLen : 0 },
      { rotY: Math.PI, cx, cz: g.z1 - inset / 2, base: w, cap: 0 },
      { rotY: Math.PI / 2, cx: g.x0 + inset / 2, cz, base: d, cap: along ? 0 : ridgeLen },
      { rotY: -Math.PI / 2, cx: g.x1 - inset / 2, cz, base: d, cap: 0 },
    ]
    return sides.map((sd) => ({
      cx: sd.cx,
      cy,
      cz: sd.cz,
      rotY: sd.rotY,
      tilt: ang,
      width: sd.base,
      len,
      cap: sd.cap,
      clipU: (sp: number) => {
        const cut = ((sp + len / 2) * inset) / Math.max(len, 1e-6)
        const half = Math.max(0, sd.base / 2 - cut)
        return [-half, half] as [number, number]
      },
      noRake: true,
    }))
  }

  if (part.kind === 'mono') {
    const run = Math.max(span, 1e-6)
    const rise = zone || span * tan
    // Вертикальна товщина плити — рівно як у monoGeometry.
    const tv = (ROOF_T * Math.hypot(run, rise)) / run
    const cy = roofY + ROOF_LIFT + rise / 2 + tv
    return [
      {
        cx,
        cy,
        cz,
        rotY,
        tilt: ang,
        width: across,
        len: Math.hypot(span, rise),
        // Підрізання по контуру складеної зони: на кожній відстані по падінню
        // беремо ту смугу вздовж гребеня, де частини зони справді є.
        clipU: clipRects && clipToRects(clipRects, ridgeAlongZ, ang, rotY, cx, cz),
      },
    ]
  }

  // Двосхилий: дві площини від карниза до гребеня посередині.
  const half = span / 2
  const run = Math.max(half, 1e-6)
  const rise = zone || half * tan
  // Зі звісом дах — суцільна призма без окремої плити, тож і покриття лягає
  // рівно на схил. Без звісу зверху додано плиту, і покриття піднімається.
  const tv = part.overhang > 0 ? 0 : (ROOF_T * Math.hypot(run, rise)) / run
  const len = Math.hypot(half, rise)
  const c = Math.cos(meshRotY)
  const sn = Math.sin(meshRotY)
  return ([-1, 1] as const).map((dir) => {
    const scx = cx + dir * (half / 2) * c
    const scz = cz - dir * (half / 2) * sn
    return {
      cx: scx,
      cy: roofY + ROOF_LIFT + rise / 2 + tv,
      cz: scz,
      rotY,
      // Схил падає ВІД гребеня, тож на половинах нахил дзеркальний.
      tilt: dir > 0 ? -ang : ang,
      width: across,
      len,
      // Кожух ставлять ОБИДВІ половини — вони перекриваються над гребенем
      // і закривають шов.
      cap: across,
      // Підрізання по контуру складеної зони — те саме, що в односхилого:
      // «намет» один на всю зону, а частини відрізають від нього свої шматки.
      clipU: clipRects && clipToRects(clipRects, ridgeAlongZ, ang, rotY, scx, scz),
    }
  })
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
function fasciaOf(
  sl: Slope,
  kind: RoofMatKind,
  out: SkinBox[],
  plateT: number,
  // Стіни, що йдуть ВИЩЕ за цей дах, уже розширені на своє оздоблення. Планка
  // ріжеться рівно по них: далі вона входила б просто в цеглу.
  blockers: Blocker[] = [],
) {
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
  const hw = sl.width / 2
  const hl = sl.len / 2
  const low = sl.tilt > 0 ? -1 : 1 // де нижній край схилу вздовж s

  // Ділянки планки, ВІЛЬНІ від стіни. Різати доводиться саме ділянками: грань
  // буває притиснута до стіни лише частиною, і викидати всю планку так само
  // неправильно, як лишати її в цеглі.
  //
  // Рахуємо ТОЧНО, а не вибіркою з кроком: блокери — прямокутники по осях, а
  // планка йде по прямій, тож перетин — це відрізок параметрів. З вибіркою
  // планка то не доходила до стіни, то заходила в неї — залежно від того, куди
  // випала точка.
  const freeRuns = (a: number, b: number, world: (t: number) => { x: number; z: number }) => {
    const p0 = world(a)
    const p1 = world(b)
    const dx = p1.x - p0.x
    const dz = p1.z - p0.z
    // Проміжки параметра u ∈ [0,1], де планка всередині блокера.
    const busy: [number, number][] = []
    for (const r of blockers) {
      // Плита по осі: або вся пряма всередині смуги, або відрізок [lo, hi].
      const slab = (p: number, d: number, lo: number, hi: number): [number, number] | null => {
        if (Math.abs(d) < 1e-9) return p > lo && p < hi ? [0, 1] : null
        const t0 = (lo - p) / d
        const t1 = (hi - p) / d
        return [Math.min(t0, t1), Math.max(t0, t1)]
      }
      const sx = slab(p0.x, dx, r.x0, r.x1)
      const sz = slab(p0.z, dz, r.z0, r.z1)
      if (!sx || !sz) continue
      const lo = Math.max(0, sx[0], sz[0])
      const hi = Math.min(1, sx[1], sz[1])
      if (hi > lo) busy.push([lo, hi])
    }
    busy.sort((p, q) => p[0] - q[0])
    const runs: [number, number][] = []
    let cur = 0
    for (const [p, q] of busy) {
      if (p > cur) runs.push([cur, p])
      cur = Math.max(cur, q)
    }
    if (cur < 1) runs.push([cur, 1])
    return runs
      .map(([p, q]) => [a + p * (b - a), a + q * (b - a)] as [number, number])
      .filter(([p, q]) => q - p > 0.03)
  }

  const hRake = plateT + cover + 0.02
  const nRake = cover + 0.004 - hRake / 2

  // КАРНИЗ. Торець плити тут вертикальний, тож і дошка вертикальна — при
  // будь-якому куті вона закриває всю товщину пирога.
  //
  // УГЛИБ (під схил) вона йде далі за свою ширину — рівно на стільки, на
  // скільки «відступає» низ скатної дошки. Та нахилена, тож її нижній край
  // зсунутий угору по схилу, і на розі між ними лишався трикутний просвіт.
  // Назовні цього не видно: додана частина ховається під самим схилом.
  const eaveOut = low * (hl + w - lap) // зовнішня грань дошки — вона не рухається
  const eaveDeep = w + hRake * Math.abs(sin)
  const eaveS = eaveOut - low * (eaveDeep / 2)
  // СКЛАДЕНА зона: планка є лише там, де під нею СПРАВДІ є дах. Схил у неї
  // будується на габариті зони, і без цього карнизна дошка вилітала в повітря
  // над вирізом Г-подібного контуру.
  const clipAt = (s: number): [number, number] =>
    sl.clipU ? sl.clipU(Math.max(-hl, Math.min(hl, s))) : [-hw, hw]
  const [eu0, eu1] = clipAt(low * hl)
  for (const [a, b] of eu1 - eu0 < 0.05 ? [] : freeRuns(eu0 - w, eu1 + w, (u) => at(u, eaveS))) {
    const mid = at((a + b) / 2, eaveS)
    // Висоту беремо по ЗОВНІШНІЙ грані: якби брали по центру, дошка стирчала б
    // над покриттям — усередину схил підіймається.
    const top = at((a + b) / 2, eaveOut).y
    out.push({
      x: mid.x,
      y: top + 0.004 - H / 2,
      z: mid.z,
      dx: b - a,
      dy: H,
      dz: eaveDeep,
      rotY: sl.rotY,
      tilt: 0,
    })
  }

  // СКАТНІ КРАЇ. Тут навпаки: торець плити йде ПАРАЛЕЛЬНО схилу, тож дошка
  // теж нахилена — одним суцільним бруском. Набирати її вертикальними
  // відрізками не можна: край перетворювався на сходинки.
  if (sl.noRake) return
  // Дошка доходить рівно ДО ГРЕБЕНЯ і не далі. Раніше вона заходила за нього
  // на висоту пирога — але за гребенем площина цього схилу йде ВГОРУ над
  // сусіднім, тож обидві дошки вилітали в повітря й перехрещувались (той самий
  // «хрест» на зламі). Кут між ними накриває кожух гребеня, розширений на
  // товщину самих дощок.
  // Дошка спиняється рівно на КАРНИЗІ, а не виходить за нього на свою ширину:
  // ріг за неї бере карнизна планка, вона й так загортається на ширину скатної.
  // Раніше обидві виходили одна за одну, і на кожному розі стирчав хрестик —
  // «бакенбарди» на скріншоті Lev.
  const s0 = -hl
  const s1 = hl
  // Скатний край СКЛАДЕНОЇ зони йде сходинками: на різних ділянках падіння він
  // стоїть у різних місцях. Тому спершу ділимо падіння на ділянки зі спільним
  // краєм, а вже на кожній кладемо суцільний брусок — інакше дошка йшла б по
  // габариту зони й половина її висіла б у повітрі.
  const rakeRuns = (side: -1 | 1): [number, number, number][] => {
    if (!sl.clipU) return [[side * (hw + w / 2 - lap), s0, s1]]
    const out: [number, number, number][] = []
    const n = Math.max(2, Math.ceil((s1 - s0) / 0.2))
    let edge = NaN
    let start = s0
    const close = (at: number) => {
      if (!Number.isNaN(edge) && at - start > 0.05) out.push([edge + side * (w / 2 - lap), start, at])
    }
    for (let i = 0; i <= n; i++) {
      const s = s0 + ((s1 - s0) * i) / n
      const c = clipAt(s)
      const e = c[1] - c[0] < 0.05 ? NaN : c[side < 0 ? 0 : 1]
      if (Number.isNaN(e) !== Number.isNaN(edge) || Math.abs(e - edge) > 0.05) {
        close(s)
        edge = e
        start = s
      }
    }
    close(s1)
    return out
  }
  for (const side of [-1, 1] as const)
    for (const [u, ra, rb] of rakeRuns(side)) {
    for (const [a, b] of freeRuns(ra, rb, (s) => at(u, s))) {
      const sc = (a + b) / 2
      const ly = sc * sin + cos * nRake
      const lz = sc * cos - sin * nRake
      out.push({
        x: sl.cx + u * rc + lz * rs,
        y: sl.cy + ly,
        z: sl.cz - u * rs + lz * rc,
        dx: w,
        dy: hRake,
        dz: b - a,
        rotY: sl.rotY,
        tilt: sl.tilt,
      })
      }
    }
}

// Кожух гребеня. Кладеться ПО СХИЛУ, а не горизонтальним бруском поверх:
// плаский брусок над коником спирався лише серединою і «висів» краями.
// Кожен схил дає свою половину; вони перекриваються над гребенем і шов
// закривається.
const CAP_D = 0.2 // ширина половини кожуха вздовж падіння
function ridgeCap(sl: Slope, kind: RoofMatKind, out: SkinBox[]) {
  if (!sl.cap) return
  const cover = LAYOUT[kind].t + (LAYOUT[kind].rib?.h ?? 0)
  const sin = Math.sin(sl.tilt)
  const cos = Math.cos(sl.tilt)
  const rc = Math.cos(sl.rotY)
  const rs = Math.sin(sl.rotY)
  const dir = sl.tilt > 0 ? 1 : -1 // куди вздовж s лежить верхній край
  // Центр пластини трохи НИЖЧЕ гребеня, щоб вона лягла на схил і ще
  // перекрила сам гребінь.
  const s = dir * (sl.len / 2 - CAP_D / 2 + 0.06)
  const n = cover + 0.012
  const ly = s * sin + cos * n
  const lz = s * cos - sin * n
  // Там, де є скатні дошки, кожух виходить і на них: інакше на самій маківці
  // фронтону лишається відкритий гострий кут між двома дошками.
  const overRake = sl.noRake ? 0 : 2 * (FASCIA_W + 0.01)
  // Складена зона: гребінь існує лише там, де під ним справді є дах. Без
  // підрізання кожух вилітав у повітря над вирізом Г-подібного контуру.
  let uc = 0
  let along = sl.cap
  if (sl.clipU) {
    const [lo, hi] = sl.clipU(s)
    if (hi - lo < 0.05) return
    uc = (lo + hi) / 2
    along = hi - lo
  }
  out.push({
    x: sl.cx + uc * rc + lz * rs,
    y: sl.cy + ly,
    z: sl.cz - uc * rs + lz * rc,
    dx: along + overRake,
    dy: 0.028,
    dz: CAP_D,
    rotY: sl.rotY,
    tilt: sl.tilt,
  })
}

// Карнизні планки складеного ОДНОСХИЛОГО, яких не бачить схил. Схил у такої
// зони будується на габариті, тож його власна планка лягає лише на НИЖНІЙ край
// габариту. А в Г-подібного контуру карниз є ще й на внутрішній грані — у
// крила свій нижній край, і він лишався без планки.
function monoEaveFascia(
  part: RoofPart,
  above: PlanRect[],
  roofY: number,
  siblings: PlanRect[],
  kind: RoofMatKind,
  out: SkinBox[],
  skip: (x: number, z: number) => boolean,
) {
  const boxes = partRects(part).map((r) => {
    const b = slopeBox(part, above, r, siblings)
    return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 }
  })
  const g = slopeBox(part, above, undefined, siblings)
  const w = g.x1 - g.x0
  const d = g.z1 - g.z0
  const alongZ = part.rotation % 180 === 0 ? d >= w : d < w
  const low = part.rotation < 180 ? (alongZ ? g.x0 : g.z1) : alongZ ? g.x1 : g.z0
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  const ang = Math.atan(tan)
  const cover = roofSkinHeight(kind)
  const tv = ROOF_T / Math.cos(ang)
  const H = ROOF_T / Math.max(Math.cos(ang), 0.2) + cover + 0.03
  const deep = FASCIA_W + (ROOF_T + cover + 0.02) * Math.abs(Math.sin(ang))

  for (const e of outlineEdges(boxes)) {
    // Грань упоперек падіння — це або карниз, або висока стіна.
    if ((alongZ ? e.horizontal : !e.horizontal) || Math.abs(e.line - low) < 0.01) continue
    // Карниз лише там, де дах ЗА гранню йде ВГОРУ. Якщо навпаки — це висока
    // стіна під верхньою кромкою схилу, планки там не буває.
    const inward = e.line - e.n * 0.05
    if (Math.abs(inward - low) <= Math.abs(e.line - low)) continue
    const mid = (e.a + e.b) / 2
    if (skip(e.horizontal ? mid : e.line, e.horizontal ? e.line : mid)) continue
    // Зовнішня грань дошки виходить за край даху рівно як у схилу.
    const face = e.line + e.n * (FASCIA_W - 0.005)
    const top = roofY + ROOF_LIFT + Math.abs(face - low) * tan + tv + cover
    const c = e.line + e.n * (FASCIA_W - 0.005 - deep / 2)
    out.push({
      x: e.horizontal ? mid : c,
      y: top + 0.004 - H / 2,
      z: e.horizontal ? c : mid,
      dx: e.b - e.a,
      dy: H,
      dz: deep,
      rotY: e.horizontal ? 0 : Math.PI / 2,
      tilt: 0,
    })
  }
}

// Кожухи на ПОХИЛИХ ребрах складеної зони. Профіль кожного схилу вже містить
// ці ребра: там, де межа смуги їде вбік із глибиною, схил і сходиться із
// сусіднім під 45°. Ребро буває двох ґатунків — вальма (дах над ним
// перегинається ВНИЗ, і шов треба накрити) та єндова (перегин угору, там
// жолоб). Розрізняємо їх просто: дивимось, що по обидва боки від ребра —
// нижче чи вище.
function skeletonCaps(
  part: RoofPart,
  sk: ReturnType<typeof zoneSkeleton>,
  roofY: number,
  kind: RoofMatKind,
  out: SkinBox[],
  skip: (x: number, z: number) => boolean,
) {
  const tan = Math.tan((part.pitch * Math.PI) / 180)
  const tv = part.kind === 'gable' && part.overhang === 0 ? ROOF_T / Math.cos(Math.atan(tan)) : 0
  const y = (t: number) => roofY + ROOF_LIFT + t * tan + tv
  for (const f of sk.faces) {
    for (let i = 0; i + 1 < f.steps.length; i++) {
      const s0 = f.steps[i]
      const s1 = f.steps[i + 1]
      if (s1.t - s0.t < 0.05) continue
      for (const side of ['lo', 'hi'] as const) {
        const [u0, u1] = [s0[side], s1[side]]
        if (Math.abs(u1 - u0) < 0.05) continue // ребро вздовж падіння — не похиле
        const [x0, z0] = facePoint(f.edge, u0, s0.t)
        const [x1, z1] = facePoint(f.edge, u1, s1.t)
        if (skip(x0, z0) || skip(x1, z1)) continue
        // Перегин донизу (вальма) чи догори (єндова)? Пробуємо трохи вбік від
        // середини ребра поперек нього.
        const mx = (x0 + x1) / 2
        const mz = (z0 + z1) / 2
        const len = Math.hypot(x1 - x0, z1 - z0)
        // Короткий відрізок — це не ребро, а похибка розкрою: справжня вальма
        // чи єндова завжди довга. Інакше на даху з'являвся зайвий шматочок
        // кожуха завдовжки кілька сантиметрів.
        if (len < 0.3) continue
        const px = (-(z1 - z0) / len) * 0.2
        const pz = ((x1 - x0) / len) * 0.2
        const h = planRise(sk.edges, mx, mz)
        // Під сусідським дахом — це лінія ВРІЗКИ, теж єндова.
        const up = planRise(sk.edges, mx + px, mz + pz) > h + 0.01 || sk.hidden(mx + px, mz + pz)
        const down = planRise(sk.edges, mx - px, mz - pz) > h + 0.01 || sk.hidden(mx - px, mz - pz)
        // Обабіч НИЖЧЕ — це вальма: перегин донизу, шов накриває кожух зверху.
        // Обабіч ВИЩЕ — єндова: шов лягає в саму складку, ширшою планкою.
        if (up !== down) continue // не ребро, а звичайний край схилу
        const valley = up && down
        hipCap(
          [x0, y(s0.t), z0],
          [x1, y(s1.t), z1],
          roofSkinHeight(kind) + (valley ? 0.002 : 0.012),
          out,
          valley ? 0.3 : 0.16,
        )
      }
    }
  }
}

// Кожух на ВАЛЬМІ — по діагональному ребру між сусідніми схилами. Ребро йде
// під кутом і в плані, і по висоті, тож поворот беремо з самого відрізка.
function hipCap(
  a: [number, number, number],
  b: [number, number, number],
  lift: number,
  out: SkinBox[],
  width = 0.16,
) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const dz = b[2] - a[2]
  const flat = Math.hypot(dx, dz)
  const len = Math.hypot(flat, dy)
  if (len < 0.05) return
  const rotY = Math.atan2(dx, dz)
  const tilt = Math.atan2(dy, flat)
  out.push({
    x: (a[0] + b[0]) / 2,
    y: (a[1] + b[1]) / 2 + lift,
    z: (a[2] + b[2]) / 2,
    dx: width,
    dy: 0.028,
    dz: len,
    rotY,
    tilt,
  })
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
    // Точка впирається в стіну, що йде ВИЩЕ за цей дах? Схил там уже підрізаний
    // до її зовнішньої грані, а на грані ще стоїть оздоблення — планка,
    // поставлена «як завжди», йшла просто в цеглу. Вищою буває і стіна поверху
    // вище, і фронтон СУСІДНЬОЇ зони даху: на стику двох крил планка одного
    // впирається в торець другого.
    // Межі стіни = вісь плюс пів товщини й оздоблення: рівно видима поверхня.
    const out = WALL_T / 2 + CLAD_MAX_OUT
    // Сусідні зони того ж рівня: до них скат доходить упритул, без звісу.
    const siblings = zoneRects(parts, part)
    const blockers: Blocker[] = [...above, ...siblings].map((r) => ({
      x0: r.x - r.width / 2 - out,
      x1: r.x + r.width / 2 + out,
      z0: r.z - r.depth / 2 - out,
      z1: r.z + r.depth / 2 + out,
    }))
    const atWall = (x: number, z: number) =>
      blockers.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)

    for (const sl of slopesOf(part, above, roofY, siblings, plan, parts)) {
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
        g.top = Math.max(g.top, roofY + FLAT_T + 0.05)
        continue
      }
      layElements(sl, spec.kind, g.boxes, MAX_ELEMENTS)
      if (!sl.inner) fasciaOf(sl, spec.kind, gt.boxes, ROOF_T, blockers)
      // Між схилами на гребені лишається щілина — накриваємо кожухом.
      if (part.kind !== 'mono') ridgeCap(sl, spec.kind, gt.boxes)
      // Найвища точка — щоб поява йшла зверху вниз, а не знизу вгору.
      const topY = sl.cy + (sl.len / 2) * Math.abs(Math.sin(sl.tilt)) + 0.2
      g.top = Math.max(g.top, topY)
      gt.top = Math.max(gt.top, topY)
    }

    // Металевий кожух надівається ЗВЕРХУ на парапет по всьому периметру — ОДИН
    // на зону. Раніше він стояв усередині циклу по схилах, а в складеної зони
    // схил на кожну частину: кожух будувався двічі-тричі поспіль, коробка в
    // коробку. Звідси й брудний стик на розі.
    if (flat) {
      capBoxes(part, above, roofY, gt.boxes)
      gt.top = Math.max(gt.top, roofY + part.parapetH + CAP_H)
    }

    // Вальма: чотири діагональні ребра між схилами. Шов на них закриває
    // окремий кожух, покладений ПО ребру — тобто теж під кутом.
    // Складена зона: усі ребра в неї похилі — і вальми, і єндови. Кожух
    // кладеться по самому ребру, як і на простій вальмі.
    if (part.kind !== 'flat' && part.kind !== 'mono' && (partRects(part).length > 1 || cutByNeighbour(parts, part)))
      skeletonCaps(part, zoneSkeleton(plan, parts, part), roofY, spec.kind, gt.boxes, atWall)
    // Складений односхилий: карниз крила схил не бачить — його планку кладемо
    // окремо, по контуру зони.
    if (part.kind === 'mono' && partRects(part).length > 1)
      monoEaveFascia(part, above, roofY, siblings, spec.kind, gt.boxes, atWall)
    if (part.kind === 'hip' && partRects(part).length === 1) {
      const gb = slopeBox(part, above, undefined, siblings)
      const w = gb.x1 - gb.x0
      const d = gb.z1 - gb.z0
      const shortSide = Math.min(w, d)
      const rise = (shortSide / 2) * Math.tan((part.pitch * Math.PI) / 180)
      const along = w >= d
      const y0 = roofY + ROOF_LIFT
      const yr = y0 + rise
      const rx = along ? [gb.x0 + shortSide / 2, gb.x1 - shortSide / 2] : [(gb.x0 + gb.x1) / 2, (gb.x0 + gb.x1) / 2]
      const rz = along ? [(gb.z0 + gb.z1) / 2, (gb.z0 + gb.z1) / 2] : [gb.z0 + shortSide / 2, gb.z1 - shortSide / 2]
      const corners: [number, number][] = [
        [gb.x0, gb.z0],
        [gb.x1, gb.z0],
        [gb.x1, gb.z1],
        [gb.x0, gb.z1],
      ]
      for (const [cx2, cz2] of corners) {
        // Ребро, що впирається в стіну (сусідня зона чи поверх вище), не
        // ставимо: воно йде просто в її оздоблення.
        if (atWall(cx2, cz2)) continue
        // Ближчий кінець гребеня — до нього й іде ребро з цього рогу.
        const i = Math.hypot(cx2 - rx[0], cz2 - rz[0]) <= Math.hypot(cx2 - rx[1], cz2 - rz[1]) ? 0 : 1
        hipCap([cx2, y0, cz2], [rx[i], yr, rz[i]], roofSkinHeight(spec.kind) + 0.012, gt.boxes)
      }
    }
  }

  // ЄНДОВИ. Два сусідні скати, що сходяться КАРНИЗАМИ, утворюють жолоб — саме
  // в нього збігає вода. Схили тепер доходять до спільної лінії впритул
  // (`zoneSides` у lib/roof.ts), і лишається закрити сам шов планкою.
  //
  // Беремо лише той випадок, який справді читається як єндова: обидві грані —
  // карнизи (тобто перпендикулярні своєму гребеню) і обидва скати на одному
  // рівні. Якщо навпроти фронтон — це вже примикання до стіни, і там працює
  // підрізання планок, а не жолоб.
  for (const g of valleys(parts, floorH)) {
    const spec = perPart[g.partId] ?? base
    const gt = take(`${g.roofY}|trim|${spec.trim}`, g.roofY, { ...spec, color: spec.trim }, true)
    gt.boxes.push(g.box)
    gt.top = Math.max(gt.top, g.box.y + 0.2)
  }
  return [...groups.values()].filter((g) => g.boxes.length > 0)
}

// Чи є ця сторона зони КАРНИЗОМ (схил падає до неї), а не фронтоном.
function isEaveSide(part: RoofPart, rect: PlanRect, side: SideKey): boolean {
  if (part.kind === 'flat') return false
  if (part.kind === 'hip') return true // вальма падає на всі чотири боки
  const ridgeAlongZ = part.rotation % 180 === 0 ? rect.depth >= rect.width : rect.depth < rect.width
  const eaveX = ridgeAlongZ // гребінь уздовж Z -> схили падають по X
  const alongX = side === 'xmin' || side === 'xmax'
  if (part.kind === 'mono') {
    // В односхилого карниз ОДИН — з протилежного від підйому боку.
    const low: SideKey = ridgeAlongZ
      ? part.rotation >= 180
        ? 'xmax'
        : 'xmin'
      : part.rotation >= 180
        ? 'zmax'
        : 'zmin'
    return side === low
  }
  return alongX === eaveX
}

// Планки єндов для всіх пар сусідніх зон.
function valleys(parts: RoofPart[], floorH: number): { partId: string; roofY: number; box: SkinBox }[] {
  const out: { partId: string; roofY: number; box: SkinBox }[] = []
  const b = (r: PlanRect) => ({
    x0: r.x - r.width / 2,
    x1: r.x + r.width / 2,
    z0: r.z - r.depth / 2,
    z1: r.z + r.depth / 2,
  })
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const A = parts[i]
      const B = parts[j]
      if (A.level !== B.level || A.kind === 'flat' || B.kind === 'flat') continue
      const roofY = (A.level + 1) * floorH
      for (const ra of partRects(A)) {
        for (const rb of partRects(B)) {
          const p = b(ra)
          const q = b(rb)
          const xOver = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0)
          const zOver = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0)
          // Спільна лінія: по одній осі дотик, по другій — перекриття.
          let line: number
          let horizontal: boolean
          let sideA: SideKey
          let sideB: SideKey
          if (zOver > 0.5 && Math.abs(q.x0 - p.x1) < 0.01) {
            line = p.x1
            horizontal = false
            sideA = 'xmax'
            sideB = 'xmin'
          } else if (zOver > 0.5 && Math.abs(p.x0 - q.x1) < 0.01) {
            line = p.x0
            horizontal = false
            sideA = 'xmin'
            sideB = 'xmax'
          } else if (xOver > 0.5 && Math.abs(q.z0 - p.z1) < 0.01) {
            line = p.z1
            horizontal = true
            sideA = 'zmax'
            sideB = 'zmin'
          } else if (xOver > 0.5 && Math.abs(p.z0 - q.z1) < 0.01) {
            line = p.z0
            horizontal = true
            sideA = 'zmin'
            sideB = 'zmax'
          } else continue
          if (!isEaveSide(A, ra, sideA) || !isEaveSide(B, rb, sideB)) continue
          // Довжина жолоба — спільна ділянка граней.
          const lo = horizontal ? Math.max(p.x0, q.x0) : Math.max(p.z0, q.z0)
          const hi = horizontal ? Math.min(p.x1, q.x1) : Math.min(p.z1, q.z1)
          if (hi - lo < 0.5) continue
          const mid = (lo + hi) / 2
          out.push({
            partId: A.id,
            roofY,
            box: {
              x: horizontal ? mid : line,
              // Обидва карнизи на одній відмітці — жолоб лягає рівно на неї.
              y: roofY + ROOF_LIFT + VALLEY_UP,
              z: horizontal ? line : mid,
              dx: horizontal ? hi - lo : VALLEY_W,
              dy: 0.03,
              dz: horizontal ? VALLEY_W : hi - lo,
              rotY: 0,
              tilt: 0,
            },
          })
        }
      }
    }
  }
  return out
}

// Кожух парапету: П-подібна накривка поверх стінки, зі звисом на обидва боки.
// Робимо трьома брусками — верхня полиця й дві крапельниці, — щоб вона була
// саме об'ємною, а не пофарбованою гранню.
function capBoxes(part: RoofPart, above: PlanRect[], roofY: number, out: SkinBox[]) {
  const edges = parapetEdges(part, above)
  for (const e of edges) {
    const t = part.parapetT
    // Та сама вісь, що й у геометрії парапету: зовнішня грань — грань стіни.
    const line = e.line + (e.nx + e.nz) * (WALL_T / 2 - t / 2)
    const y = roofY + part.parapetH
    const w = t + 2 * CAP_OUT
    // Повний габарит кожуха поперек: полиця плюс крапельниці по краях.
    const half = w / 2 + 0.01
    for (const [ra, rb] of e.spans) {
      // РІГ. Кожна деталь стикується по-своєму, і всі три — на одному правилі:
      // полиця й ЗОВНІШНЯ крапельниця горизонтального кожуха перекривають
      // квадрат перетину, вертикальний до них відступає; ВНУТРІШНЯ крапельниця
      // навпаки — там ріг увігнутий, тож перекриває вертикальна. Робити всі три
      // за міркою полиці не можна: зовнішня крапельниця сусіда лишалась на
      // 10 мм назовні («не з'єднується»), а внутрішня йшла квадратом наскрізь і
      // впивалась у парапет.
      //
      // Кінець, що впирається в стіну поверху ВИЩЕ (`cornerStop` бачить, що
      // поперечного парапету там немає): `parapetEdges` спиняє смугу на голій
      // грані тієї стіни, але на ній ще стоїть оздоблення — і кожух заходив
      // просто в нього. Відступаємо по найтовщому матеріалу.
      const shelfEnds: [number, number] = [
        Math.abs(ra - e.min) < 1e-4 ? cornerStop(edges, e, ra, t, half, CLAD_MAX_OUT) : ra + CLAD_MAX_OUT,
        Math.abs(rb - e.max) < 1e-4 ? cornerStop(edges, e, rb, t, half, CLAD_MAX_OUT) : rb - CLAD_MAX_OUT,
      ]
      // Крапельниця йде по ПЕРИМЕТРУ, тож на розі вона тягнеться до
      // однойменної крапельниці сусіда — а та лежить із боку його зовнішньої
      // нормалі (`np`), і це НЕ завжди той бік, з якого прийшла грань. Саме
      // тому міряти її кінець полицею не можна.
      const dripEnd = (u: number, end: number, d: -1 | 1, outer: boolean) => {
        if (Math.abs(u - end) > 1e-4) return u + d * CLAD_MAX_OUT
        const k = parapetCorner(edges, e, u, t)
        if (!k) return u - (d === 1 ? -1 : 1) * (WALL_T / 2 + CLAD_MAX_OUT)
        // Горизонтальна доходить до ДАЛЬНЬОЇ грані сусідньої крапельниці,
        // вертикальна — до ближньої: стик рівно встик, без напуску.
        return k.c + (outer ? 1 : -1) * k.np * (e.horizontal ? half : half - DRIP_T)
      }
      const box = (c: number, yy: number, thick: number, hh: number, [a, b]: [number, number]) => {
        const len = b - a
        if (len < 0.05) return
        const mid = (a + b) / 2
        out.push(
          e.horizontal
            ? { x: mid, y: yy, z: c, dx: len, dy: hh, dz: thick, rotY: 0, tilt: 0 }
            : { x: c, y: yy, z: mid, dx: thick, dy: hh, dz: len, rotY: 0, tilt: 0 },
        )
      }
      // Полиця зверху…
      box(line, y + 0.012, w, 0.024, shelfEnds)
      // …і дві крапельниці по краях.
      const outward = e.horizontal ? e.nz : e.nx
      for (const s of [-1, 1] as const) {
        const outer = s === outward
        box(line + (s * w) / 2, y - CAP_H / 2 + 0.012, DRIP_T, CAP_H, [
          dripEnd(ra, e.min, 1, outer),
          dripEnd(rb, e.max, -1, outer),
        ])
      }
    }
  }
}
