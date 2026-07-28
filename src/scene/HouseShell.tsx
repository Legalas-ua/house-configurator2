import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import type { Mesh } from 'three'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { generateHousePlan } from '../lib/floorplan'
import type { PlanRect } from '../config/types'

// ============================================================
// 3D-оболонка будинку (Фаза A): зовнішні стіни, підняті з контуру плану.
// Показуємо ЛИШЕ на кроці «Вікна» — там стіни плавно «виростають», щоб на них
// далі (Зріз 2) розставити вікна/двері. Мінімалістично: світлі тонкі стіни,
// без внутрішніх перегородок і поки без даху.
// ============================================================

const FLOOR_H = 3.0 // висота поверху (стос) — як у PlanView
const WALL_H = 2.8 // висота стіни
const WALL_T = 0.18 // товщина стіни
const SLAB_TOP = 0.1 // верх плити — від нього ростуть стіни
const WALL_COLOR = '#ece7de' // теплий світлий тиньк (як у референсі)
const RISE_EASE = 0.5 // плавний підйом стін

// Осепаралельний відрізок зовнішньої стіни.
interface WallSeg {
  cx: number
  cz: number
  len: number
  horizontal: boolean
}

function bounds(r: PlanRect) {
  return { x0: r.x - r.width / 2, x1: r.x + r.width / 2, z0: r.z - r.depth / 2, z1: r.z + r.depth / 2 }
}

// Зовнішній контур поверху з плити. Г-подібний = 2 прямокутники (нічне крило
// зверху + денне ширше знизу, ліво-вирівняні) → 6-кутник. Прямокутний/квадратний
// (1 прямокутник) → просто 4 кути.
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
  // Нічне крило = прямокутник із меншим z-центром (вище); денне — нижче й ширше.
  const [n, d] = slab[0].z < slab[1].z ? [bounds(slab[0]), bounds(slab[1])] : [bounds(slab[1]), bounds(slab[0])]
  return [
    [n.x0, n.z0], // верх-ліво
    [n.x1, n.z0], // верх-право (нічне)
    [n.x1, n.z1], // сходинка всередину
    [d.x1, d.z0], // вихід на ширше денне крило (d.z0 == n.z1)
    [d.x1, d.z1], // право-низ (денне)
    [d.x0, d.z1], // низ-ліво
  ]
}

// Ребра контуру → відрізки стін (кожне ребро осепаралельне).
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

// Одна стіна: плавно «виростає» вгору (scale.y), зафіксована нижньою гранню.
function WallMesh({ seg, baseY, show }: { seg: WallSeg; baseY: number; show: boolean }) {
  const ref = useRef<Mesh>(null)
  const w = seg.horizontal ? seg.len : WALL_T
  const d = seg.horizontal ? WALL_T : seg.len
  useFrame((_, dt) => {
    const m = ref.current
    if (!m) return
    easing.damp(m.scale, 'y', show ? 1 : 0.0001, RISE_EASE, dt)
    m.position.y = baseY + (WALL_H * m.scale.y) / 2 // якір — нижня грань
  })
  return (
    <mesh ref={ref} position={[seg.cx, baseY, seg.cz]} scale={[1, 0.0001, 1]} castShadow receiveShadow>
      <boxGeometry args={[w, WALL_H, d]} />
      <meshStandardMaterial color={WALL_COLOR} roughness={0.9} />
    </mesh>
  )
}

export default function HouseShell() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const floorSegs = useMemo(() => plan.floors.map((fl) => segments(outline(fl.slab))), [plan])
  const show = STEPS[currentStep].id === 'windows'

  return (
    <group>
      {plan.floors.map((_, idx) => {
        const baseY = idx * FLOOR_H + SLAB_TOP
        return floorSegs[idx].map((seg, i) => (
          <WallMesh key={`wall-${idx}-${i}`} seg={seg} baseY={baseY} show={show} />
        ))
      })}
    </group>
  )
}
