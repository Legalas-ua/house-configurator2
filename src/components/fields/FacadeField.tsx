import { useConfigurator } from '../../state/store'
import type { FacadeKind, FacadeSpec, PanelShape, PlankDir } from '../../config/types'
import {
  FACADE_KINDS,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  PLANK_GAP,
  PLANK_THICKNESS,
  PLANK_WIDTH,
  SWATCHES,
} from '../../config/facade'
import { t } from '../../locales'

// Крок «Оздоблення фасаду». Матеріал і колір задаються ОКРЕМО для кожного
// поверху, тому першим ділом — перемикач поверху; усе нижче правит саме той,
// що обраний. Від того, шаблонне планування чи своє, тут нічого не залежить.
export default function FacadeField() {
  const config = useConfigurator((s) => s.config)
  const facades = useConfigurator((s) => s.facades)
  const floor = useConfigurator((s) => s.facadeFloor)
  const setFloor = useConfigurator((s) => s.setFacadeFloor)
  const setFacade = useConfigurator((s) => s.setFacade)
  const texts = t.steps.facade

  const idx = Math.min(floor, config.floors - 1)
  const spec = facades[idx]
  const patch = (p: Partial<FacadeSpec>) => setFacade(idx, p)

  return (
    <>
      {config.floors > 1 && (
        <div className="rooms__group">
          <span className="rooms__group-title">{texts.floor}</span>
          <div className="chips">
            {Array.from({ length: config.floors }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`chip${idx === i ? ' chip--on' : ''}`}
                onClick={() => setFloor(i)}
              >
                {texts.floorN(i + 1)}
              </button>
            ))}
          </div>
          <p className="rooms__hint">{texts.copyHint}</p>
        </div>
      )}

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.kind}</span>
        <div className="chips">
          {FACADE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${spec.kind === k ? ' chip--on' : ''}`}
              // Разом із типом підставляємо і його типовий колір: колір цегли
              // на штукатурці (і навпаки) виглядає випадковим.
              onClick={() => patch({ kind: k, color: SWATCHES[k][0] })}
            >
              {texts.kinds[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.color}</span>
        <div className="facade-color">
          <input
            type="color"
            className="facade-color__picker"
            value={spec.color}
            onChange={(e) => patch({ color: e.target.value })}
            aria-label={texts.color}
          />
          <span className="facade-color__value">{spec.color.toUpperCase()}</span>
        </div>
        <span className="rooms__subtitle">{texts.quick}</span>
        <div className="facade-swatches">
          {SWATCHES[spec.kind].map((c) => (
            <button
              key={c}
              type="button"
              className={`facade-swatch${spec.color.toLowerCase() === c ? ' facade-swatch--on' : ''}`}
              style={{ background: c }}
              onClick={() => patch({ color: c })}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      {spec.kind === 'thermowood' && (
        <div className="rooms__group">
          <span className="rooms__group-title">{texts.params}</span>
          <Size label={texts.plankWidth} value={spec.plankWidth} range={PLANK_WIDTH} onChange={(v) => patch({ plankWidth: v })} />
          <Size
            label={texts.plankThickness}
            value={spec.plankThickness}
            range={PLANK_THICKNESS}
            onChange={(v) => patch({ plankThickness: v })}
          />
          <Size label={texts.plankGap} value={spec.plankGap} range={PLANK_GAP} onChange={(v) => patch({ plankGap: v })} />
          <span className="rooms__subtitle">{texts.plankDir}</span>
          <div className="chips">
            {(['horizontal', 'vertical'] as PlankDir[]).map((d) => (
              <button
                key={d}
                type="button"
                className={`chip${spec.plankDir === d ? ' chip--on' : ''}`}
                onClick={() => patch({ plankDir: d })}
              >
                {texts.dirs[d]}
              </button>
            ))}
          </div>
        </div>
      )}

      {spec.kind === 'panels' && (
        <div className="rooms__group">
          <span className="rooms__group-title">{texts.params}</span>
          <span className="rooms__subtitle">{texts.panelShape}</span>
          <div className="chips">
            {(['square', 'rect'] as PanelShape[]).map((f) => (
              <button
                key={f}
                type="button"
                className={`chip${spec.panelShape === f ? ' chip--on' : ''}`}
                onClick={() => patch({ panelShape: f })}
              >
                {texts.shapes[f]}
              </button>
            ))}
          </div>
          <Size label={texts.panelWidth} value={spec.panelWidth} range={PANEL_WIDTH} onChange={(v) => patch({ panelWidth: v })} />
          {/* Квадратна панель бере висоту з ширини — окремий лічильник збивав би. */}
          {spec.panelShape === 'rect' && (
            <Size
              label={texts.panelHeight}
              value={spec.panelHeight}
              range={PANEL_HEIGHT}
              onChange={(v) => patch({ panelHeight: v })}
            />
          )}
        </div>
      )}
    </>
  )
}

// −/+ у міліметрах. Рахуємо В ЩАБЛЯХ, щоб дробові кроки не «перестрибували»
// круглих значень через похибку двійкових чисел (та сама пастка, що й у даху).
function Size({
  label,
  value,
  range,
  onChange,
}: {
  label: string
  value: number
  range: { min: number; max: number; step: number }
  onChange: (v: number) => void
}) {
  const move = (dir: 1 | -1) => {
    const next = (Math.round(value / range.step) + dir) * range.step
    onChange(Math.max(range.min, Math.min(range.max, next)))
  }
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
        <span className="counter__value">{t.steps.facade.mm(value)}</span>
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

export type { FacadeKind }
