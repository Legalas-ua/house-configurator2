# КАРТА · де що лежить

Полиця = **етап майстра → елемент будинку**. Знайшов полицю — маєш точні файли
й рядки, і не треба перечитувати `src`.

- **Тут — ДЕ.** Правила, граблі й «чому так» — у пам'яті (`project-roof-architecture`,
  `project-manual-editing-roadmap`, `project-plan-animation-rules`, `project-facade-step`).
- **Якорі виду `:1662`** — рядок на момент HEAD `a65b85dc`. Якщо зсунулось — шукай
  по імені (`grep -n "const walls = useMemo"`), а потім поправ цифру тут.
- Порядок стовпчиків усюди однаковий: **дані → логіка → 3D → панель → стор → тексти**.

## Легенда шарів

| Шар | Папка | Що можна |
|---|---|---|
| дані | `src/config/` | тільки числа, списки, типи |
| логіка | `src/lib/` | чисті функції, без React і Three |
| 3D | `src/scene/` | усе всередині `<Canvas>` |
| панель | `src/components/` | DOM-інтерфейс |
| стан | `src/state/store.ts` | zustand |
| тексти | `src/locales/uk.ts` | жодного тексту в компонентах |

## «Мені треба…» → полиця

| Задача | Полиця |
|---|---|
| товщина/висота стіни, отвір не ріжеться | [0 · Стіна](#стіна-зовнішня) |
| вікно не рухається, розміри, двері у вікні | [4 · Вікно](#вікно), [4 · Вхідні двері](#двері-у-вікні-вхідні-склопакет) |
| дах не той формою, врізка, фронтон | [5–6 · Дах](#полиця-56--дах-кроки-5-6) |
| черепиця/фальц не так лягає | [8 · Матеріал даху](#полиця-8--матеріал-даху-крок-8) |
| цегла/штукатурка/планкен на стіні | [7 · Матеріал стін](#полиця-7--матеріал-стін-фасад-крок-7) |
| тераса, паркан, настил | [9](#полиця-9--тераса-і-паркан-крок-9), [10](#полиця-10--покриття-тераси-крок-10) |
| міжкімнатні двері, підлога в кімнаті | [11 · Інтер'єр](#полиця-11--інтерєр-крок-11) |
| кімната стрибає/зникає на плані | [3 · Зони плану](#зони-кімнат-на-плані-вид-зверху) |
| додати крок майстра | [∞ · Кроки](#кроки-майстра) |
| клавіші, Undo, копіювання | [∞ · Редактор](#редактор-клавіші-історія-буфер) |

---

## Полиця 0 · КАРКАС

Будується ЗАВЖДИ, не належить жодному кроку. Живе цілком у `scene/HouseShell.tsx`.

### Стіна зовнішня
- **логіка:** `lib/windows.ts` → **`WALL_T = 0.1`** (єдине джерело товщини на весь
  проєкт), `hasWallAt`; `lib/outline.ts` → `unionOutline` (контур поверху);
  `lib/wallFaces.ts` → стіна як ГРАНІ (одиниця вибору на «Фасаді»).
- **3D:** `HouseShell.tsx` — `wallOutline` :129 · `edgesOf` :141 · `wallBand` :158 ·
  **`cutOpenings` :193** (єдиний різник отворів) · `walls` useMemo :1662-1701 ·
  рендер :2048-2075 · перемички `Spandrel` :784.
- **числа:** :68-98 (`CEIL_H 3.0`, `PLATE_T 0.2`, `FLOOR_H`, яруси `TIER_STEP/TIER_LAP`,
  `wallT()`, `postT()`, кольори).
- ⚠️ Отвори ріже **лише** `cutOpenings`. Другий механізм (простінки по ребрах) прибрано — не повертати.

### Перегородка внутрішня
- **логіка:** `lib/innerWalls.ts` (перегородка = РІВНО перекриття з сусідом, по кожному сусідові окремо).
- **3D:** `partitions` useMemo :1702-1744 · рендер :2116-2121 · числа `PART_T` :115.
- ⚠️ Смуга «на всю сторону кімнати» лягала в зовнішню стіну і закривала отвори вікон. Не повертати.

### Перекриття і плита
- **3D:** `plateGeometry` :259 · `plates` useMemo :1745-1763 · рендер :2130-2137.
- ⚠️ Без `polygonOffset` — див. коментар на :2131.

### Цоколь і земля
- **дані:** `config/plan.ts` → `FOUNDATION_H`, `GROUND_HALF` (нуль сцени = ВЕРХ фундаменту).
- **3D:** `foundation` useMemo :1764-1777 · рендер :2041-2045 · `scene/Ground.tsx`.

### Поява/зростання геометрії
- **3D:** `RoofTier` :832 (рівень росте від СВОЄЇ площини) · `RISE_EASE`/`ROOF_EASE` :94-95 ·
  видимість по кроках :1382-1409.
- ⚠️ Позицією/масштабом володіє лише `useFrame`, не пропси — [[project-plan-animation-rules]].

---

## Полиця 1 · Бюджет (крок 1)
- **дані:** `config/pricing.ts` · **логіка:** `lib/price.ts` (`PriceSource`, ціна ПРИХОВАНА в UI)
- **панель:** `components/fields/BudgetSlider.tsx` · **стор:** `config.budget`

## Полиця 2 · Форма і поверховість (крок 2)
- **дані:** `config/shapes.ts` (габарити блоків, `WALL_HEIGHT`), `config/plan.ts`
- **логіка:** `lib/floorplan.ts` → `generateHousePlan` — диспетчер за `config.shape`
- **3D:** `scene/PlanView.tsx` (плита + контур)
- **панель:** `fields/OptionCards.tsx` + `fields/FloorsPicker.tsx` + `fields/optionIcons.tsx`
- **стор:** `config.shape`, `config.floors`, `viewFloor`, `hideFloor2`

## Полиця 3 · Кімнати (крок 3)

### Каталог планувань (режим «готове»)
- **дані:** `config/layouts.ts` (13 ASCII-сіток, 1 символ = 1 м²; запити
  `availableBedrooms/floorsAvailable/planBathrooms/supportedExtras`), `config/rooms.ts` (`ALL_EXTRAS`, мінімальні розміри)
- **логіка:** `lib/floorplan.ts` (парсер сітки) · `lib/lshape.ts` (Г-подібний — ПАРАМЕТРИЧНИЙ, не сітка)

### Зони кімнат на плані (вид зверху)
- **логіка:** `lib/editPlan.ts` (`GRID`, редагування зон) · `lib/validatePlan.ts` (помилки) ·
  `lib/place.ts` (`freeSpot`/`overlaps`/`touches` — куди класти НОВУ зону) · `lib/outline.ts`
- **3D:** `scene/PlanView.tsx` (зони, ручки, анімація) · `scene/pointerPlane.ts` (курсор → точка)
- **панель:** `fields/RoomsField.tsx`, `fields/FloorTabs.tsx`, `components/Legend.tsx`,
  `components/RoomTooltip.tsx`, `components/PlanIssues.tsx`
- **стор:** `planMode`, `customPlan`, `selectedRoom`, `hovered`, `showGrid`, `dragging`
- ⚠️ `id` кімнати — за РОЛЛЮ (`bedroom-2`), не `тип#номер`; підсвітка = `group ?? id`.

## Полиця 4 · Вікна і двері (крок 4)

### Вікно
- **логіка:** `lib/windows.ts` (специфікації як дані, `WALL_T`, `hasWallAt`, правила розстановки)
- **3D:** `openings` useMemo :1467-1480 · компонент `Win` :628-783 · рендер :2196-2208
- **редактор мишею:** `WindowEditor` :943-1341 + математика осі стіни :847-942
  (`alongAxis` :879 — без меша-«ловця»), пунктирна напрямна `GuideLine` :1342
- **панель:** `fields/WindowsField.tsx`
- **стор:** `windowsMode`, `customWindows`, `selectedWindow`, `selectedWall`, `addingWindow`
- **числа:** :100-112 (`FRAME_W`, `FRAME_D`, `GLASS_*`, `NARROW_WIN`)

### Двері у вікні (вхідні, склопакет)
- **3D:** `doorSpans` у `Win` :653 · стрілки «переставити двері» :1287 (усередині `WindowEditor`)
- **числа:** `DOOR_TRANSOM_Y` :107, `DOOR_JAMB` :108, `DOOR_LEAF_D` :109
- **стор:** `selectedDoor`

## Полиця 5–6 · Дах (кроки 5–6)

> ⚠️ Найчутливіша підсистема. **Перед будь-якою правкою** — `project-roof-architecture`.

### Зони даху (крок 5) і параметри частини (крок 6)
- **логіка:** `lib/roof.ts` (зони, складені зони `rects`, парапет, колізії з вікнами,
  СТИК ДВОХ ЗОН: `ridgeHeight`/`mainOfPair`/`sideExtend`, вхід `zoneSkeleton`)
- **скелет:** `lib/roofSkeleton.ts` — ПРЯМИЙ СКЕЛЕТ (контур, «карниз чи фронтон», розкрій схилів).
  Читають три місця: `HouseShell`, `roofSkin`, `gableFaces`.
- **3D:** `scene/RoofView.tsx` (малювання й вибір зон) · у `HouseShell`: геометрії
  `hipGeometry` :341 · `monoGeometry` :415 · `skeletonSurface` :472 · `skeletonBand` :488 ·
  `skeletonCut` :531 · `skeletonGeometry` :573 · `skeletonPlateGeometry` :606 ·
  рендер рівнів :2140-2192 (плоский+парапет :2144-2162, скатний :2166-2192)
- **панель:** `fields/RoofZonesField.tsx` (крок 5), `fields/RoofField.tsx` (крок 6)
- **стор:** `roofMode`, `customRoof` (`[]` = «малюй», `null` = «порахуй»), `selectedRoofPart`,
  `roofLevel`, `roofOverTerrace`

### Фронтон і парапет
- **логіка:** `lib/gableFaces.ts` (фронтони й стінки парапету як ті самі грані)
- **3D:** `gableGeometry` :312 · `gablePlateGeometry` :326 · `parapets` useMemo :1837-1876 ·
  `gables` useMemo :1877-2025 · `gableTiers` :2026-2038 · `faceUnder` :919 (чиє оздоблення успадкувати)

## Полиця 7 · Матеріал стін (фасад, крок 7)
- **дані:** `config/facade.ts` (типи, межі, кольори — тільки числа)
- **логіка:** `lib/cladding.ts` (розкладка в коробки) · `lib/wallFaces.ts` · `lib/gableFaces.ts`
- **3D:** `scene/Cladding.tsx` (InstancedMesh) · `scene/FacadeWalls.tsx` (вибір стіни) ·
  `scene/facadeMaterial.ts` (ч/б текстура + світова проєкція UV) ·
  у `HouseShell`: `cladGroups`/`cladBacking` useMemo :1504-1633 · рендер :2076-2082
- **панель:** `fields/FacadeField.tsx` · **стор:** `facades`, `facadeMode`, `wallFacades`,
  `facadeFloor`, `selectedFacadeWall`
- ⚠️ Ріг = «горизонтальна грань володіє»; підкладка спиняється раніше за елементи (`backA/backB`) — [[project-facade-step]].

## Полиця 8 · Матеріал даху (крок 8)
- **дані:** `config/roofMaterial.ts`
- **логіка:** `lib/roofSkin.ts` (розкладка, планки, кожухи — 1145 рядків)
- **3D:** `scene/RoofSkin.tsx` · у `HouseShell`: `skins` useMemo :1655-1661 · рендер :2100-2105
- **панель:** `fields/RoofMaterialField.tsx` · **стор:** `roofMat`, `roofFlat`, `roofMats`, `roofMatTouched`

## Полиця 9 · Тераса і паркан (крок 9)
- **логіка:** `lib/terrace.ts` (зони) · `lib/place.ts`
- **3D:** `scene/TerraceView.tsx` (малювання зон)
- **паркан:** `fences` useMemo :1778-1836 · рендер :2230-2247 · числа `FENCE_H/FENCE_D/RAIL_H/RAIL_W` :122-125
- **панель:** `fields/TerraceField.tsx` · **стор:** `terraceZones`, `selectedTerrace`
- ⚠️ Паркан стоїть НА покритті тераси, не в ньому.

## Полиця 10 · Покриття тераси (крок 10)
- **дані:** `config/terraceMaterial.ts` · **логіка:** `lib/terraceSkin.ts`
- **3D:** `terraceSkins` useMemo :1634-1639 · рендер :2092-2097
- **панель:** `fields/TerraceMaterialField.tsx` · **стор:** `terraceMats`, `terraceFloor`

## Полиця 11 · Інтер'єр (крок 11)
- **дані:** `config/interior.ts` · **логіка:** `lib/interiorSkin.ts` (підлоги), `lib/innerWalls.ts` (двері/арки як дані)
- **3D:** `scene/InnerDoorEditor.tsx` · `interiorSkins` useMemo :1649-1654 · рендер підлог :2084-2089 ·
  внутрішні двері :2123-2126 · відсікання `SectionCut` у `scene/SceneRoot.tsx`
- **панель:** `fields/InteriorField.tsx` · **стор:** `interiorFloors`, `roomFloorMats`,
  `innerDoors`, `selectedInnerWall`, `selectedInnerDoor`, `selectedInteriorRoom`

---

## Полиця ∞ · Спільне

### Кроки майстра
`config/steps.ts` — 11 кроків (`budget · shape · rooms · windows · roofZones · roof · facade ·
roofMat · terrace · terraceMat · interior`), у кожного `show3D`.
**Новий крок = запис у `steps.ts` + тексти в `locales/uk.ts` + компонент у `components/fields/`.** Більше нічого.
Панель: `components/Panel.tsx`, `StepContent.tsx`, `MiniStepper.tsx`, `NumberValue.tsx`, `Landing.tsx`.

### Стан
`state/store.ts` (626 рядків) — конфіг, режими «готове/своє» по кожному етапу, вибір, історія.
`config/availability.ts` — матриця доступності. `config/types.ts` — усі типи.

### Редактор: клавіші, історія, буфер
`state/useEditorKeys.ts` — стрілки, Delete, Ctrl+Z/C/V на ВСІХ кроках.
Історія `history` (`UNDO_DEPTH = 3`), знімок робить `remember()` у сеттерах; під час
тягання знімок один — на `setDragging`.

### Камера, світло, сцена
`scene/SceneRoot.tsx` — Canvas, світло, орбіта, `CameraRig` (висота під розмір плану), `SectionCut`.
`scene/Ground.tsx`. **`scene/useEntrance.ts` — МЕРТВИЙ код.**

### Тексти
`locales/uk.ts` (387 рядків): `app · landing :8 · nav :14 · keys :23 · steps :28 · floors :355 ·
plan :360 · viewport :384`. Тексти кроку — `steps.<stepId>`.

---

## Найбільші файли (щоб не читати цілком)

| Файл | Рядків | Читай точково |
|---|---|---|
| `scene/HouseShell.tsx` | 2255 | по якорях вище; `grep -n "const <ім'я> = useMemo"` |
| `lib/roofSkin.ts` | 1145 | тільки з полиці 8 |
| `lib/roof.ts` | 989 | тільки з полиці 5–6 |
| `scene/PlanView.tsx` | 777 | тільки з полиці 3 |
| `state/store.ts` | 626 | `grep -n "set<Ім'я>"` |
