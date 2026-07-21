import { useConfigurator } from '../state/store'
import { t } from '../locales'

// Стартовий екран: заголовок, короткий опис і кнопка «Почати».
export default function Landing() {
  const start = useConfigurator((s) => s.start)

  return (
    <div className="landing">
      <div className="landing__inner">
        <h1 className="landing__title">
          {t.landing.title}
          <span className="landing__dot">.</span>
        </h1>
        <p className="landing__tagline">{t.landing.tagline}</p>
        <button type="button" className="btn btn--primary btn--big" onClick={start}>
          {t.landing.start}
        </button>
      </div>
    </div>
  )
}
