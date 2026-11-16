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
import { buildScene, buildGates, buildQuadModel, buildShadow, verticalFov } from './scene.js';
import { PRESETS } from './params.js';
import { SLIDERS, defaultTuning, sanitizeTuning, buildConfig, loadTuning, saveTuning } from './tuning.js';
import { createRace, resetRace, raceUpdate, formatLap, loadBest, saveBest } from './course.js';
import * as LS from './lessons.js';

// View settings (M6 puts these in the settings panel).
const view = {
  uptiltDeg: 25,   // camera tilted up from the quad's nose
  fovDeg: 115,     // horizontal field of view
  mode: 'fpv',     // 'fpv' (camera on the quad) | 'los' (line of sight: you stand on the ground and watch it) | 'chase'
  pilot: [0, 1.7, 5], // where you stand in line-of-sight view: eye height, 5 m behind the pad
  losFovDeg: 50,   // vertical field of view in line-of-sight view: no zoom, the quad gets small with distance like in real life
  losModelScale: 1.5, // the quad is drawn this much bigger in line-of-sight view: a screen shows far less detail than the eye
  sticks: true,    // live stick overlay
  get chase() { return this.mode === 'chase'; },
  set chase(on) { this.mode = on ? 'chase' : 'fpv'; },
};
const VIEW_NAMES = { fpv: 'FPV', los: 'LINE OF SIGHT', chase: 'CHASE' };
function nextView() { view.mode = view.mode === 'fpv' ? 'los' : 'fpv'; }
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

// Beginner path (src/lessons.js). lesson = null is free flight. ?free starts in free flight, ?unlock opens every lesson.
const progress = storage ? LS.loadProgress(storage) : LS.createProgress();
const unlockAll = params.has('unlock');
let lesson = null, attempt = null, card = null; // card: { title, text, good, left } result of the last run
function setLesson(id) {
  lesson = id ? LS.lessonById(id) : null;
  attempt = lesson ? LS.createAttempt(lesson) : null;
  card = null;
  sim.quad.wind = lesson && lesson.wind ? LS.WIND : null;
  if (lesson) sim.mode = lesson.mode;
  if (typeof renderLessons === 'function') renderLessons();
}
const VIEW_SHORT = { fpv: 'FPV', los: 'line of sight', any: '' };
function lessonFrame(dt) {
  if (!lesson) return;
  const s = sim.state;
  if (attempt.state === 'done' || attempt.state === 'failed') {
    // The next run starts once the quad is disarmed (after a landing, a crash or a reset).
    if (!sim.armed && !s.crashed) attempt = LS.createAttempt(lesson);
    else return;
  }
  LS.attemptUpdate(attempt, { t: s.time, pos: s.pos, vel: s.vel, quat: s.quat, armed: sim.armed, crashed: s.crashed, onGround: s.onGround, mode: sim.mode, view: view.mode });
  if (attempt.state === 'running' && card) card = null;
  if (attempt.action) {
    if (attempt.action.type === 'spin') { // a gust turns the quad to a heading the pilot did not choose
      const h = (-attempt.action.yawDeg * DEG) / 2, [x, y, z, w] = s.quat, sy = Math.sin(h), cy = Math.cos(h);
      s.quat = [cy * x + sy * z, cy * y + sy * w, cy * z - sy * x, cy * w - sy * y];
    }
    attempt.action = null;
  }
  if (attempt.state === 'done' || attempt.state === 'failed') {
    const r = LS.attemptResult(attempt), rec = LS.recordResult(progress, lesson, attempt.key, r);
    if (storage) LS.saveProgress(storage, progress);
    const where = VIEW_SHORT[attempt.key] ? ` in ${VIEW_SHORT[attempt.key]}` : '';
    const nums = r.metrics.map((m) => `${m.label} ${m.value.toFixed(1)} ${m.unit}`).join(' · ');
    let title = r.good ? `Good run · ${rec.streak} of ${rec.needed} in a row${where}` : r.completed ? 'Finished, but not a good run' : 'Run failed';
    let text = r.good ? nums : `${r.reason}${rec.needed > 1 ? ' · streak back to 0' : ''}`;
    if (rec.passedLesson) {
      const next = LS.nextLesson(progress);
      title = lesson.id === 'ready' ? 'REAL-DRONE READY' : `Lesson passed: ${lesson.title}`;
      text = lesson.id === 'ready' ? 'You flew everything in one flight. You can fly a real drone with confidence.' : next ? `Next: ${next.title}` : '';
    } else if (rec.passedView) {
      const other = lesson.views.find((v) => !progress[lesson.id][v].passed);
      title = `Passed${where}`;
      text = `Now the same in ${VIEW_SHORT[other]}: ${names().view} switches view`;
    }
    card = { title, text, good: r.good, left: 8, result: r, passedLesson: rec.passedLesson };
    renderLessons();
  }
}
const names = () => (input.gamepadId && !input.needsSetup && !input.profiles[input.gamepadId] ? buttonNames(input.gamepadId) : { view: 'V', mode: 'M', reset: 'R', arm: 'Space' });

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
  setLesson, LS, get attempt() { return attempt; },
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
      lesson: lesson ? { id: lesson.id, state: attempt.state, step: attempt.step, status: attempt.status, key: attempt.key, prompt: attempt.prompt } : null,
      card: card ? { title: card.title, text: card.text, good: card.good } : null, progress: JSON.parse(JSON.stringify(progress)), wind: sim.quad.wind || null,
      race: { next: race.next, running: race.running, lapTime: race.lapTime, lastLap: race.lastLap, best: race.best, laps: race.laps, passed: race.passed },
      view: view.mode, sticksShown: !sticksEl.hidden, sticks: { ...sticks }, source: input.source, hint: input.hint, setupOpen: setup.open,
      camera: { fov: camera.fov, pos: camera.position.toArray(), dir: camera.getWorldDirection(new THREE.Vector3()).toArray() } };
  },
});
window.addEventListener('error', (e) => hook.errors.push(String(e.message)));

const canvas = document.getElementById('view');
const hud = Object.fromEntries(['state', 'mode', 'view', 'thr', 'speed', 'alt', 'gate', 'lap', 'best'].map((k) => [k, document.getElementById('hud-' + k)]));
const hintEl = document.getElementById('hint');
const guideEl = document.getElementById('guide'), guideArrow = document.getElementById('guide-arrow'), guideText = document.getElementById('guide-text');
const toastEl = document.getElementById('toast');
const sticksEl = document.getElementById('sticks'), stickL = document.getElementById('stick-l'), stickR = document.getElementById('stick-r');
const controllerEl = document.getElementById('controller');
const keysEl = document.getElementById('keys');
keysEl.innerHTML = KEY_HELP.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
document.getElementById('btn-setup').addEventListener('click', (e) => { e.currentTarget.blur(); setup.start(); });
document.getElementById('btn-reset').addEventListener('click', (e) => { e.currentTarget.blur(); resetFlight(); });

// Lessons panel.
const lessonListEl = document.getElementById('lesson-list'), lessonEl = document.getElementById('lesson'), lessonTitle = document.getElementById('lesson-title'),
  lessonLine = document.getElementById('lesson-line'), lessonStep = document.getElementById('lesson-step'), cardEl = document.getElementById('card'),
  cardTitle = document.getElementById('card-title'), cardText = document.getElementById('card-text'), badgeEl = document.getElementById('badge');
function renderLessons() {
  const dots = (l, k) => { const p = progress[l.id][k], n = LS.streakNeeded(l); return p.passed ? '✓' : '●'.repeat(p.streak) + '○'.repeat(n - p.streak); };
  lessonListEl.innerHTML = LS.LESSONS.map((l, i) => {
    const open = unlockAll || LS.isUnlocked(progress, l.id), done = LS.lessonPassed(progress, l);
    const marks = LS.viewKeys(l).map((k) => `<span>${k === 'any' ? '' : k === 'los' ? 'LOS ' : 'FPV '}${dots(l, k)}</span>`).join(' ');
    return `<button type="button" class="lesson${lesson === l ? ' on' : ''}${done ? ' done' : ''}" data-id="${l.id}" ${open ? '' : 'disabled'}><b>${i + 1}. ${l.title}</b><small>${open ? marks : 'Locked: pass the lesson before'}</small></button>`;
  }).join('') + `<button type="button" class="lesson${lesson ? '' : ' on'}" data-id=""><b>Free flight and gates</b><small>Always open</small></button>`;
  badgeEl.hidden = !LS.isReady(progress);
}
lessonListEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  resetFlight(); setLesson(b.dataset.id || null);
});
// Markers for the lessons: hover boxes, two cones with their circles, the far ring.
const lessonMarks = (() => {
  const g = {}, mk = (name) => { g[name] = new THREE.Group(); g[name].visible = false; return g[name]; };
  const line = (color) => new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const flat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });
  const ring = (c, r, color) => { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 64), flat(color, 0.75)); m.rotation.x = -Math.PI / 2; m.position.set(c.x, 0.03, c.z); return m; };
  for (const [name, b] of [['box', LS.BOX], ['bigbox', LS.BIG_BOX]]) {
    const m = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * b.half, 2 * b.halfY, 2 * b.half)), line(0xffd23f));
    m.position.set(b.x, b.y, b.z); mk(name).add(m);
  }
  mk('cones');
  for (const c of [LS.CONE_A, LS.CONE_B]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 16), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
    cone.position.set(c.x, 0.4, c.z);
    g.cones.add(cone, ring(c, 3.5, 0xff9a4a));
  }
  mk('far').add(ring(LS.FAR, LS.FAR.r, 0xffffff));
  const flag = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  flag.position.set(LS.FAR.x, 1, LS.FAR.z - LS.FAR.r); g.far.add(flag);
  return g;
})();

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
window.addEventListener('keydown', (e) => {
  if (e.repeat || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || ''))) return;
  if (e.code === 'KeyC') view.chase = !view.chase;
  if (e.code === 'KeyV') nextView();
  if (e.code === 'KeyO') view.sticks = !view.sticks;
});

// ?fast in the URL turns antialiasing off (slow machines, and the software-GL test browser).
const fast = params.has('fast');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !fast });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = buildScene(world, renderer, { fast });
const quadModel = buildQuadModel();
scene.add(quadModel);
const shadow = buildShadow();
scene.add(shadow);
const gates = buildGates(world.course);
scene.add(gates.group);
const camera = new THREE.PerspectiveCamera(80, 1, 0.03, 2500);
const sky = scene.getObjectByName('sky');
for (const m of Object.values(lessonMarks)) scene.add(m);
if (!params.has('free')) { const n = LS.nextLesson(progress); setLesson(n ? n.id : null); } else renderLessons();

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
    for (const ev of inp.events) { if (ev === 'mode') toggleMode(); else if (ev === 'reset') resetFlight(); else if (ev === 'view') nextView(); }
    if (inp.acroSwitch !== null) sim.mode = inp.acroSwitch ? MODES.ACRO : MODES.ANGLE;
    sim.armed = input.armed && !sim.state.crashed;
  }
  hook.physicsSteps += simAdvance(sim, sticks, dt);
  lessonFrame(dt);

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
  shadow.position.set(s.pos[0], 0.04, s.pos[2]);
  shadow.material.opacity = 0.45 / (1 + s.pos[1] / 12); // fades with height like a real shadow softens
  quadModel.visible = view.mode !== 'fpv';
  quadModel.scale.setScalar(view.mode === 'los' ? view.losModelScale : 1);
  if (view.mode === 'los') {
    // Line of sight: the pilot stands still on the ground and turns the head to follow the quad.
    camera.position.set(view.pilot[0], view.pilot[1], view.pilot[2]);
    camera.fov = view.losFovDeg;
    camera.up.set(0, 1, 0);
    camera.lookAt(quadModel.position);
  } else if (view.chase) {
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
  setText(hud.view, VIEW_NAMES[view.mode]);
  // Stick overlay: where the sticks are right now (left: throttle + yaw, right: pitch + roll; Mode 2).
  sticksEl.hidden = !view.sticks || setup.open;
  if (view.sticks) {
    stickL.style.transform = `translate(${(sticks.yaw * 34).toFixed(1)}px, ${((0.5 - sticks.throttle) * 68).toFixed(1)}px)`;
    stickR.style.transform = `translate(${(sticks.roll * 34).toFixed(1)}px, ${(-sticks.pitch * 34).toFixed(1)}px)`;
  }
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
  guideEl.hidden = !sim.armed || setup.open || !!lesson;
  // Lesson banner, result card and markers.
  for (const [k, m] of Object.entries(lessonMarks)) m.visible = !!lesson && lesson.markers.includes(k);
  lessonEl.hidden = !lesson || setup.open;
  if (lesson) {
    setText(lessonTitle, `Lesson ${LS.LESSONS.indexOf(lesson) + 1}: ${lesson.title}`);
    setText(lessonLine, lesson.line);
    const running = attempt.state === 'running';
    setText(lessonStep, running || attempt.state === 'ready' ? attempt.status : '');
    lessonStep.dataset.alarm = String(!!attempt.prompt);
    lessonLine.hidden = running;
  }
  if (card) { card.left -= dt; if (card.left <= 0 && !card.passedLesson) card = null; }
  cardEl.hidden = !card || setup.open;
  if (card) { setText(cardTitle, card.title); setText(cardText, card.text); cardEl.dataset.good = String(card.good); }
  guideArrow.style.transform = `rotate(${Math.round(rel / DEG)}deg)`;
  setText(guideText, `${race.running || race.next > 0 ? 'Gate' : 'Start: gate'} ${race.next + 1} · ${Math.round(Math.hypot(gx, gz))} m`);
  if (toast) { toast.left -= dt; if (toast.left <= 0 || s.crashed) toast = null; }
  toastEl.hidden = !toast;
  if (toast) { setText(toastEl, toast.text); toastEl.dataset.best = String(toast.best); }
  let ctl = 'Keyboard (no controller found: plug one in and press a button)';
  const names = buttonNames(input.gamepadId), usesDefault = input.gamepadId && !input.needsSetup && !input.profiles[input.gamepadId];
  if (input.gamepadId) ctl = input.needsSetup ? `Controller needs setup: ${input.gamepadId}` : `Controller: ${input.gamepadId}`;
  if (usesDefault) ctl += ` · ${names.arm} arm · ${names.mode} angle/acro · ${names.reset} reset · ${names.view} view`;
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
