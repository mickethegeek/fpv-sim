// M12 inertia / coupling fixes. Each test fails on the model before M12 (docs/inertia-review.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, stepPhysics, PHYSICS_HZ } from '../../src/physics.js';
import { defaultQuad, DEG } from '../../src/params.js';

const DT = 1 / PHYSICS_HZ;
const hoverCmd = (q) => ((q.mass * 9.80665) / (4 * q.maxThrustPerMotor)) ** (1 / q.thrustExponent);

test('I2: spinning props damp a roll or pitch rotation (motors held, no flight controller)', () => {
  const q = defaultQuad(), c = hoverCmd(q);
  for (const axis of [0, 2]) {
    const s = createState(50); s.motors = [c, c, c, c]; s.omega[axis] = 300 * DEG;
    for (let i = 0; i < 500; i++) stepPhysics(s, [c, c, c, c], DT, q);
    const left = s.omega[axis] / (300 * DEG);
    // Before M12 nothing slowed it (left = 1.00). Derived time constant at hover about 1.3 s: e^(-0.5/1.3) = 0.68.
    assert.ok(left < 0.85 && left > 0.5, `axis ${axis}: ${(left * 100).toFixed(0)} % of the rate left after 0.5 s`);
  }
});

test('I3: rotor drag is in the body frame: it turns with the quad (in the rotor plane only)', () => {
  const q = defaultQuad(); q.dragQuadratic = 0; q.pitchSpeed = 1e9; // no inflow effect: drag alone
  const c = hoverCmd(q);
  const decel = (quat, vel) => {
    const s = createState(100); s.quat = quat; s.vel = [...vel]; s.motors = [c, c, c, c];
    stepPhysics(s, [c, c, c, c], DT, q);
    const t = rotateThrust(quat, q, c);
    return ((vel[0] - s.vel[0]) / DT - t) * q.mass / vel[0];   // N per m/s along the motion, thrust removed
  };
  const level = decel([0, 0, 0, 1], [10, 0, 0]);                         // sideways through the rotor plane
  const rolled = decel([0, 0, Math.SQRT1_2, Math.SQRT1_2], [10, 0, 0]);  // rolled 90: the same motion is now along the thrust axis
  assert.ok(Math.abs(level - 0.3) < 0.01, `in-plane ${level.toFixed(3)}`);
  assert.ok(Math.abs(rolled) < 0.01, `along the thrust axis ${rolled.toFixed(3)}`);
});

// x-acceleration from thrust alone for the given attitude (only the rolled case has any).
function rotateThrust(quat, q, c) {
  const f = 4 * q.maxThrustPerMotor * c ** q.thrustExponent / q.mass;
  return quat[2] ? f : 0;   // rolled +90 about z: body up points to -x, so thrust decelerates +x motion
}

test('I4: rotor drag grows with prop speed and is gone with the props stopped', () => {
  const q = defaultQuad(); q.dragQuadratic = 0;
  const k = (cmd) => {
    const s = createState(100); s.vel = [10, 0, 0]; s.motors = [cmd, cmd, cmd, cmd];
    stepPhysics(s, [cmd, cmd, cmd, cmd], DT, q);
    return (10 - s.vel[0]) / DT * q.mass / 10;
  };
  const nHover = Math.sqrt(q.mass * 9.80665 / (4 * q.maxThrustPerMotor));
  assert.ok(Math.abs(k(0)) < 1e-6, `stopped ${k(0)}`);
  assert.ok(Math.abs(k(hoverCmd(q)) - 0.3) < 0.01, `hover ${k(hoverCmd(q)).toFixed(3)}`);
  assert.ok(Math.abs(k(1) - 0.3 / nHover) < 0.02, `full ${k(1).toFixed(3)} (want ${(0.3 / nHover).toFixed(3)})`);
});
