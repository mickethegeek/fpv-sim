// Replay (M10c): a tape of the flight, sampled at a fixed sim-time rate, and a player that reads it back
// at any time with interpolation. Pure: no DOM, runs in node and the browser.
export const TAPE_HZ = 60;           // samples per second of sim time
export const TAPE_MAX_S = 180;       // the tape keeps the last 3 minutes of a run

export function createTape() { return { frames: [], next: 0 }; }

// Record one frame (call every rendered frame; it keeps one sample per 1/TAPE_HZ of sim time).
export function tapeRecord(tape, s, sticks, armed) {
  if (s.time + 1e-9 < tape.next) return false;
  tape.frames.push({
    t: s.time, pos: [s.pos[0], s.pos[1], s.pos[2]], quat: [s.quat[0], s.quat[1], s.quat[2], s.quat[3]],
    vel: [s.vel[0], s.vel[1], s.vel[2]], motors: [s.motors[0], s.motors[1], s.motors[2], s.motors[3]],
    sticks: { roll: sticks.roll, pitch: sticks.pitch, yaw: sticks.yaw, throttle: sticks.throttle },
    armed: !!armed, crashed: !!s.crashed,
  });
  const max = TAPE_MAX_S * TAPE_HZ;
  if (tape.frames.length > max) tape.frames.splice(0, tape.frames.length - max);
  tape.next = Math.max(tape.next + 1 / TAPE_HZ, s.time); // keeps 60 per second on average whatever the frame rate
  return true;
}

export const tapeStart = (tape) => (tape.frames.length ? tape.frames[0].t : 0);
export const tapeEnd = (tape) => (tape.frames.length ? tape.frames[tape.frames.length - 1].t : 0);
export const tapeLength = (tape) => tapeEnd(tape) - tapeStart(tape);
// Worth replaying: at least a second, and the quad was armed at some point.
export const tapeUsable = (tape) => tapeLength(tape) >= 1 && tape.frames.some((f) => f.armed);

const lerp = (a, b, k) => a + (b - a) * k;
// The state at time t (clamped to the tape): positions and sticks interpolated, attitude by normalised lerp.
export function tapeSample(tape, t) {
  const f = tape.frames;
  if (!f.length) return null;
  if (t <= f[0].t) return f[0];
  if (t >= f[f.length - 1].t) return f[f.length - 1];
  let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (f[m].t <= t) lo = m; else hi = m; }
  const a = f[lo], b = f[hi], k = (t - a.t) / (b.t - a.t);
  const dot = a.quat[0] * b.quat[0] + a.quat[1] * b.quat[1] + a.quat[2] * b.quat[2] + a.quat[3] * b.quat[3];
  const sg = dot < 0 ? -1 : 1;
  const q = [0, 1, 2, 3].map((i) => lerp(a.quat[i], sg * b.quat[i], k));
  const n = Math.hypot(...q);
  return {
    t, pos: [0, 1, 2].map((i) => lerp(a.pos[i], b.pos[i], k)), quat: q.map((x) => x / n),
    vel: [0, 1, 2].map((i) => lerp(a.vel[i], b.vel[i], k)), motors: [0, 1, 2, 3].map((i) => lerp(a.motors[i], b.motors[i], k)),
    sticks: { roll: lerp(a.sticks.roll, b.sticks.roll, k), pitch: lerp(a.sticks.pitch, b.sticks.pitch, k), yaw: lerp(a.sticks.yaw, b.sticks.yaw, k), throttle: lerp(a.sticks.throttle, b.sticks.throttle, k) },
    armed: a.armed, crashed: a.crashed,
  };
}

// Player: { tape, t, speed, playing }. Advance by real seconds dt; stops at the end.
export const SPEEDS = [0.1, 0.25, 0.5, 1];
export function createPlayer(tape) { return { tape, t: tapeStart(tape), speed: 1, playing: true }; }
export function playerStep(p, dt) {
  if (!p.playing) return p;
  p.t += dt * p.speed;
  if (p.t >= tapeEnd(p.tape)) { p.t = tapeEnd(p.tape); p.playing = false; }
  return p;
}
export function playerSeek(p, t) { p.t = Math.max(tapeStart(p.tape), Math.min(tapeEnd(p.tape), t)); return p; }
// Play / pause; play at the end starts again from the beginning.
export function playerToggle(p) {
  if (!p.playing && p.t >= tapeEnd(p.tape) - 1e-6) p.t = tapeStart(p.tape);
  p.playing = !p.playing; return p;
}
export function playerSpeed(p, dir) {
  const i = SPEEDS.indexOf(p.speed);
  p.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.length - 1 : i) + dir))]; return p;
}
