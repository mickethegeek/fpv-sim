// Betaflight-like flight controller: sticks -> rate setpoint -> PID -> mixer.
// No DOM. Sources for the numbers and the rates formula: docs/physics.md.
//
// Sticks (pilot convention, Mode 2 semantics are handled by the input layer):
//   roll  -1..1, + = roll right        pitch -1..1, + = stick forward = nose down
//   yaw   -1..1, + = nose right        throttle 0..1
import { attitude, MOTORS } from './physics.js';
import { DEG } from './params.js';

export const MODES = Object.freeze({ ANGLE: 'angle', ACRO: 'acro' });

// Betaflight "Actual" rates (rc.c applyActualRates). x in -1..1, returns deg/s.
export function actualRate(x, r) {
  const ax = Math.abs(x);
  const expof = ax * (x ** 5 * r.expo + x * (1 - r.expo));
  return x * r.center + Math.max(0, r.max - r.center) * expof;
}

export function createFcState() {
  return { integ: [0, 0, 0], prevOmega: [0, 0, 0], setpoint: [0, 0, 0], out: [0, 0, 0, 0] };
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// Rate setpoint in pilot convention [roll, pitch(nose down +), yaw(right +)], deg/s.
export function rateSetpoint(sticks, mode, quat, cfg) {
  const yaw = actualRate(sticks.yaw, cfg.rates.yaw);
  let roll, pitch;
  if (mode === MODES.ANGLE) {
    const att = attitude(quat);
    const rollErr = sticks.roll * cfg.angleLimit - att.roll / DEG;
    const pitchErr = sticks.pitch * cfg.angleLimit - (-att.pitch / DEG);
    roll = clamp(cfg.angleGain * rollErr, -cfg.rates.roll.max, cfg.rates.roll.max);
    pitch = clamp(cfg.angleGain * pitchErr, -cfg.rates.pitch.max, cfg.rates.pitch.max);
  } else {
    roll = actualRate(sticks.roll, cfg.rates.roll);
    pitch = actualRate(sticks.pitch, cfg.rates.pitch);
  }
  const L = cfg.rateLimit;
  return [clamp(roll, -L, L), clamp(pitch, -L, L), clamp(yaw, -L, L)];
}

// One controller step. Returns commanded motor speeds [4] (0..1), reusing fc.out.
export function fcUpdate(fc, sticks, mode, armed, state, dt, cfg, quad) {
  const out = fc.out;
  if (!armed) {
    fc.integ[0] = fc.integ[1] = fc.integ[2] = 0;
    out[0] = out[1] = out[2] = out[3] = 0;
    return out;
  }
  const sp = rateSetpoint(sticks, mode, state.quat, cfg);
  fc.setpoint = sp;
  // Pilot rates -> body axes: wx = -pitch, wy = -yaw, wz = -roll.
  const target = [-sp[1] * DEG, -sp[2] * DEG, -sp[0] * DEG];
  const torque = [0, 0, 0];
  const spooled = sticks.throttle > 0.02 || !state.onGround;
  for (let i = 0; i < 3; i++) {
    const err = target[i] - state.omega[i];
    // I-term only builds while tracking closely (same idea as Betaflight's I-term relax): no windup during flips.
    if (!spooled) fc.integ[i] = 0;
    else if (Math.abs(err) < cfg.iRelax * DEG) fc.integ[i] = clamp(fc.integ[i] + err * dt, -cfg.iLimit, cfg.iLimit);
    const dOmega = (state.omega[i] - fc.prevOmega[i]) / dt;
    fc.prevOmega[i] = state.omega[i];
    const kd = i === 1 ? (cfg.kdYaw ?? cfg.kd) : cfg.kd;   // yaw: no D, as Betaflight 4.5 (PID_YAW_DEFAULT D = 0)
    const alpha = cfg.kp * err + cfg.ki * fc.integ[i] - kd * dOmega;
    torque[i] = quad.inertia[i] * alpha;
  }
  // Mixer: per-motor thrust (N), then to motor command with thrust ~ command^e.
  const tMax = quad.maxThrustPerMotor;
  const d = quad.armLength * Math.SQRT1_2;
  const e = quad.thrustExponent;
  // Like Betaflight, the stick goes linearly to the motor command (scaled by the throttle limit); thrust follows command^e.
  const thr = cfg.idle + (1 - cfg.idle) * clamp(sticks.throttle, 0, 1) * (cfg.throttleLimit ?? 1);
  const base = tMax * thr ** e;
  let lo = Infinity, hi = -Infinity;
  // Pidsum limits (Betaflight): one axis may move a motor's command by at most L, so in thrust (this mixer's space) a
  // motor pair can differ by at most tMax * (2L)^e (one at 0, the other at 2L). Half of that either side of the middle.
  const capRP = cfg.pidsumLimit ? tMax * (2 * cfg.pidsumLimit) ** e / 2 : Infinity;
  const capY = cfg.pidsumLimitYaw ? tMax * (2 * cfg.pidsumLimitYaw) ** e / 2 : Infinity;
  const dRoll = clamp(torque[2] / (4 * d), -capRP, capRP), dPitch = clamp(torque[0] / (4 * d), -capRP, capRP);
  const dYaw = clamp(torque[1] / (4 * quad.yawTorquePerThrust), -capY, capY);
  for (let i = 0; i < 4; i++) {
    const m = MOTORS[i];
    const f = base - m.sz * dPitch + m.sx * dRoll + m.spin * dYaw;
    out[i] = f;
    if (f < lo) lo = f;
    if (f > hi) hi = f;
  }
  // Airmode-style: keep the torque, shift the collective when a motor would saturate; scale if the spread is too big.
  const fMin = tMax * cfg.idle ** e;
  const range = tMax - fMin;
  let scale = 1, shift = 0;
  if (hi - lo > range) scale = range / (hi - lo);
  const mid = (hi + lo) / 2;
  const sLo = mid + (lo - mid) * scale, sHi = mid + (hi - mid) * scale;
  if (sLo < fMin) shift = fMin - sLo; else if (sHi > tMax) shift = tMax - sHi;
  for (let i = 0; i < 4; i++) {
    const f = mid + (out[i] - mid) * scale + shift;
    out[i] = (clamp(f, 0, tMax) / tMax) ** (1 / e);
  }
  return out;
}
