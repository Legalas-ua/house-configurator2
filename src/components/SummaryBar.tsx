import { useMemo } from 'react'
import { useConfigurator } from '../state/store'
import { calculateTargetArea } from '../lib/area'
import { t } from '../locales'

// Низ панелі: жива орієнтовна площа будинку.
// Вартість повернеться сюди, коли з'являться реальні ціни (див. lib/price.ts).
export default function SummaryBar() {
  const config = useConfigurator((s) => s.config)

  const areaM2 = useMemo(() => calculateTargetArea(config), [config])

  return (
    <footer className="panel__price">
      <span className="price__label">{t.summary.areaLabel}</span>
      {config.shape === null ? (
        <span className="price__incomplete">{t.summary.incomplete}</span>
      ) : (
        <span className="price__value">{areaM2} м²</span>
      )}
    </footer>
  )
}
