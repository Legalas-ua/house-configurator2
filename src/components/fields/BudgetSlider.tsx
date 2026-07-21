import { useConfigurator } from '../../state/store'
import type { StepDef } from '../../config/steps'

const uah = new Intl.NumberFormat('uk-UA', {
  style: 'currency',
  currency: 'UAH',
  maximumFractionDigits: 0,
})

export default function BudgetSlider({ step }: { step: StepDef }) {
  const budget = useConfigurator((s) => s.config.budget)
  const setValue = useConfigurator((s) => s.setValue)
  const { min, max, step: inc } = step.slider!

  return (
    <div className="budget">
      <output className="budget__value">{uah.format(budget)}</output>
      <input
        type="range"
        className="budget__range"
        min={min}
        max={max}
        step={inc}
        value={budget}
        onChange={(e) => setValue('budget', Number(e.target.value))}
      />
      <div className="budget__bounds">
        <span>{uah.format(min)}</span>
        <span>{uah.format(max)}</span>
      </div>
    </div>
  )
}
