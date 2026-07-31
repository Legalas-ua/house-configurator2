import { useConfigurator, useHousePlan, useWindows } from '../../state/store'
import type { PlanMode } from '../../config/types'
import type { StepDef } from '../../config/steps'
import { addWindow, removeWindow, updateWindow, WIN_TOP } from '../../lib/windows'
import { t } from '../../locales'
import OptionCards from './OptionCards'

// Крок «Вікна». Готовий варіант — ті самі картки типу (звичайні/панорамні).
// Свій варіант — редактор: вікна тягнуться мишею по стінах, а тут точні
// налаштування обраного вікна, додавання й видалення.
export default function WindowsField({ step }: { step: StepDef }) {
  const mode = useConfigurator((s) => s.windowsMode)
  const setMode = useConfigurator((s) => s.setWindowsMode)
  const texts = t.steps.windows

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.mode.title}</span>
        <div className="chips">
          {(['template', 'custom'] as PlanMode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${mode === m ? ' chip--on' : ''}`}
              onClick={() => setMode(m)}
            >
              {texts.mode[m]}
            </button>
          ))}
        </div>
        <p className="rooms__hint">{mode === 'custom' ? texts.mode.customHint : texts.mode.templateHint}</p>
      </div>

      {mode === 'template' ? <OptionCards step={step} /> : <WindowEditorPanel />}
    </>
  )
}

const SILL_STEP = 0.1

function WindowEditorPanel() {
  const plan = useHousePlan()
  const windows = useWindows()
  const config = useConfigurator((s) => s.config)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setCustomWindows = useConfigurator((s) => s.setCustomWindows)
  const selectedWindow = useConfigurator((s) => s.selectedWindow)
  const setSelectedWindow = useConfigurator((s) => s.setSelectedWindow)
  const selectedRoom = useConfigurator((s) => s.selectedRoom)
  const texts = t.steps.windows.editor

  const spec = windows.find((w) => w.id === selectedWindow)
  const floorIdx = Math.min(viewFloor, plan.floors.length) - 1
  const floor = plan.floors[floorIdx]
  const patch = (p: Parameters<typeof updateWindow>[2]) =>
    spec && setCustomWindows(updateWindow(windows, spec.id, p))

  // Додаємо вікно до кімнати: обраної на плані або першої без вікон.
  const targetRoom =
    floor?.rooms.find((r) => r.id === selectedRoom) ??
    floor?.rooms.find((r) => r.id && !windows.some((w) => w.floor === floorIdx && w.roomId === r.id))

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.add}</span>
        {targetRoom ? (
          <button
            type="button"
            className="chip"
            onClick={() => {
              const res = addWindow(plan, windows, floorIdx, targetRoom.id!, config.windows ?? 'standard')
              if (!res) return
              setCustomWindows(res.specs)
              setSelectedWindow(res.id)
            }}
          >
            {texts.addTo(t.plan.roomNames[targetRoom.type])}
          </button>
        ) : (
          <p className="rooms__hint">{texts.noRoom}</p>
        )}
        <p className="rooms__hint">{texts.hint}</p>
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.selected}</span>
        {!spec ? (
          <p className="rooms__hint">{texts.none}</p>
        ) : (
          <>
            <div className="rooms__selected">
              <span>{t.plan.roomNames[plan.floors[spec.floor]?.rooms.find((r) => r.id === spec.roomId)?.type ?? 'bedroom']}</span>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  setCustomWindows(removeWindow(windows, spec.id))
                  setSelectedWindow(null)
                }}
              >
                {texts.remove}
              </button>
            </div>

            <Stepper
              label={texts.sill}
              value={spec.sill}
              suffix=" м"
              onChange={(v) => patch({ sill: Math.max(0, Math.min(v, spec.top - 0.4)) })}
              stepSize={SILL_STEP}
            />
            <Stepper
              label={texts.top}
              value={spec.top}
              suffix=" м"
              onChange={(v) => patch({ top: Math.max(spec.sill + 0.4, Math.min(v, WIN_TOP + 0.2)) })}
              stepSize={SILL_STEP}
            />
            <Stepper
              label={texts.mullions}
              value={spec.mullions}
              auto
              onChange={(v) => patch({ mullions: Math.max(-1, Math.min(v, 6)) })}
              stepSize={1}
            />

            <label className="floor-hide">
              <input type="checkbox" checked={spec.door} onChange={(e) => patch({ door: e.target.checked })} />
              {texts.door}
            </label>
          </>
        )}
      </div>
    </>
  )
}

// −/+ для числа. auto: значення −1 показуємо як «авто» (імпости за шириною).
function Stepper({
  label,
  value,
  onChange,
  stepSize,
  suffix = '',
  auto = false,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  stepSize: number
  suffix?: string
  auto?: boolean
}) {
  const shown = auto && value < 0 ? t.steps.windows.editor.autoValue : `${value.toFixed(stepSize < 1 ? 1 : 0)}${suffix}`
  return (
    <div className="counter">
      <span className="counter__label">{label}</span>
      <div className="counter__controls">
        <button type="button" className="counter__btn" onClick={() => onChange(value - stepSize)} aria-label={`${label}: менше`}>
          −
        </button>
        <span className="counter__value">{shown}</span>
        <button type="button" className="counter__btn" onClick={() => onChange(value + stepSize)} aria-label={`${label}: більше`}>
          +
        </button>
      </div>
    </div>
  )
}
