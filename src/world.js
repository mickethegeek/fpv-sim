// The flying field as plain data + collision test. No DOM, no three.js (scene.js draws it).
// World frame: Y up, the quad starts at the origin facing -Z ("north"). Units: metres.

import { createCourse, gateHit } from './course.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

export const FIELD_SIZE = 600;        // m, side of the mown field; beyond it is rough grass
export const QUAD_RADIUS = 0.18;      // m, collision sphere around the quad

// Keep-clear zones (x, z, radius): the start pad, the gate course, and its last turn back past the pad.
const CLEAR = [[0, 0, 14], [0, -70, 62], [20, -2, 30]];

export function createWorld(seed = 7) {
  const r = rng(seed);
  const clear = (x, z, pad) => CLEAR.every(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) > cr + pad);
  const trees = [];
  let guard = 0;
  while (trees.length < 70 && guard++ < 5000) {
    const x = (r() - 0.5) * FIELD_SIZE * 0.95, z = (r() - 0.5) * FIELD_SIZE * 0.95;
    const height = 6 + r() * 8, crown = 1.6 + r() * 1.8;
    if (!clear(x, z, crown + 2)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 7)) continue;
    trees.push({ x, z, height, crown, trunk: 0.25, shade: r() });
  }
  // A row of trees along the far (north) edge for a horizon reference.
  for (let i = -6; i <= 6; i++) trees.push({ x: i * 22, z: -150 - (i % 2) * 6, height: 11 + (i * i % 4), crown: 3, trunk: 0.3, shade: 0.5 });

  // Poles: 5 m tall, red/white band every metre: a ruler you can fly past.
  const poles = [[-10, -12], [10, -12], [-10, -40], [10, -40], [-30, 0], [30, 0], [0, 25], [-45, -70], [45, -70]]
    .map(([x, z]) => ({ x, z, height: 5, radius: 0.08 }));

  // Buildings: axis-aligned boxes (centre x/z, size w/h/d).
  const buildings = [
    { x: 75, z: -30, w: 14, h: 6, d: 24, color: 0xb5553c, roof: 0x5a5f66 },   // barn
    { x: 75, z: 5, w: 8, h: 3.2, d: 8, color: 0xd9d4c7, roof: 0x5a5f66 },     // shed
    { x: -80, z: -95, w: 10, h: 18, d: 10, color: 0xc9ccd1, roof: 0x70757d }, // tower
    { x: -70, z: 40, w: 20, h: 4, d: 10, color: 0xd9c9a0, roof: 0x8a4b3a },   // clubhouse
  ];

  const course = createCourse();
  const world = { trees, poles, buildings, course, gates: course.gates, start: { x: 0, z: 0 } };
  world.hit = (pos, radius = QUAD_RADIUS) => hit(world, pos, radius);
  return world;
}

// Does a sphere at pos touch any obstacle? Returns 'gate' | 'tree' | 'pole' | 'building' | null.
export function hit(world, pos, radius = QUAD_RADIUS) {
  const [x, y, z] = pos;
  for (const g of world.gates) {
    if (Math.abs(x - g.x) + Math.abs(z - g.z) < g.w + 2 && gateHit(g, pos, radius)) return 'gate';
  }
  for (const b of world.buildings) {
    if (y - radius < b.h && Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) return 'building';
  }
  for (const p of world.poles) {
    if (y - radius < p.height && Math.hypot(x - p.x, z - p.z) < p.radius + radius) return 'pole';
  }
  for (const t of world.trees) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d > t.crown + radius) continue;
    const crownBase = t.height * 0.35;
    if (y < crownBase) { if (d < t.trunk + radius) return 'tree'; continue; }
    if (y - radius > t.height) continue;
    // Crown is a cone from crownBase (full radius) to the tip.
    const rAt = t.crown * Math.max(0, 1 - (y - crownBase) / (t.height - crownBase));
    if (d < rAt + radius) return 'tree';
  }
  return null;
}
