import { useConfigurator, useHousePlan, useRoof } from '../../state/store'
import type { PlanMode } from '../../config/types'
import type { StepDef } from '../../config/steps'
import {
  roofLevels,
  stepOverhang,
  updateRoofPart,
  OVERHANG,
  PARAPET_H,
  PARAPET_T,
  PITCH,
  type RoofKind,
} from '../../lib/roof'
import { t } from '../../locales'
import OptionCards from './OptionCards'

const KINDS: RoofKind[] = ['flat', 'gable', 'mono']

// Крок «Дах». Готовий варіант — картки типу, як і раніше. Свій — зони даху:
// малюються на площині покриття поверху, у кожної свій тип і параметри.
export default function RoofField({ step }: { step: StepDef }) {
  const mode = useConfigurator((s) => s.roofMode)
  const setMode = useConfigurator((s) => s.setRoofMode)
  const texts = t.steps.roof

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.mode.title}</span>
        <div className="chips">
          {(['template', 'custom'] as PlanMode[]).map((m) => (
            <button key={m} type="button" className={`chip${mode === m ? ' chip--on' : ''}`} onClick={() => setMode(m)}>
              {texts.mode[m]}
            </button>
          ))}
        </div>
        <p className="rooms__hint">{mode === 'custom' ? texts.mode.customHint : texts.mode.templateHint}</p>
      </div>

      {mode === 'template' ? <OptionCards step={step} /> : <RoofEditorPanel />}
    </>
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
