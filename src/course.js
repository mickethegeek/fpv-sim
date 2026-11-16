// The gate course and the lap timer as plain data + pure functions. No DOM, no three.js (scene.js draws the gates).
// Heading convention (same as __sim.place): 0 deg = flying toward -Z ("north"), + = turned right (toward +X).
import { DEG } from './params.js';

// Gate opening. A standard MultiGP race gate is 5 ft x 5 ft (1.52 m) [docs/physics.md, 9]; these practice gates
// are about twice as wide so a beginner can get through. Each gate stands on the ground.
export const GATE_W = 3.0;     // m, opening width
export const GATE_H = 2.4;     // m, opening height
export const GATE_BAR = 0.16;  // m, thickness of the frame

// The course: 7 gates, flown clockwise (right turns). Gate 1 is also the start/finish line.
const LAYOUT = [
  // x, z, heading (deg)
  [0, -22, 0],
  [0, -58, 0],
  [14, -92, 70],
  [36, -74, 180],
  [34, -40, 180],
  [24, -10, 200],
  [12, 12, 270],
];

export function createCourse() {
  const gates = LAYOUT.map(([x, z, headingDeg], i) => {
    const h = headingDeg * DEG;
    return { index: i, x, z, headingDeg, w: GATE_W, h: GATE_H, bar: GATE_BAR,
      fwd: [Math.sin(h), -Math.cos(h)],    // direction of flight through the gate (x, z)
      right: [Math.cos(h), Math.sin(h)] }; // across the gate (x, z)
  });
  return { id: 'field-7', gates };
}

// Position relative to a gate: along (m past the gate plane, + = after), across (m right of centre).
export function gateLocal(g, pos) {
  const dx = pos[0] - g.x, dz = pos[2] - g.z;
  return { along: dx * g.fwd[0] + dz * g.fwd[1], across: dx * g.right[0] + dz * g.right[1] };
}

// Did the move from prev to pos go through the gate opening in the right direction?
// Returns the fraction of the move at which the gate plane was crossed (0..1), or -1.
export function gateCrossing(g, prev, pos) {
  const a = gateLocal(g, prev), b = gateLocal(g, pos);
  if (!(a.along < 0 && b.along >= 0)) return -1;
  const f = a.along / (a.along - b.along);
  const across = a.across + (b.across - a.across) * f;
  const y = prev[1] + (pos[1] - prev[1]) * f;
  return Math.abs(across) <= g.w / 2 && y >= 0 && y <= g.h ? f : -1;
}

// Does a sphere touch the gate's frame (two posts and the top bar)?
export function gateHit(g, pos, radius) {
  const { along, across } = gateLocal(g, pos);
  const t = g.bar / 2;
  if (Math.abs(along) > t + radius) return false;
  const y = pos[1], top = g.h + g.bar;
  if (y - radius > top) return false;
  const ax = Math.abs(across), outer = g.w / 2 + g.bar;
  if (ax > outer + radius) return false;
  if (ax > g.w / 2 - radius) return true;   // a post
  return y + radius > g.h;                    // the top bar
}

// ---- Lap timer ----
// Fly the gates in order. The clock starts when you go through gate 1 and a lap ends when you go through it again
// after all the others. A missed gate stays "next" until you go back through it.
export function createRace(course, best = null) {
  return { course, next: 0, running: false, lapStart: 0, lapTime: 0, lastLap: null, best, laps: 0, newBest: false, passed: 0 };
}

// Crash or reset: back to "waiting for gate 1". The best lap is kept.
export function resetRace(race) {
  race.next = 0; race.running = false; race.lapStart = 0; race.lapTime = 0; race.passed = 0;
}

// Call once per frame with the quad's previous and current position and the sim times that go with them.
// Returns a list of events: { type: 'start' | 'gate' | 'lap', gate, lapTime?, best? }.
export function raceUpdate(race, prev, pos, tPrev, tNow) {
  const events = [];
  const gates = race.course.gates;
  const g = gates[race.next];
  const f = gateCrossing(g, prev, pos);
  if (f >= 0) {
    const t = tPrev + (tNow - tPrev) * f;
    if (race.next === 0) {
      if (race.running) {
        const lapTime = t - race.lapStart;
        race.lastLap = lapTime;
        race.laps++;
        race.newBest = race.best === null || lapTime < race.best;
        if (race.newBest) race.best = lapTime;
        events.push({ type: 'lap', gate: 0, lapTime, best: race.newBest });
      } else {
        events.push({ type: 'start', gate: 0 });
      }
      race.running = true;
      race.lapStart = t;
      race.passed = 1;
    } else {
      race.passed++;
      events.push({ type: 'gate', gate: race.next });
    }
    race.next = (race.next + 1) % gates.length;
  }
  race.lapTime = race.running ? tNow - race.lapStart : 0;
  return events;
}

// 83.456 -> "1:23.46"
export function formatLap(t) {
  if (t === null || t === undefined || !Number.isFinite(t)) return '–:––.––';
  const c = Math.round(t * 100), m = Math.floor(c / 6000), s = (c - m * 6000) / 100;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// Best lap storage (browser only; every access wrapped because storage can be blocked).
const KEY = (course) => `fpvsim.bestlap.${course.id}.v1`;
export function loadBest(course, storage) {
  try { const v = JSON.parse(storage.getItem(KEY(course))); return typeof v === 'number' && v > 0 && Number.isFinite(v) ? v : null; }
  catch { return null; }
}
export function saveBest(course, storage, best) {
  try { storage.setItem(KEY(course), JSON.stringify(best)); return true; } catch { return false; }
}
