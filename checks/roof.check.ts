// ============================================================
// ЧИСЛОВА ПЕРЕВІРКА ДАХУ
//
// Дах перевіряють числом, а не оком: три сесії поспіль баги ловились саме
// вимірюванням. Запуск: `npm run check`.
//
// Що міряємо на кожній формі будинку й кожному типі даху:
//   ДІРА    — точка під дахом, яку не накрив жоден схил (недоріз);
//   ДУБЛЬ   — точку накрили два схили однієї зони (розшарування покриття);
//   ВИЛІТ   — схил лежить там, де зону вже підрізав сусідній дах (артефакт);
//   ЧУЖИЙ   — точку накрили схили ДВОХ різних зон одразу (врізка не спрацювала);
//   ПОВІТРЯ — елемент покриття висить там, де даху немає;
//   КОЖУХ   — планка чи кожух відлетіли від даху далі, ніж дозволяє звіс.
//
// Поріг падіння — у THRESHOLDS. Зростання будь-якого числа = регрес.
// ============================================================

import { DEFAULT_CONFIG } from '../src/config/steps'
import type { HouseConfig, HousePlan, PlanRect } from '../src/config/types'
import { generateHousePlan } from '../src/lib/floorplan'
import {
  generateRoof,
  partRects,
  slopeBox,
  zoneRects,
  zoneSkeleton,
  normalizeRoof,
  rectsBox,
  ridgeHeight,
  DEFAULTS,
  type RoofKind,
  type RoofPart,
} from '../src/lib/roof'
import { faceSpan, type SkelFace } from '../src/lib/roofSkeleton'
import { roofSkin } from '../src/lib/roofSkin'
import { DEFAULT_ROOF_MAT } from '../src/config/roofMaterial'

const STEP = 0.1 // крок сітки вимірювання, м
const FLOOR_H = 3.2 // як у HouseShell

// ---- Геометрія вимірювання ----

// Точка (x,z) у координатах схилу `f`: u — уздовж грані, t — углиб від неї.
function faceUV(f: SkelFace, x: number, z: number): [number, number] {
  const e = f.edge
  const [u, v] = e.horizontal ? [x, z] : [z, x]
  return [u, (e.line - v) * e.n]
}

// Чи накриває цей схил точку (x,z). `slack` — наскільки дозволено вийти за
// край схилу: від'ємний вимагає бути ВСЕРЕДИНІ із запасом, додатний прощає
// звіс матеріалу за карниз.
function faceCovers(f: SkelFace, x: number, z: number, slack = -1e-3): boolean {
  const [u, t] = faceUV(f, x, z)
  const s = f.steps
  if (t < s[0].t - slack || t > s[s.length - 1].t + slack) return false
  const [lo, hi] = faceSpan(f, t)
  return u > lo - slack && u < hi + slack
}

function boxesOf(plan: HousePlan, parts: RoofPart[], part: RoofPart) {
  const above = plan.floors[part.level + 1]?.slab ?? []
  const sibs = zoneRects(parts, part)
  return partRects(part).map((r) => slopeBox(part, above, r, sibs))
}

const inBoxes = (bs: { x0: number; x1: number; z0: number; z1: number }[], x: number, z: number, pad = 0) =>
  bs.some((b) => x > b.x0 - pad + 1e-4 && x < b.x1 + pad - 1e-4 && z > b.z0 - pad + 1e-4 && z < b.z1 + pad - 1e-4)

// Покрівля НАВМИСНО звішується за карниз (звіс матеріалу, крапельник), тож
// «у повітрі» рахуємо лише те, що відійшло від живого даху далі за це.
const EAVE_SLACK = 0.35
// Планка карниза стоїть іще далі за матеріал — але теж не в порожнечі.
const TRIM_SLACK = 0.6
// Межа схилу: точка рівно на ребрі належить обом сусіднім схилам.
const EDGE_TOL = 0.002
// «Глибоко всередині» — щоб накладання рахувалось лише справжнє, з площею.
const DEEP_TOL = 0.02

// ---- Заміри ----

export interface Report {
  name: string
  samples: number
  holes: number // % площі під дахом без жодного схилу
  doubles: number // % накритої двічі своїми ж схилами
  spill: number // % схилу там, де зону підрізано сусідом
  foreign: number // % накритої схилами двох різних зон
  airborne: number // % елементів покриття, що висять у повітрі
  trimAir: number // % планок і кожухів, що відлетіли від даху
  elements: number
  trims: number
}

function measure(name: string, plan: HousePlan, parts: RoofPart[]): Report {
  const pitched = parts.filter((p) => p.kind !== 'flat')
  let samples = 0
  let holes = 0
  let doubles = 0
  let spill = 0
  let foreign = 0

  // Скелети рахуємо раз: вони кешовані, але виклик усе одно недешевий.
  const sk = new Map<string, ReturnType<typeof zoneSkeleton>>()
  const box = new Map<string, ReturnType<typeof boxesOf>>()
  for (const p of pitched) {
    sk.set(p.id, zoneSkeleton(plan, parts, p))
    box.set(p.id, boxesOf(plan, parts, p))
  }

  for (const p of pitched) {
    const bs = box.get(p.id)!
    const faces = sk.get(p.id)!.faces
    const hidden = sk.get(p.id)!.hidden
    const x0 = Math.min(...bs.map((b) => b.x0))
    const x1 = Math.max(...bs.map((b) => b.x1))
    const z0 = Math.min(...bs.map((b) => b.z0))
    const z1 = Math.max(...bs.map((b) => b.z1))
    // Сітка ГЛОБАЛЬНА (прив'язана до координат світу, а не до габариту зони):
    // інакше кожна зона міряється у своїх точках, і те, що для однієї «виліт»,
    // друга просто не помічає.
    for (let x = Math.ceil(x0 / STEP) * STEP; x < x1; x += STEP) {
      for (let z = Math.ceil(z0 / STEP) * STEP; z < z1; z += STEP) {
        if (!inBoxes(bs, x, z)) continue
        // ДІРА рахується великодушно: точка рівно на межі двох схилів (ребро
        // вальми, гребінь) належить обом, і вимагати «строго всередині» — це
        // міряти власну сітку, а не дах.
        const mine = faces.filter((f) => faceCovers(f, x, z, EDGE_TOL)).length
        // ДУБЛЬ — навпаки, строго: справжнє накладання завжди має площу.
        const deep = faces.filter((f) => faceCovers(f, x, z, -DEEP_TOL)).length
        const cut = hidden(x, z)
        if (cut) {
          samples++
          if (deep > 0) spill++
          continue
        }
        samples++
        if (mine === 0) holes++
        else if (deep > 1) doubles++
        // Чужа зона того ж рівня накрила ту саму точку.
        const others = pitched.filter(
          (o) =>
            o.id !== p.id &&
            o.level === p.level &&
            inBoxes(box.get(o.id)!, x, z) &&
            // Чужа зона має бути тут ЖИВОЮ. Якщо вона підрізана, а грань усе
            // одно лежить — це виліт, і його ловить своя метрика.
            !sk.get(o.id)!.hidden(x, z) &&
            sk.get(o.id)!.faces.some((f) => faceCovers(f, x, z, -DEEP_TOL)),
        )
        if (deep > 0 && others.length > 0) foreign++
      }
    }
  }

  // Покриття: чи не висить воно в повітрі.
  let elements = 0
  let airborne = 0
  let trims = 0
  let trimAir = 0
  const groups = roofSkin(plan, parts, DEFAULT_ROOF_MAT, DEFAULT_ROOF_MAT, {}, FLOOR_H)
  const live = (x: number, z: number, slack: number) =>
    pitched.some(
      (p) =>
        inBoxes(box.get(p.id)!, x, z, slack) &&
        !sk.get(p.id)!.hidden(x, z) &&
        sk.get(p.id)!.faces.some((f) => faceCovers(f, x, z, slack)),
    )
  for (const g of groups) {
    // Планки й кожухи НАВМИСНО виходять за край даху — але не на пів метра.
    if (g.trim) {
      for (const b of g.boxes) {
        trims++
        if (parts.some((p) => p.kind === 'flat')) continue
        if (!live(b.x, b.z, TRIM_SLACK)) trimAir++
      }
      continue
    }
    for (const b of g.boxes) {
      elements++
      if (parts.some((p) => p.kind === 'flat')) continue // плоский лежить по контуру
      // Під елементом має бути ЖИВА поверхня даху: усередині габариту зони,
      // не підрізана сусідом і справді накрита схилом. Питати треба всі зони —
      // габарити сусідів накладаються, і «власника» за координатою не вгадати.
      if (!live(b.x, b.z, EAVE_SLACK)) airborne++
    }
  }

  const pct = (n: number) => (samples ? (n * 100) / samples : 0)
  return {
    name,
    samples,
    holes: pct(holes),
    doubles: pct(doubles),
    spill: pct(spill),
    foreign: pct(foreign),
    elements,
    airborne: elements ? (airborne * 100) / elements : 0,
    trims,
    trimAir: trims ? (trimAir * 100) / trims : 0,
  }
}

// ---- Сценарії ----

const planOf = (cfg: Partial<HouseConfig>): HousePlan =>
  generateHousePlan({ ...DEFAULT_CONFIG, shape: 'rect', ...cfg } as HouseConfig)

const SHAPES: { name: string; cfg: Partial<HouseConfig> }[] = [
  { name: 'прямокутник 1пов', cfg: { shape: 'rect', floors: 1, bedrooms: 2 } },
  { name: 'квадрат 1пов', cfg: { shape: 'square', floors: 1, bedrooms: 2 } },
  { name: 'Г-подібний 1пов', cfg: { shape: 'l-shape', floors: 1, bedrooms: 3 } },
  { name: 'Г-подібний 2пов', cfg: { shape: 'l-shape', floors: 2, bedrooms: 3, bedrooms2: 2 } },
]

const KINDS: RoofKind[] = ['gable', 'hip', 'mono']

function scenarios(): { name: string; plan: HousePlan; parts: RoofPart[] }[] {
  const out: { name: string; plan: HousePlan; parts: RoofPart[] }[] = []
  for (const s of SHAPES) {
    const plan = planOf(s.cfg)
    for (const kind of KINDS) {
      const parts = generateRoof(plan, kind)
      if (parts.length) out.push({ name: `${s.name} · ${kind}`, plan, parts })
      // ВРІЗКА: та сама розкладка, але сусідні зони різної висоти — нижча
      // мусить врізатись у вищу. Різні кути дають різні коники.
      if (parts.filter((p) => p.level === parts[0].level).length > 1) {
        const mixed = parts.map((p, i) => normalizeRoof({ ...p, pitch: i % 2 ? 20 : 45 }))
        out.push({ name: `${s.name} · ${kind} · врізка`, plan, parts: mixed })
      }
    }
    // Дах з крила іншого типу: скатне головне + односхиле крило.
    const base = generateRoof(plan, 'gable')
    if (base.length > 1) {
      const mix = base.map((p, i) => (i ? normalizeRoof({ ...p, kind: 'mono', pitch: 15 }) : p))
      out.push({ name: `${s.name} · двосхилий + односхиле крило`, plan, parts: mix })
    }
    // ХРЕСТ: дві зони, що НАКЛАДАЮТЬСЯ, а не просто торкаються. Саме так їх
    // малює клієнт вручну — і саме тут дахи проходили один крізь одного.
    const lvl = base[0]?.level ?? 0
    const bb = rectsBox(generateRoof(plan, 'flat').filter((p) => p.level === lvl).flatMap(partRects))
    if (bb.width > 4 && bb.depth > 4) {
      for (const [nm, pitchB] of [['рівні коники', 35] as const, ['крило нижче', 20] as const]) {
        const A = normalizeRoof({
          id: 'x-main', level: lvl, kind: 'gable', ...DEFAULTS, pitch: 35, rotation: 0,
          x: bb.x, z: bb.z, width: bb.width, depth: Math.max(3, bb.depth / 2),
        })
        const B = normalizeRoof({
          id: 'x-wing', level: lvl, kind: 'gable', ...DEFAULTS, pitch: pitchB, rotation: 90,
          x: bb.x, z: bb.z, width: Math.max(3, bb.width / 2), depth: bb.depth,
        })
        out.push({ name: `${s.name} · ХРЕСТ (${nm})`, plan, parts: [A, B] })
      }
    }
  }
  return out
}

// Пороги: більше — регрес. Числа зафіксовані за фактом на момент правки.
const THRESHOLDS = { holes: 0.4, doubles: 0.1, spill: 0.1, foreign: 0.1, airborne: 0.3, trimAir: 1 }

function main() {
  const rows = scenarios().map((s) => measure(s.name, s.plan, s.parts))
  const w = Math.max(...rows.map((r) => r.name.length))
  const f = (v: number) => v.toFixed(2).padStart(6)
  console.log('сценарій'.padEnd(w), '  діра   дубль   виліт   чужий повітря  кожух  елем.')
  let bad = 0
  for (const r of rows) {
    const flags: string[] = []
    if (r.holes > THRESHOLDS.holes) flags.push('ДІРА')
    if (r.doubles > THRESHOLDS.doubles) flags.push('ДУБЛЬ')
    if (r.spill > THRESHOLDS.spill) flags.push('ВИЛІТ')
    if (r.foreign > THRESHOLDS.foreign) flags.push('ЧУЖИЙ')
    if (r.airborne > THRESHOLDS.airborne) flags.push('ПОВІТРЯ')
    if (r.trimAir > THRESHOLDS.trimAir) flags.push('КОЖУХ')
    if (flags.length) bad++
    console.log(
      r.name.padEnd(w),
      f(r.holes),
      f(r.doubles),
      f(r.spill),
      f(r.foreign),
      f(r.airborne),
      f(r.trimAir),
      String(r.elements).padStart(6),
      flags.join(' '),
    )
  }
  console.log(`\n${rows.length} сценаріїв, ${bad} за порогом`)
  if (bad) process.exitCode = 1
}

main()
