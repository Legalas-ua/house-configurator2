import { useConfigurator, useRoof } from '../../state/store'
import type { RoofMatSpec } from '../../config/types'
import { FLAT_MAT_KINDS, ROOF_MAT_KINDS, ROOF_SWATCHES, TRIM_SWATCHES } from '../../config/roofMaterial'
import { t } from '../../locales'

// Крок «Матеріали даху». Панель побудована як фасадна, а вибір частини —
// як на кроці «Дах»: клік по схилу в 3D (RoofView), підсвітка, потім
// налаштування. Без вибору правимо покриття ВСЬОГО даху.
export default function RoofMaterialField() {
  const parts = useRoof()
  const base = useConfigurator((s) => s.roofMat)
  const flatBase = useConfigurator((s) => s.roofFlat)
  const perPart = useConfigurator((s) => s.roofMats)
  const setBase = useConfigurator((s) => s.setRoofMat)
  const setPart = useConfigurator((s) => s.setPartRoofMat)
  const selected = useConfigurator((s) => s.selectedRoofPart)
  const setSelected = useConfigurator((s) => s.setSelectedRoofPart)
  const trim = useConfigurator((s) => s.roofTrimColor)
  const setTrim = useConfigurator((s) => s.setRoofTrimColor)
  const texts = t.steps.roofMat

  const part = parts.find((p) => p.id === selected)
  // Плоский дах і скатний накривають різними речами, тож і переліки різні.
  // Без вибраної частини правимо той набір, який на будинку взагалі є.
  const anyFlat = parts.some((p) => p.kind === 'flat')
  const flat = part ? part.kind === 'flat' : anyFlat && !parts.some((p) => p.kind !== 'flat')
  const kinds = flat ? FLAT_MAT_KINDS : ROOF_MAT_KINDS
  const target: RoofMatSpec = part ? (perPart[part.id] ?? (flat ? flatBase : base)) : flat ? flatBase : base
  const patch = (p: Partial<RoofMatSpec>) => (part ? setPart(part.id, p, target) : setBase(p, flat))

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{part ? texts.part : texts.all}</span>
        {!part ? (
          <p className="rooms__hint">{texts.pick}</p>
        ) : (
          <div className="rooms__selected">
            <span>
              {t.steps.roof.editor.kinds[part.kind]} · {part.width.toFixed(1)} × {part.depth.toFixed(1)} м
            </span>
            <button
              type="button"
              className="chip"
              disabled={!perPart[part.id]}
              onClick={() => {
                setPart(part.id, {}, base)
                setSelected(null)
              }}
            >
              {texts.reset}
            </button>
          </div>
        )}
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.kind}</span>
        <div className="chips">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${target.kind === k ? ' chip--on' : ''}`}
              onClick={() => patch({ kind: k, color: ROOF_SWATCHES[k][0] })}
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
          {ROOF_SWATCHES[target.kind].map((c) => (
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
      </div>

      {/* Торцева планка скатного даху й кожух парапету — той самий фарбований
          метал. Тип у них не обирають, лише колір. */}
      <div className="rooms__group">
        <span className="rooms__group-title">{anyFlat ? texts.cap : texts.fascia}</span>
        <div className="facade-color">
          <input
            type="color"
            className="facade-color__picker"
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            aria-label={texts.fascia}
          />
          <span className="facade-color__value">{trim.toUpperCase()}</span>
        </div>
        <div className="facade-swatches">
          {TRIM_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`facade-swatch${trim.toLowerCase() === c ? ' facade-swatch--on' : ''}`}
              style={{ background: c }}
              onClick={() => setTrim(c)}
              aria-label={c}
            />
          ))}
        </div>
        <p className="rooms__hint">{texts.trimHint}</p>
      </div>
    </>
  )
}
