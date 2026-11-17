// Coaching (M10): after a run that failed, one line saying why, worked out from the flight itself.
// Pure logic, no DOM. main.js records one sample per frame while a run is on; coachLine() reads the last seconds of it.
// Nothing here is advice from memory: every number in a line is measured from the run (speed, height, stick, time).
import { headingDeg, PAD, ORBIT_MAX_R, HEADING_TOL } from './lessons.js';
import { rotate } from './physics.js';

export const KEEP = 10;        // s of flight kept
export const EVERY = 0.05;     // s between samples (20 a second)
const PUSHED = 0.15;           // stick further out than this counts as "held" (above the 5 % deadzone)

export function createRecorder() { return { samples: [], last: -1, peak: null }; }
const _up = [0, 0, 0];
// sm: { t, pos, vel, quat, onGround, crashed }, sticks: { roll, pitch, yaw, throttle }, step: number of the lesson step being flown.
// force: take the sample whatever the time since the last one (the last frame of a run).
export function record(rec, sm, sticks, step, force = false) {
  const speed = Math.hypot(sm.vel[0], sm.vel[1], sm.vel[2]);
  // The sticks at the fastest moment of the whole run (the last 10 s may not hold it).
  // Speed comes after the stick, so it is the largest stick in the 1.5 s before that moment.
  if (!rec.peak || speed > rec.peak.speed) {
    const pk = rec.peak = { speed, roll: sticks.roll, pitch: sticks.pitch };
    for (let i = rec.samples.length - 1; i >= 0 && sm.t - rec.samples[i].t <= 1.5; i--) {
      const p = rec.samples[i];
      if (Math.abs(p.roll) > Math.abs(pk.roll)) pk.roll = p.roll;
      if (Math.abs(p.pitch) > Math.abs(pk.pitch)) pk.pitch = p.pitch;
    }
  }
  if (sm.t - rec.last < EVERY && !force) return rec;
  rec.last = sm.t;
  rotate(sm.quat, [0, 1, 0], _up);
  rec.samples.push({ t: sm.t, pos: [sm.pos[0], sm.pos[1], sm.pos[2]], vel: [sm.vel[0], sm.vel[1], sm.vel[2]], head: headingDeg(sm.quat),
    tilt: Math.acos(Math.max(-1, Math.min(1, _up[1]))) * 180 / Math.PI, onGround: sm.onGround, crashed: !!sm.crashed, step,
    roll: sticks.roll, pitch: sticks.pitch, yaw: sticks.yaw, throttle: sticks.throttle });
  while (rec.samples.length && sm.t - rec.samples[0].t > KEEP) rec.samples.shift();
  return rec;
}

const RAD = Math.PI / 180;
const pct = (v) => `${Math.round(v * 100)} %`;
const wrapDeg = (d) => ((d + 540) % 360) - 180;
// A world direction (x, z) split along the quad's own nose and right side (heading in degrees, 0 = -Z, 90 = +X).
export function toBody(dx, dz, head) {
  const s = Math.sin(head * RAD), c = Math.cos(head * RAD);
  return { fwd: dx * s - dz * c, right: dx * c + dz * s };
}
// Words for a direction. In line of sight it is how the pilot sees it from the ground; in FPV it is from the quad's seat.
function dirWords(dx, dz, head, view) {
  if (view === 'los') return Math.abs(dx) >= Math.abs(dz) ? (dx > 0 ? 'to the right' : 'to the left') : dz < 0 ? 'away from you' : 'toward you';
  const b = toBody(dx, dz, head);
  return Math.abs(b.right) >= Math.abs(b.fwd) ? (b.right > 0 ? 'to the right' : 'to the left') : b.fwd > 0 ? 'forward' : 'backward';
}
const stickWords = (axis, sign) => (axis === 'roll' ? `roll ${sign > 0 ? 'right' : 'left'}` : `pitch ${sign > 0 ? 'forward' : 'back'}`);

// Why was the quad moving along (dx, dz) at the end? Looks at the right stick over the seconds before.
// Returns the second half of a line: what the pilot did (or did not do) and what to do instead.
export function driftCause(samples, dx, dz, wind) {
  const end = samples[samples.length - 1], b = toBody(dx, dz, end.head);
  const axis = Math.abs(b.right) >= Math.abs(b.fwd) ? 'roll' : 'pitch', sign = Math.sign(axis === 'roll' ? b.right : b.fwd) || 1;
  const win = samples.filter((p) => end.t - p.t <= 4 && !p.onGround);
  let held = 0, countered = 0, lastHeld = null;
  for (let i = 1; i < win.length; i++) {
    const p = win[i], dt = p.t - win[i - 1].t;
    if (p[axis] * sign > PUSHED) { held += dt; lastHeld = p.t; countered = 0; } else if (p[axis] * sign < -PUSHED) countered += dt;
  }
  const stick = stickWords(axis, sign), back = stickWords(axis, -sign);
  if (held >= 0.3 && end.t - lastHeld < 0.4) return `you were still holding ${stick} (${held.toFixed(1)} s). Release earlier.`;
  if (held >= 0.3 && countered < 0.2) return `you held ${stick} for ${held.toFixed(1)} s and never stopped the drift. There are no brakes: ${back} briefly, then level.`;
  if (held >= 0.3) return `you held ${stick} for ${held.toFixed(1)} s and braked too late. Release earlier.`;
  if (wind && dx * wind[0] + dz * wind[2] > 0) {
    const w = toBody(-wind[0], -wind[2], end.head), wa = Math.abs(w.right) >= Math.abs(w.fwd) ? 'roll' : 'pitch';
    return `the wind carried it and the stick did not answer. Hold a little ${stickWords(wa, Math.sign(wa === 'roll' ? w.right : w.fwd))} into the wind.`;
  }
  return `it was drifting and the stick never stopped it. Tilt against the drift (${back}) briefly, then level.`;
}

// One line for the result card. a: the finished attempt (lessons.js), r: attemptResult(a), rec: the recorder.
// ctx: { view ('fpv' | 'los' | 'chase'), hover (throttle stick that hovers, 0..1), wind ([x, y, z] or null), crashedInto, crashSpeed (m/s), armName }
// Returns '' when there is nothing to say (a good run).
export function coachLine(a, r, rec, ctx = {}) {
  if (r.good) return '';
  const S = rec.samples, end = S[S.length - 1];
  if (!end) return r.reason;
  const view = ctx.view || 'fpv', hover = ctx.hover ?? 0.2;
  const air = S.filter((p) => !p.onGround && !p.crashed), lastAir = air[air.length - 1] || end;
  // (a crashed quad has stopped: its last flying sample is the one before the crash)
  const recent = (sec, from = end) => S.filter((p) => from.t - p.t <= sec && p.t <= from.t);
  const mean = (list, k) => (list.length ? list.reduce((n, p) => n + p[k], 0) / list.length : 0);
  const step = a.lesson.steps[Math.min(a.step, a.lesson.steps.length - 1)];

  if (r.completed) {
    const bad = r.metrics.find((m) => !m.ok);
    if (bad.label === 'Touchdown') {
      const thr = mean(recent(1, lastAir), 'throttle');
      return `${r.reason}: throttle was at ${pct(thr)} in the last second, hover is ${pct(hover)}. Come down just under hover throttle.`;
    }
    if (bad.label === 'Top speed') {
      const p = rec.peak, big = Math.abs(p.pitch) >= Math.abs(p.roll) ? 'pitch' : 'roll';
      return `${r.reason}: just before it you held ${stickWords(big, Math.sign(p[big]))} at ${pct(Math.abs(p[big]))} of the stick. Less stick, or let go sooner.`;
    }
    return `${r.reason}: rest a finger on ${ctx.armName || 'the arm button'} so the only thing left to do is press.`;
  }
  if (a.reason === 'Crashed') {
    const v = lastAir.vel, sink = -v[1], flat = Math.hypot(v[0], v[2]), into = ctx.crashedInto || 'ground';
    if (into !== 'ground') return `You hit a ${into} at ${Math.round(Math.hypot(flat, sink) * 3.6)} km/h: ${driftCause(S, v[0], v[2], ctx.wind)}`;
    if (sink >= flat && Math.hypot(sink, flat) > (ctx.crashSpeed ?? 6) * 0.8) {
      const thr = mean(recent(1.5, lastAir), 'throttle');
      return `You hit the ground at ${sink.toFixed(1)} m/s: throttle was at ${pct(thr)}, hover is ${pct(hover)}. Add throttle earlier to slow the fall.`;
    }
    if (lastAir.tilt > 45) return `You touched the ground tilted ${Math.round(lastAir.tilt)}°: let the right stick go so it levels before it touches.`;
    return `You flew into the ground at ${Math.round(flat * 3.6)} km/h: ${driftCause(S, v[0], v[2], ctx.wind)}`;
  }
  if (a.reason === 'Landed off the pad') {
    const dx = end.pos[0] - PAD.x, dz = end.pos[2] - PAD.z, d = Math.hypot(dx, dz);
    const before = recent(1.5, lastAir)[0] || lastAir; // which way it was moving as it came down
    return `You landed ${d.toFixed(1)} m ${dirWords(dx, dz, end.head, view)} of the pad: ${driftCause(S.filter((p) => p.t <= lastAir.t), before.vel[0] || dx, before.vel[2] || dz, ctx.wind)}`;
  }
  if (a.reason === 'Out of time') {
    const mine = S.filter((p) => p.step === a.step && !p.onGround);
    if (step.type === 'box' && mine.length) {
      const b = step.box, out = { high: 0, low: 0, side: 0, turn: 0 };
      let inside = 0, sx = 0, sz = 0;
      for (const p of mine) {
        const dx = p.pos[0] - b.x, dz = p.pos[2] - b.z, dy = p.pos[1] - b.y;
        const side = Math.abs(dx) > b.half || Math.abs(dz) > b.half;
        if (dy > b.halfY) out.high++; else if (dy < -b.halfY) out.low++; else if (side) { out.side++; sx += dx; sz += dz; }
        else if (step.heading !== undefined && Math.abs(wrapDeg(p.head - step.heading)) > HEADING_TOL) out.turn++; else inside++;
      }
      const worst = Object.keys(out).reduce((m, k) => (out[k] > out[m] ? k : m), 'high'), share = pct(inside / mine.length);
      const head = `Out of time: you were in the box ${step.heading !== undefined ? 'and on heading ' : ''}${share} of the last ${Math.round(mine[mine.length - 1].t - mine[0].t)} s`;
      if (out[worst] === 0) return `${head}, never ${step.hold} s in one go. Smaller stick movements.`;
      if (worst === 'high') return `${head}, mostly too high. Bring the throttle back toward ${pct(hover)}.`;
      if (worst === 'low') return `${head}, mostly too low. Hover needs about ${pct(hover)} throttle.`;
      if (worst === 'turn') return `${head}, mostly with the nose ${Math.round(Math.abs(wrapDeg(end.head - step.heading)))}° off. Yaw first, then hold.`;
      return `${head}, mostly out ${dirWords(sx, sz, end.head, view)}: ${driftCause(mine, sx, sz, ctx.wind)}`;
    }
    if (step.type === 'orbit') {
      const far = mine.filter((p) => Math.hypot(p.pos[0] - step.cone.x, p.pos[2] - step.cone.z) > ORBIT_MAX_R).length;
      const done = Math.round(Math.min(1, Math.abs(a.wind) / (2 * Math.PI)) * 100);
      if (mine.length && far > mine.length / 2) return `Out of time, ${done} % round the cone: you were more than ${ORBIT_MAX_R} m from it most of the time, where the circle does not count. Fly closer.`;
      return `Out of time, ${done} % round the cone. Keep a little pitch forward and a steady yaw toward the cone.`;
    }
    if (step.type === 'reach') {
      const d = Math.hypot(end.pos[0] - step.at.x, end.pos[2] - step.at.z);
      if (d <= step.at.r && step.heading !== undefined) return `Out of time: you were at the spot but the nose was ${Math.round(Math.abs(wrapDeg(end.head - step.heading)))}° off. Yaw until it points where the step says.`;
      return `Out of time: you were still ${d.toFixed(0)} m from the ${step.at.x === PAD.x && step.at.z === PAD.z ? 'pad' : 'spot'}. A little more pitch forward gets you there.`;
    }
    const d = Math.hypot(end.pos[0] - PAD.x, end.pos[2] - PAD.z);
    return end.onGround ? `Out of time: you were on the ground ${d.toFixed(1)} m from the pad. Lift off and set it down on the pad.`
      : `Out of time: you were still ${end.pos[1].toFixed(1)} m up, ${d.toFixed(1)} m from the pad. Start the landing sooner.`;
  }
  if (a.reason === 'Disarmed before the lesson was finished') {
    return lastAir === end || end.pos[1] > 0.3 ? `You disarmed ${end.pos[1].toFixed(1)} m up, so it dropped. Disarm only on the ground, or in an emergency.`
      : 'You disarmed before the last step was done. Stay armed until the lesson says Done.';
  }
  if (a.reason === 'Disarmed before the call') return 'You disarmed before the call. Hover low and wait for DISARM NOW.';
  if (a.reason === 'Did not disarm') return `You did not disarm within 5 s of the call. Find ${ctx.armName || 'the arm button'} before you take off.`;
  if (/^Switched out of/.test(a.reason)) return `${a.reason}: this lesson is flown in ${a.lesson.mode} from start to end.`;
  return r.reason;
}
