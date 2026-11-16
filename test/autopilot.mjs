// A simple autopilot that flies the gate course in ANGLE mode. Test tool only: it proves the course can be
// flown with the real physics and flight controller (unit test in node, flight script in the browser).
// It reads the quad state and returns sticks, exactly what a pilot would give.
import { rotate, GRAVITY } from '../src/physics.js';
import { gateLocal } from '../src/course.js';

import { stickForThrust } from '../src/params.js';
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const _f = [0, 0, 0], _up = [0, 0, 0];
// Sticks (angle mode) that fly toward the point (tx, tz) relative to the quad at up to `speed`, holding `alt`.
// Near the point it slows down and holds position.
export function steer(s, tx, tz, speed, alt, maxTilt = Math.PI / 3, faceMove = true) {
  const d = Math.hypot(tx, tz) || 1e-9;
  const v = Math.min(speed, d * 1.2);
  const vx = (tx / d) * v, vz = (tz / d) * v;
  // Wanted horizontal acceleration, limited to a gentle bank.
  let ax = 1.6 * (vx - s.vel[0]), az = 1.6 * (vz - s.vel[2]);
  const a = Math.hypot(ax, az), aMax = 5.5;
  if (a > aMax) { ax *= aMax / a; az *= aMax / a; }
  // In the quad's heading frame.
  rotate(s.quat, [0, 0, -1], _f);
  const fn = Math.hypot(_f[0], _f[2]) || 1, fx = _f[0] / fn, fz = _f[2] / fn;
  const aF = ax * fx + az * fz, aR = ax * -fz + az * fx;
  const pitch = clamp(Math.atan(aF / GRAVITY) / maxTilt, -1, 1);
  const roll = clamp(Math.atan(aR / GRAVITY) / maxTilt, -1, 1);
  // Turn the nose toward where we are going.
  const yawErr = faceMove && d > 2 ? Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz) : 0;
  const yaw = clamp(yawErr * 0.9, -0.6, 0.6);
  // Hold height.
  rotate(s.quat, [0, 1, 0], _up);
  const climb = clamp(2.5 * (alt - s.pos[1]) - 2.5 * s.vel[1], -4, 6);
  const throttle = clamp(stickForThrust((1 + climb / GRAVITY) / Math.max(0.5, _up[1])), 0.03, 0.9);
  return { roll, pitch, yaw, throttle };
}

// Flies the gate course, lap after lap.
export function createAutopilot(course, opts = {}) {
  const speed = opts.speed ?? 7, alt = opts.alt ?? 1.2, maxTilt = (opts.maxTiltDeg ?? 60) * Math.PI / 180;
  const ap = { target: opts.startGate ?? 0, passes: 0 };
  ap.update = (s) => {
    const gates = course.gates;
    let g = gates[ap.target];
    let { along, across } = gateLocal(g, s.pos);
    if (along > 1.5 && Math.abs(across) < g.w) { ap.target = (ap.target + 1) % gates.length; ap.passes++; g = gates[ap.target]; ({ along, across } = gateLocal(g, s.pos)); }
    // Aim at a point on the gate's centre line, ahead of where we are: far away it pulls us onto the line, close in it leads through.
    const aim = along + Math.max(4, 0.4 * Math.abs(along));
    const tx = g.x + g.fwd[0] * aim - s.pos[0], tz = g.z + g.fwd[1] * aim - s.pos[2];
    const d = Math.hypot(tx, tz) || 1;
    const turning = Math.abs(across) > 3 ? 0.75 : 1; // slower while lining up
    return steer(s, (tx / d) * 100, (tz / d) * 100, speed * turning, alt, maxTilt);
  };
  return ap;
}

// Climbs to a point and holds it (hover skill).
export function createHoverPilot(x, y, z) {
  return { update: (s) => steer(s, x - s.pos[0], z - s.pos[2], 3, y, Math.PI / 3, false) };
}

// Flies circles: a list of [pole, radius, direction (+1 = angle increasing), turns]; one after the other (orbit, figure 8).
// Each circle starts where the quad meets it, so two touching circles make a figure 8.
export function createCirclePilot(circles, opts = {}) {
  const speed = opts.speed ?? 4, alt = opts.alt ?? 2;
  const ap = { leg: 0, turned: 0, last: null };
  ap.update = (s) => {
    const [pole, radius, dir, turns] = circles[Math.min(ap.leg, circles.length - 1)];
    const dx = s.pos[0] - pole.x, dz = s.pos[2] - pole.z, r = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
    if (Math.abs(r - radius) < 2.5 && s.pos[1] > 1) {
      if (ap.last !== null) { let da = ang - ap.last; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; ap.turned += da * dir; }
      ap.last = ang;
      if (ap.turned >= turns * 2 * Math.PI && ap.leg < circles.length - 1) { ap.leg++; ap.turned = 0; ap.last = null; }
    }
    const lead = ang + dir * Math.min(0.6, 3.5 / radius);
    return steer(s, pole.x + radius * Math.cos(lead) - s.pos[0], pole.z + radius * Math.sin(lead) - s.pos[2], speed, alt);
  };
  return ap;
}

// Flies a lesson (src/lessons.js) step by step. update(state, attempt) -> { sticks, arm }.
// opts: disarmDelay (s after the DISARM call), descend (m/s on landing), speed (m/s).
import { currentStep, headingDeg, PAD, LOW } from '../src/lessons.js';
export function createLessonPilot(opts = {}) {
  const speed = opts.speed ?? 3, descend = opts.descend ?? 0.5, disarmDelay = opts.disarmDelay ?? 0.2;
  const p = { arm: true, sign: 1, promptSeen: null };
  const turnTo = (s, deg) => { let e = deg - headingDeg(s.quat); while (e > 180) e -= 360; while (e < -180) e += 360; return clamp(e / 40, -0.6, 0.6); };
  p.update = (s, a) => {
    const idle = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    if (a.state !== 'running') { p.arm = a.state === 'ready'; return { sticks: idle, arm: p.arm }; }
    const st = currentStep(a);
    let sticks = idle;
    if (st.type === 'box') {
      sticks = steer(s, st.box.x - s.pos[0], st.box.z - s.pos[2], speed, st.box.y, Math.PI / 3, false);
      if (st.heading !== undefined) sticks.yaw = turnTo(s, st.heading);
    } else if (st.type === 'orbit') {
      const c = st.cone, r = 3.5, ang = Math.atan2(s.pos[2] - c.z, s.pos[0] - c.x);
      const dir = st.opposite && a.lastSign ? -a.lastSign : 1;
      const lead = ang + dir * 0.7;
      sticks = steer(s, c.x + r * Math.cos(lead) - s.pos[0], c.z + r * Math.sin(lead) - s.pos[2], speed, 2);
    } else if (st.type === 'reach') {
      sticks = steer(s, st.at.x - s.pos[0], st.at.z - s.pos[2], speed, 2);
      if (st.heading !== undefined && Math.hypot(st.at.x - s.pos[0], st.at.z - s.pos[2]) < 4) sticks.yaw = turnTo(s, st.heading);
    } else if (st.type === 'land') {
      const d = Math.hypot(PAD.x - s.pos[0], PAD.z - s.pos[2]);
      sticks = steer(s, PAD.x - s.pos[0], PAD.z - s.pos[2], speed, d < 1 ? s.pos[1] - descend : Math.max(1.2, s.pos[1]), Math.PI / 3, false);
      if (s.onGround) sticks = idle;
    } else if (st.type === 'disarm') {
      sticks = steer(s, PAD.x - s.pos[0], PAD.z - s.pos[2], speed, (LOW.min + LOW.max) / 2, Math.PI / 3, false);
      if (a.prompt) { p.promptSeen ??= s.time; if (s.time - p.promptSeen >= disarmDelay) p.arm = false; }
    } else if (st.type === 'rearm') {
      p.arm = s.onGround; // wait for the drop to end, then arm again
    }
    return { sticks, arm: p.arm };
  };
  return p;
}
