import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { Color, MeshStandardMaterial, Object3D, type Group, type InstancedMesh } from 'three'
import type { RoofMatKind, RoofMatSpec } from '../config/types'
import type { SkinBox } from '../lib/roofSkin'

// Покриття даху в геометрії. Тією ж технікою, що й оздоблення фасаду: один
// InstancedMesh на матеріал, розмір задає масштаб інстанса. Різниця одна —
// елементи ПОВЕРНУТІ по схилу, тож у матриці ще й обертання.
//
// Порядок обертань: спершу нахил схилу навколо локальної X, потім поворот
// площини навколо Y. Це порядок 'YXZ' у three.

const dummy = new Object3D()
const tint = new Color()

const tone = (i: number) => {
  const v = Math.sin(i * 91.7) * 43758.5453
  return v - Math.floor(v)
}

// Метал блищить, глина й ґонт — ні. Розкид тону: у глиняної черепиці він
// найпомітніший, у фальцу його майже немає.
const LOOK: Record<RoofMatKind, { rough: number; metal: number; spread: number }> = {
  clayTile: { rough: 0.85, metal: 0, spread: 0.2 },
  metalTile: { rough: 0.42, metal: 0.55, spread: 0.05 },
  seam: { rough: 0.35, metal: 0.7, spread: 0.03 },
  shingle: { rough: 0.92, metal: 0, spread: 0.14 },
  corrugated: { rough: 0.45, metal: 0.6, spread: 0.04 },
  builtUp: { rough: 0.95, metal: 0, spread: 0.08 },
  membrane: { rough: 0.6, metal: 0, spread: 0.03 },
}

function SkinInstances({ spec, boxes, trim = false }: { spec: RoofMatSpec; boxes: SkinBox[]; trim?: boolean }) {
  // Торцева планка й кожух парапету — завжди фарбований метал, незалежно від
  // того, яке покриття обрали: колір у них свій, а вигляд однаковий.
  const look = trim ? { rough: 0.38, metal: 0.65, spread: 0.02 } : LOOK[spec.kind]
  const ref = useRef<InstancedMesh>(null)
  const mat = useMemo(
    () => new MeshStandardMaterial({ color: spec.color, roughness: look.rough, metalness: look.metal }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec.kind, trim],
  )
  mat.color.set(spec.color)
  mat.roughness = look.rough
  mat.metalness = look.metal

  useLayoutEffect(() => () => mat.dispose(), [mat])

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      dummy.position.set(b.x, b.y, b.z)
      dummy.rotation.set(-b.tilt, b.rotY, 0, 'YXZ')
      dummy.scale.set(b.dx, b.dy, b.dz)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      const v = 1 - look.spread / 2 + tone(i) * look.spread
      tint.setRGB(v, v, v)
      m.setColorAt(i, tint)
    }
    m.count = boxes.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [boxes, look.spread])

  if (boxes.length === 0) return null
  return (
    <instancedMesh
      key={boxes.length}
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      material={mat}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

// Поява покриття. Ярус даху росте знизу вгору — але покриття, що піднімається
// з-під даху, виглядає неправильно: воно ж лягає ЗВЕРХУ. Тому масштабуємо його
// відносно найвищої точки — і воно «спускається» на схил згори.
export function SkinTier({ top, open, children }: { top: number; open: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const g = ref.current
    if (!g) return
    easing.damp(g.scale, 'y', open ? 1 : 0.0001, 0.42, dt)
    g.visible = open || g.scale.y > 0.02
  })
  return (
    <group ref={ref} position={[0, top, 0]} visible={false} scale={[1, 0.0001, 1]}>
      <group position={[0, -top, 0]}>{children}</group>
    </group>
  )
}

export default SkinInstances
