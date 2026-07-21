import { useMemo } from 'react'
import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { ROOM_COLORS } from '../config/plan'
import { generateHousePlan } from '../lib/floorplan'
import { useEntrance } from './useEntrance'

const ZONE_GAP = 0.08 // зазор між зонами, щоб кімнати читались окремо

// План будинку на землі:
// - крок «Форма»: підсвічений контур (плита + теракотова окантовка)
// - крок «Кімнати»: та сама плита + кольорові зони кімнат
export default function PlanView() {
  const config = useConfigurator((s) => s.config)
  const currentStep = useConfigurator((s) => s.currentStep)
  const viewFloor = useConfigurator((s) => s.viewFloor)

  const plan = useMemo(() => generateHousePlan(config), [config])
  const entranceRef = useEntrance()

  if (plan.floors.length === 0) return null

  const showZones = STEPS[currentStep].id === 'rooms'
  const floor = plan.floors[Math.min(viewFloor, plan.floors.length) - 1]

  return (
    <group ref={entranceRef} scale={0} key={config.shape}>
      {/* Окантовка-підсвітка: трохи більша плита акцентного кольору */}
      {floor.slab.map((r, i) => (
        <mesh key={`edge-${i}`} position={[r.x, 0.03, r.z]}>
          <boxGeometry args={[r.width + 0.35, 0.06, r.depth + 0.35]} />
          <meshStandardMaterial color="#e05c2a" />
        </mesh>
      ))}

      {/* Плита поверху */}
      {floor.slab.map((r, i) => (
        <mesh key={`slab-${i}`} position={[r.x, 0.09, r.z]}>
          <boxGeometry args={[r.width, 0.08, r.depth]} />
          <meshStandardMaterial color="#f2ede4" />
        </mesh>
      ))}

      {/* Зони кімнат */}
      {showZones &&
        floor.rooms.map((room, i) => (
          <mesh key={`room-${i}`} position={[room.x, 0.16, room.z]}>
            <boxGeometry
              args={[
                Math.max(room.width - ZONE_GAP, 0.2),
                0.07,
                Math.max(room.depth - ZONE_GAP, 0.2),
              ]}
            />
            <meshStandardMaterial color={ROOM_COLORS[room.type]} />
          </mesh>
        ))}
    </group>
  )
}
