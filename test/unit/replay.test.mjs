// M10c unit tests: the replay tape records a real flight and plays it back where the quad really was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim, simSteps } from '../../src/sim.js';
import { hoverStick } from '../../src/params.js';
import { createTape, tapeRecord, tapeSample, tapeLength, tapeUsable, createPlayer, playerStep, playerSeek, playerToggle, playerSpeed, TAPE_HZ, TAPE_MAX_S } from '../../src/replay.js';

// Fly 3 s (climb, then tilt forward), recording at 60 frames per second as the page does; keep the true states every 10 ms.
function flyRecorded() {
  const sim = createSim(), tape = createTape(), truth = [];
  sim.armed = true;
  const h = hoverStick(sim.quad, sim.fcCfg);
  for (let ms = 0; ms < 3000; ms += 10) {
    const sticks = ms < 1500 ? { roll: 0, pitch: 0, yaw: 0, throttle: h + 0.15 } : { roll: 0.2, pitch: 0.4, yaw: 0.3, throttle: h + 0.05 };
    simSteps(sim, sticks, 10);
    const s = sim.state;
    truth.push({ t: s.time, pos: [...s.pos], quat: [...s.quat] });
    tapeRecord(tape, s, sticks, sim.armed);
  }
  return { tape, truth };
}

test('tape keeps one sample per 1/60 s of sim time', () => {
  const { tape } = flyRecorded();
  assert.ok(Math.abs(tape.frames.length - 3 * TAPE_HZ) <= 3, `${tape.frames.length} frames`);
  assert.ok(tapeLength(tape) > 2.9 && tapeUsable(tape));
});

test('played back between samples, the quad is within 3 cm and 2 degrees of where it really was', () => {
  const { tape, truth } = flyRecorded();
  let worstPos = 0, worstAng = 0;
  for (const tr of truth.slice(1, -1)) {
    const s = tapeSample(tape, tr.t);
    worstPos = Math.max(worstPos, Math.hypot(s.pos[0] - tr.pos[0], s.pos[1] - tr.pos[1], s.pos[2] - tr.pos[2]));
    const d = Math.abs(s.quat.reduce((a, q, i) => a + q * tr.quat[i], 0));
    worstAng = Math.max(worstAng, 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI);
  }
  assert.ok(worstPos < 0.03, `pos ${worstPos}`);
  assert.ok(worstAng < 2, `angle ${worstAng}`);
  // and it really moved (the test would pass on a tape of a quad standing still otherwise)
  assert.ok(truth.at(-1).pos[1] > 2, `climbed ${truth.at(-1).pos[1]}`);
});

test('the tape keeps only the last 3 minutes', () => {
  const tape = createTape();
  const s = { time: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0, 0], motors: [0, 0, 0, 0] };
  for (let i = 0; i < (TAPE_MAX_S + 20) * TAPE_HZ; i++) { s.time = i / TAPE_HZ; tapeRecord(tape, s, { roll: 0, pitch: 0, yaw: 0, throttle: 0 }, true); }
  assert.equal(tape.frames.length, TAPE_MAX_S * TAPE_HZ);
  assert.ok(Math.abs(tapeLength(tape) - TAPE_MAX_S) < 0.05);
});

test('a tape where the quad was never armed is not offered', () => {
  const tape = createTape();
  const s = { time: 0, pos: [0, 0, 0], quat: [0, 0, 0, 1], vel: [0, 0, 0], motors: [0, 0, 0, 0] };
  for (let i = 0; i < 200; i++) { s.time = i / TAPE_HZ; tapeRecord(tape, s, { roll: 0, pitch: 0, yaw: 0, throttle: 0 }, false); }
  assert.equal(tapeUsable(tape), false);
});

test('player: slow motion, pause, seek, stop at the end, play again from the start', () => {
  const { tape } = flyRecorded();
  const p = createPlayer(tape), t0 = p.t;
  playerSpeed(p, -1); assert.equal(p.speed, 0.5);
  playerStep(p, 1); assert.ok(Math.abs(p.t - t0 - 0.5) < 1e-9);
  playerToggle(p); playerStep(p, 1); assert.ok(Math.abs(p.t - t0 - 0.5) < 1e-9, 'paused');
  playerSeek(p, 99); assert.ok(Math.abs(p.t - tape.frames.at(-1).t) < 1e-9);
  playerSeek(p, p.t - 0.1); playerToggle(p); playerStep(p, 1); assert.equal(p.playing, false, 'stops at the end');
  playerToggle(p); assert.ok(p.playing && Math.abs(p.t - t0) < 1e-9, 'restarts from the beginning');
  playerSpeed(p, -5); assert.equal(p.speed, 0.1); playerSpeed(p, 9); assert.equal(p.speed, 1);
});
