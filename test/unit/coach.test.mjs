// M10 unit tests: the coaching line after a failed run, from runs flown badly on purpose on the real physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WIND, lessonById, createAttempt, attemptUpdate, attemptResult } from '../../src/lessons.js';
import { createWorld } from '../../src/world.js';
import { createSim, simSteps } from '../../src/sim.js';
import { hoverStick } from '../../src/params.js';
import { createLessonPilot, steer } from '../../src/pilot.js';
import { createRecorder, record, coachLine, driftCause, toBody, KEEP } from '../../src/coach.js';

// Fly one run of a lesson with the recorder on, as main.js does. spoil(out, sim, a) makes the flying worse.
function fly(id, { view = 'fpv', pilotOpts = {}, spoil = null } = {}) {
  const L = lessonById(id), sim = createSim({ mode: L.mode, world: createWorld() });
  sim.quad.wind = L.wind ? WIND : null;
  const a = createAttempt(L, () => 0.5), pilot = createLessonPilot(pilotOpts), rec = createRecorder();
  let sticks = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
  simSteps(sim, sticks, 5);
  for (let i = 0; i < (L.limit + 20) * 50 && a.state !== 'done' && a.state !== 'failed'; i++) {
    const s = sim.state;
    if (a.state === 'running') record(rec, { t: s.time, pos: s.pos, vel: s.vel, quat: s.quat, onGround: s.onGround }, sticks, a.step);
    attemptUpdate(a, { t: s.time, pos: s.pos, vel: s.vel, quat: s.quat, armed: sim.armed, crashed: s.crashed, onGround: s.onGround, mode: sim.mode, view });
    let out = pilot.update(s, a);
    if (spoil) out = spoil(out, sim, a) || out;
    sim.armed = out.arm && !s.crashed;
    sticks = out.sticks;
    simSteps(sim, sticks, 20);
  }
  const r = attemptResult(a), hover = hoverStick(sim.quad, sim.fcCfg);
  return { a, r, rec, sim, hover, line: coachLine(a, r, rec, { view, hover, wind: sim.quad.wind, crashedInto: sim.state.crashedInto, crashSpeed: sim.quad.crashSpeed }) };
}
const one = (line) => assert.ok(line.length > 20 && line.length < 190 && !/\n/.test(line), `one line: "${line}"`);

test('coach: a good run gets no coaching', () => {
  const x = fly('takeoff');
  assert.ok(x.r.good); assert.equal(x.line, '');
});

test('coach: a hard landing names the touchdown speed and the throttle in the last second against hover', () => {
  const x = fly('takeoff', { pilotOpts: { descend: 5 } });
  assert.ok(x.r.completed && !x.r.good, x.r.reason);
  assert.match(x.line, /^Touchdown \d\.\d m\/s \(limit 1\.5 m\/s\): throttle was at \d+ % in the last second, hover is \d+ %\./); one(x.line);
  const [, thr, hov] = x.line.match(/at (\d+) % in the last second, hover is (\d+) %/).map(Number);
  assert.ok(thr < hov, `throttle ${thr} under hover ${hov}`);
  assert.equal(hov, Math.round(x.hover * 100));
});

test('coach: landing beside the pad after holding roll says which way, how far, and which stick was held', () => {
  let t0 = null;
  const x = fly('takeoff', { spoil: (out, sim, a) => {
    if (a.step !== 1) return out;
    t0 ??= sim.state.time;
    const t = sim.state.time - t0, h = hoverStick(sim.quad, sim.fcCfg);
    if (t < 1.6) return { arm: true, sticks: { roll: 0.5, pitch: 0, yaw: 0, throttle: h } };   // hold roll right, then come down still drifting
    return { arm: !sim.state.onGround, sticks: { roll: 0, pitch: 0, yaw: 0, throttle: h * 0.75 } };
  } });
  assert.equal(x.a.reason, 'Landed off the pad');
  assert.ok(x.sim.state.pos[0] > 1.5, `landed at x ${x.sim.state.pos[0].toFixed(1)}`);
  assert.match(x.line, /^You landed \d+\.\d m to the right of the pad: you held roll right for 1\.[4-7] s and never stopped the drift\. There are no brakes: roll left briefly, then level\.$/); one(x.line);
  const said = Number(x.line.match(/landed (\d+\.\d) m/)[1]);
  assert.ok(Math.abs(said - Math.hypot(x.sim.state.pos[0], x.sim.state.pos[2])) < 0.06, 'the distance is the measured one');
});

test('coach: the same mistake seen from the ground (line of sight) with the nose toward you: "to the right" is the pilot\'s right, the stick is the quad\'s', () => {
  // Synthetic: nose toward the pilot (heading 180), quad's own right is the pilot's left. It drifts to the pilot's left with roll right held.
  const rec = createRecorder(), q = [0, 1, 0, 0]; // turned 180 deg about Y
  for (let i = 0; i <= 60; i++) record(rec, { t: i * 0.05, pos: [-i * 0.05, 1.5, 0], vel: [-1, 0, 0], quat: q, onGround: false }, { roll: 0.4, pitch: 0, yaw: 0, throttle: 0.2 }, 1);
  record(rec, { t: 3.1, pos: [-3.1, 0.05, 0], vel: [0, 0, 0], quat: q, onGround: true }, { roll: 0.4, pitch: 0, yaw: 0, throttle: 0 }, 1);
  const a = { ...createAttempt(lessonById('takeoff')), state: 'failed', reason: 'Landed off the pad', step: 1 };
  const line = coachLine(a, attemptResult(a), rec, { view: 'los', hover: 0.2 });
  assert.match(line, /^You landed 3\.1 m to the left of the pad: you were still holding roll right/); one(line);
  assert.ok(toBody(-1, 0, 180).right > 0.99);
});

test('coach: cutting the throttle high up: the crash line gives the sink rate and the throttle', () => {
  let cut = false;
  const x = fly('takeoff', { spoil: (out, sim, a) => { if (a.state !== 'running') return out; cut ||= sim.state.pos[1] > 6; return { arm: true, sticks: { roll: 0, pitch: 0, yaw: 0, throttle: cut ? 0 : 0.6 } }; } });
  
  assert.equal(x.a.reason, 'Crashed');
  assert.match(x.line, /^You hit the ground at \d+\.\d m\/s: throttle was at 0 %, hover is \d+ %\. Add throttle earlier to slow the fall\.$/); one(x.line);
  assert.ok(Number(x.line.match(/at (\d+\.\d) m\/s/)[1]) > x.sim.quad.crashSpeed);
});

test('coach: hovering above the box until the time runs out says "too high"; a wobbling hover that never holds says so', () => {
  const x = fly('takeoff', { spoil: (out, sim, a) => (a.step === 0 ? { arm: true, sticks: steer(sim.state, -sim.state.pos[0], -sim.state.pos[2], 3, 5, Math.PI / 3, false) } : out) });
  assert.equal(x.a.reason, 'Out of time');
  assert.match(x.line, /^Out of time: you were in the box 0 % of the last 10 s, mostly too high\. Bring the throttle back toward \d+ %\.$/); one(x.line);
  assert.ok(x.rec.samples.length <= KEEP * 20 + 2, 'only the last seconds are kept');
});

test('coach: disarming in the air, and a slow disarm in the emergency drill', () => {
  let x = fly('takeoff', { spoil: (out, sim) => (sim.state.time > 4 ? { arm: false, sticks: out.sticks } : out) });
  assert.match(x.line, /^You disarmed \d\.\d m up, so it dropped\./); one(x.line);
  x = fly('emergency', { pilotOpts: { disarmDelay: 1.6 } });
  assert.ok(x.r.completed && !x.r.good, `${x.a.state} ${x.r.reason}`);
  assert.match(x.line, /^Disarm reaction 1\.[5-8] s \(limit 1 s\): rest a finger on the arm button/); one(x.line);
});

test('coach: too fast in the turns lesson names the stick held at the fastest moment', () => {
  const x = fly('turns', { spoil: (out, sim, a) => { if (a.step === 0 && sim.state.time > 2 && sim.state.time < 3.4) return { arm: true, sticks: { ...out.sticks, pitch: 0.8, roll: 0 } }; return out; } });
  if (x.r.completed) { assert.match(x.line, /^Top speed \d+\.\d m\/s \(limit 8 m\/s\): just before it you held pitch forward at \d+ % of the stick\./); one(x.line); }
  else assert.ok(x.line.length > 20, x.line); // it crashed or timed out instead: still a line
  assert.ok(x.rec.peak.speed > 8, `peak ${x.rec.peak.speed.toFixed(1)} m/s`);
});

test('coach: drift with no stick held, in wind from the left: lean into the wind; without wind: tilt against the drift', () => {
  const mk = () => { const S = []; for (let i = 0; i <= 60; i++) S.push({ t: i * 0.05, pos: [i * 0.1, 2, 0], vel: [2, 0, 0], head: 0, tilt: 0, onGround: false, step: 0, roll: 0, pitch: 0, yaw: 0, throttle: 0.2 }); return S; };
  assert.match(driftCause(mk(), 1, 0, WIND), /the wind carried it.*Hold a little roll left into the wind\./);
  assert.match(driftCause(mk(), 1, 0, null), /Tilt against the drift \(roll left\) briefly, then level\./);
  // Facing right (heading 90), the wind from the left comes from behind: lean back.
  assert.match(driftCause(mk().map((p) => ({ ...p, head: 90 })), 1, 0, WIND), /Hold a little pitch back into the wind\./);
});
