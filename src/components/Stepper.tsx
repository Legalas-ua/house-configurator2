import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { t } from '../locales'

// Список кроків з індикаторами прогресу. Клік по пройденому кроку — перехід.
export default function Stepper() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const maxStepReached = useConfigurator((s) => s.maxStepReached)
  const config = useConfigurator((s) => s.config)
  const goToStep = useConfigurator((s) => s.goToStep)

  return (
    <ol className="stepper">
      {STEPS.map((step, i) => {
        const state =
          i === currentStep ? 'active' : step.isComplete(config) && i <= maxStepReached ? 'done' : 'todo'
        return (
          <li key={step.id}>
            <button
              type="button"
              className={`stepper__item stepper__item--${state}`}
              onClick={() => goToStep(i)}
              disabled={i > maxStepReached}
            >
              <span className="stepper__dot">{i + 1}</span>
              <span className="stepper__label">{t.steps[step.id].title}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
