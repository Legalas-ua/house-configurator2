import { useEffect, useMemo, useRef, useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useConfigurator, useHousePlan, useRoof } from '../state/store'
import { STEPS } from '../config/steps'
import { MIN_SIDE, snap } from '../lib/editPlan'
import { levelOutline, roofLevels, updateRoofPart, type RoofPart } from '../lib/roof'
import type { PlanRect } from '../config/types'

// ============================================================
// Зони даху на площині ПОКРИТТЯ поверху. Малюються так само, як зони
// планування, тільки підняті на висоту перекриття: тягнеш зону — вона їде,
// теракотові ручки на гранях міняють розмір.
// ============================================================

const FLOOR_H = 3.2 // крок поверху — як у HouseShell
const HANDLE = 0.45
const HANDLE_COLOR = '#d9622b'
const OUTLINE_COLOR = '#2f6fb8'

const KIND_COLOR: Record<RoofPart['kind'], string> = {
  flat: '#9fb2c4',
  gable: '#c98b6b',
  mono: '#8fbf9f',
}

type DragMode = 'move' | 'xmin' | 'xmax' | 'zmin' | 'zmax'

interface Drag {
  id: string
  mode: DragMode
  px: number
  pz: number
  rect: PlanRect
}

// Новий прямокутник за зсувом курсора: для граней рухається ЛИШЕ та грань.
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

export default function RoofView() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const roofMode = useConfigurator((s) => s.roofMode)
  const plan = useHousePlan()
  const parts = useRoof()
  const setCustomRoof = useConfigurator((s) => s.setCustomRoof)
  const selected = useConfigurator((s) => s.selectedRoofPart)
  const setSelected = useConfigurator((s) => s.setSelectedRoofPart)
  const setDragging = useConfigurator((s) => s.setDragging)
  const roofLevel = useConfigurator((s) => s.roofLevel)

  const [drag, setDrag] = useState<Drag | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  // Чи потрапило натискання по САМІЙ зоні. Порядок обходу перетинів залежить
  // від камери: коли її опустити низько, промінь іде ВГОРУ і підкладка (вона
  // трохи нижче зон) трапляється РАНІШЕ за зону. Тоді її pointerup встигав
  // зняти вибір, зроблений мілісекундою раніше, — дах першого поверху
  // «виділявся і одразу гаснув». Прапорець від порядку не залежить: на
  // pointerdown його ставить зона, а підкладка лише читає.
  const hitPart = useRef(false)
  const [hover, setHover] = useState<string | null>(null)

  const levels = roofLevels(plan)
  const level = levels.includes(roofLevel) ? roofLevel : (levels[0] ?? 0)
  const stepId = STEPS[currentStep].id
  // draw — крок «Форма даху»: пласкі зони з ручками, дах ще не виріс.
  // pick — крок «Дах»: зони вже об'ємні, тут лише вибираємо частину.
  // Малювання — тільки у своєму режимі. А ВИБІР частини доступний в обох:
  // у готовому даху контур заданий наперед, але кожен його сегмент так само
  // можна виділити й налаштувати.
  const drawing = stepId === 'roofZones' && roofMode === 'custom'
  // На кроці «Матеріали даху» частину теж обирають кліком — тими самими
  // площинами-ловцями, що й на кроці «Дах».
  const active = (drawing || stepId === 'roof' || stepId === 'roofMat') && levels.length > 0

  // Контур покриття рівня — орієнтир, куди можна ставити зони.
  const outlineGeo = useMemo(() => {
    const pts: number[] = []
    for (const { pts: ring } of levelOutline(plan, level)) {
      for (let i = 0; i < ring.length; i++) {
        const [x0, z0] = ring[i]
        const [x1, z1] = ring[(i + 1) % ring.length]
        pts.push(x0, 0, z0, x1, 0, z1)
      }
    }
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [plan, level])

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
    // Скидаємо прапорець ПІСЛЯ того, як полотно розібралось із pointerup:
    // слухач на window спрацьовує вже після обробників мешів.
    const up = () => {
      hitPart.current = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', up)
    }
  }, [active, setSelected])

  if (!active) return null

  const y = (level + 1) * FLOOR_H
  // На кроці налаштувань поверх не обирають — показуємо всі зони одразу.
  const mine = drawing ? parts.filter((p) => p.level === level) : parts
  const sel = mine.find((p) => p.id === selected)

  const grab = (part: RoofPart, mode: DragMode, e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hitPart.current = true
    setSelected(part.id)
    setDragging(true)
    setDrag({ id: part.id, mode, px: e.point.x, pz: e.point.z, rect: { x: part.x, z: part.z, width: part.width, depth: part.depth } })
  }

  const move = (x: number, z: number) => {
    if (!drag) return
    setCustomRoof(updateRoofPart(parts, drag.id, dragRect(drag, x, z)))
  }

  const handles: { mode: DragMode; x: number; z: number }[] = sel && drawing
    ? [
        { mode: 'xmin', x: sel.x - sel.width / 2, z: sel.z },
        { mode: 'xmax', x: sel.x + sel.width / 2, z: sel.z },
        { mode: 'zmin', x: sel.x, z: sel.z - sel.depth / 2 },
        { mode: 'zmax', x: sel.x, z: sel.z + sel.depth / 2 },
      ]
    : []

  return (
    <group position={[0, y, 0]}>
      {/* Клік по порожньому знімає вибір (поріг 4 px — щоб обертання камери не скидало) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        onPointerDown={(e) => {
          downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        }}
        onPointerUp={(e) => {
          const d = downAt.current
          downAt.current = null
          if (hitPart.current) return
          if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 4) setSelected(null)
        }}
      >
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {drawing && (
      <lineSegments geometry={outlineGeo} position={[0, 0.05, 0]}>
        <lineBasicMaterial color={OUTLINE_COLOR} transparent opacity={0.85} depthTest={false} />
      </lineSegments>
      )}

      {mine.map((p) => {
        // Зона малюється ПЛОЩИНОЮ, а не об'ємом: об'єм перекривав би ручки.
        // На кроці налаштувань та сама площина просто ловить наведення й клік.
        const dy = (p.level + 1) * FLOOR_H - y
        const hot = hover === p.id
        return (
          <mesh
            key={p.id}
            position={[p.x, dy + 0.06, p.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(p.id)
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              setHover((cur) => (cur === p.id ? null : cur))
            }}
            onPointerDown={(e) => {
              hitPart.current = true
              if (drawing) grab(p, 'move', e)
              else {
                e.stopPropagation()
                setSelected(p.id)
              }
            }}
            // Без цього pointerup доходить до підкладки під зоною, і вона
            // одразу ж знімає щойно зроблений вибір.
            onPointerUp={(e) => e.stopPropagation()}
          >
            <planeGeometry args={[p.width, p.depth]} />
            <meshBasicMaterial
              color={KIND_COLOR[p.kind]}
              transparent
              opacity={drawing ? (p.id === selected ? 0.75 : 0.5) : p.id === selected ? 0.5 : hot ? 0.3 : 0.001}
              depthWrite={false}
              depthTest={drawing}
            />
          </mesh>
        )
      })}

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
