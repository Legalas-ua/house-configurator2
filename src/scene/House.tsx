import { useMemo } from 'react'
import type { ConstructionType, Wing } from '../config/types'
import { useConfigurator } from '../state/store'
import { buildFootprint } from '../lib/footprint'
import { useEntrance } from './useEntrance'
import HouseBody from './HouseBody'

// Міст між станом і 3D: читає конфігурацію, будує крила, показує будинок.
// key={shape} перезапускає анімацію появи при зміні форми.
export default function House() {
  const shape = useConfigurator((s) => s.config.shape)
  const constructionType = useConfigurator((s) => s.config.constructionType)

  const wings = useMemo(
    () => buildFootprint({ budget: 0, constructionType, shape }),
    [constructionType, shape],
  )

  if (wings.length === 0) return null

  return <AnimatedHouse key={shape} wings={wings} constructionType={constructionType} />
}

function AnimatedHouse({
  wings,
  constructionType,
}: {
  wings: Wing[]
  constructionType: ConstructionType | null
}) {
  const entranceRef = useEntrance()
  return (
    <group ref={entranceRef} scale={0}>
      <HouseBody wings={wings} constructionType={constructionType} />
    </group>
  )
}
