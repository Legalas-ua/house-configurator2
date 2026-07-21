import Panel from './components/Panel'
import SceneRoot from './scene/SceneRoot'

export default function App() {
  return (
    <div className="app">
      <main className="viewport">
        <SceneRoot />
      </main>
      <Panel />
    </div>
  )
}

