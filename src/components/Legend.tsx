import { useConfigurator, useHousePlan } from '../state/store'
import { STEPS } from '../config/steps'
import { ROOM_COLORS } from '../config/plan'
import type { RoomType } from '../config/types'
import { t } from '../locales'

// Умовні позначення плану внизу панелі: колір → кімната → площа.
// Показуємо кімнати поточного поверху; внизу — загальна площа будинку.
export default function Legend() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const viewFloor = useConfigurator((s) => s.viewFloor)

  const plan = useHousePlan()

  if (STEPS[currentStep].id !== 'rooms' || plan.floors.length === 0) return null

  const floor = plan.floors[Math.min(viewFloor, plan.floors.length) - 1]

  // Групуємо однакові кімнати: «Спальня ×3 — 42 м²»
  const grouped = new Map<RoomType, { count: number; area: number }>()
  for (const room of floor.rooms) {
    const entry = grouped.get(room.type) ?? { count: 0, area: 0 }
    entry.count += 1
    entry.area += room.width * room.depth
    grouped.set(room.type, entry)
  }

  return (
    <footer className="panel__price legend">
      <span className="price__label">{t.plan.legendTitle}</span>
      <ul className="legend__list">
        {[...grouped.entries()].map(([type, { count, area }]) => (
          <li key={type} className="legend__row">
            <span className="legend__swatch" style={{ background: ROOM_COLORS[type] }} />
            <span className="legend__name">
              {t.plan.roomNames[type]}
              {/* «×N» лише для тих кімнат, що логічно рахувати */}
              {count > 1 && (type === 'bedroom' || type === 'bathroom') ? ` ×${count}` : ''}
            </span>
            <span className="legend__area">{Math.round(area)} м²</span>
          </li>
        ))}
      </ul>
      <div className="legend__total">
        {t.plan.total}: <strong>{plan.totalArea} м²</strong>
      </div>
    </footer>
  )
}
