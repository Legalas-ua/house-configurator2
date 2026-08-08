import type { HousePlan, PlanRect, RoofMatKind, RoofMatSpec } from '../config/types'
import { cornerStop, parapetCorner, parapetEdges, partRects, slopeBox, zoneRise, ROOF_LIFT, type RoofPart } from './roof'
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
    out.push({
      x: sl.cx + u * rc + lz * rs,
      y: sl.cy + ly,
      z: sl.cz - u * rs + lz * rc,
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

// Схили однієї зони. Мають ТОЧНО збігатися з геометрією HouseShell — інакше
// покриття «злітає» з даху.
function slopesOf(part: RoofPart, above: PlanRect[], roofY: number): Slope[] {
  // Складена зона — просто сума схилів своїх частин.
  const rects = partRects(part)
  if (rects.length > 1) return rects.flatMap((r) => slopesOfRect(part, above, roofY, r))
  return slopesOfRect(part, above, roofY, rects[0])
}

function slopesOfRect(part: RoofPart, above: PlanRect[], roofY: number, rect: PlanRect): Slope[] {
  // Плоский дах — рулон РІВНО по зоні: звісу в нього не буває, а `slopeBox`
  // додав би його й килим виліз би за парапет.
  if (part.kind === 'flat')
    return [{ cx: rect.x, cy: roofY, cz: rect.z, rotY: 0, tilt: 0, width: rect.width, len: rect.depth }]

  const zone = zoneRise(part, above)
  const g = slopeBox(part, above, rect)
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
  const rise = zone || half * tan
  // Зі звісом дах — суцільна призма без окремої плити, тож і покриття лягає
  // рівно на схил. Без звісу зверху додано плиту, і покриття піднімається.
  const tv = part.overhang > 0 ? 0 : (ROOF_T * Math.hypot(run, rise)) / run
  const len = Math.hypot(half, rise)
  const c = Math.cos(meshRotY)
  const sn = Math.sin(meshRotY)
  return ([-1, 1] as const).map((dir) => ({
    cx: cx + dir * (half / 2) * c,
    cy: roofY + ROOF_LIFT + rise / 2 + tv,
    cz: cz - dir * (half / 2) * sn,
    rotY,
    // Схил падає ВІД гребеня, тож на половинах нахил дзеркальний.
    tilt: dir > 0 ? -ang : ang,
    width: across,
    len,
    // Кожух ставлять ОБИДВІ половини — вони перекриваються над гребенем
    // і закривають шов.
    cap: across,
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

  // КАРНИЗ. Торець плити тут вертикальний, тож і дошка вертикальна — при
  // будь-якому куті вона закриває всю товщину пирога.
  const eaveS = low * (hl + w / 2 - lap)
  for (const [a, b] of freeRuns(-hw - w, hw + w, (u) => at(u, eaveS))) {
    put((a + b) / 2, eaveS, b - a, w)
  }

  // СКАТНІ КРАЇ. Тут навпаки: торець плити йде ПАРАЛЕЛЬНО схилу, тож дошка
  // теж нахилена — одним суцільним бруском. Набирати її вертикальними
  // відрізками не можна: край перетворювався на сходинки.
  if (sl.noRake) return
  const hRake = plateT + cover + 0.02
  const nRake = cover + 0.004 - hRake / 2
  // Дошка доходить рівно ДО ГРЕБЕНЯ і не далі. Раніше вона заходила за нього
  // на висоту пирога — але за гребенем площина цього схилу йде ВГОРУ над
  // сусіднім, тож обидві дошки вилітали в повітря й перехрещувались (той самий
  // «хрест» на зламі). Кут між ними накриває кожух гребеня, розширений на
  // товщину самих дощок.
  const ridgeDir = sl.tilt > 0 ? 1 : -1
  for (const side of [-1, 1] as const) {
    const u = side * (hw + w / 2 - lap)
    const s0 = ridgeDir > 0 ? -hl - w : -hl
    const s1 = ridgeDir > 0 ? hl : hl + w
    for (const [a, b] of freeRuns(s0, s1, (s) => at(u, s))) {
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
  out.push({
    x: sl.cx + lz * rs,
    y: sl.cy + ly,
    z: sl.cz + lz * rc,
    dx: sl.cap + overRake,
    dy: 0.028,
    dz: CAP_D,
    rotY: sl.rotY,
    tilt: sl.tilt,
  })
}

// Кожух на ВАЛЬМІ — по діагональному ребру між сусідніми схилами. Ребро йде
// під кутом і в плані, і по висоті, тож поворот беремо з самого відрізка.
function hipCap(
  a: [number, number, number],
  b: [number, number, number],
  lift: number,
  out: SkinBox[],
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
    dx: 0.16,
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
    const blockers: Blocker[] = [
      ...above,
      ...parts.filter((o) => o.level === part.level && o.id !== part.id).flatMap(partRects),
    ].map((r) => ({
      x0: r.x - r.width / 2 - out,
      x1: r.x + r.width / 2 + out,
      z0: r.z - r.depth / 2 - out,
      z1: r.z + r.depth / 2 + out,
    }))
    const atWall = (x: number, z: number) =>
      blockers.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)

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
        g.top = Math.max(g.top, roofY + FLAT_T + 0.05)
        continue
      }
      layElements(sl, spec.kind, g.boxes, MAX_ELEMENTS)
      fasciaOf(sl, spec.kind, gt.boxes, ROOF_T, blockers)
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
    if (part.kind === 'hip' && partRects(part).length === 1) {
      const gb = slopeBox(part, above)
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
  return [...groups.values()].filter((g) => g.boxes.length > 0)
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
