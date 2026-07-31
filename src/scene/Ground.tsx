import { FOUNDATION_H, GROUND_HALF } from '../config/plan'

// Ділянка — квадратний газон рівно під сіткою прив'язки, щоб межі, за які не
// можна витягти кімнату, читалися з одного погляду.
// Земля лежить на -FOUNDATION_H: нуль сцени — це верх цоколя, а не ґрунт.
export default function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -FOUNDATION_H, 0]} receiveShadow>
      <planeGeometry args={[GROUND_HALF * 2, GROUND_HALF * 2]} />
      <meshStandardMaterial color="#a7bd93" roughness={0.9} />
    </mesh>
  )
}
