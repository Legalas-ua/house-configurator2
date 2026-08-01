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

// Волокно термодерева.
//
// Малюємо ПОПІКСЕЛЬНО за моделлю річних кілець: беремо викривлене поле
// відстані до умовної серцевини колоди і робимо з нього смуги. Саме викривлення
// (низькочастотний шум уздовж дошки) і дає деревині її «пливучий» рисунок —
// рівні смуги, намальовані прямокутниками, завжди читаються як штрихкод.
//
// Координати всередині: l — уздовж планки, a — упоперек.
function drawWood(ctx: CanvasRenderingContext2D, W: number, H: number, vertical: boolean) {
  const L = vertical ? H : W
  const A = vertical ? W : H
  const img = ctx.createImageData(W, H)
  const d = img.data

  // Гладкий шум: інтерполяція між псевдовипадковими вузлами.
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t * t * (3 - 2 * t)
  const smooth = (x: number, seed: number) => {
    const i = Math.floor(x)
    return lerp(noise(i * 1.7 + seed), noise((i + 1) * 1.7 + seed), x - i)
  }
  // Сучки: кілька центрів, біля яких кільця стискаються й темніють.
  const knots = [0.17, 0.52, 0.86].map((p, i) => ({
    l: p * L,
    a: (0.2 + noise(i * 11.3) * 0.6) * A,
    r: (0.05 + noise(i * 5.1) * 0.05) * L,
  }))

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = vertical ? y : x
      const a = vertical ? x : y
      const lp = l / L
      const ap = a / A

      // Поле «відстані до серцевини»: поперечна координата, зсунута
      // повільною хвилею вздовж дошки. Дві частоти — щоб не було періодики.
      let f = ap * 9 + smooth(lp * 3.5, 0) * 1.6 + smooth(lp * 11, 7) * 0.45

      // Біля сучка кільця стискаються й вигинаються навколо нього.
      let knot = 0
      for (const k of knots) {
        const dl = (l - k.l) / k.r
        const da = (a - k.a) / (k.r * 0.55)
        const dist = Math.hypot(dl, da)
        if (dist < 3) {
          f += (3 - dist) * 1.1
          knot = Math.max(knot, Math.max(0, 1 - dist / 1.1))
        }
      }

      // Кільце: різкий темний край, м'який світлий центр — так виглядає
      // межа ранньої та пізньої деревини.
      const ring = f - Math.floor(f)
      let v = 0.9 + 0.1 * Math.cos(ring * Math.PI * 2)
      v -= 0.16 * Math.pow(Math.max(0, 1 - Math.abs(ring - 0.5) * 3.2), 2)

      // Дрібне волокно вздовж дошки — короткі штрихи, а не рівномірний шум.
      v += (noise(Math.floor(l * 0.7) * 31 + Math.floor(a) * 7) - 0.5) * 0.05
      // Тіло сучка — виразно темніше.
      v -= knot * 0.42
      // Легке потемніння до країв планки: дошка не пласка.
      const edge = Math.min(ap, 1 - ap)
      if (edge < 0.16) v -= (0.16 - edge) * 0.9

      const c = Math.round(Math.max(0, Math.min(1, v)) * 255)
      const o = (y * W + x) * 4
      d[o] = c
      d[o + 1] = c
      d[o + 2] = c
      d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
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

  if (s.kind === 'thermowood') {
    drawWood(ctx, W, H, s.plankDir === 'vertical')
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
