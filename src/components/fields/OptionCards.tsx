import { useConfigurator } from '../../state/store'
import type { StepDef } from '../../config/steps'
import { t } from '../../locales'
import { OPTION_ICONS } from './optionIcons'

// Універсальна сітка карток для будь-якого кроку типу 'cards'.
// Список опцій приходить із step.getOptions(config) — тому картки
// автоматично звужуються, коли попередні вибори обмежують доступне.
export default function OptionCards({ step }: { step: StepDef }) {
  const config = useConfigurator((s) => s.config)
  const setValue = useConfigurator((s) => s.setValue)

  const options = step.getOptions?.(config) ?? []
  const selected = config[step.configKey!]
  const labels = (t.steps[step.id] as { options?: Record<string, string> }).options ?? {}

  return (
    <div className="cards">
      {options.map((value) => (
        <button
          key={value}
          type="button"
          className={`card${selected === value ? ' card--selected' : ''}`}
          onClick={() => setValue(step.configKey!, value)}
        >
          {OPTION_ICONS[value] && <span className="card__icon">{OPTION_ICONS[value]}</span>}
          <span>{labels[value] ?? value}</span>
        </button>
      ))}
    </div>
  )
}
