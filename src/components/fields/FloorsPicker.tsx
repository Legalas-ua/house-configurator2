import { useConfigurator } from '../../state/store'
import type { Floors } from '../../config/types'
import { t } from '../../locales'

// Вибір кількості поверхів (частина кроку «Форма будинку»).
export default function FloorsPicker() {
  const floors = useConfigurator((s) => s.config.floors)
  const setValue = useConfigurator((s) => s.setValue)

  return (
    <div className="rooms__group">
      <span className="rooms__group-title">{t.floors.title}</span>
      <div className="chips">
        {([1, 2] as Floors[]).map((n) => (
          <button
            key={n}
            type="button"
            className={`chip${floors === n ? ' chip--on' : ''}`}
            onClick={() => setValue('floors', n)}
          >
            {t.floors.options[n]}
          </button>
        ))}
      </div>
    </div>
  )
}
