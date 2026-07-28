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
// плавно «виростає» з землі (одна група, scale.y), а на зовнішніх стінах кімнат
// стоять деталізовані вікна/двері (рама + скло + ручка).
//
// Стіни — на всю висоту поверху (з'єднуються між поверхами). Перекриття: підлога
// 1-го, міжповерхове (з ОТВОРОМ під сходи) і кришка (тимчасова — дах у Фазі C).
// Тераса — БЕЗ стін і кришки: відкритий простір зі скляним парканом + поручнем.
// ============================================================

const FLOOR_H = 3.0 // висота поверху (= висота стіни, щоб коробка була суцільна)
const WALL_T = 0.18 // товщина стіни
const PLATE_T = 0.2 // товщина перекриття
const WALL_COLOR = '#ece7de' // теплий світлий тиньк
const PLATE_COLOR = '#d9d3c6' // трохи темніше — читається як підлога/перекриття
const RISE_EASE = 0.5 // плавний підйом коробки

// ---- Вікна та двері ----
const WIN_TOP = 2.3 // СПІЛЬНИЙ верх усіх вікон/дверей; змінюється лише низ (підвіконня)
const WIN_MARGIN = 0.5 // сумарний відступ вікна від країв стіни
const FRAME_W = 0.06 // ширина металевого профілю
const FRAME_D = 0.1 // глибина рами (трохи виступає зі стіни)
const GLASS_D = 0.03 // товщина скла
const FRAME_COLOR = '#6b7075' // метал (рама + ручка + поручень)
const GLASS_COLOR = '#a9c6d6' // прозоре скло (легкий блакитний)
const GLASS_OPACITY = 0.34
const SWITCH_EASE = 0.4 // анімація зміни вікна при переключенні типу

// ---- Тераса ----
const FENCE_H = 1.1 // скляний паркан 1100 мм
const FENCE_D = 0.04
const RAIL_H = 0.06 // поручень
const RAIL_W = 0.08

// Ширина отвору за типом кімнати (м). Немає в мапі → кімната без вікон
// (комора, тераса тощо). corridor = дуже широко → скляна галерея на всю стіну.
const WIN_WIDTH: Partial<Record<RoomType, number>> = {
  master: 1.8,
  bedroom: 1.6,
  livingKitchen: 2.6,
  office: 1.3,
  bathroom: 1.0, // санвузол — БІЛЬШЕ і горизонтальне
  closet: 0.6, // гардероб майстра — маленьке
  wardrobe: 0.8, // гардеробна денна
  hall: 1.0, // прихожа — вхідні двері
  stairs: 1.2, // вікно біля сходів (за нормами обов'язкове)
  corridor: 100, // скляна галерея — на всю довжину стіни
}

// Кімнати, чий НАЙШИРШИЙ зовнішній отвір — двері в підлогу: кухня-вітальня та
// прихожа завжди; кімнати 1-го поверху (вихід у двір); майстер 2-го з терасою.
function isDoorRoom(type: RoomType, floorIdx: number, terrace2: boolean): boolean {
  if (type === 'livingKitchen' || type === 'hall') return true
  if (floorIdx === 0 && (type === 'bedroom' || type === 'master' || type === 'office')) return true
  if (floorIdx === 1 && type === 'master' && terrace2) return true
  return false
}

// Підвіконня отвору (верх завжди WIN_TOP → міняється лише низ). Двері/галерея/сходи
// — в підлогу; санвузол — коротке горизонтальне вгорі; панорамні — в підлогу (2-й
// поверх: 300 мм); звичайні — стандартні.
function sillFor(type: RoomType, floorIdx: number, win: WindowType, asDoor: boolean): number {
  if (asDoor) return 0
  if (type === 'bathroom') return WIN_TOP - 0.6
  if (type === 'corridor' || type === 'stairs') return 0
  if (win === 'panoramic') return floorIdx === 0 ? 0 : 0.3
  return 0.9
}

const segOverlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05

// Чи сторона кімнати зовнішня (немає суміжної кімнати за нею). Тераса НЕ блокує —
// сторона до тераси теж зовнішня (там будуть двері на терасу).
function isExterior(rooms: RoomZone[], room: RoomZone, side: 'xmax' | 'xmin' | 'zmax' | 'zmin'): boolean {
  const b = bounds(room)
  return !rooms.some((r2) => {
    if (r2 === room || r2.type === 'terrace') return false
    const c = bounds(r2)
    if (side === 'xmax') return Math.abs(c.x0 - b.x1) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'xmin') return Math.abs(c.x1 - b.x0) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1)
    if (side === 'zmax') return Math.abs(c.z0 - b.z1) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
    return Math.abs(c.z1 - b.z0) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1)
  })
}

interface WallSeg {
  cx: number
  cz: number
  len: number
  horizontal: boolean
}
interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

function bounds(r: PlanRect): Rect {
  return { x0: r.x - r.width / 2, x1: r.x + r.width / 2, z0: r.z - r.depth / 2, z1: r.z + r.depth / 2 }
}

// Зовнішній контур поверху з плити. Г-подібний = 2 прямокутники → 6-кутник;
// один прямокутник → 4 кути.
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

// Контур СТІН/КРИШКИ: як outline, але БЕЗ тераси (тераса — відкрита, її не
// обносимо стінами й не накриваємо). Тераса — задня смуга на всю ширину крила.
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

// Ребра контуру → відрізки стін (кожне осепаралельне).
function segments(pts: [number, number][]): WallSeg[] {
  const segs: WallSeg[] = []
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]
    const [x1, z1] = pts[(i + 1) % pts.length]
    const horizontal = Math.abs(z1 - z0) < 1e-4
    const len = Math.abs(horizontal ? x1 - x0 : z1 - z0) + WALL_T // +T щоб кути стикались
    segs.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, len, horizontal })
  }
  return segs
}

// Горизонтальне перекриття (з можливим отвором під сходи), покладене плазом.
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

// Деталізоване вікно: рама (4 металеві профілі) + скло + ручка. Верх нерухомий
// (WIN_TOP), НИЗ анімується до цільового підвіконня → при зміні типу вікон низ
// плавно з'їжджає. Бічні профілі й скло — unit-висота × scale.y.
function Win({ rotY, x, z, baseY, width, sill }: { rotY: number; x: number; z: number; baseY: number; width: number; sill: number }) {
  const gW = Math.max(width - 2 * FRAME_W, 0.05)
  const s = useRef(sill)
  const bottom = useRef<Mesh>(null)
  const left = useRef<Mesh>(null)
  const right = useRef<Mesh>(null)
  const glass = useRef<Mesh>(null)
  const handle = useRef<Mesh>(null)
  useFrame((_, dt) => {
    easing.damp(s, 'current', sill, SWITCH_EASE, dt)
    const cs = s.current
    const h = WIN_TOP - cs
    const cy = (cs + WIN_TOP) / 2
    if (bottom.current) bottom.current.position.y = cs + FRAME_W / 2
    for (const r of [left.current, right.current]) {
      if (r) {
        r.position.y = cy
        r.scale.y = Math.max(h, 0.01)
      }
    }
    if (glass.current) {
      glass.current.position.y = cy
      glass.current.scale.y = Math.max(h - 2 * FRAME_W, 0.01)
    }
    if (handle.current) handle.current.position.y = cy
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
      {/* бічні профілі — unit-висота, масштабуються по y */}
      <mesh ref={left} position={[-width / 2 + FRAME_W / 2, WIN_TOP / 2, 0]}>
        <boxGeometry args={[FRAME_W, 1, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      <mesh ref={right} position={[width / 2 - FRAME_W / 2, WIN_TOP / 2, 0]}>
        <boxGeometry args={[FRAME_W, 1, FRAME_D]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
      {/* скло */}
      <mesh ref={glass} position={[0, WIN_TOP / 2, 0]}>
        <boxGeometry args={[gW, 1, GLASS_D]} />
        <meshStandardMaterial color={GLASS_COLOR} metalness={0} roughness={0.05} transparent opacity={GLASS_OPACITY} />
      </mesh>
      {/* ручка */}
      <mesh ref={handle} position={[width / 2 - 0.14, WIN_TOP / 2, FRAME_D / 2]}>
        <boxGeometry args={[0.03, 0.2, 0.04]} />
        <meshStandardMaterial {...frameMat} />
      </mesh>
    </group>
  )
}

export default function HouseShell() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const show = STEPS[currentStep].id === 'windows'
  const ref = useRef<Group>(null)

  const wallFloors = useMemo(() => plan.floors.map((fl) => segments(wallOutline(fl))), [plan])

  // Перекриття рівнів 0..N. Контур — БЕЗ тераси (wallOutline), тож кришка над
  // терасою не накриває її; отвір під сходи — лише в перекриттях між поверхами.
  const plates = useMemo(() => {
    const N = plan.floors.length
    const arr: { y: number; geo: ExtrudeGeometry }[] = []
    if (N === 0) return arr
    for (let idx = 0; idx <= N; idx++) {
      const fl = plan.floors[Math.max(0, idx - 1)]
      const wantHole = idx >= 1 && idx <= N - 1
      const stairs = wantHole ? fl.rooms.find((r) => r.type === 'stairs') : undefined
      const hole = stairs ? bounds(stairs) : null
      // Підлога тераси — це перекриття НИЖЧОГО рівня (idx-1), тож повний контур
      // (outline). Кришка над поверхом (idx) — wallOutline (без тераси).
      const pts = idx <= N - 1 ? outline(fl.slab) : wallOutline(fl)
      arr.push({ y: idx * FLOOR_H, geo: plateGeometry(pts, hole) })
    }
    return arr
  }, [plan])

  // Отвори (вікна/двері) на зовнішніх стінах кімнат.
  const openings = useMemo(() => {
    const terrace2 = config.extras2.includes('terrace')
    const win: WindowType = config.windows ?? 'standard'
    const out: { key: string; baseY: number; rotY: number; x: number; z: number; width: number; sill: number }[] = []
    plan.floors.forEach((fl, floorIdx) => {
      fl.rooms.forEach((room) => {
        const specW = WIN_WIDTH[room.type]
        if (specW == null) return
        const b = bounds(room)
        const cand: { side: 'xmax' | 'xmin' | 'zmax' | 'zmin'; rotY: number; x: number; z: number; len: number }[] = [
          { side: 'xmax', rotY: Math.PI / 2, x: b.x1 + WALL_T / 2, z: (b.z0 + b.z1) / 2, len: b.z1 - b.z0 },
          { side: 'xmin', rotY: -Math.PI / 2, x: b.x0 - WALL_T / 2, z: (b.z0 + b.z1) / 2, len: b.z1 - b.z0 },
          { side: 'zmax', rotY: 0, x: (b.x0 + b.x1) / 2, z: b.z1 + WALL_T / 2, len: b.x1 - b.x0 },
          { side: 'zmin', rotY: Math.PI, x: (b.x0 + b.x1) / 2, z: b.z0 - WALL_T / 2, len: b.x1 - b.x0 },
        ]
        const sides = cand.filter((c) => isExterior(fl.rooms, room, c.side))
        if (sides.length === 0) return
        sides.sort((a, c) => c.len - a.len) // найширша сторона перша
        const doorRoom = isDoorRoom(room.type, floorIdx, terrace2)
        sides.forEach((sd, i) => {
          const width = Math.min(specW, sd.len - WIN_MARGIN)
          if (width < 0.4) return
          const sill = sillFor(room.type, floorIdx, win, doorRoom && i === 0)
          out.push({
            key: `${floorIdx}-${room.id ?? room.type}-${sd.side}`,
            baseY: floorIdx * FLOOR_H,
            rotY: sd.rotY,
            x: sd.x,
            z: sd.z,
            width,
            sill,
          })
        })
      })
    })
    return out
  }, [plan, config.windows, config.extras2])

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
        out.push({
          baseY,
          horizontal: e.horizontal,
          cx: e.horizontal ? mid : e.c,
          cz: e.horizontal ? e.c : mid,
          len: e.b - e.a + FENCE_D,
        })
      })
    })
    return out
  }, [plan])

  useFrame((_, dt) => {
    if (ref.current) easing.damp(ref.current.scale, 'y', show ? 1 : 0.0001, RISE_EASE, dt)
  })

  return (
    <group ref={ref} visible={show} scale={[1, 0.0001, 1]}>
      {/* Стіни */}
      {plan.floors.map((_, idx) =>
        wallFloors[idx].map((seg, i) => (
          <mesh key={`wall-${idx}-${i}`} position={[seg.cx, idx * FLOOR_H + FLOOR_H / 2, seg.cz]} castShadow receiveShadow>
            <boxGeometry args={[seg.horizontal ? seg.len : WALL_T, FLOOR_H, seg.horizontal ? WALL_T : seg.len]} />
            <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
          </mesh>
        )),
      )}

      {/* Перекриття */}
      {plates.map((p, i) => (
        <mesh key={`plate-${i}`} geometry={p.geo} position={[0, p.y - PLATE_T / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={PLATE_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {/* Вікна та двері */}
      {openings.map((o) => (
        <Win key={o.key} rotY={o.rotY} x={o.x} z={o.z} baseY={o.baseY} width={o.width} sill={o.sill} />
      ))}

      {/* Тераса: скляний паркан + поручень */}
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
