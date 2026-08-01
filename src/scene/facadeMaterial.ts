import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three'
import type { FacadeKind, FacadeSpec } from '../config/types'

// ============================================================
// Матеріал фасаду: процедурна текстура + СВІТОВІ координати.
//
// Дві речі, які тут важливі:
//
// 1. Малюнок ЧОРНО-БІЛИЙ (світлота біля одиниці), а колір задає `material.color`
//    і множиться на нього. Тому зміна кольору не перемальовує полотно — а
//    повзунок кольору сипле подіями десятками за секунду.
//
// 2. UV рахуються з КООРДИНАТ У СВІТІ, а не з UV коробки. Стіни зібрані з
//    десятків boxGeometry різного розміру, і в кожної UV — свої 0..1: з
//    звичайним `map.repeat` цегла на вузькому простінку була б завбільшки як на
//    півстіни. Світова проєкція дає один масштаб скрізь, без клонування текстур
//    під кожну коробку.
// ============================================================

const PX = 256 // ширина полотна; висота — за пропорцією «кахля»

// Скільки МЕТРІВ фасаду вкриває один кахель текстури (u, v).
export function facadeTile(s: FacadeSpec): [number, number] {
  if (s.kind === 'clinker') return [BRICK_L + JOINT, 2 * (BRICK_H + JOINT)] // перев'язка через 2 ряди
  if (s.kind === 'thermowood') {
    const pitch = Math.max(0.02, s.plankWidth + s.plankGap)
    return s.plankDir === 'horizontal' ? [1, pitch] : [pitch, 1]
  }
  if (s.kind === 'panels') {
    const w = Math.max(0.1, s.panelWidth)
    return [w, s.panelShape === 'square' ? w : Math.max(0.1, s.panelHeight)]
  }
  return [1, 1] // штукатурка — дрібне зерно, розмір довільний
}

// ---- Клінкер ----
const BRICK_L = 0.25
const BRICK_H = 0.065
const JOINT = 0.012

const ROUGH: Record<FacadeKind, number> = {
  clinker: 0.85,
  plaster: 0.95,
  thermowood: 0.7,
  panels: 0.5,
}

// Детермінований «шум»: та сама цеглина завжди того самого відтінку, інакше
// текстура мерехтіла б на кожній перемальовці.
const noise = (i: number) => {
  const v = Math.sin(i * 12.9898) * 43758.5453
  return v - Math.floor(v)
}
const grey = (v: number) => {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
  return `rgb(${c},${c},${c})`
}

function drawFacade(s: FacadeSpec): HTMLCanvasElement {
  const [tu, tv] = facadeTile(s)
  const canvas = document.createElement('canvas')
  canvas.width = PX
  canvas.height = Math.max(8, Math.round((PX * tv) / tu))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const W = canvas.width
  const H = canvas.height
  const sx = W / tu // пікселів на метр по горизонталі
  const sy = H / tv

  if (s.kind === 'plaster') {
    ctx.fillStyle = grey(1)
    ctx.fillRect(0, 0, W, H)
    // Зерно штукатурки: дрібні крапки трохи темніші й трохи світліші за основу.
    for (let i = 0; i < W * H * 0.35; i++) {
      const n = noise(i)
      ctx.fillStyle = grey(0.93 + n * 0.14)
      ctx.fillRect(noise(i * 3.1) * W, noise(i * 7.7) * H, 1, 1)
    }
    return canvas
  }

  if (s.kind === 'clinker') {
    ctx.fillStyle = grey(0.72) // шов
    ctx.fillRect(0, 0, W, H)
    const bh = BRICK_H * sy
    const bl = BRICK_L * sx
    const j = JOINT * sx
    for (let row = 0; row < 2; row++) {
      const y = row * (BRICK_H + JOINT) * sy
      // Перев'язка: кожен другий ряд зсунуто на пів цеглини.
      const off = row % 2 === 0 ? 0 : -bl / 2
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = grey(0.93 + noise(row * 17 + k * 5) * 0.14)
        ctx.fillRect(off + k * (bl + j), y, bl, bh)
      }
    }
    return canvas
  }

  if (s.kind === 'thermowood') {
    const vertical = s.plankDir === 'vertical'
    // Кахель — рівно ОДИН крок «планка + зазор», тож малюємо поперек кахля.
    const acrossScale = vertical ? sx : sy
    const plank = Math.max(1, Math.round(s.plankWidth * acrossScale))
    // Глибша планка = темніша тінь у шві: товщина працює саме так.
    const shade = 0.42 - Math.min(0.2, s.plankThickness * 4)
    ctx.fillStyle = grey(shade)
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = grey(1)
    if (vertical) ctx.fillRect(0, 0, plank, H)
    else ctx.fillRect(0, 0, W, plank)
    // Волокно: тонкі смуги ВЗДОВЖ планки.
    const along = vertical ? H : W
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = grey(0.9 + noise(i * 2.3) * 0.12)
      const p = noise(i * 5.9) * plank
      const len = (0.25 + noise(i * 1.7) * 0.6) * along
      const at = noise(i * 9.1) * along
      if (vertical) ctx.fillRect(p, at, 1, len)
      else ctx.fillRect(at, p, len, 1)
    }
    // Край планки з боку зазору — світліша фаска, щоб шов читався об'ємно.
    ctx.fillStyle = grey(0.72)
    if (vertical) ctx.fillRect(plank - 1, 0, 1, H)
    else ctx.fillRect(0, plank - 1, W, 1)
    return canvas
  }

  // Навісні панелі: полотно панелі + шов по двох гранях кахля.
  ctx.fillStyle = grey(0.55) // шов
  ctx.fillRect(0, 0, W, H)
  const gap = Math.max(1, Math.round(0.008 * sx))
  ctx.fillStyle = grey(1)
  ctx.fillRect(gap, gap, W - gap, H - gap)
  // Легкий градієнт упоперек панелі — метал/фіброцемент так і виглядають.
  for (let i = 0; i < H; i++) {
    ctx.fillStyle = grey(0.97 + 0.05 * Math.sin((i / Math.max(H, 1)) * Math.PI))
    ctx.fillRect(gap, i, W - gap, 1)
  }
  ctx.fillStyle = grey(0.55)
  ctx.fillRect(0, 0, gap, H)
  ctx.fillRect(0, 0, W, gap)
  return canvas
}

// Ключ, від якого залежить САМ МАЛЮНОК. Колір сюди навмисно не входить.
const patternKey = (s: FacadeSpec) =>
  [s.kind, s.plankWidth, s.plankThickness, s.plankGap, s.plankDir, s.panelShape, s.panelWidth, s.panelHeight].join('|')

function makeFacadeMaterial(spec: FacadeSpec): MeshStandardMaterial {
  const [tu, tv] = facadeTile(spec)
  const map = new CanvasTexture(drawFacade(spec))
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 4
  const mat = new MeshStandardMaterial({
    color: spec.color,
    map,
    roughness: ROUGH[spec.kind],
    metalness: spec.kind === 'panels' ? 0.12 : 0,
  })
  const uTile = { value: new Vector2(tu, tv) }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = uTile
    // `objectNormal` і `transformed` оголошені раніше в main(), а <fog_vertex>
    // стоїть у самому кінці — тож наше присвоєння vMapUv перебиває штатне.
    shader.vertexShader = `uniform vec2 uTile;\n${shader.vertexShader}`.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
	vec4 fWorld = modelMatrix * vec4( transformed, 1.0 );
	vec3 fN = abs( normalize( mat3( modelMatrix ) * objectNormal ) );
	vec2 fUv = fN.y > 0.7 ? fWorld.xz : ( fN.x > fN.z ? fWorld.zy : fWorld.xy );
	vMapUv = fUv / uTile;`,
    )
  }
  // Без свого ключа three склеїв би нашу програму зі звичайним standard-
  // матеріалом такої ж конфігурації — і світова проєкція зникла б.
  mat.customProgramCacheKey = () => 'facade-world-uv'
  return mat
}

// Матеріал живе стільки, скільки незмінний малюнок. Колір і шорсткість
// правимо на місці — перекомпілювати шейдер заради відтінку немає сенсу.
export function useFacadeMaterial(spec: FacadeSpec): MeshStandardMaterial {
  const key = patternKey(spec)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mat = useMemo(() => makeFacadeMaterial(spec), [key])
  useEffect(
    () => () => {
      mat.map?.dispose()
      mat.dispose()
    },
    [mat],
  )
  mat.color.set(spec.color)
  mat.roughness = ROUGH[spec.kind]
  return mat
}
