// M3 unit tests: the field layout and obstacle collisions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, hit } from '../../src/world.js';
import { createSim, simSteps } from '../../src/sim.js';
import { MODES } from '../../src/flightcontroller.js';

test('world is deterministic and leaves the start and the course area clear', () => {
  const a = createWorld(), b = createWorld();
  assert.deepEqual(a.trees, b.trees);
  assert.ok(a.trees.length > 50 && a.poles.length >= 6 && a.buildings.length >= 3);
  for (let z = 10; z >= -125; z -= 1) for (let x = -8; x <= 8; x += 2) {
    if (a.poles.some((p) => Math.hypot(p.x - x, p.z - z) < 1)) continue;
    assert.equal(hit(a, [x, 1.5, z]), null, `obstacle at ${x}, ${z}`);
  }
  for (const t of a.trees) assert.ok(Math.hypot(t.x, t.z + 70) > 62 || t.z < -140, 'tree inside the course area');
});

test('collisions: building, pole, tree trunk and crown; clear above and beside', () => {
  const w = createWorld();
  const b = w.buildings[0];
  assert.equal(hit(w, [b.x, b.h / 2, b.z]), 'building');
  assert.equal(hit(w, [b.x - b.w / 2 - 0.1, 1, b.z]), 'building', 'touching the wall');
  assert.equal(hit(w, [b.x, b.h + 1, b.z]), null, 'over the roof');
  assert.equal(hit(w, [b.x - b.w / 2 - 1, 1, b.z]), null, 'beside the wall');
  const p = w.poles[0];
  assert.equal(hit(w, [p.x + 0.1, 2, p.z]), 'pole');
  assert.equal(hit(w, [p.x, p.height + 1, p.z]), null);
  assert.equal(hit(w, [p.x + 1, 2, p.z]), null);
  const t = w.trees[0];
  assert.equal(hit(w, [t.x, 1, t.z]), 'tree', 'trunk');
  assert.equal(hit(w, [t.x + t.crown * 0.7, 1, t.z]), null, 'under the crown, beside the trunk');
  assert.equal(hit(w, [t.x + t.crown * 0.5, t.height * 0.4, t.z]), 'tree', 'crown');
  assert.equal(hit(w, [t.x, t.height + 1, t.z]), null, 'above the tree');
});

test('flying into a pole crashes the quad; the same flight without the world does not', () => {
  const fly = (world) => {
    const sim = createSim({ mode: MODES.ANGLE, world });
    sim.armed = true;
    sim.state.pos = [0.02, 3, 0];
    // Pole at (0, 25) is behind the start: pull back (pitch < 0) to fly toward +Z.
    for (let i = 0; i < 8 && !sim.state.crashed; i++) simSteps(sim, { roll: 0, pitch: -0.3, yaw: 0, throttle: 0.315 }, 1000);
    return sim.state;
  };
  const s = fly(createWorld());
  assert.ok(s.crashed && s.crashedInto === 'pole', `crashed=${s.crashed} into ${s.crashedInto} at z=${s.pos[2]}`);
  assert.ok(Math.abs(s.pos[2] - 25) < 0.5);
  const free = fly(null);
  assert.ok(!free.crashed && free.pos[2] > 30, `z=${free.pos[2]}`);
});
