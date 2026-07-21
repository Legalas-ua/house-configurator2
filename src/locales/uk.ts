// Усі тексти інтерфейсу — тільки тут.
// Додаєш нову опцію чи крок → додаєш рядок сюди.
export const uk = {
  app: {
    title: 'Конфігуратор будинку',
    subtitle: 'Зберіть свій будинок крок за кроком',
  },
  landing: {
    title: 'Спроєктуйте свій будинок',
    tagline:
      'Оберіть бюджет і форму — і одразу побачите свій майбутній будинок у 3D з орієнтовною вартістю. Це займе близько двох хвилин.',
    start: 'Почати',
  },
  nav: {
    back: 'Назад',
    next: 'Далі',
  },
  steps: {
    budget: {
      title: 'Бюджет',
      hint: 'Оберіть орієнтовний бюджет будівництва',
    },
    constructionType: {
      title: 'Тип конструкції',
      hint: 'Технологія, за якою будуватимемо',
      options: {
        frame: 'Каркасний',
        modular: 'Модульний',
        brick: 'Цегляний (моноліт)',
      },
    },
    shape: {
      title: 'Форма будинку',
      hint: 'Обриси будинку, вид зверху',
      options: {
        rect: 'Прямокутний',
        square: 'Квадратний',
        'l-shape': 'Г-подібний',
      },
    },
    rooms: {
      title: 'Кімнати',
      hint: 'Додавайте кімнати — вони прибудовуються на плані у правильному місці',
      bedrooms: 'Спальні',
      bathrooms: 'Санвузли',
      kitchen: {
        title: 'Кухня',
        options: {
          open: 'Кухня-вітальня',
          separate: 'Окрема кухня',
        },
      },
      extras: {
        title: 'Додатково',
        options: {
          office: 'Кабінет',
          wardrobe: 'Гардеробна',
          pantry: 'Комора',
        },
      },
    },
  },
  floors: {
    title: 'Поверхи',
    options: { 1: '1 поверх', 2: '2 поверхи' },
  },
  plan: {
    legendTitle: 'Приміщення',
    total: 'Загальна площа',
    floorTab: (n: number) => `${n}-й поверх`,
    roomNames: {
      livingKitchen: 'Кухня-вітальня',
      living: 'Вітальня',
      kitchen: 'Кухня',
      hall: 'Прихожа',
      corridor: 'Коридор',
      bedroom: 'Спальня',
      bathroom: 'Санвузол',
      office: 'Кабінет',
      wardrobe: 'Гардеробна',
      pantry: 'Комора',
      stairs: 'Сходи',
      terrace: 'Тераса',
    },
  },
  viewport: {
    topView: 'Вид зверху',
  },
} as const
