// Доменні типи всього застосунку. Інші файли імпортують типи звідси.

export type ConstructionType = 'frame' | 'modular' | 'brick'
export type HouseShape = 'rect' | 'square' | 'l-shape'

// null = «ще не обрано» або «скинуто, бо змінився попередній крок»
export interface HouseConfig {
  budget: number
  constructionType: ConstructionType | null
  shape: HouseShape | null
  // майбутні кроки додають поля сюди
}

export type ConfigKey = keyof HouseConfig
export type ConfigValue = HouseConfig[ConfigKey]

// «Крило» — прямокутний блок будинку. Будь-яка форма розкладається на крила,
// тому 3D-модулям байдуже, скільки їх і яка форма загалом.
export interface Wing {
  x: number
  z: number
  width: number
  depth: number
  wallHeight: number
}
