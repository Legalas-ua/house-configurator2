import type { ReactNode } from 'react'
import { useConfigurator, useHousePlan, useRoof, useWindows } from '../state/store'
import { STEPS } from '../config/steps'
import { validatePlan } from '../lib/validatePlan'
import { validateWindows } from '../lib/windows'
import { validateRoof } from '../lib/roof'
import { t } from '../locales'

// Помилки ручного редагування — плаваючим повідомленням у кутку сцени, а НЕ в
// бічній панелі: там вони міняли її висоту просто під час роботи.
export default function PlanIssues() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const planMode = useConfigurator((s) => s.planMode)
  const windowsMode = useConfigurator((s) => s.windowsMode)
  const plan = useHousePlan()
  const windows = useWindows()
  const roof = useRoof()
  const roofMode = useConfigurator((s) => s.roofMode)
  const roofOverTerrace = useConfigurator((s) => s.roofOverTerrace)
  const stepId = STEPS[currentStep].id

  if (stepId === 'rooms' && planMode === 'custom') {
    const issues = validatePlan(plan)
    if (issues.length === 0) return null
    const texts = t.steps.rooms.issues
    const name = (floor: number, id: string) => {
      const room = plan.floors[floor]?.rooms.find((r) => r.id === id)
      return room ? t.plan.roomNames[room.type] : id
    }
    return (
      <Card title={texts.title} blocked={texts.blocked}>
        {issues.map((it, i) => (
          <li key={i} className="plan-issues__item">
            {it.kind === 'overlap'
              ? texts.overlap(name(it.floor, it.rooms[0]), name(it.floor, it.rooms[1]))
              : it.kind === 'gap'
                ? texts.gap(name(it.floor, it.rooms[0]), name(it.floor, it.rooms[1]), it.value ?? 0)
                : it.kind === 'unsupported'
                  ? texts.unsupported(name(it.floor, it.rooms[0]))
                  : texts.stairsArea(it.value ?? 0)}
          </li>
        ))}
      </Card>
    )
  }

  if (stepId === 'windows' && windowsMode === 'custom') {
    const issues = validateWindows(plan, windows)
    if (issues.length === 0) return null
    const texts = t.steps.windows.issues
    return (
      <Card title={texts.title} blocked={texts.blocked}>
        {issues.map((it) => (
          <li key={`${it.floor}-${it.roomId}`} className="plan-issues__item">
            {texts.noWindow(t.plan.roomNames[it.roomType])}
          </li>
        ))}
      </Card>
    )
  }

  if (stepId === 'roofZones' && roofMode === 'custom') {
    const issues = validateRoof(plan, roof, roofOverTerrace)
    if (issues.length === 0) return null
    const texts = t.steps.roofZones.issues
    return (
      <Card title={texts.title} blocked={texts.blocked}>
        {issues.map((it, i) => (
          <li key={i} className="plan-issues__item">
            {it.kind === 'uncovered' ? texts.uncovered(it.level + 1) : texts.outside(it.level + 1)}
          </li>
        ))}
      </Card>
    )
  }

  return null
}

function Card({ title, blocked, children }: { title: string; blocked: string; children: ReactNode }) {
  return (
    <div className="plan-issues" role="alert">
      <span className="plan-issues__title">{title}</span>
      <ul className="plan-issues__list">{children}</ul>
      <span className="plan-issues__blocked">{blocked}</span>
    </div>
  )
}
