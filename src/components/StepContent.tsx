import { useConfigurator, useHousePlan, useRoof, useWindows } from '../state/store'
import { STEPS } from '../config/steps'
import { validatePlan } from '../lib/validatePlan'
import { validateWindows } from '../lib/windows'
import { validateRoof } from '../lib/roof'
import { validateTerrace } from '../lib/terrace'
import { t } from '../locales'
import BudgetSlider from './fields/BudgetSlider'
import OptionCards from './fields/OptionCards'
import RoomsField from './fields/RoomsField'
import WindowsField from './fields/WindowsField'
import RoofField from './fields/RoofField'
import RoofZonesField from './fields/RoofZonesField'
import FacadeField from './fields/FacadeField'
import RoofMaterialField from './fields/RoofMaterialField'
import TerraceField from './fields/TerraceField'
import TerraceMaterialField from './fields/TerraceMaterialField'
import FloorsPicker from './fields/FloorsPicker'

// Рендерить поточний крок за його описом (StepDef) — без знання про конкретику.
// Новий тип кроку = новий case тут + компонент у fields/.
export default function StepContent() {
  const currentStep = useConfigurator((s) => s.currentStep)
  const config = useConfigurator((s) => s.config)
  const nextStep = useConfigurator((s) => s.nextStep)
  const prevStep = useConfigurator((s) => s.prevStep)

  const planMode = useConfigurator((s) => s.planMode)
  const windowsMode = useConfigurator((s) => s.windowsMode)
  const roofMode = useConfigurator((s) => s.roofMode)
  const terraceZones = useConfigurator((s) => s.terraceZones)
  const roofOverTerrace = useConfigurator((s) => s.roofOverTerrace)
  const roof = useRoof()
  const plan = useHousePlan()
  const windows = useWindows()

  const step = STEPS[currentStep]
  const texts = t.steps[step.id]
  // Помилки ручного редагування не пускають далі — виправляти доведеться тут.
  const blocked =
    (step.id === 'rooms' && planMode === 'custom' && validatePlan(plan).length > 0) ||
    (step.id === 'windows' && windowsMode === 'custom' && validateWindows(plan, windows).length > 0) ||
    (step.id === 'roofZones' && roofMode === 'custom' && validateRoof(plan, roof, roofOverTerrace).length > 0) ||
    (step.id === 'terrace' && validateTerrace(plan, terraceZones).length > 0)
  // У ручному режимі тип вікон/даху картками не обирають, тож step.isComplete
  // (він дивиться на config) там ніколи не спрацював би — кнопка «Далі»
  // лишалась би сірою назавжди.
  const customStep =
    (step.id === 'windows' && windowsMode === 'custom') ||
    ((step.id === 'roof' || step.id === 'roofZones') && roofMode === 'custom')

  return (
    <section className="step">
      <h2 className="step__title">{texts.title}</h2>
      <p className="step__hint">{texts.hint}</p>

      <div className="step__field">
        {step.kind === 'slider' && <BudgetSlider step={step} />}
        {step.kind === 'cards' && <OptionCards step={step} />}
        {step.kind === 'rooms' && <RoomsField />}
        {step.kind === 'windows' && <WindowsField step={step} />}
        {step.kind === 'roofZones' && <RoofZonesField />}
        {step.kind === 'roof' && <RoofField step={step} />}
        {step.kind === 'facade' && <FacadeField />}
        {step.kind === 'roofMat' && <RoofMaterialField />}
        {step.kind === 'terrace' && <TerraceField />}
        {step.kind === 'terraceMat' && <TerraceMaterialField />}
        {step.id === 'shape' && <FloorsPicker />}
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
          disabled={currentStep === STEPS.length - 1 || (!customStep && !step.isComplete(config)) || blocked}
        >
          {t.nav.next}
        </button>
      </div>
    </section>
  )
}
