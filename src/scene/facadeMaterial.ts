import { useEffect, useMemo } from 'react'
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, Vector2 } from 'three'
import type { FacadeSpec } from '../config/types'
import type { FacadeKind } from '../config/types'

// ============================================================
// Матеріал фасаду: процедурна текстура ПОВЕРХНІ + світові координати.
//
// Шви й розкладку більше не малюємо: від етапу об'ємного оздоблення кожна
// цеглина, планка й панель — окрема геометрія завтовшки 20 мм, а темний шов
// між ними дає базова стіна кольору антрациту, що видно у проміжок. Тут
// лишилась тільки ФАКТУРА самого матеріалу.
//
// Дві речі, які тут важливі:
//
// 1. Малюнок ЧОРНО-БІЛИЙ (світлота біля одиниці), а колір задає
//    `material.color` і множиться на нього. Тому зміна кольору не перемальовує
//    полотно — а повзунок кольору сипле подіями десятками за секунду.
//
// 2. UV рахуються з КООРДИНАТ У СВІТІ, а не з UV коробки. Кожна цеглина — свій
//    boxGeometry з власними 0..1: зі звичайним `map.repeat` фактура на цеглині
//    була б розтягнута на всю цеглину. Світова проєкція дає один масштаб
//    скрізь — і на стіні, і на окремому елементі.
// ============================================================

const PX = 256 // базова сторона полотна
const MIN_PX = 128 // найменша сторона: тонкий кахель не має вироджуватись

// Скільки МЕТРІВ фасаду вкриває один кахель текстури (u, v).
export function facadeTile(s: FacadeSpec): [number, number] {
  if (s.kind === 'clinker') return [0.5, 0.5] // дрібне зерно глини
  if (s.kind === 'thermowood') {
    // Волокно тягнеться ВЗДОВЖ планки; поперек — рівно ширина планки, щоб
    // сусідні дошки не виходили однаковими.
    const across = Math.max(0.05, s.plankWidth)
    return s.plankDir === 'horizontal' ? [1.7, across] : [across, 1.7]
  }
  if (s.kind === 'panels') return [1, 1] // рівна поверхня, ледь помітне зерно
  return [1, 1] // штукатурка
}

const ROUGH: Record<FacadeKind, number> = {
  clinker: 0.88,
  plaster: 0.95,
  thermowood: 0.72,
  panels: 0.45,
}

// Детермінований «шум»: та сама точка завжди того самого відтінку, інакше
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
  // Полотно за пропорцією кахля, але КОРОТКА сторона не менша за MIN_PX:
  // у планки 140 мм на 1,7 м пропорція дає 21 піксель упоперек — на такій
  // висоті жоден рисунок деревини не проглядається.
  const ar = tv / tu
  let w = PX
  let h = Math.round(PX * ar)
  if (h < MIN_PX) {
    h = MIN_PX
    w = Math.round(MIN_PX / ar)
  } else if (w < MIN_PX) {
    w = MIN_PX
    h = Math.round(MIN_PX * ar)
  }
  canvas.width = Math.max(8, Math.min(2048, w))
  canvas.height = Math.max(8, Math.min(2048, h))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  const W = canvas.width
  const H = canvas.height

  // Термодерево — ПОКИ ЩО суцільний колір. Процедурне волокно виглядало
  // несправжнім; сюди стане нормальна PBR-текстура, коли замовник її дасть.
  // Масштаб для неї вже готовий: facadeTile() задає метри на кахель, тож
  // планка 140 мм отримає рівно свій шматок.
  if (s.kind === 'thermowood') {
    ctx.fillStyle = grey(1)
    ctx.fillRect(0, 0, W, H)
    return canvas
  }

  if (s.kind === 'clinker') {
    // Обпалена глина: нерівний тон + дрібні вкраплення.
    ctx.fillStyle = grey(1)
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < W * H * 0.5; i++) {
      ctx.fillStyle = grey(0.84 + noise(i) * 0.2)
      ctx.fillRect(noise(i * 3.1) * W, noise(i * 7.7) * H, 1, 1)
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = grey(0.7 + noise(i * 4.4) * 0.18)
      ctx.beginPath()
      ctx.arc(noise(i * 2.2) * W, noise(i * 6.6) * H, 1 + noise(i * 8.8) * 2, 0, Math.PI * 2)
      ctx.fill()
    }
    return canvas
  }

  if (s.kind === 'plaster') {
    ctx.fillStyle = grey(1)
    ctx.fillRect(0, 0, W, H)
    // Зерно штукатурки: дрібні крапки трохи темніші й трохи світліші за основу.
    for (let i = 0; i < W * H * 0.35; i++) {
      ctx.fillStyle = grey(0.93 + noise(i) * 0.14)
      ctx.fillRect(noise(i * 3.1) * W, noise(i * 7.7) * H, 1, 1)
    }
    return canvas
  }

  // Навісні панелі: рівна поверхня з ледь помітною поперечною хвилею.
  ctx.fillStyle = grey(1)
  ctx.fillRect(0, 0, W, H)
  for (let i = 0; i < H; i++) {
    ctx.fillStyle = grey(0.965 + 0.035 * Math.sin((i / Math.max(H, 1)) * Math.PI * 2))
    ctx.fillRect(0, i, W, 1)
  }
  return canvas
}

// Ключ, від якого залежить САМ МАЛЮНОК. Колір сюди навмисно не входить.
const patternKey = (s: FacadeSpec) =>
  [s.kind, s.plankWidth, s.plankGap, s.plankDir, s.panelShape, s.panelWidth, s.panelHeight].join('|')

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
    metalness: spec.kind === 'panels' ? 0.15 : 0,
  })
  const uTile = { value: new Vector2(tu, tv) }
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTile = uTile
    // `objectNormal` і `transformed` оголошені раніше в main(), а <fog_vertex>
    // стоїть у самому кінці — тож наше присвоєння vMapUv перебиває штатне.
    // instanceMatrix додаємо самі: у `transformed` його ще немає (three
    // множить на нього вже в <project_vertex>).
    shader.vertexShader = `uniform vec2 uTile;\n${shader.vertexShader}`.replace(
      '#include <fog_vertex>',
      `#include <fog_vertex>
	vec4 fLocal = vec4( transformed, 1.0 );
	vec3 fNrm = objectNormal;
	#ifdef USE_INSTANCING
		fLocal = instanceMatrix * fLocal;
		fNrm = mat3( instanceMatrix ) * fNrm;
	#endif
	vec4 fWorld = modelMatrix * fLocal;
	vec3 fN = abs( normalize( mat3( modelMatrix ) * fNrm ) );
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
