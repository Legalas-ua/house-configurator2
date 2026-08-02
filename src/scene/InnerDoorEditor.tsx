import { useEffect, useRef, useState } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Raycaster, Vector2, type Camera } from 'three'
import { useConfigurator } from '../state/store'
import { doorRange, fitDoor, updateDoor, type InnerWall, type ResolvedDoor } from '../lib/innerWalls'

// Розстановка внутрішніх дверей. Правила ті самі, що й у редакторі вікон:
// клікаєш перегородку — вона підсвічується, кнопкою в панелі додаєш отвір,
// далі тягнеш його вздовж стіни, а ручки на краях міняють ширину.

const FLOOR_H = 3.2
const WALL_H = 3.0
const HANDLE = 0.16
const HANDLE_COLOR = '#d9622b'
const PICK_OUT = 0.09 // накладка стоїть перед перегородкою, щоб ловити клік

const pickRay = new Raycaster()
const pickNdc = new Vector2()

// Курсор -> координата вздовж осі перегородки. Та сама математика, що й у
// вікон: найближча точка осі до променя. Площина-«ловець» тут не годиться —
// під низькою камерою вона майже паралельна променю.
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
  const v = pickRay.ray.direction
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

interface Drag {
  id: string
  mode: 'move' | 'uStart' | 'uEnd'
  start: number
  u: number
  width: number
  horizontal: boolean
  line: number
  y: number
}

export default function InnerDoorEditor({ walls, openings }: { walls: InnerWall[]; openings: ResolvedDoor[] }) {
  const selectedWall = useConfigurator((s) => s.selectedInnerWall)
  const setSelectedWall = useConfigurator((s) => s.setSelectedInnerWall)
  const selected = useConfigurator((s) => s.selectedInnerDoor)
  const setSelected = useConfigurator((s) => s.setSelectedInnerDoor)
  const doors = useConfigurator((s) => s.innerDoors)
  const setDoors = useConfigurator((s) => s.setInnerDoors)
  const setDragging = useConfigurator((s) => s.setDragging)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const [hover, setHover] = useState<string | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const hit = useRef(false)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  const moveRef = useRef<(d: number) => void>(() => {})

  moveRef.current = (d: number) => {
    const dg = dragRef.current
    if (!dg) return
    const door = doors.find((x) => x.id === dg.id)
    const wall = walls.find((w) => w.id === door?.wallId)
    if (!door || !wall) return
    const next =
      dg.mode === 'move'
        ? fitDoor(door, wall, dg.u + d, dg.width)
        : dg.mode === 'uStart'
          ? fitDoor(door, wall, dg.u + d, dg.width - d)
          : fitDoor(door, wall, dg.u, dg.width + d)
    setDoors(updateDoor(doors, dg.id, next))
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setSelected(null)
      setSelectedWall(null)
    }
    const up = () => {
      hit.current = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', up)
    }
  }, [setSelected, setSelectedWall])

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

  const sel = openings.find((o) => o.id === selected)

  const grab = (o: ResolvedDoor, mode: Drag['mode'], e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hit.current = true
    setSelected(o.id)
    setSelectedWall(o.wallId)
    setDragging(true)
    const y = o.baseY + o.height / 2
    const start = alongAxis(e.nativeEvent, gl.domElement, camera, o.horizontal, o.line, y)
    const next: Drag = {
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

  return (
    <>
      {/* Клік по порожньому знімає вибір; поріг 4 px — щоб обертання камери не скидало */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.07, 0]}
        onPointerDown={(e) => {
          downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        }}
        onPointerUp={(e) => {
          const d = downAt.current
          downAt.current = null
          if (hit.current) return
          if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 4) {
            setSelected(null)
            setSelectedWall(null)
          }
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Накладки на перегородки — вибір стіни під нові двері */}
      {walls.map((w) => {
        const { from, to } = doorRange(w)
        const mid = w.a + (from + to) / 2
        const on = selectedWall === w.id
        const hot = hover === w.id
        return (
          <mesh
            key={w.id}
            position={[
              w.horizontal ? mid : w.line,
              w.floor * FLOOR_H + WALL_H / 2,
              w.horizontal ? w.line : mid,
            ]}
            rotation-y={w.rotY}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(w.id)
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              setHover((c) => (c === w.id ? null : c))
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              hit.current = true
              setSelectedWall(on ? null : w.id)
              setSelected(null)
            }}
          >
            <boxGeometry args={[Math.max(to - from, 0.1), WALL_H, PICK_OUT]} />
            <meshStandardMaterial
              color={HANDLE_COLOR}
              emissive={HANDLE_COLOR}
              emissiveIntensity={on ? 0.35 : 0}
              transparent
              opacity={on ? 0.45 : hot ? 0.22 : 0.001}
              depthWrite={false}
            />
          </mesh>
        )
      })}

      {/* Накладки на самі отвори — вибір і перетягування */}
      {openings.map((o) => (
        <mesh
          key={`hit-${o.id}`}
          position={[
            o.horizontal ? (o.a + o.b) / 2 : o.line,
            o.baseY + o.height / 2,
            o.horizontal ? o.line : (o.a + o.b) / 2,
          ]}
          rotation-y={o.rotY}
          onPointerDown={(e) => grab(o, 'move', e)}
        >
          <boxGeometry args={[o.width, o.height, PICK_OUT + 0.04]} />
          <meshStandardMaterial
            color={HANDLE_COLOR}
            emissive={HANDLE_COLOR}
            emissiveIntensity={o.id === selected ? 0.4 : 0}
            transparent
            opacity={o.id === selected ? 0.4 : 0.001}
            depthWrite={false}
          />
        </mesh>
      ))}

      {/* Ручки ширини на краях обраного отвору */}
      {sel &&
        (['uStart', 'uEnd'] as const).map((mode) => {
          const at = mode === 'uStart' ? sel.a : sel.b
          return (
            <mesh
              key={mode}
              position={[
                sel.horizontal ? at : sel.line,
                sel.baseY + sel.height / 2,
                sel.horizontal ? sel.line : at,
              ]}
              onPointerDown={(e) => grab(sel, mode, e)}
            >
              <boxGeometry args={[HANDLE, HANDLE, HANDLE]} />
              <meshStandardMaterial color={HANDLE_COLOR} emissive={HANDLE_COLOR} emissiveIntensity={0.45} />
            </mesh>
          )
        })}
    </>
  )
}
