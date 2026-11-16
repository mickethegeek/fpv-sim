// The theory demos, flown on the real physics in the real world: each one shows what its card says.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMOS, demoHelpers, runDemo } from '../../src/demos.js';
import { allCards } from '../../src/theory.js';
import { setPilotQuad } from '../../src/pilot.js';
import { createSim, simSteps } from '../../src/sim.js';
import { createWorld } from '../../src/world.js';
import { attitude } from '../../src/physics.js';
import { buildConfig, defaultTuning } from '../../src/tuning.js';
import { WIND, headingDeg } from '../../src/lessons.js';
import { DEG } from '../../src/params.js';

// Fly one loop of a demo; returns samples every 0.1 s: { t, pos, vel, tilt (deg), roll (deg), heading, crashed }.
function fly(id, preset = 'trainer') {
  const def = DEMOS[id], cfg = buildConfig(defaultTuning(preset));
  const sim = createSim({ mode: def.mode || 'angle', world: createWorld() });
  Object.assign(sim.quad, cfg.quad); Object.assign(sim.fcCfg, cfg.fc);
  sim.quad.wind = def.wind ? WIND : null;
  setPilotQuad(sim.quad, sim.fcCfg);
  const [x, y, z, yaw = 0] = def.start, hy = (-yaw * DEG) / 2;
  sim.state.pos = [x, y, z]; sim.state.quat = [0, Math.sin(hy), 0, Math.cos(hy)];
  const h = demoHelpers(sim.quad, sim.fcCfg), out = [];
  for (let i = 0; i < Math.round(def.loop * 100); i++) {
    const r = runDemo(def, sim.state, h);
    sim.armed = r.arm && !sim.state.crashed;
    simSteps(sim, r.sticks, 10);
    if (i % 10 === 9) {
      const s = sim.state, a = attitude(s.quat);
      out.push({ t: s.time, pos: [...s.pos], vel: [...s.vel], roll: a.roll / DEG, tilt: Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (s.quat[0] ** 2 + s.quat[2] ** 2)))) / DEG, heading: headingDeg(s.quat), crashed: s.crashed, onGround: s.onGround });
    }
  }
  return out;
}
const at = (run, t) => run.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b));

test('demos: every card has a demo, and every demo flies its loop without crashing or leaving the field (both quads)', () => {
  for (const card of allCards()) assert.ok(DEMOS[card.demo], `card ${card.id}: no demo "${card.demo}"`);
  for (const preset of ['trainer', 'freestyle']) for (const id of Object.keys(DEMOS)) {
    const run = fly(id, preset), end = run[run.length - 1];
    assert.ok(run.every((p) => p.pos.every(Number.isFinite)), `${id} (${preset}): not a number`);
    if (id !== 'failsafe-drop') assert.ok(!end.crashed, `${id} (${preset}): crashed at ${(run.find((p) => p.crashed) || end).t.toFixed(1)} s, ${end.pos.map((v) => v.toFixed(1))}`);
    assert.ok(run.every((p) => Math.hypot(p.pos[0], p.pos[2]) < 45 && p.pos[1] < 15), `${id} (${preset}): left the field`);
  }
});

test('demos: tilting with the same throttle sinks; with throttle added it holds height', () => {
  const run = fly('tilt-sink');
  assert.ok(at(run, 2.6).pos[1] < 4.4, `sank to ${at(run, 2.6).pos[1].toFixed(2)} m`);
  const second = run.filter((p) => p.t > 5 && p.t < 6.6).map((p) => p.pos[1]);
  assert.ok(Math.min(...second) > 4.5 && Math.max(...second) < 5.5, `second pass ${Math.min(...second).toFixed(2)} to ${Math.max(...second).toFixed(2)} m`);
});

test('demos: no brakes (it keeps gliding); tilting back stops it', () => {
  const coast = fly('coast'), stop = fly('stop-distance');
  assert.ok(at(coast, 4.3).vel[0] > 1 && at(coast, 6.4).vel[0] > 0.3, `still gliding at ${at(coast, 4.3).vel[0].toFixed(1)} m/s two seconds after levelling, ${at(coast, 6.4).vel[0].toFixed(1)} m/s after four`);
  assert.ok(Math.abs(at(stop, 3.3).vel[0]) < 0.5, `stopped: ${at(stop, 5).vel[0].toFixed(2)} m/s`);
  assert.ok(at(coast, 6.4).pos[0] - at(stop, 6.4).pos[0] > 4, 'the coasting quad ends up much further');
});

test('demos: nose toward you, roll right goes to your left; turned away, it goes right', () => {
  const a = fly('nose-in'), b = fly('nose-in-fix');
  assert.ok(at(a, 2.8).pos[0] < -0.5, `moved to x ${at(a, 2.8).pos[0].toFixed(2)}`);
  assert.ok(Math.abs(at(b, 4.2).heading) < 15 && at(b, 6).pos[0] > at(b, 4.2).pos[0] + 0.5, `heading ${at(b, 4.2).heading.toFixed(0)}, x ${at(b, 4.2).pos[0].toFixed(2)} -> ${at(b, 6).pos[0].toFixed(2)}`);
});

test('demos: wind carries a level quad along; a small lean holds the spot', () => {
  const drift = fly('wind-drift'), lean = fly('wind-lean');
  assert.ok(at(drift, 5.9).pos[0] - drift[0].pos[0] > 3, `drifted ${(at(drift, 5.9).pos[0] - drift[0].pos[0]).toFixed(1)} m`);
  const end = at(lean, 5.9);
  assert.ok(Math.hypot(end.pos[0], end.pos[2] + 7) < 1 && end.tilt > 0.5 && end.tilt < 10, `off by ${Math.hypot(end.pos[0], end.pos[2] + 7).toFixed(2)} m, lean ${end.tilt.toFixed(1)} deg`);
});

test('demos: angle mode levels itself on release; acro stays tilted until the counter-move; a full push is one flip', () => {
  const angle = fly('angle-release'), acro = fly('acro-release'), back = fly('acro-level'), flip = fly('rates-curve');
  assert.ok(at(angle, 2.2).tilt > 15 && at(angle, 4).tilt < 3, `angle: ${at(angle, 2.2).tilt.toFixed(0)} -> ${at(angle, 4).tilt.toFixed(1)} deg`);
  assert.ok(at(acro, 1.6).tilt > 8 && Math.abs(at(acro, 3.5).tilt - at(acro, 1.6).tilt) < 3, `acro: ${at(acro, 1.6).tilt.toFixed(0)} deg, later ${at(acro, 3.5).tilt.toFixed(0)}`);
  assert.ok(at(back, 2).tilt > 8 && at(back, 3.5).tilt < 5, `acro levelled by hand: ${at(back, 2.3).tilt.toFixed(0)} -> ${at(back, 3.5).tilt.toFixed(1)} deg`);
  assert.ok(flip.some((p) => p.tilt > 150) && at(flip, 2.5).tilt < 30, `flip: upside down on the way, ${at(flip, 2.5).tilt.toFixed(0)} deg from level after`);
});

test('demos: yaw turns the nose on the spot; disarming drops the quad; arm, fly, land, disarm', () => {
  const yaw = fly('yaw-pairs'), drop = fly('disarm-drop'), arm = fly('arm-disarm');
  const turned = yaw.reduce((sum, p, i) => sum + (i ? Math.abs(((p.heading - yaw[i - 1].heading + 540) % 360) - 180) : 0), 0);
  assert.ok(turned > 120 && Math.hypot(at(yaw, 4.5).pos[0], at(yaw, 4.5).pos[2] + 7) < 1, `turned ${turned.toFixed(0)} deg`);
  assert.ok(at(drop, 1.9).pos[1] > 0.7 && at(drop, 4).onGround, 'hovered, then dropped to the ground');
  assert.ok(at(arm, 5.5).pos[1] > 1 && at(arm, 10.5).onGround && !at(arm, 10.5).crashed, 'took off and landed');
});

if (process.env.DEMO_PRINT) for (const id of process.env.DEMO_PRINT.split(',')) console.log(id, fly(id).filter((p, i) => i % 5 === 4).map((p) => `${p.t.toFixed(1)}s x${p.pos[0].toFixed(1)} y${p.pos[1].toFixed(1)} z${p.pos[2].toFixed(1)} v${Math.hypot(...p.vel).toFixed(1)}`).join(' | '));
