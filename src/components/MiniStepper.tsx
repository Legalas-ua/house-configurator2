import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { t } from '../locales'

// Мінімальний вертикальний степер біля лівого краю екрана:
// маленькі кружечки з номерами, назва — у тултіпі.
export default function MiniStepper() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const maxStepReached = useConfigurator((s) => s.maxStepReached)
  const goToStep = useConfigurator((s) => s.goToStep)

  return (
    <nav className="ministepper">
      {STEPS.map((step, i) => (
        <button
          key={step.id}
          type="button"
          title={t.steps[step.id].title}
          className={`ministepper__dot${i === currentStep ? ' ministepper__dot--active' : ''}`}
          onClick={() => goToStep(i)}
          disabled={i > maxStepReached}
        >
          {i + 1}
        </button>
      ))}
    </nav>
  )
}
