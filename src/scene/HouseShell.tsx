import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { ExtrudeGeometry, Path, Shape, type Group } from 'three'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { generateHousePlan } from '../lib/floorplan'
import type { PlanRect, RoomType, RoomZone, WindowType } from '../config/types'

// ============================================================
// 3D-оболонка будинку (Фаза A): зовнішні стіни + перекриття, підняті з плану.
// Показуємо ЛИШЕ на кроці «Вікна» — там уся коробка плавно «виростає» з землі
// (одна група, scale.y), щоб далі (Зріз 2) розставити вікна/двері.
//
// Стіни — на всю висоту поверху (з'єднуються між поверхами). Перекриття:
// над землею (підлога 1-го), між поверхами (з ОТВОРОМ під сходи) і зверху
// (тимчасова пласка «кришка» — справжній дах буде у Фазі C).
// ============================================================

const FLOOR_H = 3.0 // висота поверху (= висота стіни, щоб коробка була суцільна)
const WALL_T = 0.18 // товщина стіни
const PLATE_T = 0.2 // товщина перекриття
const WALL_COLOR = '#ece7de' // теплий світлий тиньк
const PLATE_COLOR = '#d9d3c6' // трохи темніше — читається як підлога/перекриття
const RISE_EASE = 0.5 // плавний підйом коробки

// ---- Вікна та двері ----
const GLASS_COLOR = '#33434f' // темне скло
const PANEL_D = 0.06 // товщина скляної панелі (трохи виступає із стіни)
const WIN_MARGIN = 0.5 // сумарний відступ вікна від країв стіни
const WIN_TOP = 2.3 // верхня межа вікна від підлоги поверху

// Ширина отвору за типом кімнати (м). Немає в мапі → кімната без вікон
// (коридор, сходи, комора, тераса тощо).
const WIN_WIDTH: Partial<Record<RoomType, number>> = {
  master: 1.8,
  bedroom: 1.6,
  livingKitchen: 2.6,
  office: 1.3,
  bathroom: 0.6, // санвузол — маленьке
  closet: 0.6, // гардероб майстра — маленьке
  wardrobe: 0.8, // гардеробна денна
  hall: 1.0, // прихожа — вхідні двері
}

// Кімнати, чий НАЙШИРШИЙ зовнішній отвір робимо дверима в підлогу:
// кухня-вітальня та прихожа завжди; кімнати 1-го поверху (вихід у двір/на терасу);
// майстер 2-го поверху, коли обрано терасу (вихід на неї).
function isDoorRoom(type: RoomType, floorIdx: number, terrace2: boolean): boolean {
  if (type === 'livingKitchen' || type === 'hall') return true
  if (floorIdx === 0 && (type === 'bedroom' || type === 'master' || type === 'office')) return true
  if (floorIdx === 1 && type === 'master' && terrace2) return true
  return false
}

// Підвіконня та висота отвору. Двері — в підлогу. Санвузол — маленьке високо.
// Панорамні — в підлогу (2-й поверх: підвіконня 300 мм). Звичайні — стандартні.
function verticalSpec(type: RoomType, floorIdx: number, win: WindowType, asDoor: boolean) {
  if (asDoor) return { sill: 0, height: 2.1 }
  if (type === 'bathroom') return { sill: 1.3, height: 0.7 }
  if (win === 'panoramic') {
    const sill = floorIdx === 0 ? 0 : 0.3
    return { sill, height: WIN_TOP - sill }
  }
  return { sill: 0.9, height: 1.2 }
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

// Зовнішній контур поверху з плити. Г-подібний = 2 прямокутники (нічне крило
// зверху + денне ширше знизу, ліво-вирівняні) → 6-кутник. Один прямокутник → 4 кути.
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

// Горизонтальне перекриття: заповнений контур (з можливим отвором під сходи),
// екструдований на товщину PLATE_T і покладений плазом (rotateX). Шейп будуємо в
// (x, -z), бо rotateX(-90°) дзеркалить вісь Z — так світові координати збігаються.
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

export default function HouseShell() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const show = STEPS[currentStep].id === 'windows'
  const ref = useRef<Group>(null)

  const wallFloors = useMemo(() => plan.floors.map((fl) => segments(outline(fl.slab))), [plan])

  // Перекриття на рівнях 0..N. Рівень idx лежить над поверхом (idx-1), тож бере
  // його контур; отвір під сходи — лише в перекриттях МІЖ поверхами (1..N-1).
  const plates = useMemo(() => {
    const N = plan.floors.length
    const arr: { y: number; geo: ExtrudeGeometry }[] = []
    if (N === 0) return arr // форму ще не обрано → плану немає
    for (let idx = 0; idx <= N; idx++) {
      const fl = plan.floors[Math.max(0, idx - 1)]
      const wantHole = idx >= 1 && idx <= N - 1
      const stairs = wantHole ? fl.rooms.find((r) => r.type === 'stairs') : undefined
      const hole = stairs ? bounds(stairs) : null
      arr.push({ y: idx * FLOOR_H, geo: plateGeometry(outline(fl.slab), hole) })
    }
    return arr
  }, [plan])

  // Отвори (вікна/двері) на зовнішніх стінах кімнат.
  const openings = useMemo(() => {
    const terrace2 = config.extras2.includes('terrace')
    const win: WindowType = config.windows ?? 'standard'
    const out: { floorIdx: number; axis: 'x' | 'z'; face: number; perp: number; width: number; sill: number; height: number }[] = []
    plan.floors.forEach((fl, floorIdx) => {
      fl.rooms.forEach((room) => {
        const specW = WIN_WIDTH[room.type]
        if (specW == null) return
        const b = bounds(room)
        const sides = (
          [
            ['xmax', b.x1 + WALL_T / 2, (b.z0 + b.z1) / 2, b.z1 - b.z0, 'x'],
            ['xmin', b.x0 - WALL_T / 2, (b.z0 + b.z1) / 2, b.z1 - b.z0, 'x'],
            ['zmax', b.z1 + WALL_T / 2, (b.x0 + b.x1) / 2, b.x1 - b.x0, 'z'],
            ['zmin', b.z0 - WALL_T / 2, (b.x0 + b.x1) / 2, b.x1 - b.x0, 'z'],
          ] as const
        ).filter(([side]) => isExterior(fl.rooms, room, side))
        if (sides.length === 0) return
        sides.sort((a, c) => c[3] - a[3]) // найширша сторона перша
        const doorRoom = isDoorRoom(room.type, floorIdx, terrace2)
        sides.forEach(([, face, perp, sideLen, axis], i) => {
          const width = Math.min(specW, sideLen - WIN_MARGIN)
          if (width < 0.4) return // замало місця на стіні
          const { sill, height } = verticalSpec(room.type, floorIdx, win, doorRoom && i === 0)
          out.push({ floorIdx, axis, face, perp, width, sill, height })
        })
      })
    })
    return out
  }, [plan, config.windows, config.extras2])

  useFrame((_, dt) => {
    if (ref.current) easing.damp(ref.current.scale, 'y', show ? 1 : 0.0001, RISE_EASE, dt)
  })

  return (
    <group ref={ref} visible={show} scale={[1, 0.0001, 1]}>
      {/* Стіни — на всю висоту поверху */}
      {plan.floors.map((_, idx) =>
        wallFloors[idx].map((seg, i) => (
          <mesh
            key={`wall-${idx}-${i}`}
            position={[seg.cx, idx * FLOOR_H + FLOOR_H / 2, seg.cz]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[seg.horizontal ? seg.len : WALL_T, FLOOR_H, seg.horizontal ? WALL_T : seg.len]} />
            <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
          </mesh>
        )),
      )}

      {/* Перекриття (підлога / міжповерхові / кришка) */}
      {plates.map((p, i) => (
        <mesh key={`plate-${i}`} geometry={p.geo} position={[0, p.y - PLATE_T / 2, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={PLATE_COLOR} roughness={0.9} />
        </mesh>
      ))}

      {/* Вікна та двері — темні скляні панелі на зовнішніх стінах */}
      {openings.map((o, i) => {
        const y = o.floorIdx * FLOOR_H + o.sill + o.height / 2
        return (
          <mesh
            key={`win-${i}`}
            position={o.axis === 'x' ? [o.face, y, o.perp] : [o.perp, y, o.face]}
          >
            <boxGeometry args={o.axis === 'x' ? [PANEL_D, o.height, o.width] : [o.width, o.height, PANEL_D]} />
            <meshStandardMaterial color={GLASS_COLOR} roughness={0.15} metalness={0.1} />
          </mesh>
        )
      })}
    </group>
  )
}
