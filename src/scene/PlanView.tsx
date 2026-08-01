import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { easing } from 'maath'
import { BufferGeometry, Float32BufferAttribute, type Mesh, type MeshStandardMaterial } from 'three'
import { unionOutline } from '../lib/outline'
import { useConfigurator, useHousePlan } from '../state/store'
import { STEPS } from '../config/steps'
import { FOUNDATION_H, ROOM_COLORS } from '../config/plan'
import type { FloorPlan, PlanRect, RoomType, RoomZone } from '../config/types'
import { GRID, MIN_SIDE, junctionsOf, snap, toggleJoin, updateRoom, type Junction } from '../lib/editPlan'
import { badRooms, validatePlan, type PlanIssue } from '../lib/validatePlan'
import { t } from '../locales'

const GAP = 0.08 // зазор між РІЗНИМИ кімнатами
const HANDLE_COLOR = '#d9622b' // теракота — ручки мають чітко читатись на зонах
const ISSUE_COLOR = '#e03131' // місце помилки планування
const EPS = 0.01
// ---- Правила анімації (діють для ВСІХ кімнат — теперішніх і майбутніх) ----
// Рух і зміна розміру завжди ПЛАВНІ (нічого не «перескакує»): позицією та
// масштабом володіє лише useFrame, а НЕ реактивні пропси three.js — інакше
// three.js миттєво «клацає» об'єкт у нову позицію й перебиває анімацію.
//
// ДОДАВАННЯ: спершу плавно росте фундамент і наявні кімнати стають на місце,
//            і лише потім (ENTER_DELAY) з'являється нове приміщення.
// ВИДАЛЕННЯ: спершу плавно зникає зайве приміщення й зменшуються ті, що мають
//            зменшитись, і лише потім (SLAB_SHRINK_DELAY) стискається фундамент.
// Так два процеси розділені в часі й ніколи не перетинаються.
const ROOM_EASE = 0.45 // плавний рух / зміна розміру кімнати
const SLAB_EASE = 0.45 // плавний ріст / стискання фундаменту
const ENTER_DELAY = 0.35 // нове приміщення чекає, поки виросте фундамент
const EXIT_EASE = 0.4 // приміщення, що зникає, плавно «здувається»
const SLAB_SHRINK_DELAY = 0.45 // фундамент стискається лише коли кімнати вже прибрані
// «Ліниве розтягування» (коридор): рости повільніше / стягуватись швидше, щоб
// відставати від сусіда, який рухається (майстер), і не колізити з ним.
const LAZY_GROW_EASE = 0.75 // повільне розтягування
const LAZY_SHRINK_EASE = 0.28 // швидке стягування

// ---- 3D-стос поверхів ----
const FLOOR_H = 3.0 // висота поверху: на скільки 2-й поверх підіймається над 1-м
const INACTIVE_OPACITY = 0.2 // прозорість неактивного (не редагованого) поверху
const OPACITY_EASE = 0.2 // плавна (і швидша) зміна прозорості при перемиканні поверху

// Плавно веде прозорість матеріалу до цілі. transparent перемикаємо ІМПЕРАТИВНО з
// needsUpdate (three.js не застосовує зміну transparent через реактивний проп),
// інакше неактивний поверх не стає прозорим. Активний (opacity≈1) → непрозорий
// (без мерехтіння); неактивний → прозорий привид без depthWrite.
function fadeMaterial(mat: MeshStandardMaterial, active: boolean, dt: number) {
  easing.damp(mat, 'opacity', active ? 1 : INACTIVE_OPACITY, OPACITY_EASE, dt)
  const opaque = mat.opacity > 0.98
  if (mat.transparent === opaque) {
    mat.transparent = !opaque
    mat.depthWrite = opaque
    mat.needsUpdate = true
  }
}

function box(r: RoomZone) {
  return { x0: r.x - r.width / 2, x1: r.x + r.width / 2, z0: r.z - r.depth / 2, z1: r.z + r.depth / 2 }
}
const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0) > EPS

// Чи є сусід тієї ж групи через задану сторону (тоді шва між ними немає)
function hasNeighbor(rooms: RoomZone[], i: number, side: 'left' | 'right' | 'front' | 'back'): boolean {
  const a = box(rooms[i])
  const g = rooms[i].group
  if (!g) return false
  return rooms.some((r, j) => {
    if (j === i || r.group !== g) return false
    const c = box(r)
    if (side === 'left') return Math.abs(c.x1 - a.x0) < EPS && overlap(a.z0, a.z1, c.z0, c.z1)
    if (side === 'right') return Math.abs(c.x0 - a.x1) < EPS && overlap(a.z0, a.z1, c.z0, c.z1)
    if (side === 'front') return Math.abs(c.z1 - a.z0) < EPS && overlap(a.x0, a.x1, c.x0, c.x1)
    return Math.abs(c.z0 - a.z1) < EPS && overlap(a.x0, a.x1, c.x0, c.x1)
  })
}

// Опис зони для рендера. key — СТАБІЛЬНИЙ id кімнати (роль, а не порядок),
// тому кімната, яка вже була, не перемонтовується й не переанімовується.
interface Item {
  key: string // стабільний id кімнати = ключ анімації
  hoverId: string // спільний для частин одного приміщення; інакше унікальний
  type: RoomType
  color: string
  area: number
  w: number
  d: number
  cx: number
  cz: number
  anchorZ?: 'min' | 'max' // фіксована грань під час появи/зникнення (замість центру)
  lazyStretch?: boolean // рости повільніше / стягуватись швидше (відставати від сусіда)
  growEase?: number // власний (повільніший) час згладжування лише для росту/появи
  exiting: boolean
  instant?: boolean // її зараз тягнуть мишею — ставити ціль без згладжування
}

// ---- Ручний режим: перетягування та зміна розмірів зон ----

type DragMode = 'move' | 'xmin' | 'xmax' | 'zmin' | 'zmax'

interface Drag {
  id: string
  mode: DragMode
  px: number // точка захоплення на площині плану
  pz: number
  rect: PlanRect // прямокутник кімнати на момент захоплення
}

// Новий прямокутник за зсувом курсора. Для граней рухаємо ЛИШЕ ту грань,
// протилежна лишається на місці (інакше кімната «їхала» б при розтягуванні).
function dragRect(drag: Drag, x: number, z: number): PlanRect {
  const r = drag.rect
  const dx = x - drag.px
  const dz = z - drag.pz
  if (drag.mode === 'move') return { ...r, x: r.x + dx, z: r.z + dz }
  const x0 = r.x - r.width / 2
  const x1 = r.x + r.width / 2
  const z0 = r.z - r.depth / 2
  const z1 = r.z + r.depth / 2
  if (drag.mode === 'xmin') {
    const nx0 = Math.min(snap(x0 + dx), x1 - MIN_SIDE)
    return { ...r, x: (nx0 + x1) / 2, width: x1 - nx0 }
  }
  if (drag.mode === 'xmax') {
    const nx1 = Math.max(snap(x1 + dx), x0 + MIN_SIDE)
    return { ...r, x: (x0 + nx1) / 2, width: nx1 - x0 }
  }
  if (drag.mode === 'zmin') {
    const nz0 = Math.min(snap(z0 + dz), z1 - MIN_SIDE)
    return { ...r, z: (nz0 + z1) / 2, depth: z1 - nz0 }
  }
  const nz1 = Math.max(snap(z1 + dz), z0 + MIN_SIDE)
  return { ...r, z: (z0 + nz1) / 2, depth: nz1 - z0 }
}

// Сітка прив'язки під планом. Крок = GRID, тож усе, що видно, збігається з
// тим, куди кімнати реально «клацають».
function SnapGrid() {
  const grid = useMemo(() => {
    const half = 16
    const pts: number[] = []
    for (let v = -half; v <= half + EPS; v += GRID) {
      pts.push(-half, 0, v, half, 0, v, v, 0, -half, v, 0, half)
    }
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return geo
  }, [])
  return (
    <lineSegments geometry={grid} position={[0, 0.02, 0]}>
      <lineBasicMaterial color="#5c6b52" transparent opacity={0.18} depthWrite={false} />
    </lineSegments>
  )
}

// Контур поверху НИЖЧЕ — щоб на 2-му було видно, куди можна ставити кімнати.
function FootprintHint({ rooms }: { rooms: RoomZone[] }) {
  const geo = useMemo(() => {
    const pts: number[] = []
    for (const { pts: ring } of unionOutline(rooms)) {
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i]
        const [x1, z1] = ring[(i + 1) % ring.length]
        pts.push(x0, 0, z0, x1, 0, z1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [rooms])
  return (
    <lineSegments geometry={geo} position={[0, 0.05, 0]}>
      <lineBasicMaterial color="#2f6fb8" transparent opacity={0.75} depthWrite={false} />
    </lineSegments>
  )
}

// Підписи довжин на гранях обраної кімнати. Показуємо лише дві (протилежні
// рівні), щоб не захаращувати план.
function SizeLabels({ rect }: { rect: PlanRect }) {
  const off = 0.55
  return (
    <>
      {[
        { key: 'w', value: rect.width, x: rect.x, z: rect.z - rect.depth / 2 - off },
        { key: 'd', value: rect.depth, x: rect.x + rect.width / 2 + off, z: rect.z },
      ].map((l) => (
        <Html key={l.key} position={[l.x, 0.4, l.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <span className="plan-size">{t.plan.meters(l.value)}</span>
        </Html>
      ))}
    </>
  )
}

// Проблемне місце: червона заливка + червоний контур. Малюємо саме МІСЦЕ
// (перетин або щілину), а не всю кімнату — видно, де саме помилка.
function IssueMark({ rect }: { rect: PlanRect }) {
  const ring = useMemo(() => {
    const x0 = rect.x - rect.width / 2
    const x1 = rect.x + rect.width / 2
    const z0 = rect.z - rect.depth / 2
    const z1 = rect.z + rect.depth / 2
    const pts = [x0, 0, z0, x1, 0, z0, x1, 0, z0, x1, 0, z1, x1, 0, z1, x0, 0, z1, x0, 0, z1, x0, 0, z0]
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [rect])
  return (
    <>
      <mesh position={[rect.x, 0.3, rect.z]}>
        <boxGeometry args={[Math.max(rect.width, 0.12), 0.16, Math.max(rect.depth, 0.12)]} />
        <meshStandardMaterial color={ISSUE_COLOR} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <lineSegments geometry={ring} position={[0, 0.39, 0]}>
        <lineBasicMaterial color={ISSUE_COLOR} depthWrite={false} />
      </lineSegments>
    </>
  )
}

// Кнопки на стиках обраної кімнати: об'єднати сусідні прямокутники в одне
// приміщення складної форми (без стіни між ними) або роз'єднати назад.
function JoinButtons({
  junctions,
  rect,
  onToggle,
}: {
  junctions: Junction[]
  rect: PlanRect // обрана кімната — щоб знати, де стоять повзунки
  onToggle: (otherId: string) => void
}) {
  // Повзунки сидять на серединах граней, і кнопка стику часто падає рівно на
  // них. Якщо збіглись — відсуваємо кнопку вздовж того самого ребра і трохи
  // піднімаємо, щоб вона не перехоплювала натискання на повзунок.
  const handles = [
    [rect.x - rect.width / 2, rect.z],
    [rect.x + rect.width / 2, rect.z],
    [rect.x, rect.z - rect.depth / 2],
    [rect.x, rect.z + rect.depth / 2],
  ]
  const place = (j: Junction): [number, number, number] => {
    const clash = handles.some(([hx, hz]) => Math.hypot(j.x - hx, j.z - hz) < 0.5)
    if (!clash) return [j.x, 0.42, j.z]
    const shift = 0.9
    return j.alongX ? [j.x + shift, 0.75, j.z] : [j.x, 0.75, j.z + shift]
  }
  return (
    <>
      {junctions.map((j) => (
        <Html key={j.otherId} position={place(j)} center zIndexRange={[20, 0]}>
          <button
            type="button"
            className={`plan-join${j.joined ? ' plan-join--on' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggle(j.otherId)}
            title={j.joined ? t.steps.rooms.editor.split : t.steps.rooms.editor.join}
          >
            {j.joined ? '×' : '+'}
          </button>
        </Html>
      ))}
    </>
  )
}

// Ручки на серединах граней обраної кімнати. Тягнеш ручку — рухається та грань.
function Handles({
  rect,
  onGrab,
}: {
  rect: PlanRect
  onGrab: (mode: DragMode, e: ThreeEvent<PointerEvent>) => void
}) {
  const s = 0.45
  const spots: { mode: DragMode; x: number; z: number }[] = [
    { mode: 'xmin', x: rect.x - rect.width / 2, z: rect.z },
    { mode: 'xmax', x: rect.x + rect.width / 2, z: rect.z },
    { mode: 'zmin', x: rect.x, z: rect.z - rect.depth / 2 },
    { mode: 'zmax', x: rect.x, z: rect.z + rect.depth / 2 },
  ]
  return (
    <>
      {spots.map((sp) => (
        <mesh
          key={sp.mode}
          position={[sp.x, 0.34, sp.z]}
          onPointerDown={(e) => onGrab(sp.mode, e)}
        >
          <boxGeometry args={[s, 0.12, s]} />
          <meshStandardMaterial color={HANDLE_COLOR} emissive={HANDLE_COLOR} emissiveIntensity={0.45} roughness={0.4} />
        </mesh>
      ))}
    </>
  )
}

// Невидима площина, що ловить рух курсора під час перетягування: рахувати
// координати по самій кімнаті не можна — вона їде з-під курсора.
function DragPlane({
  onMove,
  onDrop,
}: {
  onMove: (x: number, z: number) => void
  onDrop: () => void
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.2, 0]}
      onPointerMove={(e) => {
        e.stopPropagation()
        onMove(e.point.x, e.point.z)
      }}
      onPointerUp={onDrop}
      onPointerLeave={onDrop}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// ---- Плита фундаменту: плавно росте/змінює розмір ----
// delay > 0 (при видаленні) — плита витримує паузу, поки кімнати зникнуть/
// зменшаться, і лише потім стискається. При додаванні delay=0 → росте одразу.
function SlabMesh({
  w,
  d,
  cx,
  cz,
  delay,
  active,
  show,
}: {
  w: number
  d: number
  cx: number
  cz: number
  delay: number
  active: boolean
  show: boolean
}) {
  const ref = useRef<Mesh>(null)
  const mat = useRef<MeshStandardMaterial>(null)
  const wait = useRef(0)
  // початкову позицію фіксуємо один раз (стабільний проп) — далі нею володіє
  // лише useFrame, тому плита ніколи не «перескакує».
  const [init] = useState(() => ({ cx, cz }))
  useEffect(() => {
    wait.current = delay
  }, [w, d, cx, cz, delay])
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    if (mat.current) fadeMaterial(mat.current, active, dt)
    if (wait.current > 0) {
      wait.current -= dt
      return // тримаємо старий розмір/позицію, поки кімнати не заберуться
    }
    easing.damp3(m.scale, [w, 0.1, d], SLAB_EASE, dt)
    easing.damp3(m.position, [cx, 0.05, cz], SLAB_EASE, dt)
  })
  return (
    // Плиту показуємо лише коли НЕ на кроці «кімнати» (show): на кроці форми вона
    // = основа плану (щоб не було пусто); на кроці кімнат її ховаємо, бо там
    // майже-біла плита давала білі полотна при перемиканні поверхів (контур там
    // задають самі зони кімнат).
    <mesh ref={ref} visible={show} scale={[0.001, 0.1, 0.001]} position={[init.cx, 0.05, init.cz]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial ref={mat} color="#faf7f0" roughness={0.7} transparent opacity={1} />
    </mesh>
  )
}

// ---- Зона кімнати: плавна поява/зникнення/зміна розміру ----
function ZoneMesh({
  item,
  hovered,
  chosen,
  active,
  onExited,
  onOver,
  onMove,
  onOut,
  onDown,
}: {
  item: Item
  hovered: boolean
  chosen: boolean // обрана для редагування — тримаємо підсвітку постійно
  active: boolean
  onExited: () => void
  onOver: (e: ThreeEvent<PointerEvent>) => void
  onMove: (e: ThreeEvent<PointerEvent>) => void
  onOut: (e: ThreeEvent<PointerEvent>) => void
  onDown?: (e: ThreeEvent<PointerEvent>) => void
}) {
  const ref = useRef<Mesh>(null)
  const mat = useRef<MeshStandardMaterial>(null)
  // Вік меша в секундах. Нова кімната = новий стабільний ключ = новий меш,
  // тож її age стартує з 0 і вона витримує ENTER_DELAY. Кімната, що вже була,
  // зберігає той самий ключ/меш → великий age → росте/рухається без паузи.
  const age = useRef(0)
  // Початкову позицію фіксуємо один раз (стабільний проп) — далі позицією
  // володіє лише useFrame, тому кімната плавно їде, а не «перескакує».
  const [init] = useState(() => ({ cx: item.cx, cz: item.cz }))
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    age.current += dt
    // Поки не мине ENTER_DELAY — тримаємо кімнату «згорнутою», щоб фундамент
    // ліг першим, а план встиг стати на місце без накладань.
    const ready = age.current >= ENTER_DELAY
    const grown = !item.exiting && ready
    const tx = grown ? item.w : 0.001
    const tz = grown ? item.d : 0.001
    // Швидкість переходу. Ріст (tz зростає) можна вповільнити власним growEase,
    // щоб коробка відставала від сусіда й довше не колізила. Для «лінивих» кімнат
    // (коридор) — ще й швидке стягування. Зменшення — звичайне (ROOM_EASE).
    const growing = tz > m.scale.z
    const ease = item.exiting
      ? EXIT_EASE
      : item.lazyStretch
        ? growing
          ? item.growEase ?? LAZY_GROW_EASE
          : LAZY_SHRINK_EASE
        : growing && item.growEase != null
          ? item.growEase
          : ROOM_EASE
    const y = hovered || chosen ? 0.26 : 0.18
    if (item.instant) {
      // Ручне перетягування — БЕЗ згладжування: кімната має йти рівно за
      // курсором. Позицією й масштабом і далі володіє ЛИШЕ useFrame
      // (правило №1), просто ціль ставиться миттєво.
      m.scale.set(item.w, 0.14, item.d)
      m.position.set(item.cx, y, item.cz)
    } else {
      easing.damp3(m.scale, [tx, 0.14, tz], ease, dt)
      // За замовчуванням позиція = центр. Якщо задано anchorZ — фіксуємо цю грань
      // по Z, тому коробка росте/зникає ВІД грані (не з центру) і не залазить на сусіда.
      const posZ =
        item.anchorZ === 'min'
          ? item.cz - item.d / 2 + m.scale.z / 2
          : item.anchorZ === 'max'
            ? item.cz + item.d / 2 - m.scale.z / 2
            : item.cz
      // Горизонтальний рух (X) — ЗАВЖДИ синхронно з іншими кімнатами (ROOM_EASE),
      // навіть для «лінивого» коридору. Лише рух/розтягування вперед-назад (Z)
      // зберігає ліниву швидкість (щоб коридор не наздоганяв майстер).
      easing.damp(m.position, 'x', item.cx, ROOM_EASE, dt)
      easing.damp(m.position, 'y', y, ROOM_EASE, dt)
      easing.damp(m.position, 'z', posZ, ROOM_EASE, dt)
    }
    if (mat.current) {
      // Підсвітку показуємо лише на активному поверсі. На неактивному гасимо
      // МИТТЄВО (без easing-хвоста): інакше при перемиканні поверхів білий
      // спалах ще ~0.2 с «доганяє» нуль, поки зона стає прозорим привидом.
      if (active) {
        easing.damp(mat.current, 'emissiveIntensity', chosen ? 0.5 : hovered ? 0.28 : 0, 0.2, dt)
      } else {
        mat.current.emissiveIntensity = 0
      }
      fadeMaterial(mat.current, active, dt)
    }
    if (item.exiting && m.scale.x < 0.03) onExited()
  })
  return (
    <mesh
      ref={ref}
      scale={[0.001, 0.14, 0.001]}
      position={[init.cx, 0.18, init.cz]}
      onPointerOver={active ? onOver : undefined}
      onPointerMove={active ? onMove : undefined}
      onPointerOut={active ? onOut : undefined}
      onPointerDown={onDown}
    >
      <boxGeometry args={[1, 1, 1]} />
      {/* Прозорість — імперативно через fadeMaterial (активний непрозорий, без
          мерехтіння; неактивний — прозорий привид). Хендлери лише в активного. */}
      <meshStandardMaterial
        ref={mat}
        color={item.color}
        roughness={0.55}
        emissive="#ffffff"
        emissiveIntensity={0}
        transparent
        opacity={1}
      />
    </mesh>
  )
}

// ---- Один поверх: плита + анімовані зони кімнат ----
// active=true → редагований поверх (непрозорий, клікабельний); false → «привид»
// над/під ним (прозорий, не перехоплює ховер/клік).
function PlanFloor({
  floor,
  floorIdx,
  below,
  issues,
  showZones,
  showSlab,
  yOffset,
  active,
  editable,
}: {
  floor: FloorPlan
  floorIdx: number
  below?: FloorPlan // поверх під цим — його контур підказує межі
  issues: PlanIssue[] // помилки ВСЬОГО плану (фільтруємо всередині — див. нижче)
  showZones: boolean
  showSlab: boolean
  yOffset: number
  active: boolean
  editable: boolean
}) {
  const setHovered = useConfigurator((s) => s.setHovered)
  const plan = useHousePlan()
  const setCustomPlan = useConfigurator((s) => s.setCustomPlan)
  const selectedRoom = useConfigurator((s) => s.selectedRoom)
  const setSelectedRoom = useConfigurator((s) => s.setSelectedRoom)
  const setDragging = useConfigurator((s) => s.setDragging)
  const showGrid = useConfigurator((s) => s.showGrid)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [drag, setDrag] = useState<Drag | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)

  const selected = editable ? floor.rooms.find((r) => r.id === selectedRoom) : undefined
  // ВАЖЛИВО: фільтруємо всередині, а не в батька. Якщо передати сюди
  // issues.filter(...), це щоразу НОВИЙ масив → новий bad → новий target →
  // useEffect зі setItems → рендер → знову новий масив. Саме цей цикл і
  // «трусив» камеру, поки увімкнений ручний режим.
  const floorIssues = useMemo(() => issues.filter((it) => it.floor === floorIdx), [issues, floorIdx])
  const bad = useMemo(() => badRooms(floorIssues, floorIdx), [floorIssues, floorIdx])
  const junctions = useMemo(
    () => (selected?.id ? junctionsOf(floor.rooms, selected.id) : []),
    [floor.rooms, selected?.id],
  )

  const endDrag = () => {
    setDrag(null)
    setDragging(false)
  }

  // Кнопку могли відпустити поза полотном — інакше зона «прилипла» б до курсора.
  useEffect(() => {
    if (!drag) return
    const up = () => endDrag()
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [drag])

  // Esc знімає вибір зони
  useEffect(() => {
    if (!editable || !active) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedRoom(null)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editable, active, setSelectedRoom])

  const grab = (id: string, mode: DragMode, e: ThreeEvent<PointerEvent>) => {
    const room = floor.rooms.find((r) => r.id === id)
    if (!room) return
    e.stopPropagation()
    setSelectedRoom(id)
    setHovered(null)
    setDragging(true)
    setDrag({
      id,
      mode,
      px: e.point.x,
      pz: e.point.z,
      rect: { x: room.x, z: room.z, width: room.width, depth: room.depth },
    })
  }

  const moveDrag = (x: number, z: number) => {
    if (!drag) return
    setCustomPlan(updateRoom(plan, floorIdx, drag.id, dragRect(drag, x, z)))
  }

  // Коли поверх стає неактивним — скидаємо підсвітку (щоб не «застрягала»)
  useEffect(() => {
    if (!active) setHoverKey(null)
  }, [active])

  // Напрям зміни фундаменту: якщо площа плити меншає — це видалення, тож плита
  // чекає (SLAB_SHRINK_DELAY), поки кімнати заберуться. Якщо росте — delay=0.
  const slabArea = floor.slab.reduce((s, r) => s + r.width * r.depth, 0)
  const prevSlabArea = useRef(slabArea)
  const slabDelay = slabArea < prevSlabArea.current - EPS ? SLAB_SHRINK_DELAY : 0
  useEffect(() => {
    prevSlabArea.current = slabArea
  }, [slabArea])

  // Цільовий набір зон зі стабільними ключами (id ролі кімнати)
  const target = useMemo<Item[]>(() => {
    if (!showZones) return []
    const counts = new Map<string, number>() // лише для запасного id
    return floor.rooms.map((room, i) => {
      const l = hasNeighbor(floor.rooms, i, 'left') ? 0 : GAP / 2
      const r = hasNeighbor(floor.rooms, i, 'right') ? 0 : GAP / 2
      const f = hasNeighbor(floor.rooms, i, 'front') ? 0 : GAP / 2
      const bk = hasNeighbor(floor.rooms, i, 'back') ? 0 : GAP / 2
      const fallback = room.group ?? room.type
      const n = counts.get(fallback) ?? 0
      counts.set(fallback, n + 1)
      const id = room.id ?? `${fallback}#${n}`
      const hoverId = room.group ?? id
      const area = room.group
        ? floor.rooms.filter((r2) => r2.group === room.group).reduce((s, r2) => s + r2.width * r2.depth, 0)
        : room.width * room.depth
      return {
        key: id,
        hoverId,
        type: room.type,
        // Кімната, замішана в помилці, стає червоною — щоб було видно й здалеку.
        color: bad.has(id) ? ISSUE_COLOR : ROOM_COLORS[room.type],
        area: Math.round(area),
        w: Math.max(room.width - l - r, 0.15),
        d: Math.max(room.depth - f - bk, 0.15),
        cx: room.x + (l - r) / 2,
        cz: room.z + (f - bk) / 2,
        anchorZ: room.anchorZ,
        lazyStretch: room.lazyStretch,
        growEase: room.growEase,
        exiting: false,
      }
    })
  }, [floor, showZones, bad])

  const signature = useMemo(
    () => target.map((i) => `${i.key}:${i.w.toFixed(2)},${i.d.toFixed(2)},${i.cx.toFixed(2)},${i.cz.toFixed(2)},${i.color}`).join('|'),
    [target],
  )

  // Звірка: нові зони з'являються, зайві позначаються exiting (плавно зникають)
  useEffect(() => {
    setItems((prev) => {
      const tmap = new Map(target.map((t2) => [t2.key, t2]))
      const result = target.map((t2) => ({ ...t2, exiting: false }))
      for (const p of prev) if (!tmap.has(p.key)) result.push({ ...p, exiting: true })
      return result
    })
  }, [signature, target])

  const removeKey = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key))

  return (
    <group position={[0, yOffset, 0]}>
      {/* Сітка прив'язки + контур нижнього поверху — лише коли редагуємо цей поверх */}
      {editable && active && showGrid && <SnapGrid />}
      {editable && active && below && <FootprintHint rooms={below.rooms} />}

      {/* Клік по пустому місцю знімає вибір. Поріг у 4 px — щоб обертання
          камери (теж починається з натискання) вибір не скидало. */}
      {editable && active && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.01, 0]}
          onPointerDown={(e) => {
            downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
          }}
          onPointerUp={(e) => {
            const d = downAt.current
            downAt.current = null
            if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 4) {
              setSelectedRoom(null)
            }
          }}
        >
          <planeGeometry args={[80, 80]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}

      {/* Фундамент (плита) — на кроці «форма» тощо. На «кімнати» контур задають
          зони, на «вікна» — 3D-оболонка (HouseShell), тож там плиту ховаємо. */}
      {floor.slab.map((r, i) => (
        <SlabMesh key={`slab-${i}`} w={r.width} d={r.depth} cx={r.x} cz={r.z} delay={slabDelay} active={active} show={showSlab} />
      ))}

      {/* Зони кімнат */}
      {items.map((item) => {
        const showTip = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHovered({ name: t.plan.roomNames[item.type], area: item.area, mx: e.nativeEvent.clientX, my: e.nativeEvent.clientY })
        }
        const dragging = drag?.id === item.key
        return (
          <ZoneMesh
            key={item.key}
            item={dragging ? { ...item, instant: true } : item}
            active={active}
            chosen={editable && item.key === selectedRoom}
            hovered={hoverKey === item.hoverId && !item.exiting}
            onExited={() => removeKey(item.key)}
            onDown={editable && active && !item.exiting ? (e) => grab(item.key, 'move', e) : undefined}
            onOver={(e) => {
              if (item.exiting || drag) return
              setHoverKey(item.hoverId)
              showTip(e)
            }}
            onMove={(e) => {
              if (item.exiting || drag) return
              showTip(e)
            }}
            onOut={(e) => {
              e.stopPropagation()
              setHoverKey((cur) => (cur === item.hoverId ? null : cur))
              setHovered(null)
            }}
          />
        )
      })}

      {/* Ручки та розміри обраної кімнати + ловець руху курсора при перетягуванні */}
      {editable && active && selected && (
        <>
          <Handles
            rect={{ x: selected.x, z: selected.z, width: selected.width, depth: selected.depth }}
            onGrab={(mode, e) => grab(selected.id!, mode, e)}
          />
          <SizeLabels rect={{ x: selected.x, z: selected.z, width: selected.width, depth: selected.depth }} />
          <JoinButtons
            junctions={junctions}
            rect={{ x: selected.x, z: selected.z, width: selected.width, depth: selected.depth }}
            onToggle={(otherId) => setCustomPlan(toggleJoin(plan, floorIdx, selected.id!, otherId))}
          />
        </>
      )}

      {/* Місця помилок планування */}
      {editable && active && floorIssues.map((it, i) => <IssueMark key={`issue-${i}`} rect={it.rect} />)}
      {drag && <DragPlane onMove={moveDrag} onDrop={endDrag} />}
    </group>
  )
}

export default function PlanView() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const hideFloor2 = useConfigurator((s) => s.hideFloor2)
  const planMode = useConfigurator((s) => s.planMode)

  const plan = useHousePlan()
  const stepId = STEPS[currentStep].id
  const showZones = stepId === 'rooms'
  // Тягати зони можна лише там, де їх видно, і лише у ручному режимі.
  const editable = showZones && planMode === 'custom'
  const issues = useMemo(() => (editable ? validatePlan(plan) : []), [editable, plan])
  // Плита — ЛИШЕ на кроці формотворення. Далі основу дає 3D-оболонка
  // HouseShell, а біла площина за обрисом поверху лізе крізь неї артефактом.
  // Перелічувати кроки-винятки не можна: кожен новий крок знову «вмикав» плиту.
  const showSlab = stepId === 'shape'

  if (plan.floors.length === 0) return null

  return (
    <group>
      {plan.floors.map((fl, idx) => {
        const floorNum = idx + 1
        // 2-й поверх можна сховати галочкою — але не тоді, коли його ж редагуємо
        if (floorNum === 2 && hideFloor2 && viewFloor !== 2) return null
        const active = plan.floors.length === 1 || viewFloor === floorNum
        return (
          <PlanFloor
            key={floorNum}
            floor={fl}
            floorIdx={idx}
            below={idx > 0 ? plan.floors[idx - 1] : undefined}
            issues={issues}
            editable={editable}
            showZones={showZones}
            showSlab={showSlab}
            // Земля опустилась на цоколь — зміщуємо весь план на стільки ж,
            // щоб вид зверху лишився таким самим відносно газону.
            yOffset={(floorNum - 1) * FLOOR_H - FOUNDATION_H}
            active={active}
          />
        )
      })}
    </group>
  )
}
