// Feel tuning: a preset plus a few named sliders, turned into sim and input settings. Pure except load/save.
// Defaults are the sourced values (docs/feel.md); "Reset to default" goes back to them.
import { defaultQuad, defaultFc, hoverStick, PRESETS, DEFAULT_PRESET } from './params.js';

export const TUNING_KEY = 'fpvsim.tuning.v1';

// key, label, range, and how the value is shown.
export const SLIDERS = [
  { key: 'rateMax', label: 'Max rate (full stick)', min: 200, max: 1200, step: 10, show: (v) => `${v}°/s` },
  { key: 'rateCenter', label: 'Centre sensitivity', min: 20, max: 300, step: 5, show: (v) => `${v}°/s` },
  { key: 'expo', label: 'Expo', min: 0, max: 1, step: 0.05, show: (v) => v.toFixed(2) },
  { key: 'responsiveness', label: 'Responsiveness', min: 0.3, max: 1.5, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'floatiness', label: 'Floatiness', min: 0.5, max: 2, step: 0.05, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'throttleMid', label: 'Throttle at stick centre', min: 0.05, max: 0.6, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
  { key: 'throttleExpo', label: 'Throttle expo', min: 0, max: 1, step: 0.05, show: (v) => v.toFixed(2) },
  { key: 'deadzone', label: 'Stick deadzone', min: 0, max: 0.2, step: 0.01, show: (v) => `${Math.round(v * 100)}%` },
];

export function defaultTuning(preset = DEFAULT_PRESET) {
  const fc = defaultFc();
  return {
    preset: PRESETS[preset] ? preset : DEFAULT_PRESET,
    rateMax: fc.rates.roll.max, rateCenter: fc.rates.roll.center, expo: fc.rates.roll.expo, // Betaflight defaults
    responsiveness: 1,   // scales the rate-loop gains (1 = the measured 45 ms response)
    floatiness: 1,       // divides air drag: higher = coasts longer
    throttleMid: null,   // throttle with a spring-centred stick at rest; null = this preset's hover throttle
    throttleExpo: 0,     // Betaflight default
    deadzone: 0.05,
  };
}

const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);

// Clean up anything loaded from storage: unknown preset, missing or out-of-range numbers.
export function sanitizeTuning(t) {
  const d = defaultTuning(t && t.preset);
  if (!t || typeof t !== 'object') return d;
  for (const s of SLIDERS) {
    if (s.key === 'throttleMid' && (t.throttleMid === null || t.throttleMid === undefined)) continue;
    d[s.key] = num(t[s.key], s.min, s.max, d[s.key]);
  }
  if (d.rateCenter > d.rateMax) d.rateCenter = d.rateMax;
  return d;
}

// Tuning -> the numbers the sim and the input layer use.
export function buildConfig(tuning) {
  const t = sanitizeTuning(tuning), p = PRESETS[t.preset];
  const quad = defaultQuad(), fc = defaultFc();
  fc.throttleLimit = p.throttleLimit;
  for (const axis of ['roll', 'pitch', 'yaw']) fc.rates[axis] = { center: t.rateCenter, max: t.rateMax, expo: t.expo };
  fc.kp *= t.responsiveness; fc.kd *= t.responsiveness;
  quad.dragLinear /= t.floatiness; quad.dragQuadratic /= t.floatiness;
  if (quad.dragBody) quad.dragBody = quad.dragBody.map((k) => k / t.floatiness);
  const hover = hoverStick(quad, fc);
  return { tuning: t, quad, fc, hover,
    input: { throttleMid: t.throttleMid ?? hover, throttleExpo: t.throttleExpo, deadzone: t.deadzone } };
}

export function loadTuning(storage) {
  try { const raw = storage.getItem(TUNING_KEY); return raw ? sanitizeTuning(JSON.parse(raw)) : null; } catch { return null; }
}
export function saveTuning(storage, t) {
  try { storage.setItem(TUNING_KEY, JSON.stringify(t)); return true; } catch { return false; }
}
