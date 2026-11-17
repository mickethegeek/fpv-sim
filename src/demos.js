// Live demos for the theory cards (src/theory.js): short scenes flown on the real physics by scripted sticks.
// No DOM. A demo is { start: [x, y, z, yawDeg], cam, loop, fly(t, s, h) } plus optional mode ('acro'), wind, slow, arrows.
//   start   where the quad is put, in the air, armed (yawDeg 0 = nose away from the pilot, 90 = nose to the right)
//   cam     [x, y, z] of a camera that stands still and watches the quad, or 'fpv' for the quad's own camera
//   loop    s of sim time, then the scene starts again
//   slow    time factor (0.5 = half speed)
//   arrows  true: draw thrust per motor, weight and velocity (the real values, src/arrows.js)
//   curve   true: the card also draws the rates curve (rotation speed against stick), with a dot at the stick's place
//   fly     sticks for sim time t and quad state s; { arm: false } switches the motors off
//   scale   how much bigger the quad is drawn (default: view.demoModelScale in main.js)
//   nose    true: a big bright arrow on the quad points where the nose is
//   look, fov  a fixed point the camera looks at, and its vertical field of view (default: it follows the quad)
//   slowmo  [from, to, factor]: much slower in that window of sim time; with holds: true the scene also stops
//           at each peak of the motor difference and labels which motors are faster (see peakWatch, motorTags)
//   runs    the scene is flown this many times in turn (h.run = 0, 1, ...); start may then be a function of run;
//           marks that fly() pushes to h.marks stay on screen until the first run starts again
// The numbers here (positions, stick sizes, timings) only stage the scene; what the quad then does is the sim's physics.
import { steer } from './pilot.js';
import { hoverStick } from './params.js';
import { headingDeg } from './lessons.js';

const PILOT = [0, 1.7, 2];      // where you stand to watch
const SPOT = [0, 2.5, -7];      // where most demos happen
const NOSE_CAM = [0, 7.5, 1];   // behind where you stand, raised: looking down about 30 degrees, the nose arrow reads at a glance
const between = (t, a, b) => t >= a && t < b;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Helpers handed to fly(): hold a point, hold a height, hover throttle, turn to a heading.
export function demoHelpers(quad, fc, run = 0, marks = []) {
  return {
    run, marks,
    hover: hoverStick(quad, fc),
    hold: (s, x, y, z) => steer(s, x - s.pos[0], z - s.pos[2], 3, y, Math.PI / 3, false),
    alt: (s, y) => steer(s, 0, 0, 0, y, Math.PI / 3, false).throttle,
    turn: (s, deg) => { let e = deg - headingDeg(s.quat); while (e > 180) e -= 360; while (e < -180) e += 360; return clamp(e / 40, -0.6, 0.6); },
  };
}
const level = (s, h, y, more = {}) => ({ roll: 0, pitch: 0, yaw: 0, throttle: h.alt(s, y), ...more });
const pass = (y = 2.5) => [-12, y, -9, 90]; // start of a fly-past from left to right in front of the pilot

export const DEMOS = {
  // Chapter 1
  'hover-arrows': { start: SPOT, cam: [2.2, 2.4, -3], loop: 7, arrows: true,
    fly: (t, s, h) => h.hold(s, SPOT[0], between(t, 2.5, 5) ? 4 : 2.5, SPOT[2]) },
  // The motor difference lasts about 0.15 s (push, then the catch that stops the tip): that moment runs 20x slower and stops at each peak.
  'tilt-motors': { start: SPOT, cam: [0, 4.6, -3.4], loop: 4, slow: 0.5, slowmo: [1.5, 1.72, 0.05], holds: true, arrows: true,
    fly: (t, s, h) => (between(t, 1.5, 2.3) ? level(s, h, 2.5, { roll: 0.5 }) : h.hold(s, ...SPOT)) },
  'stick-tour': { start: SPOT, cam: PILOT, loop: 13,
    fly: (t, s, h) => {
      const k = h.hold(s, ...SPOT);
      if (between(t, 1, 2)) return { ...k, throttle: h.hover + 0.12 };
      if (between(t, 3.5, 5)) return { ...k, yaw: 0.5 };
      if (between(t, 5, 6.5)) return { ...k, yaw: h.turn(s, 0) };
      if (between(t, 7, 7.8)) return level(s, h, 2.5, { pitch: 0.3 });
      if (between(t, 9.5, 10.3)) return level(s, h, 2.5, { roll: 0.3 });
      return k;
    } },
  'arm-disarm': { start: [0, 0.05, -5], cam: [1.8, 1.2, -2], loop: 11,
    fly: (t, s, h) => {
      if (t < 1.5 || t > 9.5) return { arm: false };
      if (t < 3) return { throttle: 0 };                       // armed: props idle
      if (t < 6) return h.hold(s, 0, 1.5, -5);
      return s.onGround ? { throttle: 0 } : h.hold(s, 0, s.pos[1] - 0.5, -5);
    } },
  // Chapter 2
  'yaw-pairs': { start: SPOT, cam: [1.2, 5, -4.5], loop: 6, slow: 0.5, arrows: true,
    fly: (t, s, h) => ({ ...h.hold(s, ...SPOT), yaw: between(t, 1.5, 4.5) ? 0.5 : 0 }) },
  'nose-in': { start: [...SPOT, 180], cam: NOSE_CAM, nose: true, scale: 3, loop: 6.5,
    fly: (t, s, h) => (between(t, 1.5, 2.5) ? level(s, h, 2.5, { roll: 0.3 }) : between(t, 2.5, 4) ? level(s, h, 2.5) : h.hold(s, ...SPOT)) },
  'nose-in-fix': { start: [...SPOT, 180], cam: NOSE_CAM, nose: true, scale: 3, loop: 8,
    fly: (t, s, h) => {
      if (t < 1) return h.hold(s, ...SPOT);
      if (t < 4) return { ...h.hold(s, ...SPOT), yaw: h.turn(s, 0) };
      return between(t, 4.5, 5.5) ? level(s, h, 2.5, { roll: 0.3 }) : level(s, h, 2.5);
    } },
  // Chapter 3
  'tilt-forward': { start: pass(), cam: PILOT, loop: 6, arrows: true,
    fly: (t, s, h) => level(s, h, 2.5, { pitch: between(t, 1, 4) ? 0.3 : 0 }) },
  'tilt-sink': { start: pass(5), cam: PILOT, loop: 8, arrows: true,
    fly: (t, s, h) => {
      if (between(t, 1, 2.6)) return { pitch: 0.5, throttle: h.hover };        // tilt, same throttle: it sinks
      if (between(t, 2.6, 4.6)) return level(s, h, 5, { pitch: s.vel[0] > 0.5 ? -0.4 : 0 });
      if (between(t, 4.6, 6.6)) return level(s, h, 5, { pitch: 0.5 });        // tilt with throttle added: it holds height
      return level(s, h, 5, { pitch: t > 6.6 && s.vel[0] > 0.5 ? -0.4 : 0 });
    } },
  'coordinated-turn': { start: [0, 2.5, -3], cam: [0, 9, 5], loop: 10,
    fly: (t, s, h) => level(s, h, 2.5, t < 1 ? {} : { pitch: 0.22, yaw: 0.4, roll: 0.22 }) },
  // Chapter 4
  'coast': { start: pass(), cam: PILOT, loop: 6.5, arrows: true,
    fly: (t, s, h) => level(s, h, 2.5, { pitch: between(t, 0.8, 2.3) ? 0.3 : 0 }) },
  // Two runs, slow then fast, each braking hard from the same white line; where each one stopped stays marked.
  'stop-distance': { runs: 2, scale: 3, start: (run) => [run ? -20 : -12, 2.5, -9, 90], cam: [1.5, 6.5, -0.5], look: [0.5, 1.2, -9], fov: 55, loop: 8, arrows: true,
    marks: [{ x: 0, z: -9, color: 0xffffff, text: 'brake here' }],
    fly: (t, s, h) => {
      const st = h.stop || (h.stop = { braking: false, v: 0 });
      if (!st.braking && s.pos[0] >= 0) { st.braking = true; st.v = s.vel[0]; }
      if (st.braking && !st.done && s.vel[0] <= 0.3) {
        st.done = true;
        h.marks.push({ x: s.pos[0], z: -9, color: h.run ? 0xff8a3d : 0x5ee07a, text: `${Math.round(st.v * 3.6)} km/h: stopped after ${s.pos[0].toFixed(1)} m` });
      }
      return level(s, h, 2.5, { pitch: st.braking ? (st.done ? 0 : -0.5) : t > 0.5 ? (h.run ? 0.5 : 0.2) : 0 });
    } },
  'camera-tilt': { start: [-6, 4, 14], cam: 'fpv', loop: 8,
    fly: (t, s, h) => level(s, h, 4, { pitch: between(t, 2.5, 6.5) ? 0.4 : 0 }) },
  // Chapter 5
  'wind-drift': { start: [-4, 2.5, -7], cam: PILOT, loop: 6, wind: true, arrows: true,
    fly: (t, s, h) => level(s, h, 2.5) },
  'wind-lean': { start: SPOT, cam: [0, 2.4, -2.5], loop: 6, wind: true, arrows: true,
    fly: (t, s, h) => h.hold(s, ...SPOT) },
  // Chapter 6
  'disarm-drop': { start: [0, 1, -5], cam: [1.8, 1.2, -2], loop: 4.5,
    fly: (t, s, h) => (t < 2 ? h.hold(s, 0, 1, -5) : { arm: false }) },
  'failsafe-drop': { start: pass(1.5), cam: PILOT, loop: 5.5,
    fly: (t, s, h) => (t < 2.5 ? level(s, h, 1.5, { pitch: t > 0.5 ? 0.25 : 0 }) : { arm: false }) },
  'spotter': { start: [-6, 3, -12, 90], cam: [0, 1.7, 5], loop: 12,
    fly: (t, s) => { const a = t * 0.5 + Math.PI; return steer(s, 7 * Math.cos(a) - s.pos[0], -12 + 4 * Math.sin(a) - s.pos[2], 4, 3); } },
  'find-nose': { start: [3, 2.5, -10, 135], cam: NOSE_CAM, nose: true, scale: 3, loop: 8,
    fly: (t, s, h) => (between(t, 1.5, 2.3) ? level(s, h, 2.5, { pitch: 0.3 }) : between(t, 2.3, 3) ? level(s, h, 2.5, { pitch: -0.3 }) : level(s, h, 2.5, { yaw: t > 3.5 ? h.turn(s, 0) : 0 })) },
  // Chapter 7
  'angle-release': { start: SPOT, cam: [0, 2.6, -2.5], loop: 5, slow: 0.6,
    fly: (t, s, h) => level(s, h, 2.5, { roll: between(t, 1, 2.2) ? 0.5 : 0 }) },
  'acro-release': { start: [-3, 5, -9], mode: 'acro', cam: [0, 3.2, -2.5], loop: 4, slow: 0.6,
    fly: (t, s, h) => ({ roll: between(t, 1, 1.4) ? 0.2 : 0, throttle: h.hover }) },
  'rates-curve': { curve: true, start: [0, 8, -10], mode: 'acro', cam: [0, 4, -2], loop: 4, slow: 0.4,
    fly: (t, s, h) => ({ roll: between(t, 1, 1.537) ? 1 : 0, throttle: h.hover }) },   // 360 deg at the full-stick rate
  'acro-level': { start: [-3, 5, -9], mode: 'acro', cam: [0, 3.2, -2.5], loop: 5, slow: 0.6,
    fly: (t, s, h) => ({ roll: between(t, 1, 1.4) ? 0.2 : between(t, 2.2, 2.6) ? -0.2 : 0, throttle: h.hover }) },
};

// Sticks and arm state for demo `def` at this moment.
const ZERO = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
export function runDemo(def, s, h) {
  const r = def.fly(s.time, s, h) || {};
  return { sticks: { ...ZERO, roll: r.roll || 0, pitch: r.pitch || 0, yaw: r.yaw || 0, throttle: r.throttle || 0 }, arm: r.arm !== false };
}

// Where demo `def` starts on run `run`.
export const demoStart = (def, run = 0) => (typeof def.start === 'function' ? def.start(run) : def.start);

// Motor tags for a held moment: 'faster' / 'slower' against the mean thrust (more than 10 % off), else ''.
export function motorTags(thrust) {
  const m = thrust.reduce((a, b) => a + b, 0) / thrust.length || 1;
  return thrust.map((f) => (f > m * 1.1 ? 'faster' : f < m * 0.9 ? 'slower' : ''));
}
// Spread of the motor thrusts ((max - min) / mean).
export const thrustSpread = (thrust) => {
  const m = thrust.reduce((a, b) => a + b, 0) / thrust.length || 1;
  return (Math.max(...thrust) - Math.min(...thrust)) / m;
};
// Call once per frame with this frame's thrusts; true on the first frame after a peak of the spread above `min`.
export function peakWatch(w, thrust, min = 0.2) {
  const sp = thrustSpread(thrust), prev = w.prev ?? 0;
  const peak = !!w.rising && sp < prev && prev > min;
  w.rising = sp > prev; w.prev = sp;
  return peak;
}
// One line for held moment n (0: the push that starts the tip, 1: the catch that stops it), from the tags and the
// motor layout (sx > 0: right side, sz < 0: front).
export function holdLine(tags, motors, n = 0) {
  const r = motors.filter((m, i) => tags[i] === 'faster');
  const f = r.length !== 2 ? null : r[0].sx === r[1].sx ? (r[0].sx > 0 ? 'right' : 'left') : r[0].sz === r[1].sz ? (r[0].sz < 0 ? 'front' : 'back') : null;
  if (!f) return 'Held: the motors differ';
  const away = { left: 'right', right: 'left', front: 'backward', back: 'forward' }[f];
  return n === 0 ? `Held: the ${f} motors spin faster, so the drone starts to tip ${away}.` : `Held: now the ${f} motors spin faster, to stop the tip at the angle the stick asks for.`;
}
