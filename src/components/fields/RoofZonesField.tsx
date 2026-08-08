import { useConfigurator, useHousePlan, useRoof } from '../../state/store'
import { addRoofPart, removeRoofPart, roofLevels, type RoofKind } from '../../lib/roof'
import { t } from '../../locales'
import { RoofModePicker } from './RoofField'

const KINDS: RoofKind[] = ['flat', 'gable', 'mono', 'hip']

// Крок «Форма даху»: тільки МАЛЮВАННЯ зон. Параметри — на наступному кроці,
// коли дах уже виріс в об'ємі й нічого не перекриває.
export default function RoofZonesField() {
  const mode = useConfigurator((s) => s.roofMode)
  const setMode = useConfigurator((s) => s.setRoofMode)
  const planMode = useConfigurator((s) => s.planMode)
  const plan = useHousePlan()
  const parts = useRoof()
  const setCustomRoof = useConfigurator((s) => s.setCustomRoof)
  const selected = useConfigurator((s) => s.selectedRoofPart)
  const setSelected = useConfigurator((s) => s.setSelectedRoofPart)
  const roofLevel = useConfigurator((s) => s.roofLevel)
  const overTerrace = useConfigurator((s) => s.roofOverTerrace)
  const setOverTerrace = useConfigurator((s) => s.setRoofOverTerrace)
  const setRoofLevel = useConfigurator((s) => s.setRoofLevel)
  const texts = t.steps.roof

  const levels = roofLevels(plan, overTerrace)
  const level = levels.includes(roofLevel) ? roofLevel : (levels[0] ?? 0)
  const part = parts.find((p) => p.id === selected)

  return (
    <>
      <RoofModePicker mode={mode} setMode={setMode} planMode={planMode} texts={texts.mode} />

      {mode === 'custom' && levels.length === 0 && <p className="rooms__hint">{texts.editor.noLevels}</p>}

      {mode === 'custom' && levels.length > 0 && (
        <>
          {/* Рівні, де дах не потрібен, у списку не з'являються взагалі */}
          {levels.length > 1 && (
            <div className="rooms__group">
              <span className="rooms__group-title">{texts.editor.level}</span>
              <div className="chips">
                {levels.map((l) => (
                  <button
                    key={l}
                    type="button"
                    className={`chip${level === l ? ' chip--on' : ''}`}
                    onClick={() => setRoofLevel(l)}
                  >
                    {texts.editor.overFloor(l + 1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rooms__group">
            <span className="rooms__group-title">{texts.editor.addZone}</span>
            <div className="chips">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  onClick={() => {
                    const res = addRoofPart(plan, parts, level, k, overTerrace)
                    if (!res) return
                    setCustomRoof(res.parts)
                    setSelected(res.id)
                  }}
                >
                  {texts.editor.kinds[k]}
                </button>
              ))}
            </div>
            <p className="rooms__hint">{texts.editor.drawHint}</p>
          </div>

          {/* Дах над терасою: тераса приєднується до контуру покриття, і зону
              можна протягнути так, щоб вона накрила й терасу. */}
          <label className="floor-hide">
            <input type="checkbox" checked={overTerrace} onChange={(e) => setOverTerrace(e.target.checked)} />
            {texts.editor.overTerrace}
          </label>

          <div className="rooms__group">
            <span className="rooms__group-title">{texts.editor.selected}</span>
            {!part ? (
              <p className="rooms__hint">{texts.editor.none}</p>
            ) : (
              <div className="rooms__selected">
                <span>
                  {texts.editor.kinds[part.kind]} · {part.width.toFixed(1)} × {part.depth.toFixed(1)} м
                </span>
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    setCustomRoof(removeRoofPart(parts, part.id))
                    setSelected(null)
                  }}
                >
                  {texts.editor.remove}
                </button>
              </div>
            )}
            <p className="rooms__hint">{t.keys.hint}</p>
          </div>
        </>
      )}
    </>
  )
}
