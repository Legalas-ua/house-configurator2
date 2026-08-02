import { useConfigurator, useHousePlan } from '../../state/store'
import type { InteriorSpec } from '../../config/types'
import {
  BOARD_WIDTH,
  FLOOR_JOINT,
  FLOOR_TILE,
  INTERIOR_KINDS,
  INTERIOR_SWATCHES,
  NO_INTERIOR,
} from '../../config/interior'
import { addDoor, doorRange, innerWalls, removeDoor, updateDoor, MAX_IDOOR_W, MIN_IDOOR_W } from '../../lib/innerWalls'
import { t } from '../../locales'

// Крок «Інтер'єр». Поки що це підлога: на весь поверх або окремо в кімнаті.
// Кімнати вибираємо списком, а не кліком у 3D: зсередини будинку в них не
// поцілиш, доки стіни й дах на місці.
export default function InteriorField() {
  const plan = useHousePlan()
  const config = useConfigurator((s) => s.config)
  const floors = useConfigurator((s) => s.interiorFloors)
  const perRoom = useConfigurator((s) => s.roomFloorMats)
  const idx = useConfigurator((s) => s.interiorFloor)
  const setFloor = useConfigurator((s) => s.setInteriorFloor)
  const picked = useConfigurator((s) => s.selectedInteriorRoom)
  const setPicked = useConfigurator((s) => s.setSelectedInteriorRoom)
  const patch = useConfigurator((s) => s.setInterior)
  const texts = t.steps.interior

  const floorIdx = Math.min(idx, config.floors - 1)
  const rooms = (plan.floors[floorIdx]?.rooms ?? []).filter((r) => r.id && !NO_INTERIOR.includes(r.type))
  const spec: InteriorSpec = (picked ? perRoom[picked] : undefined) ?? floors[floorIdx] ?? floors[0]

  return (
    <>
      <InnerDoors />

      {config.floors > 1 && (
        <div className="rooms__group">
          <span className="rooms__group-title">{texts.floor}</span>
          <div className="chips">
            {Array.from({ length: config.floors }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`chip${floorIdx === i ? ' chip--on' : ''}`}
                onClick={() => setFloor(i)}
              >
                {texts.floorN(i + 1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.scope}</span>
        <div className="chips">
          <button
            type="button"
            className={`chip${!picked ? ' chip--on' : ''}`}
            onClick={() => setPicked(null)}
          >
            {texts.whole}
          </button>
          {rooms.map((r) => {
            const key = `${floorIdx}|${r.id}`
            return (
              <button
                key={key}
                type="button"
                className={`chip${picked === key ? ' chip--on' : ''}`}
                onClick={() => setPicked(key)}
              >
                {t.plan.roomNames[r.type]}
              </button>
            )
          })}
        </div>
        <p className="rooms__hint">{picked ? texts.room : texts.pickHint}</p>
      </div>

      <div className="rooms__group">
        <span className="rooms__group-title">{texts.kind}</span>
        <div className="chips">
          {INTERIOR_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className={`chip${spec.kind === k ? ' chip--on' : ''}`}
              onClick={() => patch({ kind: k, color: INTERIOR_SWATCHES[k][0] })}
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
          {INTERIOR_SWATCHES[spec.kind].map((c) => (
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

      {spec.kind !== 'carpet' && (
        <div className="rooms__group">
          <span className="rooms__group-title">{texts.params}</span>
          {spec.kind === 'board' ? (
            <>
              <Size
                label={texts.boardWidth}
                value={spec.boardWidth}
                range={BOARD_WIDTH}
                onChange={(v) => patch({ boardWidth: v })}
              />
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
              <Size label={texts.tile} value={spec.tile} range={FLOOR_TILE} onChange={(v) => patch({ tile: v })} />
              <Size label={texts.joint} value={spec.joint} range={FLOOR_JOINT} onChange={(v) => patch({ joint: v })} />
            </>
          )}
        </div>
      )}
    </>
  )
}

// Двері та арки у перегородках. Автоматичні двері на цьому кроці зникають —
// розстановка повністю ручна, як і вікна на фасаді.
function InnerDoors() {
  const plan = useHousePlan()
  const doors = useConfigurator((s) => s.innerDoors)
  const setDoors = useConfigurator((s) => s.setInnerDoors)
  const wallId = useConfigurator((s) => s.selectedInnerWall)
  const doorId = useConfigurator((s) => s.selectedInnerDoor)
  const setDoorId = useConfigurator((s) => s.setSelectedInnerDoor)
  const texts = t.steps.interior.doors

  const walls = innerWalls(plan)
  const wall = walls.find((w) => w.id === wallId)
  const door = doors.find((d) => d.id === doorId)
  const range = wall ? doorRange(wall) : null
  const maxW = range ? Math.min(MAX_IDOOR_W, range.to - range.from) : MAX_IDOOR_W

  const add = (arch: boolean) => {
    if (!wall) return
    const d = addDoor(wall, doors, arch)
    if (!d) return
    setDoors([...doors, d])
    setDoorId(d.id)
  }

  return (
    <div className="rooms__group">
      <span className="rooms__group-title">{texts.title}</span>
      {!wall ? (
        <p className="rooms__hint">{texts.pickWall}</p>
      ) : (
        <>
          <div className="chips">
            <button type="button" className="chip" onClick={() => add(false)}>
              {texts.addDoor}
            </button>
            <button type="button" className="chip" onClick={() => add(true)}>
              {texts.addArch}
            </button>
          </div>
          <p className="rooms__hint">{texts.addHint}</p>
        </>
      )}

      {door && (
        <>
          <div className="rooms__selected">
            <span>{door.arch ? texts.arch : texts.door}</span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setDoors(removeDoor(doors, door.id))
                setDoorId(null)
              }}
            >
              {texts.remove}
            </button>
          </div>
          <Size
            label={texts.width}
            value={door.width}
            range={{ min: MIN_IDOOR_W, max: maxW, step: 0.05 }}
            onChange={(v) => setDoors(updateDoor(doors, door.id, { width: v }))}
          />
          <Size
            label={texts.height}
            value={door.height}
            range={{ min: 1.9, max: 2.9, step: 0.05 }}
            onChange={(v) => setDoors(updateDoor(doors, door.id, { height: v }))}
          />
          <div className="chips">
            <button
              type="button"
              className={`chip${!door.arch ? ' chip--on' : ''}`}
              onClick={() => setDoors(updateDoor(doors, door.id, { arch: false }))}
            >
              {texts.door}
            </button>
            <button
              type="button"
              className={`chip${door.arch ? ' chip--on' : ''}`}
              onClick={() => setDoors(updateDoor(doors, door.id, { arch: true }))}
            >
              {texts.arch}
            </button>
          </div>
        </>
      )}
    </div>
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
        <span className="counter__value">{t.steps.interior.mm(value)}</span>
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
