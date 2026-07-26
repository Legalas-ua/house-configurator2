import { useMemo, useState } from 'react'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { ROOM_COLORS } from '../config/plan'
import { generateHousePlan } from '../lib/floorplan'
import { t } from '../locales'
import { useEntrance } from './useEntrance'

const ZONE_GAP = 0.08 // зазор між зонами, щоб кімнати читались окремо

// План будинку на землі:
// - крок «Форма»: підсвічений контур (плита + теракотова окантовка)
// - крок «Кімнати»: та сама плита + кольорові зони кімнат.
// При наведенні зона підсвічується й піднімається, а DOM-підказка
// (компонент RoomTooltip) показує назву й площу.
export default function PlanView() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setHovered = useConfigurator((s) => s.setHovered)

  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const plan = useMemo(() => generateHousePlan(config), [config])
  const entranceRef = useEntrance()

  if (plan.floors.length === 0) return null

  const showZones = STEPS[currentStep].id === 'rooms'
  const floor = plan.floors[Math.min(viewFloor, plan.floors.length) - 1]

  return (
    <group ref={entranceRef} scale={0} key={config.shape}>
      {/* Окантовка-підсвітка */}
      {floor.slab.map((r, i) => (
        <mesh key={`edge-${i}`} position={[r.x, 0.04, r.z]} castShadow>
          <boxGeometry args={[r.width + 0.3, 0.16, r.depth + 0.3]} />
          <meshStandardMaterial color="#e05c2a" roughness={0.5} />
        </mesh>
      ))}

      {/* Плита поверху */}
      {floor.slab.map((r, i) => (
        <mesh key={`slab-${i}`} position={[r.x, 0.14, r.z]} receiveShadow>
          <boxGeometry args={[r.width, 0.12, r.depth]} />
          <meshStandardMaterial color="#faf7f0" roughness={0.6} />
        </mesh>
      ))}

      {/* Зони кімнат */}
      {showZones &&
        floor.rooms.map((room, i) => {
          const isHover = hoverIdx === i
          return (
            <mesh
              key={`room-${i}`}
              position={[room.x, isHover ? 0.32 : 0.24, room.z]}
              castShadow
              onPointerOver={(e) => {
                e.stopPropagation()
                setHoverIdx(i)
                setHovered({
                  name: t.plan.roomNames[room.type],
                  area: Math.round(room.width * room.depth),
                  mx: e.nativeEvent.clientX,
                  my: e.nativeEvent.clientY,
                })
              }}
              onPointerMove={(e) => {
                e.stopPropagation()
                setHovered({
                  name: t.plan.roomNames[room.type],
                  area: Math.round(room.width * room.depth),
                  mx: e.nativeEvent.clientX,
                  my: e.nativeEvent.clientY,
                })
              }}
              onPointerOut={(e) => {
                e.stopPropagation()
                setHoverIdx((cur) => (cur === i ? null : cur))
                setHovered(null)
              }}
            >
              <boxGeometry
                args={[
                  Math.max(room.width - ZONE_GAP, 0.2),
                  0.14,
                  Math.max(room.depth - ZONE_GAP, 0.2),
                ]}
              />
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
