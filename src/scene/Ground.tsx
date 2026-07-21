// Ділянка: світлий диск, на який падає тінь від будинку.
export default function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <circleGeometry args={[16, 64]} />
      <meshStandardMaterial color="#e8e4de" />
    </mesh>
  )
}
