import { useConfigurator, useHousePlan } from '../state/store'
import { STEPS } from '../config/steps'
import { validatePlan } from '../lib/validatePlan'
import { t } from '../locales'

// Помилки планування — плаваючим повідомленням у кутку сцени, а НЕ в бічній
// панелі: у панелі вони міняли її висоту й перебудовували вміст просто під час
// редагування.
export default function PlanIssues() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const planMode = useConfigurator((s) => s.planMode)
  const plan = useHousePlan()
  const texts = t.steps.rooms.issues

  if (STEPS[currentStep].id !== 'rooms' || planMode !== 'custom') return null

  const issues = validatePlan(plan)
  if (issues.length === 0) return null

  const name = (floor: number, id: string) => {
    const room = plan.floors[floor]?.rooms.find((r) => r.id === id)
    return room ? t.plan.roomNames[room.type] : id
  }

  return (
    <div className="plan-issues" role="alert">
      <span className="plan-issues__title">{texts.title}</span>
      <ul className="plan-issues__list">
        {issues.map((it, i) => (
          <li key={i} className="plan-issues__item">
            {it.kind === 'overlap'
              ? texts.overlap(name(it.floor, it.rooms[0]), name(it.floor, it.rooms[1]))
              : it.kind === 'gap'
                ? texts.gap(name(it.floor, it.rooms[0]), name(it.floor, it.rooms[1]), it.value ?? 0)
                : texts.stairsArea(it.value ?? 0)}
          </li>
        ))}
      </ul>
      <span className="plan-issues__blocked">{texts.blocked}</span>
    </div>
  )
}
