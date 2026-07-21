import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Ground from './Ground'

export default function SceneRoot() {
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

      {/* Тимчасовий будинок-заглушка — замінимо у Фазі 6 */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <boxGeometry args={[8, 3, 6]} />
        <meshStandardMaterial color="#d9d4cc" />
      </mesh>

      <OrbitControls
        target={[0, 1.2, 0]}
        enablePan={false}
        minDistance={10}
        maxDistance={35}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2 - 0.12}
      />
    </Canvas>
  )
}

