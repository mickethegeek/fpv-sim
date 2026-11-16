// Entry point. Wires input, sim, FPV camera, HUD and the render loop.
// Physics lives in sim.js / physics.js / flightcontroller.js / world.js (no DOM there).
import * as THREE from '../vendor/three.module.min.js';
import { PHYSICS_HZ, attitude, rotate } from './physics.js';
import { MODES } from './flightcontroller.js';
import { createSim, resetSim, simAdvance } from './sim.js';
import { DEG } from './params.js';
import { InputManager, KEY_HELP, buttonNames } from './input.js';
import { SetupScreen } from './setup.js';
import { createWorld } from './world.js';
import { buildScene, buildGates, buildQuadModel, verticalFov } from './scene.js';
import { PRESETS } from './params.js';
import { SLIDERS, defaultTuning, sanitizeTuning, buildConfig, loadTuning, saveTuning } from './tuning.js';
import { createRace, resetRace, raceUpdate, formatLap, loadBest, saveBest } from './course.js';

// View settings (M6 puts these in the settings panel).
const view = {
  uptiltDeg: 25,   // camera tilted up from the quad's nose
  fovDeg: 115,     // horizontal field of view
  chase: false,    // C toggles an outside view (handy to see what the quad is doing)
};
const CRASH_PAUSE = 1.5; // s shown "crashed" before the automatic reset

let storage = null;
try { storage = window.localStorage; } catch { /* blocked: settings and best lap last until the page closes */ }
const params = new URLSearchParams(location.search);
const world = createWorld();
const sim = createSim({ mode: MODES.ANGLE, world });
// Sticks the sim flies on: copied from the controller/keyboard each frame, unless a test script has taken over.
const sticks = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
const input = new InputManager(window);
const setup = new SetupScreen(input);
// Feel tuning: preset + sliders (src/tuning.js). ?preset=freestyle|trainer in the URL starts from that preset's defaults.
let tuning = params.has('preset') ? defaultTuning(params.get('preset')) : (storage && loadTuning(storage)) || defaultTuning();
let config = null;
function applyTuning(next, save = true) {
  tuning = sanitizeTuning(next);
  config = buildConfig(tuning);
  Object.assign(sim.quad, config.quad);
  Object.assign(sim.fcCfg, config.fc);
  input.tune = config.input;
  if (save && storage) saveTuning(storage, tuning);
  if (typeof renderTuning === 'function') renderTuning();
}
let scripted = false; // true once the flight script drives the sticks directly (window.__sim.setSticks)
let crashTimer = 0;
let autoSetupFor = null; // id of the controller the setup screen was opened for automatically (once per controller)
let crashes = 0;

// Gate course and lap timer. The best lap is kept in the browser (localStorage), per course.
const race = createRace(world.course, storage ? loadBest(world.course, storage) : null);
let racePrev = null;      // quad position and sim time at the previous frame
let toast = null;         // { text, best, left } message in the middle of the screen (lap done)

function resetFlight() {
  resetSim(sim);
  input.disarm();
  crashTimer = 0;
  resetRace(race);
  racePrev = null;
  Object.assign(sticks, { roll: 0, pitch: 0, yaw: 0, throttle: 0 });
}
function toggleMode() { sim.mode = sim.mode === MODES.ACRO ? MODES.ANGLE : MODES.ACRO; }

// Test hook: the Playwright flight script (test/flight.mjs) drives and reads the sim through this.
const hook = (window.__sim = {
  ready: false, frames: 0, errors: [], physicsHz: PHYSICS_HZ, physicsSteps: 0,
  sim, sticks, input, setup, view, world, race, get tuning() { return tuning; }, get config() { return config; },
  setTuning(t) { applyTuning({ ...tuning, ...t }); }, get scene() { return scene; }, get camera() { return camera; },
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
      race: { next: race.next, running: race.running, lapTime: race.lapTime, lastLap: race.lastLap, best: race.best, laps: race.laps, passed: race.passed },
      sticks: { ...sticks }, source: input.source, hint: input.hint, setupOpen: setup.open,
      camera: { fov: camera.fov, pos: camera.position.toArray(), dir: camera.getWorldDirection(new THREE.Vector3()).toArray() } };
  },
});
window.addEventListener('error', (e) => hook.errors.push(String(e.message)));

const canvas = document.getElementById('view');
const hud = Object.fromEntries(['state', 'mode', 'thr', 'speed', 'alt', 'gate', 'lap', 'best'].map((k) => [k, document.getElementById('hud-' + k)]));
const hintEl = document.getElementById('hint');
const guideEl = document.getElementById('guide'), guideArrow = document.getElementById('guide-arrow'), guideText = document.getElementById('guide-text');
const toastEl = document.getElementById('toast');
const controllerEl = document.getElementById('controller');
const keysEl = document.getElementById('keys');
keysEl.innerHTML = KEY_HELP.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
document.getElementById('btn-setup').addEventListener('click', (e) => { e.currentTarget.blur(); setup.start(); });
document.getElementById('btn-reset').addEventListener('click', (e) => { e.currentTarget.blur(); resetFlight(); });

// Feel tuning panel.
const presetEl = document.getElementById('tune-preset'), slidersEl = document.getElementById('tune-sliders'), tuneInfo = document.getElementById('tune-info');
presetEl.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
slidersEl.innerHTML = SLIDERS.map((s) => `<label class="tune-row"><span>${s.label}</span><output id="tune-out-${s.key}"></output>
  <input type="range" id="tune-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"></label>`).join('');
function renderTuning() {
  presetEl.value = tuning.preset;
  for (const s of SLIDERS) {
    const v = s.key === 'throttleMid' ? config.input.throttleMid : tuning[s.key];
    document.getElementById('tune-' + s.key).value = String(v);
    document.getElementById('tune-out-' + s.key).textContent = s.show(v) + (s.key === 'throttleMid' && tuning.throttleMid === null ? ' (hover)' : '');
  }
  tuneInfo.textContent = `Hovers at ${Math.round(config.hover * 100)}% throttle. Throttle centre and expo apply to spring-centred sticks (gamepads).`;
}
presetEl.addEventListener('change', () => applyTuning({ ...tuning, preset: presetEl.value }));
for (const s of SLIDERS) document.getElementById('tune-' + s.key).addEventListener('input', (e) => applyTuning({ ...tuning, [s.key]: Number(e.target.value) }));
for (const el of [presetEl, ...slidersEl.querySelectorAll('input')]) el.addEventListener('change', () => el.blur()); // give the keys back to flying
document.getElementById('tune-reset').addEventListener('click', (e) => { e.currentTarget.blur(); applyTuning(defaultTuning(tuning.preset)); });
applyTuning(tuning, false);
window.addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) view.chase = !view.chase; });

// ?fast in the URL turns antialiasing off (slow machines, and the software-GL test browser).
const fast = params.has('fast');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !fast });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = buildScene(world, renderer, { fast });
const quadModel = buildQuadModel();
scene.add(quadModel);
const gates = buildGates(world.course);
scene.add(gates.group);
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
const fwd = [0, 0, 0];
const camOffset = new THREE.Vector3(), chasePos = new THREE.Vector3(0, 1, 3), tmp = new THREE.Vector3();
function setText(el, text) { if (el.textContent !== text) el.textContent = text; }

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  setup.update(dt);
  const inp = input.update(dt);
  // A controller with no standard layout and no saved profile (a USB radio): open the setup screen by itself, once.
  if (input.needsSetup && !setup.open && autoSetupFor !== input.gamepadId) { autoSetupFor = input.gamepadId; setup.start(); }
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

  // Gates and lap timer (sim time, so a slow computer does not change lap times).
  const s = sim.state;
  if (racePrev && !s.crashed) {
    for (const ev of raceUpdate(race, racePrev.pos, s.pos, racePrev.time, s.time)) {
      if (ev.type === 'start') toast = { text: 'Lap started', best: false, left: 1.2 };
      if (ev.type === 'lap') {
        toast = { text: `Lap ${formatLap(ev.lapTime)}${ev.best ? ' · new best!' : ''}`, best: ev.best, left: 3.5 };
        if (ev.best && storage) saveBest(world.course, storage, race.best);
      }
    }
  }
  racePrev = { pos: [s.pos[0], s.pos[1], s.pos[2]], time: s.time };
  gates.highlight(race.next);

  // Cameras.
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
  const nGates = world.course.gates.length;
  setText(hud.gate, `${race.next + 1}/${nGates}`);
  setText(hud.lap, race.running ? formatLap(race.lapTime) : formatLap(null));
  setText(hud.best, formatLap(race.best));
  // Guide to the next gate: an arrow that points where to turn (up = straight ahead) and the distance.
  const g = world.course.gates[race.next];
  rotate(s.quat, [0, 0, -1], fwd);
  const gx = g.x - s.pos[0], gz = g.z - s.pos[2];
  const rel = Math.atan2(gx * -fwd[2] + gz * fwd[0], gx * fwd[0] + gz * fwd[2]);
  guideEl.hidden = !sim.armed || setup.open;
  guideArrow.style.transform = `rotate(${Math.round(rel / DEG)}deg)`;
  setText(guideText, `${race.running || race.next > 0 ? 'Gate' : 'Start: gate'} ${race.next + 1} · ${Math.round(Math.hypot(gx, gz))} m`);
  if (toast) { toast.left -= dt; if (toast.left <= 0 || s.crashed) toast = null; }
  toastEl.hidden = !toast;
  if (toast) { setText(toastEl, toast.text); toastEl.dataset.best = String(toast.best); }
  let ctl = 'Keyboard (no controller found: plug one in and press a button)';
  const names = buttonNames(input.gamepadId), usesDefault = input.gamepadId && !input.needsSetup && !input.profiles[input.gamepadId];
  if (input.gamepadId) ctl = input.needsSetup ? `Controller needs setup: ${input.gamepadId}` : `Controller: ${input.gamepadId}`;
  if (usesDefault) ctl += ` · ${names.arm} arm · ${names.mode} angle/acro · ${names.reset} reset`;
  if (setup.message) ctl += ` · ${setup.message}`;
  setText(controllerEl, ctl);
  keysEl.hidden = input.source !== 'keyboard';
  document.body.classList.toggle('flying', sim.armed);
  let hint = inp.hint;
  if (s.crashed) hint = `Crashed${s.crashedInto && s.crashedInto !== 'ground' ? ' into a ' + s.crashedInto : ''}. Resetting…`;
  else if (!sim.armed && !hint && !setup.open && !scripted) {
    hint = input.source === 'gamepad' ? (usesDefault ? `Pull the left stick down and press ${names.arm} to arm` : 'Throttle down, then arm to fly') : 'Press Space to arm, then hold W to take off';
  }
  hintEl.hidden = !hint;
  if (hint) setText(hintEl, hint);

  renderer.render(scene, camera);
  hook.frames++;
  hook.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
