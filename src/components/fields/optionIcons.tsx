import type { ReactElement } from 'react'

// Міні-схеми (вид зверху) для опцій-карток. Ключ = значення опції.
// Опція без запису тут просто показується без схеми.
export const OPTION_ICONS: Record<string, ReactElement> = {
  rect: (
    <svg viewBox="0 0 48 40" width="48" height="40" aria-hidden="true">
      <rect x="6" y="11" width="36" height="18" rx="2" />
    </svg>
  ),
  square: (
    <svg viewBox="0 0 48 40" width="48" height="40" aria-hidden="true">
      <rect x="12" y="8" width="24" height="24" rx="2" />
    </svg>
  ),
  'l-shape': (
    <svg viewBox="0 0 48 40" width="48" height="40" aria-hidden="true">
      <path d="M8 8 h20 v14 h12 v10 H8 Z" />
    </svg>
  ),
}
