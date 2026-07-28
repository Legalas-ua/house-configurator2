import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { ExtrudeGeometry, Path, Shape, type Group } from 'three'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { generateHousePlan } from '../lib/floorplan'
import type { PlanRect } from '../config/types'

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
    </group>
  )
}
