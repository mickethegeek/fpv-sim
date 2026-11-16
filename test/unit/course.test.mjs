// M4 unit tests: gates, gate collisions, lap timer, and a full lap flown by the autopilot with the real physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCourse, gateCrossing, gateHit, gateLocal, createRace, resetRace, raceUpdate, formatLap, loadBest, saveBest, GATE_W, GATE_H } from '../../src/course.js';
import { createWorld, hit } from '../../src/world.js';
import { createSim, simSteps } from '../../src/sim.js';
import { MODES } from '../../src/flightcontroller.js';
import { createAutopilot } from '../autopilot.mjs';

const course = createCourse();
// A point relative to a gate: along its flight direction, across, and height.
const at = (g, along, across = 0, y = 1.2) => [g.x + g.fwd[0] * along + g.right[0] * across, y, g.z + g.fwd[1] * along + g.right[1] * across];

test('course has 6 to 8 gates, clear of every obstacle, inside the kept-clear field', () => {
  assert.ok(course.gates.length >= 6 && course.gates.length <= 8);
  const w = createWorld();
  for (const g of course.gates) {
    for (let along = -12; along <= 12; along += 0.5) for (const across of [-1.2, 0, 1.2]) {
      assert.equal(hit(w, at(g, along, across)), null, `obstacle on the line through gate ${g.index + 1} at ${along} m`);
    }
    for (const t of w.trees) assert.ok(Math.hypot(t.x - g.x, t.z - g.z) > 8, `tree near gate ${g.index + 1}`);
    for (const p of w.poles) assert.ok(Math.hypot(p.x - g.x, p.z - g.z) > 8, `pole near gate ${g.index + 1}`);
  }
});

test('gate crossing: only through the opening and only in the right direction', () => {
  for (const g of course.gates) {
    assert.ok(Math.abs(gateCrossing(g, at(g, -1), at(g, 1)) - 0.5) < 1e-9, 'straight through the middle');
    assert.equal(gateCrossing(g, at(g, 1), at(g, -1)), -1, 'backwards');
    assert.equal(gateCrossing(g, at(g, -1, GATE_W / 2 + 0.3), at(g, 1, GATE_W / 2 + 0.3)), -1, 'past the side');
    assert.equal(gateCrossing(g, at(g, -1, 0, GATE_H + 0.5), at(g, 1, 0, GATE_H + 0.5)), -1, 'over the top');
    assert.equal(gateCrossing(g, at(g, -3), at(g, -1)), -1, 'not there yet');
    assert.ok(gateCrossing(g, at(g, -1, GATE_W / 2 - 0.1), at(g, 3, GATE_W / 2 - 0.1)) > 0, 'just inside the post');
    const l = gateLocal(g, at(g, 2, -1));
    assert.ok(Math.abs(l.along - 2) < 1e-9 && Math.abs(l.across + 1) < 1e-9);
  }
});

test('gate frame is solid, the opening is not', () => {
  const w = createWorld();
  for (const g of course.gates) {
    assert.equal(hit(w, at(g, 0, 0, 1.2)), null, 'middle of the opening');
    assert.equal(hit(w, at(g, 0, GATE_W / 2 - 0.3, 1.2)), null, 'inside, near the post');
    assert.equal(hit(w, at(g, 0, GATE_W / 2 + 0.08, 1.2)), 'gate', 'post');
    assert.equal(hit(w, at(g, 0, -GATE_W / 2 - 0.08, 0.5)), 'gate', 'other post');
    assert.equal(hit(w, at(g, 0, 0, GATE_H + 0.08)), 'gate', 'top bar');
    assert.equal(hit(w, at(g, 0, 0, GATE_H + 1)), null, 'above the gate');
    assert.equal(hit(w, at(g, 0, GATE_W / 2 + 1, 1.2)), null, 'beside the gate');
    assert.equal(hit(w, at(g, 1, GATE_W / 2 + 0.08, 1.2)), null, 'one metre past the post');
    assert.ok(gateHit(g, at(g, 0.2, GATE_W / 2 + 0.08, 1.2), 0.18), 'sphere overlaps the post from in front');
  }
});

test('lap timer: starts at gate 1, needs every gate in order, keeps the best lap', () => {
  const race = createRace(course);
  let t = 0;
  const through = (i) => { const g = course.gates[i]; const ev = raceUpdate(race, at(g, -1), at(g, 1), t, t + 0.1); t += 0.1; return ev; };
  const n = course.gates.length;
  assert.deepEqual(through(1), [], 'gate 2 first does nothing');
  assert.equal(race.running, false);
  t = 10;
  assert.equal(through(0)[0].type, 'start');
  assert.ok(race.running && race.next === 1 && Math.abs(race.lapStart - 10.05) < 1e-9, 'clock starts at the moment of crossing');
  assert.deepEqual(through(2), [], 'skipping gate 2 does not count');
  assert.equal(race.next, 1);
  assert.deepEqual(through(0), [], 'gate 1 again mid-lap does not count');
  for (let i = 1; i < n; i++) { t += 3; assert.deepEqual(through(i), [{ type: 'gate', gate: i }]); }
  assert.equal(race.next, 0);
  t = 50;
  let ev = through(0);
  assert.equal(ev[0].type, 'lap');
  assert.ok(Math.abs(ev[0].lapTime - 40) < 1e-9 && ev[0].best === true && race.best === ev[0].lapTime && race.laps === 1);
  assert.ok(race.running && race.next === 1, 'the next lap starts at once');
  // A slower second lap does not replace the best; a faster third one does.
  for (let i = 1; i < n; i++) through(i);
  t = 150; ev = through(0);
  assert.ok(ev[0].best === false && Math.abs(race.best - 40) < 1e-9 && Math.abs(race.lastLap - 100) < 1e-9);
  for (let i = 1; i < n; i++) through(i);
  t = 170; ev = through(0);
  assert.ok(ev[0].best === true && Math.abs(race.best - 20) < 1e-9 && race.laps === 3);
  // Crash/reset: lap is thrown away, best is kept.
  through(1);
  resetRace(race);
  assert.ok(!race.running && race.next === 0 && race.lapTime === 0 && Math.abs(race.best - 20) < 1e-9);
});

test('lap time formatting and best-lap storage (including blocked or corrupt storage)', () => {
  assert.equal(formatLap(83.456), '1:23.46');
  assert.equal(formatLap(9.999), '0:10.00');
  assert.equal(formatLap(59.994), '0:59.99');
  assert.equal(formatLap(null), '–:––.––');
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.equal(loadBest(course, store), null);
  assert.ok(saveBest(course, store, 41.5));
  assert.equal(loadBest(course, store), 41.5);
  mem.set([...mem.keys()][0], '{broken');
  assert.equal(loadBest(course, store), null);
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.equal(loadBest(course, blocked), null);
  assert.equal(saveBest(course, blocked, 1), false);
});

test('the course can be flown: autopilot takes off from the pad and completes two timed laps without crashing', () => {
  const world = createWorld();
  const sim = createSim({ mode: MODES.ANGLE, world });
  const race = createRace(world.course);
  const ap = createAutopilot(world.course);
  sim.armed = true;
  const laps = [];
  let prev = [...sim.state.pos], tPrev = sim.state.time;
  for (let i = 0; i < 180 * 50 && laps.length < 2 && !sim.state.crashed; i++) {
    simSteps(sim, ap.update(sim.state), 20); // sticks updated at 50 Hz
    for (const ev of raceUpdate(race, prev, sim.state.pos, tPrev, sim.state.time)) if (ev.type === 'lap') laps.push(ev.lapTime);
    prev = [...sim.state.pos]; tPrev = sim.state.time;
  }
  assert.ok(!sim.state.crashed, `crashed into ${sim.state.crashedInto} near gate ${race.next + 1} at ${sim.state.pos.map((v) => v.toFixed(1))}`);
  assert.equal(laps.length, 2, `only ${laps.length} laps in ${sim.state.time.toFixed(0)} s, stuck before gate ${race.next + 1}`);
  assert.ok(laps.every((l) => l > 20 && l < 90), `lap times ${laps.map((l) => l.toFixed(1))}`);
  console.log(`     autopilot laps: ${laps.map((l) => l.toFixed(2)).join(' s, ')} s`);
});
