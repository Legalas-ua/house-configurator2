import { useMemo } from 'react'
import { useConfigurator } from '../state/store'
import { calculatePrice } from '../lib/price'
import { PLACEHOLDER_PRICES } from '../config/pricing'
import { t } from '../locales'

const uah = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  maximumFractionDigits: 0,
})

// Жива ціна внизу панелі + індикатор «вписується / понад бюджет».
export default function PriceBar() {
  const config = useConfigurator((s) => s.config)

  const estimate = useMemo(() => calculatePrice(config, PLACEHOLDER_PRICES), [config])

  return (
    <footer className="panel__price">
      <span className="price__label">{t.price.label}</span>
      {estimate.budgetStatus === 'incomplete' ? (
        <span className="price__incomplete">{t.price.incomplete}</span>
      ) : (
        <>
          <span className="price__value">
            {uah.format(estimate.total)}
            <span className="price__area"> · {estimate.areaM2} м²</span>
          </span>
          {estimate.budgetStatus === 'within' ? (
            <span className="price__badge price__badge--ok">{t.price.within}</span>
          ) : (
            <span className="price__badge price__badge--over">
              {t.price.over} {uah.format(estimate.overBy)}
            </span>
          )}
        </>
      )}
    </footer>
  )
}
