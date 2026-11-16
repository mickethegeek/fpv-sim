// Force arrows drawn on the quad: thrust of each motor (yellow), weight (red), velocity (blue).
// The lengths are the sim's real values this frame: thrust from motorThrust() in physics.js, weight = mass x g.
import * as THREE from '../vendor/three.module.min.js';
import { MOTORS, GRAVITY, motorThrust, rotate } from './physics.js';

export const NEWTON = 0.22;   // m of arrow per newton (weight of the 0.68 kg quad = 1.5 m)
export const MPS = 0.25;      // m of arrow per m/s of speed

// The numbers behind the arrows (pure, unit-tested): thrust per motor in N, weight in N.
const _up = [0, 0, 0];
export function forces(s, quad) {
  rotate(s.quat, [0, 1, 0], _up);
  const w = quad.wind && !s.onGround ? quad.wind : [0, 0, 0];
  const vAxial = (s.vel[0] - w[0]) * _up[0] + (s.vel[1] - w[1]) * _up[1] + (s.vel[2] - w[2]) * _up[2];
  return { thrust: s.motors.map((u) => motorThrust(u, vAxial, quad)), weight: quad.mass * GRAVITY, up: [..._up] };
}

export function buildArrows() {
  const group = new THREE.Group();
  const mk = (color) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, color, 0.16, 0.1);
    for (const m of [a.line.material, a.cone.material]) { m.depthTest = false; m.transparent = true; }
    a.renderOrder = 10; a.line.renderOrder = 10; a.cone.renderOrder = 10;
    group.add(a);
    return a;
  };
  const thrust = MOTORS.map(() => mk(0xffd23f)), weight = mk(0xff5a4d), vel = mk(0x4db8ff);
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), dir = new THREE.Vector3();
  const show = (a, len) => { a.visible = len > 0.03; if (a.visible) a.setLength(len, Math.min(0.16, len * 0.5), Math.min(0.1, len * 0.3)); };
  group.visible = false;
  // scale: how much bigger the quad model is drawn (the motor arrows start at the drawn motors).
  group.update = (s, quad, scale = 1) => {
    const f = forces(s, quad), d = quad.armLength * Math.SQRT1_2 * scale;
    q.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
    dir.set(f.up[0], f.up[1], f.up[2]);
    MOTORS.forEach((m, i) => {
      v.set(m.sx * d, 0.03 * scale, m.sz * d).applyQuaternion(q);
      thrust[i].position.set(s.pos[0] + v.x, s.pos[1] + v.y, s.pos[2] + v.z);
      thrust[i].setDirection(dir);
      show(thrust[i], f.thrust[i] * NEWTON);
    });
    weight.position.set(s.pos[0], s.pos[1], s.pos[2]);
    weight.setDirection(v.set(0, -1, 0));
    show(weight, f.weight * NEWTON);
    const speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
    vel.position.set(s.pos[0], s.pos[1], s.pos[2]);
    if (speed > 0.2) vel.setDirection(v.set(s.vel[0] / speed, s.vel[1] / speed, s.vel[2] / speed));
    show(vel, speed > 0.2 ? speed * MPS : 0);
  };
  return group;
}
