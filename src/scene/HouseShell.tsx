import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { ExtrudeGeometry, Path, Shape, type Group, type Mesh } from 'three'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { generateHousePlan } from '../lib/floorplan'
import type { FloorPlan, PlanRect, RoomType, RoomZone, WindowType } from '../config/types'

// ============================================================
// 3D-оболонка будинку (Фази A+B). Показуємо ЛИШЕ на кроці «Вікна» — уся коробка
// плавно «виростає» з землі (одна група, scale.y). Вікна/двері ВМОНТОВАНІ в стіну:
// стіна будується з простінків + перемичок + підвіконних частин, лишаючи реальний
// отвір, у який сідає деталізоване вікно (рама + скло + імпости).
//
// Тераса — БЕЗ стін і кришки: відкритий простір зі скляним парканом + поручнем.
// Стіна кімнати, що виходить на терасу, — панорамне скління-двері в підлогу.
// ============================================================

const FLOOR_H = 3.0
const WALL_T = 0.18
const PLATE_T = 0.2
const WALL_COLOR = '#ece7de'
const PLATE_COLOR = '#d9d3c6'
const RISE_EASE = 0.5

// ---- Вікна ----
const WIN_TOP = 2.3 // СПІЛЬНИЙ верх усіх вікон; змінюється лише низ (підвіконня)
const WIN_MARGIN = 0.5
const FRAME_W = 0.06 // ширина металевого профілю
const FRAME_D = 0.1 // глибина рами (сидить у товщі стіни → вмонтована)
const GLASS_D = 0.03
const FRAME_COLOR = '#6b7075' // метал (рама + імпости + поручень)
const GLASS_COLOR = '#a9c6d6'
const GLASS_OPACITY = 0.32
const SWITCH_EASE = 0.4 // анімація зміни вікна при переключенні типу
const MULLION_STEP = 1.4 // імпост приблизно кожні 1.4 м ширини

// ---- Тераса ----
const FENCE_H = 1.1
const FENCE_D = 0.04
const RAIL_H = 0.06
const RAIL_W = 0.08

// Ширина отвору за типом кімнати. Немає в мапі → без вікон (комора/тераса).
const WIN_WIDTH: Partial<Record<RoomType, number>> = {
  master: 1.8,
  bedroom: 1.6,
  livingKitchen: 2.6,
  office: 1.3,
  bathroom: 1.0, // санвузол — більше, горизонтальне
  closet: 0.6,
  wardrobe: 0.8,
  hall: 1.0,
  stairs: 1.2, // вікно біля сходів (норми)
  corridor: 100, // скляна галерея — на всю стіну
}

function isDoorRoom(type: RoomType, floorIdx: number): boolean {
  if (type === 'livingKitchen' || type === 'hall') return true
  if (floorIdx === 0 && (type === 'bedroom' || type === 'master' || type === 'office')) return true
  return false
}

// Підвіконня (верх завжди WIN_TOP). Тераса → в підлогу (обробляється окремо).
// 1-й поверх: двері/галерея/сходи/панорама — в підлогу, звичайні — 900 мм.
// 2-й поверх: УСЕ з відступом 300 мм (крім виходу на терасу і санвузла).
function sillFor(floorIdx: number, type: RoomType, win: WindowType, asDoor: boolean): number {
  if (type === 'bathroom') return WIN_TOP - 0.6
  if (floorIdx >= 1) return 0.3
  if (asDoor) return 0
  if (type === 'corridor' || type === 'stairs') return 0
  if (win === 'panoramic') return 0
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

// Чи є за стороною кімнати щось (тераса НЕ блокує — до неї роблять вихід).
function neighborBeyond(rooms: RoomZone[], room: RoomZone, side: 'xmax' | 'xmin' | 'zmax' | 'zmin', onlyTerrace: boolean): boolean {
  const b = bounds(room)
  return rooms.some((r2) => {
    if (r2 === room) return false
    if (onlyTerrace ? r2.type !== 'terrace' : r2.type === 'terrace') return false
    const c = bounds(r2)
    if (side === 'xmax') return Math.abs(c.x0 - b.x1) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'xmin') return Math.abs(c.x1 - b.x0) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'zmax') return Math.abs(c.z0 - b.z1) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
    return Math.abs(c.z1 - b.z0) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
  })
}
const isExterior = (rooms: RoomZone[], room: RoomZone, side: 'xmax' | 'xmin' | 'zmax' | 'zmin') => !neighborBeyond(rooms, room, side, false)
const facesTerrace = (rooms: RoomZone[], room: RoomZone, side: 'xmax' | 'xmin' | 'zmax' | 'zmin') => neighborBeyond(rooms, room, side, true)

// Контур поверху з плити (Г = 6-кутник, прямокутник = 4 кути).
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

// Контур СТІН/КРИШКИ — без тераси (її не обносимо стінами й не накриваємо).
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
}
interface Box {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
}

// Стіна з отворами: простінки на всю висоту + перемичка над отвором + підвіконна
// частина під ним. Отвір [a..b]×[sill..WIN_TOP] лишається порожнім.
function wallBoxes(pts: [number, number][], ops: Opening[], baseY: number): Box[] {
  const boxes: Box[] = []
  for (const e of edgesOf(pts)) {
    const eo = ops
      .filter((o) => o.horizontal === e.horizontal && Math.abs(o.line - e.line) < 0.05 && o.a >= e.min - 0.01 && o.b <= e.max + 0.01)
      .sort((a, b) => a.a - b.a)
    const push = (u0: number, u1: number, v0: number, v1: number) => {
      const ulen = u1 - u0
      const vlen = v1 - v0
      if (ulen <= 0.001 || vlen <= 0.001) return
      const uc = (u0 + u1) / 2
      const vc = baseY + (v0 + v1) / 2
      if (e.horizontal) boxes.push({ x: uc, y: vc, z: e.line, dx: ulen, dy: vlen, dz: WALL_T })
      else boxes.push({ x: e.line, y: vc, z: uc, dx: WALL_T, dy: vlen, dz: ulen })
    }
    let cursor = e.min - WALL_T / 2
    for (const o of eo) {
      if (o.a > cursor) push(cursor, o.a, 0, FLOOR_H)
      push(o.a, o.b, WIN_TOP, FLOOR_H) // перемичка над
      if (o.sill > 0.001) push(o.a, o.b, 0, o.sill) // під підвіконням
      cursor = o.b
    }
    push(cursor, e.max + WALL_T / 2, 0, FLOOR_H)
  }
  return boxes
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

// Деталізоване вікно, вмонтоване в отвір: рама + скло + вертикальні імпости.
// Верх нерухомий (WIN_TOP), НИЗ анімується до цільового підвіконня (зміна типу).
function Win({ rotY, x, z, baseY, width, sill }: { rotY: number; x: number; z: number; baseY: number; width: number; sill: number }) {
  const gW = Math.max(width - 2 * FRAME_W, 0.05)
  const mullX = useMemo(() => {
    const xs: number[] = []
    if (width > 1.7) {
      const n = Math.max(1, Math.round(width / MULLION_STEP) - 1)
      for (let k = 1; k <= n; k++) xs.push(-width / 2 + (k * width) / (n + 1))
    }
    return xs
  }, [width])
  const s = useRef(sill)
  const stretch = useRef<Group>(null)
  const bottom = useRef<Mesh>(null)
  useFrame((_, dt) => {
    easing.damp(s, 'current', sill, SWITCH_EASE, dt)
    const cs = s.current
    const h = WIN_TOP - cs
    const cy = (cs + WIN_TOP) / 2
    if (bottom.current) bottom.current.position.y = cs + FRAME_W / 2
    if (stretch.current) {
      stretch.current.position.y = cy
      stretch.current.scale.y = Math.max(h, 0.01)
    }
  })
  return (
    <group rotation-y={rotY} position={[x, baseY, z]}>
      {/* верхній профіль (нерухомий) */}
      <mesh position={[0, WIN_TOP - FRAME_W / 2, 0]}>
        <boxGeometry args={[width, FRAME_W, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {/* нижній профіль (рухомий) */}
      <mesh ref={bottom} position={[0, sill + FRAME_W / 2, 0]}>
        <boxGeometry args={[width, FRAME_W, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {/* вертикальні елементи — unit-висота (центр 0), масштабуються по y */}
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

export default function HouseShell() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const show = STEPS[currentStep].id === 'windows'
  const ref = useRef<Group>(null)

  // Отвори (вікна/двері) — рахуємо ПЕРШИМИ, бо стіни будуються з отворами під них.
  const openings = useMemo(() => {
    const win: WindowType = config.windows ?? 'standard'
    const out: Opening[] = []
    plan.floors.forEach((fl, floorIdx) => {
      const baseY = floorIdx * FLOOR_H
      fl.rooms.forEach((room) => {
        const specW = WIN_WIDTH[room.type]
        if (specW == null) return
        const b = bounds(room)
        type Side = 'xmax' | 'xmin' | 'zmax' | 'zmin'
        const cand: { side: Side; horizontal: boolean; line: number; center: number; len: number; rotY: number }[] = [
          { side: 'xmax', horizontal: false, line: b.x1, center: (b.z0 + b.z1) / 2, len: b.z1 - b.z0, rotY: Math.PI / 2 },
          { side: 'xmin', horizontal: false, line: b.x0, center: (b.z0 + b.z1) / 2, len: b.z1 - b.z0, rotY: -Math.PI / 2 },
          { side: 'zmax', horizontal: true, line: b.z1, center: (b.x0 + b.x1) / 2, len: b.x1 - b.x0, rotY: 0 },
          { side: 'zmin', horizontal: true, line: b.z0, center: (b.x0 + b.x1) / 2, len: b.x1 - b.x0, rotY: Math.PI },
        ]
        const sides = cand.filter((c) => isExterior(fl.rooms, room, c.side))
        if (sides.length === 0) return
        sides.sort((a, c) => c.len - a.len)
        const doorRoom = isDoorRoom(room.type, floorIdx)
        sides.forEach((sd, i) => {
          const terraceExit = facesTerrace(fl.rooms, room, sd.side)
          // Вихід на терасу — панорамне скління-двері на всю стіну, в підлогу.
          const width = terraceExit ? Math.max(sd.len - 0.3, 0.6) : Math.min(specW, sd.len - WIN_MARGIN)
          if (width < 0.4) return
          const asDoor = doorRoom && i === 0
          const sill = terraceExit ? 0 : sillFor(floorIdx, room.type, win, asDoor)
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
          })
        })
      })
    })
    return out
  }, [plan, config.windows])

  // Стіни з отворами.
  const walls = useMemo(() => {
    if (plan.floors.length === 0) return []
    return plan.floors.flatMap((fl, idx) => wallBoxes(wallOutline(fl), openings.filter((o) => o.baseY === idx * FLOOR_H), idx * FLOOR_H))
  }, [plan, openings])

  // Перекриття рівнів 0..N (контур кришки — без тераси; підлога тераси лишається).
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

  // Скляний паркан по контуру тераси (крім сторони до будинку) + поручень.
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
        out.push({ baseY, horizontal: e.horizontal, cx: e.horizontal ? mid : e.c, cz: e.horizontal ? e.c : mid, len: e.b - e.a + FENCE_D })
      })
    })
    return out
  }, [plan])

  useFrame((_, dt) => {
    if (ref.current) easing.damp(ref.current.scale, 'y', show ? 1 : 0.0001, RISE_EASE, dt)
  })

  return (
    <group ref={ref} visible={show} scale={[1, 0.0001, 1]}>
      {walls.map((b, i) => (
        <mesh key={`wall-${i}`} position={[b.x, b.y, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.dx, b.dy, b.dz]} />
          <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {plates.map((p, i) => (
        <mesh key={`plate-${i}`} geometry={p.geo} position={[0, p.y - PLATE_T / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={PLATE_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {openings.map((o) => (
        <Win key={o.key} rotY={o.rotY} x={o.fx} z={o.fz} baseY={o.baseY} width={o.width} sill={o.sill} />
      ))}

      {fences.map((f, i) => (
        <group key={`fence-${i}`}>
          <mesh position={[f.cx, f.baseY + FENCE_H / 2, f.cz]}>
            <boxGeometry args={f.horizontal ? [f.len, FENCE_H, FENCE_D] : [FENCE_D, FENCE_H, f.len]} />
            <meshStandardMaterial color={GLASS_COLOR} metalness={0} roughness={0.05} transparent opacity={0.26} />
          </mesh>
          <mesh position={[f.cx, f.baseY + FENCE_H + RAIL_H / 2, f.cz]}>
            <boxGeometry args={f.horizontal ? [f.len, RAIL_H, RAIL_W] : [RAIL_W, RAIL_H, f.len]} />
            <meshStandardMaterial {...frameMat} />
          </mesh>
        </group>
      ))}
    </group>
  )
}
