import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { ACESFilmicToneMapping } from 'three'
import { easing } from 'maath'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useConfigurator } from '../state/store'
import Ground from './Ground'
import PlanView from './PlanView'

// Плавний переліт камери у вид зверху, поки topView активний.
// Щойно користувач починає крутити мишею — режим вимикається
// і камера знову вільна (перехід плавний, бо обертання стартує
// з поточної позиції).
function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const topView = useConfigurator((s) => s.topView)

  useFrame((state, delta) => {
    if (!topView || !controls.current) return
    easing.damp3(state.camera.position, [0, 30, 0.4], 0.45, delta)
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
      camera={{ fov: 40, position: [14, 10, 14] }}
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
      <directionalLight
        position={[12, 16, 8]}
        intensity={2.4}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-16}
        shadow-camera-right={16}
        shadow-camera-top={16}
        shadow-camera-bottom={-16}
      />
      {/* Заповнююче світло з протилежного боку — прибирає чорні тіні */}
      <directionalLight position={[-10, 8, -6]} intensity={0.5} color="#cfe0ff" />

      <Ground />
      <PlanView />

      <OrbitControls
        ref={controlsRef}
        target={[0, 1.2, 0]}
        enablePan={false}
        minDistance={10}
        maxDistance={35}
        minPolarAngle={0}
        maxPolarAngle={Math.PI / 2 - 0.12}
        onStart={() => setTopView(false)}
      />
      <CameraRig controls={controlsRef} />
    </Canvas>
  )
}
