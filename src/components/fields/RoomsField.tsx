import { useConfigurator } from '../../state/store'
import type { ExtraRoom } from '../../config/types'
import { ALL_EXTRAS } from '../../config/rooms'
import { availableBedrooms, supportedExtras, supportedExtrasFloor2 } from '../../config/layouts'
import { t } from '../../locales'

// Композитний крок «Кімнати». Межі лічильників і доступність опцій
// диктує каталог планувань (config/layouts.ts): показуємо лише те,
// для чого існує готовий план.
export default function RoomsField() {
  const config = useConfigurator((s) => s.config)
  const setValue = useConfigurator((s) => s.setValue)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setViewFloor = useConfigurator((s) => s.setViewFloor)
  const hideFloor2 = useConfigurator((s) => s.hideFloor2)
  const setHideFloor2 = useConfigurator((s) => s.setHideFloor2)
  const texts = t.steps.rooms

  if (!config.shape) return null

  // Г-подібний 2-й поверх має власні кімнати (bedrooms2/extras2); решта форм і
  // 1-й поверх працюють зі спільним конфігом (bedrooms/extras).
  const editingF2 = config.shape === 'l-shape' && config.floors === 2 && viewFloor === 2

  const bedroomOptions = availableBedrooms(config.shape, config.floors)
  const bedroomsValue = editingF2 ? config.bedrooms2 : config.bedrooms
  const bedroomsKey = editingF2 ? 'bedrooms2' : 'bedrooms'
  const bedroomLimits = editingF2
    ? { min: 1, max: config.bedrooms + 1 } // 2-й поверх — макс. спальні 1-го + 1 обов'язкова
    : { min: Math.min(...bedroomOptions), max: Math.max(...bedroomOptions) }

  const bathroomsValue = editingF2 ? 1 : config.bathrooms
  const currentExtras = editingF2 ? config.extras2 : config.extras
  const extrasKey = editingF2 ? 'extras2' : 'extras'
  const allowedExtras = editingF2
    ? supportedExtrasFloor2(config.bedrooms2)
    : supportedExtras(config.shape, config.floors, config.bedrooms)

  const toggleExtra = (extra: ExtraRoom) => {
    const next = currentExtras.includes(extra)
      ? currentExtras.filter((e) => e !== extra)
      : [...currentExtras, extra]
    setValue(extrasKey, next)
  }

  return (
    <div className="rooms">
      {config.floors === 2 && (
        <>
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
          <label className="floor-hide">
            <input
              type="checkbox"
              checked={hideFloor2}
              onChange={(e) => setHideFloor2(e.target.checked)}
            />
            {t.plan.hideFloor2}
          </label>
        </>
      )}

      <Counter
        label={texts.bedrooms}
        value={bedroomsValue}
        limits={bedroomLimits}
        onChange={(v) => setValue(bedroomsKey, v)}
      />
      {/* Санвузли закладені в планування — лічильник показує їх кількість */}
      <Counter
        label={texts.bathrooms}
        value={bathroomsValue}
        limits={{ min: bathroomsValue, max: bathroomsValue }}
        onChange={() => {}}
      />

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.extras.title}</span>
        <div className="chips">
          {ALL_EXTRAS.map((extra) => {
            const supported = allowedExtras.includes(extra)
            return (
              <button
                key={extra}
                type="button"
                className={`chip${currentExtras.includes(extra) ? ' chip--on' : ''}`}
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
