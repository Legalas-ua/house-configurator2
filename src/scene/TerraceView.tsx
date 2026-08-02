import { useEffect, useMemo, useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useConfigurator, useHousePlan } from '../state/store'
import { STEPS } from '../config/steps'
import { MIN_SIDE, snap, GRID } from '../lib/editPlan'
import { houseOutline, updateTerrace, validateTerrace, type TerraceZone } from '../lib/terrace'
import type { PlanRect } from '../config/types'
import { t } from '../locales'

// Зони тераси на землі. Той самий редактор, що й у зон даху: тягнеш зону — вона
// їде, теракотові ручки на гранях міняють розмір. Відмінності дві — сітка
// прив'язки під ногами і синій контур будинку, за який заходити не можна.

const HANDLE = 0.45
const HANDLE_COLOR = '#d9622b'
const OUTLINE_COLOR = '#2f6fb8'
const ZONE_COLOR = '#b08968'
const ISSUE_COLOR = '#c0392b'
const Y = 0.06 // трохи над землею, щоб не мерехтіло з газоном

type DragMode = 'move' | 'xmin' | 'xmax' | 'zmin' | 'zmax'

interface Drag {
  id: string
  mode: DragMode
  px: number
  pz: number
  rect: PlanRect
}

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
    const n = Math.min(snap(x0 + dx), x1 - MIN_SIDE)
    return { ...r, x: (n + x1) / 2, width: x1 - n }
  }
  if (drag.mode === 'xmax') {
    const n = Math.max(snap(x1 + dx), x0 + MIN_SIDE)
    return { ...r, x: (x0 + n) / 2, width: n - x0 }
  }
  if (drag.mode === 'zmin') {
    const n = Math.min(snap(z0 + dz), z1 - MIN_SIDE)
    return { ...r, z: (n + z1) / 2, depth: z1 - n }
  }
  const n = Math.max(snap(z1 + dz), z0 + MIN_SIDE)
  return { ...r, z: (z0 + n) / 2, depth: n - z0 }
}

function Grid() {
  const geo = useMemo(() => {
    const half = 18
    const pts: number[] = []
    for (let v = -half; v <= half + 1e-6; v += GRID) {
      pts.push(-half, 0, v, half, 0, v, v, 0, -half, v, 0, half)
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [])
  return (
    <lineSegments geometry={geo} position={[0, 0.01, 0]}>
      <lineBasicMaterial color="#5c6b52" transparent opacity={0.2} depthWrite={false} />
    </lineSegments>
  )
}

export default function TerraceView() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const plan = useHousePlan()
  const zones = useConfigurator((s) => s.terraceZones)
  const setZones = useConfigurator((s) => s.setTerraceZones)
  const selected = useConfigurator((s) => s.selectedTerrace)
  const setSelected = useConfigurator((s) => s.setSelectedTerrace)
  const setDragging = useConfigurator((s) => s.setDragging)
  const showGrid = useConfigurator((s) => s.showGrid)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const hitZone = useRef(false)

  const active = STEPS[currentStep].id === 'terrace'

  const outlineGeo = useMemo(() => {
    const pts: number[] = []
    for (const { pts: ring } of houseOutline(plan)) {
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i]
        const [x1, z1] = ring[(i + 1) % ring.length]
        pts.push(x0, 0, z0, x1, 0, z1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [plan])

  const issues = useMemo(() => (active ? validateTerrace(plan, zones) : []), [active, plan, zones])
  const bad = new Set(issues.map((i) => i.id))

  useEffect(() => {
    if (!drag) return
    const up = () => {
      setDrag(null)
      setDragging(false)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [drag, setDragging])

  useEffect(() => {
    if (!active) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    const up = () => {
      hitZone.current = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', up)
    }
  }, [active, setSelected])

  if (!active) return null

  const sel = zones.find((z) => z.id === selected)

  const grab = (zone: TerraceZone, mode: DragMode, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hitZone.current = true
    setSelected(zone.id)
    setDragging(true)
    setDrag({
      id: zone.id,
      mode,
      px: e.point.x,
      pz: e.point.z,
      rect: { x: zone.x, z: zone.z, width: zone.width, depth: zone.depth },
    })
  }

  const move = (x: number, z: number) => {
    if (!drag) return
    setZones(updateTerrace(zones, drag.id, dragRect(drag, x, z)))
  }

  const handles: { mode: DragMode; x: number; z: number }[] = sel
    ? [
        { mode: 'xmin', x: sel.x - sel.width / 2, z: sel.z },
        { mode: 'xmax', x: sel.x + sel.width / 2, z: sel.z },
        { mode: 'zmin', x: sel.x, z: sel.z - sel.depth / 2 },
        { mode: 'zmax', x: sel.x, z: sel.z + sel.depth / 2 },
      ]
    : []

  return (
    <group position={[0, 0, 0]}>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.005, 0]}
        onPointerDown={(e) => {
          downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        }}
        onPointerUp={(e) => {
          const d = downAt.current
          downAt.current = null
          if (hitZone.current) return
          if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 4) setSelected(null)
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {showGrid && <Grid />}

      {/* Контур будинку — межа, за яку тераса заходити не може */}
      <lineSegments geometry={outlineGeo} position={[0, 0.03, 0]}>
        <lineBasicMaterial color={OUTLINE_COLOR} transparent opacity={0.9} depthTest={false} />
      </lineSegments>

      {zones.map((zn) => {
        const on = zn.id === selected
        const hot = hover === zn.id
        const err = bad.has(zn.id)
        return (
          <mesh
            key={zn.id}
            position={[zn.x, Y, zn.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(zn.id)
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              setHover((c) => (c === zn.id ? null : c))
            }}
            onPointerDown={(e) => grab(zn, 'move', e)}
            onPointerUp={(e) => e.stopPropagation()}
          >
            <planeGeometry args={[zn.width, zn.depth]} />
            <meshBasicMaterial
              color={err ? ISSUE_COLOR : ZONE_COLOR}
              transparent
              opacity={err ? 0.6 : on ? 0.8 : hot ? 0.6 : 0.45}
              depthWrite={false}
            />
          </mesh>
        )
      })}

      {/* Розміри обраної зони — як у зон планування */}
      {sel && (
        <>
          {[
            { key: 'w', value: sel.width, x: sel.x, z: sel.z - sel.depth / 2 - 0.55 },
            { key: 'd', value: sel.depth, x: sel.x + sel.width / 2 + 0.55, z: sel.z },
          ].map((l) => (
            <Html key={l.key} position={[l.x, 0.4, l.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span className="plan-size">{t.plan.meters(l.value)}</span>
            </Html>
          ))}
        </>
      )}

      {handles.map((h) => (
        <mesh key={h.mode} position={[h.x, 0.22, h.z]} onPointerDown={(e) => grab(sel!, h.mode, e)}>
          <boxGeometry args={[HANDLE, 0.12, HANDLE]} />
          <meshStandardMaterial color={HANDLE_COLOR} emissive={HANDLE_COLOR} emissiveIntensity={0.45} />
        </mesh>
      ))}

      {drag && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.15, 0]}
          onPointerMove={(e) => {
            e.stopPropagation()
            move(e.point.x, e.point.z)
          }}
        >
          <planeGeometry args={[200, 200]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      )}
    </group>
  )
}
