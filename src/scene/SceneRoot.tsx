import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { easing } from 'maath'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useConfigurator, useHousePlan } from '../state/store'
import Ground from './Ground'
import PlanView from './PlanView'
import HouseShell from './HouseShell'

const FOV = 40

// Плавний переліт камери у вид зверху, поки topView активний.
// Висота підбирається під розмір плану, щоб великі будинки (5 спалень)
// повністю вмістились у кадр. Щойно користувач починає крутити —
// режим вимикається і камера знову вільна.
function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const topView = useConfigurator((s) => s.topView)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const plan = useHousePlan()

  const fitHeight = useMemo(() => {
    const floor = plan.floors[Math.min(viewFloor, plan.floors.length) - 1]
    if (!floor) return 26
    let ext = 0
    for (const s of floor.slab) {
      ext = Math.max(ext, Math.abs(s.x) + s.width / 2, Math.abs(s.z) + s.depth / 2)
    }
    const maxDim = ext * 2
    const h = (maxDim / 2) * 1.35 / Math.tan(((FOV / 2) * Math.PI) / 180)
    return Math.max(22, h)
  }, [plan, viewFloor])

  useFrame((state, delta) => {
    if (!topView || !controls.current) return
    easing.damp3(state.camera.position, [0, fitHeight, 0.4], 0.45, delta)
    easing.damp3(controls.current.target, [0, 0, 0], 0.45, delta)
    controls.current.update()
  })

  return null
}

export default function SceneRoot() {
  const setTopView = useConfigurator((s) => s.setTopView)
  const controlsRef = useRef<OrbitControlsImpl>(null)

  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: FOV, position: [14, 10, 14] }}
      style={{ position: 'absolute', inset: 0 }}
      onCreated={({ gl }) => {
        gl.toneMapping = ACESFilmicToneMapping
        gl.toneMappingExposure = 1.1
      }}
    >
      <color attach="background" args={['#f4f6f2']} />
      <fog attach="fog" args={['#f4f6f2', 55, 120]} />

      {/* Небо + земля як два джерела кольору — дає об'єм і теплі тіні */}
      <hemisphereLight args={['#fdfbf5', '#9aa789', 0.75]} />
      <ambientLight intensity={0.35} />

      {/* Головне «сонце» — тепле, дає чіткі м'які тіні */}
      {/* normalBias зсуває вибірку тіні ВЗДОВЖ НОРМАЛІ поверхні — саме він
          прибирає «драбинку» самозатінення на стінах і відрив тіні біля основи.
          Робити це через shadow-bias не можна: він або лишає смуги, або
          відриває тінь від об'єкта. Ширша камера тіні + карта 4096 — щоб великі
          будинки не виходили за її межі й лишалась різкість. */}
      <directionalLight
        position={[12, 16, 8]}
        intensity={2.4}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0001}
        shadow-normalBias={0.04}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />
      {/* Заповнююче світло з протилежного боку — прибирає чорні тіні */}
      <directionalLight position={[-10, 8, -6]} intensity={0.5} color="#cfe0ff" />

      <Ground />
      <PlanView />
      <HouseShell />

      <OrbitControls
        ref={controlsRef}
        target={[0, 1.2, 0]}
        enablePan={false}
        minDistance={10}
        maxDistance={60}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2 - 0.12}
        onStart={() => setTopView(false)}
      />
      <CameraRig controls={controlsRef} />
    </Canvas>
  )
}
