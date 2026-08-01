import { useEffect, useRef, useState } from 'react'
import { useConfigurator } from '../state/store'
import type { WallFace } from '../lib/wallFaces'

// Вибір зовнішньої стіни на кроці «Фасад» — тими самими правилами, що й вибір
// стіни на кроці «Вікна»: прозора накладка ловить кліки, наведення підсвічує,
// обрана стіна заливається СУЦІЛЬНИМ кольором (без прозорості), щоб не було
// сумнівів, якій саме стіні зараз задають матеріал.

const PICK_COLOR = '#d9622b'
const PICK_OUT = 0.16 // винос накладки за грань стіни

export default function FacadeWalls({ faces, floorH, wallH }: { faces: WallFace[]; floorH: number; wallH: number }) {
  const selected = useConfigurator((s) => s.selectedFacadeWall)
  const setSelected = useConfigurator((s) => s.setSelectedFacadeWall)
  const [hover, setHover] = useState<string | null>(null)
  const downAt = useRef<{ x: number; y: number } | null>(null)
  // Порядок обходу перетинів залежить від кута камери — прапорець від нього ні.
  const hitFace = useRef(false)

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    const up = () => {
      hitFace.current = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerup', up)
    }
  }, [setSelected])

  return (
    <>
      {/* Клік по порожньому знімає вибір; поріг 4 px — щоб обертання камери не скидало */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.06, 0]}
        onPointerDown={(e) => {
          downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
        }}
        onPointerUp={(e) => {
          const d = downAt.current
          downAt.current = null
          if (hitFace.current) return
          if (d && Math.hypot(e.nativeEvent.clientX - d.x, e.nativeEvent.clientY - d.y) < 4) setSelected(null)
        }}
      >
        <planeGeometry args={[200, 200]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {faces.map((f) => {
        const mid = (f.a + f.b) / 2
        const on = selected === f.id
        const hot = hover === f.id
        return (
          <mesh
            key={f.id}
            position={[
              (f.horizontal ? mid : f.line) + f.nx * PICK_OUT,
              f.floor * floorH + wallH / 2,
              (f.horizontal ? f.line : mid) + f.nz * PICK_OUT,
            ]}
            rotation-y={f.horizontal ? 0 : Math.PI / 2}
            onPointerOver={(e) => {
              e.stopPropagation()
              setHover(f.id)
            }}
            onPointerOut={(e) => {
              e.stopPropagation()
              setHover((cur) => (cur === f.id ? null : cur))
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              hitFace.current = true
              setSelected(on ? null : f.id)
            }}
          >
            <boxGeometry args={[Math.max(f.b - f.a, 0.1), wallH, 0.06]} />
            <meshStandardMaterial
              color={PICK_COLOR}
              emissive={PICK_COLOR}
              emissiveIntensity={on ? 0.35 : 0}
              transparent={!on}
              opacity={on ? 1 : hot ? 0.28 : 0.001}
              depthWrite={on}
            />
          </mesh>
        )
      })}
    </>
  )
}
