// M5 unit tests: skill tasks, scoring from flight data, and unlocking by consistency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, STREAK_TO_PASS, GOOD_SCORE, HOVER_BOX, POLE_A, POLE_B, createProgress, isUnlocked, recordResult, loadProgress, saveProgress,
  createAttempt, attemptUpdate, scoreAttempt, stickJerk, SAMPLE_DT } from '../../src/skills.js';
import { createWorld } from '../../src/world.js';
import { createSim, simSteps } from '../../src/sim.js';
import { createAutopilot, createHoverPilot, createCirclePilot } from '../autopilot.mjs';

const skill = (id) => SKILLS.find((s) => s.id === id);

// Fly a skill with a pilot function (state -> sticks) on the real physics; returns the attempt and its score.
// spoil(sticks, t) lets a test make the flying worse.
function flyAttempt(id, pilot, spoil = (st) => st, maxSeconds = 200) {
  const world = createWorld();
  const sk = skill(id);
  const sim = createSim({ mode: sk.mode, world });
  const a = createAttempt(sk, world);
  sim.armed = true;
  for (let i = 0; i < maxSeconds * 50 && a.state !== 'done' && a.state !== 'failed'; i++) {
    const sticks = spoil(pilot.update(sim.state), sim.state.time);
    simSteps(sim, sticks, 20);
    attemptUpdate(a, { t: sim.state.time, pos: sim.state.pos, sticks, armed: sim.armed, crashed: sim.state.crashed });
  }
  return { a, result: scoreAttempt(a), sim };
}
const show = (r) => `${r.score} (${r.metrics.map((m) => `${m.key} ${m.value.toFixed(2)}`).join(', ')}) ${r.reason}`;

test('skills come in learning order: hover, orbit, figure 8, gates; angle before acro', () => {
  assert.deepEqual(SKILLS.map((s) => s.id), ['hover-angle', 'orbit-angle', 'figure8-angle', 'gates-angle', 'hover-acro', 'orbit-acro', 'figure8-acro', 'gates-acro']);
});

test('a skill unlocks the next one only after 3 good attempts in a row', () => {
  const p = createProgress();
  const good = { good: true, completed: true, score: 80 }, bad = { good: false, completed: true, score: 40 }, crash = { good: false, completed: false, score: 0 };
  assert.ok(isUnlocked(p, 'hover-angle') && !isUnlocked(p, 'orbit-angle'));
  recordResult(p, 'hover-angle', good); recordResult(p, 'hover-angle', good);
  assert.equal(p['hover-angle'].streak, 2);
  assert.ok(!isUnlocked(p, 'orbit-angle'), 'two in a row is not enough');
  recordResult(p, 'hover-angle', bad);
  assert.equal(p['hover-angle'].streak, 0, 'a weak attempt breaks the streak');
  recordResult(p, 'hover-angle', good); recordResult(p, 'hover-angle', good);
  recordResult(p, 'hover-angle', crash);
  assert.equal(p['hover-angle'].streak, 0, 'a crash breaks the streak');
  assert.ok(!isUnlocked(p, 'orbit-angle'), '4 good attempts but never 3 in a row');
  recordResult(p, 'hover-angle', good); recordResult(p, 'hover-angle', good);
  const r = recordResult(p, 'hover-angle', good);
  assert.ok(r.passedNow && r.streak === STREAK_TO_PASS && isUnlocked(p, 'orbit-angle') && !isUnlocked(p, 'figure8-angle'));
  recordResult(p, 'hover-angle', crash);
  assert.ok(isUnlocked(p, 'orbit-angle'), 'once passed it stays unlocked');
  assert.equal(p['hover-angle'].best, 80);
  assert.equal(p['hover-angle'].attempts, 10);
});

test('progress survives storage, and bad or blocked storage gives a fresh start', () => {
  const mem = new Map();
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const p = createProgress();
  for (let i = 0; i < 3; i++) recordResult(p, 'hover-angle', { good: true, completed: true, score: 71 });
  assert.ok(saveProgress(store, p));
  const q = loadProgress(store);
  assert.deepEqual(q, p);
  assert.ok(isUnlocked(q, 'orbit-angle'));
  mem.set([...mem.keys()][0], '{"hover-angle":{"streak":"x","passed":"yes","best":"NaN"}}');
  assert.deepEqual(loadProgress(store), createProgress(), 'junk values are ignored');
  mem.set([...mem.keys()][0], 'not json');
  assert.deepEqual(loadProgress(store), createProgress());
  const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.deepEqual(loadProgress(blocked), createProgress());
  assert.equal(saveProgress(blocked, p), false);
});

test('stick smoothness: steady sticks score near zero, a slow sweep low, twitching high', () => {
  const make = (f) => Array.from({ length: 500 }, (_, i) => ({ roll: f(i * SAMPLE_DT), pitch: 0, yaw: 0, throttle: 0.3 }));
  const steady = stickJerk(make(() => 0.2)), slow = stickJerk(make((t) => 0.3 * Math.sin(2 * Math.PI * 0.5 * t)));
  const twitchy = stickJerk(make((t) => (Math.floor(t * 5) % 2 ? 0.5 : -0.5)));
  assert.ok(steady < 1e-9 && slow > 0.5 && slow < 5 && twitchy > 40, `${steady} ${slow} ${twitchy}`);
});

test('hover: a steady hover in the box completes and scores well; a wobbly one scores lower; leaving the box restarts the 10 s', () => {
  const pilot = () => createHoverPilot(HOVER_BOX.x, HOVER_BOX.y, HOVER_BOX.z);
  const steady = flyAttempt('hover-angle', pilot());
  assert.equal(steady.a.state, 'done', steady.a.reason);
  assert.ok(steady.result.good && steady.result.score >= 85, show(steady.result));
  assert.ok(steady.a.samples.at(-1).t >= 10 && steady.a.samples.at(-1).t < 20);
  // Wobble: throttle pumped and roll rocked.
  const wobbly = flyAttempt('hover-angle', pilot(), (st, t) => ({ ...st, throttle: st.throttle + 0.15 * Math.sign(Math.sin(t * 4)), roll: st.roll + 0.35 * Math.sin(t * 5) }));
  assert.ok(wobbly.result.score < steady.result.score - 15, `steady ${show(steady.result)} / wobbly ${show(wobbly.result)}`);
  // Sitting on the ground never completes.
  const idle = flyAttempt('hover-angle', { update: () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0.06 }) }, undefined, 70);
  assert.ok(idle.a.state === 'failed' && idle.a.reason === 'Out of time' && idle.result.score === 0 && !idle.result.good);
  // Hover 8 s, leave the box, come back: needs a fresh 10 s.
  const out = createHoverPilot(HOVER_BOX.x + 4, HOVER_BOX.y, HOVER_BOX.z), back = pilot();
  const moved = flyAttempt('hover-angle', { update: (s) => (s.time > 9 && s.time < 13 ? out : back).update(s) });
  assert.equal(moved.a.state, 'done');
  assert.ok(moved.a.samples.at(-1).t > 23, `finished at ${moved.a.samples.at(-1).t}`);
});

test('orbit: one circle around the pole completes; half a circle does not', () => {
  const full = flyAttempt('orbit-angle', createCirclePilot([[POLE_A, 6, 1, 9]]));
  assert.equal(full.a.state, 'done', `${full.a.reason} ${full.a.status}`);
  assert.ok(full.result.good, show(full.result));
  const sloppy = flyAttempt('orbit-angle', createCirclePilot([[POLE_A, 6, 1, 9]]), (st, t) => ({ ...st, throttle: st.throttle + 0.12 * Math.sign(Math.sin(t * 3)), pitch: st.pitch + 0.3 * Math.sin(t * 2.5) }));
  assert.ok(sloppy.result.score < full.result.score - 10, `clean ${show(full.result)} / sloppy ${show(sloppy.result)}`);
  // Half way round, then hover: runs out of time.
  const hover = createHoverPilot(POLE_A.x - 6, 2, POLE_A.z);
  const circle = createCirclePilot([[POLE_A, 6, 1, 9]]);
  const half = flyAttempt('orbit-angle', { update: (s) => (Math.abs(circle.turned) < Math.PI * 0.9 ? circle : hover).update(s) });
  assert.ok(half.a.state === 'failed' && half.a.progress > 0.3 && half.a.progress < 0.75, `${half.a.state} ${half.a.progress}`);
});

test('figure 8: opposite ways round the two poles completes; the same way round both does not', () => {
  const eight = flyAttempt('figure8-angle', createCirclePilot([[POLE_A, 10, 1, 1.02], [POLE_B, 10, -1, 9]], { speed: 5 }));
  assert.equal(eight.a.state, 'done', `${eight.a.reason} ${eight.a.status}`);
  assert.ok(eight.a.wA * eight.a.wB < 0 && eight.result.good, show(eight.result));
  // One big oval round both poles (same direction): not a figure 8.
  const mid = { x: 0, z: -12 };
  const oval = flyAttempt('figure8-angle', createCirclePilot([[mid, 13.5, 1, 99]], { speed: 5 }), undefined, 130);
  assert.equal(oval.a.state, 'failed', oval.a.status);
});

test('gates: a clean lap completes and scores; the lap time and line are measured; a crash fails', () => {
  const world = createWorld();
  const lap = flyAttempt('gates-angle', createAutopilot(world.course));
  assert.equal(lap.a.state, 'done', lap.a.reason);
  assert.ok(lap.a.lapTime > 20 && lap.a.lapTime < 80 && lap.a.crossings.length === world.course.gates.length + 1, `${lap.a.lapTime} ${lap.a.crossings.length}`);
  assert.ok(lap.result.good && lap.result.metrics.find((m) => m.key === 'line').value < 0.8, show(lap.result));
  const slow = flyAttempt('gates-angle', createAutopilot(world.course, { speed: 4 }));
  assert.ok(slow.a.state === 'done' && slow.result.score < lap.result.score, `fast ${show(lap.result)} / slow ${show(slow.result)}`);
  const crash = flyAttempt('gates-angle', { update: () => ({ roll: 0, pitch: 0.5, yaw: 0, throttle: 0.2 }) });
  const r = crash.result;
  assert.ok(crash.a.state === 'failed' && !r.good && r.score === 0 && !r.completed, `${crash.a.state} ${crash.a.reason}`);
});

test('the same skills can be passed in acro only by flying acro: skill mode is carried on the skill', () => {
  assert.equal(skill('hover-acro').mode, 'acro');
  assert.equal(skill('gates-angle').mode, 'angle');
  assert.ok(GOOD_SCORE > 0 && GOOD_SCORE < 100);
});
