// M12 step 1: reproduce the friend's manoeuvres on the real sim and print what happens.
// node test/inertia-repro.mjs   (no browser; same physics + flight controller as the page)
import { createSim, simSteps } from '../src/sim.js';
import { attitude, rotate, GRAVITY } from '../src/physics.js';
import { MODES } from '../src/flightcontroller.js';
import { hoverStick, DEG } from '../src/params.js';

const R = (x, n = 1) => x.toFixed(n);
function snap(sim, label) {
  const s = sim.state, a = attitude(s.quat), v = s.vel, sp = Math.hypot(...v);
  const thrust = s.motors.reduce((t, m) => t + m, 0);
  console.log(`${label.padEnd(26)} t=${R(s.time, 2)} alt=${R(s.pos[1])} v=[${v.map((x) => R(x)).join(',')}] |v|=${R(sp)} ` +
    `roll=${R(a.roll / DEG, 0)} pitch=${R(a.pitch / DEG, 0)} yaw=${R(a.yaw / DEG, 0)} ` +
    `w=[${s.omega.map((x) => R(x / DEG, 0)).join(',')}]deg/s motors=[${s.motors.map((m) => R(m, 2)).join(',')}]`);
}
function startAt(alt, vel, mode = MODES.ACRO) {
  const sim = createSim({ mode });
  sim.state.pos[1] = alt; sim.state.vel = [...vel]; sim.armed = true;
  return sim;
}
const ms = (sec) => Math.round(sec * 1000);
const st = (o) => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0, ...o });

console.log('--- A. Falling from 50 m, throttle 0, ARMED, acro, full roll stick for 1 s, then let go');
let sim = startAt(50, [0, 0, -15]);
snap(sim, 'start');
simSteps(sim, st({ roll: 1 }), ms(1)); snap(sim, 'after 1 s full roll');
simSteps(sim, st({}), ms(1)); snap(sim, 'after 1 s centred');

console.log('--- B. Same, DISARMED: spinning at 600 deg/s roll when disarmed');
sim = startAt(50, [0, 0, -15]); sim.state.omega = [0, 0, -600 * DEG]; sim.armed = false;
snap(sim, 'start');
simSteps(sim, st({}), ms(1)); snap(sim, 'disarmed 1 s');
simSteps(sim, st({}), ms(2)); snap(sim, 'disarmed 3 s');

console.log('--- C. Zero-throttle flip (armed, acro): collective thrust during the flip');
sim = startAt(50, [0, 0, 0]);
let peak = 0, imp = 0;
for (let i = 0; i < 600; i++) {
  simSteps(sim, st({ roll: 1 }), 1);
  const f = sim.state.motors.reduce((t, m) => t + sim.quad.maxThrustPerMotor * m ** sim.quad.thrustExponent, 0);
  peak = Math.max(peak, f); imp += f / 1000;
}
snap(sim, '0.6 s full roll at 0 thr');
console.log(`   peak collective thrust ${R(peak)} N = ${R(peak / (sim.quad.mass * GRAVITY), 2)} x weight; mean ${R(imp / 0.6)} N`);

console.log('--- D. Fast forward 30 m/s level, cut throttle, then yaw 90 deg (acro, full yaw)');
sim = startAt(30, [0, 0, -30]);
snap(sim, 'start');
simSteps(sim, st({ yaw: 1 }), ms(0.135)); snap(sim, 'after ~90 deg yaw');
simSteps(sim, st({}), ms(1)); snap(sim, '1 s later');

console.log('--- E. Falling flat vs falling edge-on: speed after 3 s from rest, disarmed');
for (const [name, q] of [['flat', [0, 0, 0, 1]], ['edge-on (rolled 90)', [0, 0, Math.SQRT1_2, Math.SQRT1_2]]]) {
  sim = startAt(200, [0, 0, 0]); sim.armed = false; sim.state.quat = [...q];
  simSteps(sim, st({}), ms(3)); snap(sim, name);
}

console.log('--- F. Punch out (full throttle 1 s) then cut, armed angle mode');
sim = startAt(5, [0, 0, 0], MODES.ANGLE);
simSteps(sim, st({ throttle: 1 }), ms(1)); snap(sim, 'after punch');
simSteps(sim, st({ throttle: 0 }), ms(1)); snap(sim, '1 s after cut');
simSteps(sim, st({ throttle: 0, roll: 1 }), ms(0.5)); snap(sim, '+0.5 s full roll stick');

console.log('--- G. Sideways slide: 20 m/s to the right with the quad level, throttle hover, 2 s');
sim = startAt(30, [20, 0, 0], MODES.ANGLE);
simSteps(sim, st({ throttle: hoverStick() }), ms(2)); snap(sim, 'after 2 s');
