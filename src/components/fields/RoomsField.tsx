import { useConfigurator } from '../../state/store'
import type { ExtraRoom, KitchenType } from '../../config/types'
import { ALL_EXTRAS } from '../../config/rooms'
import { availableBedrooms, findTemplate } from '../../config/layouts'
import { t } from '../../locales'

// Композитний крок «Кімнати». Межі лічильників і доступність опцій
// диктує каталог планувань (config/layouts.ts): показуємо лише те,
// для чого існує готовий план.
export default function RoomsField() {
  const config = useConfigurator((s) => s.config)
  const setValue = useConfigurator((s) => s.setValue)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setViewFloor = useConfigurator((s) => s.setViewFloor)
  const texts = t.steps.rooms

  if (!config.shape) return null

  const bedroomOptions = availableBedrooms(config.shape, config.floors)
  const template = findTemplate(config.shape, config.floors, config.bedrooms)

  const toggleExtra = (extra: ExtraRoom) => {
    const next = config.extras.includes(extra)
      ? config.extras.filter((e) => e !== extra)
      : [...config.extras, extra]
    setValue('extras', next)
  }

  return (
    <div className="rooms">
      {config.floors === 2 && (
        <div className="floor-tabs">
          {[1, 2].map((n) => (
            <button
              key={n}
              type="button"
              className={`floor-tab${viewFloor === n ? ' floor-tab--active' : ''}`}
              onClick={() => setViewFloor(n)}
            >
              {t.plan.floorTab(n)}
            </button>
          ))}
        </div>
      )}

      <Counter
        label={texts.bedrooms}
        value={config.bedrooms}
        limits={{ min: Math.min(...bedroomOptions), max: Math.max(...bedroomOptions) }}
        onChange={(v) => setValue('bedrooms', v)}
      />
      {/* Санвузли закладені в планування — лічильник показує їх кількість */}
      <Counter
        label={texts.bathrooms}
        value={config.bathrooms}
        limits={{ min: config.bathrooms, max: config.bathrooms }}
        onChange={() => {}}
      />

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.kitchen.title}</span>
        <div className="cards">
          {(Object.keys(texts.kitchen.options) as KitchenType[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`card${config.kitchenType === value ? ' card--selected' : ''}`}
              onClick={() => setValue('kitchenType', value)}
            >
              <span>{texts.kitchen.options[value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.extras.title}</span>
        <div className="chips">
          {ALL_EXTRAS.map((extra) => {
            const supported = template?.extras.includes(extra) ?? false
            return (
              <button
                key={extra}
                type="button"
                className={`chip${config.extras.includes(extra) ? ' chip--on' : ''}`}
                onClick={() => toggleExtra(extra)}
                disabled={!supported}
                title={supported ? undefined : texts.extras.unavailable}
              >
                {texts.extras.options[extra]}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Counter({
  label,
  value,
  limits,
  onChange,
}: {
  label: string
  value: number
  limits: { min: number; max: number }
  onChange: (v: number) => void
}) {
  return (
    <div className="counter">
      <span className="counter__label">{label}</span>
      <div className="counter__controls">
        <button
          type="button"
          className="counter__btn"
          onClick={() => onChange(value - 1)}
          disabled={value <= limits.min}
          aria-label={`${label}: менше`}
        >
          −
        </button>
        <span className="counter__value">{value}</span>
        <button
          type="button"
          className="counter__btn"
          onClick={() => onChange(value + 1)}
          disabled={value >= limits.max}
          aria-label={`${label}: більше`}
        >
          +
        </button>
      </div>
    </div>
  )
}
