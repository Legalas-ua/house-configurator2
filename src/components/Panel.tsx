import { t } from '../locales'
import StepContent from './StepContent'
import Legend from './Legend'

export default function Panel() {
  return (
    <aside className="panel">
      <header className="panel__header">
        <h1 className="panel__title">{t.app.title}</h1>
        <p className="panel__subtitle">{t.app.subtitle}</p>
      </header>

      <div className="panel__content">
        <StepContent />
      </div>

      <Legend />
    </aside>
  )
}
