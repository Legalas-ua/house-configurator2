// Ділянка: два кола — широкий газон + світліша «пляма» під будинком,
// на яку падає тінь. Матеріал не надто шорсткий, щоб ловив світло.
export default function Ground() {
  return (
    <group>
      {/* Зовнішній газон */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[18, 96]} />
        <meshStandardMaterial color="#8fa87e" roughness={0.95} />
      </mesh>
      {/* Внутрішня ділянка — світліша й тепліша, будинок на ній «сидить» */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[11, 96]} />
        <meshStandardMaterial color="#a7bd93" roughness={0.85} />
      </mesh>
    </group>
  )
}
