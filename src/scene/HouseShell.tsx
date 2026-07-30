import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { ExtrudeGeometry, Path, Shape, type Group, type Mesh } from 'three'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { generateHousePlan } from '../lib/floorplan'
import type { FloorPlan, PlanRect, RoomType, RoomZone, WindowType } from '../config/types'

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
const WALL_T = 0.18
const WALL_H = CEIL_H // стіна = висота стелі; зверху лягає перекриття (без колізій)
const WALL_COLOR = '#ece7de'
const PLATE_COLOR = '#d9d3c6'
const RISE_EASE = 0.5
const PARAPET_H = 0.45 // висота парапету плоского даху

// ---- Вікна ----
const WIN_TOP = 2.7 // СПІЛЬНИЙ верх усіх вікон; змінюється лише низ (підвіконня)
const WIN_MARGIN = 0.5
const FRAME_W = 0.06
const FRAME_D = 0.1 // рама сидить у товщі стіни → вмонтована
const GLASS_D = 0.03
const FRAME_COLOR = '#6b7075'
const GLASS_COLOR = '#a9c6d6'
const GLASS_OPACITY = 0.32
const SWITCH_EASE = 0.4
const MULLION_STEP = 1.4
const DOOR_TRANSOM_Y = 2.2 // фрамуга над дверима — на 2200 від підлоги
const DOOR_LEAF = 0.95 // ширина секції дверей (900–1000 мм)

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

const WIN_WIDTH: Partial<Record<RoomType, number>> = {
  master: 1.8,
  bedroom: 1.6,
  livingKitchen: 2.6,
  office: 1.3,
  bathroom: 1.0,
  closet: 0.6,
  wardrobe: 0.8,
  hall: 1.0,
  stairs: 1.2,
  corridor: 100, // галерея на всю стіну
}

// Двері (панорама в підлогу): кухня-вітальня та прихожа завжди; спальні/майстер
// 1-го поверху — вихід у двір. Решта — звичайні вікна. Тераса — окремо.
const isDoorRoom = (type: RoomType, floorIdx: number) =>
  type === 'livingKitchen' || type === 'hall' || (floorIdx === 0 && (type === 'bedroom' || type === 'master'))

// Підвіконня (верх завжди WIN_TOP). Санвузол/сходи — фіксовані (не перемикаються).
// Двері — в підлогу. Решта: панорама — 1-й поверх у підлогу / 2-й 300мм; звичайні
// — 900мм. Так вікна ПЕРЕМИКАЮТЬСЯ між типами на обох поверхах.
function sillFor(floorIdx: number, type: RoomType, win: WindowType, asDoor: boolean): number {
  if (type === 'bathroom') return WIN_TOP - 0.6
  if (type === 'stairs') return floorIdx >= 1 ? 0.3 : 0
  if (asDoor) return 0
  if (win === 'panoramic') return floorIdx >= 1 ? 0.3 : 0
  return 0.9
}

const segOverlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05

interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}
function bounds(r: PlanRect): Rect {
  return { x0: r.x - r.width / 2, x1: r.x + r.width / 2, z0: r.z - r.depth / 2, z1: r.z + r.depth / 2 }
}
type Side = 'xmax' | 'xmin' | 'zmax' | 'zmin'

// Сусідня кімната за стороною (або наявність тераси за нею).
function neighborOf(rooms: RoomZone[], room: RoomZone, side: Side, wantTerrace: boolean): RoomZone | undefined {
  const b = bounds(room)
  return rooms.find((r2) => {
    if (r2 === room) return false
    if (wantTerrace ? r2.type !== 'terrace' : r2.type === 'terrace') return false
    const c = bounds(r2)
    if (side === 'xmax') return Math.abs(c.x0 - b.x1) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'xmin') return Math.abs(c.x1 - b.x0) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'zmax') return Math.abs(c.z0 - b.z1) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
    return Math.abs(c.z1 - b.z0) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
  })
}
const isExterior = (rooms: RoomZone[], room: RoomZone, side: Side) => !neighborOf(rooms, room, side, false)
const facesTerrace = (rooms: RoomZone[], room: RoomZone, side: Side) => !!neighborOf(rooms, room, side, true)

function outline(slab: PlanRect[]): [number, number][] {
  if (slab.length === 1) {
    const a = bounds(slab[0])
    return [
      [a.x0, a.z0],
      [a.x1, a.z0],
      [a.x1, a.z1],
      [a.x0, a.z1],
    ]
  }
  const [n, d] = slab[0].z < slab[1].z ? [bounds(slab[0]), bounds(slab[1])] : [bounds(slab[1]), bounds(slab[0])]
  return [
    [n.x0, n.z0],
    [n.x1, n.z0],
    [n.x1, n.z1],
    [d.x1, d.z0],
    [d.x1, d.z1],
    [d.x0, d.z1],
  ]
}
function wallOutline(fl: FloorPlan): [number, number][] {
  const terrace = fl.rooms.find((r) => r.type === 'terrace')
  if (!terrace || fl.slab.length !== 1) return outline(fl.slab)
  const s = bounds(fl.slab[0])
  const t = bounds(terrace)
  const z0 = Math.abs(t.z0 - s.z0) < 0.05 ? t.z1 : s.z0
  const z1 = Math.abs(t.z1 - s.z1) < 0.05 ? t.z0 : s.z1
  return [
    [s.x0, z0],
    [s.x1, z0],
    [s.x1, z1],
    [s.x0, z1],
  ]
}

interface Edge {
  horizontal: boolean
  line: number
  min: number
  max: number
}
function edgesOf(pts: [number, number][]): Edge[] {
  const es: Edge[] = []
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]
    const [x1, z1] = pts[(i + 1) % pts.length]
    if (Math.abs(z1 - z0) < 1e-4) es.push({ horizontal: true, line: z0, min: Math.min(x0, x1), max: Math.max(x0, x1) })
    else es.push({ horizontal: false, line: x0, min: Math.min(z0, z1), max: Math.max(z0, z1) })
  }
  return es
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

interface Opening {
  key: string
  baseY: number
  horizontal: boolean
  line: number
  a: number
  b: number
  sill: number
  rotY: number
  fx: number
  fz: number
  width: number
  isDoor: boolean
}

function plateGeometry(pts: [number, number][], hole: Rect | null): ExtrudeGeometry {
  const shape = new Shape()
  pts.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)))
  shape.closePath()
  if (hole) {
    const h = new Path()
    h.moveTo(hole.x0, -hole.z0)
    h.lineTo(hole.x1, -hole.z0)
    h.lineTo(hole.x1, -hole.z1)
    h.lineTo(hole.x0, -hole.z1)
    h.closePath()
    shape.holes.push(h)
  }
  const geo = new ExtrudeGeometry(shape, { depth: PLATE_T, bevelEnabled: false })
  geo.rotateX(-Math.PI / 2)
  return geo
}

const frameMat = { color: FRAME_COLOR, metalness: 0.85, roughness: 0.35 }

// Деталізоване вікно, вмонтоване в отвір. Верх нерухомий, низ анімується (зміна
// типу). Двері отримують горизонтальну фрамугу + вертикальні імпости.
function Win({ rotY, x, z, baseY, width, sill, isDoor }: { rotY: number; x: number; z: number; baseY: number; width: number; sill: number; isDoor: boolean }) {
  const gW = Math.max(width - 2 * FRAME_W, 0.05)
  // Двері: ліворуч секція дверей (DOOR_LEAF) з фрамугою над нею; праворуч — вікно.
  const split = isDoor && width > DOOR_LEAF + 0.3
  const boundary = -width / 2 + DOOR_LEAF // межа секції дверей
  const mullX = useMemo(() => {
    const xs: number[] = []
    if (split) xs.push(boundary) // імпост між дверима і вікном
    // додаткові імпости у широкій віконній частині
    const wsStart = split ? boundary : -width / 2
    const wsW = width / 2 - wsStart
    if (split && wsW > 1.4) {
      const n = Math.max(1, Math.round(wsW / MULLION_STEP) - 1)
      for (let k = 1; k <= n; k++) xs.push(wsStart + (k * wsW) / (n + 1))
    } else if (!isDoor && width > 1.4) {
      const n = Math.max(1, Math.round(width / MULLION_STEP) - 1)
      for (let k = 1; k <= n; k++) xs.push(-width / 2 + (k * width) / (n + 1))
    }
    return xs
  }, [width, isDoor, split, boundary])
  // Фрамуга — лише над секцією дверей (або над усім, якщо секція вузька).
  const transomA = -width / 2
  const transomB = split ? boundary : width / 2
  const s = useRef(sill)
  const stretch = useRef<Group>(null)
  const bottom = useRef<Mesh>(null)
  useFrame((_, dt) => {
    easing.damp(s, 'current', sill, SWITCH_EASE, dt)
    const cs = s.current
    if (bottom.current) bottom.current.position.y = cs + FRAME_W / 2
    if (stretch.current) {
      stretch.current.position.y = (cs + WIN_TOP) / 2
      stretch.current.scale.y = Math.max(WIN_TOP - cs, 0.01)
    }
  })
  return (
    <group rotation-y={rotY} position={[x, baseY, z]}>
      <mesh position={[0, WIN_TOP - FRAME_W / 2, 0]}>
        <boxGeometry args={[width, FRAME_W, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      <mesh ref={bottom} position={[0, sill + FRAME_W / 2, 0]}>
        <boxGeometry args={[width, FRAME_W, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {isDoor && (
        <mesh position={[(transomA + transomB) / 2, DOOR_TRANSOM_Y, 0]}>
          <boxGeometry args={[transomB - transomA, FRAME_W, FRAME_D]} />
          <meshStandardMaterial {...frameMat} />
        </mesh>
      )}
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
  return (
    <mesh ref={ref} position={horizontal ? [uc, baseY, line] : [line, baseY, uc]} castShadow receiveShadow>
      <boxGeometry args={horizontal ? [ulen, 1, WALL_T] : [WALL_T, 1, ulen]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
  )
}

export default function HouseShell() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const stepId = STEPS[currentStep].id
  const show = stepId === 'windows' || stepId === 'roof' // коробка видима на «Вікна» і «Дах»
  const ref = useRef<Group>(null)

  const openings = useMemo(() => {
    const win: WindowType = config.windows ?? 'standard'
    const out: Opening[] = []
    plan.floors.forEach((fl, floorIdx) => {
      const baseY = floorIdx * FLOOR_H
      fl.rooms.forEach((room) => {
        const specW = WIN_WIDTH[room.type]
        if (specW == null) return
        const b = bounds(room)
        const cand: { side: Side; horizontal: boolean; line: number; center: number; len: number; rotY: number }[] = [
          { side: 'xmax', horizontal: false, line: b.x1, center: (b.z0 + b.z1) / 2, len: b.z1 - b.z0, rotY: Math.PI / 2 },
          { side: 'xmin', horizontal: false, line: b.x0, center: (b.z0 + b.z1) / 2, len: b.z1 - b.z0, rotY: -Math.PI / 2 },
          { side: 'zmax', horizontal: true, line: b.z1, center: (b.x0 + b.x1) / 2, len: b.x1 - b.x0, rotY: 0 },
          { side: 'zmin', horizontal: true, line: b.z0, center: (b.x0 + b.x1) / 2, len: b.x1 - b.x0, rotY: Math.PI },
        ]
        const sides = cand.filter((c) => isExterior(fl.rooms, room, c.side))
        if (sides.length === 0) return
        sides.sort((a, c) => c.len - a.len)
        // Дверна сторона: прихожа — з фасаду (zmax); кухня/інші — у двір (zmin).
        const doorRoom = isDoorRoom(room.type, floorIdx)
        // Прихожа і кухня-вітальня — двері спереду (фасад); решта дверних кімнат — у двір.
        const pref: Side = room.type === 'hall' || room.type === 'livingKitchen' ? 'zmax' : 'zmin'
        const doorSide = doorRoom ? (sides.find((s) => s.side === pref) ?? sides[0]) : null
        sides.forEach((sd) => {
          const terraceExit = facesTerrace(fl.rooms, room, sd.side)
          const asDoor = terraceExit || sd === doorSide
          // Двері кухні-вітальні — широкі (панорамні на фасаді), щоб не лишалося пустого фронту.
          const kitchenDoor = asDoor && room.type === 'livingKitchen'
          const width = terraceExit
            ? Math.max(sd.len - 0.3, 0.6)
            : kitchenDoor
              ? Math.max(sd.len - 1.0, 0.9)
              : Math.min(specW, sd.len - WIN_MARGIN)
          if (width < 0.4) return
          const sill = asDoor ? 0 : sillFor(floorIdx, room.type, win, false)
          out.push({
            key: `${floorIdx}-${room.id ?? room.type}-${sd.side}`,
            baseY,
            horizontal: sd.horizontal,
            line: sd.line,
            a: sd.center - width / 2,
            b: sd.center + width / 2,
            sill,
            rotY: sd.rotY,
            fx: sd.horizontal ? sd.center : sd.line,
            fz: sd.horizontal ? sd.line : sd.center,
            width,
            isDoor: asDoor,
          })
        })
      })
    })
    return out
  }, [plan, config.windows])

  // Стіни: простінки + перемички НАД отворами (простінок під підвіконням — окремо,
  // анімований Spandrel). Верх перемички = FLOOR_H, низ отвору = WIN_TOP.
  const walls = useMemo(() => {
    const boxes: Box[] = []
    plan.floors.forEach((fl, idx) => {
      const baseY = idx * FLOOR_H
      const ops = openings.filter((o) => o.baseY === baseY)
      const pts = wallOutline(fl)
      for (const e of edgesOf(pts)) {
        const eo = ops
          .filter((o) => o.horizontal === e.horizontal && Math.abs(o.line - e.line) < 0.05 && o.a >= e.min - 0.01 && o.b <= e.max + 0.01)
          .sort((a, b) => a.a - b.a)
        // Зовнішня стіна — на ВСЮ висоту поверху (FLOOR_H), щоб закрити край плити
        // перекриття (не було «прожилок»). Простінки точно між кутами; кути — стовпи.
        let cursor = e.min
        for (const o of eo) {
          if (o.a > cursor) pushBox(boxes, e.horizontal, e.line, cursor, o.a, 0, FLOOR_H, baseY, WALL_T)
          pushBox(boxes, e.horizontal, e.line, o.a, o.b, WIN_TOP, FLOOR_H, baseY, WALL_T)
          cursor = o.b
        }
        pushBox(boxes, e.horizontal, e.line, cursor, e.max, 0, FLOOR_H, baseY, WALL_T)
      }
      // Кутові стовпи на кожній вершині контуру — гарантовано з'єднують стіни без дірок.
      for (const [vx, vz] of pts) boxes.push({ x: vx, y: baseY + FLOOR_H / 2, z: vz, dx: WALL_T, dy: FLOOR_H, dz: WALL_T })
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
  const plates = useMemo(() => {
    const N = plan.floors.length
    const arr: { y: number; geo: ExtrudeGeometry }[] = []
    if (N === 0) return arr
    for (let idx = 0; idx <= N; idx++) {
      const fl = plan.floors[Math.max(0, idx - 1)]
      const wantHole = idx >= 1 && idx <= N - 1
      const stairs = wantHole ? fl.rooms.find((r) => r.type === 'stairs') : undefined
      const hole = stairs ? bounds(stairs) : null
      const pts = idx <= N - 1 ? outline(fl.slab) : wallOutline(fl)
      arr.push({ y: idx * FLOOR_H, geo: plateGeometry(pts, hole) })
    }
    return arr
  }, [plan])

  // Скляний паркан по контуру тераси (без сторони до будинку) + поручень.
  const fences = useMemo(() => {
    const out: { baseY: number; horizontal: boolean; cx: number; cz: number; len: number }[] = []
    plan.floors.forEach((fl, floorIdx) => {
      const terrace = fl.rooms.find((r) => r.type === 'terrace')
      if (!terrace || fl.slab.length !== 1) return
      const s = bounds(fl.slab[0])
      const t = bounds(terrace)
      const baseY = floorIdx * FLOOR_H
      const edges = [
        { horizontal: true, c: t.z0, a: t.x0, b: t.x1, on: Math.abs(t.z0 - s.z0) < 0.05 },
        { horizontal: true, c: t.z1, a: t.x0, b: t.x1, on: Math.abs(t.z1 - s.z1) < 0.05 },
        { horizontal: false, c: t.x0, a: t.z0, b: t.z1, on: Math.abs(t.x0 - s.x0) < 0.05 },
        { horizontal: false, c: t.x1, a: t.z0, b: t.z1, on: Math.abs(t.x1 - s.x1) < 0.05 },
      ]
      edges.forEach((e) => {
        if (!e.on) return
        const mid = (e.a + e.b) / 2
        // len БЕЗ подовження → панелі не перетинаються (без мерехтіння скла).
        out.push({ baseY, horizontal: e.horizontal, cx: e.horizontal ? mid : e.c, cz: e.horizontal ? e.c : mid, len: e.b - e.a })
      })
    })
    return out
  }, [plan])

  // Плоский дах: парапети по периметру КОЖНОГО рівня даху (верх + дах над денним
  // крилом/вітальнею). Ребро, накрите верхнім поверхом (там його стіни), пропускаємо.
  const parapets = useMemo(() => {
    const boxes: Box[] = []
    const N = plan.floors.length
    if (N === 0 || config.roof !== 'flat') return boxes
    plan.floors.forEach((fl, idx) => {
      const roofY = (idx + 1) * FLOOR_H
      // «Накрите» рахуємо по ПОВНІЙ плиті верхнього поверху (враховує терасу):
      // під терасою парапету немає (там скляний паркан); без тераси ця смуга —
      // відкритий дах, тож парапет по контуру з'являється.
      const upper = idx < N - 1 ? edgesOf(outline(plan.floors[idx + 1].slab)) : []
      for (const e of edgesOf(wallOutline(fl))) {
        const covered = upper.some(
          (u) => u.horizontal === e.horizontal && Math.abs(u.line - e.line) < 0.05 && Math.min(u.max, e.max) - Math.max(u.min, e.min) > 0.1,
        )
        if (covered) continue
        pushBox(boxes, e.horizontal, e.line, e.min, e.max, 0, PARAPET_H, roofY, WALL_T)
      }
    })
    return boxes
  }, [plan, config.roof])

  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    easing.damp(g.scale, 'y', show ? 1 : 0.0001, RISE_EASE, dt)
    g.visible = show || g.scale.y > 0.02 // лишаємось видимими, поки коробка зникає
  })

  return (
    <group ref={ref} visible={false} scale={[1, 0.0001, 1]}>
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
          {/* polygonOffset — плита виграє в z-тесті над зеленою землею (без мерехтіння) */}
          <meshStandardMaterial color={PLATE_COLOR} roughness={0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}

      {parapets.map((b, i) => (
        <mesh key={`parapet-${i}`} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.dx, b.dy, b.dz]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {openings.map((o) => (
        <Win key={o.key} rotY={o.rotY} x={o.fx} z={o.fz} baseY={o.baseY} width={o.width} sill={o.sill} isDoor={o.isDoor} />
      ))}

      {fences.map((f, i) => (
        <group key={`fence-${i}`}>
          <mesh position={[f.cx, f.baseY + FENCE_H / 2, f.cz]}>
            <boxGeometry args={f.horizontal ? [f.len, FENCE_H, FENCE_D] : [FENCE_D, FENCE_H, f.len]} />
            <meshStandardMaterial color={GLASS_COLOR} metalness={0} roughness={0.05} transparent opacity={0.26} />
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
