import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { easing } from 'maath'
import {
  BufferGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Path,
  Raycaster,
  Shape,
  Vector2,
  type Camera,
  type Group,
  type Mesh,
} from 'three'
import { useConfigurator, useHousePlan, useRoof, useWindows } from '../state/store'
import { STEPS } from '../config/steps'
import { ringContains, unionOutline, type Point, type Ring } from '../lib/outline'
import {
  bounds,
  fitToWall,
  isExterior,
  neighborOf,
  resolveWindows,
  openSides,
  type DoorSpec,
  updateWindow,
  wallOf,
  wallRange,
  freeSlots,
  panelCount,
  type Rect,
  type ResolvedWindow,
  type Side,
} from '../lib/windows'
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
const WALL_T = 0.1
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
const PLATE_COLOR = '#d9d3c6'
const FOUND_COLOR = '#bdb6a7' // цоколь темніший за плиту — читається як окремий об'єм
const FOUND_OUT = WALL_T / 2 + 0.04 // виступ цоколя за зовнішню грань стіни
const RISE_EASE = 0.5
const ROOF_EASE = 0.42 // дах виростає трохи жвавіше за коробку
const ROOF_LIFT = 0.09 // на скільки схили підняті над верхом стіни
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
}
// Плаский помічник: додати коробку стіни/перегородки вздовж осі (horizontal → по X).
function pushBox(out: Box[], horizontal: boolean, line: number, u0: number, u1: number, v0: number, v1: number, baseY: number, thick: number) {
  const ulen = u1 - u0
  const vlen = v1 - v0
  if (ulen <= 0.001 || vlen <= 0.001) return
  const uc = (u0 + u1) / 2
  const vc = baseY + (v0 + v1) / 2
  if (horizontal) out.push({ x: uc, y: vc, z: line, dx: ulen, dy: vlen, dz: thick })
  else out.push({ x: line, y: vc, z: uc, dx: thick, dy: vlen, dz: ulen })
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

// Односхилий дах — НЕ трикутник у розрізі: це похила плита завтовшки ROOF_T,
// а під нею стіни доростають до неї (клин у кольорі стіни). fill=true віддає
// цей клин, fill=false — саму плиту.
function monoGeometry(width: number, depth: number, height: number, skirt: number, fill: boolean): ExtrudeGeometry {
  const s = new Shape()
  // Вертикальна товщина плити більша за ROOF_T рівно настільки, наскільки
  // вона нахилена, — тоді ПЕРПЕНДИКУЛЯРНА товщина виходить рівно ROOF_T.
  const tv = ROOF_T * Math.hypot(width, height) / Math.max(width, 1e-6)
  if (fill) {
    s.moveTo(-width / 2, -skirt)
    s.lineTo(width / 2, -skirt)
    s.lineTo(width / 2, height)
    s.lineTo(-width / 2, 0)
  } else {
    s.moveTo(-width / 2, 0)
    s.lineTo(width / 2, height)
    s.lineTo(width / 2, height + tv)
    s.lineTo(-width / 2, tv)
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
function Spandrel({ horizontal, line, a, b, baseY, sill }: { horizontal: boolean; line: number; a: number; b: number; baseY: number; sill: number }) {
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
    <mesh ref={ref} position={horizontal ? [uc, baseY, line] : [line, baseY, uc]} castShadow receiveShadow>
      <boxGeometry args={horizontal ? [ulen, 1, t] : [t, 1, ulen]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
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

const WIN_HANDLE = 0.22

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

// Локальна вісь X групи вікна збігається з віссю стіни не на всіх сторонах:
// повороти на π і π/2 дзеркалять її. Без цього правий повзунок тягнув би ліву
// грань вікна (і навпаки) на двох сторонах світу з чотирьох.
const flipped = (side: Side) => side === 'xmax' || side === 'zmin'

// Наскільки виносимо прозорі накладки за грань стіни. Вікно ДАЛІ за стіну —
// тоді промінь спершу зустрічає вікно, і його можна вибрати; інакше стіна
// перехоплює всі кліки на собі.
const WALL_PICK_OUT = 0.14
const WIN_PICK_OUT = 0.26
const LIMIT_COLOR = '#ffffff' // межі руху вікна
const GUIDE_COLOR = '#2f6fb8' // напрямні від сусідніх вікон

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
    const room = plan.floors[spec.floor]?.rooms.find((r) => r.id === spec.roomId)
    if (!room) return
    const wall = wallOf(room, spec.side)
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
              wall: wallOf(room, side),
            })),
          ),
      ),
    [plan],
  )

  // Межі, у яких дозволено рухати ОБРАНЕ вікно, — показуємо пунктиром.
  const limits = useMemo(() => {
    if (!sel) return null
    const room = plan.floors[sel.floor]?.rooms.find((r) => r.id === sel.roomId)
    if (!room) return null
    const w = wallOf(room, sel.side)
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

          {/* Ручки: 'uStart' завжди тягне ПОЧАТОК вікна вздовж стіни, тож на
              дзеркальних сторонах вона й малюється з іншого боку. */}
          {(['uStart', 'uEnd'] as const).map((mode) => {
            const dir = mode === 'uStart' ? -1 : 1
            const localX = dir * (flipped(sel.side) ? -1 : 1) * (sel.width / 2)
            return (
              <mesh key={mode} position={[localX, 0, 0.08]} onPointerDown={(e) => grab(sel, mode, e)}>
                <boxGeometry args={[WIN_HANDLE, WIN_HANDLE, WIN_HANDLE]} />
                <meshStandardMaterial color={HANDLE_COLOR} emissive={HANDLE_COLOR} emissiveIntensity={0.45} />
              </mesh>
            )
          })}

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
  // Коробка видима на «Вікна», «Форма даху» і «Дах» — на кроці форми зони
  // малюються просто поверх неї.
  const show = stepId === 'windows' || stepId === 'roofZones' || stepId === 'roof'
  const roofStep = stepId === 'roof' // дах видно ЛИШЕ на своєму кроці
  const selectedRoofPart = useConfigurator((s) => s.selectedRoofPart)
  const windowsMode = useConfigurator((s) => s.windowsMode)
  const editWindows = stepId === 'windows' && windowsMode === 'custom'
  const ref = useRef<Group>(null)

  // Отвори = розв'язані специфікації вікон (готові або власні — вирішує стор).
  const openings = useMemo<Opening[]>(
    () => resolveWindows(plan, windows, FLOOR_H).map((w) => ({ ...w, key: w.id })),
    [plan, windows],
  )

  // Стіни: простінки + перемички НАД отворами (простінок під підвіконням — окремо,
  // анімований Spandrel). Верх перемички = FLOOR_H, низ отвору = WIN_TOP.
  const walls = useMemo(() => {
    const boxes: Box[] = []
    plan.floors.forEach((fl, idx) => {
      const baseY = idx * FLOOR_H
      const t = wallT(idx)
      const ops = openings.filter((o) => o.baseY === baseY)
      const rings = wallOutline(fl)
      for (const e of edgesOf(rings)) {
        const eo = ops
          .filter((o) => o.horizontal === e.horizontal && Math.abs(o.line - e.line) < 0.05 && o.a >= e.min - 0.01 && o.b <= e.max + 0.01)
          .sort((a, b) => a.a - b.a)
        // Зовнішня стіна — на ВСЮ висоту поверху (FLOOR_H), щоб закрити край плити
        // перекриття (не було «прожилок»). Знизу заходить у нижній ярус на
        // TIER_LAP і тонша за нього — див. коментар про яруси нагорі файлу.
        let cursor = e.min
        for (const o of eo) {
          if (o.a > cursor) pushBox(boxes, e.horizontal, e.line, cursor, o.a, -TIER_LAP, FLOOR_H, baseY, t)
          pushBox(boxes, e.horizontal, e.line, o.a, o.b, o.top, FLOOR_H, baseY, t)
          cursor = o.b
        }
        pushBox(boxes, e.horizontal, e.line, cursor, e.max, -TIER_LAP, FLOOR_H, baseY, t)
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
    })
    return boxes
  }, [plan, openings])

  // Внутрішні перегородки з коричневими дверима (між РІЗНИМИ кімнатами).
  const partitions = useMemo(() => {
    const wallB: Box[] = []
    const doorB: Box[] = []
    const seen = new Set<string>()
    plan.floors.forEach((fl, idx) => {
      const baseY = idx * FLOOR_H
      fl.rooms.forEach((room) => {
        if (room.type === 'terrace') return
        const b = bounds(room)
        const cand: { side: Side; horizontal: boolean; line: number; a: number; b: number }[] = [
          { side: 'xmax', horizontal: false, line: b.x1, a: b.z0, b: b.z1 },
          { side: 'xmin', horizontal: false, line: b.x0, a: b.z0, b: b.z1 },
          { side: 'zmax', horizontal: true, line: b.z1, a: b.x0, b: b.x1 },
          { side: 'zmin', horizontal: true, line: b.z0, a: b.x0, b: b.x1 },
        ]
        for (const sd of cand) {
          const nb = neighborOf(fl.rooms, room, sd.side, false)
          if (!nb) continue // зовнішня — не перегородка
          if (nb.group && nb.group === room.group) continue // одна кімната (майстер тощо)
          const key = `${idx}-${sd.horizontal ? 'h' : 'v'}-${sd.line.toFixed(2)}-${((sd.a + sd.b) / 2).toFixed(2)}`
          if (seen.has(key)) continue
          seen.add(key)
          const len = sd.b - sd.a
          if (len < IDOOR_W + 0.4) {
            pushBox(wallB, sd.horizontal, sd.line, sd.a, sd.b, 0, WALL_H, baseY, PART_T)
          } else {
            const mid = (sd.a + sd.b) / 2
            const ds = mid - IDOOR_W / 2
            const de = mid + IDOOR_W / 2
            pushBox(wallB, sd.horizontal, sd.line, sd.a, ds, 0, WALL_H, baseY, PART_T)
            pushBox(wallB, sd.horizontal, sd.line, de, sd.b, 0, WALL_H, baseY, PART_T)
            pushBox(wallB, sd.horizontal, sd.line, ds, de, IDOOR_H, WALL_H, baseY, PART_T)
            pushBox(doorB, sd.horizontal, sd.line, ds, de, 0, IDOOR_H, baseY, IDOOR_D)
          }
        }
      })
    })
    return { wallB, doorB }
  }, [plan])

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
      // Паркан ставимо по ВІДКРИТИХ сторонах кожної тераси — тобто там, де за
      // нею немає сусідньої кімнати. Раніше умова була прив'язана до плити з
      // одного прямокутника, тож на ручному плані (плита = самі кімнати) і на
      // терасі 2-го поверху паркан не з'являвся зовсім.
      for (const terrace of fl.rooms.filter((r) => r.type === 'terrace')) {
        const t = bounds(terrace)
        const edges: { side: Side; horizontal: boolean; c: number; a: number; b: number }[] = [
          { side: 'zmin', horizontal: true, c: t.z0, a: t.x0, b: t.x1 },
          { side: 'zmax', horizontal: true, c: t.z1, a: t.x0, b: t.x1 },
          { side: 'xmin', horizontal: false, c: t.x0, a: t.z0, b: t.z1 },
          { side: 'xmax', horizontal: false, c: t.x1, a: t.z0, b: t.z1 },
        ]
        edges.forEach((e) => {
          if (!isExterior(fl.rooms, terrace, e.side)) return // до будинку — без паркану
          const mid = (e.a + e.b) / 2
          // len БЕЗ подовження → панелі не перетинаються (без мерехтіння скла).
          out.push({ baseY, horizontal: e.horizontal, cx: e.horizontal ? mid : e.c, cz: e.horizontal ? e.c : mid, len: e.b - e.a })
        })
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
    const tiers = new Map<number, { partId: string; boxes: Box[] }[]>()
    if (plan.floors.length === 0) return [] as { roofY: number; groups: { partId: string; boxes: Box[] }[] }[]
    for (const part of roof) {
      if (part.kind !== 'flat') continue
      const roofY = (part.level + 1) * FLOOR_H
      const t = part.parapetT
      const pt = t + 0.004
      const boxes: Box[] = []
      const b = bounds(part)
      // Ребра, накриті поверхом ВИЩЕ, парапету не потребують: там уже стоїть
      // зовнішня стіна верхнього поверху, і парапет лише колізив би з нею.
      const upper = plan.floors[part.level + 1]?.slab.map(bounds) ?? []
      const edges: { horizontal: boolean; line: number; min: number; max: number; nx: number; nz: number }[] = [
        { horizontal: true, line: b.z0, min: b.x0, max: b.x1, nx: 0, nz: -1 },
        { horizontal: true, line: b.z1, min: b.x0, max: b.x1, nx: 0, nz: 1 },
        { horizontal: false, line: b.x0, min: b.z0, max: b.z1, nx: -1, nz: 0 },
        { horizontal: false, line: b.x1, min: b.z0, max: b.z1, nx: 1, nz: 0 },
      ]
      for (const e of edges) {
        // Відрізаємо накриті ділянки ребра, а не пропускаємо ребро цілком.
        const cuts = upper
          .filter((u) =>
            e.horizontal
              ? e.line > u.z0 - 0.05 && e.line < u.z1 + 0.05
              : e.line > u.x0 - 0.05 && e.line < u.x1 + 0.05,
          )
          .map((u) =>
            e.horizontal
              ? ([Math.max(u.x0, e.min), Math.min(u.x1, e.max)] as [number, number])
              : ([Math.max(u.z0, e.min), Math.min(u.z1, e.max)] as [number, number]),
          )
          .filter(([p0, p1]) => p1 - p0 > 0.1)
          .sort((p0, p1) => p0[0] - p1[0])
        const spans: [number, number][] = []
        let cur = e.min
        for (const [c0, c1] of cuts) {
          if (c0 > cur + 0.05) spans.push([cur, c0])
          cur = Math.max(cur, c1)
        }
        if (e.max > cur + 0.05) spans.push([cur, e.max])

        // Зовнішня грань парапету — рівно грань СТІНИ, а товщина росте
        // ВСЕРЕДИНУ. Інакше парапет випирає за фасад.
        const line = e.line + (e.nx + e.nz) * (WALL_T / 2 - t / 2)
        for (const [u0, u1] of spans) {
          pushBox(boxes, e.horizontal, line, u0, u1, -TIER_LAP, part.parapetH, roofY, t)
          for (const u of [u0, u1]) {
            boxes.push({
              x: e.horizontal ? u : line,
              y: roofY + (part.parapetH - TIER_LAP) / 2,
              z: e.horizontal ? line : u,
              dx: pt,
              dy: part.parapetH + TIER_LAP,
              dz: pt,
            })
          }
        }
      }
      if (boxes.length === 0) continue
      const list = tiers.get(roofY) ?? []
      list.push({ partId: part.id, boxes })
      tiers.set(roofY, list)
    }
    return [...tiers].map(([roofY, groups]) => ({ roofY, groups }))
  }, [plan, roof])

  // Скатні та односхилі зони: призма над прямокутником зони.
  const gables = useMemo(() => {
    const out: { roofY: number; partId: string; geo: ExtrudeGeometry; x: number; y: number; z: number; rotY: number; wallLike: boolean }[] = []
    if (plan.floors.length === 0) return out
    for (const part of roof) {
      if (part.kind === 'flat') continue
      const roofY = (part.level + 1) * FLOOR_H
      const r = bounds(part)
      const over = 2 * part.overhang
      const w = r.x1 - r.x0 + WALL_T + 0.004 + over
      const d = r.z1 - r.z0 + WALL_T + 0.004 + over
      // 0° — гребінь уздовж довшої сторони, 90° — упоперек.
      const ridgeAlongZ = part.rotation % 180 === 0 ? d >= w : d < w
      const span = ridgeAlongZ ? w : d
      const skirt = ROOF_LIFT + TIER_LAP
      const [pw, pd] = ridgeAlongZ ? [w, d] : [d, w]
      const x = (r.x0 + r.x1) / 2
      const z = (r.z0 + r.z1) / 2
      const y = roofY + ROOF_LIFT
      const mono = part.kind === 'mono'
      const rotY = (ridgeAlongZ ? 0 : Math.PI / 2) + (mono && part.rotation >= 180 ? Math.PI : 0)
      const tan = Math.tan((part.pitch * Math.PI) / 180)
      if (mono) {
        // Односхилий: висота на ПОВНИЙ проліт (схил один, а не два).
        const mh = span * tan
        out.push({ roofY, partId: part.id, geo: monoGeometry(pw, pd, mh, skirt, true), x, y, z, rotY, wallLike: true })
        out.push({ roofY, partId: part.id, geo: monoGeometry(pw, pd, mh, skirt, false), x, y, z, rotY, wallLike: false })
      } else {
        out.push({ roofY, partId: part.id, geo: gableGeometry(pw, pd, (span / 2) * tan, skirt), x, y, z, rotY, wallLike: false })
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

      {walls.map((b, i) => (
        <mesh key={`wall-${i}`} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.dx, b.dy, b.dz]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {openings.map((o) => (
        <Spandrel key={`sp-${o.key}`} horizontal={o.horizontal} line={o.line} a={o.a} b={o.b} baseY={o.baseY} sill={o.sill} />
      ))}

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
      {parapets.map((tier) => (
        <RoofTier key={`flat-${tier.roofY}`} baseY={tier.roofY} open={roofStep}>
          {tier.groups.map((g) =>
            g.boxes.map((b, i) => (
              <mesh key={`parapet-${g.partId}-${i}`} position={[b.x, b.y, b.z]} castShadow receiveShadow>
                <boxGeometry args={[b.dx, b.dy, b.dz]} />
                {/* Обрана частина даху світиться ЦІЛКОМ, а не лише площиною */}
                <meshStandardMaterial
                  color={WALL_COLOR}
                  roughness={0.9}
                  emissive={HANDLE_COLOR}
                  emissiveIntensity={g.partId === selectedRoofPart ? 0.35 : 0}
                />
              </mesh>
            )),
          )}
        </RoofTier>
      ))}

      {gableTiers.map((tier) => (
        <RoofTier key={`pitched-${tier.roofY}`} baseY={tier.roofY} open={roofStep}>
          {tier.items.map((g, i) => (
            <mesh key={`gable-${i}`} geometry={g.geo} position={[g.x, g.y, g.z]} rotation-y={g.rotY} castShadow receiveShadow>
              {/* wallLike — це клин під похилою плитою: продовження СТІНИ, тож
                  і колір стінний, а не покрівельний. */}
              <meshStandardMaterial
                color={g.wallLike ? WALL_COLOR : ROOF_COLOR}
                roughness={0.75}
                emissive={HANDLE_COLOR}
                emissiveIntensity={g.partId === selectedRoofPart ? 0.35 : 0}
              />
            </mesh>
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

      {fences.map((f, i) => (
        <group key={`fence-${i}`}>
          <mesh position={[f.cx, f.baseY + FENCE_H / 2, f.cz]}>
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
          <mesh position={[f.cx, f.baseY + FENCE_H + RAIL_H / 2, f.cz]}>
            <boxGeometry args={f.horizontal ? [f.len + RAIL_W, RAIL_H, RAIL_W] : [RAIL_W, RAIL_H, f.len + RAIL_W]} />
            <meshStandardMaterial {...frameMat} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
