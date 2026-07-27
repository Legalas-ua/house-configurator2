import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { easing } from 'maath'
import type { Mesh, MeshStandardMaterial } from 'three'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { ROOM_COLORS } from '../config/plan'
import type { FloorPlan, RoomType, RoomZone } from '../config/types'
import { generateHousePlan } from '../lib/floorplan'
import { t } from '../locales'

const GAP = 0.08 // зазор між РІЗНИМИ кімнатами
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
  exiting: boolean
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
}: {
  w: number
  d: number
  cx: number
  cz: number
  delay: number
  active: boolean
}) {
  const ref = useRef<Mesh>(null)
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
    if (wait.current > 0) {
      wait.current -= dt
      return // тримаємо старий розмір/позицію, поки кімнати не заберуться
    }
    easing.damp3(m.scale, [w, 0.1, d], SLAB_EASE, dt)
    easing.damp3(m.position, [cx, 0.05, cz], SLAB_EASE, dt)
  })
  return (
    <mesh ref={ref} scale={[0.001, 0.1, 0.001]} position={[init.cx, 0.05, init.cz]}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Активний поверх непрозорий; неактивний — прозорий привид без depthWrite. Без тіней. */}
      <meshStandardMaterial
        color="#faf7f0"
        roughness={0.7}
        transparent={!active}
        opacity={active ? 1 : INACTIVE_OPACITY}
        depthWrite={active}
      />
    </mesh>
  )
}

// ---- Зона кімнати: плавна поява/зникнення/зміна розміру ----
function ZoneMesh({
  item,
  hovered,
  active,
  onExited,
  onOver,
  onMove,
  onOut,
}: {
  item: Item
  hovered: boolean
  active: boolean
  onExited: () => void
  onOver: (e: ThreeEvent<PointerEvent>) => void
  onMove: (e: ThreeEvent<PointerEvent>) => void
  onOut: (e: ThreeEvent<PointerEvent>) => void
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
    // Швидкість переходу. Для «лінивих» кімнат (коридор): розтягуватись
    // повільніше, стягуватись швидше — щоб відставати від сусіда й не колізити.
    const ease = item.exiting
      ? EXIT_EASE
      : item.lazyStretch
        ? tz > m.scale.z
          ? LAZY_GROW_EASE
          : LAZY_SHRINK_EASE
        : ROOM_EASE
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
    easing.damp(m.position, 'y', hovered ? 0.26 : 0.18, ROOM_EASE, dt)
    easing.damp(m.position, 'z', posZ, ROOM_EASE, dt)
    if (mat.current) easing.damp(mat.current, 'emissiveIntensity', hovered ? 0.28 : 0, 0.2, dt)
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
    >
      <boxGeometry args={[1, 1, 1]} />
      {/* Активний поверх — НЕПРОЗОРИЙ (без мерехтіння при обертанні). Неактивний
          — прозорий «привид» без depthWrite (не перефарбовує сусідів). Без тіней.
          Хендлери лише в активного → неактивний не бере ховер/клік і не блокує. */}
      <meshStandardMaterial
        ref={mat}
        color={item.color}
        roughness={0.55}
        emissive="#ffffff"
        emissiveIntensity={0}
        transparent={!active}
        opacity={active ? 1 : INACTIVE_OPACITY}
        depthWrite={active}
      />
    </mesh>
  )
}

// ---- Один поверх: плита + анімовані зони кімнат ----
// active=true → редагований поверх (непрозорий, клікабельний); false → «привид»
// над/під ним (прозорий, не перехоплює ховер/клік).
function PlanFloor({
  floor,
  showZones,
  yOffset,
  active,
}: {
  floor: FloorPlan
  showZones: boolean
  yOffset: number
  active: boolean
}) {
  const setHovered = useConfigurator((s) => s.setHovered)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [items, setItems] = useState<Item[]>([])

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
        color: ROOM_COLORS[room.type],
        area: Math.round(area),
        w: Math.max(room.width - l - r, 0.15),
        d: Math.max(room.depth - f - bk, 0.15),
        cx: room.x + (l - r) / 2,
        cz: room.z + (f - bk) / 2,
        anchorZ: room.anchorZ,
        lazyStretch: room.lazyStretch,
        exiting: false,
      }
    })
  }, [floor, showZones])

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
      {/* Фундамент (плита) */}
      {floor.slab.map((r, i) => (
        <SlabMesh key={`slab-${i}`} w={r.width} d={r.depth} cx={r.x} cz={r.z} delay={slabDelay} active={active} />
      ))}

      {/* Зони кімнат */}
      {items.map((item) => {
        const showTip = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHovered({ name: t.plan.roomNames[item.type], area: item.area, mx: e.nativeEvent.clientX, my: e.nativeEvent.clientY })
        }
        return (
          <ZoneMesh
            key={item.key}
            item={item}
            active={active}
            hovered={hoverKey === item.hoverId && !item.exiting}
            onExited={() => removeKey(item.key)}
            onOver={(e) => {
              if (item.exiting) return
              setHoverKey(item.hoverId)
              showTip(e)
            }}
            onMove={(e) => {
              if (item.exiting) return
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
    </group>
  )
}

export default function PlanView() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const hideFloor2 = useConfigurator((s) => s.hideFloor2)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const showZones = STEPS[currentStep].id === 'rooms'

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
            showZones={showZones}
            yOffset={(floorNum - 1) * FLOOR_H}
            active={active}
          />
        )
      })}
    </group>
  )
}
