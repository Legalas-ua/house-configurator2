import { useRef, useState } from 'react'

// ============================================================
// Значення лічильника, яке можна не лише клацати −/+, а й ВВЕСТИ З КЛАВІАТУРИ.
//
// Один компонент на всі лічильники: ширина вікна, звіс, висота парапету,
// розміри планок. Клацанням −/+ дібратись від 0,6 до 3,2 м — це три десятки
// натискань, а для ширини вікна це ще й єдиний спосіб (повзунки прибрано).
//
// Поки поле не в фокусі, показуємо ГОТОВИЙ підпис («1.6 м», «20 мм», «авто») —
// той самий, що був у span. У фокусі показуємо саме число, без одиниць: інакше
// його довелось би витирати перед кожним уведенням.
// ============================================================

export default function NumberValue({
  value,
  text,
  raw,
  scale = 1,
  onChange,
  label,
}: {
  value: number // значення в одиницях МОДЕЛІ (метри, градуси, штуки)
  text: string // як показувати, коли поле не редагують
  raw?: string // що покласти в поле на початку правки (типово — саме число)
  scale?: number // одиниця вводу в одиницях моделі: 0.001 для міліметрів
  onChange: (v: number) => void
  label: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  // Esc скасовує правку. Прапорець потрібен, бо blur після нього прилітає
  // РАНІШЕ за перемальовку: у полі ще стоїть чернетка, і вона б записалась.
  const cancelled = useRef(false)

  const start = () => raw ?? String(Number((value / scale).toFixed(3)))

  const commit = (s: string) => {
    setDraft(null)
    // Кома як десятковий роздільник і залишки одиниць («1,6 м») — звичайна
    // справа при вводі; чистимо, а не відкидаємо.
    const n = parseFloat(s.replace(',', '.').replace(/[^\d.-]/g, ''))
    // Те саме значення НЕ віддаємо: правка конфігурації гасить наступні кроки,
    // і просто клацнути по полю не має цього робити.
    if (Number.isFinite(n) && Math.abs(n * scale - value) > 1e-9) onChange(n * scale)
  }

  return (
    <input
      className="counter__value"
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={draft ?? text}
      onFocus={(e) => {
        setDraft(start())
        // Виділяємо ПІСЛЯ перемальовки — інакше виділиться старий підпис.
        const el = e.currentTarget
        requestAnimationFrame(() => el.select())
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        if (cancelled.current) {
          cancelled.current = false
          setDraft(null)
          return
        }
        commit(e.target.value)
      }}
      // Esc і Enter не пускаємо далі: у сцені на них висять «зняти вибір» —
      // і вихід із поля заразом скидав би обрану зону чи вікно.
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.stopPropagation()
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
    />
  )
}
