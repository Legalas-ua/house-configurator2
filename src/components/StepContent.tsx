import { useConfigurator } from '../state/store'
import { STEPS } from '../config/steps'
import { t } from '../locales'
import BudgetSlider from './fields/BudgetSlider'
import OptionCards from './fields/OptionCards'

// Рендерить поточний крок за його описом (StepDef) — без знання про конкретику.
// Новий тип кроку = новий case тут + компонент у fields/.
export default function StepContent() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const config = useConfigurator((s) => s.config)
  const nextStep = useConfigurator((s) => s.nextStep)
  const prevStep = useConfigurator((s) => s.prevStep)

  const step = STEPS[currentStep]
  const texts = t.steps[step.id]

  return (
    <section className="step">
      <h2 className="step__title">{texts.title}</h2>
      <p className="step__hint">{texts.hint}</p>

      <div className="step__field">
        {step.kind === 'slider' && <BudgetSlider step={step} />}
        {step.kind === 'cards' && <OptionCards step={step} />}
      </div>

      <div className="step__nav">
        {/* З першого кроку «Назад» повертає на стартовий екран */}
        <button type="button" className="btn btn--ghost" onClick={prevStep}>
          {t.nav.back}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={nextStep}
          disabled={currentStep === STEPS.length - 1 || !step.isComplete(config)}
        >
          {t.nav.next}
        </button>
      </div>
    </section>
  )
}
