// Sparkle House: the cozy 3D dollhouse shown on the House tab.
// Loaded on demand by index.html. Everything is built from simple shapes with a soft
// cel-shaded look, so it runs offline and stays light on phones.
import * as THREE from './vendor/three.module.min.js';

/* ---------- look ---------- */
const SKY = 0xcfeef7;
const GRASS = 0x9bd6a3;
const WALL = 0xfff4e0;
const WALL_TOP = 0xf0dcb8;
const FLOOR = {
  living: 0xdcae7e, game: 0xb9c7e8, kitchen: 0xf2e2c2, bedroom: 0xc9b7e6, bathroom: 0xbfe2ef, laundry: 0xe3e4ea,
  kids: 0xffd3a1, office: 0xc9a47e, garage: 0xbac0c8, patio: 0xd9ceb6, dining: 0xd9b088, other: 0xe8dbc6
};
const ACCENT = [0xff8fa3, 0x8ad3f0, 0xffd447, 0x9bd6a3, 0xc9b7e6, 0xffb36b];

let GRAD = null;
function gradient() {
  if (GRAD) return GRAD;
  GRAD = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.RedFormat);
  GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter;
  GRAD.generateMipmaps = false;
  GRAD.needsUpdate = true;
  return GRAD;
}
const MATS = new Map();
function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  if (!MATS.has(key)) MATS.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradient(), ...(extra || {}) }));
  return MATS.get(key);
}
const GEOS = new Map();
function geo(key, make) { if (!GEOS.has(key)) GEOS.set(key, make()); return GEOS.get(key); }
function mesh(g, color, x = 0, y = 0, z = 0, extra) {
  const m = new THREE.Mesh(g, mat(color, extra));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
// Box resting on y (its bottom), centered on x/z.
function box(w, h, d, color, x = 0, y = 0, z = 0) {
  return mesh(geo(`b${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)), color, x, y + h / 2, z);
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 18) {
  return mesh(geo(`c${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), color, x, y + h / 2, z);
}
function ball(r, color, x = 0, y = 0, z = 0, seg = 16) {
  return mesh(geo(`s${r}:${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4))), color, x, y, z);
}
function group(...kids) { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; }
function rng(seed) {
  let h = 1779033703 ^ String(seed).length;
  for (const ch of String(seed)) { h = Math.imul(h ^ ch.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

/* ---------- furniture (each faces +z, footprint in meters) ---------- */
const MODELS = {
  sofa: (c = 0x8ad3f0) => group(box(1.8, 0.35, 0.8, c), box(1.8, 0.45, 0.22, c, 0, 0.3, -0.29), box(0.22, 0.32, 0.8, c, -0.79, 0.3), box(0.22, 0.32, 0.8, c, 0.79, 0.3),
    box(0.7, 0.12, 0.55, 0xffffff, -0.42, 0.35, 0.06), box(0.7, 0.12, 0.55, 0xffffff, 0.42, 0.35, 0.06)),
  armchair: (c = 0xff8fa3) => group(box(0.8, 0.35, 0.75, c), box(0.8, 0.45, 0.2, c, 0, 0.3, -0.28), box(0.16, 0.3, 0.75, c, -0.32, 0.3), box(0.16, 0.3, 0.75, c, 0.32, 0.3)),
  chair: (c = 0xc98f5e) => group(box(0.42, 0.06, 0.42, c, 0, 0.42), box(0.42, 0.45, 0.06, c, 0, 0.45, -0.18), ...legs(0.36, 0.36, 0.42, 0x8a5a3a)),
  table: (c = 0xc98f5e) => group(box(1.2, 0.08, 0.8, c, 0, 0.68), ...legs(1.05, 0.65, 0.68, 0x8a5a3a)),
  coffeetable: (c = 0xc98f5e) => group(box(1.0, 0.07, 0.55, c, 0, 0.36), ...legs(0.85, 0.42, 0.36, 0x8a5a3a), box(0.2, 0.05, 0.14, 0xffd447, 0.2, 0.43, 0.05)),
  sidetable: (c = 0xc98f5e) => group(box(0.45, 0.5, 0.4, c), box(0.12, 0.03, 0.02, 0xffffff, 0, 0.32, 0.21)),
  desk: (c = 0xd9b088) => group(box(1.3, 0.07, 0.65, c, 0, 0.72), box(0.4, 0.72, 0.6, c, 0.42, 0), ...legs(1.15, 0.5, 0.72, 0x8a5a3a).slice(0, 2), box(0.5, 0.32, 0.04, 0x37474f, -0.15, 0.82, -0.18)),
  tv: () => group(box(1.4, 0.45, 0.4, 0xc98f5e), box(1.1, 0.62, 0.06, 0x2d3b36, 0, 0.5, -0.05), box(1.0, 0.52, 0.02, 0x6fa8c9, 0, 0.55, -0.01)),
  bed: (c = 0xc9b7e6) => group(box(1.5, 0.3, 2.0, 0xc98f5e), box(1.4, 0.2, 1.9, 0xffffff, 0, 0.3), box(1.42, 0.08, 1.2, c, 0, 0.48, 0.35),
    box(0.55, 0.14, 0.32, 0xffffff, -0.33, 0.5, -0.7), box(0.55, 0.14, 0.32, 0xffffff, 0.33, 0.5, -0.7), box(1.5, 0.75, 0.1, 0xb07a4f, 0, 0, -1.0)),
  crib: (c = 0xffffff) => group(box(0.7, 0.5, 1.2, c), box(0.62, 0.1, 1.12, 0xbfe2ef, 0, 0.5), box(0.7, 0.4, 0.04, c, 0, 0.6, -0.58), box(0.7, 0.4, 0.04, c, 0, 0.6, 0.58)),
  dresser: (c = 0xe8c9a0) => group(box(1.1, 0.85, 0.5, c), ...[0.18, 0.42, 0.66].map((y) => box(0.9, 0.03, 0.02, 0x8a5a3a, 0, y, 0.26))),
  wardrobe: (c = 0xe8c9a0) => group(box(1.0, 1.7, 0.55, c), box(0.02, 1.5, 0.02, 0x8a5a3a, 0, 0.1, 0.28)),
  bookshelf: (c = 0xc98f5e) => {
    const g = group(box(0.9, 1.6, 0.35, c));
    [0.25, 0.75, 1.25].forEach((y, row) => { let x = -0.36; for (let i = 0; i < 6; i++) { const w = 0.08 + (i % 3) * 0.02; g.add(box(w, 0.32, 0.25, ACCENT[(i + row) % ACCENT.length], x + w / 2, y, 0.03)); x += w + 0.03; } });
    return g;
  },
  fridge: () => group(box(0.75, 1.75, 0.7, 0xf4f7f8), box(0.04, 0.4, 0.04, 0x9aa5ad, 0.28, 1.1, 0.37), box(0.04, 0.3, 0.04, 0x9aa5ad, 0.28, 0.5, 0.37), box(0.75, 0.02, 0.71, 0xd6dde1, 0, 1.0)),
  counter: (len = 2.2) => group(box(len, 0.85, 0.65, 0xffffff), box(len + 0.04, 0.06, 0.69, 0xd9b088, 0, 0.85), ...Array.from({ length: Math.round(len / 0.55) }, (_, i) => box(0.04, 0.12, 0.02, 0x9aa5ad, -len / 2 + 0.28 + i * 0.55, 0.6, 0.33))),
  stove: () => group(box(0.75, 0.85, 0.65, 0xf4f7f8), box(0.75, 0.04, 0.65, 0x37474f, 0, 0.85), ...[[-0.18, -0.15], [0.18, -0.15], [-0.18, 0.15], [0.18, 0.15]].map(([x, z]) => cyl(0.1, 0.1, 0.02, 0x546e7a, x, 0.89, z)), box(0.6, 0.35, 0.02, 0x37474f, 0, 0.25, 0.33)),
  sink: () => group(box(0.9, 0.85, 0.6, 0xffffff), box(0.94, 0.05, 0.64, 0xd9b088, 0, 0.85), box(0.55, 0.03, 0.38, 0xa8c7d6, 0, 0.88), cyl(0.025, 0.025, 0.25, 0x9aa5ad, 0, 0.9, -0.22)),
  toilet: () => group(cyl(0.18, 0.15, 0.4, 0xffffff, 0, 0, 0.08), box(0.45, 0.45, 0.18, 0xffffff, 0, 0.25, -0.2), cyl(0.2, 0.2, 0.05, 0xf4f7f8, 0, 0.4, 0.08)),
  bathtub: () => group(box(1.6, 0.55, 0.8, 0xffffff), box(1.4, 0.03, 0.6, 0x9fd8ef, 0, 0.5), cyl(0.03, 0.03, 0.2, 0x9aa5ad, -0.7, 0.55, 0)),
  vanity: () => group(box(0.9, 0.8, 0.5, 0xe8c9a0), box(0.5, 0.03, 0.32, 0xa8c7d6, 0, 0.82), box(0.7, 0.6, 0.03, 0xdff3fb, 0, 1.15, -0.24)),
  washer: (c = 0xf4f7f8) => group(box(0.65, 0.85, 0.65, c), cylDoor(0x9fd8ef, 0.45), box(0.5, 0.06, 0.04, 0x9aa5ad, 0, 0.75, 0.33)),
  rug: (c = 0xff8fa3) => group(mesh(geo('rug', () => new THREE.CylinderGeometry(0.9, 0.9, 0.02, 28)), c, 0, 0.01, 0)),
  rainbowrug: () => group(...[0xff8fa3, 0xffb36b, 0xffd447, 0x9bd6a3, 0x8ad3f0].map((c, i) => mesh(geo(`rr${i}`, () => new THREE.CylinderGeometry(1.0 - i * 0.17, 1.0 - i * 0.17, 0.02, 30)), c, 0, 0.01 + i * 0.004, 0))),
  plant: (s = 1) => group(cyl(0.16 * s, 0.12 * s, 0.28 * s, 0xd98c5f), ball(0.24 * s, 0x6cbf7b, 0, 0.45 * s, 0), ball(0.17 * s, 0x5aae6a, 0.12 * s, 0.6 * s, 0.05 * s), ball(0.15 * s, 0x7ccc8a, -0.12 * s, 0.58 * s, -0.04 * s)),
  tree: () => group(cyl(0.22, 0.18, 0.35, 0xd98c5f), cyl(0.05, 0.06, 0.9, 0x8a5a3a, 0, 0.3), ball(0.42, 0x6cbf7b, 0, 1.3), ball(0.3, 0x5aae6a, 0.25, 1.1, 0.1), ball(0.28, 0x7ccc8a, -0.22, 1.15, -0.08)),
  lamp: () => group(cyl(0.15, 0.18, 0.04, 0x8a5a3a), cyl(0.025, 0.025, 1.3, 0x8a5a3a), cyl(0.16, 0.25, 0.28, 0xfff1b8, 0, 1.25)),
  toys: () => group(box(0.5, 0.35, 0.35, 0xffb36b), box(0.14, 0.14, 0.14, 0x8ad3f0, -0.32, 0, 0.25), box(0.12, 0.12, 0.12, 0xff8fa3, 0.3, 0, 0.3), ball(0.08, 0xffd447, 0.05, 0.08, 0.32)),
  basket: (c = 0xd9b088) => group(cyl(0.24, 0.2, 0.32, c), cyl(0.2, 0.2, 0.06, 0xffffff, 0, 0.3)),
  car: (c = 0xff8fa3) => group(box(1.7, 0.5, 3.4, c, 0, 0.2), box(1.4, 0.45, 1.7, c, 0, 0.7, -0.2), box(1.42, 0.35, 1.5, 0xbfe2ef, 0, 0.75, -0.2),
    ...[[-0.8, 1.1], [0.8, 1.1], [-0.8, -1.1], [0.8, -1.1]].map(([x, z]) => wheel(x, z))),
  piano: () => group(box(1.3, 1.0, 0.5, 0x2d3b36), box(1.3, 0.05, 0.25, 0xffffff, 0, 0.72, 0.36), box(1.3, 0.05, 0.06, 0x2d3b36, 0, 0.77, 0.36), box(0.6, 0.45, 0.3, 0x2d3b36, 0, 0, 0.75)),
  clock: () => group(box(0.4, 0.45, 0.18, 0xc98f5e), faceDisc(0xffffff, 0.14, 0.25, 0.1)),
  books: () => group(box(0.35, 0.08, 0.25, 0xff8fa3), box(0.32, 0.07, 0.24, 0x8ad3f0, 0.01, 0.08), box(0.34, 0.08, 0.25, 0xffd447, -0.01, 0.15)),
  tank: () => group(box(0.9, 0.45, 0.4, 0xc98f5e), mesh(geo('tank', () => new THREE.BoxGeometry(0.85, 0.5, 0.36)), 0x9fd8ef, 0, 0.7, 0, { transparent: true, opacity: 0.55 }), ball(0.06, 0xffb36b, -0.15, 0.75, 0.05), ball(0.05, 0xff8fa3, 0.2, 0.65, -0.05)),
  globe: () => group(cyl(0.1, 0.13, 0.05, 0x8a5a3a), cyl(0.015, 0.015, 0.2, 0x8a5a3a), ball(0.16, 0x6fb7e0, 0, 0.36), ball(0.07, 0x7ccc8a, 0.08, 0.42, 0.1)),
  chime: () => group(cyl(0.015, 0.015, 1.6, 0x8a5a3a), ...[-0.08, 0, 0.08].map((x, i) => cyl(0.02, 0.02, 0.25 - i * 0.04, ACCENT[i], x, 1.2))),
  fort: () => group(mesh(geo('fort', () => new THREE.ConeGeometry(0.8, 1.0, 4)), 0xc9b7e6, 0, 0.5, 0), box(0.4, 0.5, 0.05, 0xfff4e0, 0, 0, 0.55)),
  cabinet: (c = 0xe8c9a0) => group(box(1.0, 0.9, 0.45, c), box(0.02, 0.6, 0.02, 0x8a5a3a, -0.05, 0.15, 0.23), box(0.02, 0.6, 0.02, 0x8a5a3a, 0.05, 0.15, 0.23)),
  shelf: (c = 0xbac0c8) => group(box(1.4, 1.5, 0.45, c), box(0.3, 0.25, 0.3, 0xffb36b, -0.4, 0.3, 0.02), box(0.35, 0.25, 0.3, 0x8ad3f0, 0.3, 0.8, 0.02)),
  beanbag: (c = 0xffb36b) => { const b = ball(0.42, c, 0, 0.27, 0, 18); b.scale.y = 0.65; return group(b, ball(0.26, c, 0, 0.42, -0.14, 14)); },
  teddy: () => group(ball(0.2, 0xc98f5e, 0, 0.2, 0), ball(0.15, 0xc98f5e, 0, 0.48, 0), ball(0.06, 0xc98f5e, -0.11, 0.6, 0, 8), ball(0.06, 0xc98f5e, 0.11, 0.6, 0, 8),
    ball(0.06, 0xe8c9a0, 0, 0.45, 0.13, 8), ball(0.02, 0x2d3b36, -0.05, 0.52, 0.13, 6), ball(0.02, 0x2d3b36, 0.05, 0.52, 0.13, 6), box(0.16, 0.05, 0.05, 0xff8fa3, 0, 0.33, 0.12)),
  cactus: () => { const arm = cyl(0.05, 0.05, 0.22, 0x5aae6a, 0.13, 0.42, 0); return group(cyl(0.16, 0.12, 0.24, 0xd98c5f), cyl(0.09, 0.09, 0.55, 0x5aae6a, 0, 0.22), arm, ball(0.05, 0x5aae6a, 0.13, 0.64, 0, 8), box(0.1, 0.05, 0.05, 0x5aae6a, 0.07, 0.42, 0), ball(0.05, 0xff8fa3, 0, 0.8, 0, 8)); }
};
function legs(w, d, h, c) { return [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => box(0.06, h, 0.06, c, (sx * w) / 2, 0, (sz * d) / 2)); }
function wheel(x, z) { const w = cyl(0.3, 0.3, 0.2, 0x2d3b36, 0, 0, 0); w.rotation.z = Math.PI / 2; w.position.set(x, 0.3, z); return w; }
function cylDoor(color, y) { const d = cyl(0.22, 0.22, 0.04, color, 0, 0, 0); d.rotation.x = Math.PI / 2; d.position.set(0, y, 0.33); return d; }
function faceDisc(color, r, y, z) { const d = cyl(r, r, 0.02, color, 0, 0, 0); d.rotation.x = Math.PI / 2; d.position.set(0, y, z); return d; }

// Words Fluff saw in the photos -> a model. Unknown items are skipped rather than shown as mystery boxes.
const WORDS = [
  [/sectional|sofa|couch|loveseat|futon/, 'sofa'], [/arm ?chair|recliner|accent chair|rocking/, 'armchair'], [/coffee table|ottoman/, 'coffeetable'],
  [/night ?stand|side table|end table|bedside/, 'sidetable'], [/desk/, 'desk'], [/dining table|kitchen table|table/, 'table'], [/stool|chair/, 'chair'],
  [/tv|television|monitor|screen/, 'tv'], [/crib|bassinet/, 'crib'], [/bunk|bed/, 'bed'], [/dresser|drawers|chest/, 'dresser'], [/wardrobe|closet|armoire/, 'wardrobe'],
  [/book ?(case|shelf)|shelves|shelf/, 'bookshelf'], [/fridge|refrigerator|freezer/, 'fridge'], [/stove|oven|range|cooktop/, 'stove'],
  [/sink/, 'sink'], [/counter|island|cabinets|dishwasher/, 'counter'], [/toilet/, 'toilet'], [/tub|shower/, 'bathtub'], [/vanity|mirror/, 'vanity'],
  [/washer|dryer|washing/, 'washer'], [/rug|carpet|mat/, 'rug'], [/tree/, 'tree'], [/plant|fern|flower/, 'plant'], [/lamp|light/, 'lamp'],
  [/toy|lego|blocks|bin/, 'toys'], [/basket|hamper|laundry/, 'basket'], [/car|truck/, 'car'], [/piano|keyboard/, 'piano'], [/cabinet|sideboard|buffet|hutch/, 'cabinet']
];
function modelFor(item) { const w = String(item).toLowerCase(); const hit = WORDS.find(([re]) => re.test(w)); return hit ? hit[1] : null; }

// What a room gets when Fluff hasn't seen it yet.
const DEFAULTS = {
  living: [['rug', 'center'], ['sofa', 'back'], ['coffeetable', 'center'], ['tv', 'front'], ['plant', 'back-left'], ['lamp', 'back-right']],
  kitchen: [['counter', 'back'], ['fridge', 'back-left'], ['stove', 'back-right'], ['table', 'center'], ['chair', 'left'], ['chair', 'right']],
  bedroom: [['bed', 'back'], ['sidetable', 'back-right'], ['dresser', 'left'], ['rug', 'center'], ['lamp', 'back-left']],
  bathroom: [['bathtub', 'back'], ['toilet', 'left'], ['vanity', 'right']],
  laundry: [['washer', 'back-left'], ['washer', 'back-right'], ['basket', 'center']],
  game: [['rug', 'center'], ['sofa', 'back'], ['tv', 'front'], ['toys', 'center'], ['bookshelf', 'right']],
  kids: [['bed', 'back-left'], ['rug', 'center'], ['toys', 'center'], ['bookshelf', 'right']],
  office: [['desk', 'back'], ['chair', 'center'], ['bookshelf', 'left'], ['plant', 'right']],
  garage: [['car', 'center'], ['shelf', 'back']],
  dining: [['table', 'center'], ['chair', 'left'], ['chair', 'right'], ['cabinet', 'back']],
  patio: [['table', 'center'], ['chair', 'left'], ['chair', 'right'], ['plant', 'back-left'], ['plant', 'back-right']],
  other: [['rug', 'center'], ['plant', 'back-left']]
};

// Furniture the household hasn't earned yet shows as a see-through outline with dashed edges.
const GHOST_FILL = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false });
const GHOST_LINE = new THREE.LineDashedMaterial({ color: 0x6f8f80, dashSize: 0.07, gapSize: 0.05, transparent: true, opacity: 0.85 });
const EDGES = new Map();
function ghostify(obj, info) {
  const lines = [];
  obj.traverse((o) => {
    o.userData.ghost = info;
    if (!o.isMesh) return;
    o.material = GHOST_FILL; o.castShadow = false; o.receiveShadow = false;
    if (!EDGES.has(o.geometry)) EDGES.set(o.geometry, new THREE.EdgesGeometry(o.geometry, 30));
    const l = new THREE.LineSegments(EDGES.get(o.geometry), GHOST_LINE);
    l.computeLineDistances();
    l.raycast = () => {};
    l.userData.ghost = info;
    lines.push([o, l]);
  });
  lines.forEach(([o, l]) => o.add(l));
  return obj;
}
export const MODEL_NAMES = Object.keys(MODELS);

/* ---------- Fluff ---------- */
function makeFluff(persona) {
  const g = new THREE.Group();
  const fur = 0xd7dbe2;
  g.add(ball(0.3, fur, 0, 0.36, 0, 20));
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.add(ball(0.12, fur, Math.cos(a) * 0.27, 0.36 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.27, 12)); }
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(ball(0.11, fur, Math.cos(a) * 0.15, 0.6, Math.sin(a) * 0.15, 12)); }
  g.add(ball(0.035, 0x2d3b36, -0.09, 0.42, 0.27, 10), ball(0.035, 0x2d3b36, 0.09, 0.42, 0.27, 10));
  g.add(ball(0.04, 0xff9fb1, -0.17, 0.34, 0.24, 10), ball(0.04, 0xff9fb1, 0.17, 0.34, 0.24, 10));
  if (persona === 'sunny') { const a = mesh(geo('bow', () => new THREE.ConeGeometry(0.08, 0.16, 4)), 0xffd447); a.rotation.z = Math.PI / 2; a.position.set(0.22, 0.66, 0.08); const b = a.clone(); b.rotation.z = -Math.PI / 2; b.position.x = 0.06; g.add(a, b); }
  if (persona === 'sarge') { g.add(mesh(geo('cap', () => new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)), 0x6b8e4e, 0, 0.62, 0)); g.add(box(0.36, 0.03, 0.18, 0x4e6b38, 0, 0.62, 0.2)); }
  if (persona === 'snooze') { g.add(mesh(geo('nightcap', () => new THREE.ConeGeometry(0.2, 0.42, 16)), 0x8aa8e6, 0.02, 0.86, 0)); g.add(ball(0.06, 0xffffff, 0.1, 1.06, 0)); }
  if (persona === 'captain') { g.add(mesh(geo('hat', () => new THREE.CylinderGeometry(0.3, 0.3, 0.12, 3)), 0x2d3b36, 0, 0.7, 0).rotateY(Math.PI / 2)); }
  if (persona === 'glitz') {
    // A gold tiara, pink heart sunglasses and a feather boa.
    for (let i = -2; i <= 2; i++) { const c = mesh(geo('tiara', () => new THREE.ConeGeometry(0.045, 0.14, 4)), 0xffd447, i * 0.07, 0.72 + (2 - Math.abs(i)) * 0.03, 0.02); g.add(c); }
    g.add(box(0.36, 0.035, 0.08, 0xffd447, 0, 0.66, 0.02), ball(0.03, 0xff6fb5, 0, 0.78, 0.07, 8));
    g.add(ball(0.065, 0xff6fb5, -0.09, 0.43, 0.27, 10), ball(0.065, 0xff6fb5, 0.09, 0.43, 0.27, 10), box(0.08, 0.015, 0.02, 0xc2407e, 0, 0.44, 0.3));
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; g.add(ball(0.075, i % 2 ? 0xff8fc8 : 0xffa9d6, Math.cos(a) * 0.29, 0.2 + Math.sin(a * 3) * 0.015, Math.sin(a) * 0.29, 8)); }
  }
  g.traverse((o) => { o.userData.fluff = true; });
  return g;
}

/* ---------- the house ---------- */
export function createHouse({ onRoom, onFluff, onGhost, onPlace, onDecorTap } = {}) {
  const el = document.createElement('div');
  el.className = 'house-stage';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.appendChild(renderer.domElement);
  const labels = document.createElement('div');
  labels.className = 'house-labels';
  el.appendChild(labels);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7dcc2, 1.6));
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);
  const world = new THREE.Group();
  scene.add(world);

  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const view = { yaw: Math.PI / 4, pitch: 0.92, zoom: 1, radius: 7 };
  let fluff = null, fluffState = null, anim = [], roomCenters = [], floors = [], ghosts = [], placed = [], mode = {}, fluffKey = '';

  function placeCamera() {
    const w = el.clientWidth || 300, h = el.clientHeight || 300, a = w / h;
    // Fit the whole house (from any angle) across the narrower side of the screen.
    const need = view.radius + 0.6;
    const half = Math.max((need * 0.94) / a, need * 0.72);
    camera.left = -half * a; camera.right = half * a; camera.top = half; camera.bottom = -half;
    camera.zoom = view.zoom;
    const r = 60;
    camera.position.set(Math.sin(view.yaw) * Math.cos(view.pitch) * r, Math.sin(view.pitch) * r, Math.cos(view.yaw) * Math.cos(view.pitch) * r);
    camera.position.y += view.targetY || 0;
    camera.lookAt(0, (view.targetY || 0) + 0.4, 0);
    camera.updateProjectionMatrix();
    labelsDirty = true;
  }
  /* Labels: names where there's space, just the emoji pin where it's crowded, and nothing for rooms
     hidden under a floor above. Worked out again whenever the view moves. */
  let labelsDirty = true;
  const occRay = new THREE.Raycaster(), camDir = new THREE.Vector3();
  function layoutLabels() {
    labelsDirty = false;
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    camera.getWorldDirection(camDir);
    const placed = [];
    const overlaps = (a) => a.l < 2 || a.r > w - 2 || a.t < 2 || a.b > h - 2 || placed.some((b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b);
    const tags = [...labels.children].sort((a, b) => b._rank - a._rank);
    for (const tag of tags) {
      v.copy(tag._pos).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      // Hidden under another floor? Look from the label toward the camera for a floor in the way.
      occRay.set(tag._pos, camDir.clone().negate());
      const blocked = occRay.intersectObjects(floors, false).some((hit) => hit.object.userData.roomId !== tag._room && hit.distance > 0.05);
      let mode = 'off';
      if (!blocked && v.z < 1 && x > -20 && x < w + 20 && y > -10 && y < h + 10) {
        if (!tag._fw) { tag.classList.remove('mini'); tag._fw = tag.offsetWidth || 120; tag._h = tag.offsetHeight || 24; tag.classList.add('mini'); tag._mw = tag.offsetWidth || 34; }
        const rect = (wd, dx = 0, dy = 0) => ({ l: x + dx - wd / 2 - 3, r: x + dx + wd / 2 + 3, t: y + dy - tag._h / 2 - 2, b: y + dy + tag._h / 2 + 2, dx, dy });
        const full = rect(tag._fw);
        if (!overlaps(full)) { mode = 'full'; placed.push(full); }
        else {
          // Crowded: just the emoji pin, nudged a little if it has to be.
          const step = tag._h + 4;
          const mini = [[0, 0], [0, -step], [0, step], [-step, 0], [step, 0]].map(([dx, dy]) => rect(tag._mw, dx, dy)).find((r) => !overlaps(r));
          if (mini) { mode = 'mini'; placed.push(mini); tag._dx = mini.dx; tag._dy = mini.dy; }
        }
      }
      if (mode !== 'mini') tag._dx = tag._dy = 0;
      tag.classList.toggle('mini', mode === 'mini');
      tag.classList.toggle('off', mode === 'off');
      tag.style.transform = `translate(-50%, -50%) translate(${x + (tag._dx || 0)}px, ${y + (tag._dy || 0)}px)`;
    }
  }

  function build(model) {
    const prevFluff = fluff && fluffState ? { pos: fluff.position.clone(), state: fluffState, rot: fluff.rotation.y } : null;
    world.clear();
    anim = []; roomCenters = []; floors = []; ghosts = []; placed = [];
    labels.innerHTML = '';
    labelsDirty = true;
    mode = { decorating: !!model.decorating, placing: model.placing || null };
    labels.classList.toggle('off', mode.decorating);
    // model.locked: { modelName: info } for furniture not earned yet (drawn as ghosts). Missing = earned.
    const locked = model.locked || {};
    // Floors: "all" stacks every floor like an open dollhouse; a number shows just that floor.
    const sel = model.floor ?? 'all';
    const levelOf = (r) => r.plan.f || 0;
    const rooms = (model.rooms || []).filter((r) => sel === 'all' || levelOf(r) === sel);
    if (!rooms.length) return;
    const GAP = 2.6;
    const yOf = (r) => (sel === 'all' ? levelOf(r) * GAP : 0);
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    rooms.forEach(({ plan: p }) => { minX = Math.min(minX, p.x); minZ = Math.min(minZ, p.z); maxX = Math.max(maxX, p.x + p.w); maxZ = Math.max(maxZ, p.z + p.d); });
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ);
    const ys = rooms.map(yOf), minY = Math.min(...ys), maxY = Math.max(...ys);
    view.targetY = (minY + maxY) / 2;
    // Fit to the farthest room corner (an L-shaped house doesn't need the space of its whole bounding box).
    let far = 0;
    rooms.forEach(({ plan: p }) => [[p.x, p.z], [p.x + p.w, p.z], [p.x, p.z + p.d], [p.x + p.w, p.z + p.d]].forEach(([x, z]) => { far = Math.max(far, Math.hypot(x - cx, z - cz)); }));
    view.radius = Math.max(4.5, far, (maxY - minY) / 2 + 2.5);
    const below = rooms.filter((r) => yOf(r) < 0);
    const underground = sel !== 'all' && sel < 0;

    // Yard: grass, a stone path and a ring of trees. A basement shows as a cutaway in the lawn.
    const yardR = span * 0.7 + 3.5;
    let hole = null;
    if (below.length) {
      let a = Infinity, b = Infinity, c = -Infinity, e = -Infinity;
      below.forEach(({ plan: p }) => { a = Math.min(a, p.x - cx); b = Math.min(b, p.z - cz); c = Math.max(c, p.x + p.w - cx); e = Math.max(e, p.z + p.d - cz); });
      hole = { x0: a - 0.15, z0: b - 0.15, x1: c + 0.15, z1: e + 0.15 };
    }
    const yard = new THREE.Shape();
    yard.absarc(0, 0, yardR, 0, Math.PI * 2, false);
    if (hole) {
      const h = new THREE.Path();
      h.moveTo(hole.x0, -hole.z0); h.lineTo(hole.x1, -hole.z0); h.lineTo(hole.x1, -hole.z1); h.lineTo(hole.x0, -hole.z1); h.lineTo(hole.x0, -hole.z0);
      yard.holes.push(h);
    }
    const grass = mesh(new THREE.ExtrudeGeometry(yard, { depth: 0.4, bevelEnabled: false, curveSegments: 40 }), underground ? 0xcdb796 : GRASS, 0, -0.42, 0);
    grass.rotation.x = -Math.PI / 2;
    grass.castShadow = false;
    world.add(grass);
    if (hole) {
      // Earthy walls and a floor for the dug-out basement.
      const depth = GAP + 0.3, w = hole.x1 - hole.x0, d = hole.z1 - hole.z0, mx = (hole.x0 + hole.x1) / 2, mz = (hole.z0 + hole.z1) / 2;
      world.add(box(w, 0.2, d, 0xa98463, mx, -depth - 0.2, mz));
      [[mx, hole.z0 - 0.1, w + 0.4, 0.2], [mx, hole.z1 + 0.1, w + 0.4, 0.2], [hole.x0 - 0.1, mz, 0.2, d], [hole.x1 + 0.1, mz, 0.2, d]].forEach(([x, z, ww, dd]) => world.add(box(ww, depth - 0.02, dd, 0xb8926e, x, -depth, z)));
    }
    const rnd = rng('yard' + rooms.length);
    for (let i = 0; i < (underground ? 0 : 14); i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.3, d = yardR * (0.72 + rnd() * 0.2);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < (maxX - minX) / 2 + 1.2 && Math.abs(z) < (maxZ - minZ) / 2 + 1.2) continue;
      const t = rnd() < 0.6 ? MODELS.tree() : MODELS.plant(1.4);
      t.position.set(x, 0, z); t.scale.setScalar(1.2 + rnd() * 0.6);
      world.add(t);
    }
    for (let i = 0; i < (underground ? 0 : 18); i++) {
      const a = rnd() * Math.PI * 2, d = yardR * (0.5 + rnd() * 0.45);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.abs(x) < (maxX - minX) / 2 + 0.6 && Math.abs(z) < (maxZ - minZ) / 2 + 0.6) continue;
      world.add(ball(0.08, ACCENT[i % ACCENT.length], x, 0.06, z, 8));
    }
    for (let i = 0; i < (underground ? 0 : 4); i++) world.add(cyl(0.35, 0.35, 0.05, 0xe8e2d4, -0.3 + (i % 2) * 0.5, -0.02, (maxZ - minZ) / 2 + 0.7 + i * 0.8));

    rooms.forEach((r, ri) => {
      const p = r.plan, x0 = p.x - cx, z0 = p.z - cz, w = p.w, d = p.d;
      const g = new THREE.Group();
      const y0 = yOf(r);
      // A hair of height per room, so rooms drawn on top of each other never flicker.
      g.position.set(x0, y0 + (ri % 7) * 0.004, z0);
      world.add(g);
      const floor = box(w, 0.16, d, FLOOR[r.type] || FLOOR.other, w / 2, -0.16, d / 2);
      floor.userData.roomId = r.id;
      floors.push(floor);
      g.add(floor);
      // Low cutaway walls so you can see inside, like a dollhouse.
      // Walls sit just inside the room's edge, so two rooms that share a wall don't flicker.
      const wh = 0.75, wt = 0.12;
      if (r.type === 'patio') {
        // Outdoor spaces get deck boards and a little picket fence instead of walls.
        for (let i = 1; i < Math.floor(d / 0.5); i++) g.add(box(w - 0.1, 0.012, 0.03, 0xb8946c, w / 2, 0, i * 0.5));
        const posts = [];
        for (let x = 0.1; x <= w - 0.05; x += 0.5) posts.push([x, 0.08], [x, d - 0.08]);
        for (let z = 0.6; z <= d - 0.55; z += 0.5) posts.push([0.08, z], [w - 0.08, z]);
        posts.forEach(([px, pz]) => g.add(box(0.07, 0.42, 0.07, 0xffffff, px, 0, pz)));
        [[w / 2, 0.08, w, 0.05], [w / 2, d - 0.08, w, 0.05], [0.08, d / 2, 0.05, d], [w - 0.08, d / 2, 0.05, d]].forEach(([rx, rz, rw, rd]) => g.add(box(rw, 0.05, rd, 0xffffff, rx, 0.3, rz)));
      } else {
        // Front and back walls run the full width; side walls fit between them, and so do their caps.
        [[w / 2, wt / 2, w, wt, 1], [w / 2, d - wt / 2, w, wt, 1], [wt / 2, d / 2, wt, d - wt * 2, 0], [w - wt / 2, d / 2, wt, d - wt * 2, 0]].forEach(([wx, wz, ww, wd, across]) => {
          g.add(box(ww, wh, wd, WALL, wx, 0, wz));
          g.add(across ? box(ww + 0.002, 0.05, wd + 0.04, WALL_TOP, wx, wh, wz) : box(ww + 0.04, 0.048, Math.max(0.05, wd - 0.06), WALL_TOP, wx, wh, wz));
        });
      }

      // Furniture: what Fluff saw in the photos, or a cozy default set for the room type.
      // Each piece goes against its wall and then slides to the nearest free floor space, so nothing overlaps
      // (overlapping pieces flicker). Pieces that don't fit are left out. One rug per room.
      const seen = (r.furniture || []).map((f) => [modelFor(f.item), f.spot]).filter(([m]) => m);
      let list = seen.length ? seen : (DEFAULTS[r.type] || DEFAULTS.other);
      list = list.filter(([m], i) => m !== 'rug' || list.findIndex(([n]) => n === 'rug') === i);
      const taken = [];
      const inset = r.type === 'patio' ? 0.14 : wt + 0.03;
      const hits = (a, flat) => taken.some((b) => b.flat === flat && a.x0 < b.x1 - 0.02 && b.x0 < a.x1 - 0.02 && a.z0 < b.z1 - 0.02 && b.z0 < a.z1 - 0.02);
      const tmpBox = new THREE.Box3();
      list.forEach(([name, spot]) => {
        const make = MODELS[name];
        if (!make) return;
        if (name === 'car' && (w < 2.6 || d < 4)) return;
        const obj = name === 'counter' ? make(Math.min(2.6, w - 1.6)) : make();
        let rot = 0;
        if (spot.includes('front')) rot = Math.PI;
        if (spot === 'left') rot = Math.PI / 2;
        if (spot === 'right') rot = -Math.PI / 2;
        obj.rotation.y = rot; obj.position.set(0, 0, 0); obj.updateMatrixWorld(true);
        tmpBox.setFromObject(obj);
        const rel = { x0: tmpBox.min.x, x1: tmpBox.max.x, z0: tmpBox.min.z, z1: tmpBox.max.z };
        const fw = rel.x1 - rel.x0, fd = rel.z1 - rel.z0;
        if (fw > w - inset * 2 || fd > d - inset * 2) return; // too big for this room
        // Where it wants to be: snug against its wall, or the middle.
        let fx = w / 2 - (rel.x0 + rel.x1) / 2, fz = d / 2 - (rel.z0 + rel.z1) / 2;
        if (spot.includes('back')) fz = inset - rel.z0;
        if (spot.includes('front')) fz = d - inset - rel.z1;
        if (spot.includes('left')) fx = inset - rel.x0;
        if (spot.includes('right')) fx = w - inset - rel.x1;
        const flat = name === 'rug' || name === 'rainbowrug';
        const at = (x, z) => ({ x0: x + rel.x0, x1: x + rel.x1, z0: z + rel.z0, z1: z + rel.z1, flat });
        const lo = { x: inset - rel.x0, z: inset - rel.z0 }, hi = { x: w - inset - rel.x1, z: d - inset - rel.z1 };
        let best = null, bestD = Infinity;
        for (let x = lo.x; x <= hi.x + 1e-6; x += 0.1) for (let z = lo.z; z <= hi.z + 1e-6; z += 0.1) {
          const dd = (x - fx) ** 2 + (z - fz) ** 2;
          if (dd < bestD && !hits(at(x, z), flat)) { best = [x, z]; bestD = dd; }
        }
        if (!best) return; // no room left for it
        obj.position.set(best[0], flat ? 0.002 * taken.filter((t) => t.flat).length : 0, best[1]);
        taken.push(at(best[0], best[1]));
        // Not earned yet: a dotted outline that fills in once the household unlocks it.
        if (locked[name]) { ghostify(obj, locked[name]); if (!flat) ghosts.push(obj); }
        g.add(obj);
      });
      // Decor the family placed from the decor box (room-relative meters, quarter turns).
      (r.decor || []).forEach((it) => {
        const make = MODELS[it.m];
        if (!make) return;
        const obj = make();
        obj.position.set(Math.min(w - 0.25, Math.max(0.25, it.x)), 0.003 * (it.idx % 5), Math.min(d - 0.25, Math.max(0.25, it.z)));
        obj.rotation.y = ((it.r || 0) % 4) * (Math.PI / 2);
        obj.traverse((o) => { o.userData.decor = { roomId: r.id, idx: it.idx }; });
        placed.push(obj);
        g.add(obj);
        if (it.fresh) {
          // A little pop when something new lands.
          const t0 = performance.now() / 1000;
          anim.push(() => { const k = Math.min(1, (performance.now() / 1000 - t0) / 0.45); obj.scale.setScalar(k < 1 ? 0.2 + Math.sin(k * Math.PI * 0.75) * 1.1 : 1); });
        }
      });
      // While placing something, rooms you can drop it in glow a little.
      if (mode.placing) {
        const glow = mesh(geo(`glow${w}:${d}`, () => new THREE.PlaneGeometry(w - 0.2, d - 0.2)), 0xffe066, w / 2, 0.012, d / 2, { transparent: true, opacity: 0.28, depthWrite: false });
        glow.rotation.x = -Math.PI / 2; glow.castShadow = false; glow.receiveShadow = false;
        glow.raycast = () => {};
        g.add(glow);
        anim.push((t) => { glow.material.opacity = 0.18 + Math.abs(Math.sin(t * 2.5)) * 0.18; });
      }

      // Mess: clutter for open chores, dust bunnies when the room needs love, sparkles when it shines.
      const rr = rng(r.id);
      const clutter = Math.min(8, r.open || 0);
      for (let i = 0; i < clutter; i++) {
        const kind = i % 4, c = ACCENT[Math.floor(rr() * ACCENT.length)];
        const px = 0.5 + rr() * (w - 1), pz = 0.5 + rr() * (d - 1);
        const o = kind === 0 ? box(0.22, 0.04, 0.16, 0xffffff, px, 0.01, pz) : kind === 1 ? cyl(0.06, 0.05, 0.12, c, px, 0, pz) : kind === 2 ? box(0.14, 0.14, 0.14, c, px, 0, pz) : box(0.28, 0.06, 0.12, c, px, 0, pz);
        o.rotation.y = rr() * Math.PI;
        g.add(o);
      }
      const shine = r.shine ?? 50;
      const bunnies = shine < 20 ? 4 : shine < 40 ? 2 : 0;
      for (let i = 0; i < bunnies; i++) {
        const b = mesh(geo('bunny', () => new THREE.IcosahedronGeometry(0.13, 0)), 0x9aa1aa, 0.4 + rr() * (w - 0.8), 0.12, 0.4 + rr() * (d - 0.8), undefined);
        b.add(ball(0.025, 0x2d3b36, -0.04, 0.03, 0.11, 6), ball(0.025, 0x2d3b36, 0.04, 0.03, 0.11, 6));
        g.add(b);
        const phase = rr() * 6;
        anim.push((t) => { b.scale.set(1 + Math.sin(t * 3 + phase) * 0.08, 1 - Math.sin(t * 3 + phase) * 0.08, 1); b.rotation.y = Math.sin(t * 0.7 + phase) * 0.6; });
      }
      if (!r.open && shine >= 80) {
        for (let i = 0; i < 8; i++) {
          const s = mesh(geo('spark', () => new THREE.OctahedronGeometry(0.14, 0)), 0xffe066, 0.5 + rr() * (w - 1), 0.6 + rr() * 0.9, 0.5 + rr() * (d - 1), { emissive: 0xffd447, emissiveIntensity: 0.7 });
          s.castShadow = false;
          g.add(s);
          const phase = rr() * 6;
          anim.push((t) => { const k = 0.6 + Math.abs(Math.sin(t * 2.2 + phase)); s.scale.setScalar(k); s.rotation.y = t * 1.5 + phase; });
        }
      }

      const center = new THREE.Vector3(x0 + w / 2, y0 + 1.15, z0 + d / 2);
      const tagPos = new THREE.Vector3(x0 + w / 2, y0 + 1.6, z0 + d / 2);
      roomCenters.push({ id: r.id, center, open: r.open || 0, w, d, x0, z0, y: y0 });
      const tag = document.createElement('button');
      tag.className = 'house-tag' + (r.open ? ' has' : '') + (!r.open && shine >= 80 ? ' clean' : '');
      tag.dataset.room = r.id;
      tag.innerHTML = `<span class="e">${r.emoji || '🏠'}</span><span class="nm">${escapeHTML(r.name)}</span>${r.open ? `<b>${r.open}</b>` : ''}`;
      tag.setAttribute('aria-label', r.name + (r.open ? `, ${r.open} chores` : ''));
      tag.addEventListener('click', (e) => { e.stopPropagation(); onRoom && onRoom(r.id); });
      labels.appendChild(tag);
      tag._pos = tagPos;
      tag._room = r.id;
      tag._rank = (r.open || 0) * 100 + w * d; // busiest rooms get their names shown first
    });

    // Fluff hops to whichever room needs the most help.
    fluff = makeFluff(model.persona);
    fluff.scale.setScalar(1.5);
    world.add(fluff);
    const key = sel + '|' + rooms.map((r) => r.id + ':' + JSON.stringify(r.plan)).join(',');
    if (prevFluff && key === fluffKey) {
      // Same house, just redecorated: Fluff stays where it was.
      fluff.position.copy(prevFluff.pos); fluff.rotation.y = prevFluff.rot; fluffState = prevFluff.state;
    } else {
      const busiest = [...roomCenters].sort((a, b) => b.open - a.open)[0];
      const start = busiest ? new THREE.Vector3(busiest.center.x + Math.min(0.9, busiest.w / 4), busiest.y, busiest.center.z + Math.min(0.9, busiest.d / 4)) : new THREE.Vector3();
      fluff.position.copy(start);
      fluffState = { from: start.clone(), to: start.clone(), t0: 0, dur: 1, next: clock.getElapsedTime() + 2 };
    }
    fluffKey = key;

    sun.position.set(span * 0.6, span * 1.2 + 6 + maxY, span * 0.8);
    sun.target.position.set(0, view.targetY, 0);
    const sc = sun.shadow.camera, ext = span * 0.75 + 3;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 0.5; sc.far = span * 4 + 30;
    sc.updateProjectionMatrix();
    placeCamera();
  }

  function moveFluff(t) {
    if (!fluff || !fluffState) return;
    const s = fluffState;
    if (t > s.next && roomCenters.length) {
      // Mostly hang around rooms with open chores, sometimes wander.
      const needy = roomCenters.filter((r) => r.open);
      const pool = needy.length && Math.random() < 0.75 ? needy : roomCenters;
      const r = pool[Math.floor(Math.random() * pool.length)];
      const to = new THREE.Vector3(r.x0 + 0.6 + Math.random() * (r.w - 1.2), r.y, r.z0 + 0.6 + Math.random() * (r.d - 1.2));
      s.from = fluff.position.clone(); s.from.y = s.to.y; s.to = to; s.t0 = t;
      s.dur = Math.max(0.8, s.from.distanceTo(to) * 0.45); s.next = t + s.dur + 2.5 + Math.random() * 3;
      fluff.rotation.y = Math.atan2(to.x - s.from.x, to.z - s.from.z);
    }
    const k = Math.min(1, (t - s.t0) / s.dur);
    if (k < 1) {
      const hops = Math.max(1, Math.round(s.dur / 0.4));
      fluff.position.lerpVectors(s.from, s.to, k);
      // Hop between floors in one big bounce, small hops on the same floor.
      fluff.position.y += s.from.y !== s.to.y ? Math.sin(k * Math.PI) * 1.4 : Math.abs(Math.sin(k * Math.PI * hops)) * 0.35;
    } else {
      fluff.position.y = s.to.y + Math.abs(Math.sin(t * 2.4)) * 0.06;
    }
  }

  /* ---------- touch: drag to spin, pinch to zoom, tap a room ---------- */
  const pts = new Map();
  let gesture = null;
  const canvas = renderer.domElement;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture = { moved: 0, t: performance.now(), yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, sx: e.clientX, sy: e.clientY, dist: pinchDist() };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !gesture) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) {
      const d = pinchDist();
      if (gesture.dist) view.zoom = Math.min(3, Math.max(0.6, gesture.zoom * (d / gesture.dist)));
      gesture.moved = 99;
    } else {
      const dx = e.clientX - gesture.sx, dy = e.clientY - gesture.sy;
      gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
      view.yaw = gesture.yaw - dx * 0.008;
      view.pitch = Math.min(1.3, Math.max(0.42, gesture.pitch + dy * 0.005));
    }
    placeCamera();
  });
  const end = (e) => {
    const wasTap = gesture && pts.size === 1 && gesture.moved < 8 && performance.now() - gesture.t < 450;
    pts.delete(e.pointerId);
    if (pts.size === 1) { const [p] = pts.values(); gesture = { moved: 99, t: 0, yaw: view.yaw, pitch: view.pitch, zoom: view.zoom, sx: p.x, sy: p.y, dist: 0 }; }
    if (wasTap && e.type === 'pointerup') tap(e);
    if (!pts.size) gesture = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.zoom = Math.min(3, Math.max(0.6, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); placeCamera(); }, { passive: false });
  function pinchDist() { if (pts.size < 2) return 0; const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  const ray = new THREE.Raycaster();
  function tap(e) {
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const floorHit = ray.intersectObjects(floors, false)[0];
    if (mode.decorating) {
      // Decorating: tap a placed piece to turn or put it away; with a piece picked, tap a floor to place it.
      const d = !mode.placing && ray.intersectObjects(placed, true)[0];
      if (d) { onDecorTap && onDecorTap(d.object.userData.decor.roomId, d.object.userData.decor.idx); return; }
      if (floorHit && onPlace) {
        const local = floorHit.object.parent.worldToLocal(floorHit.point.clone());
        onPlace(floorHit.object.userData.roomId, Math.round(local.x * 100) / 100, Math.round(local.z * 100) / 100);
      }
      return;
    }
    if (fluff && ray.intersectObject(fluff, true).length) { onFluff && onFluff(); fluffState.next = 0; return; }
    const gh = ray.intersectObjects(ghosts, true)[0];
    if (gh && onGhost && (!floorHit || gh.distance <= floorHit.distance + 0.01)) { onGhost(gh.object.userData.ghost, floorHit && floorHit.object.userData.roomId); return; }
    if (floorHit && onRoom) onRoom(floorHit.object.userData.roomId);
  }

  /* ---------- loop ---------- */
  let raf = 0;
  const clock = new THREE.Clock();
  const v = new THREE.Vector3();
  function frame() {
    raf = 0;
    if (!el.isConnected) return; // paused while the House tab isn't showing
    const t = clock.getElapsedTime();
    anim.forEach((f) => f(t));
    moveFluff(t);
    renderer.render(scene, camera);
    if (labelsDirty) layoutLabels();
    raf = requestAnimationFrame(frame);
  }
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    canvas.style.width = '100%'; canvas.style.height = '100%';
    placeCamera();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);

  return {
    el,
    update(model) { build(model); resize(); },
    start() { resize(); if (!raf) raf = requestAnimationFrame(frame); },
    // Where a room's floor center is on screen (used by tests and hints).
    screenOf(id) { const r = roomCenters.find((c) => c.id === id); if (!r) return null; v.set(r.x0 + r.w / 2, r.y, r.z0 + r.d / 2).project(camera); const b = canvas.getBoundingClientRect(); return { x: b.left + ((v.x + 1) / 2) * b.width, y: b.top + ((1 - v.y) / 2) * b.height }; },
    resetView() { Object.assign(view, { yaw: Math.PI / 4, pitch: 0.92, zoom: 1 }); placeCamera(); },
    dispose() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.remove(); }
  };
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
