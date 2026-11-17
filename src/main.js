// Entry point. Wires input, sim, FPV camera, HUD and the render loop.
// Physics lives in sim.js / physics.js / flightcontroller.js / world.js (no DOM there).
import * as THREE from '../vendor/three.module.min.js';
import { PHYSICS_HZ, MOTORS, attitude, rotate } from './physics.js';
import { MODES, actualRate } from './flightcontroller.js';
import { createSim, resetSim, simAdvance } from './sim.js';
import { DEG } from './params.js';
import { InputManager, KEY_HELP, buttonNames } from './input.js';
import { SetupScreen } from './setup.js';
import { createWorld } from './world.js';
import { buildScene, buildGates, buildQuadModel, buildShadow, shadowPoint, verticalFov } from './scene.js';
import { PRESETS } from './params.js';
import { SLIDERS, defaultTuning, sanitizeTuning, buildConfig, loadTuning, saveTuning } from './tuning.js';
import { createRace, resetRace, raceUpdate, formatLap, loadBest, saveBest } from './course.js';
import * as LS from './lessons.js';
import { Menu, navNames } from './menu.js';
import * as TH from './theory.js';
import { PATTERNS, patternFor } from './patterns.js';
import { DEMOS, demoHelpers, runDemo, demoStart, motorTags, peakWatch, holdLine } from './demos.js';
import { createLessonPilot, setPilotQuad } from './pilot.js';
import { buildArrows, forces } from './arrows.js';
import { createRecorder, record, coachLine } from './coach.js';

// View settings (M6 puts these in the settings panel).
const view = {
  uptiltDeg: 25,   // camera tilted up from the quad's nose
  fovDeg: 115,     // horizontal field of view
  mode: 'fpv',     // 'fpv' (camera on the quad) | 'los' (line of sight: you stand on the ground and watch it) | 'chase'
  pilot: [0, 1.7, 5], // where you stand in line-of-sight view: eye height, 5 m behind the pad
  losFovDeg: 50,   // vertical field of view in line-of-sight view: no zoom, the quad gets small with distance like in real life
  losModelScale: 1.5, // the quad is drawn this much bigger in line-of-sight view: a screen shows far less detail than the eye
  demoFovDeg: 36, demoModelScale: 2, // theory demos: a slightly zoomed camera and a quad drawn twice its size, so tilt and arrows read at 10 m (UNSOURCED look choices)
  sticks: true,    // live stick overlay
  patternHint: true, // the lesson's stick pattern as a small line during Try (Settings)
  arrows: false,   // force arrows on the quad while flying (F, or Settings): thrust per motor, weight, velocity. Seen in line of sight and chase view.
  uptiltSet: false, // true once the player has chosen a camera tilt: it is then used everywhere
  get chase() { return this.mode === 'chase'; },
  set chase(on) { this.mode = on ? 'chase' : 'fpv'; },
};
const VIEW_NAMES = { fpv: 'FPV', los: 'LINE OF SIGHT', chase: 'CHASE' };
function nextView() { view.mode = view.mode === 'fpv' ? 'los' : 'fpv'; }
// Camera tilt in Learn until the player chooses one: beginners start at 10 to 15 degrees (Oscar Liang, docs/theory.md, camera row); the middle.
const LEARN_UPTILT = 12;
const uptiltNow = () => (!view.uptiltSet && appMode === 'learn' ? LEARN_UPTILT : view.uptiltDeg);
const CRASH_PAUSE = 1.5; // s shown "crashed" before the automatic reset

let storage = null;
try { storage = window.localStorage; } catch { /* blocked: settings and best lap last until the page closes */ }
const params = new URLSearchParams(location.search);
// The player's own view choices (force arrows, camera tilt), kept in the browser.
const VIEW_KEY = 'fpvsim.view.v1';
try {
  const v = (storage && JSON.parse(storage.getItem(VIEW_KEY))) || {};
  view.arrows = v.arrows === true;
  view.patternHint = v.patternHint !== false;
  if (Number.isFinite(v.uptilt) && v.uptilt >= 0 && v.uptilt <= 60) { view.uptiltDeg = v.uptilt; view.uptiltSet = true; }
} catch { /* blocked or damaged */ }
function saveView() { try { if (storage) storage.setItem(VIEW_KEY, JSON.stringify({ arrows: view.arrows, patternHint: view.patternHint, uptilt: view.uptiltSet ? view.uptiltDeg : null })); } catch { /* blocked */ } }
function toggleArrows() {
  view.arrows = !view.arrows; saveView();
  toast = { text: view.arrows ? `Force arrows on: yellow thrust, red weight, blue speed${view.mode === 'fpv' ? ' · seen in line of sight and chase view' : ''}` : 'Force arrows off', best: false, left: 3 };
}
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

// Beginner path (src/lessons.js). Nothing is locked: any lesson can be opened from the Learn menu.
// appMode: 'learn' (a lesson is up), 'gates' (lap timer and gate guide) or 'free' (the open field, nothing extra on screen).
// Links: ?learn (next lesson) or ?learn=<id>, ?gates, ?free start there directly; with none of them the start menu opens.
const progress = storage ? LS.loadProgress(storage) : LS.createProgress();
let appMode = 'free';
let lesson = null, attempt = null, card = null; // card: { title, text, good, left } result of the last run
function setLesson(id) {
  lesson = id ? LS.lessonById(id) : null;
  appMode = lesson ? 'learn' : appMode === 'learn' ? 'free' : appMode;
  attempt = lesson ? LS.createAttempt(lesson) : null;
  card = null;
  sim.quad.wind = lesson && lesson.wind ? LS.WIND : null;
  if (lesson) sim.mode = lesson.mode;
  if (lesson && typeof chapter !== 'undefined' && chapter && chapter.lesson !== lesson) chapter = { lesson, ch: TH.chapterFor(lesson.id), part: 'try', i: 0 };
  if (typeof renderLessons === 'function') renderLessons();
}
const VIEW_SHORT = { fpv: 'FPV', los: 'line of sight', any: '' };
function lessonFrame(dt) {
  if (!lesson) return;
  const s = sim.state;
  if (attempt.state === 'done' || attempt.state === 'failed') {
    // The next run starts once the quad is disarmed (after a landing, a crash or a reset).
    if (sim.armed || s.crashed) return;
    if (card && card.passedLesson) { // lesson passed: move on to the next one (free flight after the Ready check), keep the card up a while
      const keep = card, next = LS.nextLesson(progress);
      setLesson(next ? next.id : null);
      card = keep; card.passedLesson = false; card.left = 8;
      if (!lesson) return;
    } else attempt = LS.createAttempt(lesson);
  }
  LS.attemptUpdate(attempt, { t: s.time, pos: s.pos, vel: s.vel, quat: s.quat, armed: sim.armed, crashed: s.crashed, onGround: s.onGround, mode: sim.mode, view: view.mode });
  if (attempt.state === 'running' && card) card = null;
  // Coaching: keep the last seconds of the player's own run (position, speed, sticks), to say why it failed.
  if (attempt.state !== 'ready' && !watching) record((attempt.rec ||= createRecorder()), { t: s.time, pos: s.pos, vel: s.vel, quat: s.quat, onGround: s.onGround, crashed: s.crashed }, sticks, attempt.step, attempt.state !== 'running');
  if (attempt.action) {
    if (attempt.action.type === 'spin') { // a gust turns the quad to a heading the pilot did not choose
      const h = (-attempt.action.yawDeg * DEG) / 2, [x, y, z, w] = s.quat, sy = Math.sin(h), cy = Math.cos(h);
      s.quat = [cy * x + sy * z, cy * y + sy * w, cy * z - sy * x, cy * w - sy * y];
    }
    attempt.action = null;
  }
  if (watching && (attempt.state === 'done' || attempt.state === 'failed')) { partDone('watch'); return; } // the test pilot's run is not yours: nothing is recorded
  if (attempt.state === 'done' || attempt.state === 'failed') {
    const r = LS.attemptResult(attempt), rec = LS.recordResult(progress, lesson, attempt.key, r);
    if (storage) LS.saveProgress(storage, progress);
    const where = VIEW_SHORT[attempt.key] ? ` in ${VIEW_SHORT[attempt.key]}` : '';
    const nums = r.metrics.map((m) => `${m.label} ${m.value.toFixed(1)} ${m.unit}`).join(' · ');
    let title = r.good ? `Good run · ${rec.streak} of ${rec.needed} in a row${where}` : (r.completed ? 'Finished, but not a good run' : 'Run failed') + (rec.needed > 1 ? ' · streak back to 0' : '');
    // A run that failed gets one line of coaching: why, from the flight data (src/coach.js).
    let text = r.good ? nums : coachLine(attempt, r, attempt.rec || createRecorder(), { view: attempt.view, hover: config.hover, wind: sim.quad.wind, crashedInto: s.crashedInto, crashSpeed: sim.quad.crashSpeed, armName: names().arm });
    if (rec.passedLesson) {
      const next = LS.nextLesson(progress);
      title = lesson.id === 'ready' ? 'REAL-DRONE READY' : `Lesson passed: ${lesson.title}`;
      text = lesson.id === 'ready' ? 'You flew everything in one flight. You can fly a real drone with confidence.' : next ? `Next: ${next.title}` : '';
    } else if (rec.passedView) {
      const other = lesson.views.find((v) => !progress[lesson.id][v].passed);
      title = `Passed${where}`;
      text = `Now the same in ${VIEW_SHORT[other]}: ${names().view} switches view`;
    }
    card = { title, text, good: r.good, left: r.good ? 8 : 14, result: r, passedLesson: rec.passedLesson };
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
  ready: false, frames: 0, fps: 0, paused: false, errors: [], shadowPoint, get quality() { return quality; }, get renderer() { return renderer; }, physicsHz: PHYSICS_HZ, physicsSteps: 0,
  sim, sticks, input, setup, view, world, race, get tuning() { return tuning; }, get config() { return config; },
  setTuning(t) { applyTuning({ ...tuning, ...t }); }, get scene() { return scene; }, get camera() { return camera; },
  setLesson, LS, TH, DEMOS, get attempt() { return attempt; }, showChapter(id, part) { showChapter(id, part); }, startPart(part, i) { startPart(part, i); }, cardStep(d) { cardStep(d); }, get menu() { return menu; }, get app() { return appMode; }, start(mode, id) { start(mode, id); },
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
      chapter: chapter ? { lesson: chapter.lesson.id, part: chapter.part, i: chapter.i } : null, demo: demo ? demo.card.demo : null, watching: !!watching,
      theory: theoryEl.hidden ? null : { where: theoryWhere.textContent, title: theoryTitle.textContent, text: theoryText.textContent, next: theoryNext.textContent },
      hold: holdEl.hidden ? null : holdEl.textContent, held: !!(demo && demo.hold > 0), tags: [...tagsShown], marks: demo && demo.marks ? demo.marks.map((m) => m.text) : [], run: demo ? demo.run : null, trail: trailLine.visible ? { points: trail.n, ticks: trail.ticks } : null,
      modelScale: quadModel.scale.x, theorySticks: theorySticks.hidden ? null : theorySticks.textContent, lessonPattern: lessonPattern.hidden || lessonEl.hidden ? null : lessonPattern.textContent, stickThr: sticksEl.hidden ? null : stickThr.textContent, patternHint: view.patternHint, nose: quadModel.userData.nose.visible,
      arrows: arrows.visible, arrowsOn: view.arrows, uptilt: uptiltNow(), uptiltSet: view.uptiltSet, toast: toast ? toast.text : null, curve: curveEl.hidden ? null : { d: (curveLine.getAttribute('d') || '').length, dot: Number(curveDot.getAttribute('cx')), label: curveMax.textContent }, seen: JSON.parse(JSON.stringify(seen)),
      app: appMode, menu: { open: menu.isOpen, screen: menu.screen, item: menu.current ? menu.current.textContent.trim() : null },
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
const stickThr = document.getElementById('stick-thr'), sticksEl = document.getElementById('sticks'), stickL = document.getElementById('stick-l'), stickR = document.getElementById('stick-r');
const controllerEl = document.getElementById('controller');
const keysEl = document.getElementById('keys');
keysEl.innerHTML = KEY_HELP.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
document.getElementById('btn-setup').addEventListener('click', (e) => { e.currentTarget.blur(); setup.start(); });
const forgetEl = document.getElementById('btn-forget');
const cornerEl = document.getElementById('corner'), menuHelp = document.getElementById('menu-help'), sticksBtn = document.getElementById('btn-sticks'),
  viewBtn = document.getElementById('btn-view'), skipBtn = document.getElementById('btn-skip');
forgetEl.addEventListener('click', (e) => { e.currentTarget.blur(); autoSetupFor = null; input.forget(input.gamepadId); });

// Lessons panel.
const lessonListEl = document.getElementById('lesson-list'), lessonEl = document.getElementById('lesson'), lessonTitle = document.getElementById('lesson-title'),
  lessonPattern = document.getElementById('lesson-pattern'), lessonLine = document.getElementById('lesson-line'), lessonStep = document.getElementById('lesson-step'), cardEl = document.getElementById('card'),
  cardTitle = document.getElementById('card-title'), cardText = document.getElementById('card-text'), badgeEl = document.getElementById('badge');
function renderLessons() {
  const dots = (l, k) => { const p = progress[l.id][k], n = LS.streakNeeded(l); return p.passed ? '✓' : '●'.repeat(p.streak) + '○'.repeat(n - p.streak); };
  const next = LS.nextLesson(progress), passed = LS.LESSONS.filter((l) => LS.lessonPassed(progress, l)).length;
  // Progress is shown, never required: every lesson can be opened. "Next" marks the first one not passed yet.
  lessonListEl.innerHTML = LS.LESSONS.map((l, i) => {
    const done = LS.lessonPassed(progress, l);
    const marks = LS.viewKeys(l).map((k) => `<span>${k === 'any' ? '' : k === 'los' ? 'LOS ' : 'FPV '}${dots(l, k)}</span>`).join(' ');
    return `<button type="button" class="lesson${lesson === l ? ' on' : ''}${done ? ' done' : ''}" data-id="${l.id}"${l === ((chapter && chapter.lesson) || lesson || next) ? ' data-first' : ''}><b>${i + 1}. ${l.title}</b><small>${marks}${l === next ? ' <span class="next">Next</span>' : ''}</small></button>`;
  }).join('');
  badgeEl.hidden = !LS.isReady(progress);
  document.getElementById('main-learn').textContent = LS.isReady(progress) ? 'All eight lessons passed: real-drone ready' : `${passed} of ${LS.LESSONS.length} lessons passed · next: ${next.title}`;
  document.getElementById('main-gates').textContent = `Seven gates against the clock${race.best ? ' · best ' + formatLap(race.best) : ''}`;
  if (menu.isOpen) menu.refresh();
}
lessonListEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { chapter = { lesson: LS.lessonById(b.dataset.id), ch: TH.chapterFor(b.dataset.id), part: null, i: 0 }; renderChapter(); menu.push('chapter'); }
});

// Chapters (M9): each lesson is a chapter with up to four parts, every one optional and skippable:
// Learn (theory cards, each with a live demo), Watch (the test pilot flies the lesson), Check (quick questions), Try (the lesson itself).
// chapter = { lesson, ch (cards and questions from src/theory.js), part, i (card or question number), fromTheory }.
const PART_NAMES = { learn: 'Learn', watch: 'Watch', check: 'Check', try: 'Try' };
const SEEN_KEY = 'fpvsim.chapters.v1';
let chapter = null, demo = null, watching = null, answered = false; // demo: { def, card }; watching: the test pilot flying the lesson
let seen = {};                                                       // { lessonId: { learn, watch, check } }: parts gone through (shown as a tick, never required)
try { seen = (storage && JSON.parse(storage.getItem(SEEN_KEY))) || {}; } catch { /* blocked or damaged */ }
const partsOf = (c) => ['learn', 'watch', 'check', 'try'].filter((p) => (p === 'learn' ? c.ch.cards.length : p === 'check' ? c.ch.check.length : true));
const chapterEl = document.querySelector('#menu [data-screen=chapter]'), partsEl = document.getElementById('chapter-parts'), checkEl = document.querySelector('#menu [data-screen=check]'),
  checkQ = document.getElementById('check-q'), checkAnswers = document.getElementById('check-answers'), checkResult = document.getElementById('check-result'), checkNext = document.getElementById('check-next'),
  theorySticks = document.getElementById('theory-sticks'), theoryEl = document.getElementById('theory'), theoryWhere = document.getElementById('theory-where'), theoryTitle = document.getElementById('theory-title'), theoryText = document.getElementById('theory-text'),
  curveEl = document.getElementById('theory-curve'), curveLine = document.getElementById('curve-line'), curveDot = document.getElementById('curve-dot'), curveMax = document.getElementById('curve-max'),
  theoryPrev = document.getElementById('theory-prev'), theoryNext = document.getElementById('theory-next'), theoryKeys = document.getElementById('theory-keys');
function renderChapter(first) {
  const c = chapter, n = LS.LESSONS.indexOf(c.lesson) + 1, done = seen[c.lesson.id] || {}, parts = partsOf(c);
  const what = { learn: `${c.ch.cards.length} short cards, each shown in the sim`, watch: 'The test pilot flies it. Watch the sticks.', check: `${c.ch.check.length} quick questions`,
    try: LS.lessonPassed(progress, c.lesson) ? 'Passed. Fly it again any time.' : 'Your turn: fly it.' };
  chapterEl.dataset.title = `${n}. ${c.lesson.title}`;
  partsEl.innerHTML = parts.map((p) => `<button type="button" data-act="part" data-part="${p}"${p === (first || parts[0]) ? ' data-first' : ''}><b class="${done[p] || (p === 'try' && LS.lessonPassed(progress, c.lesson)) ? 'done' : ''}">${PART_NAMES[p]}</b><small>${what[p]}</small></button>`).join('');
}
// Back to the chapter screen, pointer on `part`.
function showChapter(id, part) {
  stopAuto(); resetFlight(); setLesson(null);
  chapter = { lesson: LS.lessonById(id), ch: TH.chapterFor(id), part: null, i: 0 };
  renderLessons(); renderChapter(part);
  menu.open('main'); menu.push('learn'); menu.push('chapter');
}
function stopAuto() { demo = null; watching = null; arrows.visible = false; }
function markSeen(part) {
  if (chapter.patterns) return;
  (seen[chapter.lesson.id] ||= {})[part] = true;
  try { if (storage) storage.setItem(SEEN_KEY, JSON.stringify(seen)); } catch { /* blocked */ }
}
// A part is over (finished or skipped): on to the next one, or to the next chapter after Try.
function partDone(part, skipped = false) {
  const c = chapter, parts = partsOf(c), k = parts.indexOf(part);
  if (!skipped) markSeen(part);
  if (c.fromTheory) { stopAuto(); resetFlight(); setLesson(null); chapter = null; menu.open('main'); menu.push(c.patterns ? 'patterns' : 'theory'); return; }
  if (k < parts.length - 1) return showChapter(c.lesson.id, parts[k + 1]);
  const n = LS.LESSONS[LS.LESSONS.indexOf(c.lesson) + 1];
  if (n) showChapter(n.id); else { stopAuto(); resetFlight(); setLesson(null); chapter = null; renderLessons(); menu.open('main'); }
}
function startPart(part, i = 0) {
  const c = chapter;
  if (part === 'learn') return playCard(i);
  if (part === 'check') { c.part = 'check'; c.i = 0; renderCheck(); if (menu.screen !== 'check') menu.push('check'); else menu.refresh(true); return; }
  start('learn', c.lesson.id);           // Try; Watch is the same lesson flown by the test pilot
  if (part === 'watch') { chapter.part = 'watch'; setPilotQuad(sim.quad, sim.fcCfg); watching = createLessonPilot(); }
}
// Learn: card i of the chapter, with its demo running in the sim.
function playCard(i) {
  const c = chapter;
  stopAuto(); setLesson(null);
  appMode = 'learn'; c.part = 'learn'; c.i = i;
  demo = { card: c.ch.cards[i], def: DEMOS[c.ch.cards[i].demo] };
  placeDemo();
  closeMenu(false);
}
// Time factor of a demo at sim time t: its slow-motion window, else its general speed.
const demoRate = (def, t) => (def.slowmo && t >= def.slowmo[0] && t < def.slowmo[1] ? def.slowmo[2] : def.slow || 1);
const HOLD_SECS = 2.5; // a held moment stays on screen this long (real seconds): time to read the line and the motor tags
function placeDemo() {
  const def = demo.def;
  demo.run = demo.run === undefined ? 0 : (demo.run + 1) % (def.runs || 1);
  if (demo.run === 0) demo.marks = (def.marks || []).map((m) => ({ ...m }));
  demo.watch = {}; demo.hold = 0; demo.holdN = 0; demo.holdText = ''; demo.tags = null;
  resetTrail(demo.run);
  const [x, y, z, yaw = 0] = demoStart(def, demo.run), h = (-yaw * DEG) / 2;
  resetFlight();
  sim.state.pos = [x, y, z]; sim.state.quat = [0, Math.sin(h), 0, Math.cos(h)];
  sim.mode = demo.def.mode || MODES.ANGLE;
  sim.quad.wind = demo.def.wind ? LS.WIND : null;
  setPilotQuad(sim.quad, sim.fcCfg);
  demo.h = demoHelpers(sim.quad, sim.fcCfg, demo.run, demo.marks);
}
// Next / previous card; past the last one the Learn part is done, before the first one it is back to the chapter.
function cardStep(d) {
  if (watching) { if (d > 0) partDone('watch', true); return; }
  if (!demo || menu.isOpen) return;
  const c = chapter, i = c.i + d;
  if (i >= c.ch.cards.length) partDone('learn');
  else if (i < 0) { if (c.fromTheory) partDone('learn', true); else showChapter(c.lesson.id, 'learn'); }
  else playCard(i);
}
theoryNext.addEventListener('click', (e) => { e.currentTarget.blur(); cardStep(1); });
theoryPrev.addEventListener('click', (e) => { e.currentTarget.blur(); cardStep(-1); });
function renderCheck() {
  const c = chapter, q = c.ch.check[c.i];
  answered = false;
  checkEl.dataset.title = `Check ${c.i + 1} of ${c.ch.check.length}`;
  if (menu.screen === 'check') menu.titleEl.textContent = checkEl.dataset.title;
  checkQ.textContent = q.q;
  checkAnswers.innerHTML = q.a.map((a, k) => `<button type="button" data-act="answer" data-k="${k}"${k === 0 ? ' data-first' : ''}>${a}</button>`).join('');
  checkResult.textContent = ''; checkNext.hidden = true;
}
function answer(k) {
  const c = chapter, q = c.ch.check[c.i];
  if (answered) return;
  answered = true;
  checkAnswers.children[q.right].classList.add('right');
  if (k !== q.right) checkAnswers.children[k].classList.add('wrong');
  checkResult.textContent = k === q.right ? 'Right.' : `Not quite. It is: ${q.a[q.right]}.`;
  checkNext.hidden = false;
  checkNext.textContent = c.i + 1 < c.ch.check.length ? 'Next question' : 'Done';
  menu.mark(menu.items().indexOf(checkNext));
}
// Theory page: every card, grouped by chapter. Choosing one plays it in the sim.
// Stick patterns (M10d): played like theory cards, from their own menu page.
const PATTERN_CHAPTER = { id: 'patterns', title: 'Stick patterns' };
document.getElementById('pattern-list').innerHTML = PATTERNS.map((p, i) => `<button type="button" data-act="pattern" data-i="${i}"><b>${p.title}</b><small>${p.sticks}</small></button>`).join('');
document.getElementById('theory-list').innerHTML = TH.CHAPTERS.filter((c) => c.cards.length).map((c) => `<p class="menu-note">${LS.LESSONS.findIndex((l) => l.id === c.lesson) + 1}. ${LS.lessonById(c.lesson).title}</p>`
  + c.cards.map((card, i) => `<button type="button" data-act="card" data-lesson="${c.lesson}" data-i="${i}"><b>${card.title}</b><small>${card.text}</small></button>`).join('')).join('');

// Menus (src/menu.js): start menu, Learn, Settings, pause. The sim stands still while a menu is open.
let resumeArmed = null; // arm state when the pause menu opened, given back on Resume
const menu = new Menu({
  root: document.getElementById('menu'), blocked: () => setup.open,
  onNav(ev) { if (ev === 'select' || ev === 'right') cardStep(1); else if (ev === 'back' || ev === 'left') cardStep(-1); },
  onAction(act, el) {
    if (act === 'pause') { if (!menu.isOpen) { resumeArmed = { armed: input.armed, blocked: input.switchBlocked }; input.keys.clear(); renderLessons(); menu.open('pause'); } }
    else if (act === 'resume') closeMenu(true);
    else if (act === 'restart') { if (demo) { placeDemo(); closeMenu(false); } else if (watching) startPart('watch'); else { resetFlight(); if (lesson) setLesson(lesson.id); closeMenu(false); } }
    else if (act === 'skip') { if (chapter) partDone(chapter.part || 'try', true); } // on to the next part; after Try, the next chapter
    else if (act === 'quit') { stopAuto(); chapter = null; resetFlight(); setLesson(null); renderLessons(); menu.open('main'); }
    else if (act === 'part') startPart(el.dataset.part);
    else if (act === 'answer') answer(Number(el.dataset.k));
    else if (act === 'check-next') { if (chapter.i + 1 < chapter.ch.check.length) { chapter.i++; renderCheck(); menu.refresh(true); } else partDone('check'); }
    else if (act === 'card') { chapter = { lesson: LS.lessonById(el.dataset.lesson), ch: TH.chapterFor(el.dataset.lesson), part: 'learn', i: 0, fromTheory: true }; playCard(Number(el.dataset.i)); }
    else if (act === 'gates' || act === 'free') start(act);
    else if (act === 'sticks') view.sticks = !view.sticks;
    else if (act === 'view') nextView();
    else if (act === 'arrows') toggleArrows();
    else if (act === 'pattern-hint') { view.patternHint = !view.patternHint; saveView(); }
    else if (act === 'pattern') { chapter = { lesson: PATTERN_CHAPTER, ch: { cards: PATTERNS, check: [] }, part: 'learn', i: 0, fromTheory: true, patterns: true }; playCard(Number(el.dataset.i)); }
    else if (act === 'uptilt-auto') { view.uptiltSet = false; view.uptiltDeg = 25; saveView(); }
  },
  onBack(root) { if (root === 'pause') closeMenu(true); },
});
function closeMenu(resume) {
  menu.close();
  input.events = []; input.toggleArm = false;
  input.prev = { arm: true, mode: true, reset: true, view: true }; // a button still held from the menu does nothing
  if (resume && resumeArmed) { input.paused = false; input.armed = resumeArmed.armed; input.switchBlocked = resumeArmed.blocked; }
  resumeArmed = null;
}
// Start flying: a lesson (id, or the next one not passed), the gate course or free flight.
function start(mode, id) {
  stopAuto();
  resetFlight();
  const l = mode === 'learn' ? LS.lessonById(id) || LS.nextLesson(progress) : null;
  appMode = mode === 'gates' ? 'gates' : 'free';
  setLesson(l ? l.id : null);
  chapter = l ? { lesson: l, ch: TH.chapterFor(l.id), part: 'try', i: 0 } : null;
  closeMenu(false);
}
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
// Camera tilt: the player's own setting. Until it is touched, Learn uses the beginner tilt and Gates / Free fly the usual 25 degrees.
const uptiltEl = document.getElementById('uptilt'), uptiltOut = document.getElementById('uptilt-out'), uptiltAuto = document.getElementById('btn-uptilt-auto'), arrowsBtn = document.getElementById('btn-arrows'), patternBtn = document.getElementById('btn-pattern');
uptiltEl.addEventListener('input', () => { view.uptiltDeg = Number(uptiltEl.value); view.uptiltSet = true; saveView(); });
uptiltEl.addEventListener('change', () => uptiltEl.blur());
window.addEventListener('keydown', (e) => {
  if (e.repeat || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || ''))) return;
  if ((e.code === 'Enter' || e.code === 'Backspace') && (demo || watching)) { e.preventDefault(); cardStep(e.code === 'Enter' ? 1 : -1); return; }
  if (e.code === 'KeyC') view.chase = !view.chase;
  if (e.code === 'KeyV') nextView();
  if (e.code === 'KeyO') view.sticks = !view.sticks;
  if (e.code === 'KeyF' && !menu.isOpen && !setup.open) toggleArrows();
});

// Graphics quality, saved in the browser. High: smooth edges, sharp ground at a distance, full screen resolution (up to 2x).
// Low: none of the three, for slow computers. Sun, shadows, sky, haze and ground detail are the same in both (they cost almost nothing).
// ?fast or ?quality=low in the link forces low (the software-GL test browser uses ?fast); ?quality=high forces high.
const QUALITY_KEY = 'fpvsim.quality.v1';
let savedQuality = null;
try { savedQuality = storage && storage.getItem(QUALITY_KEY); } catch { /* blocked */ }
const quality = params.has('fast') ? 'low' : ['low', 'high'].includes(params.get('quality')) ? params.get('quality') : savedQuality === 'low' ? 'low' : 'high';
const fast = quality === 'low';
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !fast });
renderer.setPixelRatio(fast ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping; // bright sunlit surfaces roll off instead of clipping; colours stay true
renderer.toneMappingExposure = 1.0;
const qualityEl = document.getElementById('quality'), fpsEl = document.getElementById('fps');
qualityEl.value = quality;
qualityEl.addEventListener('change', () => {
  try { if (storage) storage.setItem(QUALITY_KEY, qualityEl.value); } catch { /* blocked */ }
  const u = new URL(location.href);
  u.searchParams.delete('fast'); u.searchParams.delete('quality');
  if (!storage) u.searchParams.set('quality', qualityEl.value);
  u.hash = 'settings';
  // Antialiasing can only be chosen when the page starts, so the page reloads (and comes back to Settings).
  if (u.search === location.search) { location.hash = 'settings'; location.reload(); } else location.replace(u);
});
const scene = buildScene(world, renderer, { fast });
const quadModel = buildQuadModel();
scene.add(quadModel);
const shadow = buildShadow();
scene.add(shadow);
const gates = buildGates(world.course);
scene.add(gates.group);
const arrows = buildArrows();
scene.add(arrows);
// Demo marks on the ground (src/demos.js marks: a line across the flight path, with a label), and labels on the screen
// for them and for the motors in a held moment.
const demoMarks = new THREE.Group();
scene.add(demoMarks);
const tagsEl = document.getElementById('tags'), holdEl = document.getElementById('hold');
const tagPool = [], _tv = new THREE.Vector3(), _tq = new THREE.Quaternion();
let tagsShown = [];
// Demo trail (def.trail): the ground track of the quad as a dotted line, plus a short nose line every 0.4 s, so a still picture
// shows where it went and where it pointed (a banked turn carves; yaw without roll turns the nose while the track runs on).
// Drawn as flat ground meshes (WebGL lines are 1 px wide whatever the setting, too thin to read).
const TRAIL_N = 800, NOSE_N = 60, NOSE_LEN = 1.6, TRAIL_STEP = 0.25;
const dotGeo = new THREE.CircleGeometry(0.13, 10).rotateX(-Math.PI / 2);
const tickGeo = new THREE.BoxGeometry(0.1, 0.01, NOSE_LEN).translate(0, 0, -NOSE_LEN / 2);
const trailMat = new THREE.MeshBasicMaterial({ color: 0x5ee07a }), noseMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const trailLine = new THREE.InstancedMesh(dotGeo, trailMat, TRAIL_N), noseLines = new THREE.InstancedMesh(tickGeo, noseMat, NOSE_N);
trailLine.frustumCulled = noseLines.frustumCulled = false; trailLine.visible = noseLines.visible = false;
trailLine.count = noseLines.count = 0;
scene.add(trailLine, noseLines);
const trail = { n: 0, ticks: 0, lastT: -1, last: null };
const _tm = new THREE.Matrix4(), _ty = new THREE.Quaternion(), _tpos = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
function resetTrail(run) {
  trail.n = 0; trail.ticks = 0; trail.lastT = -1; trail.last = null;
  trailLine.count = noseLines.count = 0;
  trailMat.color.setHex(run ? 0xff8a3d : 0x5ee07a);
}
function drawTrail(on) {
  trailLine.visible = noseLines.visible = !!on;
  if (!on) return;
  const s = sim.state, y = 0.04;
  if (trail.n < TRAIL_N && (!trail.last || Math.hypot(trail.last[0] - s.pos[0], trail.last[1] - s.pos[2]) > TRAIL_STEP)) {
    trail.last = [s.pos[0], s.pos[2]];
    _tm.makeTranslation(s.pos[0], y, s.pos[2]); trailLine.setMatrixAt(trail.n++, _tm);
    trailLine.count = trail.n; trailLine.instanceMatrix.needsUpdate = true;
  }
  if (trail.ticks < NOSE_N && (trail.lastT < 0 || s.time - trail.lastT >= 0.4)) {
    trail.lastT = s.time;
    const f = rotate(s.quat, [0, 0, -1]);
    _ty.setFromAxisAngle(_up, Math.atan2(-f[0], -f[2]));
    _tm.compose(_tpos.set(s.pos[0], y + 0.01, s.pos[2]), _ty, _one); noseLines.setMatrixAt(trail.ticks++, _tm);
    noseLines.count = trail.ticks; noseLines.instanceMatrix.needsUpdate = true;
  }
}
function drawDemoMarks(scale) {
  drawTrail(demo && scale && demo.def.trail);
  const marks = demo && scale ? demo.marks || [] : [];
  if (demoMarks.children.length !== marks.length || demoMarks.userData.of !== marks) {
    for (const c of demoMarks.children) { c.geometry.dispose(); c.material.dispose(); }
    demoMarks.clear(); demoMarks.userData.of = marks;
    for (const m of marks) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 4), new THREE.MeshBasicMaterial({ color: m.color }));
      strip.position.set(m.x, 0.02, m.z);
      demoMarks.add(strip);
    }
  }
  const tags = [];
  marks.forEach((m, i) => tags.push({ p: [m.x, 0.05, i ? m.z + 1.4 + 0.9 * (i - 1) : m.z - 2.2], text: m.text, color: '#' + m.color.toString(16).padStart(6, '0') }));
  if (demo && scale && demo.tags) {
    const s = sim.state, d = sim.quad.armLength * Math.SQRT1_2 * scale;
    _tq.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
    MOTORS.forEach((mo, i) => {
      if (!demo.tags[i]) return;
      _tv.set(mo.sx * d * 1.5, 0.05 * scale, mo.sz * d * 1.5).applyQuaternion(_tq);
      tags.push({ p: [s.pos[0] + _tv.x, s.pos[1] + _tv.y, s.pos[2] + _tv.z], text: demo.tags[i] === 'faster' ? '▲ faster' : '▼ slower', color: demo.tags[i] === 'faster' ? '#ffd23f' : '#a9b4c4' });
    });
  }
  if (demo && scale && demo.def.nose) { // a 'nose' label at the tip of the nose arrow
    const st = sim.state;
    _tq.set(st.quat[0], st.quat[1], st.quat[2], st.quat[3]);
    _tv.set(0, 0.05 * scale, -0.36 * scale).applyQuaternion(_tq);
    tags.push({ p: [st.pos[0] + _tv.x, st.pos[1] + _tv.y, st.pos[2] + _tv.z], text: 'nose', color: '#ff6a00' });
  }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  tagsShown = [];
  tags.forEach((t, i) => {
    const el = tagPool[i] || (tagPool[i] = tagsEl.appendChild(document.createElement('span')));
    _tv.set(t.p[0], t.p[1], t.p[2]).project(camera);
    const on = _tv.z < 1 && Math.abs(_tv.x) < 1.1 && Math.abs(_tv.y) < 1.1;
    el.hidden = !on;
    if (!on) return;
    setText(el, t.text); el.style.borderColor = t.color;
    el.style.transform = `translate(${((_tv.x + 1) / 2) * w}px, ${((1 - _tv.y) / 2) * h}px) translate(-50%, -50%)`;
    tagsShown.push(t.text);
  });
  for (let i = tags.length; i < tagPool.length; i++) tagPool[i].hidden = true;
  const held = demo && scale && demo.holdText && (demo.tags || demoRate(demo.def, sim.state.time) !== (demo.def.slow || 1)) ? demo.holdText : '';
  const line = held || (demo && demo.def.captions ? demo.def.captions[demo.run] || '' : '');
  holdEl.hidden = !line; setText(holdEl, line);
}
const camera = new THREE.PerspectiveCamera(80, 1, 0.03, 2500);
const sky = scene.getObjectByName('sky');
for (const m of Object.values(lessonMarks)) scene.add(m);
const direct = ['learn', 'gates', 'free'].find((k) => params.has(k));
if (direct) start(direct, params.get('learn')); else { renderLessons(); menu.open('main'); }
if (location.hash === '#settings') { // back from a Graphics change (the page reloads for it)
  if (!menu.isOpen) menu.open('pause');
  menu.push('settings');
  history.replaceState(null, '', location.pathname + location.search);
}

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

let last = performance.now(), fpsCount = 0, fpsTime = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  fpsTime += (now - last) / 1000;
  last = now;

  setup.update(dt);
  // Menus read the controller first. While one is open the sim stands still and the flying controls are off.
  const pad = input.gamepad(), prof = pad && input.profiles[pad.id];
  const optionsTaken = !!prof && [prof.arm, prof.mode].some((b) => b && b.type === 'button' && b.index === 9); // this controller's own setup uses that button
  const menuOpen = menu.update(pad, dt, !optionsTaken);
  input.paused = menuOpen || setup.open;
  const inp = input.update(dt);
  // A controller with no standard layout and no saved profile (a USB radio): open the setup screen by itself, once.
  if (input.needsSetup && !setup.open && autoSetupFor !== input.gamepadId) { autoSetupFor = input.gamepadId; setup.start(); }
  const auto = (demo || watching) && !menuOpen; // a demo or the test pilot flies; the player only steps through
  if (auto) {
    if (demo && sim.state.time >= demo.def.loop) placeDemo();
    const r = demo ? runDemo(demo.def, sim.state, demo.h) : watching.update(sim.state, attempt);
    Object.assign(sticks, r.sticks);
    sim.armed = r.arm && !sim.state.crashed;
  } else if (!scripted && !menuOpen) {
    Object.assign(sticks, inp.sticks);
    for (const ev of inp.events) { if (ev === 'mode') toggleMode(); else if (ev === 'reset') resetFlight(); else if (ev === 'view') nextView(); }
    if (inp.acroSwitch !== null) sim.mode = inp.acroSwitch ? MODES.ACRO : MODES.ANGLE;
    sim.armed = input.armed && !sim.state.crashed;
  }
  // hook.paused: only the test script, to hold the quad still for a picture. A demo can also hold a moment (demo.hold s).
  if (demo && demo.hold > 0 && !menuOpen) { demo.hold -= dt; if (demo.hold <= 0) demo.tags = null; }
  else if (!hook.paused && !menuOpen) {
    hook.physicsSteps += simAdvance(sim, sticks, dt * (demo ? demoRate(demo.def, sim.state.time) : 1));
    if (demo && demo.def.holds && demoRate(demo.def, sim.state.time) !== (demo.def.slow || 1)) {
      const th = forces(sim.state, sim.quad).thrust;
      if (peakWatch(demo.watch, th)) { demo.tags = motorTags(th); demo.holdText = holdLine(demo.tags, MOTORS, demo.holdN++); demo.hold = HOLD_SECS; }
    }
  }
  if (!menuOpen) lessonFrame(dt);

  // Crash: freeze, show it for a moment, then put the quad back on the pad, disarmed.
  if (sim.state.crashed && !menuOpen) {
    if (crashTimer === 0) { crashes++; input.disarm(); sim.armed = false; }
    crashTimer += dt;
    if (crashTimer >= CRASH_PAUSE) { if (demo) placeDemo(); else resetFlight(); }
  }

  // Gates and lap timer (sim time, so a slow computer does not change lap times).
  const s = sim.state;
  if (racePrev && !s.crashed && appMode === 'gates') {
    for (const ev of raceUpdate(race, racePrev.pos, s.pos, racePrev.time, s.time)) {
      if (ev.type === 'start') toast = { text: 'Lap started', best: false, left: 1.2 };
      if (ev.type === 'lap') {
        toast = { text: `Lap ${formatLap(ev.lapTime)}${ev.best ? ' · new best!' : ''}`, best: ev.best, left: 3.5 };
        if (ev.best && storage) saveBest(world.course, storage, race.best);
        if (ev.best) renderLessons();
      }
    }
  }
  racePrev = { pos: [s.pos[0], s.pos[1], s.pos[2]], time: s.time };
  gates.highlight(race.next);

  // Cameras.
  quadModel.position.set(s.pos[0], s.pos[1], s.pos[2]);
  qBody.set(s.quat[0], s.quat[1], s.quat[2], s.quat[3]);
  quadModel.quaternion.copy(qBody);
  shadow.update(s.pos, s.quat);
  const demoCam = demo ? demo.def.cam : null, standCam = Array.isArray(demoCam);
  quadModel.visible = demoCam ? standCam : view.mode !== 'fpv';
  const modelScale = standCam ? demo.def.scale || view.demoModelScale : view.mode === 'los' ? view.losModelScale : 1;
  quadModel.scale.setScalar(modelScale);
  quadModel.userData.nose.visible = !!(demo && demo.def.nose && standCam);
  // Force arrows: in the demos that ask for them, and anywhere the player switched them on (in FPV the camera sits inside the quad: nothing to draw them on).
  arrows.visible = demo ? !!demo.def.arrows && standCam : view.arrows && view.mode !== 'fpv';
  if (arrows.visible) arrows.update(s, sim.quad, modelScale);
  if (standCam) {
    // Demo: a camera that stands still and watches the quad.
    camera.position.set(demoCam[0], demoCam[1], demoCam[2]);
    camera.fov = demo.def.fov || view.demoFovDeg;
    camera.up.set(0, 1, 0);
    if (demo.def.look) camera.lookAt(demo.def.look[0], demo.def.look[1], demo.def.look[2]); else camera.lookAt(quadModel.position);
  } else if (view.mode === 'los' && !demoCam) {
    // Line of sight: the pilot stands still on the ground and turns the head to follow the quad.
    camera.position.set(view.pilot[0], view.pilot[1], view.pilot[2]);
    camera.fov = view.losFovDeg;
    camera.up.set(0, 1, 0);
    camera.lookAt(quadModel.position);
  } else if (view.chase && !demoCam) {
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
    qTilt.setFromAxisAngle(X_AXIS, uptiltNow() * DEG);
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
  setText(hud.view, demo ? 'DEMO' : VIEW_NAMES[view.mode]);
  // Stick overlay: where the sticks are right now (left: throttle + yaw, right: pitch + roll; Mode 2).
  sticksEl.hidden = !(view.sticks || demo || watching) || setup.open;
  if (!sticksEl.hidden) {
    stickL.style.transform = `translate(${(sticks.yaw * 34).toFixed(1)}px, ${((0.5 - sticks.throttle) * 68).toFixed(1)}px)`;
    setText(stickThr, `throttle ${Math.round(sticks.throttle * 100)} %`); // live: on a gamepad a sideways (yaw) push easily moves it too
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
  guideEl.hidden = !sim.armed || setup.open || menuOpen || appMode !== 'gates';
  // Lesson banner, result card and markers.
  for (const [k, m] of Object.entries(lessonMarks)) m.visible = !!lesson && lesson.markers.includes(k);
  lessonEl.hidden = !lesson || setup.open || menuOpen;
  if (lesson) {
    setText(lessonTitle, `Lesson ${LS.LESSONS.indexOf(lesson) + 1}: ${lesson.title}`);
    setText(lessonLine, lesson.line);
    const running = attempt.state === 'running';
    setText(lessonStep, running || attempt.state === 'ready' ? attempt.status : '');
    lessonStep.dataset.alarm = String(!!attempt.prompt);
    lessonLine.hidden = running;
    const pat = view.patternHint && !watching ? patternFor(lesson.id) : null;
    lessonPattern.hidden = !pat;
    if (pat) setText(lessonPattern, `${pat.title}: ${pat.sticks}`);
  }
  // The card beside a demo, or the note while the test pilot flies.
  theoryEl.hidden = !(demo || watching) || menuOpen || setup.open;
  if (!theoryEl.hidden) {
    const c = chapter, n = LS.LESSONS.indexOf(c.lesson) + 1, pn = navNames(input.gamepadId), padOn = !!pad && pad.mapping === 'standard';
    setText(theoryWhere, c.patterns ? `Stick patterns · ${c.i + 1} of ${c.ch.cards.length}` : demo ? `${n}. ${c.lesson.title} · Learn ${c.i + 1} of ${c.ch.cards.length}` : `${n}. ${c.lesson.title} · Watch`);
    theorySticks.hidden = !(demo && demo.card.sticks);
    if (!theorySticks.hidden) setText(theorySticks, demo.card.sticks);
    setText(theoryTitle, demo ? demo.card.title : 'Watch the test pilot');
    setText(theoryText, demo ? demo.card.text : 'It flies the lesson. Watch what the sticks do.');
    theoryPrev.hidden = !demo;
    // The rates curve (acro card): rotation speed against stick position from the flight controller's own rates, with a dot where the stick is.
    curveEl.hidden = !(demo && demo.def.curve);
    if (!curveEl.hidden) {
      const r = sim.fcCfg.rates.roll, top = actualRate(1, r), px = (x) => 6 + 188 * x, py = (v) => 100 - 84 * (v / top);
      curveLine.setAttribute('d', Array.from({ length: 41 }, (_, k) => `${k ? 'L' : 'M'}${px(k / 40).toFixed(1)} ${py(actualRate(k / 40, r)).toFixed(1)}`).join(' '));
      const x = Math.min(1, Math.abs(sticks.roll));
      curveDot.setAttribute('cx', px(x).toFixed(1)); curveDot.setAttribute('cy', py(actualRate(x, r)).toFixed(1));
      setText(curveMax, `${Math.round(top)}°/s at full stick`);
    }
    setText(theoryNext, watching ? 'Skip' : c.i + 1 < c.ch.cards.length ? 'Next' : 'Done');
    setText(theoryKeys, padOn ? `${pn.select} ${watching ? 'skip' : 'next'}${demo ? ` · ${pn.back} back` : ''} · ${pn.pause} menu` : `Enter ${watching ? 'skip' : 'next'}${demo ? ' · Backspace back' : ''} · Esc menu`);
  }
  if (card) { card.left -= dt; if (card.left <= 0 && !card.passedLesson) card = null; }
  if (card && !lesson && sim.armed) card = null;
  cardEl.hidden = !card || setup.open || menuOpen;
  if (card) { setText(cardTitle, card.title); setText(cardText, card.text); cardEl.dataset.good = String(card.good); }
  guideArrow.style.transform = `rotate(${Math.round(rel / DEG)}deg)`;
  setText(guideText, `${race.running || race.next > 0 ? 'Gate' : 'Start: gate'} ${race.next + 1} · ${Math.round(Math.hypot(gx, gz))} m`);
  if (toast) { toast.left -= dt; if (toast.left <= 0 || s.crashed) toast = null; }
  toastEl.hidden = !toast;
  if (toast) { setText(toastEl, toast.text); toastEl.dataset.best = String(toast.best); }
  let ctl = 'Keyboard (no controller found: plug one in and press a button)';
  const names = buttonNames(input.gamepadId), usesDefault = input.gamepadId && !input.needsSetup && !input.profiles[input.gamepadId];
  if (input.gamepadId) ctl = input.needsSetup ? `Controller needs setup: ${input.gamepadId}` : `Controller: ${input.gamepadId}`;
  const nav = navNames(input.gamepadId), std = !!pad && pad.mapping === 'standard';
  if (usesDefault) ctl += ` · ${names.arm} arm · ${names.mode} angle/acro · ${names.reset} reset · ${names.view} view · ${nav.pause} menu`;
  if (setup.message) ctl += ` · ${setup.message}`;
  setText(controllerEl, ctl);
  forgetEl.hidden = !(input.gamepadId && input.profiles[input.gamepadId]); // only for a controller with a saved setup
  keysEl.hidden = input.source !== 'keyboard';
  document.body.classList.toggle('flying', sim.armed);
  document.body.classList.toggle('menu-open', menuOpen);
  document.body.classList.toggle('mode-free', appMode !== 'gates'); // lap timer and gate count only on the gate course
  cornerEl.hidden = menuOpen || setup.open;
  setText(cornerEl, std && !optionsTaken ? `${nav.pause}: menu` : 'Esc: menu');
  if (menuOpen) {
    setText(menuHelp, std ? `D-pad: move · ${nav.select} select · ${nav.back} back` : 'Arrows: move · Enter: select · Esc: back');
    setText(sticksBtn, `Stick overlay: ${view.sticks ? 'on' : 'off'}`);
    setText(viewBtn, `View: ${view.mode === 'los' ? 'line of sight' : view.mode === 'chase' ? 'chase' : 'FPV'}`);
    setText(arrowsBtn, `Force arrows: ${view.arrows ? 'on' : 'off'}`);
    setText(patternBtn, `Pattern reminder: ${view.patternHint ? 'on' : 'off'}`);
    if (document.activeElement !== uptiltEl) uptiltEl.value = String(uptiltNow());
    setText(uptiltOut, view.uptiltSet ? `${view.uptiltDeg}° (yours)` : `${LEARN_UPTILT}° in Learn, ${view.uptiltDeg}° in Gates and Free fly`);
    uptiltAuto.hidden = !view.uptiltSet;
    skipBtn.hidden = !chapter;
    setText(skipBtn, 'Skip this part');
  }
  let hint = inp.hint;
  if (s.crashed) hint = `Crashed${s.crashedInto && s.crashedInto !== 'ground' ? ' into a ' + s.crashedInto : ''}. Resetting…`;
  else if (!sim.armed && !hint && !setup.open && !scripted && !demo && !watching) {
    hint = input.source === 'gamepad' ? (usesDefault ? `Pull the left stick down and press ${names.arm} to arm` : 'Throttle down, then arm to fly') : 'Press Space to arm, then hold W to take off';
  }
  hintEl.hidden = !hint || menuOpen;
  if (hint) setText(hintEl, hint);

  renderer.render(scene, camera);
  drawDemoMarks(standCam ? modelScale : 0);
  fpsCount++;
  if (fpsTime >= 1) { hook.fps = fpsCount / fpsTime; setText(fpsEl, `${Math.round(hook.fps)} fps`); fpsCount = 0; fpsTime = 0; }
  hook.frames++;
  hook.ready = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
