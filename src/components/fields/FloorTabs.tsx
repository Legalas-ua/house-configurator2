import { useConfigurator } from '../../state/store'
import { t } from '../../locales'

// Перемикач поверхів + галочка «сховати 2-й». Спільний для кроків «Кімнати»
// та «Вікна»: редагуємо завжди один поверх за раз.
export default function FloorTabs({ withHide = true }: { withHide?: boolean }) {
  const floors = useConfigurator((s) => s.config.floors)
  const viewFloor = useConfigurator((s) => s.viewFloor)
  const setViewFloor = useConfigurator((s) => s.setViewFloor)
  const hideFloor2 = useConfigurator((s) => s.hideFloor2)
  const setHideFloor2 = useConfigurator((s) => s.setHideFloor2)
  const setSelectedRoom = useConfigurator((s) => s.setSelectedRoom)
  const setSelectedWindow = useConfigurator((s) => s.setSelectedWindow)
  const setSelectedWall = useConfigurator((s) => s.setSelectedWall)

  if (floors !== 2) return null

  return (
    <>
      <div className="floor-tabs">
        {[1, 2].map((n) => (
          <button
            key={n}
            type="button"
            className={`floor-tab${viewFloor === n ? ' floor-tab--active' : ''}`}
            onClick={() => {
              setViewFloor(n)
              // Вибір належав іншому поверху — тримати його немає сенсу.
              setSelectedRoom(null)
              setSelectedWindow(null)
              setSelectedWall(null)
            }}
          >
            {t.plan.floorTab(n)}
          </button>
        ))}
      </div>
      {withHide && viewFloor === 1 && (
        <label className="floor-hide">
          <input type="checkbox" checked={hideFloor2} onChange={(e) => setHideFloor2(e.target.checked)} />
          {t.plan.hideFloor2}
        </label>
      )}
    </>
  )
}
