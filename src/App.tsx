import { useConfigurator } from './state/store'
import { STEPS } from './config/steps'
import { t } from './locales'
import Landing from './components/Landing'
import Panel from './components/Panel'
import StepContent from './components/StepContent'
import MiniStepper from './components/MiniStepper'
import PlanIssues from './components/PlanIssues'
import RoomTooltip from './components/RoomTooltip'
import SceneRoot from './scene/SceneRoot'

// Три режими екрана:
// 1) стартовий екран (started = false)
// 2) крок без 3D (show3D: false) — картка по центру
// 3) крок з 3D (show3D: true) — сцена на весь екран + бічна панель
// Міні-степер зліва видно в режимах 2 і 3.
export default function App() {
  const started = useConfigurator((s) => s.started)
  const currentStep = useConfigurator((s) => s.currentStep)
  const setTopView = useConfigurator((s) => s.setTopView)
  const panelOpen = useConfigurator((s) => s.panelOpen)

  if (!started) return <Landing />

  const step = STEPS[currentStep]

  if (!step.show3D) {
    return (
      <div className="stage">
        <MiniStepper />
        <div className="stage__card">
          <StepContent />
        </div>
      </div>
    )
  }

  return (
    <div className={`app${panelOpen ? '' : ' app--narrow'}`}>
      <main className="viewport">
        <SceneRoot />
        <button
          type="button"
          className="topview-btn"
          onClick={() => setTopView(true)}
        >
          {t.viewport.topView}
        </button>
        <PlanIssues />
      </main>
      <MiniStepper />
      <Panel />
      <RoomTooltip />
    </div>
  )
}
