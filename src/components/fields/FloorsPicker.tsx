import { useConfigurator } from '../../state/store'
import type { Floors } from '../../config/types'
import { floorsAvailable } from '../../config/layouts'
import { t } from '../../locales'

// Вибір кількості поверхів (частина кроку «Форма будинку»).
export default function FloorsPicker() {
  const shape = useConfigurator((s) => s.config.shape)
  const floors = useConfigurator((s) => s.config.floors)
  const setValue = useConfigurator((s) => s.setValue)

  const allowed = shape ? floorsAvailable(shape) : [1, 2]

  return (
    <div className="rooms__group">
      <span className="rooms__group-title">{t.floors.title}</span>
      <div className="chips">
        {([1, 2] as Floors[]).map((n) => {
          const disabled = !allowed.includes(n)
          return (
            <button
              key={n}
              type="button"
              className={`chip${floors === n ? ' chip--on' : ''}`}
              onClick={() => setValue('floors', n)}
              disabled={disabled}
              title={disabled ? t.floors.soon : undefined}
            >
              {t.floors.options[n]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
