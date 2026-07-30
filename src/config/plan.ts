import type { RoomType } from './types'

// Висота цоколя. Нуль сцени = ВЕРХ фундаменту (на ньому стоїть уся геометрія
// будинку), земля опущена на -FOUNDATION_H. Вид плану зміщений на стільки ж
// вниз, щоб виглядати відносно газону так само, як і раніше.
export const FOUNDATION_H = 0.1

// Кольори зон на плані (пастельні, добре розрізняються).
// Самі планування — у config/layouts.ts.
export const ROOM_COLORS: Record<RoomType, string> = {
  livingKitchen: '#f2c23e', // амбер
  living: '#f2c23e',
  kitchen: '#ee8534', // помаранчевий
  hall: '#a9855f', // коричневий
  corridor: '#ded0a6', // беж
  bedroom: '#8fc8f0', // світло-блакитна спальня
  master: '#2f6fb8', // темно-синій майстер (контраст зі спальнею)
  bathroom: '#37c0a8', // бірюзовий санвузол
  office: '#8e6fd0', // синьо-фіолетовий кабінет
  wardrobe: '#e58aad', // тепло-рожева гардеробна (денна)
  closet: '#b06fbf', // пурпурово-рожевий гардероб (майстер)
  pantry: '#9fce5f', // зелена комора
  stairs: '#7d766a',
  terrace: '#d8c39a',
  storage: '#c9a9bd',
}
