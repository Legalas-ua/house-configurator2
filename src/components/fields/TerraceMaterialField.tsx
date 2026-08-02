import { useConfigurator, useHousePlan } from '../../state/store'
import type { TerraceMatSpec } from '../../config/types'
import {
  DECK_GAP,
  DECK_WIDTH,
  TERRACE_MAT_KINDS,
  TERRACE_SWATCHES,
  TILE_JOINT,
  TILE_SIZE,
} from '../../config/terraceMaterial'
import { hasUpperTerrace } from '../../lib/terraceSkin'
import { t } from '../../locales'

// Крок «Покриття тераси». Рівнів два: тераса на землі (зони попереднього
// кроку) і тераса 2-го поверху (кімната типу «тераса»). Якщо якогось із них
// немає — перемикач на нього не активний.
export default function TerraceMaterialField() {
  const plan = useHousePlan()
  const zones = useConfigurator((s) => s.terraceZones)
  const mats = useConfigurator((s) => s.terraceMats)
  const floor = useConfigurator((s) => s.terraceFloor)
  const setFloor = useConfigurator((s) => s.setTerraceFloor)
  const setMat = useConfigurator((s) => s.setTerraceMat)
  const texts = t.steps.terraceMat

  const upper = hasUpperTerrace(plan)
  const ground = zones.length > 0
  const idx = floor === 1 && upper ? 1 : 0
  const spec = mats[idx]
  const patch = (p: Partial<TerraceMatSpec>) => setMat(idx, p)

  if (!ground && !upper) return <p className="rooms__hint">{texts.noZones}</p>

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.floor}</span>
        <div className="chips">
          {[0, 1].map((i) => (
            <button
              key={i}
              type="button"
              className={`chip${idx === i ? ' chip--on' : ''}`}
              disabled={i === 0 ? !ground : !upper}
              onClick={() => setFloor(i)}
            >
              {texts.floorN(i + 1)}
            </button>
          ))}
        </div>
        {!upper && <p className="rooms__hint">{texts.noUpper}</p>}
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.kind}</span>
        <div className="chips">
          {TERRACE_MAT_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${spec.kind === k ? ' chip--on' : ''}`}
              onClick={() => patch({ kind: k, color: TERRACE_SWATCHES[k][0] })}
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
          {TERRACE_SWATCHES[spec.kind].map((c) => (
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

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.params}</span>
        {spec.kind === 'decking' ? (
          <>
            <Size label={texts.boardWidth} value={spec.boardWidth} range={DECK_WIDTH} onChange={(v) => patch({ boardWidth: v })} />
            <Size label={texts.gap} value={spec.gap} range={DECK_GAP} onChange={(v) => patch({ gap: v })} />
            <span className="rooms__subtitle">{texts.dir}</span>
            <div className="chips">
              {(['x', 'z'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`chip${spec.dir === d ? ' chip--on' : ''}`}
                  onClick={() => patch({ dir: d })}
                >
                  {texts.dirs[d]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <Size label={texts.tile} value={spec.tile} range={TILE_SIZE} onChange={(v) => patch({ tile: v })} />
            <Size label={texts.joint} value={spec.joint} range={TILE_JOINT} onChange={(v) => patch({ joint: v })} />
          </>
        )}
      </div>
    </>
  )
}

// −/+ у міліметрах, у ЩАБЛЯХ — щоб дробові кроки не перестрибували круглих
// значень через похибку двійкових чисел.
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
        <span className="counter__value">{t.steps.terraceMat.mm(value)}</span>
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
