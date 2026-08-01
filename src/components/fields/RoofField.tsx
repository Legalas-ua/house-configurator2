import { useConfigurator, useHousePlan, useRoof, useWindows } from '../../state/store'
import type { PlanMode } from '../../config/types'
import type { StepDef } from '../../config/steps'
import {
  roofLevels,
  roofWindowClashes,
  stepOverhang,
  updateRoofPart,
  OVERHANG,
  PARAPET_H,
  PARAPET_T,
  PITCH,
  type RoofKind,
} from '../../lib/roof'
import { resolveWindows, updateWindow, removeWindow, WIN_TOP, MIN_WIN_W } from '../../lib/windows'
import { t } from '../../locales'
import OptionCards from './OptionCards'

const KINDS: RoofKind[] = ['flat', 'gable', 'mono']

// Крок «Дах». Готовий варіант — картки типу, як і раніше. Свій — зони даху:
// малюються на площині покриття поверху, у кожної свій тип і параметри.
export default function RoofField({ step }: { step: StepDef }) {
  const mode = useConfigurator((s) => s.roofMode)
  const setMode = useConfigurator((s) => s.setRoofMode)
  const planMode = useConfigurator((s) => s.planMode)
  const texts = t.steps.roof

  return (
    <>
      <RoofModePicker mode={mode} setMode={setMode} planMode={planMode} texts={texts.mode} />
      {/* Картка задає БАЗОВИЙ дах, а редактор частин працює в обох режимах:
          у готовому — правиш наперед заданий контур, у своєму — намальований. */}
      {mode === 'template' && <OptionCards step={step} />}
      <RoofEditorPanel />
    </>
  )
}

// Вибір «готовий / свій» дах. При СВОЄМУ плануванні вибору немає: готові
// варіанти прив'язані до обрисів шаблону, тож лишається тільки малювати.
export function RoofModePicker({
  mode,
  setMode,
  planMode,
  texts,
}: {
  mode: PlanMode
  setMode: (m: PlanMode) => void
  planMode: PlanMode
  texts: typeof t.steps.roof.mode
}) {
  return (
    <div className="rooms__group">
      <span className="rooms__group-title">{texts.title}</span>
      {planMode === 'custom' ? (
        <p className="rooms__hint">{texts.customPlanHint}</p>
      ) : (
        <>
          <div className="chips">
            {(['template', 'custom'] as PlanMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`chip${mode === m ? ' chip--on' : ''}`}
                onClick={() => setMode(m)}
              >
                {texts[m]}
              </button>
            ))}
          </div>
          <p className="rooms__hint">{mode === 'custom' ? texts.customHint : texts.templateHint}</p>
        </>
      )}
    </div>
  )
}

function RoofEditorPanel() {
  const plan = useHousePlan()
  const parts = useRoof()
  const setCustomRoof = useConfigurator((s) => s.setCustomRoof)
  const selected = useConfigurator((s) => s.selectedRoofPart)
  const texts = t.steps.roof.editor

  const levels = roofLevels(plan)
  if (levels.length === 0) return <p className="rooms__hint">{texts.noLevels}</p>

  const part = parts.find((p) => p.id === selected)
  const patch = (p: Parameters<typeof updateRoofPart>[2]) => part && setCustomRoof(updateRoofPart(parts, part.id, p))

  return (
    <>
      <RoofClashes />

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.selected}</span>
        {!part ? (
          <p className="rooms__hint">{texts.none}</p>
        ) : (
          <>
            <div className="rooms__selected">
              <span>
                {texts.kinds[part.kind]} · {part.width.toFixed(1)} × {part.depth.toFixed(1)} м
              </span>
            </div>

            <span className="rooms__subtitle">{texts.kind}</span>
            <div className="chips">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip${part.kind === k ? ' chip--on' : ''}`}
                  onClick={() => patch({ kind: k })}
                >
                  {texts.kinds[k]}
                </button>
              ))}
            </div>

            <span className="rooms__subtitle">{texts.params}</span>
            {part.kind === 'flat' ? (
              <>
                <Range label={texts.parapetH} value={part.parapetH} range={PARAPET_H} onChange={(v) => patch({ parapetH: v })} />
                <Range label={texts.parapetT} value={part.parapetT} range={PARAPET_T} onChange={(v) => patch({ parapetT: v })} />
              </>
            ) : (
              <>
                <Range label={texts.pitch} value={part.pitch} range={PITCH} suffix="°" onChange={(v) => patch({ pitch: v })} />
                {/* Звіс має окремий «нуль»: або без нього, або від 300 мм. */}
                <div className="counter">
                  <span className="counter__label">{texts.overhang}</span>
                  <div className="counter__controls">
                    <button
                      type="button"
                      className="counter__btn"
                      disabled={part.overhang <= 0}
                      onClick={() => patch({ overhang: stepOverhang(part.overhang, -1) })}
                      aria-label={`${texts.overhang}: менше`}
                    >
                      −
                    </button>
                    <span className="counter__value">
                      {part.overhang <= 0 ? texts.noOverhang : `${part.overhang.toFixed(1)} м`}
                    </span>
                    <button
                      type="button"
                      className="counter__btn"
                      disabled={part.overhang >= OVERHANG.max - 1e-9}
                      onClick={() => patch({ overhang: stepOverhang(part.overhang, 1) })}
                      aria-label={`${texts.overhang}: більше`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <span className="rooms__subtitle">{texts.rotation}</span>
                <div className="chips">
                  {(part.kind === 'gable' ? [0, 90] : [0, 90, 180, 270]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`chip${part.rotation === r ? ' chip--on' : ''}`}
                      onClick={() => patch({ rotation: r })}
                    >
                      {r}°
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

// −/+ у заданих межах. Рахуємо в ЩАБЛЯХ, щоб дробові кроки не «перестрибували»
// круглих значень через похибку двійкових чисел.
function Range({
  label,
  value,
  range,
  onChange,
  suffix = ' м',
}: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  onChange: (v: number) => void
  suffix?: string
}) {
  const shown = suffix === '°' ? `${Math.round(value)}${suffix}` : `${value.toFixed(2).replace(/0$/, '')}${suffix}`
  const move = (dir: 1 | -1) => onChange((Math.round(value / range.step) + dir) * range.step)
  return (
    <div className="counter">
      <span className="counter__label">{label}</span>
      <div className="counter__controls">
        <button
          type="button"
          className="counter__btn"
          disabled={value <= range.min + 1e-9}
          onClick={() => move(-1)}
          aria-label={`${label}: менше`}
        >
          −
        </button>
        <span className="counter__value">{shown}</span>
        <button
          type="button"
          className="counter__btn"
          disabled={value >= range.max - 1e-9}
          onClick={() => move(1)}
          aria-label={`${label}: більше`}
        >
          +
        </button>
      </div>
    </div>
  )
}

// Вікна, які перекрив дах. Клікаєш вікно зі списку — і тут же правиш його
// висоти, поки колізія не зникне; або просто видаляєш.
function RoofClashes() {
  const plan = useHousePlan()
  const parts = useRoof()
  const windows = useWindows()
  const setCustomWindows = useConfigurator((s) => s.setCustomWindows)
  const picked = useConfigurator((s) => s.selectedWindow)
  const setPicked = useConfigurator((s) => s.setSelectedWindow)
  const texts = t.steps.roof.clash

  const resolved = resolveWindows(plan, windows, 3.2)
  const clashes = roofWindowClashes(
    plan,
    parts,
    resolved.map((w) => ({
      id: w.id,
      floor: w.floor,
      sill: w.sill,
      horizontal: w.horizontal,
      line: w.line,
      a: w.a,
      b: w.b,
    })),
  )
  const ids = [...new Set(clashes.map((c) => c.windowId))]
  // Меню правки прив'язане до ОБРАНОГО вікна, а не до списку колізій. Раніше
  // воно зникало тієї ж миті, коли колізія зникала, — людина не встигала
  // побачити результат і закінчити правку. Тепер закриває його лише «Зберегти».
  const spec = windows.find((w) => w.id === picked)

  if (ids.length === 0 && !spec) return null

  const room = (id: string) => {
    const w = windows.find((x) => x.id === id)
    const r = w && plan.floors[w.floor]?.rooms.find((x) => x.id === w.roomId)
    return r ? t.plan.roomNames[r.type] : id
  }
  const patch = (p: Parameters<typeof updateWindow>[2]) => spec && setCustomWindows(updateWindow(windows, spec.id, p))

  return (
    <div className={`rooms__group${ids.length > 0 ? ' rooms__group--warn' : ''}`}>
      <span className="rooms__group-title">{ids.length > 0 ? texts.title : texts.resolved}</span>
      {ids.length > 0 && (
        <div className="chips">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              className={`chip${picked === id ? ' chip--on' : ''}`}
              onClick={() => setPicked(id)}
            >
              {room(id)}
            </button>
          ))}
        </div>
      )}

      {!spec ? (
        <p className="rooms__hint">{texts.pick}</p>
      ) : (
        <>
          <div className="rooms__selected">
            <span>{room(spec.id)}</span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setCustomWindows(removeWindow(windows, spec.id))
                setPicked(null)
              }}
            >
              {texts.remove}
            </button>
          </div>
          {!ids.includes(spec.id) && <p className="rooms__hint">{texts.resolved}</p>}
          <Range
            label={texts.sill}
            value={spec.sill}
            range={{ min: 0, max: WIN_TOP - 0.4, step: 0.1 }}
            onChange={(v) => patch({ sill: v })}
          />
          <Range
            label={texts.top}
            value={spec.top}
            range={{ min: 0.4, max: WIN_TOP, step: 0.1 }}
            onChange={(v) => patch({ top: v })}
          />
          <Range
            label={texts.width}
            value={spec.width}
            range={{ min: MIN_WIN_W, max: 6, step: 0.1 }}
            onChange={(v) => patch({ width: v })}
          />
          {/* Тільки ця кнопка закриває правку — не зникнення колізії. */}
          <button type="button" className="chip" onClick={() => setPicked(null)}>
            {texts.save}
          </button>
        </>
      )}
    </div>
  )
}
