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
    motorTau: 0.030,            // s, first-order lag on motor speed, uncited
    yawTorquePerThrust: 0.0122, // m, derived from [7]
    dragLinear: 0.3,            // N per m/s, cited [7]
    dragQuadratic: 0.006,       // N per (m/s)^2, uncited
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
    angleGain: 5,     // deg/s per deg of error, derived [3][4]
    rateLimit: 1998,  // deg/s, cited [2]
    // Rate PID in physical units: output is angular acceleration (rad/s^2) per rad/s of error.
    kp: 25, ki: 30, kd: 0.3, iLimit: 3,
    iRelax: 60,       // deg/s: the I-term only accumulates when the rate error is below this
    idle: 0.05,       // minimum motor speed when armed (assumption)
  };
}
