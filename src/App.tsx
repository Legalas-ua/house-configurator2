import Panel from './components/Panel'

export default function App() {
  return (
    <div className="app">
      <main className="viewport">{/* 3D-сцена з'явиться у Фазі 3 */}</main>
      <Panel />
    </div>
  )
}
