import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'

// ============================================================
// Курсор -> точка на горизонтальній площині заданої висоти.
//
// Так ловлять рух ВСІ редактори зон (план, дах, тераса). Невидимий меш-«ловець»
// для цього не годиться, і саме він давав «дьоргання»: ручка або сусідня зона
// стоять ВИЩЕ за ловець, перехоплюють промінь — і поки курсор над ними, ловець
// подій не отримує. Зона завмирає, а тоді стрибком наздоганяє курсор.
//
// Математична площина не має ані геометрії, ані порядку перекриття, тож ловити
// нічого й не треба.
// ============================================================

const ray = new Raycaster()
const ndc = new Vector2()
const plane = new Plane(new Vector3(0, 1, 0), 0)
const hit = new Vector3()

export function planePoint(
  e: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: Camera,
  y: number,
): Vector3 | null {
  const r = canvas.getBoundingClientRect()
  if (!r.width || !r.height) return null
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
  ray.setFromCamera(ndc, camera)
  plane.constant = -y
  return ray.ray.intersectPlane(plane, hit)
}
