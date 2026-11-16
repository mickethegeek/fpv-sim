// Rigid-body quad physics. No DOM, runs in node and browser.
// Conventions (fixed here so every leg agrees):
//   World frame: three.js style, Y up, right-handed. Units SI (m, kg, s, rad).
//   Body frame:  +X right, +Y up (thrust axis), -Z forward (nose).
//   Orientation: unit quaternion [x, y, z, w], body -> world.
//   omega: body-frame angular velocity, rad/s. +X = nose up, +Y = yaw left, +Z = right wing up.
//   Motors: 0 front-right, 1 back-right, 2 back-left, 3 front-left. Speed 0..1.
export const PHYSICS_HZ = 1000;
export const GRAVITY = 9.80665;

// Motor layout: sign of x, sign of z, spin sign (reaction torque about +Y per unit thrust).
export const MOTORS = [
  { sx: +1, sz: -1, spin: +1 },
  { sx: +1, sz: +1, spin: -1 },
  { sx: -1, sz: +1, spin: +1 },
  { sx: -1, sz: -1, spin: -1 },
];

export function createState(y = 0.05) {
  return {
    pos: [0, y, 0],
    vel: [0, 0, 0],
    quat: [0, 0, 0, 1],
    omega: [0, 0, 0],
    motors: [0, 0, 0, 0],   // actual motor speed 0..1 (after lag)
    onGround: false,
    crashed: false,
    time: 0,
  };
}

// Rotate vector v by quaternion q (body -> world).
export function rotate(q, v, out = [0, 0, 0]) {
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  out[0] = vx + w * tx + (y * tz - z * ty);
  out[1] = vy + w * ty + (z * tx - x * tz);
  out[2] = vz + w * tz + (x * ty - y * tx);
  return out;
}

export function bodyUp(q, out) { return rotate(q, [0, 1, 0], out); }

// Static-plus-inflow thrust of one motor (N). u = motor speed 0..1, vAxial = airspeed along thrust axis.
export function motorThrust(u, vAxial, p) {
  const t = p.maxThrustPerMotor * u * (u - vAxial / p.pitchSpeed);
  const cap = 1.25 * p.maxThrustPerMotor * u * u; // descending into own wash: limited gain
  return t < 0 ? 0 : (t > cap ? cap : t);
}

const _up = [0, 0, 0];

// Advance the state by dt seconds. cmd = commanded motor speeds [4], each 0..1. Mutates and returns state.
// world (optional): { hit(pos) -> truthy when the quad touches an obstacle } (see world.js). Any obstacle hit is a crash.
export function stepPhysics(s, cmd, dt, p, world) {
  if (s.crashed) return s;
  // Motor lag.
  const a = 1 - Math.exp(-dt / p.motorTau);
  for (let i = 0; i < 4; i++) {
    const c = cmd[i] < 0 ? 0 : cmd[i] > 1 ? 1 : cmd[i];
    s.motors[i] += (c - s.motors[i]) * a;
  }
  // Forces and torques.
  bodyUp(s.quat, _up);
  const vAxial = s.vel[0] * _up[0] + s.vel[1] * _up[1] + s.vel[2] * _up[2];
  const d = p.armLength * Math.SQRT1_2;
  let thrust = 0, tx = 0, ty = 0, tz = 0;
  for (let i = 0; i < 4; i++) {
    const f = motorThrust(s.motors[i], vAxial, p);
    const m = MOTORS[i];
    thrust += f;
    tx += -m.sz * d * f;
    tz += m.sx * d * f;
    ty += m.spin * p.yawTorquePerThrust * f;
  }
  const speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  const drag = p.dragLinear + p.dragQuadratic * speed;
  const ax = (thrust * _up[0] - drag * s.vel[0]) / p.mass;
  const ay = (thrust * _up[1] - drag * s.vel[1]) / p.mass - GRAVITY;
  const az = (thrust * _up[2] - drag * s.vel[2]) / p.mass;

  // Angular: I * domega = torque - omega x (I * omega).
  const [ix, iy, iz] = p.inertia;
  const [wx, wy, wz] = s.omega;
  s.omega[0] = wx + dt * (tx - (wy * iz * wz - wz * iy * wy)) / ix;
  s.omega[1] = wy + dt * (ty - (wz * ix * wx - wx * iz * wz)) / iy;
  s.omega[2] = wz + dt * (tz - (wx * iy * wy - wy * ix * wx)) / iz;

  // Linear (semi-implicit Euler).
  s.vel[0] += ax * dt; s.vel[1] += ay * dt; s.vel[2] += az * dt;
  s.pos[0] += s.vel[0] * dt; s.pos[1] += s.vel[1] * dt; s.pos[2] += s.vel[2] * dt;

  // Orientation: q += 0.5 * q * (omega, 0) * dt, then normalise.
  const [qx, qy, qz, qw] = s.quat;
  const ox = s.omega[0], oy = s.omega[1], oz = s.omega[2], h = 0.5 * dt;
  let nx = qx + h * (qw * ox + qy * oz - qz * oy);
  let ny = qy + h * (qw * oy + qz * ox - qx * oz);
  let nz = qz + h * (qw * oz + qx * oy - qy * ox);
  let nw = qw - h * (qx * ox + qy * oy + qz * oz);
  const n = 1 / Math.hypot(nx, ny, nz, nw);
  s.quat[0] = nx * n; s.quat[1] = ny * n; s.quat[2] = nz * n; s.quat[3] = nw * n;

  // Ground.
  s.onGround = false;
  if (s.pos[1] <= p.groundHeight) {
    const impact = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
    bodyUp(s.quat, _up);
    if (s.vel[1] < 0 && (impact > p.crashSpeed || _up[1] < 0.5)) {
      s.crashed = true; s.crashedInto = 'ground';
      s.vel[0] = s.vel[1] = s.vel[2] = 0;
      s.omega[0] = s.omega[1] = s.omega[2] = 0;
    } else {
      s.onGround = true;
      if (s.vel[1] < 0) s.vel[1] = 0;
      // Skids on grass: kill sliding and spinning quickly.
      const k = Math.exp(-dt * 8);
      s.vel[0] *= k; s.vel[2] *= k;
      s.omega[0] *= k; s.omega[1] *= k; s.omega[2] *= k;
    }
    s.pos[1] = p.groundHeight;
  }
  if (world && !s.crashed) {
    const what = world.hit(s.pos);
    if (what) {
      s.crashed = true; s.crashedInto = what;
      s.vel[0] = s.vel[1] = s.vel[2] = 0;
      s.omega[0] = s.omega[1] = s.omega[2] = 0;
    }
  }
  s.time += dt;
  return s;
}

// Attitude as the pilot sees it, radians. roll + = right wing down, pitch + = nose up, yaw + = nose right of -Z (north).
export function attitude(q) {
  const f = rotate(q, [0, 0, -1]), r = rotate(q, [1, 0, 0]), u = rotate(q, [0, 1, 0]);
  return {
    roll: Math.atan2(-r[1], u[1]),
    pitch: Math.asin(Math.max(-1, Math.min(1, f[1]))),
    yaw: Math.atan2(f[0], -f[2]),
  };
}
