import { useConfigurator, useHousePlan } from '../../state/store'
import type { FacadeKind, FacadeSpec, PanelShape, PlanMode, PlankDir } from '../../config/types'
import {
  FACADE_KINDS,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  PLANK_GAP,
  PLANK_WIDTH,
  SWATCHES,
} from '../../config/facade'
import { wallFaces } from '../../lib/wallFaces'
import { t } from '../../locales'
import NumberValue from '../NumberValue'

// Крок «Оздоблення фасаду».
//
// Два режими:
//   «На весь поверх» — матеріал застосовується до всіх зовнішніх стін поверху;
//   «На окремі стіни» — клікаєш стіну в 3D і задаєш матеріал саме їй.
// Стіни в другому режимі — грані з lib/wallFaces.ts: довга стіна порізана по
// серединах внутрішніх перегородок, а на зовнішньому куті грань доходить рівно
// до кута.
export default function FacadeField() {
  const config = useConfigurator((s) => s.config)
  const plan = useHousePlan()
  const facades = useConfigurator((s) => s.facades)
  const floor = useConfigurator((s) => s.facadeFloor)
  const setFloor = useConfigurator((s) => s.setFacadeFloor)
  const setFacade = useConfigurator((s) => s.setFacade)
  const mode = useConfigurator((s) => s.facadeMode)
  const setMode = useConfigurator((s) => s.setFacadeMode)
  const wallFacades = useConfigurator((s) => s.wallFacades)
  const setWallFacade = useConfigurator((s) => s.setWallFacade)
  const selectedWall = useConfigurator((s) => s.selectedFacadeWall)
  const setSelectedWall = useConfigurator((s) => s.setSelectedFacadeWall)
  const syncColor = useConfigurator((s) => s.syncFacadeColor)
  const texts = t.steps.facade

  const idx = Math.min(floor, config.floors - 1)
  const face = mode === 'custom' && selectedWall ? wallFaces(plan).find((f) => f.id === selectedWall) : undefined
  // У режимі стін правимо ОБРАНУ стіну; поки не обрана — нічого не правимо.
  const target: FacadeSpec | null =
    mode === 'custom' ? (face ? (wallFacades[face.id] ?? facades[face.floor] ?? facades[0]) : null) : facades[idx]

  const patch = (p: Partial<FacadeSpec>) => {
    if (!target) return
    if (mode === 'custom' && face) setWallFacade(face.id, p, target)
    else setFacade(idx, p)
  }

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

      {mode === 'template' && config.floors > 1 && (
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

      {mode === 'custom' && (
        <div className="rooms__group">
          <span className="rooms__group-title">{texts.wall}</span>
          {!face ? (
            <p className="rooms__hint">{texts.pickWall}</p>
          ) : (
            <div className="rooms__selected">
              <span>{texts.floorN(face.floor + 1)}</span>
              {/* Повернути стіну під оздоблення поверху = просто зняти виняток */}
              <button
                type="button"
                className="chip"
                disabled={!wallFacades[face.id]}
                onClick={() => {
                  setWallFacade(face.id, {}, facades[face.floor] ?? facades[0])
                  setSelectedWall(null)
                }}
              >
                {texts.wallReset}
              </button>
            </div>
          )}
        </div>
      )}

      {target && (
        <>
          <div className="rooms__group">
            <span className="rooms__group-title">{texts.kind}</span>
            <div className="chips">
              {FACADE_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`chip${target.kind === k ? ' chip--on' : ''}`}
                  // Разом із типом підставляємо і його типовий колір: колір
                  // цегли на штукатурці (і навпаки) виглядає випадковим.
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
                value={target.color}
                onChange={(e) => patch({ color: e.target.value })}
                aria-label={texts.color}
              />
              <span className="facade-color__value">{target.color.toUpperCase()}</span>
            </div>
            <span className="rooms__subtitle">{texts.quick}</span>
            <div className="facade-swatches">
              {SWATCHES[target.kind].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`facade-swatch${target.color.toLowerCase() === c ? ' facade-swatch--on' : ''}`}
                  style={{ background: c }}
                  onClick={() => patch({ color: c })}
                  aria-label={c}
                />
              ))}
            </div>
            <span className="rooms__subtitle">{texts.sameColor}</span>
            <button type="button" className="chip" onClick={syncColor}>
              {texts.sameColor}
            </button>
            <p className="rooms__hint">{texts.sameColorHint}</p>
          </div>

          {target.kind === 'thermowood' && (
            <div className="rooms__group">
              <span className="rooms__group-title">{texts.params}</span>
              {/* Товщина планки більше не налаштовується: усі об'ємні
                  матеріали фасаду — рівно 20 мм. */}
              <Size
                label={texts.plankWidth}
                value={target.plankWidth}
                range={PLANK_WIDTH}
                onChange={(v) => patch({ plankWidth: v })}
              />
              <Size
                label={texts.plankGap}
                value={target.plankGap}
                range={PLANK_GAP}
                onChange={(v) => patch({ plankGap: v })}
              />
              <span className="rooms__subtitle">{texts.plankDir}</span>
              <div className="chips">
                {(['horizontal', 'vertical'] as PlankDir[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chip${target.plankDir === d ? ' chip--on' : ''}`}
                    onClick={() => patch({ plankDir: d })}
                  >
                    {texts.dirs[d]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {target.kind === 'panels' && (
            <div className="rooms__group">
              <span className="rooms__group-title">{texts.params}</span>
              <span className="rooms__subtitle">{texts.panelShape}</span>
              <div className="chips">
                {(['square', 'rect'] as PanelShape[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={`chip${target.panelShape === f ? ' chip--on' : ''}`}
                    onClick={() => patch({ panelShape: f })}
                  >
                    {texts.shapes[f]}
                  </button>
                ))}
              </div>
              <Size
                label={texts.panelWidth}
                value={target.panelWidth}
                range={PANEL_WIDTH}
                onChange={(v) => patch({ panelWidth: v })}
              />
              {/* Квадратна панель бере висоту з ширини — окремий лічильник збивав би. */}
              {target.panelShape === 'rect' && (
                <Size
                  label={texts.panelHeight}
                  value={target.panelHeight}
                  range={PANEL_HEIGHT}
                  onChange={(v) => patch({ panelHeight: v })}
                />
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

// −/+ у міліметрах. Рахуємо В ЩАБЛЯХ, щоб дробові кроки не «перестрибували»
// круглих значень через похибку двійкових чисел (та сама пастка, що й у даху).
export function Size({
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
        <NumberValue
          label={label}
          value={value}
          text={t.steps.facade.mm(value)}
          scale={0.001}
          onChange={(v) => onChange(Math.min(Math.max(v, range.min), range.max))}
        />
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
