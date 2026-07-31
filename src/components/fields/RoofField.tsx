import { useConfigurator, useHousePlan, useRoof } from '../../state/store'
import type { PlanMode } from '../../config/types'
import type { StepDef } from '../../config/steps'
import {
  roofLevels,
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

// Крок «Дах». Готовий варіант — картки типу, як і раніше. Свій — дах для
// КОЖНОГО відкритого рівня окремо, зі своїми параметрами.
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
  const selected = useConfigurator((s) => s.selectedRoofLevel)
  const setSelected = useConfigurator((s) => s.setSelectedRoofLevel)
  const texts = t.steps.roof.editor

  const levels = roofLevels(plan)
  const level = selected != null && levels.includes(selected) ? selected : (levels[0] ?? null)
  const part = parts.find((p) => p.level === level)

  const patch = (p: Parameters<typeof updateRoofPart>[2]) =>
    level != null && setCustomRoof(updateRoofPart(parts, level, p))

  if (levels.length === 0) return <p className="rooms__hint">{texts.noLevels}</p>

  return (
    <>
      {/* Рівні = ПОКРИТТЯ поверхів. Показуємо лише ті, що справді відкриті:
          там, де вище стоїть інший поверх, даху не треба. */}
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.level}</span>
        <div className="chips">
          {levels.map((l) => (
            <button
              key={l}
              type="button"
              className={`chip${level === l ? ' chip--on' : ''}`}
              onClick={() => setSelected(l)}
            >
              {texts.overFloor(l + 1)}
            </button>
          ))}
        </div>
      </div>

      {part && (
        <>
          <div className="rooms__group">
            <span className="rooms__group-title">{texts.kind}</span>
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
          </div>

          {part.kind === 'flat' ? (
            <>
              <Range label={texts.parapetH} value={part.parapetH} range={PARAPET_H} onChange={(v) => patch({ parapetH: v })} />
              <Range label={texts.parapetT} value={part.parapetT} range={PARAPET_T} onChange={(v) => patch({ parapetT: v })} />
            </>
          ) : (
            <>
              <Range label={texts.pitch} value={part.pitch} range={PITCH} suffix="°" onChange={(v) => patch({ pitch: v })} />
              <Range label={texts.overhang} value={part.overhang} range={OVERHANG} onChange={(v) => patch({ overhang: v })} />
              <div className="rooms__group">
                <span className="rooms__group-title">{texts.rotation}</span>
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
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

// −/+ у заданих межах і з кроком. Значення завжди лишається дозволеним.
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
  return (
    <div className="counter">
      <span className="counter__label">{label}</span>
      <div className="counter__controls">
        <button
          type="button"
          className="counter__btn"
          disabled={value <= range.min + 1e-9}
          onClick={() => onChange(value - range.step)}
          aria-label={`${label}: менше`}
        >
          −
        </button>
        <span className="counter__value">{shown}</span>
        <button
          type="button"
          className="counter__btn"
          disabled={value >= range.max - 1e-9}
          onClick={() => onChange(value + range.step)}
          aria-label={`${label}: більше`}
        >
          +
        </button>
      </div>
    </div>
  )
}
