// Beginner path: 8 lessons, each a list of steps checked against the flying, each passed only after
// 3 good runs in a row (measured, not one lucky pass). Pure logic, no DOM: main.js feeds one sample per frame.
// Goal (PLAN.md): "if someone hands you a real drone, you can fly it with confidence."
import { rotate } from './physics.js';

export const STREAK_TO_PASS = 3;       // good runs in a row that pass a lesson
export const GENTLE_LANDING = 1.5;     // m/s: touching down faster than this is not a good run (assumption, see PROGRESS.md)
export const SLOW = 8;                 // m/s: "slow turns" means staying under this (assumption)
export const DISARM_REACTION = 1.0;    // s allowed between the DISARM call and the motors stopping (assumption)
export const HEADING_TOL = 20;         // deg either side when a step asks for a heading
// Light wind for lesson 5 and the Ready check: Beaufort force 2 "light breeze", 4 to 6 knots; the middle, 5 knots = 2.6 m/s,
// blowing from the left across the field (docs/physics.md, wind).
export const WIND = [2.6, 0, 0];

// Places (world frame: the pad is at the origin, the quad starts facing -Z, the line-of-sight pilot stands at z = +5).
// Everything stays within about 17 m of the pilot so the quad is still readable in line-of-sight view.
export const PAD = { x: 0, z: 0, r: 1.5 };
export const BOX = { x: 0, y: 2, z: 0, half: 1.5, halfY: 1 };       // hover box over the pad: 3 x 3 m, 1 to 3 m up
export const BIG_BOX = { x: 0, y: 3, z: 0, half: 3, halfY: 2 };     // acro intro: 6 x 6 m, 1 to 5 m up
export const CONE_A = { x: -5, z: -7 }, CONE_B = { x: 5, z: -7 };   // orbit and figure-8 markers
export const ORBIT_MAX_R = 7;                                       // m: further from the cone than this does not count
export const FAR = { x: 0, z: -12, r: 3 };                          // the turn-around point
export const HOME = { x: 0, z: -4, r: 3 };                          // on the way back: nose must point home here
export const LOW = { min: 0.2, max: 1.5 };                          // m: "hover low" band for the disarm drill

const hover = (hold, box = BOX) => ({ type: 'box', box, hold, text: `Take off and hold still inside the box for ${hold} s` });
const face = (deg, text) => ({ type: 'box', box: BOX, hold: 3, heading: deg, text });
const land = () => ({ type: 'land', text: 'Land gently on the pad' });
const orbit = (cone, text, opposite = false) => ({ type: 'orbit', cone, opposite, text });
const outAndBack = () => [
  { type: 'reach', at: FAR, text: 'Fly out to the far ring' },
  { type: 'reach', at: HOME, heading: 180, tol: 45, text: 'Turn around and fly back, nose toward you' },
];
const lostIt = () => [
  { type: 'spin' },
  { type: 'box', box: BOX, hold: 3, text: 'A gust spun you round. Work out which way it points, then hover over the pad for 3 s' },
];

// views: the views a lesson must be passed in (each needs its own 3 in a row); null = any one view.
export const LESSONS = [
  { id: 'takeoff', title: 'Take off, hover, land', mode: 'angle', views: ['fpv', 'los'], limit: 60, markers: ['box'],
    line: 'Small stick movements. On a real radio the throttle stays where you leave it.',
    steps: [hover(5), land()] },
  { id: 'directions', title: 'Hover facing four ways', mode: 'angle', views: ['fpv', 'los'], limit: 120, markers: ['box'],
    line: 'With the nose toward you, left and right are swapped. This is where most beginners crash a real drone.',
    steps: [hover(2), face(90, 'Turn the nose to the right and hold 3 s'), face(180, 'Nose toward you: hold 3 s (left and right are swapped)'),
      face(-90, 'Nose to the left: hold 3 s'), face(0, 'Nose away from you again: hold 3 s'), land()] },
  { id: 'turns', title: 'Slow turns, orbit, figure 8', mode: 'angle', views: ['fpv', 'los'], limit: 150, markers: ['cones'], maxSpeed: SLOW,
    line: 'Turn with yaw and a little roll together, and keep it slow.',
    steps: [orbit(CONE_A, 'Fly one slow circle around the left cone'), orbit(CONE_B, 'Circle the right cone the other way (a figure 8)', true), land()] },
  { id: 'outback', title: 'Fly out, turn around, come back, land', mode: 'angle', views: ['fpv', 'los'], limit: 120, markers: ['far'],
    line: 'Coming back, the quad faces you: steer as if you sat in it.',
    steps: [...outAndBack(), land()] },
  { id: 'wind', title: 'The same in light wind', mode: 'angle', views: null, limit: 120, markers: ['far'], wind: true,
    line: 'A light breeze from the left pushes the quad: lean into it a little.',
    steps: [...outAndBack(), land()] },
  { id: 'emergency', title: 'Emergencies', mode: 'angle', views: null, limit: 150, markers: ['box', 'far'],
    line: 'When in doubt, disarm. A dropped drone is cheaper than a runaway one.',
    steps: [{ type: 'disarm', text: 'Hover low, under 1.5 m, and wait for the call' }, { type: 'rearm', text: 'Arm again and take off' },
      { type: 'reach', at: FAR, text: 'Fly out to the far ring' }, ...lostIt(), land()] },
  { id: 'acro', title: 'Acro intro', mode: 'acro', views: null, limit: 120, markers: ['bigbox'],
    line: 'Acro does not level itself: you bring the stick back to level it.',
    steps: [hover(5, BIG_BOX), land()] },
  { id: 'ready', title: 'Ready check', mode: 'angle', views: null, limit: 300, markers: ['box', 'cones', 'far'], wind: true, maxSpeed: SLOW, streak: 1,
    line: 'Everything in one flight, in light wind. One good run earns the badge.',
    steps: [hover(5), face(180, 'Nose toward you: hold 3 s'), face(0, 'Nose away from you: hold 3 s'),
      orbit(CONE_A, 'Circle the left cone'), orbit(CONE_B, 'Circle the right cone the other way', true),
      { type: 'reach', at: FAR, text: 'Fly out to the far ring' }, ...lostIt(), land()] },
];
export const lessonById = (id) => LESSONS.find((l) => l.id === id) || null;
export const streakNeeded = (lesson) => lesson.streak ?? STREAK_TO_PASS;
export const viewKeys = (lesson) => lesson.views || ['any'];
// Which progress slot a run in `view` counts for; null = this view does not count for this lesson.
export const viewKeyFor = (lesson, view) => (lesson.views ? (lesson.views.includes(view) ? view : null) : 'any');

// ---- Progress ----
export function createProgress(saved) {
  const p = {};
  for (const l of LESSONS) {
    p[l.id] = {};
    for (const k of viewKeys(l)) {
      const o = saved && typeof saved === 'object' && saved[l.id] && typeof saved[l.id] === 'object' && saved[l.id][k] ? saved[l.id][k] : {};
      p[l.id][k] = { streak: Number.isInteger(o.streak) ? Math.min(streakNeeded(l), Math.max(0, o.streak)) : 0,
        runs: Number.isInteger(o.runs) && o.runs > 0 ? o.runs : 0, passed: o.passed === true };
    }
  }
  return p;
}
export const lessonPassed = (progress, lesson) => viewKeys(lesson).every((k) => progress[lesson.id][k].passed);
export function isUnlocked(progress, id) {
  const i = LESSONS.findIndex((l) => l.id === id);
  return i === 0 || (i > 0 && LESSONS.slice(0, i).every((l) => lessonPassed(progress, l)));
}
export const nextLesson = (progress) => LESSONS.find((l) => !lessonPassed(progress, l)) || null;
export const isReady = (progress) => LESSONS.every((l) => lessonPassed(progress, l));

// Record a finished run. Returns { streak, needed, passedView (this view just passed), passedLesson (whole lesson just passed) }.
export function recordResult(progress, lesson, key, result) {
  const p = progress[lesson.id][key], needed = streakNeeded(lesson), was = lessonPassed(progress, lesson);
  p.runs++;
  p.streak = result.good ? Math.min(needed, p.streak + 1) : 0;
  const passedView = !p.passed && p.streak >= needed;
  if (passedView) p.passed = true;
  return { streak: p.streak, needed, passedView, passedLesson: !was && lessonPassed(progress, lesson) };
}

const KEY = 'fpvsim.lessons.v1';
export function loadProgress(storage) {
  try { return createProgress(JSON.parse(storage.getItem(KEY))); } catch { return createProgress(); }
}
export function saveProgress(storage, progress) {
  try { storage.setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

// ---- One run ----
const DEG = Math.PI / 180;
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const _f = [0, 0, 0];
// Heading in degrees: 0 = nose away from the pilot (-Z), 90 = nose to the right, 180 = nose toward the pilot.
export function headingDeg(quat) { rotate(quat, [0, 0, -1], _f); return Math.atan2(_f[0], -_f[2]) / DEG; }
const inBox = (b, p) => Math.abs(p[0] - b.x) <= b.half && Math.abs(p[2] - b.z) <= b.half && Math.abs(p[1] - b.y) <= b.halfY;
const near = (c, p, r) => Math.hypot(p[0] - c.x, p[2] - c.z) <= r;

// state: 'ready' (waiting on the pad for arming) -> 'running' -> 'done' | 'failed'
export function createAttempt(lesson, rng = Math.random) {
  return { lesson, rng, state: 'ready', step: 0, status: '', reason: '', view: null, key: null, t0: 0, time: 0,
    hold: 0, holdFrom: null, wind: 0, ang: null, lastSign: 0, maxSpeed: 0, airVy: 0, wasOnGround: true, touchdown: null, groundFrom: null,
    promptAt: null, lowTime: 0, lastT: null, prompt: false, reaction: null, action: null };
}
export const currentStep = (a) => a.lesson.steps[Math.min(a.step, a.lesson.steps.length - 1)];

function finish(a, state, reason = '') { a.state = state; a.reason = reason; a.prompt = false; a.status = state === 'done' ? 'Done' : reason; return a; }
function advance(a) {
  a.step++; a.hold = 0; a.holdFrom = null; a.ang = null; a.wind = 0; a.groundFrom = null; a.promptAt = null; a.lowTime = 0; a.prompt = false;
  if (a.step >= a.lesson.steps.length) finish(a, 'done');
}

// Feed the current state, once per frame.
// sm: { t (sim time, s), pos, vel, quat, armed, crashed, onGround, mode ('angle' | 'acro'), view ('fpv' | 'los' | 'chase') }
// Sets a.status (one line for the screen) and sometimes a.action ({ type: 'spin', yawDeg }) for the caller to apply and clear.
export function attemptUpdate(a, sm) {
  if (a.state === 'done' || a.state === 'failed') return a;
  const L = a.lesson;
  if (a.state === 'ready') {
    const key = viewKeyFor(L, sm.view);
    if (sm.mode !== L.mode) a.status = `Switch to ${L.mode} mode for this lesson`;
    else if (!key) a.status = 'Switch to FPV or line of sight for this lesson';
    else if (!sm.onGround || !near(PAD, sm.pos, 3)) a.status = 'Reset to start from the pad';
    else a.status = 'Arm to start';
    if (!sm.armed || sm.mode !== L.mode || !key || !sm.onGround || !near(PAD, sm.pos, 3)) return a;
    a.state = 'running'; a.t0 = sm.t; a.view = sm.view; a.key = key; a.lastT = sm.t;
  }
  const t = sm.t - a.t0, dt = Math.max(0, sm.t - a.lastT);
  a.time = t; a.lastT = sm.t;
  const st = currentStep(a);
  if (sm.crashed) return finish(a, 'failed', 'Crashed');
  if (sm.mode !== L.mode) return finish(a, 'failed', `Switched out of ${L.mode} mode`);
  if (!sm.armed && st.type !== 'land' && st.type !== 'rearm' && st.type !== 'disarm') return finish(a, 'failed', 'Disarmed before the lesson was finished');
  if (t > L.limit) return finish(a, 'failed', 'Out of time');
  a.maxSpeed = Math.max(a.maxSpeed, Math.hypot(sm.vel[0], sm.vel[1], sm.vel[2]));
  // Touchdown speed: the sink rate in the last frame before the ground.
  if (sm.onGround && !a.wasOnGround) a.touchdown = Math.max(0, -a.airVy);
  if (!sm.onGround) a.airVy = sm.vel[1];
  a.wasOnGround = sm.onGround;

  if (st.type === 'spin') {
    a.action = { type: 'spin', yawDeg: 90 + 180 * a.rng() };
    advance(a);
    return a;
  }
  a.status = st.text;
  if (st.type === 'box') {
    const hd = st.heading === undefined ? 0 : wrap((headingDeg(sm.quat) - st.heading) * DEG) / DEG;
    const inside = inBox(st.box, sm.pos), facing = Math.abs(hd) <= HEADING_TOL;
    if (inside && facing) {
      if (a.holdFrom === null) a.holdFrom = t;
      a.hold = t - a.holdFrom;
      if (st.hold > 0) a.status += ` · ${Math.max(0, st.hold - a.hold).toFixed(1)} s`;
      if (a.hold >= st.hold) advance(a);
    } else {
      a.holdFrom = null; a.hold = 0;
      if (inside) a.status += ` · turn ${hd > 0 ? 'left' : 'right'} ${Math.abs(Math.round(hd))}°`;
      else if (st.heading !== undefined) a.status += ' · stay in the box';
    }
  } else if (st.type === 'orbit') {
    const c = st.cone, now = Math.atan2(sm.pos[2] - c.z, sm.pos[0] - c.x);
    const counts = near(c, sm.pos, ORBIT_MAX_R) && !sm.onGround;
    if (a.ang !== null && counts) a.wind += wrap(now - a.ang);
    a.ang = counts ? now : null;
    const wrongWay = st.opposite && a.lastSign !== 0 && Math.sign(a.wind) === a.lastSign && Math.abs(a.wind) > 0.5;
    const frac = wrongWay ? 0 : Math.min(1, Math.abs(a.wind) / (2 * Math.PI * 0.97));
    a.status += wrongWay ? ' · go round the other way' : ` · ${Math.round(frac * 100)} %`;
    if (frac >= 1) { a.lastSign = Math.sign(a.wind); advance(a); }
  } else if (st.type === 'reach') {
    const hd = st.heading === undefined ? 0 : wrap((headingDeg(sm.quat) - st.heading) * DEG) / DEG;
    if (near(st.at, sm.pos, st.at.r) && !sm.onGround && Math.abs(hd) <= (st.tol ?? 180)) advance(a);
  } else if (st.type === 'land') {
    if (sm.onGround && near(PAD, sm.pos, PAD.r)) {
      if (a.groundFrom === null) a.groundFrom = t;
      if (t - a.groundFrom >= 0.5) advance(a);
    } else {
      a.groundFrom = null;
      if (sm.onGround) a.status = sm.armed ? 'Not on the pad: lift off and land on it' : 'Not on the pad';
      if (sm.onGround && !sm.armed) return finish(a, 'failed', 'Landed off the pad');
    }
  } else if (st.type === 'disarm') {
    if (a.promptAt === null) a.promptAt = 1.5 + 3 * a.rng(); // s of low hovering before the call: not predictable
    if (!a.prompt) {
      if (!sm.armed) return finish(a, 'failed', 'Disarmed before the call');
      const low = !sm.onGround && sm.pos[1] >= LOW.min && sm.pos[1] <= LOW.max;
      if (low) a.lowTime += dt;
      else if (!sm.onGround) a.status = 'Too high: hover under 1.5 m';
      if (a.lowTime >= a.promptAt) { a.prompt = true; a.promptT = t; }
    }
    if (a.prompt) {
      a.status = 'DISARM NOW';
      if (!sm.armed) { a.reaction = t - a.promptT; advance(a); }
      else if (t - a.promptT > 5) return finish(a, 'failed', 'Did not disarm');
    }
  } else if (st.type === 'rearm') {
    if (sm.armed) advance(a);
  }
  return a;
}

// Result of a finished run: { completed, good, reason, time, metrics: [{ label, value, unit, limit, ok }] }.
// A run is good when every step was done and every measured value is inside its limit.
export function attemptResult(a) {
  const L = a.lesson, metrics = [];
  const add = (label, value, unit, limit) => metrics.push({ label, value, unit, limit, ok: value <= limit });
  if (L.steps.some((s) => s.type === 'land') && a.touchdown !== null) add('Touchdown', a.touchdown, 'm/s', GENTLE_LANDING);
  if (L.maxSpeed) add('Top speed', a.maxSpeed, 'm/s', L.maxSpeed);
  if (a.reaction !== null) add('Disarm reaction', a.reaction, 's', DISARM_REACTION);
  const completed = a.state === 'done';
  const bad = metrics.find((m) => !m.ok);
  const reason = !completed ? a.reason : bad ? `${bad.label} ${bad.value.toFixed(1)} ${bad.unit} (limit ${bad.limit} ${bad.unit})` : '';
  return { completed, good: completed && !bad, reason, time: a.time, metrics };
}
