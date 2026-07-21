import { useMemo } from 'react'
import type { ConstructionType, Wing } from '../config/types'
import { useConfigurator } from '../state/store'
import { buildFootprint } from '../lib/footprint'
import { useEntrance } from './useEntrance'
import HouseBody from './HouseBody'

// Міст між станом і 3D: читає конфігурацію, будує крила, показує будинок.
// key={shape} перезапускає анімацію появи при зміні форми.
export default function House() {
  const config = useConfigurator((s) => s.config)

  const wings = useMemo(() => buildFootprint(config), [config])

  if (wings.length === 0) return null

  return (
    <AnimatedHouse
      key={config.shape}
      wings={wings}
      constructionType={config.constructionType}
    />
  )
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
