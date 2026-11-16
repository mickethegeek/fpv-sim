// M6 unit tests: the 8 lessons, flown by a test pilot on the real physics; 3-in-a-row gating; per-view progress.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, WIND, GENTLE_LANDING, lessonById, createProgress, lessonPassed, recordResult, loadProgress, saveProgress, nextLesson, isReady,
  createAttempt, attemptUpdate, attemptResult, viewKeyFor, headingDeg } from '../../src/lessons.js';
import { createWorld } from '../../src/world.js';
import { createSim, simSteps } from '../../src/sim.js';
import { createLessonPilot } from '../autopilot.mjs';

// Fly one run of a lesson. spoil(out, sim, a) lets a test make the flying worse.
export function flyLesson(id, { view = 'fpv', pilotOpts = {}, spoil = null, rng = () => 0.5 } = {}) {
  const L = lessonById(id), world = createWorld();
  const sim = createSim({ mode: L.mode, world });
  sim.quad.wind = L.wind ? WIND : null;
  const a = createAttempt(L, rng), pilot = createLessonPilot(pilotOpts);
  simSteps(sim, { roll: 0, pitch: 0, yaw: 0, throttle: 0 }, 5);
  for (let i = 0; i < (L.limit + 20) * 50 && a.state !== 'done' && a.state !== 'failed'; i++) {
    const s = sim.state;
    attemptUpdate(a, { t: s.time, pos: s.pos, vel: s.vel, quat: s.quat, armed: sim.armed, crashed: s.crashed, onGround: s.onGround, mode: sim.mode, view });
    if (a.action) { // what main.js does with a spin
      const h = (-a.action.yawDeg * Math.PI / 180) / 2, [x, y, z, w] = s.quat, sy = Math.sin(h), cy = Math.cos(h);
      s.quat = [cy * x + sy * z, cy * y + sy * w, cy * z - sy * x, cy * w - sy * y];
      a.action = null;
    }
    let out = pilot.update(s, a);
    if (spoil) out = spoil(out, sim, a) || out;
    sim.armed = out.arm && !s.crashed;
    simSteps(sim, out.sticks, 20);
  }
  return { a, r: attemptResult(a), sim };
}
const show = (x) => `${x.a.state} step ${x.a.step} "${x.a.status}" ${x.r.reason} ${x.r.metrics.map((m) => `${m.label} ${m.value.toFixed(2)}`).join(', ')} t=${x.r.time.toFixed(1)}`;

test('the 8 lessons of the plan, in order; lesson 1 carries the real-radio line; lessons 1 to 4 need both views', () => {
  assert.deepEqual(LESSONS.map((l) => l.id), ['takeoff', 'directions', 'turns', 'outback', 'wind', 'emergency', 'acro', 'ready']);
  assert.match(LESSONS[0].line, /On a real radio the throttle stays where you leave it/);
  for (const l of LESSONS.slice(0, 4)) assert.deepEqual(l.views, ['fpv', 'los']);
  assert.equal(lessonById('acro').mode, 'acro');
  assert.ok(lessonById('wind').wind && lessonById('ready').wind);
});

for (const L of LESSONS) {
  test(`lesson "${L.id}" can be flown to a good run on the real physics`, () => {
    const x = flyLesson(L.id, { view: L.views ? 'los' : 'fpv' });
    assert.ok(x.r.good, show(x));
    assert.ok(x.r.time < L.limit * 0.8, `leaves a beginner time to spare: ${show(x)}`);
  });
}

test('a hard landing finishes the lesson but is not a good run', () => {
  const x = flyLesson('takeoff', { pilotOpts: { descend: 5 } });
  assert.ok(x.r.completed && !x.r.good, show(x));
  assert.ok(x.a.touchdown > GENTLE_LANDING && /Touchdown/.test(x.r.reason), show(x));
});

test('crashing, disarming in the air and running out of time all fail the run', () => {
  let x = flyLesson('takeoff', { spoil: (o, sim) => (sim.state.time > 3 ? { sticks: { ...o.sticks, roll: 1, throttle: sim.state.time < 4.5 ? 0.9 : 0 }, arm: true } : o) });
  assert.equal(x.a.state, 'failed'); assert.equal(x.r.reason, 'Crashed');
  x = flyLesson('directions', { spoil: (o, sim) => (sim.state.time > 3 ? { sticks: o.sticks, arm: false } : o) });
  assert.equal(x.r.reason, 'Disarmed before the lesson was finished');
  x = flyLesson('takeoff', { spoil: (o, sim, a) => (a.step === 1 ? { sticks: { roll: 0, pitch: 0, yaw: 0, throttle: o.sticks.throttle }, arm: true, hold: true } : o), pilotOpts: { descend: 0 } });
  assert.equal(x.r.reason, 'Out of time', show(x));
});

test('hover facing four ways: holding the wrong heading does not count', () => {
  const x = flyLesson('directions', { spoil: (o, sim, a) => (a.step === 2 ? { sticks: { ...o.sticks, yaw: 0 }, arm: true } : o) });
  assert.equal(x.a.state, 'failed', show(x));
  assert.equal(x.a.step, 2, 'stuck at "nose toward you"');
  assert.ok(Math.abs(headingDeg(x.sim.state.quat) - 90) < 25);
});

test('figure 8: the second circle has to go the other way', () => {
  const a = createAttempt(lessonById('turns'));
  a.state = 'running'; a.step = 1; a.lastSign = 1; a.lastT = 0;
  const q = [0, 0, 0, 1];
  for (let i = 0; i <= 200; i++) { // a full circle the same way round as the first
    const ang = (i / 200) * 2 * Math.PI * 1.1;
    attemptUpdate(a, { t: i * 0.05, pos: [5 + 3 * Math.cos(ang), 2, -7 + 3 * Math.sin(ang)], vel: [0, 0, 0], quat: q, armed: true, crashed: false, onGround: false, mode: 'angle', view: 'fpv' });
  }
  assert.equal(a.step, 1); assert.match(a.status, /other way/);
});

test('fast flying spoils the slow-turns lesson', () => {
  const x = flyLesson('turns');
  assert.ok(x.r.good && x.a.maxSpeed > 2 && x.a.maxSpeed < 8, show(x));
  x.a.maxSpeed = 9; // the same run, had it touched 9 m/s
  const r = attemptResult(x.a);
  assert.ok(r.completed && !r.good && /Top speed 9\.0 m\/s \(limit 8 m\/s\)/.test(r.reason), r.reason);
});

test('disarm drill: a slow reaction is measured and is not a good run; disarming early fails', () => {
  let x = flyLesson('emergency', { pilotOpts: { disarmDelay: 1.6 } });
  assert.ok(x.r.completed && !x.r.good && x.a.reaction > 1.5 && x.a.reaction < 1.8, show(x));
  x = flyLesson('emergency', { spoil: (o, sim, a) => (a.step === 0 && sim.state.time > 1.5 && !a.prompt ? { sticks: o.sticks, arm: false } : o) });
  assert.equal(x.r.reason, 'Disarmed before the call', show(x));
});

test('light wind pushes a hands-off hover downwind; none without wind', () => {
  const drift = (wind) => {
    const sim = createSim({ world: createWorld() });
    sim.quad.wind = wind; sim.armed = true;
    for (let i = 0; i < 300; i++) simSteps(sim, { roll: 0, pitch: 0, yaw: 0, throttle: i < 40 ? 0.6 : 0.33 }, 20);
    return sim.state;
  };
  const calm = drift(null), windy = drift(WIND);
  assert.ok(Math.abs(calm.pos[0]) < 0.05, `calm drift ${calm.pos[0]}`);
  assert.ok(windy.pos[0] > 3 && windy.vel[0] > 0.5 && windy.vel[0] <= WIND[0] + 1e-6, `windy drift ${windy.pos[0].toFixed(2)} m, ${windy.vel[0].toFixed(2)} m/s`);
});

test('a lesson is passed only after 3 good runs in a row, in every view it asks for', () => {
  const p = createProgress(), L = lessonById('takeoff'), good = { good: true }, bad = { good: false };
  assert.equal(nextLesson(p).id, 'takeoff');
  recordResult(p, L, 'fpv', good); recordResult(p, L, 'fpv', good);
  recordResult(p, L, 'fpv', bad);
  assert.equal(p.takeoff.fpv.streak, 0, 'a bad run resets the streak');
  for (let i = 0; i < 2; i++) recordResult(p, L, 'fpv', good);
  assert.ok(!p.takeoff.fpv.passed);
  let r = recordResult(p, L, 'fpv', good);
  assert.ok(r.passedView && !r.passedLesson && nextLesson(p).id === 'takeoff', 'FPV alone is not enough');
  for (let i = 0; i < 2; i++) recordResult(p, L, 'los', good);
  r = recordResult(p, L, 'los', good);
  assert.ok(r.passedLesson && lessonPassed(p, L));
  assert.equal(nextLesson(p).id, 'directions');
  recordResult(p, L, 'los', bad);
  assert.ok(lessonPassed(p, L), 'a later bad run does not un-pass a lesson');
  assert.equal(viewKeyFor(L, 'chase'), null); assert.equal(viewKeyFor(lessonById('wind'), 'chase'), 'any');
});

test('the Ready check needs one good run and gives the badge only when everything is passed', () => {
  const p = createProgress();
  for (const l of LESSONS.slice(0, 7)) for (const k of Object.keys(p[l.id])) p[l.id][k].passed = true;
  assert.ok(nextLesson(p).id === 'ready' && !isReady(p));
  const r = recordResult(p, lessonById('ready'), 'any', { good: true });
  assert.ok(r.passedLesson && isReady(p) && nextLesson(p) === null);
});

test('progress survives storage, bad storage and junk', () => {
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const p = createProgress();
  recordResult(p, lessonById('takeoff'), 'los', { good: true });
  assert.ok(saveProgress(storage, p));
  assert.deepEqual(loadProgress(storage), p);
  mem.set('fpvsim.lessons.v1', '{"takeoff":{"fpv":{"streak":99,"passed":"yes"}},"x":1}');
  const j = loadProgress(storage);
  assert.equal(j.takeoff.fpv.streak, 3); assert.equal(j.takeoff.fpv.passed, false);
  assert.deepEqual(loadProgress({ getItem() { throw new Error('blocked'); } }), createProgress());
  assert.equal(saveProgress({ setItem() { throw new Error('full'); } }, p), false);
});
