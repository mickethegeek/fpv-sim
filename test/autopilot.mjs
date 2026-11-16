// A simple autopilot that flies the gate course in ANGLE mode. Test tool only: it proves the course can be
// flown with the real physics and flight controller (unit test in node, flight script in the browser).
// It reads the quad state and returns sticks, exactly what a pilot would give.
import { rotate, GRAVITY } from '../src/physics.js';
import { gateLocal } from '../src/course.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function createAutopilot(course, opts = {}) {
  const speed = opts.speed ?? 7, alt = opts.alt ?? 1.2, maxTilt = (opts.maxTiltDeg ?? 60) * Math.PI / 180;
  const ap = { target: opts.startGate ?? 0, passes: 0 };
  const f = [0, 0, 0], up = [0, 0, 0];
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
    const vx = (tx / d) * speed * turning, vz = (tz / d) * speed * turning;
    // Wanted horizontal acceleration, limited to a gentle bank.
    let ax = 1.6 * (vx - s.vel[0]), az = 1.6 * (vz - s.vel[2]);
    const a = Math.hypot(ax, az), aMax = 5.5;
    if (a > aMax) { ax *= aMax / a; az *= aMax / a; }
    // In the quad's heading frame.
    rotate(s.quat, [0, 0, -1], f);
    const fn = Math.hypot(f[0], f[2]) || 1, fx = f[0] / fn, fz = f[2] / fn;
    const aF = ax * fx + az * fz, aR = ax * -fz + az * fx;
    const pitch = clamp(Math.atan(aF / GRAVITY) / maxTilt, -1, 1);
    const roll = clamp(Math.atan(aR / GRAVITY) / maxTilt, -1, 1);
    // Turn the nose toward where we are going.
    const yawErr = Math.atan2(tx * -fz + tz * fx, tx * fx + tz * fz);
    const yaw = clamp(yawErr * 0.9, -0.6, 0.6);
    // Hold height.
    rotate(s.quat, [0, 1, 0], up);
    const climb = clamp(2.5 * (alt - s.pos[1]) - 2.5 * s.vel[1], -4, 6);
    const throttle = clamp(Math.sqrt(Math.max(0, (1 + climb / GRAVITY) / Math.max(0.5, up[1])) / 9), 0.05, 0.9);
    return { roll, pitch, yaw, throttle };
  };
  return ap;
}
