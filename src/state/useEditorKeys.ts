import { useEffect } from "react";
import { useConfigurator } from "./store";
import { STEPS } from "../config/steps";
import { GRID, addRoom, removeRoom, updateRoom } from "../lib/editPlan";
import { generateHousePlan } from "../lib/floorplan";
import { normalizeRoof, removeRoofPart, updateRoofPart } from "../lib/roof";
import {
  normalizeTerrace,
  removeTerrace,
  type TerraceZone,
} from "../lib/terrace";
import {
  removeWindow,
  updateWindow,
  wallOf,
  wallRange,
  WIN_GRID,
  WIN_TOP,
} from "../lib/windows";
import { innerWalls, removeDoor, fitDoor } from "../lib/innerWalls";
import type { PlanRect } from "../config/types";

// ============================================================
// Клавіатура редактора: Delete, стрілки, Ctrl+Z, Ctrl+C / Ctrl+V.
//
// Один обробник на весь застосунок, а не по одному в кожній сцені: зони
// планування, зони даху, тераса, вікна й двері живуть на різних кроках, але
// поводяться однаково — і розкладати ці правила по п'яти файлах означало б
// п'ять різних наборів клавіш.
//
// Стан читаємо через getState(): обробник вішається ОДИН раз і не
// переприв'язується на кожну зміну стору.
// ============================================================

// Куди зсуває стрілка. Осі СВІТОВІ — саме так на них дивиться вид зверху.
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

const WIN_STEP_Y = 0.1; // крок вікна по висоті

// Прямокутники перетинаються по ПЛОЩІ (дотик гранями не рахується).
const hits = (a: PlanRect, b: PlanRect) =>
  Math.min(a.x + a.width / 2, b.x + b.width / 2) -
    Math.max(a.x - a.width / 2, b.x - b.width / 2) >
    0.01 &&
  Math.min(a.z + a.depth / 2, b.z + b.depth / 2) -
    Math.max(a.z - a.depth / 2, b.z - b.depth / 2) >
    0.01;

// Місце для вставленої копії: ПОРУЧ із оригіналом, але не поверх сусідів.
// Пробуємо чотири боки, відсуваючись усе далі, — так копія лягає впритул, а не
// в випадкове місце й не точно на оригінал.
function freeSpot(rect: PlanRect, others: PlanRect[]): PlanRect {
  for (let ring = 1; ring <= 8; ring++) {
    for (const [dx, dz] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const spot = {
        ...rect,
        x: rect.x + dx * ring * rect.width,
        z: rect.z + dz * ring * rect.depth,
      };
      if (!others.some((o) => hits(spot, o))) return spot;
    }
  }
  return { ...rect, x: rect.x + rect.width, z: rect.z + rect.depth };
}

// Сама обробка — окремою функцією, а не всередині ефекту: так її можна
// прогнати без браузера.
export function editorKey(e: KeyboardEvent) {
  // У полі вводу клавіші належать полю: там і стрілки, і Ctrl+Z свої.
  const el = e.target as HTMLElement | null;
  if (
    el &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.isContentEditable)
  )
    return;

  const s = useConfigurator.getState();
  if (!s.started) return;
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key.toLowerCase() === "z") {
    e.preventDefault();
    s.undo();
    return;
  }

  const arrow = ARROWS[e.key];
  const del = e.key === "Delete" || e.key === "Backspace";
  const copy = ctrl && e.key.toLowerCase() === "c";
  const paste = ctrl && e.key.toLowerCase() === "v";
  if (!arrow && !del && !copy && !paste) return;

  const stepId = STEPS[s.currentStep].id;
  const plan = s.customPlan ?? generateHousePlan(s.config);

  // ---- Кімнати ----
  if (stepId === "rooms" && s.planMode === "custom") {
    const floorIdx = Math.min(s.viewFloor, plan.floors.length) - 1;
    const rooms = plan.floors[floorIdx]?.rooms ?? [];
    if (paste) {
      const clip = s.clipboard;
      if (clip?.kind !== "room") return;
      e.preventDefault();
      const spot = freeSpot(clip.zone, rooms);
      const added = addRoom(plan, floorIdx, clip.zone.type);
      s.setCustomPlan(updateRoom(added.plan, floorIdx, added.id, spot));
      s.setSelectedRoom(added.id);
      return;
    }
    const zone = rooms.find((r) => r.id === s.selectedRoom);
    if (!zone) return;
    e.preventDefault();
    if (copy) {
      s.setClipboard({ kind: "room", floor: floorIdx, zone });
      return;
    }
    if (del) {
      s.setCustomPlan(removeRoom(plan, floorIdx, zone.id!));
      s.setSelectedRoom(null);
      return;
    }
    s.setCustomPlan(
      updateRoom(plan, floorIdx, zone.id!, {
        ...zone,
        x: zone.x + arrow[0] * GRID,
        z: zone.z + arrow[1] * GRID,
      }),
    );
    return;
  }

  // ---- Зони даху ----
  if (
    (stepId === "roofZones" || stepId === "roof") &&
    s.roofMode === "custom"
  ) {
    const parts = s.customRoof ?? [];
    if (paste) {
      const clip = s.clipboard;
      if (clip?.kind !== "roof") return;
      e.preventDefault();
      const src = clip.part;
      const spot = freeSpot(
        src,
        parts.filter((p) => p.level === src.level),
      );
      const id = `roof-${src.level}-${Date.now().toString(36)}`;
      // Копія — самостійна зона: складені частини (`rects`) не переносимо,
      // інакше вона тягла б за собою прямокутники на старих місцях.
      s.setCustomRoof([
        ...parts,
        normalizeRoof({ ...src, id, rects: undefined, x: spot.x, z: spot.z }),
      ]);
      s.setSelectedRoofPart(id);
      return;
    }
    const part = parts.find((p) => p.id === s.selectedRoofPart);
    if (!part) return;
    e.preventDefault();
    if (copy) {
      s.setClipboard({ kind: "roof", part });
      return;
    }
    if (del) {
      s.setCustomRoof(removeRoofPart(parts, part.id));
      s.setSelectedRoofPart(null);
      return;
    }
    s.setCustomRoof(
      updateRoofPart(parts, part.id, {
        x: part.x + arrow[0] * GRID,
        z: part.z + arrow[1] * GRID,
      }),
    );
    return;
  }

  // ---- Зони тераси ----
  if (stepId === "terrace") {
    const zones = s.terraceZones;
    if (paste) {
      const clip = s.clipboard;
      if (clip?.kind !== "terrace") return;
      e.preventDefault();
      const id = `terr-${Date.now().toString(36)}`;
      const copyZone: TerraceZone = {
        id,
        ...normalizeTerrace(freeSpot(clip.zone, zones)),
      };
      s.setTerraceZones([...zones, copyZone]);
      s.setSelectedTerrace(id);
      return;
    }
    const zone = zones.find((z) => z.id === s.selectedTerrace);
    if (!zone) return;
    e.preventDefault();
    if (copy) {
      s.setClipboard({ kind: "terrace", zone });
      return;
    }
    if (del) {
      s.setTerraceZones(removeTerrace(zones, zone.id));
      s.setSelectedTerrace(null);
      return;
    }
    s.setTerraceZones(
      zones.map((z) =>
        z.id === zone.id
          ? {
              ...z,
              ...normalizeTerrace({
                ...z,
                x: z.x + arrow[0] * GRID,
                z: z.z + arrow[1] * GRID,
              }),
            }
          : z,
      ),
    );
    return;
  }

  // ---- Вікна: ліворуч/праворуч — уздовж стіни, вгору/вниз — по висоті ----
  if (stepId === "windows" && s.windowsMode === "custom" && s.customWindows) {
    if (copy || paste) return; // вікно копіюють не буфером, а кнопкою «додати»
    const specs = s.customWindows;
    const spec = specs.find((w) => w.id === s.selectedWindow);
    if (!spec) return;
    e.preventDefault();
    if (del) {
      s.setCustomWindows(removeWindow(specs, spec.id));
      s.setSelectedWindow(null);
      return;
    }
    const room = plan.floors[spec.floor]?.rooms.find(
      (r) => r.id === spec.roomId,
    );
    if (!room) return;
    if (arrow[0] !== 0) {
      const { from, to } = wallRange(
        wallOf(room, spec.side, plan.floors[spec.floor]),
      );
      const u = Math.max(
        from,
        Math.min(spec.u + arrow[0] * WIN_GRID, to - spec.width),
      );
      s.setCustomWindows(updateWindow(specs, spec.id, { u }));
      return;
    }
    // Вікно їде ЦІЛКОМ: підвіконня й верх разом, висота не міняється.
    const h = spec.top - spec.sill;
    const sill = Math.max(
      0,
      Math.min(spec.sill - arrow[1] * WIN_STEP_Y, WIN_TOP + 0.2 - h),
    );
    s.setCustomWindows(updateWindow(specs, spec.id, { sill, top: sill + h }));
    return;
  }

  // ---- Внутрішні двері: рух уздовж своєї перегородки ----
  if (stepId === "interior" && s.selectedInnerDoor) {
    if (copy || paste) return;
    const door = s.innerDoors.find((d) => d.id === s.selectedInnerDoor);
    if (!door) return;
    e.preventDefault();
    if (del) {
      s.setInnerDoors(removeDoor(s.innerDoors, door.id));
      s.setSelectedInnerDoor(null);
      return;
    }
    const wall = innerWalls(plan).find((w) => w.id === door.wallId);
    if (!wall || arrow[0] === 0) return;
    s.setInnerDoors(
      s.innerDoors.map((d) =>
        d.id === door.id ? fitDoor(d, wall, d.u + arrow[0] * 0.1, d.width) : d,
      ),
    );
  }
}

export default function useEditorKeys() {
  useEffect(() => {
    window.addEventListener("keydown", editorKey);
    return () => window.removeEventListener("keydown", editorKey);
  }, []);
}
