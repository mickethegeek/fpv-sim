// Entry point. Wires input, sim, FPV camera, HUD and the render loop.
// Physics lives in sim.js / physics.js / flightcontroller.js / world.js (no DOM there).
import * as THREE from '../vendor/three.module.min.js';
import { PHYSICS_HZ, attitude } from './physics.js';
import { MODES } from './flightcontroller.js';
import { createSim, resetSim, simAdvance } from './sim.js';
import { DEG } from './params.js';
import { InputManager, KEY_HELP } from './input.js';
import { SetupScreen } from './setup.js';
import { createWorld } from './world.js';
import { buildScene, buildQuadModel, verticalFov } from './scene.js';

// View settings (M6 puts these in the settings panel).
const view = {
  uptiltDeg: 25,   // camera tilted up from the quad's nose
  fovDeg: 115,     // horizontal field of view
  chase: false,    // C toggles an outside view (handy to see what the quad is doing)
};
const CRASH_PAUSE = 1.5; // s shown "crashed" before the automatic reset

const world = createWorld();
const sim = createSim({ mode: MODES.ANGLE, world });
// Sticks the sim flies on: copied from the controller/keyboard each frame, unless a test script has taken over.
const sticks = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
const input = new InputManager(window);
const setup = new SetupScreen(input);
let scripted = false; // true once the flight script drives the sticks directly (window.__sim.setSticks)
let crashTimer = 0;
let crashes = 0;

function resetFlight() {
  resetSim(sim);
  input.disarm();
  crashTimer = 0;
  Object.assign(sticks, { roll: 0, pitch: 0, yaw: 0, throttle: 0 });
}
function toggleMode() { sim.mode = sim.mode === MODES.ACRO ? MODES.ANGLE : MODES.ACRO; }

// Test hook: the Playwright flight script (test/flight.mjs) drives and reads the sim through this.
const hook = (window.__sim = {
  ready: false, frames: 0, errors: [], physicsHz: PHYSICS_HZ, physicsSteps: 0,
  sim, sticks, input, setup, view, world, get scene() { return scene; }, get camera() { return camera; },
  setSticks(s) { scripted = true; Object.assign(sticks, s); },
  arm(on = true) { scripted = true; sim.armed = on; },
  setMode(m) { sim.mode = m; },
  reset() { resetFlight(); },
  useInput() { scripted = false; resetFlight(); }, // hand control back to the controller/keyboard
  // Put the quad somewhere in the air (tests and, later, lessons). yawDeg: 0 = facing -Z, + = turned right.
  place(x, y, z, yawDeg = 0) {
    resetFlight();
    sim.state.pos = [x, y, z];
    const h = (-yawDeg * DEG) / 2;
    sim.state.quat = [0, Math.sin(h), 0, Math.cos(h)];
  },
  snapshot() {
    const s = sim.state, a = attitude(s.quat);
    return { pos: [...s.pos], vel: [...s.vel], quat: [...s.quat], omega: [...s.omega], motors: [...s.motors],
      rollDeg: a.roll / DEG, pitchDeg: a.pitch / DEG, yawDeg: a.yaw / DEG,
      onGround: s.onGround, crashed: s.crashed, crashedInto: s.crashedInto || null, crashes,
      armed: sim.armed, mode: sim.mode, time: s.time,
      sticks: { ...sticks }, source: input.source, hint: input.hint, setupOpen: setup.open,
      camera: { fov: camera.fov, pos: camera.position.toArray(), dir: camera.getWorldDirection(new THREE.Vector3()).toArray() } };
  },
});
window.addEventListener('error', (e) => hook.errors.push(String(e.message)));

const canvas = document.getElementById('view');
const hud = Object.fromEntries(['state', 'mode', 'thr', 'speed', 'alt'].map((k) => [k, document.getElementById('hud-' + k)]));
const hintEl = document.getElementById('hint');
const controllerEl = document.getElementById('controller');
const keysEl = document.getElementById('keys');
keysEl.innerHTML = KEY_HELP.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
document.getElementById('btn-setup').addEventListener('click', (e) => { e.currentTarget.blur(); setup.start(); });
document.getElementById('btn-reset').addEventListener('click', (e) => { e.currentTarget.blur(); resetFlight(); });
window.addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) view.chase = !view.chase; });

// ?fast in the URL turns antialiasing off (slow machines, and the software-GL test browser).
const fast = new URLSearchParams(location.search).has('fast');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !fast });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = buildScene(world, renderer, { fast });
const quadModel = buildQuadModel();
scene.add(quadModel);
const camera = new THREE.PerspectiveCamera(80, 1, 0.03, 2500);
const sky = scene.getObjectByName('sky');

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
}
window.addEventListener('resize', resize);
resize();

const qBody = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), X_AXIS = new THREE.Vector3(1, 0, 0);
const camOffset = new THREE.Vector3(), chasePos = new THREE.Vector3(0, 1, 3), tmp = new THREE.Vector3();
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  setup.update(dt);
  const inp = input.update(dt);
  if (!scripted) {
    Object.assign(sticks, inp.sticks);
    for (const ev of inp.events) { if (ev === 'mode') toggleMode(); else if (ev === 'reset') resetFlight(); }
    if (inp.acroSwitch !== null) sim.mode = inp.acroSwitch ? MODES.ACRO : MODES.ANGLE;
    sim.armed = input.armed && !sim.state.crashed;
  }
  hook.physicsSteps += simAdvance(sim, sticks, dt);

  // Crash: freeze, show it for a moment, then put the quad back on the pad, disarmed.
  if (sim.state.crashed) {
    if (crashTimer === 0) { crashes++; input.disarm(); sim.armed = false; }
    crashTimer += dt;
    if (crashTimer >= CRASH_PAUSE) resetFlight();
  }

  // Cameras.
  const s = sim.state;
  quadModel.position.set(s.pos[0], s.pos[1], s.pos[2]);
  qBody.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
  quadModel.quaternion.copy(qBody);
  quadModel.visible = view.chase;
  if (view.chase) {
    // Behind and above the quad, following its heading only (not its roll/pitch).
    const yaw = attitude(s.quat).yaw;
    tmp.set(s.pos[0] - Math.sin(yaw) * 2.2, s.pos[1] + 0.8, s.pos[2] + Math.cos(yaw) * 2.2);
    chasePos.lerp(tmp, Math.min(1, dt * 8));
    camera.position.copy(chasePos);
    camera.fov = 60;
    camera.lookAt(quadModel.position);
  } else {
    // FPV: camera bolted to the frame, a little ahead of centre, tilted up by the uptilt angle.
    camOffset.set(0, 0.03, -0.06).applyQuaternion(qBody);
    camera.position.copy(quadModel.position).add(camOffset);
    qTilt.setFromAxisAngle(X_AXIS, view.uptiltDeg * DEG);
    camera.quaternion.copy(qBody).multiply(qTilt);
    camera.fov = verticalFov(view.fovDeg, camera.aspect);
  }
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);

  // HUD and panels.
  const speed = Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
  const state = s.crashed ? 'CRASHED' : sim.armed ? 'ARMED' : 'DISARMED';
  setText(hud.state, state);
  hud.state.dataset.state = state;
  setText(hud.mode, sim.mode === MODES.ACRO ? 'ACRO' : 'ANGLE');
  setText(hud.thr, `${Math.round(sticks.throttle * 100)}%`);
  setText(hud.speed, `${Math.round(speed * 3.6)} km/h`);
  setText(hud.alt, `${s.pos[1].toFixed(1)} m`);
  let ctl = 'Keyboard (no controller found: plug one in and press a button)';
  if (input.gamepadId) ctl = input.needsSetup ? `Controller needs setup: ${input.gamepadId}` : `Controller: ${input.gamepadId}`;
  if (setup.message) ctl += ` · ${setup.message}`;
  setText(controllerEl, ctl);
  keysEl.hidden = input.source !== 'keyboard';
  document.body.classList.toggle('flying', sim.armed);
  let hint = inp.hint;
  if (s.crashed) hint = `Crashed${s.crashedInto && s.crashedInto !== 'ground' ? ' into a ' + s.crashedInto : ''}. Resetting…`;
  else if (!sim.armed && !hint && !setup.open && !scripted) {
    hint = input.source === 'gamepad' ? 'Throttle down, then arm to fly' : 'Press Space to arm, then hold W to take off';
  }
  hintEl.hidden = !hint;
  if (hint) setText(hintEl, hint);

  renderer.render(scene, camera);
  hook.frames++;
  hook.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
