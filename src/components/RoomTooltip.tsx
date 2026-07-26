import { useConfigurator } from '../state/store'

// DOM-підказка над 3D-сценою: назва кімнати + площа при наведенні.
export default function RoomTooltip() {
  const hovered = useConfigurator((s) => s.hovered)
  if (!hovered) return null
  return (
    <div className="room-tip" style={{ left: hovered.mx + 14, top: hovered.my + 14 }}>
      <strong>{hovered.name}</strong>
      <span>{hovered.area} м²</span>
    </div>
  )
}
