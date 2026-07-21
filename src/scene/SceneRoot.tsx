import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
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
      shadows
      camera={{ fov: 40, position: [14, 10, 14] }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <color attach="background" args={['#eef0ee']} />
      <fog attach="fog" args={['#eef0ee', 40, 90]} />

      <hemisphereLight args={['#ffffff', '#c8c2b8', 0.9]} />
      <directionalLight
        position={[10, 14, 6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />

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
