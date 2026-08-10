import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { easing } from 'maath'
import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Path,
  Raycaster,
  Shape,
  Vector2,
  type Camera,
  type Group,
  type Material,
  type Mesh,
} from 'three'
import { useConfigurator, useHousePlan, useRoof, useWindows } from '../state/store'
import { STEPS, type StepId } from '../config/steps'
import { ringContains, unionOutline, type Point, type Ring } from '../lib/outline'
import {
  bounds,
  fitToWall,
  resolveWindows,
  openSides,
  type DoorSpec,
  updateWindow,
  wallOf,
  hasWallAt,
  wallRange,
  freeSlots,
  panelCount,
  WALL_T,
  type Rect,
  type ResolvedWindow,
  type Side,
} from '../lib/windows'
import { cornerStop, parapetEdges, partRects, slopeBox, zoneRise, ROOF_LIFT } from '../lib/roof'
import { roofSkin } from '../lib/roofSkin'
import { terraceSkin, terraceSurfaces, TERRACE_UP_STACK } from '../lib/terraceSkin'
import { interiorSkin, interiorSurfaces } from '../lib/interiorSkin'
import { innerWalls, resolveDoors } from '../lib/innerWalls'
import InnerDoorEditor from './InnerDoorEditor'
import { wallFaces, type WallFace } from '../lib/wallFaces'
import { claddingBoxes, cladOuter, type CladBox, type CladResult, type HeightAt } from '../lib/cladding'
import { gablePanels, parapetPanels } from '../lib/gableFaces'
import { useFacadeMaterial } from './facadeMaterial'
import Cladding, { Backing, type CladGroup } from './Cladding'
import RoofSkin, { SkinTier } from './RoofSkin'
import FacadeWalls from './FacadeWalls'
import { FOUNDATION_H } from '../config/plan'
import { t } from '../locales'
import type { FloorPlan, HousePlan, PlanRect } from '../config/types'

const HANDLE_COLOR = '#d9622b' // теракота — як і ручки зон на плані

// ============================================================
// 3D-оболонка будинку (Фази A+B). Показуємо ЛИШЕ на кроці «Вікна». Уся коробка
// плавно виростає з землі і плавно зникає (scale.y + керована видимість).
//
// Вікна/двері ВМОНТОВАНІ в стіну (простінок + перемичка + анімований простінок під
// підвіконням). Всередині — перегородки з коричневими дверима. Тераса — відкрита,
// зі скляним парканом + поручнем; стіна до тераси — панорамні двері в підлогу.
// ============================================================

const CEIL_H = 3.0 // чиста висота стелі на поверсі
const PLATE_T = 0.2
const FLOOR_H = CEIL_H + PLATE_T // крок поверху (стеля + перекриття)
// Рівно 100 мм — як і перегородки. Раніше було 180, і вікно на стіні жило на
// сітці, зсунутій на 10 мм: усі межі й напрямні падали «між клітинками».
// Тримати ЄДИНЕ значення з lib/windows.ts обов'язково.
// WALL_T приходить з lib/windows.ts — там же живе сітка руху вікна.
// ---- Яруси: як прибрані шви на стиках ----
// Шов на стику двох коробок буває з двох причин, і лікуються вони протилежно:
//   1) коробки стикаються впритул -> похибка float лишає щілину в піксель;
//   2) коробки перекриваються, а їхні бічні грані лежать в ОДНІЙ площині ->
//      відеокарта не може вирішити, яка ближче, і воно мерехтить під кутом.
// Тому робимо і те, і те: кожен наступний ярус (поверх, далі парапет) заходить
// у попередній знизу на TIER_LAP і водночас на TIER_STEP тонший, тож його грані
// ховаються ВСЕРЕДИНІ нижнього ярусу й ніде не збігаються. 2 мм на масштабі
// будинку не видно.
const TIER_STEP = 0.002
const TIER_LAP = 0.02
const wallT = (tier: number) => WALL_T - TIER_STEP * tier
const postT = (tier: number) => wallT(tier) + 0.004 // стовп товщий за свій простінок
const WALL_H = CEIL_H // стіна = висота стелі; зверху лягає перекриття (без колізій)
const WALL_COLOR = '#ece7de'
const BASE_COLOR = '#2e3234' // антрацит: основа під оздобленням = темний шов
const PLATE_COLOR = '#d9d3c6'
const FOUND_COLOR = '#bdb6a7' // цоколь темніший за плиту — читається як окремий об'єм
const FOUND_OUT = WALL_T / 2 + 0.04 // виступ цоколя за зовнішню грань стіни
const RISE_EASE = 0.5
const ROOF_EASE = 0.42 // дах виростає трохи жвавіше за коробку
const ROOF_T = 0.22 // товщина похилої плити односхилого даху
const ROOF_COLOR = WALL_COLOR // ТИМЧАСОВО в колір стін — покриття ще не обране

// ---- Вікна (розміри й правила — у lib/windows.ts) ----
const FRAME_W = 0.06
const FRAME_D = 0.1 // рама сидить у товщі стіни → вмонтована
const GLASS_D = 0.03
const FRAME_COLOR = '#6b7075'
const GLASS_COLOR = '#a9c6d6'
const GLASS_OPACITY = 0.32
const SWITCH_EASE = 0.4
const DOOR_TRANSOM_Y = 2.2 // фрамуга над дверима — на 2200 від підлоги
const DOOR_JAMB = 0.07 // коробка дверей: трохи товща за раму вікна
const DOOR_LEAF_D = 0.05 // товщина полотна
const DOOR_GAP = 0.01 // зазор під полотном
const DOOR_FRAME_COLOR = '#23262a' // чорна обкантовка скляних дверей
const NARROW_WIN = 1.2 // вужче за це — двері на всю ширину вікна

// ---- Перегородки та внутрішні двері ----
const PART_T = 0.1
const IDOOR_W = 0.9
const IDOOR_H = 2.1
const IDOOR_D = 0.05
const DOOR_COLOR = '#8a5a3b' // коричневі двері

// ---- Тераса ----
const FENCE_H = 1.1
const FENCE_D = 0.04
const RAIL_H = 0.06
const RAIL_W = 0.08

// Контур СТІН: та сама плита, але з вирізаною терасою — вона відкрита, її не
// обносять стінами й не накривають дахом.
const wallOutline = (fl: FloorPlan): Ring[] =>
  unionOutline(
    fl.slab,
    fl.rooms.filter((r) => r.type === 'terrace'),
  )

interface Edge {
  horizontal: boolean
  line: number
  min: number
  max: number
}
function edgesOf(rings: Ring[]): Edge[] {
  const es: Edge[] = []
  for (const { pts } of rings) {
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i]
      const [x1, z1] = pts[(i + 1) % pts.length]
      if (Math.abs(z1 - z0) < 1e-4) es.push({ horizontal: true, line: z0, min: Math.min(x0, x1), max: Math.max(x0, x1) })
      else es.push({ horizontal: false, line: x0, min: Math.min(z0, z1), max: Math.max(z0, z1) })
    }
  }
  return es
}

// Смуга, яку займають зовнішні стіни. Віднімаємо її від плити, щоб плита
// закінчувалась по ВНУТРІШНІЙ грані стіни, а не доходила до її осі — інакше
// торець плити сидить усередині стіни. Кінці подовжені на пів товщини, щоб
// смуги перекрились на кутах.
function wallBand(rings: Ring[]): PlanRect[] {
  const out: PlanRect[] = []
  for (const e of edgesOf(rings)) {
    const a = e.min - WALL_T / 2
    const b = e.max + WALL_T / 2
    const mid = (a + b) / 2
    out.push(
      e.horizontal
        ? { x: mid, z: e.line, width: b - a, depth: WALL_T }
        : { x: e.line, z: mid, width: WALL_T, depth: b - a },
    )
  }
  return out
}

interface Box {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  // Орієнтація стіни: true — тягнеться вздовж X. Ставиться ЯВНО, бо вгадувати
  // її за пропорціями коробки не можна: короткий простінок буває вужчим за
  // власну товщину, і здогадка перевертала вісь.
  h?: boolean
}

// Вирізати отвори з набору коробок стіни.
//
// Раніше на це працювала лише розкладка простінків по ребрах контуру — і
// щоразу, коли вікно з якоїсь причини не збігалося з ребром, воно лишалось у
// СУЦІЛЬНІЙ стіні. Це страховка, яка від збігів не залежить: беремо кожну
// коробку й фізично віднімаємо від неї прямокутник отвору. Орієнтацію коробки
// визначаємо за її ж пропорціями — тонка вісь і є нормаль стіни.
function cutOpenings(boxes: Box[], ops: Opening[]): Box[] {
  const out: Box[] = []
  for (const start of boxes) {
    let pieces = [start]
    for (const o of ops) {
      const next: Box[] = []
      for (const p of pieces) {
        // Кутовий стовп орієнтації не має (h === undefined) — його не ріжемо:
        // він на самому розі, отворів там не буває.
        if (p.h === undefined || p.h !== o.horizontal) {
          next.push(p)
          continue
        }
        const horizontal = p.h
        const thick = horizontal ? p.dz : p.dx
        const line = horizontal ? p.z : p.x
        if (Math.abs(line - o.line) > thick / 2 + 0.03) {
          next.push(p)
          continue
        }
        const uc = horizontal ? p.x : p.z
        const ulen = horizontal ? p.dx : p.dz
        const u0 = uc - ulen / 2
        const u1 = uc + ulen / 2
        const v0 = p.y - p.dy / 2
        const v1 = p.y + p.dy / 2
        const top = o.baseY + o.top
        if (o.b <= u0 + 0.002 || o.a >= u1 - 0.002 || top <= v0 + 0.002) {
          next.push(p)
          continue
        }
        const mk = (a: number, b: number, c: number, d: number) => {
          if (b - a < 0.004 || d - c < 0.004) return
          next.push(
            horizontal
              ? { x: (a + b) / 2, y: (c + d) / 2, z: p.z, dx: b - a, dy: d - c, dz: p.dz, h: true }
              : { x: p.x, y: (c + d) / 2, z: (a + b) / 2, dx: p.dx, dy: d - c, dz: b - a, h: false },
          )
        }
        mk(u0, Math.min(o.a, u1), v0, v1) // ліворуч від отвору
        mk(Math.max(o.b, u0), u1, v0, v1) // праворуч
        mk(Math.max(u0, o.a), Math.min(u1, o.b), top, v1) // перемичка над
      }
      pieces = next
    }
    out.push(...pieces)
  }
  return out
}
// Плаский помічник: додати коробку стіни/перегородки вздовж осі (horizontal → по X).
function pushBox(out: Box[], horizontal: boolean, line: number, u0: number, u1: number, v0: number, v1: number, baseY: number, thick: number) {
  const ulen = u1 - u0
  const vlen = v1 - v0
  if (ulen <= 0.001 || vlen <= 0.001) return
  const uc = (u0 + u1) / 2
  const vc = baseY + (v0 + v1) / 2
  if (horizontal) out.push({ x: uc, y: vc, z: line, dx: ulen, dy: vlen, dz: thick, h: true })
  else out.push({ x: line, y: vc, z: uc, dx: thick, dy: vlen, dz: ulen, h: false })
}

// Отвір = розв'язана специфікація вікна (lib/windows.ts). key лишаємо як
// синонім id, щоб не переписувати всі місця, де він уже вживається.
type Opening = ResolvedWindow & { key: string }

// Плита перекриття по кільцях контуру. Зовнішні кільця — окремі фігури,
// внутрішні (вирізи) та проріз під сходи кладемо в те кільце, що їх містить.
function plateGeometry(rings: Ring[], hole: Rect | null, depth = PLATE_T): ExtrudeGeometry {
  const path = (pts: Point[]) => {
    const p = new Path()
    pts.forEach(([x, z], i) => (i === 0 ? p.moveTo(x, -z) : p.lineTo(x, -z)))
    p.closePath()
    return p
  }
  const outers = rings.filter((r) => !r.hole)
  const shapes = outers.map((r) => {
    const s = new Shape()
    r.pts.forEach(([x, z], i) => (i === 0 ? s.moveTo(x, -z) : s.lineTo(x, -z)))
    s.closePath()
    return s
  })
  // Кільце-виріз віддаємо тому зовнішньому контуру, всередині якого воно лежить.
  const owner = (p: Point) => outers.findIndex((o) => ringContains(o.pts, p))
  for (const r of rings) {
    if (!r.hole) continue
    const i = owner(r.pts[0])
    if (i >= 0) shapes[i].holes.push(path(r.pts))
  }
  if (hole) {
    const center: Point = [(hole.x0 + hole.x1) / 2, (hole.z0 + hole.z1) / 2]
    const i = Math.max(0, owner(center))
    if (shapes[i]) {
      shapes[i].holes.push(
        path([
          [hole.x0, hole.z0],
          [hole.x1, hole.z0],
          [hole.x1, hole.z1],
          [hole.x0, hole.z1],
        ]),
      )
    }
  }
  const geo = new ExtrudeGeometry(shapes, { depth, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

// Двосхилий дах (скандинавський, БЕЗ звісів): профіль «будиночком» по X,
// витягнутий по Z → гребінь уздовж Z. Габарит = контур стін.
// skirt — пряма спідниця під схилами. Без неї схил сходить у нуль рівно на
// верху стіни, і дах виглядає втопленим у неї; спідниця дає краю товщину й
// піднімає початок схилу над стіною.
function gableGeometry(width: number, depth: number, height: number, skirt: number): ExtrudeGeometry {
  const s = new Shape()
  s.moveTo(-width / 2, -skirt)
  s.lineTo(width / 2, -skirt)
  s.lineTo(width / 2, 0)
  s.lineTo(0, height)
  s.lineTo(-width / 2, 0)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

// Покрівельні плити двосхилого даху — те саме, що плита в односхилого, тільки
// їх дві й вони сходяться на гребені. Тіло під ними лишається СТІНОЮ (фронтон),
// тож оздоблення фасаду продовжується вгору, як і в односхилого.
function gablePlateGeometry(width: number, depth: number, height: number, tv: number): ExtrudeGeometry {
  const s = new Shape()
  s.moveTo(-width / 2, 0)
  s.lineTo(0, height)
  s.lineTo(width / 2, 0)
  s.lineTo(width / 2, tv)
  s.lineTo(0, height + tv)
  s.lineTo(-width / 2, tv)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

// Вальмовий дах: схили з чотирьох боків, гребінь уздовж ДОВШОЇ сторони.
// Профілем його не витягнеш (розріз різний уздовж будинку), тож збираємо
// многогранник вручну. Обхід вершин навмисно не вивіряємо на око — нормаль
// кожного трикутника розвертаємо назовні від центра тіла.
function hipGeometry(width: number, depth: number, pitch: number, skirt: number): BufferGeometry {
  const hw = width / 2
  const hd = depth / 2
  const short = Math.min(width, depth)
  const h = (short / 2) * Math.tan((pitch * Math.PI) / 180)
  const along = width >= depth
  // Гребінь: відступ від коротких країв на пів короткої сторони.
  const r1: [number, number, number] = along ? [-hw + short / 2, h, 0] : [0, h, -hd + short / 2]
  const r2: [number, number, number] = along ? [hw - short / 2, h, 0] : [0, h, hd - short / 2]

  const A: [number, number, number] = [-hw, 0, -hd]
  const B: [number, number, number] = [hw, 0, -hd]
  const C: [number, number, number] = [hw, 0, hd]
  const D: [number, number, number] = [-hw, 0, hd]
  const A2: [number, number, number] = [-hw, -skirt, -hd]
  const B2: [number, number, number] = [hw, -skirt, -hd]
  const C2: [number, number, number] = [hw, -skirt, hd]
  const D2: [number, number, number] = [-hw, -skirt, hd]

  const pos: number[] = []
  const centre: [number, number, number] = [0, (h - skirt) / 2, 0]
  const tri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0]
    const uy = b[1] - a[1]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vy = c[1] - a[1]
    const vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const out = nx * (a[0] - centre[0]) + ny * (a[1] - centre[1]) + nz * (a[2] - centre[2])
    const [p, q] = out >= 0 ? [b, c] : [c, b]
    pos.push(a[0], a[1], a[2], p[0], p[1], p[2], q[0], q[1], q[2])
  }
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    tri(a, b, c)
    tri(a, c, d)
  }

  // Спідниця й низ.
  quad(A, B, B2, A2)
  quad(B, C, C2, B2)
  quad(C, D, D2, C2)
  quad(D, A, A2, D2)
  quad(A2, B2, C2, D2)
  // Схили: два довгі — трапеції, два короткі — трикутники.
  if (along) {
    quad(A, B, r2, r1)
    quad(C, D, r1, r2)
    tri(D, A, r1)
    tri(B, C, r2)
  } else {
    quad(B, C, r2, r1)
    quad(D, A, r1, r2)
    tri(A, B, r1)
    tri(C, D, r2)
  }

  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return g
}

// Односхилий дах — НЕ трикутник у розрізі: це похила плита завтовшки ROOF_T,
// а під нею стіни доростають до неї (клин у кольорі стіни). fill=true віддає
// цей клин, fill=false — саму плиту.
// Односхилий: клин від висоти h0 (лівий край) до h1 (правий).
//
// Два числа, а не одне, — щоб СКЛАДЕНА зона лишалась ОДНИМ дахом. Кожна її
// частина відрізає свій шматок від СПІЛЬНОЇ площини, і сусідні шматки
// сходяться рівно там, де стикаються прямокутники. Коли частина одна,
// h0 = 0 і виходить рівно те, що було.
function monoGeometry(
  width: number,
  depth: number,
  h0: number,
  h1: number,
  skirt: number,
  fill: boolean,
): ExtrudeGeometry {
  const s = new Shape()
  // Вертикальна товщина плити більша за ROOF_T рівно настільки, наскільки
  // вона нахилена, — тоді ПЕРПЕНДИКУЛЯРНА товщина виходить рівно ROOF_T.
  const tv = (ROOF_T * Math.hypot(width, h1 - h0)) / Math.max(width, 1e-6)
  if (fill) {
    s.moveTo(-width / 2, -skirt)
    s.lineTo(width / 2, -skirt)
    s.lineTo(width / 2, h1)
    s.lineTo(-width / 2, h0)
  } else {
    s.moveTo(-width / 2, h0)
    s.lineTo(width / 2, h1)
    s.lineTo(width / 2, h1 + tv)
    s.lineTo(-width / 2, h0 + tv)
  }
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

const frameMat = { color: FRAME_COLOR, metalness: 0.85, roughness: 0.35 }
const doorFrameMat = { color: DOOR_FRAME_COLOR, metalness: 0.6, roughness: 0.4 }

// Деталізоване вікно, вмонтоване в отвір. Верх нерухомий, низ анімується (зміна
// типу). Двері отримують горизонтальну фрамугу + вертикальні імпости.
function Win({
  rotY,
  x,
  z,
  baseY,
  width,
  sill,
  top,
  mullions,
  doors,
}: {
  rotY: number
  x: number
  z: number
  baseY: number
  width: number
  sill: number
  top: number
  mullions: number // -1 = автоматично за шириною
  doors: DoorSpec[]
}) {
  const gW = Math.max(width - 2 * FRAME_W, 0.05)
  // Вікно ділиться імпостами на рівні секції. Кожні двері займають одну
  // секцію (slot) і мають власну ширину; решта секцій ділять залишок порівну.
  // Так двері «переїжджають» між імпостами, не ламаючи сітку.
  const { mullX, doorSpans } = useMemo(() => {
    // У ВУЗЬКОМУ вікні двері займають увесь отвір: лишати поруч смужку скла в
    // кілька сантиметрів немає сенсу — це вже не вікно, а щілина.
    const fullWidth = doors.length === 1 && width <= NARROW_WIN
    let panels = panelCount(mullions, width)
    if (fullWidth) panels = 1
    // Якщо двері вужчі за вікно, секцій має бути БІЛЬШЕ, ніж дверей, — інакше
    // біля краю дверей не буде імпоста (вікно 1.3 м з дверима саме так і
    // виглядало: двері впритул до рами, без вертикальної стійки).
    else if (doors.length > 0) panels = Math.max(panels, doors.length + 1)

    const used = new Map<number, number>()
    for (const d of doors) {
      const slot = Math.max(0, Math.min(d.slot, panels - 1))
      if (!used.has(slot)) used.set(slot, fullWidth ? width : Math.min(d.width, width))
    }
    const doorTotal = [...used.values()].reduce((s, v) => s + v, 0)
    const others = panels - used.size
    const otherW = others > 0 ? Math.max((width - doorTotal) / others, 0.05) : 0

    const xs: number[] = []
    const spans: { a: number; b: number }[] = []
    let cursor = -width / 2
    for (let i = 0; i < panels; i++) {
      const w = used.has(i) ? used.get(i)! : otherW
      if (used.has(i)) spans.push({ a: cursor, b: cursor + w })
      cursor += w
      if (i < panels - 1) xs.push(cursor)
    }
    return { mullX: xs, doorSpans: spans }
  }, [width, mullions, doors])

  const s = useRef(sill)
  const stretch = useRef<Group>(null)
  const bottom = useRef<Mesh>(null)
  useFrame((_, dt) => {
    easing.damp(s, 'current', sill, SWITCH_EASE, dt)
    const cs = s.current
    if (bottom.current) bottom.current.position.y = cs + FRAME_W / 2
    if (stretch.current) {
      stretch.current.position.y = (cs + top) / 2
      stretch.current.scale.y = Math.max(top - cs, 0.01)
    }
  })
  return (
    <group rotation-y={rotY} position={[x, baseY, z]}>
      <mesh position={[0, top - FRAME_W / 2, 0]}>
        <boxGeometry args={[width, FRAME_W, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      <mesh ref={bottom} position={[0, sill + FRAME_W / 2, 0]}>
        <boxGeometry args={[width, FRAME_W, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>

      {/* Двері — СКЛЯНІ у чорній рамі: фрамуга над секцією, обкантовка по
          периметру стулки, скло всередині та ручка. */}
      {doorSpans.map((d, i) => {
        const w = d.b - d.a
        const c = (d.a + d.b) / 2
        const leafH = DOOR_TRANSOM_Y - DOOR_GAP
        return (
          <group key={`door-${i}`}>
            <mesh position={[c, DOOR_TRANSOM_Y, 0]}>
              <boxGeometry args={[w, FRAME_W, FRAME_D]} />
              <meshStandardMaterial {...frameMat} />
            </mesh>
            {/* Обкантовка стулки: боковини + низ + верх, чорні */}
            {[d.a + DOOR_JAMB / 2, d.b - DOOR_JAMB / 2].map((jx, k) => (
              <mesh key={k} position={[jx, DOOR_TRANSOM_Y / 2, 0]}>
                <boxGeometry args={[DOOR_JAMB, DOOR_TRANSOM_Y, FRAME_D * 1.15]} />
                <meshStandardMaterial {...doorFrameMat} />
              </mesh>
            ))}
            <mesh position={[c, DOOR_GAP + DOOR_JAMB / 2, 0]}>
              <boxGeometry args={[w, DOOR_JAMB, FRAME_D * 1.15]} />
              <meshStandardMaterial {...doorFrameMat} />
            </mesh>
            <mesh position={[c, leafH - DOOR_JAMB / 2, 0]}>
              <boxGeometry args={[w, DOOR_JAMB, FRAME_D * 1.15]} />
              <meshStandardMaterial {...doorFrameMat} />
            </mesh>
            {/* Скло стулки */}
            <mesh position={[c, DOOR_GAP + leafH / 2, -0.005]}>
              <boxGeometry
                args={[Math.max(w - 2 * DOOR_JAMB, 0.05), Math.max(leafH - 2 * DOOR_JAMB, 0.05), GLASS_D]}
              />
              <meshStandardMaterial
                color={GLASS_COLOR}
                metalness={0}
                roughness={0.05}
                transparent
                opacity={GLASS_OPACITY}
                depthWrite={false}
              />
            </mesh>
            {/* Ручка */}
            <mesh position={[d.b - DOOR_JAMB - 0.12, 1.05, DOOR_LEAF_D]}>
              <boxGeometry args={[0.14, 0.03, 0.05]} />
              <meshStandardMaterial {...doorFrameMat} />
            </mesh>
          </group>
        )
      })}

      <group ref={stretch}>
        <mesh position={[-width / 2 + FRAME_W / 2, 0, 0]}>
          <boxGeometry args={[FRAME_W, 1, FRAME_D]} />
          <meshStandardMaterial {...frameMat} />
        </mesh>
        <mesh position={[width / 2 - FRAME_W / 2, 0, 0]}>
          <boxGeometry args={[FRAME_W, 1, FRAME_D]} />
          <meshStandardMaterial {...frameMat} />
        </mesh>
        {mullX.map((mx, i) => (
          <mesh key={i} position={[mx, 0, 0]}>
            <boxGeometry args={[FRAME_W * 0.8, 1, FRAME_D * 0.9]} />
            <meshStandardMaterial {...frameMat} />
          </mesh>
        ))}
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[gW, 1, GLASS_D]} />
          <meshStandardMaterial color={GLASS_COLOR} metalness={0} roughness={0.05} transparent opacity={GLASS_OPACITY} />
        </mesh>
      </group>
    </group>
  )
}

// Простінок ПІД підвіконням: анімується разом із вікном при зміні типу (щоб низ
// отвору не колізив зі стіною). Порожній при sill=0 (двері/панорама в підлогу).
function Spandrel({
  horizontal,
  line,
  a,
  b,
  baseY,
  sill,
  material,
}: {
  horizontal: boolean
  line: number
  a: number
  b: number
  baseY: number
  sill: number
  material: Material
}) {
  const ref = useRef<Mesh>(null)
  const s = useRef(sill)
  const uc = (a + b) / 2
  const ulen = b - a
  useFrame((_, dt) => {
    easing.damp(s, 'current', sill, SWITCH_EASE, dt)
    const cs = Math.max(s.current, 0.0001)
    if (ref.current) {
      ref.current.scale.y = cs
      ref.current.position.y = baseY + cs / 2
    }
  })
  // Товщина — рівно як у простінків свого поверху, інакше на стику з ними
  // з'явився б уступ (яруси тоншають догори).
  const t = wallT(Math.round(baseY / FLOOR_H))
  return (
    <mesh
      ref={ref}
      position={horizontal ? [uc, baseY, line] : [line, baseY, uc]}
      material={material}
      castShadow
      receiveShadow
    >
      <boxGeometry args={horizontal ? [ulen, 1, t] : [t, 1, ulen]} />
    </mesh>
  )
}

// Рівень даху: росте вгору ВІД своєї площини (origin групи на baseY, діти
// зміщені назад на -baseY). Так скат/парапет з'являється просто на перекритті,
// а не тягнеться від землі крізь увесь будинок.
function RoofTier({ baseY, open, children }: { baseY: number; open: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    easing.damp(g.scale, 'y', open ? 1 : 0.0001, ROOF_EASE, dt)
    g.visible = open || g.scale.y > 0.02
  })
  return (
    <group ref={ref} position={[0, baseY, 0]} visible={false} scale={[1, 0.0001, 1]}>
      <group position={[0, -baseY, 0]}>{children}</group>
    </group>
  )
}

// ---- Ручне редагування вікон ----
// Клікаєш по вікну — вибираєш; тягнеш його — їде ВЗДОВЖ своєї стіни (за межі
// стіни не вийде); дві теракотові ручки на краях міняють ширину. Вертикальні
// розміри, імпости й двері — у панелі: мишею по фасаду це незручно.


interface WinDrag {
  id: string
  mode: 'move' | 'uStart' | 'uEnd'
  start: number // координата захоплення вздовж стіни
  u: number
  width: number
  // Вісь стіни, по якій їде це вікно, — щоб рахувати рух без меша-«ловця».
  horizontal: boolean
  line: number
  y: number
}

// Курсор -> координата вздовж осі стіни.
//
// Раніше рух ловила горизонтальна площина-«ловець». З нею було дві біди:
//   1) вона з'являлась лише ПІСЛЯ setState, тож перші рухи миші пропадали —
//      вікно рушало не одразу;
//   2) коли камеру опустити низько, промінь іде майже паралельно горизонтальній
//      площині: перетин або втікає в нескінченність, або його немає — вікно не
//      зрушити взагалі.
// Тому площини більше немає: шукаємо найближчу точку САМОЇ осі стіни до променя
// з-під курсора. Не визначено це лише коли дивишся точно вздовж стіни — а тоді
// вікна й не видно.
const pickRay = new Raycaster()
const pickNdc = new Vector2()

function alongAxis(
  e: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: Camera,
  horizontal: boolean,
  line: number,
  y: number,
): number | null {
  const r = canvas.getBoundingClientRect()
  if (!r.width || !r.height) return null
  pickNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  pickRay.setFromCamera(pickNdc, camera)
  const o = pickRay.ray.origin
  const v = pickRay.ray.direction // одиничний
  // Вісь стіни: точка A (там, де координата вздовж = 0) і одиничний напрямок u.
  const ax = horizontal ? 0 : line
  const az = horizontal ? line : 0
  const ux = horizontal ? 1 : 0
  const uz = horizontal ? 0 : 1
  const wx = ax - o.x
  const wy = y - o.y
  const wz = az - o.z
  const b = ux * v.x + uz * v.z
  const denom = 1 - b * b
  if (Math.abs(denom) < 1e-4) return null
  const d = ux * wx + uz * wz
  const ev = v.x * wx + v.y * wy + v.z * wz
  return (b * ev - d) / denom
}

// Наскільки виносимо прозорі накладки за грань стіни. Вікно ДАЛІ за стіну —
// тоді промінь спершу зустрічає вікно, і його можна вибрати; інакше стіна
// перехоплює всі кліки на собі.
const WALL_PICK_OUT = 0.14
const WIN_PICK_OUT = 0.26
const LIMIT_COLOR = '#ffffff' // межі руху вікна
const GUIDE_COLOR = '#2f6fb8' // напрямні від сусідніх вікон

// Стіна, НАД якою стоїть фронтон чи парапет: та сама орієнтація, найбільший
// перекрив уздовж себе і найближча площина. Її оздоблення вони й успадковують.
function faceUnder(panel: WallFace, faces: WallFace[]): string | undefined {
  let best: WallFace | undefined
  let bestScore = 0
  for (const f of faces) {
    if (f.floor !== panel.floor || f.horizontal !== panel.horizontal) continue
    const gap = Math.abs(f.line - panel.line)
    if (gap > 1.5) continue
    const over = Math.min(f.b, panel.b) - Math.max(f.a, panel.a)
    if (over < 0.2) continue
    const score = over - gap
    if (score > bestScore) {
      bestScore = score
      best = f
    }
  }
  return best?.id
}

// Зовнішня нормаль сторони, помножена на відстань.
const outward = (side: Side, d: number): [number, number] => [
  side === 'xmax' ? d : side === 'xmin' ? -d : 0,
  side === 'zmax' ? d : side === 'zmin' ? -d : 0,
]

function WindowEditor({ openings, plan }: { openings: Opening[]; plan: HousePlan }) {
  const windows = useWindows()
  const setCustomWindows = useConfigurator((s) => s.setCustomWindows)
  const selected = useConfigurator((s) => s.selectedWindow)
  const setSelected = useConfigurator((s) => s.setSelectedWindow)
  const selectedWall = useConfigurator((s) => s.selectedWall)
  const setSelectedWall = useConfigurator((s) => s.setSelectedWall)
  const setDragging = useConfigurator((s) => s.setDragging)
  const setHovered = useConfigurator((s) => s.setHovered)
  const adding = useConfigurator((s) => s.addingWindow)
  const setAdding = useConfigurator((s) => s.setAddingWindow)
  const selectedDoor = useConfigurator((s) => s.selectedDoor)
  const [drag, setDrag] = useState<WinDrag | null>(null)
  const [hoverWall, setHoverWall] = useState<string | null>(null)
  const [hoverWin, setHoverWin] = useState<string | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const hitWin = useRef(false) // натиснули по вікну/стіні, а не по порожньому
  const dragRef = useRef<WinDrag | null>(null)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  // Редагуються вікна ВСІХ поверхів одразу — перемикати поверхи тут зайве.
  const mine = openings

  // Рух рахуємо в ref-і: слухач висить на window і має бачити СВІЖІ вікна, але
  // перепідписуватись на кожну зміну ширини під час тягання не мусить.
  const moveRef = useRef<(delta: number) => void>(() => {})

  // Esc знімає вибір вікна і виходить із режиму додавання.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSelected(null)
      setSelectedWall(null)
      setAdding(false)
    }
    // Скидаємо прапорець уже ПІСЛЯ того, як полотно розібралось із pointerup.
    const up = () => {
      hitWin.current = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', up)
    }
  }, [setSelected, setSelectedWall, setAdding])

  const sel = mine.find((o) => o.id === selected)
  const midY = (o: Opening) => o.baseY + (o.sill + o.top) / 2

  moveRef.current = (d: number) => {
    const dg = dragRef.current
    if (!dg) return
    const spec = windows.find((w) => w.id === dg.id)
    if (!spec) return
    const fl = plan.floors[spec.floor]
    const room = fl?.rooms.find((r) => r.id === spec.roomId)
    if (!room) return
    const wall = wallOf(room, spec.side, fl)
    const next =
      dg.mode === 'move'
        ? fitToWall(spec, wall, dg.u + d, dg.width)
        : dg.mode === 'uStart'
          ? fitToWall(spec, wall, dg.u + d, dg.width - d)
          : fitToWall(spec, wall, dg.u, dg.width + d)
    setCustomWindows(updateWindow(windows, dg.id, next))
  }

  // Слухачі вішаємо на window, а не на меш у сцені: тягнути можна навіть коли
  // курсор зійшов з вікна, і рух не губиться на першому ж кадрі.
  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const dg = dragRef.current
      if (!dg) return
      const a = alongAxis(e, gl.domElement, camera, dg.horizontal, dg.line, dg.y)
      if (a == null) return
      moveRef.current(a - dg.start)
    }
    const up = () => {
      dragRef.current = null
      setDrag(null)
      setDragging(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', up)
    }
  }, [drag, camera, gl, setDragging])

  const grab = (o: Opening, mode: WinDrag['mode'], e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hitWin.current = true
    setSelected(o.id)
    setSelectedWall(null)
    setHovered(null)
    setDragging(true)
    const y = midY(o)
    // Точку захоплення беремо ТІЄЮ САМОЮ математикою, що й наступні рухи, —
    // інакше вікно на першому ж русі стрибнуло б на різницю двох методів.
    const start = alongAxis(e.nativeEvent, gl.domElement, camera, o.horizontal, o.line, y)
    const next: WinDrag = {
      id: o.id,
      mode,
      start: start ?? (o.horizontal ? e.point.x : e.point.z),
      u: o.u,
      width: o.width,
      horizontal: o.horizontal,
      line: o.line,
      y,
    }
    dragRef.current = next
    setDrag(next)
  }

  // Стіни активного поверху, на які можна ставити вікна.
  const walls = useMemo(
    () =>
      plan.floors.flatMap((fl, i) =>
        fl.rooms
          .filter((r) => r.id && r.type !== 'terrace')
          .flatMap((room) =>
            openSides(fl, room).map((side) => ({
              key: `${i}-${room.id}-${side}`,
              floor: i,
              room,
              wall: wallOf(room, side, fl),
            })),
          ),
      ),
    [plan],
  )

  // Межі, у яких дозволено рухати ОБРАНЕ вікно, — показуємо пунктиром.
  const limits = useMemo(() => {
    if (!sel) return null
    const fl = plan.floors[sel.floor]
    const room = fl?.rooms.find((r) => r.id === sel.roomId)
    if (!room) return null
    const w = wallOf(room, sel.side, fl)
    const { from, to } = wallRange(w)
    return { horizontal: w.horizontal, line: w.line, a: w.uStart + from, b: w.uStart + to, y: sel.baseY }
  }, [sel, plan])

  // Напрямні: вікна на ТІЙ САМІЙ площині стіни, але з інших поверхів. Показуємо
  // не всі — інакше стіна вкривається частоколом ліній, — а лише ДВА найближчі
  // до вікна, яке зараз тягнемо.
  const guides = useMemo(() => {
    if (!drag || !sel) return []
    const mid = (o: Opening) => (o.a + o.b) / 2
    const c = mid(sel)
    return openings
      .filter((o) => o.id !== sel.id && o.horizontal === sel.horizontal && Math.abs(o.line - sel.line) < 0.4)
      .sort((a, b) => Math.abs(mid(a) - c) - Math.abs(mid(b) - c))
      .slice(0, 2)
      .flatMap((o) => [o.a, o.b])
  }, [drag, sel, openings])

  const panels = sel ? panelCount(sel.mullions, sel.width) : 1
  const door = sel?.doors[selectedDoor ?? 0]

  return (
    <>
      {/* Клік по порожньому місцю знімає вибір і виходить із режиму додавання.
          Поріг у 4 px — щоб обертання камери вибір не скидало. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.05, 0]}
        onPointerDown={(e) => {
          downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        }}
        onPointerUp={(e) => {
          const d = downAt.current
          downAt.current = null
          // Порядок обходу перетинів залежить від камери: під низьким кутом
          // підкладка може трапитись РАНІШЕ за вікно, і її pointerup зняв би
          // щойно зроблений вибір. Прапорець ставить саме вікно на pointerdown.
          if (hitWin.current) return
          if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 4) {
            setSelected(null)
            setSelectedWall(null)
            setAdding(false)
          }
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Заслінки по кімнатах: без них промінь пролітає крізь будинок і клік
          потрапляє на стіну з ПРОТИЛЕЖНОГО боку (суцільні стіни подій не
          ловлять, тож нічого не перекривають). */}
      {plan.floors.flatMap((fl, i) =>
        fl.rooms
          // Над терасою заслінки НЕМАЄ: вона накривала вікна, що виходять на
          // терасу, і крізь неї (та скляний паркан) вікно було не вибрати.
          .filter((r) => r.type !== 'terrace')
          .map((r) => (
            <mesh
              key={`block-${i}-${r.id}`}
              position={[r.x, i * FLOOR_H + WALL_H / 2, r.z]}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerOver={(e) => {
                e.stopPropagation()
                setHoverWall(null)
              }}
            >
              <boxGeometry args={[Math.max(r.width - 0.5, 0.1), WALL_H, Math.max(r.depth - 0.5, 0.1)]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          )),
      )}

      {/* Стіни клікабельні ЛИШЕ в режимі додавання вікна: інакше вони
          перехоплювали б кліки, якими рухають самі вікна. */}
      {adding &&
        walls.map((w) => {
        const { from, to } = wallRange(w.wall)
        const mid = w.wall.uStart + (from + to) / 2
        const active = selectedWall === w.key
        const hot = hoverWall === w.key
        // Виносимо назовні за грань стіни, щоб накладка ловила клік раніше за
        // саму стіну й не тонула в її товщі.
        const [nx, nz] = outward(w.wall.side, WALL_PICK_OUT)
        return (
          <mesh
            key={`wall-${w.key}`}
            position={[
              (w.wall.horizontal ? mid : w.wall.line) + nx,
              w.floor * FLOOR_H + WALL_H / 2,
              (w.wall.horizontal ? w.wall.line : mid) + nz,
            ]}
            rotation-y={w.wall.rotY}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoverWall(w.key)
              setHovered({
                name: t.plan.roomNames[w.room.type],
                area: Math.round((to - from) * WALL_H),
                mx: e.nativeEvent.clientX,
                my: e.nativeEvent.clientY,
              })
            }}
            onPointerMove={(e) => {
              e.stopPropagation()
              setHovered({
                name: t.plan.roomNames[w.room.type],
                area: Math.round((to - from) * WALL_H),
                mx: e.nativeEvent.clientX,
                my: e.nativeEvent.clientY,
              })
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              setHoverWall((cur) => (cur === w.key ? null : cur))
              setHovered(null)
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              hitWin.current = true
              setSelectedWall(active ? null : w.key)
              setSelected(null)
            }}
          >
            <boxGeometry args={[Math.max(to - from, 0.1), WALL_H, 0.08]} />
            <meshBasicMaterial
              color={HANDLE_COLOR}
              transparent
              opacity={active ? 0.3 : hot ? 0.16 : 0.001}
              depthWrite={false}
            />
          </mesh>
          )
        })}

      {/* Накладки поверх вікон. Виносимо їх ДАЛІ за накладки стін (WALL_PICK_OUT),
          інакше стіна завжди перехоплює клік і вікно вибрати неможливо. */}
      {mine.map((o) => {
        const [ox, oz] = outward(o.side, WIN_PICK_OUT)
        const hot = hoverWin === o.id
        return (
          <mesh
            key={`hit-${o.id}`}
            position={[o.fx + ox, midY(o), o.fz + oz]}
            rotation-y={o.rotY}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHoverWin(o.id)
              setHoverWall(null)
              setHovered(null)
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              setHoverWin((cur) => (cur === o.id ? null : cur))
            }}
            onPointerDown={(e) => grab(o, 'move', e)}
          >
            <boxGeometry args={[o.width, Math.max(o.top - o.sill, 0.1), 0.12]} />
            <meshBasicMaterial
              color={HANDLE_COLOR}
              transparent
              opacity={o.id === selected ? 0.3 : hot ? 0.16 : 0.001}
              depthWrite={false}
            />
          </mesh>
        )
      })}

      {/* Межі, у яких можна рухати обране вікно — БІЛІ, на висоту свого поверху */}
      {limits && (
        <>
          <GuideLine horizontal={limits.horizontal} line={limits.line} at={limits.a} from={limits.y} to={limits.y + WALL_H} color={LIMIT_COLOR} />
          <GuideLine horizontal={limits.horizontal} line={limits.line} at={limits.b} from={limits.y} to={limits.y + WALL_H} color={LIMIT_COLOR} />
        </>
      )}

      {sel && (
        <group rotation-y={sel.rotY} position={[sel.fx, midY(sel), sel.fz]}>
          {/* Розміри обраного вікна — так само, як підписи граней у зон плану.
              Ширина зверху, висота збоку: знизу вже стоять стрілки дверей. */}
          <Html
            position={[0, (sel.top - sel.sill) / 2 + 0.28, 0.12]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="plan-size">{t.plan.meters(sel.width)}</span>
          </Html>
          <Html
            position={[sel.width / 2 + 0.4, 0, 0.12]}
            center
            zIndexRange={[10, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <span className="plan-size">{t.plan.meters(sel.top - sel.sill)}</span>
          </Html>

          {/* Ручок ширини тут навмисно немає. Ширина — точний розмір, і
              тягати її мишею було незручно й ненадійно: тепер вона задається
              числом у панелі. Мишею вікно лише РУХАЄТЬСЯ вздовж стіни. */}

          {/* Стрілки: переставити ОБРАНІ двері в сусідню вільну секцію. */}
          {door && panels > 1 && (
            <Html position={[0, -(sel.top - sel.sill) / 2 - 0.35, 0.1]} center zIndexRange={[20, 0]}>
              <div className="win-arrows">
                {([-1, 1] as const).map((dir) => {
                  const free = freeSlots(sel, selectedDoor ?? 0)
                  const next =
                    dir < 0
                      ? Math.max(...free.filter((s) => s < door.slot), -1)
                      : Math.min(...free.filter((s) => s > door.slot), panels)
                  const can = next >= 0 && next < panels
                  return (
                    <button
                      key={dir}
                      type="button"
                      className="win-arrow"
                      disabled={!can}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() =>
                        setCustomWindows(
                          updateWindow(windows, sel.id, {
                            doors: sel.doors.map((d, i) => (i === (selectedDoor ?? 0) ? { ...d, slot: next } : d)),
                          }),
                        )
                      }
                    >
                      {dir < 0 ? '‹' : '›'}
                    </button>
                  )
                })}
              </div>
            </Html>
          )}
        </group>
      )}

      {/* Напрямні від вікон сусіднього поверху — поки тягнеш */}
      {sel &&
        guides.map((g, i) => (
          <GuideLine
            key={`guide-${i}`}
            horizontal={sel.horizontal}
            line={sel.line}
            at={g}
            from={0}
            to={plan.floors.length * FLOOR_H}
            color={GUIDE_COLOR}
          />
        ))}

    </>
  )
}

// Вертикальна пунктирна лінія на площині стіни.
function GuideLine({
  horizontal,
  line,
  at,
  from,
  to,
  color,
}: {
  horizontal: boolean
  line: number
  at: number
  from: number
  to: number
  color: string
}) {
  const geo = useMemo(() => {
    const pts: number[] = []
    for (let y = from; y < to; y += 0.4) {
      const y2 = Math.min(y + 0.22, to)
      if (horizontal) pts.push(at, y, line, at, y2, line)
      else pts.push(line, y, at, line, y2, at)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [horizontal, line, at, from, to])
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={0.95} depthTest={false} />
    </lineSegments>
  )
}

export default function HouseShell() {
  const currentStep = useConfigurator((s) => s.currentStep)

  const plan = useHousePlan()
  const windows = useWindows()
  const roof = useRoof()
  const stepId = STEPS[currentStep].id
  // Кроки ПІСЛЯ даху: там будинок уже стоїть цілком, з дахом.
  const lateStep =
    stepId === 'facade' ||
    stepId === 'roofMat' ||
    stepId === 'terrace' ||
    stepId === 'terraceMat' ||
    stepId === 'interior'
  // Коробка видима на «Вікна», «Форма даху» і «Дах» — на кроці форми зони
  // малюються просто поверх неї.
  const show = stepId === 'windows' || stepId === 'roofZones' || stepId === 'roof' || lateStep
  // Дах уже виріс на своєму кроці — і лишається стояти далі: оздоблення
  // дивляться на цілому будинку, а не на коробці без даху.
  const roofOpen = stepId === 'roof' || lateStep
  // Оздоблення НЕ з'являється раніше свого кроку — але НА своєму кроці воно вже
  // видиме, з типовим матеріалом. Раніше чекали першого кліку: у панелі перша
  // картка вже підсвічена, а будинок стоїть базовий — виглядало як несправність.
  // Повернувся назад — будинок знову такий, яким був на тому кроці; сам вибір
  // лишається у сторі й повертається разом із кроком.
  const roofMatTouched = useConfigurator((s) => s.roofMatTouched)
  const reached = (id: StepId) => currentStep >= STEPS.findIndex((s) => s.id === id)
  const showClad = lateStep
  // Покрівлю, вже обрану вручну, лишаємо видимою і якщо відкотитись на «Фасад».
  const showSkin = lateStep && (roofMatTouched || reached('roofMat'))
  const showTerrace = reached('terraceMat')
  const showInterior = stepId === 'interior'
  const selectedRoofPart = useConfigurator((s) => s.selectedRoofPart)
  const windowsMode = useConfigurator((s) => s.windowsMode)
  const selectedWindow = useConfigurator((s) => s.selectedWindow)
  // Оздоблення фасаду — по одному матеріалу на поверх. Хук не можна викликати
  // в циклі, а поверхів рівно два (більше конфігуратор не будує).
  const specs = useConfigurator((s) => s.facades)
  const wallFacades = useConfigurator((s) => s.wallFacades)
  const facadeMode = useConfigurator((s) => s.facadeMode)
  const facade0 = useFacadeMaterial(specs[0])
  const facade1 = useFacadeMaterial(specs[1])
  const facades = [facade0, facade1]
  const roofMatBase = useConfigurator((s) => s.roofMat)
  const roofFlat = useConfigurator((s) => s.roofFlat)
  const roofMats = useConfigurator((s) => s.roofMats)
  const terraceZones = useConfigurator((s) => s.terraceZones)
  const terraceSpecs = useConfigurator((s) => s.terraceMats)
  const interiorSpecs = useConfigurator((s) => s.interiorFloors)
  const roomFloorMats = useConfigurator((s) => s.roomFloorMats)

  // Підсвітка обраної частини даху й саме покриття — окремі матеріали:
  // фасадний спільний на весь поверх, emissive на ньому вмикати не можна.
  const hlMat = useMemo(
    () => new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9, emissive: HANDLE_COLOR, emissiveIntensity: 0.35 }),
    [],
  )
  const roofMat = useMemo(() => new MeshStandardMaterial({ color: ROOF_COLOR, roughness: 0.75 }), [])
  // Торець даху — фарбований метал того ж кольору, що й торцеві планки.
  const trimMat = useMemo(() => new MeshStandardMaterial({ roughness: 0.38, metalness: 0.65 }), [])
  trimMat.color.set(roofMatBase.trim)
  // Покриття тераси: по матеріалу на рівень. Дошка шорстка, камінь і
  // керамограніт трохи глянцевіші.
  const terraceMats = useMemo(
    () => [0, 1].map(() => new MeshStandardMaterial({ roughness: 0.8 })),
    [],
  )
  // Підлога інтер'єру: по матеріалу на поверх.
  const interiorMats = useMemo(() => [0, 1].map(() => new MeshStandardMaterial({ roughness: 0.7 })), [])
  interiorSpecs.forEach((sp, i) => {
    if (!interiorMats[i]) return
    interiorMats[i].color.set(sp.color)
    interiorMats[i].roughness = sp.kind === 'carpet' ? 0.95 : sp.kind === 'board' ? 0.6 : 0.4
  })
  terraceSpecs.forEach((sp, i) => {
    if (!terraceMats[i]) return
    terraceMats[i].color.set(sp.color)
    terraceMats[i].roughness = sp.kind === 'decking' ? 0.85 : 0.55
  })
  // Антрацит — лише ПІДКЛАДКА під оздобленням і фронтони, на які воно лягає.
  // Саму коробку стін фарбувати в темне не можна: потемніли б і кімнати.
  const baseMat = useMemo(() => new MeshStandardMaterial({ color: BASE_COLOR, roughness: 0.95 }), [])
  // Стіни без жодного оздоблення — так будинок виглядає до кроку «Фасад».
  const wallPlain = useMemo(() => new MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.9 }), [])
  const editWindows = stepId === 'windows' && windowsMode === 'custom'
  const ref = useRef<Group>(null)

  // Отвори = розв'язані специфікації вікон (готові або власні — вирішує стор).
  // Показуємо ЛИШЕ ті отвори, під якими справді є стіна. Правила вибору
  // сторони ми правили не раз, і щоразу вилазив той самий артефакт: вікно в
  // суцільній стіні. Тепер це неможливо за конструкцією — немає стіни, немає
  // й вікна, а `validateWindows` покаже, що кімната лишилась без вікна.
  const openings = useMemo<Opening[]>(
    () =>
      resolveWindows(plan, windows, FLOOR_H)
        .filter((w) => {
          const fl = plan.floors[w.floor]
          return fl ? hasWallAt(fl, w.horizontal, w.line, w.a, w.b) : false
        })
        .map((w) => ({ ...w, key: w.id })),
    [plan, windows],
  )
  const clashHl = openings.find((o) => o.id === selectedWindow)

  // Грані зовнішніх стін: і одиниця вибору на кроці «Фасад», і основа, на яку
  // лягає об'ємне оздоблення.
  const faces = useMemo(() => wallFaces(plan), [plan])

  // Оздоблення фасаду в ГЕОМЕТРІЇ. Групуємо за матеріалом: кожна група —
  // один InstancedMesh.
  //
  // Розкладка десятків тисяч елементів коштує кілька мілісекунд, тож кешуємо
  // її ПО ГРАНЯХ і лише за тим, що на розкладку впливає: тип, розміри елемента
  // й отвори. Колір у ключ навмисно не входить — інакше кожен рух повзунка
  // кольору перебудовував би всю цеглу на будинку.
  // Ріг габариту будинку — спільна прив'язка розкладки панелей. Одна на весь
  // будинок, інакше шви на поверхах і на фронтоні не збігаються.
  const panelAnchor = useMemo<[number, number]>(() => {
    let x = Infinity
    let z = Infinity
    for (const fl of plan.floors)
      for (const r of fl.slab) {
        x = Math.min(x, r.x - r.width / 2)
        z = Math.min(z, r.z - r.depth / 2)
      }
    return [Number.isFinite(x) ? x : 0, Number.isFinite(z) ? z : 0]
  }, [plan])

  const cladCache = useRef(new Map<string, CladResult>())
  const { cladGroups, cladBacking } = useMemo(() => {
    const prev = cladCache.current
    const next = new Map<string, CladResult>()
    const map = new Map<string, CladGroup>()
    const backing: CladBox[] = []
    if (!showClad) return { cladGroups: [] as CladGroup[], cladBacking: backing }

    // Стіни + ФРОНТОНИ над дахом: те, що лишилось стіною, оздоблюється так
    // само, а розкладка зшивається сама — сітка прив'язана до світового нуля.
    const raw = [
      ...faces.map((f) => ({
        face: f,
        baseY: f.floor * FLOOR_H,
        height: FLOOR_H,
        heightAt: undefined as HeightAt | undefined,
        over: undefined as string | undefined,
        tag: 'wall',
      })),
      ...roof.flatMap((p) => {
        const above = plan.floors[p.level + 1]?.slab ?? []
        const y = (p.level + 1) * FLOOR_H
        // Фронтони скатного і стінки парапету плоского — усе це так само
        // зовнішні стіни, тільки вище покриття.
        const sibs = roof.filter((o) => o.level === p.level && o.id !== p.id).flatMap(partRects)
        return [...gablePanels(p, above, y, p.level, sibs), ...parapetPanels(p, above, y, p.level)].map((g) => ({
          ...g,
          // Матеріал фронтон/парапет НЕ обирають окремо: вони продовжують ту
          // стіну, над якою стоять. Інакше, помінявши матеріал стіни під
          // дахом, людина бачила над нею стару розкладку.
          over: faceUnder(g.face, faces),
          tag: p.id,
        }))
      }),
    ]
    type Panel = (typeof raw)[number]
    const specOf = (p: Panel) => wallFacades[p.over ?? p.face.id] ?? specs[p.face.floor] ?? specs[0]

    // РІГ. Оздоблення доводимо до зовнішньої площини МАТЕРІАЛУ перпендикулярної
    // стіни, а не до її голої грані: різниця в 5 мм — і на кожному розі
    // вилазила смужка чужого матеріалу (або, навпаки, одне лізло в друге).
    // Товщину матеріалу знає лише сцена, тож геометрія лишає закладку
    // (`cornerA/cornerB` — вісь перпендикулярної стіни), а справжній розмір
    // підставляємо тут.
    // Сусідню грань шукаємо по ВСІХ панелях цієї відмітки, не лише по своїй
    // зоні: парапет упирається саме в стіну поверху вище, і підрізати його
    // треба по ЇЇ матеріалу.
    const perpAt = (p: Panel, at: number) =>
      raw.find(
        (q) =>
          q.face.horizontal !== p.face.horizontal &&
          Math.abs(q.baseY - p.baseY) < 0.01 &&
          Math.abs(q.face.line - at) < 0.01 &&
          p.face.line > q.face.a - 0.3 &&
          p.face.line < q.face.b + 0.3,
      )
    // out=false — гола грань сусідньої стіни (докуди йде підкладка),
    // out=true — зовнішня площина її матеріалу (докуди йдуть елементи).
    const toNeighbour = (p: Panel, at: number, cur: number, out: boolean) => {
      const q = perpAt(p, at)
      if (!q) return cur
      const half = p.face.halfT ?? WALL_T / 2
      return at + (cur < at ? -1 : 1) * (half + (out ? cladOuter(specOf(q)) : 0))
    }
    const panels = raw.map((p) => {
      const { cornerA, cornerB } = p.face
      if (cornerA === undefined && cornerB === undefined) return p
      const at = (c: number | undefined, cur: number, out: boolean) =>
        c === undefined ? undefined : toNeighbour(p, c, cur, out)
      return {
        ...p,
        face: {
          ...p.face,
          a: at(cornerA, p.face.a, true) ?? p.face.a,
          b: at(cornerB, p.face.b, true) ?? p.face.b,
          backA: at(cornerA, p.face.a, false),
          backB: at(cornerB, p.face.b, false),
        },
      }
    })

    for (const p of panels) {
      const { face: f, baseY, height, heightAt } = p
      const spec = specOf(p)
      const holes = openings
        .filter(
          (o) =>
            o.horizontal === f.horizontal &&
            Math.abs(o.line - f.line) < 0.05 &&
            Math.min(o.b, f.b) - Math.max(o.a, f.a) > 0.01,
        )
        .map((o) => ({ a: o.a, b: o.b, y0: o.baseY + o.sill, y1: o.baseY + o.top }))
      const layoutKey = [
        f.id,
        // Кінці грані більше не випливають з id: на розі їх править матеріал
        // СУСІДНЬОЇ стіни. Без них у ключі зміна того матеріалу лишалась би в
        // кеші непоміченою.
        f.a.toFixed(3),
        f.b.toFixed(3),
        baseY.toFixed(2),
        height.toFixed(2),
        spec.kind,
        spec.plankWidth,
        spec.plankGap,
        spec.plankDir,
        spec.panelShape,
        spec.panelWidth,
        spec.panelHeight,
        holes.map((h) => `${h.a},${h.b},${h.y0},${h.y1}`).join(';'),
        panelAnchor.join(','),
      ].join('|')
      let res = prev.get(layoutKey)
      if (!res) res = claddingBoxes(f, baseY, height, holes, spec, heightAt, true, panelAnchor[f.horizontal ? 0 : 1])
      next.set(layoutKey, res)

      const key = `${spec.kind}|${spec.color}|${spec.plankWidth}|${spec.plankGap}|${spec.plankDir}|${spec.panelShape}|${spec.panelWidth}|${spec.panelHeight}`
      let g = map.get(key)
      if (!g) {
        g = { key, spec, boxes: [] }
        map.set(key, g)
      }
      // Саме циклом: spread на десятки тисяч аргументів ризикує стеком.
      for (const b of res.elements) g.boxes.push(b)
      for (const b of res.backing) backing.push(b)
    }
    cladCache.current = next
    return { cladGroups: [...map.values()].filter((g) => g.boxes.length > 0), cladBacking: backing }
  }, [showClad, faces, roof, plan, specs, wallFacades, openings, panelAnchor])

  // Покриття тераси. З'являється, як і решта матеріалів, лише на своєму кроці
  // й лише після того, як його справді обрали.
  const terraceSkins = useMemo(
    () => (showTerrace ? terraceSkin(terraceSurfaces(plan, terraceZones, FLOOR_H, WALL_T / 2), terraceSpecs) : []),
    [showTerrace, plan, terraceZones, terraceSpecs],
  )

  // Внутрішні перегородки як дані + отвори, які поставив користувач.
  const walls2 = useMemo(() => innerWalls(plan), [plan])
  const innerDoors = useConfigurator((s) => s.innerDoors)
  const manualDoors = stepId === 'interior'
  const innerOpen = useMemo(
    () => (manualDoors ? resolveDoors(walls2, innerDoors, FLOOR_H) : []),
    [manualDoors, walls2, innerDoors],
  )

  // Підлога в кімнатах — та сама об'ємна розкладка, тільки тонша.
  const interiorSkins = useMemo(
    () => (showInterior ? interiorSkin(interiorSurfaces(plan, FLOOR_H), interiorSpecs, roomFloorMats) : []),
    [showInterior, plan, interiorSpecs, roomFloorMats],
  )

  // Покриття даху — теж геометрія, по ярусах (щоб росло разом зі своїм дахом).
  const skins = useMemo(
    () => (showSkin ? roofSkin(plan, roof, roofMatBase, roofFlat, roofMats, FLOOR_H) : []),
    [showSkin, plan, roof, roofMatBase, roofFlat, roofMats],
  )

  // Стіни: простінки + перемички НАД отворами (простінок під підвіконням — окремо,
  // анімований Spandrel). Верх перемички = FLOOR_H, низ отвору = WIN_TOP.
  const walls = useMemo(() => {
    // Розкладено ПО ПОВЕРХАХ: у кожного своє оздоблення фасаду, і матеріал
    // призначається на групу, а не на кожну коробку.
    const perFloor: Box[][] = plan.floors.map(() => [])
    plan.floors.forEach((fl, idx) => {
      const boxes = perFloor[idx]
      const baseY = idx * FLOOR_H
      const t = wallT(idx)
      const ops = openings.filter((o) => o.baseY === baseY)
      const rings = wallOutline(fl)
      for (const e of edgesOf(rings)) {
        // Стіну будуємо СУЦІЛЬНОЮ, а отвори ріже cutOpenings нижче. Два
        // механізми одночасно тут і були бідою: розкладка простінків залежала
        // від того, чи збігся отвір із ребром контуру, і на кожному незбігу
        // вікно лишалось у глухій стіні.
        // Висота — на ВЕСЬ поверх (FLOOR_H), щоб закрити край плити
        // перекриття; знизу заходить у нижній ярус на TIER_LAP.
        pushBox(boxes, e.horizontal, e.line, e.min, e.max, -TIER_LAP, FLOOR_H, baseY, t)
      }
      // Кутові стовпи на кожній вершині контуру — гарантовано з'єднують стіни без
      // дірок. Стовп на 2 мм ТОВЩИЙ за свій простінок: інакше його грані лежать
      // рівно в площині граней простінка, який він перекриває, і кут мерехтить.
      const pt = postT(idx)
      for (const { pts } of rings)
        for (const [vx, vz] of pts)
          boxes.push({
            x: vx,
            y: baseY + (FLOOR_H - TIER_LAP) / 2,
            z: vz,
            dx: pt,
            dy: FLOOR_H + TIER_LAP,
            dz: pt,
          })
      // Страховка: фізично віднімаємо отвори від готових коробок.
      perFloor[idx] = cutOpenings(perFloor[idx], ops)
    })
    return perFloor
  }, [plan, openings])

  // Внутрішні перегородки з коричневими дверима (між РІЗНИМИ кімнатами).
  const partitions = useMemo(() => {
    const wallB: Box[] = []
    const doorB: Box[] = []
    // На кроці «Інтер'єр» автоматичні двері зникають: там людина ставить їх
    // сама. Поза цим кроком лишається колишня поведінка — двері посередині
    // кожної достатньо довгої перегородки.
    for (const w of walls2) {
      const baseY = w.floor * FLOOR_H
      const len = w.b - w.a
      if (!manualDoors) {
        if (len < IDOOR_W + 0.4) {
          pushBox(wallB, w.horizontal, w.line, w.a, w.b, 0, WALL_H, baseY, PART_T)
          continue
        }
        const mid = (w.a + w.b) / 2
        const ds = mid - IDOOR_W / 2
        const de = mid + IDOOR_W / 2
        pushBox(wallB, w.horizontal, w.line, w.a, ds, 0, WALL_H, baseY, PART_T)
        pushBox(wallB, w.horizontal, w.line, de, w.b, 0, WALL_H, baseY, PART_T)
        pushBox(wallB, w.horizontal, w.line, ds, de, IDOOR_H, WALL_H, baseY, PART_T)
        pushBox(doorB, w.horizontal, w.line, ds, de, 0, IDOOR_H, baseY, IDOOR_D)
        continue
      }
      // Ручний режим: ріжемо перегородку власними отворами.
      const mine = innerOpen
        .filter((d) => d.wallId === w.id)
        .sort((p, q) => p.a - q.a)
      let cursor = w.a
      for (const d of mine) {
        if (d.a > cursor) pushBox(wallB, w.horizontal, w.line, cursor, d.a, 0, WALL_H, baseY, PART_T)
        pushBox(wallB, w.horizontal, w.line, d.a, d.b, d.height, WALL_H, baseY, PART_T)
        // Арка — це той самий отвір, тільки без полотна.
        if (!d.arch) pushBox(doorB, w.horizontal, w.line, d.a, d.b, 0, d.height, baseY, IDOOR_D)
        cursor = d.b
      }
      pushBox(wallB, w.horizontal, w.line, cursor, w.b, 0, WALL_H, baseY, PART_T)
    }
    return { wallB, doorB }
  }, [walls2, innerOpen, manualDoors])

  // Перекриття: ВРІВЕНЬ (top на рівні поверху, під ним), а не видавлені вгору.
  // Контур — по ВНУТРІШНІЙ грані стін (віднімаємо смугу стіни), щоб торець
  // плити не сидів у товщі стіни. Тераса смуги не має, тож там плита повна.
  const plates = useMemo(() => {
    const N = plan.floors.length
    const arr: { y: number; geo: ExtrudeGeometry }[] = []
    if (N === 0) return arr
    for (let idx = 0; idx <= N; idx++) {
      const fl = plan.floors[Math.max(0, idx - 1)]
      const wantHole = idx >= 1 && idx <= N - 1
      const stairs = wantHole ? fl.rooms.find((r) => r.type === 'stairs') : undefined
      const hole = stairs ? bounds(stairs) : null
      const band = wallBand(wallOutline(fl))
      const cut = idx <= N - 1 ? band : [...fl.rooms.filter((r) => r.type === 'terrace'), ...band]
      arr.push({ y: idx * FLOOR_H, geo: plateGeometry(unionOutline(fl.slab, cut), hole) })
    }
    return arr
  }, [plan])

  // Цоколь: плита на всю площу 1-го поверху, від -FOUNDATION_H до нуля. Контур
  // розширений так, щоб цоколь дійшов до ЗОВНІШНЬОЇ грані стін (вони центровані
  // на контурі) і ще трохи виступив — карниз, на який далі ляже тераса.
  const foundation = useMemo(() => {
    const fl = plan.floors[0]
    if (!fl) return null
    const grown = fl.slab.map((r) => ({
      ...r,
      width: r.width + 2 * FOUND_OUT,
      depth: r.depth + 2 * FOUND_OUT,
    }))
    // Верх цоколя на 1 мм НИЖЧЕ нуля: плита 1-го поверху теж має верх на нулі,
    // і дві збіжні площини по всій підошві дали б мерехтіння. Крок непомітний.
    return plateGeometry(unionOutline(grown), null, FOUNDATION_H - 0.001)
  }, [plan])

  // Скляний паркан по контуру тераси (без сторони до будинку) + поручень.
  const fences = useMemo(() => {
    const out: { baseY: number; horizontal: boolean; cx: number; cz: number; len: number }[] = []
    plan.floors.forEach((fl, floorIdx) => {
      const baseY = floorIdx * FLOOR_H
      const terraces = fl.rooms.filter((r) => r.type === 'terrace')
      if (terraces.length === 0) return
      // Паркан іде по СПІЛЬНОМУ зовнішньому контуру всіх терас поверху.
      // Раніше кожен прямокутник обраховувався окремо, тож між двома
      // з'єднаними зонами тераси виростала зайва внутрішня стінка: сусідню
      // терасу перевірка `isExterior` навмисно не бачить. Об'єднання контурів
      // прибирає внутрішні грані саме тому, що їх у контурі просто немає.
      const solid = fl.rooms.filter((r) => r.type !== 'terrace').map(bounds)
      for (const { pts } of unionOutline(terraces)) {
        for (let i = 0; i < pts.length; i++) {
          const [x0, z0] = pts[i]
          const [x1, z1] = pts[(i + 1) % pts.length]
          const horizontal = Math.abs(z1 - z0) < 1e-4
          const line = horizontal ? z0 : x0
          const from = Math.min(horizontal ? x0 : z0, horizontal ? x1 : z1)
          const to = Math.max(horizontal ? x0 : z0, horizontal ? x1 : z1)
          // Ділянки, де до тераси притулилась стіна будинку, — без паркану.
          // Ріжемо саме ДІЛЯНКУ, а не грань цілком: кімната може закривати
          // лише частину довгої грані, і решта все одно потребує паркану.
          const cuts = solid
            .filter((c) =>
              horizontal
                ? Math.abs(c.z0 - line) < 0.05 || Math.abs(c.z1 - line) < 0.05
                : Math.abs(c.x0 - line) < 0.05 || Math.abs(c.x1 - line) < 0.05,
            )
            .map((c) =>
              horizontal
                ? ([Math.max(c.x0, from), Math.min(c.x1, to)] as [number, number])
                : ([Math.max(c.z0, from), Math.min(c.z1, to)] as [number, number]),
            )
            .filter(([a, b]) => b - a > 0.05)
            .sort((a, b) => a[0] - b[0])
          // len БЕЗ подовження → панелі не перетинаються (без мерехтіння скла).
          const push = (a: number, b: number) => {
            if (b - a < 0.05) return
            const mid = (a + b) / 2
            out.push({ baseY, horizontal, cx: horizontal ? mid : line, cz: horizontal ? line : mid, len: b - a })
          }
          let cur = from
          for (const [c0, c1] of cuts) {
            push(cur, c0)
            cur = Math.max(cur, c1)
          }
          push(cur, to)
        }
      }
    })
    return out
  }, [plan])

  // Плоский дах: парапети по периметру КОЖНОГО рівня даху (верх + дах над денним
  // крилом/вітальнею). Ребро, накрите верхнім поверхом (там його стіни), пропускаємо.
  // Плоскі зони даху: парапет по периметру КОЖНОЇ зони. Раніше геометрія
  // йшла по контуру цілого рівня — тепер по намальованих зонах, тож на
  // різних частинах будинку може бути різний дах.
  const parapets = useMemo(() => {
    const tiers = new Map<number, { partId: string; level: number; boxes: Box[] }[]>()
    if (plan.floors.length === 0)
      return [] as { roofY: number; groups: { partId: string; level: number; boxes: Box[] }[] }[]
    for (const part of roof) {
      if (part.kind !== 'flat') continue
      const roofY = (part.level + 1) * FLOOR_H
      const t = part.parapetT
      const boxes: Box[] = []
      // Ребра, накриті поверхом ВИЩЕ, парапету не потребують: там уже стоїть
      // зовнішня стіна верхнього поверху, і парапет лише колізив би з нею.
      // Різання ділянок живе в lib/roof.ts — ТИМ САМИМ кодом користується
      // перевірка колізій, тож геометрія і перевірка не можуть розійтись.
      const edges = parapetEdges(part, plan.floors[part.level + 1]?.slab ?? [])
      for (const e of edges) {
        const { spans } = e
        // Зовнішня грань парапету — рівно грань СТІНИ, а товщина росте
        // ВСЕРЕДИНУ. Інакше парапет випирає за фасад.
        const line = e.line + (e.nx + e.nz) * (WALL_T / 2 - t / 2)
        // Ріг: горизонтальна смуга перекриває квадрат перетину цілком,
        // вертикальна відступає рівно до неї. Окремих кутових стовпчиків більше
        // немає — їх ставили ОБИДВІ грані, дві однакові коробки лягали одна в
        // одну, а їхні зовнішні грані ще й збігались із гранями смуг: саме це
        // й читалось як сходинка на розі. Кінець, що утворився ВИРІЗОМ (там,
        // де зверху стоїть поверх), — не ріг, його лишаємо як є.
        const cap = (u: number) =>
          Math.abs(u - e.min) < 1e-4 || Math.abs(u - e.max) < 1e-4 ? cornerStop(edges, e, u, t, t / 2) : u
        for (const [u0, u1] of spans) {
          pushBox(boxes, e.horizontal, line, cap(u0), cap(u1), -TIER_LAP, part.parapetH, roofY, t)
        }
      }
      if (boxes.length === 0) continue
      const list = tiers.get(roofY) ?? []
      list.push({ partId: part.id, level: part.level, boxes })
      tiers.set(roofY, list)
    }
    return [...tiers].map(([roofY, groups]) => ({ roofY, groups }))
  }, [plan, roof])

  // Скатні та односхилі зони: призма над прямокутником зони.
  const gables = useMemo(() => {
    const out: {
      roofY: number
      partId: string
      level: number
      geo: BufferGeometry
      x: number
      y: number
      z: number
      rotY: number
      wallLike: boolean
      edge?: boolean // видно як ТОРЕЦЬ даху, а не як стіна чи покрівля
    }[] = []
    if (plan.floors.length === 0) return out
    for (const part of roof) {
      if (part.kind === 'flat') continue
      const roofY = (part.level + 1) * FLOOR_H
      const above = plan.floors[part.level + 1]?.slab ?? []
      // Сусідні зони того ж рівня: до них скат доходить УПРИТУЛ, без звісу —
      // інакше два крила налазять одне на одне на два звіси, і замість єндови
      // виходить каша з двох карнизів.
      const sibs = roof.filter((o) => o.level === part.level && o.id !== part.id).flatMap(partRects)
      // Складена зона будується ПО ЧАСТИНАХ, але з ОДНИМ підйомом гребеня:
      // головна частина задає висоту, другорядні врізаються в неї під прямим
      // кутом на тій самій відмітці.
      const zone = zoneRise(part, above, sibs)
      // Габарит УСІЄЇ зони — по ньому будується спільна площина односхилого.
      const gz = slopeBox(part, above, undefined, sibs)
      // Напрям гребеня беремо теж по зоні, а не по окремій частині: інакше
      // частини складеної зони дивилися б у різні боки.
      const zoneRidgeAlongZ =
        part.rotation % 180 === 0 ? gz.z1 - gz.z0 >= gz.x1 - gz.x0 : gz.z1 - gz.z0 < gz.x1 - gz.x0
      for (const rect of partRects(part)) {
      // Габарит скату зі звісами ПО КОЖНІЙ СТОРОНІ. Сторона, притиснута до
      // стіни поверху вище, звісу не має — інакше, збільшуючи звіс, скат
      // заповзав би всередину кімнати другого поверху. Через це габарит
      // несиметричний, і центр більше не збігається з центром зони.
      const g = slopeBox(part, above, rect, sibs)
      const w = g.x1 - g.x0
      const d = g.z1 - g.z0
      // 0° — гребінь уздовж довшої сторони, 90° — упоперек.
      const ridgeAlongZ = part.kind === 'mono' ? zoneRidgeAlongZ : part.rotation % 180 === 0 ? d >= w : d < w
      const span = ridgeAlongZ ? w : d
      const skirt = ROOF_LIFT + TIER_LAP
      const [pw, pd] = ridgeAlongZ ? [w, d] : [d, w]
      const x = (g.x0 + g.x1) / 2
      const z = (g.z0 + g.z1) / 2
      const y = roofY + ROOF_LIFT
      const mono = part.kind === 'mono'
      const rotY = (ridgeAlongZ ? 0 : Math.PI / 2) + (mono && part.rotation >= 180 ? Math.PI : 0)
      // Кут беремо не з налаштувань, а з ПІДЙОМУ: так усі частини зони
      // виходять на одну висоту, хоч і мають різні прольоти.
      const tan = Math.tan((part.pitch * Math.PI) / 180)
      if (part.kind === 'hip') {
        // Вальмовий будується в СВІТОВИХ осях (гребінь сам іде вздовж довшої
        // сторони), тож жодного повороту групи йому не треба.
        out.push({
          roofY,
          partId: part.id,
          level: part.level,
          geo: hipGeometry(w, d, part.pitch, skirt),
          x,
          y,
          z,
          rotY: 0,
          wallLike: false,
        })
      } else if (mono) {
        // Односхилий — ОДНА площина на всю зону, а кожна частина відрізає від
        // неї свій шматок. Раніше кожна частина була самостійним скатом «від
        // нуля до повної висоти», і складена зона розпадалась на два дахи
        // замість одного, підрізаного по контуру.
        const zoneSpan = Math.max(zoneRidgeAlongZ ? gz.x1 - gz.x0 : gz.z1 - gz.z0, 1e-6)
        const zoneH = zone || zoneSpan * tan
        // Низький край зони: 0/90° — схил падає до меншої координати, 180/270°
        // — до більшої.
        const [F0, F1] = zoneRidgeAlongZ ? [gz.x0, gz.x1] : [gz.z0, gz.z1]
        const [f0, f1] = zoneRidgeAlongZ ? [g.x0, g.x1] : [g.z0, g.z1]
        // Куди дивиться ВИСОКИЙ край. Локальна вісь X геометрії при повороті на
        // 90° лягає на −Z, тож для падіння вздовж Z умова дзеркальна — саме
        // так це рахує й покриття (roofSkin).
        const highAtMax = zoneRidgeAlongZ ? part.rotation < 180 : part.rotation >= 180
        const at = (f: number) => (Math.abs(f - (highAtMax ? F0 : F1)) / zoneSpan) * zoneH
        // Локальна вісь X дивиться за світовою, поки поворот менший за 180°.
        const [h0, h1] = highAtMax ? [at(f0), at(f1)] : [at(f1), at(f0)]
        const b = { roofY, partId: part.id, level: part.level, x, y, z, rotY }
        out.push({ ...b, geo: monoGeometry(pw, pd, h0, h1, skirt, true), wallLike: true })
        // Похила плита — це ТОРЕЦЬ даху, а не покрівля: там, де планка не
        // закриває його (наприклад біля стіни), має світитись метал торця, а не
        // світлий колір стін. Саме той «порожній трикутник» на стику.
        out.push({ ...b, geo: monoGeometry(pw, pd, h0, h1, skirt, false), wallLike: false, edge: true })
      } else {
        const gh = zone || (span / 2) * tan
        const b = { roofY, partId: part.id, level: part.level, x, y, z, rotY }
        if (part.overhang > 0) {
          // Зі звісом дах нависає над стінами: усе, що видно збоку, — це вже
          // ТОРЕЦЬ даху, а не стіна. Тож призма отримує колір торцевої планки,
          // а не покрівлі: інакше збоку світить біла площина.
          out.push({ ...b, geo: gableGeometry(pw, pd, gh, skirt), wallLike: false, edge: true })
        } else {
          // БЕЗ звісу схили закінчуються рівно на стіні, тож фронтон — це
          // продовження самої стіни: віддаємо його як wallLike, і фасадне
          // оздоблення заходить на нього так само, як в односхилого.
          const run = Math.max(pw / 2, 1e-6)
          const tv = (ROOF_T * Math.hypot(run, gh)) / run
          out.push({ ...b, geo: gableGeometry(pw, pd, gh, skirt), wallLike: true })
          out.push({ ...b, geo: gablePlateGeometry(pw, pd, gh, tv), wallLike: false, edge: true })
        }
      }
      }
    }
    return out
  }, [plan, roof])

  // Скати, згруповані по рівнях — щоб кожен ріс від СВОЄЇ площини.
  const gableTiers = useMemo(() => {
    const map = new Map<number, typeof gables>()
    for (const g of gables) map.set(g.roofY, [...(map.get(g.roofY) ?? []), g])
    return [...map].map(([roofY, items]) => ({ roofY, items }))
  }, [gables])

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    easing.damp(g.scale, 'y', show ? 1 : 0.0001, RISE_EASE, dt)
    g.visible = show || g.scale.y > 0.02 // лишаємось видимими, поки коробка зникає
  })

  return (
    <group ref={ref} visible={false} scale={[1, 0.0001, 1]}>
      {/* Цоколь — усередині анімованої групи, тож виростає разом зі стінами. */}
      {foundation && (
        <mesh geometry={foundation} position={[0, -FOUNDATION_H, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={FOUND_COLOR} roughness={0.95} />
        </mesh>
      )}

      {/* Базова коробка стін — темна; видиме оздоблення стоїть перед нею */}
      {walls.map((boxes, idx) =>
        boxes.map((b, i) => (
          <mesh
            key={`wall-${idx}-${i}`}
            position={[b.x, b.y, b.z]}
            material={wallPlain}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[b.dx, b.dy, b.dz]} />
          </mesh>
        )),
      )}

      {openings.map((o) => (
        <Spandrel
          key={`sp-${o.key}`}
          horizontal={o.horizontal}
          line={o.line}
          a={o.a}
          b={o.b}
          baseY={o.baseY}
          sill={o.sill}
          material={wallPlain}
        />
      ))}

      {/* Темна підкладка — рівно на зовнішній площині стіни, у проміжки між
          елементами видно саме її: це і є шов. Всю коробку стіни фарбувати
          не можна — потемніли б і кімнати всередині. */}
      {cladBacking.length > 0 && <Backing boxes={cladBacking} material={baseMat} />}

      {/* Об'ємне оздоблення фасаду */}
      <Cladding groups={cladGroups} />

      {/* Підлога в кімнатах */}
      {interiorSkins.map((fs) => (
        <group key={`floor-${fs.key}`}>
          <Backing boxes={fs.base} material={baseMat} />
          <Backing boxes={fs.boxes} material={interiorMats[fs.floor]} />
        </group>
      ))}

      {/* Покриття тераси — така сама об'ємна розкладка, тільки горизонтальна */}
      {terraceSkins.map((ts) => (
        <group key={`terr-${ts.key}`}>
          <Backing boxes={ts.base} material={baseMat} />
          <Backing boxes={ts.boxes} material={terraceMats[ts.floor]} />
        </group>
      ))}

      {/* Покриття даху. Спускається ЗВЕРХУ: покриття лягає на схил, а не
          виростає з-під нього. */}
      {skins.map((sg) => (
        <SkinTier key={`skin-${sg.key}`} top={sg.top} open={showSkin}>
          <RoofSkin spec={sg.spec} boxes={sg.boxes} trim={sg.trim} />
        </SkinTier>
      ))}

      {/* Розстановка внутрішніх дверей — лише на кроці «Інтер'єр» */}
      {manualDoors && <InnerDoorEditor walls={walls2} openings={innerOpen} />}

      {/* Вибір стіни під власний матеріал — лише у своєму режимі фасаду */}
      {stepId === 'facade' && facadeMode === 'custom' && (
        <FacadeWalls faces={faces} floorH={FLOOR_H} wallH={WALL_H} />
      )}

      {partitions.wallB.map((b, i) => (
        <mesh key={`part-${i}`} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.dx, b.dy, b.dz]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
        </mesh>
      ))}
      {partitions.doorB.map((b, i) => (
        <mesh key={`idoor-${i}`} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.dx, b.dy, b.dz]} />
          <meshStandardMaterial color={DOOR_COLOR} roughness={0.7} />
        </mesh>
      ))}

      {plates.map((p, i) => (
        <mesh key={`plate-${i}`} geometry={p.geo} position={[0, p.y - PLATE_T, 0]} castShadow receiveShadow>
          {/* БЕЗ polygonOffset. Він тягнув плиту ближче до камери, щоб вона
              вигравала в зеленої землі на нулі — але тепер земля на -100 і між
              ними цоколь, тож потреби немає. А от шкода була: зсув росте з
              нахилом поверхні, і торець плити (його видно майже з ребра)
              вилазив КРІЗЬ стіну — та сама смужка на кожному стику поверхів. */}
          <meshStandardMaterial color={PLATE_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {/* Кожен рівень даху росте ВІД СВОЄЇ площини (origin групи = roofY), а не
          від землі крізь будинок. Обидва типи існують завжди — видимістю керує
          `open`, тому перемикання плоский/скатний теж анімується: один тип
          сідає, другий піднімається. */}
      {/* Парапет — продовження СТІНИ, тож і оздоблення на ньому фасадне, свого
          поверху. Обрана частина даху світиться ЦІЛКОМ: підсвітку не можна
          зробити на спільному матеріалі, тому вона окремим матеріалом. */}
      {parapets.map((tier) => (
        <RoofTier key={`flat-${tier.roofY}`} baseY={tier.roofY} open={roofOpen}>
          {tier.groups.map((g) =>
            g.boxes.map((b, i) => (
              <mesh
                key={`parapet-${g.partId}-${i}`}
                position={[b.x, b.y, b.z]}
                material={g.partId === selectedRoofPart ? hlMat : showClad ? facades[g.level] : wallPlain}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[b.dx, b.dy, b.dz]} />
              </mesh>
            )),
          )}
        </RoofTier>
      ))}

      {gableTiers.map((tier) => (
        <RoofTier key={`pitched-${tier.roofY}`} baseY={tier.roofY} open={roofOpen}>
          {tier.items.map((g, i) => (
            <mesh
              key={`gable-${i}`}
              geometry={g.geo}
              position={[g.x, g.y, g.z]}
              rotation-y={g.rotY}
              // wallLike — це клин під похилою плитою: продовження СТІНИ, тож
              // на ньому фасад, а не покрівля.
              // Фронтон — це стіна: під оздобленням він теж має бути темним,
              // інакше у проміжки між елементами світить біле.
              material={
                g.partId === selectedRoofPart
                  ? hlMat
                  : g.wallLike
                    ? showClad
                      ? baseMat
                      : wallPlain
                    : g.edge && showSkin
                      ? trimMat
                      : roofMat
              }
              castShadow
              receiveShadow
            />
          ))}
        </RoofTier>
      ))}

      {openings.map((o) => (
        <Win
          key={o.key}
          rotY={o.rotY}
          x={o.fx}
          z={o.fz}
          baseY={o.baseY}
          width={o.width}
          sill={o.sill}
          top={o.top}
          mullions={o.mullions}
          doors={o.doors}
        />
      ))}

      {/* Ручне редагування вікон: вибір, перетягування вздовж стіни, ручки ширини */}
      {editWindows && <WindowEditor openings={openings} plan={plan} />}

      {/* На кроці «Дах» вікна редагують не мишею, а списком колізій — тож те,
          що зараз правлять, підсвічуємо тут: інакше з панелі не видно, про
          який саме отвір ідеться. Накладка подій не ловить. */}
      {stepId === 'roof' && clashHl && (
        <mesh
          position={[
            clashHl.fx + outward(clashHl.side, WIN_PICK_OUT)[0],
            clashHl.baseY + (clashHl.sill + clashHl.top) / 2,
            clashHl.fz + outward(clashHl.side, WIN_PICK_OUT)[1],
          ]}
          rotation-y={clashHl.rotY}
        >
          <boxGeometry args={[clashHl.width + 0.12, Math.max(clashHl.top - clashHl.sill, 0.1) + 0.12, 0.06]} />
          <meshBasicMaterial color={HANDLE_COLOR} transparent opacity={0.4} depthWrite={false} />
        </mesh>
      )}

      {/* Паркан стоїть НА покритті тераси, а не в ньому: інакше його низ
          тонув у дошці. Підйом мікроскопічний і на вигляд не читається. */}
      {fences.map((f, i) => (
        <group key={`fence-${i}`}>
          <mesh position={[f.cx, f.baseY + TERRACE_UP_STACK + FENCE_H / 2, f.cz]}>
            <boxGeometry args={f.horizontal ? [f.len, FENCE_H, FENCE_D] : [FENCE_D, FENCE_H, f.len]} />
            {/* depthWrite=false — інакше прозорі панелі паркану пишуть у буфер
                глибини й на стиках дають дрібні артефакти. */}
            <meshStandardMaterial
              color={GLASS_COLOR}
              metalness={0}
              roughness={0.05}
              transparent
              opacity={0.26}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[f.cx, f.baseY + TERRACE_UP_STACK + FENCE_H + RAIL_H / 2, f.cz]}>
            <boxGeometry args={f.horizontal ? [f.len + RAIL_W, RAIL_H, RAIL_W] : [RAIL_W, RAIL_H, f.len + RAIL_W]} />
            <meshStandardMaterial {...frameMat} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
