import { useConfigurator, useHousePlan, useWindows } from '../../state/store'
import type { PlanMode, RoomZone } from '../../config/types'
import type { StepDef } from '../../config/steps'
import {
  addWindow,
  countOnWall,
  panelCount,
  removeWindow,
  freeSlots,
  maxDoors,
  updateWindow,
  DOOR_LEAF,
  MIN_DOOR_W,
  MAX_PER_WALL,
  MIN_WIN_W,
  WIN_TOP,
  type Side,
} from '../../lib/windows'
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

const SIZE_STEP = 0.1

function WindowEditorPanel() {
  const plan = useHousePlan()
  const windows = useWindows()
  const config = useConfigurator((s) => s.config)
  const setCustomWindows = useConfigurator((s) => s.setCustomWindows)
  const selectedWindow = useConfigurator((s) => s.selectedWindow)
  const setSelectedWindow = useConfigurator((s) => s.setSelectedWindow)
  const selectedWall = useConfigurator((s) => s.selectedWall)
  const selectedDoor = useConfigurator((s) => s.selectedDoor)
  const setSelectedDoor = useConfigurator((s) => s.setSelectedDoor)
  const setSelectedWall = useConfigurator((s) => s.setSelectedWall)
  const texts = t.steps.windows.editor

  const spec = windows.find((w) => w.id === selectedWindow)
  // Ключ стіни несе свій поверх — редагуємо всі поверхи разом.
  const wallFloor = selectedWall ? Number(selectedWall.slice(0, selectedWall.indexOf('-'))) : 0
  const floorIdx = Number.isFinite(wallFloor) ? wallFloor : 0
  const floor = plan.floors[floorIdx]
  const patch = (p: Parameters<typeof updateWindow>[2]) =>
    spec && setCustomWindows(updateWindow(windows, spec.id, p))

  // Обрана стіна кодується як `${floor}-${roomId}-${side}` (див. WindowEditor).
  const parsed = parseWallKey(selectedWall, floor?.rooms ?? [])
  const onWall = parsed ? countOnWall(windows, floorIdx, parsed.room.id!, parsed.side) : 0
  const wallFull = onWall >= MAX_PER_WALL

  const panels = spec ? panelCount(spec.mullions, spec.width) : 1
  const maxDoor = spec ? Math.max(MIN_DOOR_W, spec.width - MIN_DOOR_W * (spec.doors.length - 1)) : DOOR_LEAF

  return (
    <>
      <div className="rooms__group">
        <span className="rooms__group-title">{texts.add}</span>
        {parsed ? (
          <>
            <button
              type="button"
              className="chip"
              disabled={wallFull}
              onClick={() => {
                const res = addWindow(
                  plan,
                  windows,
                  floorIdx,
                  parsed.room.id!,
                  config.windows ?? 'standard',
                  parsed.side,
                )
                if (!res) return
                setCustomWindows(res.specs)
                setSelectedWindow(res.id)
                setSelectedWall(null)
              }}
            >
              {texts.addTo(t.plan.roomNames[parsed.room.type])}
            </button>
            <p className="rooms__hint">
              {wallFull ? texts.wallFull(MAX_PER_WALL) : texts.onWall(onWall, MAX_PER_WALL)}
            </p>
          </>
        ) : (
          <p className="rooms__hint">{texts.pickWall}</p>
        )}
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.selected}</span>
        {!spec ? (
          <p className="rooms__hint">{texts.none}</p>
        ) : (
          <>
            <div className="rooms__selected">
              <span>{t.plan.roomNames[roomOf(plan, spec.floor, spec.roomId)?.type ?? 'bedroom']}</span>
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
              label={texts.width}
              value={spec.width}
              suffix=" м"
              stepSize={SIZE_STEP}
              onChange={(v) => patch({ width: Math.max(MIN_WIN_W, v) })}
            />
            <Stepper
              label={texts.sill}
              value={spec.sill}
              suffix=" м"
              stepSize={SIZE_STEP}
              onChange={(v) => patch({ sill: Math.max(0, Math.min(v, spec.top - 0.4)) })}
            />
            <Stepper
              label={texts.top}
              value={spec.top}
              suffix=" м"
              stepSize={SIZE_STEP}
              onChange={(v) => patch({ top: Math.max(spec.sill + 0.4, Math.min(v, WIN_TOP + 0.2)) })}
            />
            <Stepper
              label={texts.mullions}
              value={spec.mullions}
              auto
              stepSize={1}
              onChange={(v) => patch({ mullions: Math.max(-1, Math.min(v, 6)) })}
            />

            {/* Двері — лічильник, як імпости. Скільки влізе, стільки й можна:
                двоє дверей потребують хоча б 2 × 800 мм ширини вікна. */}
            <Stepper
              label={texts.doors}
              value={spec.doors.length}
              stepSize={1}
              onChange={(n) => {
                const want = Math.max(0, Math.min(n, Math.min(maxDoors(spec.width), panels)))
                if (want === spec.doors.length) return
                const next =
                  want > spec.doors.length
                    ? [...spec.doors, { width: DOOR_LEAF, slot: freeSlots(spec)[0] ?? 0 }]
                    : spec.doors.slice(0, want)
                patch({ doors: next })
                setSelectedDoor(next.length ? Math.min(selectedDoor ?? 0, next.length - 1) : null)
              }}
            />

            {spec.doors.length > 1 && (
              <div className="chips">
                {spec.doors.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chip${(selectedDoor ?? 0) === i ? ' chip--on' : ''}`}
                    onClick={() => setSelectedDoor(i)}
                  >
                    {texts.doorN(i + 1)}
                  </button>
                ))}
              </div>
            )}

            {spec.doors.length > 0 && (
              <>
                <Stepper
                  label={texts.doorWidth}
                  value={spec.doors[Math.min(selectedDoor ?? 0, spec.doors.length - 1)].width}
                  suffix=" м"
                  stepSize={SIZE_STEP}
                  onChange={(v) => {
                    const i = Math.min(selectedDoor ?? 0, spec.doors.length - 1)
                    const w = Math.max(MIN_DOOR_W, Math.min(v, maxDoor))
                    patch({ doors: spec.doors.map((d, k) => (k === i ? { ...d, width: w } : d)) })
                  }}
                />
                <p className="rooms__hint">{texts.doorSlotHint}</p>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

const roomOf = (plan: ReturnType<typeof useHousePlan>, floor: number, id: string) =>
  plan.floors[floor]?.rooms.find((r) => r.id === id)

// Ключ стіни -> кімната і сторона. Ключ формує WindowEditor у сцені.
function parseWallKey(key: string | null, rooms: RoomZone[]): { room: RoomZone; side: Side } | null {
  if (!key) return null
  const at = key.lastIndexOf('-')
  const side = key.slice(at + 1) as Side
  const roomId = key.slice(key.indexOf('-') + 1, at)
  const room = rooms.find((r) => r.id === roomId)
  return room ? { room, side } : null
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
  const shown =
    auto && value < 0
      ? t.steps.windows.editor.autoValue
      : `${value.toFixed(stepSize < 1 ? 1 : 0)}${suffix}`
  const round = (v: number) => Math.round(v / stepSize) * stepSize
  return (
    <div className="counter">
      <span className="counter__label">{label}</span>
      <div className="counter__controls">
        <button type="button" className="counter__btn" onClick={() => onChange(round(value - stepSize))} aria-label={`${label}: менше`}>
          −
        </button>
        <span className="counter__value">{shown}</span>
        <button type="button" className="counter__btn" onClick={() => onChange(round(value + stepSize))} aria-label={`${label}: більше`}>
          +
        </button>
      </div>
    </div>
  )
}
