// <define:import.meta.env>
var define_import_meta_env_default = { DEV: false };

// src/config/layouts.ts
var LAYOUTS = [
  // ---------- Прямокутні, 1 поверх ----------
  {
    id: "rect-1fl-1bed",
    shape: "rect",
    floors: 1,
    bedrooms: 1,
    bathrooms: 1,
    extras: ["pantry"],
    fallbacks: { P: "E" },
    grid: [
      [
        "1111SSPP",
        "1111SSPP",
        "1111SSPP",
        "CCCCCCCC",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK"
      ]
    ]
  },
  {
    id: "rect-1fl-2bed",
    shape: "rect",
    floors: 1,
    bedrooms: 2,
    bathrooms: 1,
    extras: ["office", "pantry"],
    fallbacks: { O: "E", P: "K" },
    grid: [
      [
        "11112222SSOO",
        "11112222SSOO",
        "11112222SSOO",
        "CCCCCCCCCCCC",
        "HHLLLLLLKKPP",
        "HHLLLLLLKKPP",
        "HHLLLLLLKKPP"
      ]
    ]
  },
  {
    id: "rect-1fl-3bed",
    shape: "rect",
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    extras: ["wardrobe", "pantry"],
    fallbacks: { W: "T", P: "S" },
    grid: [
      [
        "11112222TTWW",
        "11112222TTWW",
        "11112222SSPP",
        "11112222SSPP",
        "CCCCCCCCCCCC",
        "3333HHLLLLKK",
        "3333HHLLLLKK",
        "3333HHLLLLKK"
      ]
    ]
  },
  // ---------- Прямокутні, 2 поверхи ----------
  {
    id: "rect-2fl-3bed",
    shape: "rect",
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    extras: ["pantry", "wardrobe"],
    fallbacks: { P: "E", W: "T" },
    grid: [
      [
        "1111SSPPRR",
        "1111SSPPRR",
        "1111SSPPRR",
        "CCCCCCCCCC",
        "HHLLLLLLKK",
        "HHLLLLLLKK",
        "HHLLLLLLKK"
      ],
      [
        "2222TTWWRR",
        "2222TTWWRR",
        "2222TTWWRR",
        "CCCCCCCCCC",
        "33333EEEEE",
        "33333EEEEE",
        "33333EEEEE"
      ]
    ]
  },
  {
    id: "rect-2fl-4bed",
    shape: "rect",
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    extras: ["pantry", "wardrobe"],
    fallbacks: { P: "E", W: "T" },
    grid: [
      [
        "1111SSPPRR",
        "1111SSPPRR",
        "1111SSPPRR",
        "CCCCCCCCCC",
        "HHLLLLLLKK",
        "HHLLLLLLKK",
        "HHLLLLLLKK"
      ],
      [
        "2222TTWWRR",
        "2222TTWWRR",
        "2222TTWWRR",
        "CCCCCCCCCC",
        "3333344444",
        "3333344444",
        "3333344444"
      ]
    ]
  },
  {
    id: "rect-2fl-5bed",
    shape: "rect",
    floors: 2,
    bedrooms: 5,
    bathrooms: 3,
    extras: ["pantry", "office"],
    fallbacks: { P: "E", O: "E" },
    grid: [
      [
        "1111SSPPOORR",
        "1111SSPPOORR",
        "1111SSPPOORR",
        "CCCCCCCCCCCC",
        "HHLLLLLLLLKK",
        "HHLLLLLLLLKK",
        "HHLLLLLLLLKK"
      ],
      [
        "22223333TTRR",
        "22223333TTRR",
        "22223333TTRR",
        "CCCCCCCCCCCC",
        "44445555UUEE",
        "44445555UUEE",
        "44445555UUEE"
      ]
    ]
  },
  // ---------- Квадратні, 1 поверх ----------
  {
    id: "square-1fl-1bed",
    shape: "square",
    floors: 1,
    bedrooms: 1,
    bathrooms: 1,
    extras: ["pantry"],
    fallbacks: { P: "E" },
    grid: [
      [
        "1111SSPP",
        "1111SSPP",
        "1111SSPP",
        "CCCCCCCC",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK"
      ]
    ]
  },
  {
    id: "square-1fl-2bed",
    shape: "square",
    floors: 1,
    bedrooms: 2,
    bathrooms: 1,
    extras: ["office"],
    fallbacks: { O: "H" },
    grid: [
      [
        "11112222SS",
        "11112222SS",
        "11112222SS",
        "CCCCCCCCCC",
        "HHLLLLLLKK",
        "HHLLLLLLKK",
        "HHLLLLLLKK",
        "OOLLLLLLKK",
        "OOLLLLLLKK"
      ]
    ]
  },
  {
    id: "square-1fl-3bed",
    shape: "square",
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        "11112222SS",
        "11112222SS",
        "11112222SS",
        "CCCCCCCCCC",
        "3333LLLLKK",
        "3333LLLLKK",
        "3333LLLLKK",
        "HHTTLLLLKK",
        "HHTTLLLLKK",
        "HHTTLLLLKK"
      ]
    ]
  },
  // ---------- Квадратні, 2 поверхи ----------
  {
    id: "square-2fl-3bed",
    shape: "square",
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        "1111SSRR",
        "1111SSRR",
        "1111SSRR",
        "CCCCCCCC",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK"
      ],
      [
        "2222TTRR",
        "2222TTRR",
        "2222TTRR",
        "CCCCCCCC",
        "3333EEEE",
        "3333EEEE",
        "3333EEEE",
        "3333EEEE"
      ]
    ]
  },
  {
    id: "square-2fl-4bed",
    shape: "square",
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        "1111SSRR",
        "1111SSRR",
        "1111SSRR",
        "CCCCCCCC",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK",
        "HHLLLLKK"
      ],
      [
        "2222TTRR",
        "2222TTRR",
        "2222TTRR",
        "CCCCCCCC",
        "33334444",
        "33334444",
        "33334444",
        "33334444"
      ]
    ]
  },
  // ---------- Г-подібні, 1 поверх ----------
  {
    id: "l-1fl-2bed",
    shape: "l-shape",
    floors: 1,
    bedrooms: 2,
    bathrooms: 1,
    extras: ["wardrobe"],
    fallbacks: { W: "E" },
    grid: [
      [
        "1111CC.....",
        "1111CC.....",
        "1111CC.....",
        "2222CC.....",
        "2222CC.....",
        "2222CC.....",
        "WWSSCC.....",
        "WWSSCC.....",
        "HHLLLLLLKKK",
        "HHLLLLLLKKK",
        "HHLLLLLLKKK"
      ]
    ]
  },
  {
    id: "l-1fl-3bed",
    shape: "l-shape",
    floors: 1,
    bedrooms: 3,
    bathrooms: 2,
    extras: [],
    fallbacks: {},
    grid: [
      [
        "1111CC......",
        "1111CC......",
        "1111CC......",
        "2222CC......",
        "2222CC......",
        "2222CC......",
        "TTSSCC......",
        "TTSSCC......",
        "3333HHLLLLKK",
        "3333HHLLLLKK",
        "3333HHLLLLKK"
      ]
    ]
  },
  // ---------- Г-подібні, 2 поверхи ----------
  {
    id: "l-2fl-3bed",
    shape: "l-shape",
    floors: 2,
    bedrooms: 3,
    bathrooms: 2,
    extras: ["pantry", "wardrobe"],
    fallbacks: { P: "H", W: "T" },
    grid: [
      [
        "1111CC.....",
        "1111CC.....",
        "1111CC.....",
        "SSRRCC.....",
        "SSRRCC.....",
        "PPRRCC.....",
        "PPRRCC.....",
        "HHLLLLLLKKK",
        "HHLLLLLLKKK",
        "HHLLLLLLKKK"
      ],
      [
        "2222CC.....",
        "2222CC.....",
        "2222CC.....",
        "TTRRCC.....",
        "TTRRCC.....",
        "WWRRCC.....",
        "WWRRCC.....",
        "3333EEEEEEE",
        "3333EEEEEEE",
        "3333EEEEEEE"
      ]
    ]
  },
  {
    id: "l-2fl-4bed",
    shape: "l-shape",
    floors: 2,
    bedrooms: 4,
    bathrooms: 2,
    extras: ["pantry", "wardrobe"],
    fallbacks: { P: "H", W: "T" },
    grid: [
      [
        "1111CC.....",
        "1111CC.....",
        "1111CC.....",
        "SSRRCC.....",
        "SSRRCC.....",
        "PPRRCC.....",
        "PPRRCC.....",
        "HHLLLLLLKKK",
        "HHLLLLLLKKK",
        "HHLLLLLLKKK"
      ],
      [
        "2222CC.....",
        "2222CC.....",
        "2222CC.....",
        "TTRRCC.....",
        "TTRRCC.....",
        "WWRRCC.....",
        "WWRRCC.....",
        "33334444EEE",
        "33334444EEE",
        "33334444EEE"
      ]
    ]
  }
];
var L_BEDROOMS = {
  1: [1, 2, 3, 4, 5],
  2: [1, 2, 3, 4, 5]
};
function availableBedrooms(shape, floors) {
  if (shape === "l-shape") return L_BEDROOMS[floors];
  return LAYOUTS.filter((l) => l.shape === shape && l.floors === floors).map((l) => l.bedrooms).sort((a, b) => a - b);
}
function floorsAvailable(_shape) {
  return [1, 2];
}
function findTemplate(shape, floors, bedrooms) {
  return LAYOUTS.find(
    (l) => l.shape === shape && l.floors === floors && l.bedrooms === bedrooms
  );
}

// src/lib/editPlan.ts
var GRID = 0.5;
var MIN_SIDE = 1;
var snap = (v) => Math.round(v / GRID) * GRID;

// src/lib/lshape.ts
var LSHAPE_SLOW_GROW = 1.1;
var CORRIDOR_W = 1.5;
var ROOM_W = 4;
var NIGHT_W = CORRIDOR_W + ROOM_W;
var MASTER_LEN = 5;
var MASTER_WC_LEN = 6;
var MASTER_SINGLE_LEN = 5;
var ENSUITE_LEN = 3.5;
var COL_W = 2.5;
var SAN_BOX = 2.5;
var CLO_BOX = 2.5;
var CLOSET_STRIP = 1.5;
var BEDROOM_LEN = 3.5;
var OFFICE_LEN = 2.5;
var STAIR_W = ROOM_W;
var STAIR_LEN = 2.5;
var DAY_DEPTH = 7;
var HCORR_LEN = 1.5;
var SERVICE_W = 2.5;
var BATH_LEN = 2.5;
var HALL_W = 2;
var KITCHEN_W = 6;
var PANTRY_W = 1.5;
var PANTRY_LEN = 3.5;
function rect(id, type, x0, z0, width, depth) {
  return { id, type, x: x0 + width / 2, z: z0 + depth / 2, width, depth };
}
function buildNightWing(b, hasOffice, hasCloset, pfx) {
  const hasEnsuite = b >= 2;
  const rooms = [];
  let z;
  let corridorTop;
  if (hasEnsuite && hasCloset) {
    rooms.push(rect(`${pfx}ensuite-bath`, "bathroom", 0, 0, COL_W, SAN_BOX));
    rooms.push(rect(`${pfx}closet-box`, "closet", 0, SAN_BOX, COL_W, CLO_BOX));
    const colBottom = SAN_BOX + CLO_BOX;
    rooms.push({ ...rect(`${pfx}master-a`, "bedroom", COL_W, 0, NIGHT_W - COL_W, MASTER_WC_LEN), group: `${pfx}master` });
    rooms.push({ ...rect(`${pfx}master-b`, "bedroom", CORRIDOR_W, colBottom, COL_W - CORRIDOR_W, MASTER_WC_LEN - colBottom), group: `${pfx}master` });
    corridorTop = colBottom;
    z = MASTER_WC_LEN;
  } else if (hasEnsuite) {
    rooms.push(rect(`${pfx}ensuite-bath`, "bathroom", 0, 0, CORRIDOR_W, ENSUITE_LEN));
    rooms.push(rect(`${pfx}master-a`, "bedroom", CORRIDOR_W, 0, ROOM_W, MASTER_LEN));
    corridorTop = ENSUITE_LEN;
    z = MASTER_LEN;
  } else {
    const cLen = hasCloset ? CLOSET_STRIP : 0;
    if (hasCloset) rooms.push({ ...rect(`${pfx}closet-strip`, "closet", 0, 0, NIGHT_W, cLen), anchorZ: "min" });
    rooms.push(rect(`${pfx}master-a`, "bedroom", 0, cLen, NIGHT_W, MASTER_SINGLE_LEN - cLen));
    corridorTop = MASTER_SINGLE_LEN;
    z = MASTER_SINGLE_LEN;
  }
  for (let i = 0; i < b - 1; i++) {
    rooms.push(rect(`${pfx}bedroom-${i + 1}`, "bedroom", CORRIDOR_W, z, ROOM_W, BEDROOM_LEN));
    z += BEDROOM_LEN;
  }
  if (hasOffice) {
    rooms.push(rect(`${pfx}office`, "office", CORRIDOR_W, z, ROOM_W, OFFICE_LEN));
    z += OFFICE_LEN;
  }
  return { rooms, endZ: z, corridorTop };
}
function nightWingLen(b, hasOffice, hasCloset) {
  const masterLen = b >= 2 ? hasCloset ? MASTER_WC_LEN : MASTER_LEN : MASTER_SINGLE_LEN;
  const beds = b >= 2 ? (b - 1) * BEDROOM_LEN : 0;
  return masterLen + beds + (hasOffice ? OFFICE_LEN : 0);
}
function floor2Limits(config) {
  const b1 = Math.max(1, config.bedrooms);
  const cap = nightWingLen(b1, config.extras.includes("office"), config.extras.includes("wardrobe"));
  const o2 = config.extras2.includes("office");
  const w2 = config.extras2.includes("wardrobe");
  let maxBedrooms = 1;
  while (maxBedrooms < b1 && nightWingLen(maxBedrooms + 1, o2, w2) <= cap + 0.01) maxBedrooms++;
  const b2 = Math.min(Math.max(1, config.bedrooms2), maxBedrooms);
  const canOffice = nightWingLen(b2, true, w2) <= cap + 0.01;
  const canWardrobe = nightWingLen(b2, o2, true) <= cap + 0.01;
  const canTerrace = cap - nightWingLen(b2, o2, w2) > 0.01;
  return { maxBedrooms, canOffice, canWardrobe, canTerrace };
}
function generateLShapePlan(config) {
  const b = Math.max(1, config.bedrooms);
  const twoFloors = config.floors === 2;
  const hasOffice = config.extras.includes("office");
  const hasCloset = config.extras.includes("wardrobe");
  const hasCorridor = b >= 2 || hasOffice || twoFloors;
  const nw = buildNightWing(b, hasOffice, hasCloset, "");
  const rooms = [...nw.rooms];
  let z = nw.endZ;
  const corridorTop = nw.corridorTop;
  if (twoFloors) {
    rooms.push(rect("stairs", "stairs", CORRIDOR_W, z, STAIR_W, STAIR_LEN));
    z += STAIR_LEN;
  }
  const nightLen = z;
  const dz = nightLen;
  if (hasCorridor) {
    rooms.push({ ...rect("corridor-v", "corridor", 0, corridorTop, CORRIDOR_W, dz - corridorTop), lazyStretch: true });
  }
  const hasPantry = config.extras.includes("pantry");
  const leftW = SERVICE_W + HALL_W;
  const kitchenX = leftW + (hasPantry ? PANTRY_W : 0);
  rooms.push(rect("corridor-h", "corridor", 0, dz, kitchenX, HCORR_LEN));
  const bz = dz + HCORR_LEN;
  rooms.push(rect("bath-day", "bathroom", 0, bz, SERVICE_W, BATH_LEN));
  rooms.push(rect("wardrobe-day", "wardrobe", 0, bz + BATH_LEN, SERVICE_W, DAY_DEPTH - HCORR_LEN - BATH_LEN));
  rooms.push({ ...rect("hall-main", "hall", SERVICE_W, bz, HALL_W, DAY_DEPTH - HCORR_LEN), group: "hall" });
  if (hasPantry) {
    const pFrontZ = dz + DAY_DEPTH - PANTRY_LEN;
    rooms.push(rect("pantry", "pantry", leftW, pFrontZ, PANTRY_W, PANTRY_LEN));
    rooms.push({ ...rect("hall-niche", "hall", leftW, bz, PANTRY_W, pFrontZ - bz), group: "hall" });
  }
  rooms.push(rect("kitchen", "livingKitchen", kitchenX, dz, KITCHEN_W, DAY_DEPTH));
  const dayW = kitchenX + KITCHEN_W;
  const slab = [
    { x: NIGHT_W / 2, z: nightLen / 2, width: NIGHT_W, depth: nightLen },
    { x: dayW / 2, z: dz + DAY_DEPTH / 2, width: dayW, depth: DAY_DEPTH }
  ];
  const cx = Math.round(dayW / 2 / GRID) * GRID;
  const cz = Math.round((dz + DAY_DEPTH) / 2 / GRID) * GRID;
  const shift = (o) => ({ ...o, x: o.x - cx, z: o.z - cz });
  const floors = [{ floor: 1, rooms: rooms.map(shift), slab: slab.map(shift) }];
  if (twoFloors) {
    const f2 = buildFloor2(config);
    const zOffset = nightLen - (f2.length - DAY_DEPTH);
    const shiftF2 = (o) => ({ ...o, x: o.x - cx, z: o.z + zOffset - cz });
    const f2rooms = f2.rooms.map(shiftF2);
    const hasTerrace = config.extras2.includes("terrace") && zOffset > 0.01;
    if (hasTerrace) {
      f2rooms.push(shift(rect("f2-terrace", "terrace", 0, 0, NIGHT_W, zOffset)));
    }
    const backZ = hasTerrace ? 0 : zOffset;
    const frontZ = nightLen + DAY_DEPTH;
    const f2slab = [
      shift({ x: NIGHT_W / 2, z: (backZ + frontZ) / 2, width: NIGHT_W, depth: frontZ - backZ })
    ];
    floors.push({ floor: 2, rooms: f2rooms, slab: f2slab });
  }
  const totalArea = Math.round(
    floors.reduce(
      (s, fl) => s + fl.rooms.filter((r) => r.type !== "stairs").reduce((a, r) => a + r.width * r.depth, 0),
      0
    )
  );
  return { floors, totalArea };
}
function buildFloor2(config) {
  const b2 = Math.min(Math.max(1, config.bedrooms2), floor2Limits(config).maxBedrooms);
  const hasOffice2 = config.extras2.includes("office");
  const hasCloset2 = config.extras2.includes("wardrobe");
  const nw = buildNightWing(b2, hasOffice2, hasCloset2, "f2-");
  const rooms = [...nw.rooms];
  let z = nw.endZ;
  rooms.push(rect("f2-stairs", "stairs", CORRIDOR_W, z, STAIR_W, STAIR_LEN));
  z += STAIR_LEN;
  const nightLen2 = z;
  rooms.push({ ...rect("f2-corridor-v", "corridor", 0, nw.corridorTop, CORRIDOR_W, nightLen2 - nw.corridorTop), lazyStretch: true, growEase: LSHAPE_SLOW_GROW });
  const bz = nightLen2 + HCORR_LEN;
  const dayRest = DAY_DEPTH - HCORR_LEN;
  rooms.push(rect("f2-corridor-h", "corridor", 0, nightLen2, NIGHT_W, HCORR_LEN));
  rooms.push(rect("f2-bath-day", "bathroom", 0, bz, SERVICE_W, BATH_LEN));
  rooms.push({ ...rect("f2-entry-bed-a", "bedroom", SERVICE_W, bz, NIGHT_W - SERVICE_W, dayRest), group: "f2-entry-bed" });
  rooms.push({ ...rect("f2-entry-bed-b", "bedroom", 0, bz + BATH_LEN, SERVICE_W, dayRest - BATH_LEN), group: "f2-entry-bed" });
  return { rooms, length: nightLen2 + DAY_DEPTH };
}

// src/lib/floorplan.ts
var CHAR_TYPE = {
  H: "hall",
  L: "living",
  // або livingKitchen — вирішується конфігурацією
  K: "kitchen",
  C: "corridor",
  R: "stairs",
  S: "bathroom",
  T: "bathroom",
  U: "bathroom",
  O: "office",
  W: "wardrobe",
  P: "pantry",
  E: "terrace",
  "1": "bedroom",
  "2": "bedroom",
  "3": "bedroom",
  "4": "bedroom",
  "5": "bedroom"
};
var CHAR_EXTRA = {
  O: "office",
  W: "wardrobe",
  P: "pantry"
};
function applyToggles(rows, config, template) {
  let result = rows;
  const replace = (from, to) => result = result.map((row) => row.split(from).join(to));
  for (const [ch, target] of Object.entries(template.fallbacks)) {
    const extra = CHAR_EXTRA[ch];
    if (extra && !config.extras.includes(extra)) replace(ch, target);
  }
  if (config.kitchenType !== "separate") replace("K", "L");
  return result;
}
function parseFloor(rows, floorNum, cx, cz, livingType) {
  const boxes = /* @__PURE__ */ new Map();
  rows.forEach((row, r) => {
    ;
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      const b = boxes.get(ch);
      if (!b) {
        boxes.set(ch, { minR: r, maxR: r, minC: c, maxC: c, count: 1 });
      } else {
        b.minR = Math.min(b.minR, r);
        b.maxR = Math.max(b.maxR, r);
        b.minC = Math.min(b.minC, c);
        b.maxC = Math.max(b.maxC, c);
        b.count++;
      }
    });
  });
  const rooms = [];
  for (const [ch, b] of boxes) {
    const width = b.maxC - b.minC + 1;
    const depth = b.maxR - b.minR + 1;
    if (define_import_meta_env_default.DEV && b.count !== width * depth) {
      console.warn(`[layouts] \u043A\u0456\u043C\u043D\u0430\u0442\u0430 '${ch}' \u043D\u0430 \u043F\u043E\u0432\u0435\u0440\u0441\u0456 ${floorNum} \u043D\u0435 \u043F\u0440\u044F\u043C\u043E\u043A\u0443\u0442\u043D\u0430`);
    }
    const type = ch === "L" ? livingType : CHAR_TYPE[ch];
    if (!type) {
      if (define_import_meta_env_default.DEV) console.warn(`[layouts] \u043D\u0435\u0432\u0456\u0434\u043E\u043C\u0438\u0439 \u0441\u0438\u043C\u0432\u043E\u043B '${ch}'`);
      continue;
    }
    rooms.push({
      id: ch,
      // символ сітки — стабільний id кімнати (окрема підсвітка/анімація)
      type,
      x: (b.minC + b.maxC + 1) / 2 - cx,
      z: (b.minR + b.maxR + 1) / 2 - cz,
      width,
      depth
    });
  }
  const strips = [];
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (row[c] === ".") {
        c++;
        continue;
      }
      let end = c;
      while (end + 1 < row.length && row[end + 1] !== ".") end++;
      const prev = strips.find((s) => s.r1 === r - 1 && s.c0 === c && s.c1 === end);
      if (prev) prev.r1 = r;
      else strips.push({ r0: r, r1: r, c0: c, c1: end });
      c = end + 1;
    }
  });
  const slab = strips.map((s) => ({
    x: (s.c0 + s.c1 + 1) / 2 - cx,
    z: (s.r0 + s.r1 + 1) / 2 - cz,
    width: s.c1 - s.c0 + 1,
    depth: s.r1 - s.r0 + 1
  }));
  return { floor: floorNum, rooms, slab };
}
function generateHousePlan(config) {
  if (!config.shape) return { floors: [], totalArea: 0 };
  if (config.shape === "l-shape") return generateLShapePlan(config);
  const template = findTemplate(config.shape, config.floors, config.bedrooms);
  if (!template) return { floors: [], totalArea: 0 };
  const rows0 = template.grid[0];
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity;
  rows0.forEach((row, r) => {
    ;
    [...row].forEach((ch, c) => {
      if (ch === ".") return;
      minR = Math.min(minR, r);
      maxR = Math.max(maxR, r);
      minC = Math.min(minC, c);
      maxC = Math.max(maxC, c);
    });
  });
  const cx = (minC + maxC + 1) / 2;
  const cz = (minR + maxR + 1) / 2;
  const livingType = config.kitchenType === "separate" ? "living" : "livingKitchen";
  const floors = template.grid.slice(0, config.floors).map((rows, i) => parseFloor(applyToggles(rows, config, template), i + 1, cx, cz, livingType));
  const totalArea = floors.reduce(
    (sum, fl) => sum + fl.rooms.filter((r) => r.type !== "terrace").reduce((s, r) => s + r.width * r.depth, 0),
    0
  );
  return { floors, totalArea: Math.round(totalArea) };
}
function validateLayouts() {
  for (const t of LAYOUTS) {
    for (const [f, rows] of t.grid.entries()) {
      const widths = new Set(rows.map((r) => r.length));
      if (widths.size !== 1)
        console.warn(`[layouts] ${t.id}: \u0440\u044F\u0434\u043A\u0438 \u043F\u043E\u0432\u0435\u0440\u0445\u0443 ${f + 1} \u0440\u0456\u0437\u043D\u043E\u0457 \u0434\u043E\u0432\u0436\u0438\u043D\u0438`);
    }
    if (t.grid.length === 2) {
      const [a, b] = t.grid;
      const contour = (rows) => rows.map((r) => [...r].map((c) => c === "." ? "." : "#").join(""));
      if (contour(a).join("\n") !== contour(b).join("\n"))
        console.warn(`[layouts] ${t.id}: \u043A\u043E\u043D\u0442\u0443\u0440\u0438 \u043F\u043E\u0432\u0435\u0440\u0445\u0456\u0432 \u0440\u0456\u0437\u043D\u0456`);
      const stairs = (rows) => rows.map((r) => [...r].map((c) => c === "R" ? "R" : ".").join("")).join("\n");
      if (stairs(a) !== stairs(b)) console.warn(`[layouts] ${t.id}: \u0441\u0445\u043E\u0434\u0438 \u043D\u0435 \u0437\u0431\u0456\u0433\u0430\u044E\u0442\u044C\u0441\u044F`);
    }
  }
}
if (define_import_meta_env_default.DEV) validateLayouts();

// src/lib/outline.ts
var EPS = 1e-4;
var box = (r) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2
});
function axis(values) {
  const out = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1] > EPS) out.push(v);
  }
  return out;
}
var covers = (boxes, x, z) => boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
var key = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    s += x0 * z1 - x1 * z0;
  }
  return s / 2;
}
function simplify(pts) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    const cur = pts[i];
    const next = pts[(i + 1) % pts.length];
    const collinear = Math.abs(prev[0] - cur[0]) < EPS && Math.abs(cur[0] - next[0]) < EPS || Math.abs(prev[1] - cur[1]) < EPS && Math.abs(cur[1] - next[1]) < EPS;
    if (!collinear) out.push(cur);
  }
  return out;
}
function unionOutline(rects, subtract = []) {
  const add = rects.map(box);
  if (add.length === 0) return [];
  const cut = subtract.map(box);
  const all = [...add, ...cut];
  const xs = axis(all.flatMap((b) => [b.x0, b.x1]));
  const zs = axis(all.flatMap((b) => [b.z0, b.z1]));
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  if (nx < 1 || nz < 1) return [];
  const filled = new Array(nx * nz).fill(false);
  for (let i = 0; i < nx; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < nz; j++) {
      const cz = (zs[j] + zs[j + 1]) / 2;
      filled[i + j * nx] = covers(add, cx, cz) && !covers(cut, cx, cz);
    }
  }
  const at = (i, j) => i >= 0 && i < nx && j >= 0 && j < nz && filled[i + j * nx];
  const edges = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!at(i, j)) continue;
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const z0 = zs[j];
      const z1 = zs[j + 1];
      if (!at(i, j - 1)) edges.push({ a: [x0, z0], b: [x1, z0] });
      if (!at(i + 1, j)) edges.push({ a: [x1, z0], b: [x1, z1] });
      if (!at(i, j + 1)) edges.push({ a: [x1, z1], b: [x0, z1] });
      if (!at(i - 1, j)) edges.push({ a: [x0, z1], b: [x0, z0] });
    }
  }
  const from = /* @__PURE__ */ new Map();
  edges.forEach((e, i) => {
    const k = key(e.a);
    const list = from.get(k);
    if (list) list.push(i);
    else from.set(k, [i]);
  });
  const used = new Array(edges.length).fill(false);
  const rings = [];
  for (let start = 0; start < edges.length; start++) {
    if (used[start]) continue;
    const pts = [];
    let cur = start;
    while (!used[cur]) {
      used[cur] = true;
      pts.push(edges[cur].a);
      const cands = (from.get(key(edges[cur].b)) ?? []).filter((i) => !used[i]);
      if (cands.length === 0) break;
      if (cands.length === 1) {
        cur = cands[0];
        continue;
      }
      const [dx, dz] = [edges[cur].b[0] - edges[cur].a[0], edges[cur].b[1] - edges[cur].a[1]];
      cur = cands.reduce((best, i) => {
        const cross = (e) => dx * (edges[e].b[1] - edges[e].a[1]) - dz * (edges[e].b[0] - edges[e].a[0]);
        return cross(i) > cross(best) ? i : best;
      }, cands[0]);
    }
    if (pts.length < 4) continue;
    rings.push({ pts: simplify(pts), hole: signedArea(pts) < 0 });
  }
  return rings;
}
function outlineRects(rings) {
  const uniq = (vs) => {
    const out2 = [];
    for (const v of [...vs].sort((a, b) => a - b)) if (!out2.length || v - out2[out2.length - 1] > EPS) out2.push(v);
    return out2;
  };
  const xs = uniq(rings.flatMap((r) => r.pts.map((p) => p[0])));
  const zs = uniq(rings.flatMap((r) => r.pts.map((p) => p[1])));
  if (xs.length < 2 || zs.length < 2) return [];
  const nx = xs.length - 1;
  const nz = zs.length - 1;
  const on = [];
  for (let i = 0; i < nx; i++) {
    on[i] = [];
    for (let j = 0; j < nz; j++) {
      const p = [(xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2];
      on[i][j] = rings.filter((r) => ringContains(r.pts, p)).length % 2 === 1;
    }
  }
  const out = [];
  const used = on.map((col) => col.map(() => false));
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (!on[i][j] || used[i][j]) continue;
      let i2 = i;
      while (i2 + 1 < nx && on[i2 + 1][j] && !used[i2 + 1][j]) i2++;
      let j2 = j;
      while (j2 + 1 < nz) {
        let full = true;
        for (let k = i; k <= i2 && full; k++) full = on[k][j2 + 1] && !used[k][j2 + 1];
        if (!full) break;
        j2++;
      }
      for (let k = i; k <= i2; k++) for (let m = j; m <= j2; m++) used[k][m] = true;
      out.push({
        x: (xs[i] + xs[i2 + 1]) / 2,
        z: (zs[j] + zs[j2 + 1]) / 2,
        width: xs[i2 + 1] - xs[i],
        depth: zs[j2 + 1] - zs[j]
      });
    }
  }
  return out;
}
function ringContains(pts, p) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > p[1] !== zj > p[1] && p[0] < (xj - xi) * (p[1] - zi) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// src/lib/windows.ts
var DOOR_LEAF = 0.95;
var WIN_TOP = 2.7;
var WIN_MARGIN = 0.5;
var MIN_WIN_W = 0.6;
var WIN_WIDTH = {
  bedroom: 1.6,
  livingKitchen: 2.6,
  living: 1.9,
  office: 1.3,
  bathroom: 1,
  closet: 0.6,
  wardrobe: 0.8,
  hall: 1,
  stairs: 1.2,
  corridor: 100
  // галерея на всю стіну
};
var isDoorRoom = (type, floorIdx) => type === "livingKitchen" || type === "hall" || floorIdx === 0 && type === "bedroom";
function sillFor(floorIdx, type, win, asDoor) {
  if (type === "bathroom") return WIN_TOP - 0.6;
  if (type === "stairs") return floorIdx >= 1 ? 0.3 : 0;
  if (asDoor) return 0;
  if (win === "panoramic") return floorIdx >= 1 ? 0.3 : 0;
  return 0.9;
}
var bounds = (r) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2
});
var segOverlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 0.05;
function neighborsOf(rooms, room, side, wantTerrace) {
  const b = bounds(room);
  return rooms.filter((r2) => {
    if (r2 === room) return false;
    if (wantTerrace ? r2.type !== "terrace" : r2.type === "terrace") return false;
    const c = bounds(r2);
    if (side === "xmax") return Math.abs(c.x0 - b.x1) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1);
    if (side === "xmin") return Math.abs(c.x1 - b.x0) < 0.05 && segOverlap(b.z0, b.z1, c.z0, c.z1);
    if (side === "zmax") return Math.abs(c.z0 - b.z1) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1);
    return Math.abs(c.z1 - b.z0) < 0.05 && segOverlap(b.x0, b.x1, c.x0, c.x1);
  });
}
var neighborOf = (rooms, room, side, wantTerrace) => neighborsOf(rooms, room, side, wantTerrace)[0];
var facesTerrace = (rooms, room, side) => !!neighborOf(rooms, room, side, true);
var outlineCache = /* @__PURE__ */ new WeakMap();
function floorOutline(fl) {
  let r = outlineCache.get(fl);
  if (!r) {
    r = unionOutline(
      fl.slab,
      fl.rooms.filter((x) => x.type === "terrace")
    );
    outlineCache.set(fl, r);
  }
  return r;
}
function outlineSpans(fl, room, side) {
  const b = bounds(room);
  const vertical = side === "xmax" || side === "xmin";
  const line = side === "xmax" ? b.x1 : side === "xmin" ? b.x0 : side === "zmax" ? b.z1 : b.z0;
  const u0 = vertical ? b.z0 : b.x0;
  const u1 = vertical ? b.z1 : b.x1;
  const out = [];
  for (const { pts } of floorOutline(fl)) {
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      const eHorizontal = Math.abs(z1 - z0) < 1e-4;
      if (eHorizontal === vertical) continue;
      const eLine = eHorizontal ? z0 : x0;
      if (Math.abs(eLine - line) > 0.05) continue;
      const a = Math.min(eHorizontal ? x0 : z0, eHorizontal ? x1 : z1);
      const c = Math.max(eHorizontal ? x0 : z0, eHorizontal ? x1 : z1);
      const lo = Math.max(a, u0);
      const hi = Math.min(c, u1);
      if (hi - lo > 0.05) out.push([lo - u0, hi - u0]);
    }
  }
  return out;
}
function intersectSpans(a, b) {
  const out = [];
  for (const [p0, p1] of a) {
    for (const [q0, q1] of b) {
      const lo = Math.max(p0, q0);
      const hi = Math.min(p1, q1);
      if (hi - lo > 0.05) out.push([lo, hi]);
    }
  }
  return out.sort((p, q) => p[0] - q[0]);
}
function exteriorSpans(fl, room, side) {
  const b = bounds(room);
  const vertical = side === "xmax" || side === "xmin";
  const len = vertical ? b.z1 - b.z0 : b.x1 - b.x0;
  const u0 = vertical ? b.z0 : b.x0;
  const busy = [];
  for (const r2 of fl.rooms) {
    if (r2 === room || r2.type === "terrace") continue;
    const c = bounds(r2);
    const adj = side === "xmax" ? Math.abs(c.x0 - b.x1) < 0.05 : side === "xmin" ? Math.abs(c.x1 - b.x0) < 0.05 : side === "zmax" ? Math.abs(c.z0 - b.z1) < 0.05 : Math.abs(c.z1 - b.z0) < 0.05;
    if (!adj) continue;
    const lo = Math.max(vertical ? c.z0 : c.x0, u0);
    const hi = Math.min(vertical ? c.z1 : c.x1, u0 + len);
    if (hi - lo > 0.05) busy.push([lo - u0, hi - u0]);
  }
  busy.sort((p, q) => p[0] - q[0]);
  const free = [];
  let cur = 0;
  for (const [p, q] of busy) {
    if (p - cur > 0.05) free.push([cur, p]);
    cur = Math.max(cur, q);
  }
  if (len - cur > 0.05) free.push([cur, len]);
  return intersectSpans(free, outlineSpans(fl, room, side));
}
var widest = (spans) => spans.length === 0 ? void 0 : spans.reduce((a, b) => b[1] - b[0] > a[1] - a[0] ? b : a);
function wallOf(room, side, fl) {
  const b = bounds(room);
  const base = side === "xmax" ? { side, horizontal: false, line: b.x1, uStart: b.z0, len: b.z1 - b.z0, rotY: Math.PI / 2 } : side === "xmin" ? { side, horizontal: false, line: b.x0, uStart: b.z0, len: b.z1 - b.z0, rotY: -Math.PI / 2 } : side === "zmax" ? { side, horizontal: true, line: b.z1, uStart: b.x0, len: b.x1 - b.x0, rotY: 0 } : { side, horizontal: true, line: b.z0, uStart: b.x0, len: b.x1 - b.x0, rotY: Math.PI };
  const seg = base;
  if (fl) seg.free = widest(exteriorSpans(fl, room, side));
  return seg;
}
var ALL_SIDES = ["xmax", "xmin", "zmax", "zmin"];
var USABLE = MIN_WIN_W + 2 * 0.1;
function openSides(floor, room) {
  return ALL_SIDES.filter((s) => exteriorSpans(floor, room, s).some(([a, b]) => b - a >= USABLE));
}
function generateWindows(plan, config) {
  const win = config.windows ?? "standard";
  const pitched = config.roof === "pitched";
  const out = [];
  plan.floors.forEach((fl, floorIdx) => {
    const lowerSlab = floorIdx > 0 ? plan.floors[floorIdx - 1].slab.map(bounds) : [];
    const overLowerRoof = (side, b) => {
      if (!pitched || lowerSlab.length === 0) return false;
      const off = 0.6;
      const px = side === "xmax" ? b.x1 + off : side === "xmin" ? b.x0 - off : (b.x0 + b.x1) / 2;
      const pz = side === "zmax" ? b.z1 + off : side === "zmin" ? b.z0 - off : (b.z0 + b.z1) / 2;
      return lowerSlab.some((r) => px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1);
    };
    fl.rooms.forEach((room) => {
      const specW = WIN_WIDTH[room.type];
      if (specW == null || !room.id) return;
      const b = bounds(room);
      let sides = openSides(fl, room).filter((s) => !(overLowerRoof(s, b) && !facesTerrace(fl.rooms, room, s))).map((s) => wallOf(room, s, fl));
      if (room.type === "wardrobe") {
        const short = Math.min(room.width, room.depth);
        if (Math.max(room.width, room.depth) - short > 0.5) sides = sides.filter((s) => s.len > short + 0.05);
      }
      if (sides.length === 0) return;
      sides.sort((a, c) => c.len - a.len);
      const doorRoom = isDoorRoom(room.type, floorIdx);
      const pref = room.type === "hall" || room.type === "livingKitchen" ? "zmax" : "zmin";
      const doorSide = doorRoom ? sides.find((s) => s.side === pref) ?? sides[0] : null;
      for (const sd of sides) {
        const terraceExit = facesTerrace(fl.rooms, room, sd.side);
        const asDoor = terraceExit || sd === doorSide;
        const kitchenDoor = asDoor && room.type === "livingKitchen";
        const range = wallRange(sd);
        const span = range.to - range.from;
        const width = terraceExit ? Math.max(span, MIN_WIN_W) : kitchenDoor ? Math.max(span - 0.6, 0.9) : Math.min(specW, span, sd.len - WIN_MARGIN);
        if (width < 0.4) continue;
        out.push({
          id: `${floorIdx}-${room.id}-${sd.side}`,
          floor: floorIdx,
          roomId: room.id,
          side: sd.side,
          u: range.from + (span - width) / 2,
          // по центру дозволеного проміжку
          width,
          sill: asDoor ? 0 : sillFor(floorIdx, room.type, win, false),
          top: WIN_TOP,
          mullions: -1,
          doors: asDoor ? [{ width: DOOR_LEAF, slot: 0 }] : []
        });
      }
    });
  });
  return out;
}
function resolveWindows(plan, specs, floorH) {
  const out = [];
  for (const spec of specs) {
    const fl = plan.floors[spec.floor];
    const room = fl?.rooms.find((r) => r.id === spec.roomId);
    if (!room) continue;
    const w = wallOf(room, spec.side, fl);
    const { from, to } = wallRange(w);
    const width = Math.min(spec.width, to - from);
    const u = Math.max(from, Math.min(spec.u, to - width));
    const a = w.uStart + u;
    const b = a + width;
    const center = (a + b) / 2;
    out.push({
      ...spec,
      width,
      u,
      baseY: spec.floor * floorH,
      horizontal: w.horizontal,
      line: w.line,
      a,
      b,
      rotY: w.rotY,
      fx: w.horizontal ? center : w.line,
      fz: w.horizontal ? w.line : center
    });
  }
  return out;
}
var WALL_T = 0.1;
var WIN_EDGE = WALL_T / 2 + 0.05;
function wallRange(wall) {
  const [s0, s1] = wall.free ?? [0, wall.len];
  const edge = Math.min(WIN_EDGE, (s1 - s0) / 2);
  return { from: s0 + edge, to: Math.max(s0 + edge, s1 - edge) };
}

// src/lib/roof.ts
var PARAPET_H = { min: 0.3, max: 1.5, step: 0.1 };
var PARAPET_T = { min: 0.2, max: 0.5, step: 0.05 };
var PITCH = { min: 10, max: 60, step: 5 };
var OVERHANG = { min: 0.3, max: 1, step: 0.1 };
var NO_OVERHANG = 0;
var DEFAULTS = {
  parapetH: 0.45,
  parapetT: 0.2,
  pitch: 35,
  rotation: 0,
  overhang: 0.3
};
var partRects = (p) => p.rects && p.rects.length > 0 ? p.rects : [{ x: p.x, z: p.z, width: p.width, depth: p.depth }];
function rectsBox(rects) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x - r.width / 2);
    x1 = Math.max(x1, r.x + r.width / 2);
    z0 = Math.min(z0, r.z - r.depth / 2);
    z1 = Math.max(z1, r.z + r.depth / 2);
  }
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: x1 - x0, depth: z1 - z0 };
}
var clampStep = (v, r) => Math.min(r.max, Math.max(r.min, Math.round(v / r.step) * r.step));
function normalizeRoof(part) {
  const width = Math.max(MIN_SIDE, snap(part.width));
  const depth = Math.max(MIN_SIDE, snap(part.depth));
  const x0 = snap(part.x - part.width / 2);
  const z0 = snap(part.z - part.depth / 2);
  const dx = x0 + width / 2 - part.x;
  const dz = z0 + depth / 2 - part.z;
  const rects = part.rects && part.rects.length > 0 ? part.rects.map((r) => ({ ...r, x: snap(r.x + dx - r.width / 2) + r.width / 2, z: snap(r.z + dz - r.depth / 2) + r.depth / 2 })) : void 0;
  return {
    ...part,
    rects,
    x: x0 + width / 2,
    z: z0 + depth / 2,
    width,
    depth,
    parapetH: clampStep(part.parapetH, PARAPET_H),
    parapetT: clampStep(part.parapetT, PARAPET_T),
    pitch: clampStep(part.pitch, PITCH),
    // Скатний має два осмислені напрямки (гребінь уздовж / упоперек),
    // односхилий — чотири (куди дивиться схил). Плоскому поворот байдужий.
    // Вальмовий симетричний: гребінь сам іде вздовж довшої сторони, поворот
    // йому нічого не додає — тому, як і в скатного, лише 0/90.
    rotation: (Math.round(part.rotation / 90) * 90 % (part.kind === "gable" || part.kind === "hip" ? 180 : 360) + 360) % 360,
    overhang: part.overhang < OVERHANG.min / 2 ? NO_OVERHANG : clampStep(part.overhang, OVERHANG)
  };
}
function ringArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return Math.abs(a) / 2;
}
function roofLevels(plan, overTerrace = false) {
  const out = [];
  for (let i = 0; i < plan.floors.length; i++) {
    const open = levelOutline(plan, i, overTerrace).filter((r) => !r.hole).reduce((s, r) => s + ringArea(r.pts), 0);
    if (open > 2) out.push(i);
  }
  return out;
}
function levelOutline(plan, level, overTerrace = false) {
  const fl = plan.floors[level];
  if (!fl) return [];
  const above = level < plan.floors.length - 1 ? plan.floors[level + 1].slab : [];
  const terraces = overTerrace ? [] : fl.rooms.filter((r) => r.type === "terrace");
  return unionOutline(fl.slab, [...above, ...terraces]);
}
function generateRoof(plan, kind, overTerrace = false) {
  return roofLevels(plan, overTerrace).flatMap((level) => {
    const rects = outlineRects(levelOutline(plan, level, overTerrace));
    if (rects.length === 0) return [];
    if (kind === "flat") {
      const box3 = rectsBox(rects);
      const parts = rects.length > 1 ? { rects } : {};
      return [normalizeRoof({ id: `roof-${level}`, level, kind, ...box3, ...parts, ...DEFAULTS })];
    }
    return rects.map(
      (r, i) => normalizeRoof({ id: `roof-${level}${i ? `-${i}` : ""}`, level, kind, ...r, ...DEFAULTS })
    );
  });
}
var EPS2 = 1e-4;
var box2 = (r) => ({
  x0: r.x - r.width / 2,
  x1: r.x + r.width / 2,
  z0: r.z - r.depth / 2,
  z1: r.z + r.depth / 2
});
function axis2(values) {
  const out = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    if (out.length === 0 || v - out[out.length - 1] > EPS2) out.push(v);
  }
  return out;
}
function validateRoof(plan, parts, overTerrace = false) {
  const issues = [];
  for (const level of roofLevels(plan, overTerrace)) {
    const rings = levelOutline(plan, level, overTerrace).filter((r) => !r.hole);
    if (rings.length === 0) continue;
    const zones = parts.filter((p) => p.level === level).flatMap((p) => partRects(p).map(box2));
    const pts = rings.flatMap((r) => r.pts);
    const xs = axis2([...pts.map((p) => p[0]), ...zones.flatMap((z) => [z.x0, z.x1])]);
    const zs = axis2([...pts.map((p) => p[1]), ...zones.flatMap((z) => [z.z0, z.z1])]);
    const gaps = null;
    const collect = (want) => {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < xs.length - 1; i++) {
        const cx = (xs[i] + xs[i + 1]) / 2;
        for (let j = 0; j < zs.length - 1; j++) {
          const cz = (zs[j] + zs[j + 1]) / 2;
          const inOutline = rings.some((r) => ringContains(r.pts, [cx, cz]));
          const inZone = zones.some((z) => cx > z.x0 && cx < z.x1 && cz > z.z0 && cz < z.z1);
          if (want ? !(inOutline && !inZone) : !(!inOutline && inZone)) continue;
          minX = Math.min(minX, xs[i]);
          maxX = Math.max(maxX, xs[i + 1]);
          minZ = Math.min(minZ, zs[j]);
          maxZ = Math.max(maxZ, zs[j + 1]);
        }
      }
      if (minX === Infinity || maxX - minX < 0.2 || maxZ - minZ < 0.2) return null;
      return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: maxX - minX, depth: maxZ - minZ };
    };
    void gaps;
    const un = collect(true);
    if (un) issues.push({ level, kind: "uncovered", rect: un });
    const out = collect(false);
    if (out) issues.push({ level, kind: "outside", rect: out });
  }
  return issues;
}
function parapetEdges(part, above) {
  const upper = above.map(box2);
  const rects = partRects(part);
  const rings = unionOutline(rects);
  const inside = (x, z) => {
    let n = 0;
    for (const r of rings) if (ringContains(r.pts, [x, z])) n++;
    return n % 2 === 1;
  };
  const raw = [];
  for (const { pts } of rings) {
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i];
      const [x1, z1] = pts[(i + 1) % pts.length];
      const horizontal = Math.abs(z1 - z0) < 1e-4;
      const line = horizontal ? z0 : x0;
      const min = Math.min(horizontal ? x0 : z0, horizontal ? x1 : z1);
      const max = Math.max(horizontal ? x0 : z0, horizontal ? x1 : z1);
      if (max - min < 0.05) continue;
      const mid = (min + max) / 2;
      const probe = horizontal ? [mid, line + 0.2] : [line + 0.2, mid];
      const sign = inside(probe[0], probe[1]) ? -1 : 1;
      raw.push({ horizontal, line, min, max, nx: horizontal ? 0 : sign, nz: horizontal ? sign : 0 });
    }
  }
  return raw.map((e) => {
    const cuts = upper.filter(
      (u) => e.horizontal ? e.line > u.z0 - 0.05 && e.line < u.z1 + 0.05 : e.line > u.x0 - 0.05 && e.line < u.x1 + 0.05
    ).map(
      (u) => e.horizontal ? [Math.max(u.x0, e.min), Math.min(u.x1, e.max)] : [Math.max(u.z0, e.min), Math.min(u.z1, e.max)]
    ).filter(([p0, p1]) => p1 - p0 > 0.1).sort((p0, p1) => p0[0] - p1[0]);
    const spans = [];
    let cur = e.min;
    for (const [c0, c1] of cuts) {
      if (c0 - WALL_T / 2 > cur + 0.05) spans.push([cur, c0 - WALL_T / 2]);
      cur = Math.max(cur, c1 + WALL_T / 2);
    }
    if (e.max > cur + 0.05) spans.push([cur, e.max]);
    return { ...e, spans };
  });
}
var EAVE_BASE = WALL_T / 2 + 2e-3;
var ROOF_LIFT = 0.09;
function pinnedSides(part, above) {
  const out = { xmin: false, xmax: false, zmin: false, zmax: false };
  for (const e of parapetEdges(part, above)) {
    const key2 = e.horizontal ? e.nz < 0 ? "zmin" : "zmax" : e.nx < 0 ? "xmin" : "xmax";
    const full = e.max - e.min;
    const open = e.spans.reduce((s, [a, b]) => s + (b - a), 0);
    if (open < full - 0.05) out[key2] = true;
  }
  return out;
}
function sideExtend(part, above) {
  const pin = pinnedSides(part, above);
  const value = (p) => p ? -(WALL_T / 2 - 2e-3) : EAVE_BASE + part.overhang;
  return { xmin: value(pin.xmin), xmax: value(pin.xmax), zmin: value(pin.zmin), zmax: value(pin.zmax) };
}
function slopeBox(part, above, rect2) {
  const b = box2(rect2 ?? part);
  const o = sideExtend(part, above);
  return {
    x0: b.x0 - o.xmin,
    x1: b.x1 + o.xmax,
    z0: b.z0 - o.zmin,
    z1: b.z1 + o.zmax
  };
}
function clashBox(part, above) {
  const b = box2(part);
  const pin = pinnedSides(part, above);
  const o = sideExtend(part, above);
  const e = (p, v) => p ? EAVE_BASE : v;
  return {
    x0: b.x0 - e(pin.xmin, o.xmin),
    x1: b.x1 + e(pin.xmax, o.xmax),
    z0: b.z0 - e(pin.zmin, o.zmin),
    z1: b.z1 + e(pin.zmax, o.zmax)
  };
}
function roofBottomAt(part, x, z, above) {
  const rects = partRects(part);
  if (rects.length > 1) {
    let best = null;
    for (const r of rects) {
      const v = roofBottomAt({ ...part, rects: void 0, ...r }, x, z, above);
      if (v != null && (best == null || v > best)) best = v;
    }
    return best;
  }
  const b = box2(part);
  if (part.kind !== "flat") {
    const c = clashBox(part, above);
    if (x < c.x0 - EPS2 || x > c.x1 + EPS2 || z < c.z0 - EPS2 || z > c.z1 + EPS2) return null;
    const g = slopeBox(part, above);
    const gw = g.x1 - g.x0;
    const gd = g.z1 - g.z0;
    const alongZ = part.rotation % 180 === 0 ? gd >= gw : gd < gw;
    const span = alongZ ? gw : gd;
    const u = alongZ ? x - g.x0 : z - g.z0;
    const tan = Math.tan(part.pitch * Math.PI / 180);
    if (part.kind === "mono") {
      const fromLow = part.rotation >= 180 ? span - u : u;
      return ROOF_LIFT + fromLow * tan;
    }
    if (part.kind === "hip") {
      const near = Math.min(x - g.x0, g.x1 - x, z - g.z0, g.z1 - z);
      return ROOF_LIFT + Math.max(0, near) * tan;
    }
    return ROOF_LIFT + Math.min(u, span - u) * tan;
  }
  if (x < b.x0 - EPS2 || x > b.x1 + EPS2 || z < b.z0 - EPS2 || z > b.z1 + EPS2) return null;
  {
    for (const e of parapetEdges(part, above)) {
      const perp = e.horizontal ? z : x;
      const along = e.horizontal ? x : z;
      if (Math.abs(perp - e.line) > part.parapetT + EPS2) continue;
      if (e.spans.some(([a, c]) => along > a - EPS2 && along < c + EPS2)) return part.parapetH;
    }
    return 0;
  }
}
var SAMPLES = [0, 0.25, 0.5, 0.75, 1];
function roofWindowClashes(plan, parts, windows) {
  const out = [];
  for (const w of windows) {
    for (const part of parts) {
      if (part.level !== w.floor - 1) continue;
      const above = plan.floors[part.level + 1]?.slab ?? [];
      let h = -Infinity;
      for (const s of SAMPLES) {
        const u = w.a + (w.b - w.a) * s;
        const v = roofBottomAt(part, w.horizontal ? u : w.line, w.horizontal ? w.line : u, above);
        if (v != null && v > h) h = v;
      }
      if (h > w.sill + 1e-3) out.push({ windowId: w.id, partId: part.id });
    }
  }
  return out;
}

// src/config/steps.ts
var DEFAULT_CONFIG = {
  budget: 25e5,
  constructionType: null,
  shape: null,
  floors: 1,
  bedrooms: 2,
  bathrooms: 1,
  kitchenType: "open",
  // вибір кухні прибрано — завжди кухня-вітальня
  extras: [],
  bedrooms2: 1,
  extras2: [],
  windows: null,
  roof: null
};

// _diag.ts
for (const shape of ["rect", "square", "l-shape"])
  for (const floors of floorsAvailable(shape))
    for (const bedrooms of availableBedrooms(shape, floors))
      for (const roof of ["flat", "pitched", null]) {
        const config = { ...DEFAULT_CONFIG, shape, floors, bedrooms, windows: "standard", roof };
        try {
          const plan = generateHousePlan(config);
          if (plan.floors.length === 0) continue;
          const parts = generateRoof(plan, roof === "pitched" ? "gable" : "flat");
          const specs = generateWindows(plan, config);
          const res = resolveWindows(plan, specs, 3.2);
          roofWindowClashes(plan, parts, res.map((w) => ({ id: w.id, floor: w.floor, sill: w.sill, horizontal: w.horizontal, line: w.line, a: w.a, b: w.b })));
          validateRoof(plan, parts, false);
          roofLevels(plan, false);
        } catch (e) {
          console.log(`\u041F\u0410\u0414\u0406\u041D\u041D\u042F ${shape}/${floors}/${bedrooms}/${roof}:`, e.message);
        }
      }
console.log("\u043A\u0440\u043E\u043A \xAB\u0414\u0430\u0445\xBB: \u0447\u0438\u0441\u0442\u0456 \u0432\u0438\u043A\u043B\u0438\u043A\u0438 \u043F\u0440\u043E\u0439\u0448\u043B\u0438");
