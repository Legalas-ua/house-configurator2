import { useLayoutEffect, useRef } from 'react'
import { Color, Object3D, type InstancedMesh, type Material } from 'three'
import type { FacadeSpec } from '../config/types'
import type { CladBox } from '../lib/cladding'
import { useFacadeMaterial } from './facadeMaterial'

// ============================================================
// Оздоблення фасаду в геометрії. Елементів на будинок — десятки тисяч, тож
// кожен матеріал малюється ОДНИМ InstancedMesh: один виклик відмальовки
// замість тисяч мешів.
//
// Геометрія — одиничний куб, а розмір задає МАСШТАБ в матриці інстанса. Це
// дозволяє в одному наборі тримати і цілі цеглини, і обрізані біля вікна: усі
// коробки осьові, повороти не потрібні взагалі.
//
// Тіні елементи НЕ кидають: базова стіна за ними вже кидає свою, а 20 мм
// напуску в тіньовій карті не видно — натомість це другий прохід по всіх
// десятках тисяч інстансів і найдешевший спосіб посадити FPS.
// ============================================================

const dummy = new Object3D()
const tint = new Color()

// Дрібна різнотонність по елементах: без неї цегляна стіна виглядає
// надрукованою. Детермінована — та сама цеглина завжди того самого тону.
const tone = (i: number) => {
  const v = Math.sin(i * 78.233) * 43758.5453
  return v - Math.floor(v)
}

export interface CladGroup {
  key: string
  spec: FacadeSpec
  boxes: CladBox[]
}

function CladInstances({ spec, boxes }: { spec: FacadeSpec; boxes: CladBox[] }) {
  const mat = useFacadeMaterial(spec)
  const ref = useRef<InstancedMesh>(null)
  // Розкид тону в цегли помітно ширший, ніж у панелей чи штукатурки.
  const spread = spec.kind === 'clinker' ? 0.22 : spec.kind === 'thermowood' ? 0.12 : 0.05

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      dummy.position.set(b.x, b.y, b.z)
      dummy.scale.set(b.dx, b.dy, b.dz)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
      const v = 1 - spread / 2 + tone(i) * spread
      tint.setRGB(v, v, v)
      m.setColorAt(i, tint)
    }
    m.count = boxes.length
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
    m.computeBoundingSphere()
  }, [boxes, spread])

  if (boxes.length === 0) return null
  return (
    // key за кількістю: розмір буфера інстансів задається в конструкторі,
    // тож на зміну кількості меш треба створити наново.
    <instancedMesh
      key={boxes.length}
      ref={ref}
      args={[undefined, undefined, boxes.length]}
      material={mat}
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

// Темна підкладка під оздобленням — той самий інстансинг, але один спільний
// матеріал і без різнотонності.
export function Backing({ boxes, material }: { boxes: CladBox[]; material: Material }) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      dummy.position.set(b.x, b.y, b.z)
      dummy.scale.set(b.dx, b.dy, b.dz)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.count = boxes.length
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [boxes])
  if (boxes.length === 0) return null
  return (
    <instancedMesh key={boxes.length} ref={ref} args={[undefined, undefined, boxes.length]} material={material} receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  )
}

export default function Cladding({ groups }: { groups: CladGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <CladInstances key={g.key} spec={g.spec} boxes={g.boxes} />
      ))}
    </>
  )
}
