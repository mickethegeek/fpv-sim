// Skill meters: real-pilot skills in the order they are learned, scored from measured flight data,
// unlocked by consistency (3 good attempts in a row), not by one lucky pass. Pure logic, no DOM.
// main.js feeds samples in; the panel in the page shows the result.
import { createRace, raceUpdate, gateLocal } from './course.js';

export const STREAK_TO_PASS = 3;   // good attempts in a row that unlock the next skill
export const GOOD_SCORE = 60;      // an attempt at or above this (and completed) is "good"
export const SAMPLE_DT = 0.02;     // s, attempts are recorded at 50 Hz of sim time
export const HOVER_HOLD = 10;      // s to stay in the box

const KINDS = {
  hover: { title: 'Hover', limit: 60,
    brief: 'Take off and hold still inside the box above the pad for 10 seconds.' },
  orbit: { title: 'Orbit a pole', limit: 90,
    brief: 'Fly one full circle around the pole ahead on your left. Keep the same distance and height.' },
  figure8: { title: 'Figure 8', limit: 120,
    brief: 'Fly a figure 8 around the two poles ahead: one way round the first, the other way round the second.' },
  gates: { title: 'Gates at speed', limit: 180,
    brief: 'Fly one full lap through all the gates, in order. Clean lines and a quick lap score best.' },
};

// Angle mode first, acro after (the first tier is the old lesson list: hover box, gates, then the same in acro).
export const SKILLS = ['angle', 'acro'].flatMap((mode) => Object.keys(KINDS).map((kind) => ({
  id: `${kind}-${mode}`, kind, mode, limit: KINDS[kind].limit,
  title: `${KINDS[kind].title} (${mode})`, brief: KINDS[kind].brief,
})));

// Where things are (world.js): the hover box sits over the pad; the two nearest poles are used for orbit and figure 8.
export const HOVER_BOX = { x: 0, y: 2, z: 0, half: 1.5, halfY: 0.75 };
export const POLE_A = { x: -10, z: -12 }, POLE_B = { x: 10, z: -12 };
const ORBIT_MAX_R = 14;  // m: further out than this the circle does not count
const FULL = 2 * Math.PI * 0.97;
const ENTRY = 0.9;       // rad of circling before orbit / figure-8 scoring starts (take-off and the way in are not scored)

// ---- Progress (what is unlocked) ----
export function createProgress(saved) {
  const p = {};
  for (const s of SKILLS) {
    const o = saved && typeof saved === 'object' && saved[s.id] ? saved[s.id] : {};
    p[s.id] = { streak: clampInt(o.streak, 0, STREAK_TO_PASS), best: num(o.best), attempts: clampInt(o.attempts, 0, 1e6), passed: o.passed === true };
  }
  return p;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clampInt = (v, lo, hi) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : lo);

export function isUnlocked(progress, id) {
  const i = SKILLS.findIndex((s) => s.id === id);
  return i === 0 || (i > 0 && progress[SKILLS[i - 1].id].passed);
}

// Record a finished attempt. Returns { streak, passedNow }.
export function recordResult(progress, id, result) {
  const p = progress[id];
  p.attempts++;
  if (result.good) p.streak = Math.min(STREAK_TO_PASS, p.streak + 1); else p.streak = 0;
  if (result.completed && (p.best === null || result.score > p.best)) p.best = result.score;
  const passedNow = !p.passed && p.streak >= STREAK_TO_PASS;
  if (passedNow) p.passed = true;
  return { streak: p.streak, passedNow };
}

const KEY = 'fpvsim.skills.v1';
export function loadProgress(storage) {
  try { return createProgress(JSON.parse(storage.getItem(KEY))); } catch { return createProgress(); }
}
export function saveProgress(storage, progress) {
  try { storage.setItem(KEY, JSON.stringify(progress)); return true; } catch { return false; }
}

// ---- One attempt ----
// state: 'ready' (waiting for arming) -> 'running' -> 'done' | 'failed'
export function createAttempt(skill, world) {
  return { skill, world, state: 'ready', samples: [], progress: 0, status: 'Arm to start', reason: '',
    t0: 0, last: -1, hold: 0, holdFrom: 0, wA: 0, wB: 0, angA: null, angB: null,
    race: skill.kind === 'gates' ? createRace(world.course) : null, crossings: [], prev: null };
}

const wrap = (a) => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);

// Feed the current state (call every frame; sim time t in seconds). Records at 50 Hz and tracks the task.
// sample: { t, pos: [x, y, z], sticks: { roll, pitch, yaw, throttle }, armed, crashed }
export function attemptUpdate(a, sm) {
  if (a.state === 'done' || a.state === 'failed') return a;
  if (a.state === 'ready') {
    if (!sm.armed) return a;
    a.state = 'running'; a.t0 = sm.t; a.prev = { pos: [...sm.pos], t: sm.t };
  }
  const t = sm.t - a.t0;
  if (sm.crashed) return finish(a, 'failed', 'Crashed');
  if (!sm.armed) return finish(a, 'failed', 'Disarmed before the task was finished');
  if (t > a.skill.limit) return finish(a, 'failed', 'Out of time');
  if (sm.t - a.last >= SAMPLE_DT - 1e-9) {
    a.last = sm.t;
    a.samples.push({ t, w: Math.abs(a.wA) + Math.abs(a.wB), x: sm.pos[0], y: sm.pos[1], z: sm.pos[2], roll: sm.sticks.roll, pitch: sm.sticks.pitch, yaw: sm.sticks.yaw, throttle: sm.sticks.throttle });
  }
  const [x, y, z] = sm.pos;
  const kind = a.skill.kind;
  if (kind === 'hover') {
    const b = HOVER_BOX;
    const inside = Math.abs(x - b.x) <= b.half && Math.abs(z - b.z) <= b.half && Math.abs(y - b.y) <= b.halfY;
    if (!inside) { a.holdFrom = t; a.hold = 0; a.status = t < 0.5 ? 'Climb into the box' : 'Get back inside the box'; }
    else { a.hold = t - a.holdFrom; a.status = `Hold it: ${Math.max(0, HOVER_HOLD - a.hold).toFixed(1)} s`; }
    a.progress = Math.min(1, a.hold / HOVER_HOLD);
    if (a.hold >= HOVER_HOLD) return finish(a, 'done');
  } else if (kind === 'orbit' || kind === 'figure8') {
    for (const [pole, w, ang] of [[POLE_A, 'wA', 'angA'], [POLE_B, 'wB', 'angB']]) {
      const now = Math.atan2(z - pole.z, x - pole.x);
      const near = Math.hypot(x - pole.x, z - pole.z) <= ORBIT_MAX_R && y > 0.3;
      if (a[ang] !== null && near) a[w] += wrap(now - a[ang]);
      a[ang] = now;
    }
    if (kind === 'orbit') {
      a.progress = Math.min(1, Math.abs(a.wA) / FULL);
      a.status = `Around the pole: ${Math.round(a.progress * 100)} %`;
      if (Math.abs(a.wA) >= FULL) return finish(a, 'done');
    } else {
      const pa = Math.min(1, Math.abs(a.wA) / FULL), pb = Math.min(1, Math.abs(a.wB) / FULL);
      const opposite = a.wA * a.wB < 0;
      a.progress = (pa + (opposite || pb < 0.3 ? pb : 0)) / 2;
      a.status = `Left pole ${Math.round(pa * 100)} % · right pole ${Math.round(pb * 100)} %${pa > 0.5 && pb > 0.5 && !opposite ? ' · go round the other way' : ''}`;
      if (pa >= 1 && pb >= 1 && opposite) return finish(a, 'done');
    }
  } else if (kind === 'gates') {
    const r = a.race, n = r.course.gates.length, g = r.course.gates[r.next];
    for (const ev of raceUpdate(r, a.prev.pos, sm.pos, a.prev.t, sm.t)) {
      const l = gateLocal(g, sm.pos);
      a.crossings.push({ gate: ev.gate, across: l.across, y: sm.pos[1] - g.h / 2 });
      if (ev.type === 'lap') { a.lapTime = ev.lapTime; a.progress = 1; return finish(a, 'done'); }
    }
    a.progress = r.running ? r.passed / (n + 1) : 0;
    a.status = r.running ? `Gate ${r.next + 1} next · ${r.passed} of ${n + 1} passes done` : 'Fly through gate 1 to start the clock';
  }
  a.prev = { pos: [...sm.pos], t: sm.t };
  return a;
}

function finish(a, state, reason = '') { a.state = state; a.reason = reason; a.status = state === 'done' ? 'Done' : reason; return a; }

// ---- Scoring from the recorded data ----
const mean = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const std = (v) => { const m = mean(v); return Math.sqrt(mean(v.map((x) => (x - m) ** 2))); };
const rms = (v) => Math.sqrt(mean(v.map((x) => x * x)));
// 1 at "good" or better, 0 at "bad" or worse, straight line between.
const grade = (x, good, bad) => Math.min(1, Math.max(0, 1 - (x - good) / (bad - good)));

// Stick smoothness: RMS stick acceleration (second difference at 10 Hz) over the four sticks, in stick-travel per s^2.
// Smooth hands give single digits; twitching and banging the sticks gives dozens.
export function stickJerk(samples) {
  const step = Math.round(0.1 / SAMPLE_DT), dt = step * SAMPLE_DT, acc = [];
  for (let i = 2 * step; i < samples.length; i += step) {
    const a = samples[i - 2 * step], b = samples[i - step], c = samples[i];
    for (const k of ['roll', 'pitch', 'yaw', 'throttle']) acc.push((c[k] - 2 * b[k] + a[k]) / (dt * dt));
  }
  return acc.length ? rms(acc) : 0;
}

// Returns { completed, score (0-100), good, metrics: [{ key, label, value, unit, grade (0-1), weight }] }.
export function scoreAttempt(a) {
  const kind = a.skill.kind;
  let s = a.samples;
  const metrics = [];
  const add = (key, label, value, unit, good, bad, weight) => metrics.push({ key, label, value, unit, grade: grade(value, good, bad), weight });
  if (kind === 'hover') {
    s = s.filter((p) => p.t >= a.holdFrom); // only the 10 s that counted
    const b = HOVER_BOX;
    add('drift', 'Drift from the centre', rms(s.map((p) => Math.hypot(p.x - b.x, p.z - b.z))), 'm', 0.3, 1.5, 0.4);
    add('height', 'Height wobble', std(s.map((p) => p.y)), 'm', 0.08, 0.5, 0.4);
  } else if (kind === 'orbit') {
    const fly = s.filter((p) => p.w >= ENTRY); // the way in is free: scored once you are going round
    add('radius', 'Distance to the pole, wobble', std(fly.map((p) => Math.hypot(p.x - POLE_A.x, p.z - POLE_A.z))), 'm', 0.5, 3, 0.4);
    add('height', 'Height wobble', std(fly.map((p) => p.y)), 'm', 0.15, 1.2, 0.4);
  } else if (kind === 'figure8') {
    const fly = s.filter((p) => p.w >= ENTRY);
    add('line', 'Distance to the nearer pole, wobble', std(fly.map((p) => Math.min(Math.hypot(p.x - POLE_A.x, p.z - POLE_A.z), Math.hypot(p.x - POLE_B.x, p.z - POLE_B.z)))), 'm', 1, 4, 0.4);
    add('height', 'Height wobble', std(fly.map((p) => p.y)), 'm', 0.15, 1.2, 0.4);
  } else if (kind === 'gates') {
    add('line', 'Off the gate centre', a.crossings.length ? mean(a.crossings.map((c) => Math.hypot(c.across, c.y))) : 9, 'm', 0.25, 1.3, 0.4);
    add('time', 'Lap time', a.lapTime ?? 999, 's', 30, 80, 0.4);
  }
  add('sticks', 'Stick smoothness (lower is smoother)', stickJerk(s), '/s²', 5, 40, 0.2);
  const completed = a.state === 'done';
  const score = completed ? Math.round(100 * metrics.reduce((t, m) => t + m.grade * m.weight, 0)) : 0;
  return { completed, score, good: completed && score >= GOOD_SCORE, metrics, reason: a.reason };
}
