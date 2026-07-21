import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import type { Group } from 'three'

// Анімація появи: об'єкт плавно «виростає» з нуля до повного розміру.
// Повертає ref, який треба повісити на <group scale={0}>.
export function useEntrance(duration = 0.3) {
  const ref = useRef<Group>(null)
  useFrame((_, delta) => {
    if (ref.current) {
      easing.damp3(ref.current.scale, [1, 1, 1], duration, delta)
    }
  })
  return ref
}
