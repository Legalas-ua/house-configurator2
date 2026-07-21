import { t } from '../locales'
import Stepper from './Stepper'
import StepContent from './StepContent'

export default function Panel() {
  return (
    <aside className="panel">
      <header className="panel__header">
        <h1 className="panel__title">{t.app.title}</h1>
        <p className="panel__subtitle">{t.app.subtitle}</p>
      </header>

      <div className="panel__content">
        <Stepper />
        <StepContent />
      </div>

      <footer className="panel__price">
        <span className="price__label">{t.price.label}</span>
        <span className="price__value">—</span>
      </footer>
    </aside>
  )
}
