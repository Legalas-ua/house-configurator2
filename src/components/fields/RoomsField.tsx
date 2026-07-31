import { useConfigurator, useHousePlan } from '../../state/store'
import type { ExtraRoom, PlanMode, RoomType } from '../../config/types'
import { ALL_EXTRAS } from '../../config/rooms'
import { availableBedrooms, supportedExtras } from '../../config/layouts'
import { floor2Limits } from '../../lib/lshape'
import { addRoom, removeRoom } from '../../lib/editPlan'
import { t } from '../../locales'

// Типи кімнат, які можна додати вручну. Сходи й тераса поки не тут: перші
// тягнуть за собою проріз у перекритті, друга — паркан і виріз у стінах.
const ADDABLE: RoomType[] = ['bedroom', 'bathroom', 'office', 'wardrobe', 'pantry', 'corridor', 'living']

// Композитний крок «Кімнати». Межі лічильників і доступність опцій
// диктує каталог планувань (config/layouts.ts): показуємо лише те,
// для чого існує готовий план.
export default function RoomsField() {
  const config = useConfigurator((s) => s.config)
  const setValue = useConfigurator((s) => s.setValue)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const planMode = useConfigurator((s) => s.planMode)
  const setPlanMode = useConfigurator((s) => s.setPlanMode)
  const showGrid = useConfigurator((s) => s.showGrid)
  const setShowGrid = useConfigurator((s) => s.setShowGrid)
  const texts = t.steps.rooms

  if (!config.shape) return null

  const modeSwitch = (
    <div className="rooms__group">
      <span className="rooms__group-title">{texts.mode.title}</span>
      <div className="chips">
        {(['template', 'custom'] as PlanMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`chip${planMode === m ? ' chip--on' : ''}`}
            onClick={() => setPlanMode(m)}
          >
            {texts.mode[m]}
          </button>
        ))}
      </div>
      <p className="rooms__hint">{planMode === 'custom' ? texts.mode.customHint : texts.mode.templateHint}</p>
      {planMode === 'custom' && (
        <label className="floor-hide">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          {t.plan.showGrid}
        </label>
      )}
    </div>
  )

  // У ручному режимі лічильники не мають сенсу — планування більше не
  // виводиться з конфігурації, кімнати додають і рухають руками.
  if (planMode === 'custom') {
    return (
      <div className="rooms">
        <FloorTabs />
        {modeSwitch}
        <RoomEditor />
      </div>
    )
  }

  // Г-подібний 2-й поверх має власні кімнати (bedrooms2/extras2); решта форм і
  // 1-й поверх працюють зі спільним конфігом (bedrooms/extras).
  const editingF2 = config.shape === 'l-shape' && config.floors === 2 && viewFloor === 2
  const f2lim = editingF2 ? floor2Limits(config) : null

  const bedroomOptions = availableBedrooms(config.shape, config.floors)
  const bedroomsValue = editingF2 ? config.bedrooms2 : config.bedrooms
  const bedroomsKey = editingF2 ? 'bedrooms2' : 'bedrooms'
  const bedroomLimits = editingF2
    ? { min: 1, max: f2lim!.maxBedrooms } // не більше, ніж вміщує основа 1-го поверху
    : { min: Math.min(...bedroomOptions), max: Math.max(...bedroomOptions) }

  const currentExtras = editingF2 ? config.extras2 : config.extras
  const extrasKey = editingF2 ? 'extras2' : 'extras'
  const allowedExtras1 = supportedExtras(config.shape, config.floors, config.bedrooms)

  // Чи можна вмикати додаткову кімнату. На 2-му — лише якщо вона вміститься в межі
  // 1-го поверху (комори немає); уже ввімкнену завжди можна вимкнути.
  const extraSupported = (extra: ExtraRoom): boolean => {
    if (!editingF2) return allowedExtras1.includes(extra)
    if (currentExtras.includes(extra)) return true
    if (extra === 'office') return f2lim!.canOffice
    if (extra === 'wardrobe') return f2lim!.canWardrobe
    if (extra === 'terrace') return f2lim!.canTerrace
    return false // комора на 2-му поверсі недоступна
  }

  // На 2-му поверсі замість комори — тераса (на даху 1-го, за майстром).
  const extrasList: ExtraRoom[] = editingF2 ? ['office', 'wardrobe', 'terrace'] : ALL_EXTRAS

  const toggleExtra = (extra: ExtraRoom) => {
    const next = currentExtras.includes(extra)
      ? currentExtras.filter((e) => e !== extra)
      : [...currentExtras, extra]
    setValue(extrasKey, next)
  }

  return (
    <div className="rooms">
      <FloorTabs />
      {modeSwitch}

      {/* Санвузли не показуємо: у готових плануваннях вони закладені в план і
          не редагуються, а в ручному режимі їх додають кнопкою. */}
      <Counter
        label={texts.bedrooms}
        value={bedroomsValue}
        limits={bedroomLimits}
        onChange={(v) => setValue(bedroomsKey, v)}
      />

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.extras.title}</span>
        <div className="chips">
          {extrasList.map((extra) => {
            const supported = extraSupported(extra)
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

// Перемикач поверхів + галочка «сховати 2-й». Спільний для обох режимів.
function FloorTabs() {
  const floors = useConfigurator((s) => s.config.floors)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setViewFloor = useConfigurator((s) => s.setViewFloor)
  const hideFloor2 = useConfigurator((s) => s.hideFloor2)
  const setHideFloor2 = useConfigurator((s) => s.setHideFloor2)
  if (floors !== 2) return null
  return (
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
      {viewFloor === 1 && (
        <label className="floor-hide">
          <input type="checkbox" checked={hideFloor2} onChange={(e) => setHideFloor2(e.target.checked)} />
          {t.plan.hideFloor2}
        </label>
      )}
    </>
  )
}

// Ручний режим: додати кімнату, побачити обрану, видалити її.
// Пересування й розміри — мишею на самому плані (PlanView).
function RoomEditor() {
  const plan = useHousePlan()
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setCustomPlan = useConfigurator((s) => s.setCustomPlan)
  const selectedRoom = useConfigurator((s) => s.selectedRoom)
  const setSelectedRoom = useConfigurator((s) => s.setSelectedRoom)
  const texts = t.steps.rooms.editor

  const floorIdx = Math.min(viewFloor, plan.floors.length) - 1
  const floor = plan.floors[floorIdx]
  const selected = floor?.rooms.find((r) => r.id === selectedRoom)

  const add = (type: RoomType) => {
    const next = addRoom(plan, floorIdx, type)
    setCustomPlan(next.plan)
    setSelectedRoom(next.id)
  }

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.add}</span>
        <div className="chips">
          {ADDABLE.map((type) => (
            <button key={type} type="button" className="chip" onClick={() => add(type)}>
              {t.plan.roomNames[type]}
            </button>
          ))}
        </div>
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.selected}</span>
        {selected ? (
          <div className="rooms__selected">
            <span>
              {t.plan.roomNames[selected.type]} · {texts.size(selected.width, selected.depth)}
            </span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setCustomPlan(removeRoom(plan, floorIdx, selected.id!))
                setSelectedRoom(null)
              }}
            >
              {texts.remove}
            </button>
          </div>
        ) : (
          <p className="rooms__hint">{texts.none}</p>
        )}
      </div>
    </>
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
