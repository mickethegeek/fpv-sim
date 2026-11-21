// M1 unit tests. Each must fail on a deliberately broken model: see test/mutations.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, stepPhysics, GRAVITY, PHYSICS_HZ, attitude } from '../../src/physics.js';
import { actualRate, MODES } from '../../src/flightcontroller.js';
import { defaultQuad, defaultFc, defaultRates, DEG } from '../../src/params.js';
import { createSim, simSteps } from '../../src/sim.js';

const DT = 1 / PHYSICS_HZ;
const sticks = (o = {}) => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0, ...o });

// Airborne, armed sim at altitude.
function airborne(mode = MODES.ACRO, y = 200) {
  const sim = createSim({ mode });
  sim.state.pos[1] = y;
  sim.armed = true;
  return sim;
}

// Throttle stick that holds altitude (bisection on vertical speed after 1.5 s).
function hoverThrottle() {
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const sim = airborne(MODES.ANGLE);
    simSteps(sim, sticks({ throttle: mid }), 1500);
    if (sim.state.vel[1] > 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

test('free fall accelerates at g', () => {
  const q = defaultQuad();
  const s = createState(100);
  for (let i = 0; i < 20; i++) stepPhysics(s, [0, 0, 0, 0], DT, q);
  const a = -s.vel[1] / 0.02;
  assert.ok(Math.abs(a - GRAVITY) / GRAVITY < 0.01, `acceleration ${a}`);
  assert.ok(Math.abs(s.vel[0]) < 1e-12 && Math.abs(s.vel[2]) < 1e-12); // body drag elements cancel to rounding
});

test('hover throttle is 12 to 20 % and actually hovers', () => {
  const t = hoverThrottle();
  assert.ok(t > 0.12 && t < 0.20, `hover throttle ${t}`);
  const sim = airborne(MODES.ANGLE);
  simSteps(sim, sticks({ throttle: t }), 3000);
  assert.ok(Math.abs(sim.state.pos[1] - 200) < 0.5, `drifted to ${sim.state.pos[1]}`);
});

test('Actual rates: Betaflight defaults give 70 deg/s slope at centre and 670 deg/s at full stick', () => {
  const r = defaultRates().roll;
  assert.equal(actualRate(1, r), 670);
  assert.equal(actualRate(-1, r), -670);
  assert.ok(Math.abs(actualRate(0.01, r) / 0.01 - 70) < 7);
  assert.ok(Math.abs(actualRate(0.5, r) - (35 + 600 * 0.25)) < 1e-9);
  // expo 1: x * center + (max - center) * |x| * x^5
  assert.ok(Math.abs(actualRate(0.5, { center: 100, max: 900, expo: 1 }) - (50 + 800 * 0.5 ** 6)) < 1e-9);
});

test('full-stick roll reaches the configured max rate within 0.2 s and holds it', () => {
  const sim = airborne(MODES.ACRO);
  const thr = 0.3;
  simSteps(sim, sticks({ throttle: thr }), 200);
  simSteps(sim, sticks({ throttle: thr, roll: 1 }), 200);
  const rate02 = -sim.state.omega[2] / DEG;
  assert.ok(rate02 > 0.9 * 670 && rate02 < 1.1 * 670, `roll rate at 0.2 s: ${rate02} deg/s`);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < 300; i++) {
    simSteps(sim, sticks({ throttle: thr, roll: 1 }), 1);
    const r = -sim.state.omega[2] / DEG;
    min = Math.min(min, r); max = Math.max(max, r);
  }
  assert.ok(min > 0.95 * 670 && max < 1.05 * 670, `held rate range ${min}..${max}`);
});

test('stick directions: roll right, nose down, yaw right', () => {
  for (const [stick, axis, sign] of [['roll', 2, -1], ['pitch', 0, -1], ['yaw', 1, -1]]) {
    const sim = airborne(MODES.ACRO);
    simSteps(sim, sticks({ throttle: 0.3, [stick]: 0.5 }), 400);
    const rate = sign * sim.state.omega[axis] / DEG;
    assert.ok(Math.abs(rate - 185) < 15, `${stick} rate ${rate}, want 185`);
  }
  // Pitch forward in angle mode flies toward -Z (forward); roll right flies toward +X.
  let sim = airborne(MODES.ANGLE);
  simSteps(sim, sticks({ throttle: 0.35, pitch: 0.3 }), 1500);
  assert.ok(sim.state.vel[2] < -3, `forward velocity ${sim.state.vel[2]}`);
  sim = airborne(MODES.ANGLE);
  simSteps(sim, sticks({ throttle: 0.35, roll: 0.3 }), 1500);
  assert.ok(sim.state.vel[0] > 3, `rightward velocity ${sim.state.vel[0]}`);
});

test('angle mode: holds the commanded tilt and self-levels on release', () => {
  const sim = airborne(MODES.ANGLE);
  simSteps(sim, sticks({ throttle: 0.4, roll: 1 }), 1000);
  let att = attitude(sim.state.quat);
  assert.ok(Math.abs(att.roll / DEG - 60) < 3, `roll at full stick ${att.roll / DEG}`);
  simSteps(sim, sticks({ throttle: 0.4 }), 1000);
  att = attitude(sim.state.quat);
  assert.ok(Math.abs(att.roll / DEG) < 2 && Math.abs(att.pitch / DEG) < 2, `not level: ${att.roll / DEG}, ${att.pitch / DEG}`);
});

test('acro mode does not self-level', () => {
  const sim = airborne(MODES.ACRO);
  simSteps(sim, sticks({ throttle: 0.4, roll: 0.5 }), 300);
  simSteps(sim, sticks({ throttle: 0.4 }), 1000);
  const att = attitude(sim.state.quat);
  assert.ok(Math.abs(att.roll / DEG) > 30, `roll ${att.roll / DEG}`);
  assert.ok(Math.abs(sim.state.omega[2] / DEG) < 5, 'still rotating');
});

test('no NaN and bounded state after 60 s of random sticks', () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const sim = airborne(MODES.ACRO, 50);
  let crashes = 0, maxRate = 0;
  for (let k = 0; k < 600; k++) {
    if (k % 100 === 50) sim.mode = sim.mode === MODES.ACRO ? MODES.ANGLE : MODES.ACRO;
    const st = sticks({ roll: rnd() * 2 - 1, pitch: rnd() * 2 - 1, yaw: rnd() * 2 - 1, throttle: rnd() });
    simSteps(sim, st, 100);
    const s = sim.state;
    for (const v of [...s.pos, ...s.vel, ...s.quat, ...s.omega, ...s.motors]) assert.ok(Number.isFinite(v), `non-finite at ${k / 10} s`);
    assert.ok(Math.abs(Math.hypot(...s.quat) - 1) < 1e-9);
    assert.ok(s.pos[1] >= sim.quad.groundHeight - 1e-9, 'below ground');
    maxRate = Math.max(maxRate, Math.hypot(...s.omega) / DEG);
    if (s.crashed) { crashes++; s.crashed = false; s.pos[1] = 50; s.quat = [0, 0, 0, 1]; }
  }
  assert.ok(maxRate < 2500, `spin rate ${maxRate} deg/s`);
  assert.ok(Math.hypot(...sim.state.vel) < 80, 'speed unbounded');
});

// Level top speed: full throttle, fixed nose-down tilt, find the tilt where it neither climbs nor sinks.
export function levelTopSpeed(quad = defaultQuad()) {
  const run = (tilt) => {
    const s = createState(1e6);
    s.quat = [-Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)]; // nose down about X
    for (let i = 0; i < 20000; i++) stepPhysics(s, [1, 1, 1, 1], DT, quad);
    return s;
  };
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (run(mid).vel[1] > 0) lo = mid; else hi = mid;
  }
  const s = run((lo + hi) / 2);
  return { kmh: Math.hypot(s.vel[0], s.vel[2]) * 3.6, tiltDeg: (lo + hi) / 2 / DEG, vz: s.vel[2] };
}

test('level top speed is 120 to 160 km/h, flying forward', () => {
  const t = levelTopSpeed();
  assert.ok(t.kmh > 120 && t.kmh < 160, `top speed ${t.kmh} km/h at ${t.tiltDeg} deg`);
  assert.ok(t.vz < 0, 'not flying toward -Z');
});

test('ground: sits still disarmed, soft landing is fine, hard impact is a crash', () => {
  const sim = createSim();
  simSteps(sim, sticks(), 1000);
  assert.ok(sim.state.onGround && !sim.state.crashed);
  assert.ok(Math.abs(sim.state.pos[1] - sim.quad.groundHeight) < 1e-9);
  const q = defaultQuad();
  const soft = createState(0.5);
  for (let i = 0; i < 2000; i++) stepPhysics(soft, [0, 0, 0, 0], DT, q);
  assert.ok(!soft.crashed && soft.onGround);
  const hard = createState(30);
  for (let i = 0; i < 5000; i++) stepPhysics(hard, [0, 0, 0, 0], DT, q);
  assert.ok(hard.crashed);
});

test('takeoff from the ground in angle mode', () => {
  const sim = createSim({ mode: MODES.ANGLE });
  sim.armed = true;
  simSteps(sim, sticks({ throttle: 0 }), 500);
  assert.ok(sim.state.onGround, 'lifted off at zero throttle');
  simSteps(sim, sticks({ throttle: 0.5 }), 1000);
  assert.ok(sim.state.pos[1] > 1 && !sim.state.crashed, `height ${sim.state.pos[1]}`);
  const att = attitude(sim.state.quat);
  assert.ok(Math.abs(att.roll / DEG) < 2 && Math.abs(att.pitch / DEG) < 2);
});
