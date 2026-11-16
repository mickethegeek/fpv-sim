// Glue: flight controller + physics at a fixed 1 kHz step. No DOM.
import { createState, stepPhysics, PHYSICS_HZ } from './physics.js';
import { createFcState, fcUpdate, MODES } from './flightcontroller.js';
import { defaultQuad, defaultFc } from './params.js';

export function createSim(opts = {}) {
  const quad = opts.quad || defaultQuad();
  return {
    quad,
    fcCfg: opts.fcCfg || defaultFc(),
    state: createState(quad.groundHeight),
    fc: createFcState(),
    mode: opts.mode || MODES.ANGLE,
    armed: false,
    acc: 0,
  };
}

export function resetSim(sim) {
  sim.state = createState(sim.quad.groundHeight);
  sim.fc = createFcState();
  sim.armed = false;
  sim.acc = 0;
}

// Run exactly n physics steps with constant sticks.
export function simSteps(sim, sticks, n) {
  const dt = 1 / PHYSICS_HZ;
  for (let i = 0; i < n; i++) {
    const cmd = fcUpdate(sim.fc, sticks, sim.mode, sim.armed, sim.state, dt, sim.fcCfg, sim.quad);
    stepPhysics(sim.state, cmd, dt, sim.quad);
  }
}

// Advance by a frame's real time (seconds); runs as many fixed steps as fit. Caps catch-up at 50 ms.
export function simAdvance(sim, sticks, frameDt) {
  sim.acc += Math.min(frameDt, 0.05);
  const dt = 1 / PHYSICS_HZ;
  const n = Math.floor(sim.acc / dt);
  sim.acc -= n * dt;
  simSteps(sim, sticks, n);
  return n;
}
