// All tunable numbers in one place. Where each comes from: docs/physics.md.
export const DEG = Math.PI / 180;

export function defaultQuad() {
  const mass = 0.68;            // kg, uncited (PLAN range)
  const thrustToWeight = 9;     // uncited (PLAN range)
  return {
    mass,
    // Body axes: X right (pitch axis), Y up (yaw axis), Z back (roll axis).
    inertia: [2.1e-3, 4.3e-3, 2.5e-3], // kg m^2, cited [7] (pitch, yaw, roll)
    armLength: 0.11,            // m, motor to centre, uncited
    maxThrustPerMotor: (thrustToWeight * mass * 9.80665) / 4, // N static
    motorTau: 0.033,            // s, first-order lag on motor speed, cited (docs/feel.md F8)
    yawTorquePerThrust: 0.0122, // m, derived from [7]
    dragLinear: 0.3,            // N per m/s, cited [7]
    dragQuadratic: 0.006,       // N per (m/s)^2, uncited
    thrustExponent: 1.4,        // static thrust = max * command^1.4, fitted to bench thrust tables (docs/feel.md, note 2)
    pitchSpeed: 65,             // m/s at full throttle, tuned for ~150 km/h level top speed [8]
    crashSpeed: 6,              // m/s impact speed that counts as a crash (assumption)
    groundHeight: 0.05,         // m, height of the centre of mass when sitting on the ground
  };
}

export function defaultRates() {
  // Betaflight defaults, Actual rates, cited [1][2]. Units deg/s.
  const axis = () => ({ center: 70, max: 670, expo: 0 });
  return { roll: axis(), pitch: axis(), yaw: axis() };
}

export function defaultFc() {
  return {
    rates: defaultRates(),
    angleLimit: 60,   // deg, Betaflight default, cited [3]
    angleGain: 10,    // deg/s per deg of error; tuned for a 200 ms lean with no overshoot (docs/feel.md)
    rateLimit: 1998,  // deg/s, cited [2]
    // Rate PID in physical units: output is angular acceleration (rad/s^2) per rad/s of error.
    kp: 120, ki: 30, kd: 1.5, iLimit: 3, // tuned to the step-response targets in docs/feel.md
    iRelax: 60,       // deg/s: the I-term only accumulates when the rate error is below this
    idle: 0.05,       // minimum motor command when armed (assumption)
    throttleLimit: 1, // Betaflight throttle limit, SCALE type: full stick gives this fraction of full command
  };
}

// Throttle stick (0..1) that hovers: thrust = weight, through the idle offset, the throttle limit and the thrust curve.
export function hoverStick(quad = defaultQuad(), fc = defaultFc()) { return stickForThrust(1, quad, fc); }
// Throttle stick that gives `ratio` times the quad's weight in static thrust.
export function stickForThrust(ratio, quad = defaultQuad(), fc = defaultFc()) {
  const cmd = (Math.max(0, ratio) * (quad.mass * 9.80665) / (4 * quad.maxThrustPerMotor)) ** (1 / quad.thrustExponent);
  return Math.max(0, Math.min(1, (cmd - fc.idle) / ((1 - fc.idle) * (fc.throttleLimit ?? 1))));
}

// Presets: the same 5-inch quad, set up two ways. Sources: docs/feel.md.
//   freestyle: full power, Betaflight default rates.
//   trainer:   what pilots do to tame a 5-inch for a beginner: Betaflight throttle limit (SCALE) at 60 %,
//              which leaves a thrust-to-weight of about 4.4, plus slower rates and a gentler angle-mode tilt.
export const PRESETS = {
  trainer: { label: 'Trainer', throttleLimit: 0.6, rateMax: 400, rateCenter: 70, expo: 0, angleLimit: 40 },
  freestyle: { label: '5-inch freestyle', throttleLimit: 1, rateMax: 670, rateCenter: 70, expo: 0, angleLimit: 60 },
};
export const DEFAULT_PRESET = 'trainer';
