import { useMemo, useState } from 'react'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { ROOM_COLORS } from '../config/plan'
import type { RoomZone } from '../config/types'
import { generateHousePlan } from '../lib/floorplan'
import { t } from '../locales'
import { useEntrance } from './useEntrance'

const GAP = 0.08 // зазор між РІЗНИМИ кімнатами
const EPS = 0.01

// Межі прямокутника зони
function box(r: RoomZone) {
  return { x0: r.x - r.width / 2, x1: r.x + r.width / 2, z0: r.z - r.depth / 2, z1: r.z + r.depth / 2 }
}
const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0) > EPS

// Чи є сусід тієї ж групи через задану сторону (тоді шва між ними немає)
function hasNeighbor(
  rooms: RoomZone[],
  i: number,
  side: 'left' | 'right' | 'front' | 'back',
): boolean {
  const a = box(rooms[i])
  const g = rooms[i].group
  if (!g) return false
  return rooms.some((r, j) => {
    if (j === i || r.group !== g) return false
    const c = box(r)
    if (side === 'left') return Math.abs(c.x1 - a.x0) < EPS && overlap(a.z0, a.z1, c.z0, c.z1)
    if (side === 'right') return Math.abs(c.x0 - a.x1) < EPS && overlap(a.z0, a.z1, c.z0, c.z1)
    if (side === 'front') return Math.abs(c.z1 - a.z0) < EPS && overlap(a.x0, a.x1, c.x0, c.x1)
    return Math.abs(c.z0 - a.z1) < EPS && overlap(a.x0, a.x1, c.x0, c.x1) // back
  })
}

// План будинку на землі. На кроці «Кімнати» — кольорові зони.
// Частини однієї кімнати (group) стикуються без шва; при наведенні
// підсвічується вся кімната, а DOM-підказка показує назву й площу.
export default function PlanView() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setHovered = useConfigurator((s) => s.setHovered)

  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const plan = useMemo(() => generateHousePlan(config), [config])
  const entranceRef = useEntrance()

  if (plan.floors.length === 0) return null

  const showZones = STEPS[currentStep].id === 'rooms'
  const floor = plan.floors[Math.min(viewFloor, plan.floors.length) - 1]

  // Площа приміщення (сума частин однієї групи)
  const areaOf = (room: RoomZone) => {
    if (!room.group) return room.width * room.depth
    return floor.rooms
      .filter((r) => r.group === room.group)
      .reduce((s, r) => s + r.width * r.depth, 0)
  }

  return (
    <group ref={entranceRef} scale={0} key={config.shape}>
      {/* Плита поверху */}
      {floor.slab.map((r, i) => (
        <mesh key={`slab-${i}`} position={[r.x, 0.09, r.z]} receiveShadow>
          <boxGeometry args={[r.width, 0.16, r.depth]} />
          <meshStandardMaterial color="#faf7f0" roughness={0.6} />
        </mesh>
      ))}

      {/* Зони кімнат */}
      {showZones &&
        floor.rooms.map((room, i) => {
          const key = room.group ?? `__${i}`
          const isHover = hoverKey === key
          // Зазор лише там, де межа з ІНШОЮ кімнатою (не всередині групи)
          const l = hasNeighbor(floor.rooms, i, 'left') ? 0 : GAP / 2
          const r = hasNeighbor(floor.rooms, i, 'right') ? 0 : GAP / 2
          const f = hasNeighbor(floor.rooms, i, 'front') ? 0 : GAP / 2
          const bk = hasNeighbor(floor.rooms, i, 'back') ? 0 : GAP / 2
          const w = Math.max(room.width - l - r, 0.15)
          const d = Math.max(room.depth - f - bk, 0.15)
          const cx = room.x + (l - r) / 2
          const cz = room.z + (f - bk) / 2
          return (
            <mesh
              key={`room-${i}`}
              position={[cx, isHover ? 0.26 : 0.18, cz]}
              castShadow
              onPointerOver={(e) => {
                e.stopPropagation()
                setHoverKey(key)
                setHovered({
                  name: t.plan.roomNames[room.type],
                  area: Math.round(areaOf(room)),
                  mx: e.nativeEvent.clientX,
                  my: e.nativeEvent.clientY,
                })
              }}
              onPointerMove={(e) => {
                e.stopPropagation()
                setHovered({
                  name: t.plan.roomNames[room.type],
                  area: Math.round(areaOf(room)),
                  mx: e.nativeEvent.clientX,
                  my: e.nativeEvent.clientY,
                })
              }}
              onPointerOut={(e) => {
                e.stopPropagation()
                setHoverKey((cur) => (cur === key ? null : cur))
                setHovered(null)
              }}
            >
              <boxGeometry args={[w, 0.14, d]} />
              <meshStandardMaterial
                color={ROOM_COLORS[room.type]}
                roughness={0.55}
                emissive="#ffffff"
                emissiveIntensity={isHover ? 0.28 : 0}
              />
            </mesh>
          )
        })}
    </group>
  )
}
