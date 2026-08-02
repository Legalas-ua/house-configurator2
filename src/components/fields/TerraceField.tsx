import { useConfigurator, useHousePlan } from '../../state/store'
import { addTerrace, removeTerrace, validateTerrace } from '../../lib/terrace'
import { t } from '../../locales'

// Крок «Тераса»: зони на землі навколо будинку. Малювання — у сцені
// (TerraceView), тут лише додати/прибрати зону, сітка й підказки.
export default function TerraceField() {
  const plan = useHousePlan()
  const zones = useConfigurator((s) => s.terraceZones)
  const setZones = useConfigurator((s) => s.setTerraceZones)
  const selected = useConfigurator((s) => s.selectedTerrace)
  const setSelected = useConfigurator((s) => s.setSelectedTerrace)
  const showGrid = useConfigurator((s) => s.showGrid)
  const setShowGrid = useConfigurator((s) => s.setShowGrid)
  const texts = t.steps.terrace

  const zone = zones.find((z) => z.id === selected)
  const issues = validateTerrace(plan, zones)

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.add}</span>
        <div className="chips">
          <button
            type="button"
            className="chip"
            onClick={() => {
              const res = addTerrace(plan, zones)
              if (!res) return
              setZones(res.zones)
              setSelected(res.id)
            }}
          >
            {texts.add}
          </button>
        </div>
        <p className="rooms__hint">{texts.addHint}</p>
      </div>

      <label className="floor-hide">
        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
        {texts.grid}
      </label>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.selected}</span>
        {!zone ? (
          <p className="rooms__hint">{texts.none}</p>
        ) : (
          <div className="rooms__selected">
            <span>
              {zone.width.toFixed(1)} × {zone.depth.toFixed(1)} м
            </span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setZones(removeTerrace(zones, zone.id))
                setSelected(null)
              }}
            >
              {texts.remove}
            </button>
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <div className="rooms__group rooms__group--warn">
          <span className="rooms__group-title">{texts.issues.title}</span>
          <ul className="plan-issues__list">
            {issues.map((it, i) => (
              <li key={i} className="plan-issues__item">
                {texts.issues[it.kind]}
              </li>
            ))}
          </ul>
          <p className="rooms__hint">{texts.issues.blocked}</p>
        </div>
      )}
    </>
  )
}
