import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import type { MeshStandardMaterial } from 'three'
import type { ConstructionType, Wing } from '../config/types'

// Вигляд стін для кожного типу конструкції (Фаза 1: колір/шорсткість,
// текстури — пізніше). Поки тип конструкції не обирається — DEFAULT_LOOK.
const WALL_LOOK: Record<ConstructionType, { color: string; roughness: number }> = {
  frame: { color: '#c9a06b', roughness: 0.8 }, // тепле дерево
  modular: { color: '#d3d6d8', roughness: 0.5 }, // світлі панелі
  brick: { color: '#b65c3d', roughness: 0.9 }, // теракотова цегла
}

const DEFAULT_LOOK = { color: '#ece7e0', roughness: 0.8 } // тепло-біла штукатурка

function WingMesh({ wing, look }: { wing: Wing; look: { color: string; roughness: number } }) {
  const matRef = useRef<MeshStandardMaterial>(null)

  // Плавний перехід кольору при зміні типу конструкції
  useFrame((_, delta) => {
    if (matRef.current) {
      easing.dampC(matRef.current.color, look.color, 0.25, delta)
    }
  })

  return (
    <mesh position={[wing.x, wing.wallHeight / 2, wing.z]} castShadow receiveShadow>
      <boxGeometry args={[wing.width, wing.wallHeight, wing.depth]} />
      <meshStandardMaterial ref={matRef} color={look.color} roughness={look.roughness} />
    </mesh>
  )
}

export default function HouseBody({
  wings,
  constructionType,
}: {
  wings: Wing[]
  constructionType: ConstructionType | null
}) {
  const look = constructionType ? WALL_LOOK[constructionType] : DEFAULT_LOOK
  return (
    <>
      {wings.map((wing, i) => (
        <WingMesh key={i} wing={wing} look={look} />
      ))}
    </>
  )
}
