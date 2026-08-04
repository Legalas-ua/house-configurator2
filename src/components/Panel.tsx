import { useConfigurator } from '../state/store'
import { t } from '../locales'
import StepContent from './StepContent'
import Legend from './Legend'

// Права панель. Її можна згорнути — на телефоні вона з'їдає майже весь
// екран, та й на десктопі часом хочеться подивитись на будинок цілком.
export default function Panel() {
  const open = useConfigurator((s) => s.panelOpen)
  const setOpen = useConfigurator((s) => s.setPanelOpen)

  return (
    <>
      <button
        type="button"
        className={`panel-toggle${open ? '' : ' panel-toggle--closed'}`}
        onClick={() => setOpen(!open)}
        aria-label={open ? t.nav.hidePanel : t.nav.showPanel}
        title={open ? t.nav.hidePanel : t.nav.showPanel}
      >
        {open ? '›' : '‹'}
      </button>

      <aside className={`panel${open ? '' : ' panel--closed'}`} aria-hidden={!open}>
        <header className="panel__header">
          <h1 className="panel__title">{t.app.title}</h1>
          <p className="panel__subtitle">{t.app.subtitle}</p>
        </header>

        <div className="panel__content">
          <StepContent />
        </div>

        <Legend />
      </aside>
    </>
  )
}
