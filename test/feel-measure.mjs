// Feel measurements: step inputs into the real sim (same modules the page runs), numbers and traces out.
// Pure (no DOM, no node APIs) so it runs in node (node test/feel.mjs) and inside Chrome (test/flight.mjs M5 block).
// deps = { createSim, simSteps, attitude } from src/. Every number here is measured, none is assumed.
const DEG = Math.PI / 180;
const st = (o = {}) => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0, ...o });

export function measureFeel({ createSim, simSteps, attitude }, simOpts = {}) {
  const air = (mode, y = 300) => { const sim = createSim({ ...simOpts, mode }); sim.state.pos[1] = y; sim.armed = true; return sim; };
  // Run for ms, sampling every millisecond: fn(sim, t_ms) -> value.
  const run = (sim, sticks, ms, fn, out, t0 = 0) => { for (let i = 0; i < ms; i++) { simSteps(sim, sticks, 1); out.push([t0 + i + 1, fn(sim)]); } };
  const firstAbove = (tr, v) => { const p = tr.find(([, x]) => x >= v); return p ? p[0] : null; };

  // Hover throttle: bisection on vertical speed.
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2, sim = air('angle'); simSteps(sim, st({ throttle: mid }), 1500); if (sim.state.vel[1] > 0) hi = mid; else lo = mid; }
  const hover = (lo + hi) / 2;
  const settle = (mode) => { const sim = air(mode); simSteps(sim, st({ throttle: hover }), 800); return sim; };

  const out = { hoverThrottle: hover, traces: {} };

  // Acro: full-stick step on each axis, then let go. Rate in deg/s, pilot sign.
  const rateOf = { roll: (s) => -s.state.omega[2] / DEG, pitch: (s) => -s.state.omega[0] / DEG, yaw: (s) => -s.state.omega[1] / DEG };
  out.acro = {};
  for (const axis of ['roll', 'pitch', 'yaw']) {
    const sim = settle('acro'), tr = [];
    run(sim, st({ throttle: hover, [axis]: 1 }), 400, rateOf[axis], tr);
    const target = sim.fcCfg.rates[axis].max;
    const peak = Math.max(...tr.map(([, v]) => v));
    const held = tr.at(-1)[1];
    run(sim, st({ throttle: hover }), 400, rateOf[axis], tr, 400);
    const stop = tr.find(([t, v]) => t > 400 && Math.abs(v) < 0.05 * target);
    out.acro[axis] = { target, t50: firstAbove(tr, 0.5 * target), t90: firstAbove(tr, 0.9 * target), overshootPct: Math.max(0, (peak - target) / target * 100),
      heldRate: held, stopMs: stop ? stop[0] - 400 : null };
    out.traces[`acro-${axis}-full-stick`] = { unit: 'deg/s', target, stepOff: 400, data: tr };
  }
  // Acro: small step (30 % roll stick): the linear feel around centre.
  {
    const sim = settle('acro'), tr = [];
    run(sim, st({ throttle: hover, roll: 0.3 }), 300, rateOf.roll, tr);
    const target = tr.at(-1)[1];
    out.acroSmall = { stick: 0.3, heldRate: target, t90: firstAbove(tr, 0.9 * target), overshootPct: Math.max(0, (Math.max(...tr.map(([, v]) => v)) - target) / target * 100) };
    out.traces['acro-roll-30pct-stick'] = { unit: 'deg/s', target, data: tr };
  }
  // Angle mode: half roll stick, hold, let go. Tilt in degrees.
  {
    const sim = settle('angle'), tr = [], roll = (s) => attitude(s.state.quat).roll / DEG * (attitude(s.state.quat).roll / DEG > -1e9 ? 1 : 1);
    run(sim, st({ throttle: hover, roll: 0.5 }), 1000, roll, tr);
    const sign = Math.sign(tr.at(-1)[1]) || 1, tilt = tr.map(([t, v]) => [t, v * sign]);
    const target = sim.fcCfg.angleLimit * 0.5, peak = Math.max(...tilt.map(([, v]) => v)), held = tilt.at(-1)[1];
    const back = [];
    run(sim, st({ throttle: hover }), 1000, roll, back, 1000);
    const lev = back.map(([t, v]) => [t, v * sign]);
    const level = lev.find(([, v], i) => lev.slice(i).every(([, w]) => Math.abs(w) < 2));
    out.angle = { target, held, t90: firstAbove(tilt, 0.9 * target), overshootPct: Math.max(0, (peak - held) / target * 100),
      levelMs: level ? level[0] - 1000 : null, undershootDeg: Math.max(0, -Math.min(...lev.map(([, v]) => v))) };
    out.traces['angle-roll-half-stick'] = { unit: 'deg', target, stepOff: 1000, data: [...tilt, ...lev] };
  }
  // Throttle punch from hover: vertical acceleration in g (0 = hover), and how fast the thrust arrives (motor lag).
  {
    const sim = settle('angle'), tr = [];
    let v0 = sim.state.vel[1];
    for (let i = 0; i < 400; i++) { simSteps(sim, st({ throttle: 1 }), 1); tr.push([i + 1, (sim.state.vel[1] - v0) * 1000 / 9.80665]); v0 = sim.state.vel[1]; }
    const peak = Math.max(...tr.slice(0, 250).map(([, v]) => v));
    out.punch = { peakG: peak, t63: firstAbove(tr, 0.632 * peak), t90: firstAbove(tr, 0.9 * peak), climbAfter1s: null };
    const s2 = settle('angle'); simSteps(s2, st({ throttle: 1 }), 1000); out.punch.climbAfter1s = s2.state.vel[1];
    out.traces['throttle-punch-from-hover'] = { unit: 'g (above hover)', target: peak, data: tr };
  }
  // Throttle chop from hover (armed, zero throttle = idle): how it falls.
  {
    const sim = settle('angle'), y0 = sim.state.pos[1], tr = [];
    run(sim, st({ throttle: 0 }), 1000, (s) => -s.state.vel[1], tr);
    out.chop = { sinkAfter1s: tr.at(-1)[1], dropAfter1s: y0 - sim.state.pos[1], freeFallDrop: 0.5 * 9.80665 };
    out.traces['throttle-chop-sink-rate'] = { unit: 'm/s down', target: 9.80665, data: tr };
  }
  // Momentum: cruise in angle mode, then centre the sticks (hover throttle). How far and how long does it coast?
  {
    const sim = air('angle');
    simSteps(sim, st({ throttle: hover * 1.08, pitch: 0.35 }), 4000);
    const v0 = Math.hypot(sim.state.vel[0], sim.state.vel[2]), p0 = [...sim.state.pos], tr = [];
    let tHalf = null, tSlow = null;
    for (let i = 0; i < 8000; i++) {
      simSteps(sim, st({ throttle: hover }), 1);
      const v = Math.hypot(sim.state.vel[0], sim.state.vel[2]);
      if (i % 10 === 0) tr.push([i + 1, v * 3.6]);
      if (tHalf === null && v < v0 / 2) tHalf = (i + 1) / 1000;
      if (tSlow === null && v < 1) { tSlow = (i + 1) / 1000; break; }
    }
    out.coast = { fromKmh: v0 * 3.6, halfSpeedAfterS: tHalf, below1msAfterS: tSlow, distanceM: Math.hypot(sim.state.pos[0] - p0[0], sim.state.pos[2] - p0[2]) };
    out.traces['coast-after-centring-sticks'] = { unit: 'km/h', target: 0, data: tr };
  }
  // Top speed: acro-free version, angle mode at its tilt limit, full throttle, level-ish; and falling with motors off.
  {
    const sim = air('angle', 3000);
    simSteps(sim, st({ throttle: 1, pitch: 1 }), 12000);
    out.topSpeedAngleKmh = Math.hypot(...sim.state.vel) * 3.6;
    const f = air('angle', 3000); f.armed = false; simSteps(f, st(), 15000);
    out.terminalFallKmh = -f.state.vel[1] * 3.6;
  }
  return out;
}

// A small SVG line chart of one trace (ms on x). Used for the proof images and docs.
export function traceSvg(name, tr, w = 560, h = 260) {
  const pad = { l: 56, r: 12, t: 30, b: 34 };
  const xs = tr.data.map((p) => p[0]), ys = tr.data.map((p) => p[1]);
  const x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(tr.target || 0, ...ys) * 1.08 || 1;
  const X = (x) => pad.l + (x / x1) * (w - pad.l - pad.r), Y = (y) => h - pad.b - ((y - y0) / (y1 - y0)) * (h - pad.t - pad.b);
  const path = tr.data.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => y0 + f * (y1 - y0));
  const xt = [0, 0.25, 0.5, 0.75, 1].map((f) => f * x1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui,sans-serif" font-size="11">
<rect width="${w}" height="${h}" fill="#fff"/>
<text x="${pad.l}" y="18" font-size="13" font-weight="600" fill="#111">${name.replace(/-/g, ' ')} (${tr.unit})</text>
${ticks.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e3e6ea"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end" fill="#444">${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)}</text>`).join('')}
${xt.map((v) => `<text x="${X(v)}" y="${h - pad.b + 16}" text-anchor="middle" fill="#444">${v.toFixed(0)} ms</text>`).join('')}
${tr.target ? `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(tr.target)}" y2="${Y(tr.target)}" stroke="#c2410c" stroke-dasharray="5 4"/><text x="${w - pad.r - 4}" y="${Y(tr.target) - 5}" text-anchor="end" fill="#c2410c">target ${tr.target.toFixed(tr.target >= 10 ? 0 : 2)}</text>` : ''}
${tr.stepOff ? `<line x1="${X(tr.stepOff)}" x2="${X(tr.stepOff)}" y1="${pad.t}" y2="${h - pad.b}" stroke="#6b7280" stroke-dasharray="2 3"/><text x="${X(tr.stepOff) + 4}" y="${pad.t + 10}" fill="#6b7280">stick released</text>` : ''}
<path d="${path}" fill="none" stroke="#1d4ed8" stroke-width="2"/>
</svg>`;
}

// The measurements as rows: [what, measured value text]. docs/feel.md pairs these with targets and sources.
export function feelRows(m) {
  const f = (v, d = 0) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(d));
  const rows = [['Hover throttle (stick)', `${f(m.hoverThrottle * 100, 1)} %`]];
  for (const a of ['roll', 'pitch', 'yaw']) {
    const r = m.acro[a];
    rows.push([`Acro ${a}, full stick: time to 50 % / 90 % of ${r.target} deg/s`, `${f(r.t50)} ms / ${f(r.t90)} ms`],
      [`Acro ${a}, full stick: overshoot, rate held`, `${f(r.overshootPct, 1)} %, ${f(r.heldRate)} deg/s`],
      [`Acro ${a}: time to stop after letting go (below 5 %)`, `${f(r.stopMs)} ms`]);
  }
  rows.push(['Acro roll, 30 % stick: rate held, time to 90 %, overshoot', `${f(m.acroSmall.heldRate)} deg/s, ${f(m.acroSmall.t90)} ms, ${f(m.acroSmall.overshootPct, 1)} %`],
    ['Angle mode, half roll stick: tilt held (target), time to 90 %', `${f(m.angle.held, 1)} deg (${f(m.angle.target)}), ${f(m.angle.t90)} ms`],
    ['Angle mode: overshoot going in, swing past level coming back', `${f(m.angle.overshootPct, 1)} %, ${f(m.angle.undershootDeg, 1)} deg`],
    ['Angle mode: time to level (within 2 deg) after letting go', `${f(m.angle.levelMs)} ms`],
    ['Throttle punch from hover: peak extra acceleration', `${f(m.punch.peakG, 1)} g`],
    ['Throttle punch: time to 63 % / 90 % of that (motor lag)', `${f(m.punch.t63)} ms / ${f(m.punch.t90)} ms`],
    ['Throttle punch: climb speed after 1 s', `${f(m.punch.climbAfter1s * 3.6)} km/h`],
    ['Throttle chop from hover: sink rate and drop after 1 s (free fall: 9.8 m/s, 4.9 m)', `${f(m.chop.sinkAfter1s, 1)} m/s, ${f(m.chop.dropAfter1s, 1)} m`],
    [`Coasting from ${f(m.coast.fromKmh)} km/h after centring the sticks (angle mode): half speed after, below 1 m/s after, distance`, `${f(m.coast.halfSpeedAfterS, 1)} s, ${f(m.coast.below1msAfterS, 1)} s, ${f(m.coast.distanceM)} m`],
    ['Top speed in angle mode (60 deg tilt limit, full throttle)', `${f(m.topSpeedAngleKmh)} km/h`],
    ['Falling with motors off: terminal speed', `${f(m.terminalFallKmh)} km/h`]);
  return rows;
}
