import { useConfigurator } from './state/store'
import { STEPS } from './config/steps'
import Landing from './components/Landing'
import Panel from './components/Panel'
import StepContent from './components/StepContent'
import SceneRoot from './scene/SceneRoot'

// Три режими екрана:
// 1) стартовий екран (started = false)
// 2) крок без 3D (show3D: false) — картка по центру
// 3) крок з 3D (show3D: true) — сцена на весь екран + бічна панель
export default function App() {
  const started = useConfigurator((s) => s.started)
  const currentStep = useConfigurator((s) => s.currentStep)

  if (!started) return <Landing />

  const step = STEPS[currentStep]

  if (!step.show3D) {
    return (
      <div className="stage">
        <div className="stage__card">
          <span className="stage__progress">
            {currentStep + 1} / {STEPS.length}
          </span>
          <StepContent />
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <main className="viewport">
        <SceneRoot />
      </main>
      <Panel />
    </div>
  )
}
