// Controller input: Gamepad API + keyboard fallback -> sticks and arm/mode/reset commands.
// The mapping logic and the setup wizard state machine are pure (unit-tested in node);
// only InputManager touches navigator/window/localStorage.
//
// Mapping format (saved in localStorage under STORAGE_KEY):
//   { version: 1, id: <gamepad id>, deadzone: 0.05,
//     axes: { throttle: {index, sign}, yaw: {...}, pitch: {...}, roll: {...} },   // sign: +1 or -1
//     arm:  null | {type:'button', index, kind:'toggle'|'switch'} | {type:'axis', index, sign},
//     mode: same shape as arm (on = acro), reset: same shape or null }
// Stick conventions out: see flightcontroller.js (pitch + = forward, throttle 0..1).

export const STORAGE_KEY = 'fpvsim.controller.v1';
export const DEFAULT_DEADZONE = 0.05;

// Mode 2 on a "standard" layout gamepad: left stick = throttle/yaw, right stick = pitch/roll.
// Stick up reads -1 on gamepads, hence the -1 signs. A = arm, Y = angle/acro, B = reset.
export function defaultMapping(id = '') {
  return {
    version: 1, id, deadzone: DEFAULT_DEADZONE,
    axes: {
      throttle: { index: 1, sign: -1 }, yaw: { index: 0, sign: 1 },
      pitch: { index: 3, sign: -1 }, roll: { index: 2, sign: 1 },
    },
    arm: { type: 'button', index: 0, kind: 'toggle' },
    mode: { type: 'button', index: 3, kind: 'toggle' },
    reset: { type: 'button', index: 1, kind: 'toggle' },
  };
}

export function applyDeadzone(v, dz) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz)); // rescaled so there is no jump at the edge
}

const axisVal = (axes, m) => (m && Number.isFinite(axes[m.index]) ? Math.max(-1, Math.min(1, axes[m.index] * m.sign)) : 0);
const pressed = (b) => !!b && (typeof b === 'object' ? b.pressed || b.value > 0.5 : b > 0.5);

// Is a switch/button source currently "on"?
export function sourceOn(src, axes, buttons) {
  if (!src) return false;
  if (src.type === 'axis') return (axes[src.index] || 0) * src.sign > 0.5;
  return pressed(buttons[src.index]);
}

// Raw gamepad readings -> sticks. Throttle maps the axis range -1..1 to 0..1 and has no deadzone.
export function readSticks(axes, mapping) {
  const dz = mapping.deadzone ?? DEFAULT_DEADZONE, a = mapping.axes;
  return {
    roll: applyDeadzone(axisVal(axes, a.roll), dz),
    pitch: applyDeadzone(axisVal(axes, a.pitch), dz),
    yaw: applyDeadzone(axisVal(axes, a.yaw), dz),
    throttle: a.throttle ? (axisVal(axes, a.throttle) + 1) / 2 : 0,
  };
}

// Like Betaflight, arming is refused while the throttle is up.
export const ARM_THROTTLE_MAX = 0.1;
export const ARM_HINT = 'Lower the throttle to arm';

// ---------- Setup wizard (pure state machine) ----------
export const WIZARD_STEPS = [
  { key: 'throttle', kind: 'axis', text: 'Move the THROTTLE stick all the way UP' },
  { key: 'yaw', kind: 'axis', text: 'Move the YAW stick all the way RIGHT' },
  { key: 'pitch', kind: 'axis', text: 'Move the PITCH stick all the way FORWARD (up)' },
  { key: 'roll', kind: 'axis', text: 'Move the ROLL stick all the way RIGHT' },
  { key: 'arm', kind: 'switch', text: 'Press the button or flip the switch you want for ARM', optional: true },
  { key: 'mode', kind: 'switch', text: 'Press the button or flip the switch for ANGLE / ACRO', optional: true },
];
const SETTLE = 0.6;   // s to let go of the previous control before the baseline is taken
const HOLD = 0.35;    // s a movement must be held to count
const AXIS_MOVE = 0.5;
const SWITCH_WATCH = 1.0; // s: a button still held this long after detection is a switch, not a push button

export function createWizard(id = '') {
  return { step: 0, t: 0, baseline: null, candidate: null, held: 0, pending: null, done: false,
    mapping: { version: 1, id, deadzone: DEFAULT_DEADZONE, axes: {}, arm: null, mode: null, reset: null } };
}

function usedAxes(m) {
  const used = new Set(Object.values(m.axes).map((a) => a.index));
  for (const s of [m.arm, m.mode]) if (s && s.type === 'axis') used.add(s.index);
  return used;
}
function usedButtons(m) {
  return new Set([m.arm, m.mode].filter((s) => s && s.type === 'button').map((s) => s.index));
}
function advance(w) {
  w.step++; w.t = 0; w.baseline = null; w.candidate = null; w.held = 0; w.pending = null;
  if (w.step >= WIZARD_STEPS.length) w.done = true;
}

export function wizardSkip(w) {
  if (!w.done && WIZARD_STEPS[w.step].optional) advance(w);
}

// Feed one reading. axes: number[], buttons: (bool | {pressed})[]. Returns w (mutated).
export function wizardUpdate(w, axes, buttons, dt) {
  if (w.done) return w;
  const step = WIZARD_STEPS[w.step];
  w.t += dt;
  if (w.pending) { // deciding push button vs switch
    w.pending.t += dt;
    const still = pressed(buttons[w.pending.index]);
    if (!still || w.pending.t >= SWITCH_WATCH) {
      w.mapping[step.key] = { type: 'button', index: w.pending.index, kind: still ? 'switch' : 'toggle' };
      advance(w);
    }
    return w;
  }
  if (w.t < SETTLE) return w;
  if (!w.baseline) { w.baseline = { axes: [...axes], buttons: [...buttons].map(pressed) }; return w; }

  let found = null;
  const skipAxes = usedAxes(w.mapping);
  let best = AXIS_MOVE;
  for (let i = 0; i < axes.length; i++) {
    if (skipAxes.has(i)) continue;
    const d = axes[i] - (w.baseline.axes[i] ?? 0);
    if (Math.abs(d) > best) { best = Math.abs(d); found = { type: 'axis', index: i, sign: Math.sign(d) }; }
  }
  if (step.kind === 'switch' && !found) {
    const skipB = usedButtons(w.mapping);
    for (let i = 0; i < buttons.length; i++) {
      if (!skipB.has(i) && pressed(buttons[i]) && !w.baseline.buttons[i]) { found = { type: 'button', index: i }; break; }
    }
  }
  const same = found && w.candidate && found.type === w.candidate.type && found.index === w.candidate.index
    && found.sign === w.candidate.sign;
  if (!found) { w.candidate = null; w.held = 0; return w; }
  if (!same) { w.candidate = found; w.held = 0; return w; }
  w.held += dt;
  if (found.type === 'button') { w.pending = { index: found.index, t: 0 }; return w; } // buttons need no hold
  if (w.held < HOLD) return w;
  if (step.kind === 'axis') w.mapping.axes[step.key] = { index: found.index, sign: found.sign };
  else w.mapping[step.key] = found;
  advance(w);
  return w;
}

export function mappingValid(m) {
  return !!m && m.version === 1 && !!m.axes
    && ['throttle', 'yaw', 'pitch', 'roll'].every((k) => m.axes[k] && Number.isInteger(m.axes[k].index) && Math.abs(m.axes[k].sign) === 1);
}

// ---------- Keyboard ----------
export const KEY_HELP = [
  ['W / S', 'throttle up / down'], ['A / D', 'yaw left / right'],
  ['↑ / ↓', 'pitch forward / back'], ['← / →', 'roll left / right'],
  ['Space', 'arm / disarm'], ['M', 'angle / acro'], ['R', 'reset'],
];
const KEY_RAMP = 5;       // 1/s: how fast a held key moves a virtual stick to full deflection
const KEY_THROTTLE = 0.7; // 1/s: throttle change while W or S is held

// keys: Set of KeyboardEvent.code currently down. Mutates and returns sticks.
export function keyboardSticks(sticks, keys, dt) {
  const toward = (v, target) => v + Math.max(-KEY_RAMP * dt, Math.min(KEY_RAMP * dt, target - v));
  const pair = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  sticks.roll = toward(sticks.roll, pair('ArrowLeft', 'ArrowRight'));
  sticks.pitch = toward(sticks.pitch, pair('ArrowDown', 'ArrowUp'));
  sticks.yaw = toward(sticks.yaw, pair('KeyA', 'KeyD'));
  sticks.throttle = Math.max(0, Math.min(1, sticks.throttle + pair('KeyS', 'KeyW') * KEY_THROTTLE * dt));
  return sticks;
}

// ---------- Browser glue ----------
export class InputManager {
  constructor(win = window) {
    this.win = win;
    this.keys = new Set();
    this.sticks = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
    this.mapping = this.load();
    this.source = 'keyboard';     // 'keyboard' | 'gamepad'
    this.gamepadId = '';
    this.armed = false;
    this.toggleArm = false;
    this.switchBlocked = true;    // an arm switch found already on (page load, after a crash) must be cycled first
    this.hint = '';
    this.prev = { arm: false, mode: false, reset: false };
    this.events = [];             // 'mode', 'reset' (consumed by main each frame)
    this.acroSwitch = null;       // true/false when the mode source is a switch
    this.paused = false;          // true while the setup wizard owns the controller
    win.addEventListener('keydown', (e) => this.onKey(e, true));
    win.addEventListener('keyup', (e) => this.onKey(e, false));
    win.addEventListener('blur', () => this.keys.clear());
  }

  load() {
    try {
      const m = JSON.parse(this.win.localStorage.getItem(STORAGE_KEY));
      return mappingValid(m) ? m : null;
    } catch { return null; }
  }
  save(mapping) {
    this.mapping = mapping;
    try { this.win.localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping)); return true; } catch { return false; }
  }
  clear() {
    this.mapping = null;
    try { this.win.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  }

  onKey(e, down) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || '')) return;
    const codes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyM', 'KeyR'];
    if (!codes.includes(e.code)) return;
    e.preventDefault();
    if (down && !e.repeat && !this.paused) {
      if (e.code === 'Space') this.toggleArm = true;
      if (e.code === 'KeyM') this.events.push('mode');
      if (e.code === 'KeyR') this.events.push('reset');
    }
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
  }

  // First connected gamepad, or null.
  gamepad() {
    let pads = [];
    try { pads = this.win.navigator.getGamepads ? [...this.win.navigator.getGamepads()] : []; } catch { /* blocked */ }
    return pads.find((p) => p && p.connected !== false && p.axes && p.axes.length >= 2) || null;
  }

  // Mapping in use for this pad: saved one, else the Mode 2 default for standard-layout pads.
  mappingFor(pad) {
    if (this.mapping) return this.mapping;
    if (pad.mapping === 'standard' && pad.axes.length >= 4) return defaultMapping(pad.id);
    return null;
  }

  // Call once per frame. Returns { sticks, armed, hint, events, acroSwitch }.
  update(dt) {
    const pad = this.gamepad();
    const map = pad && this.mappingFor(pad);
    this.gamepadId = pad ? pad.id : '';
    this.needsSetup = !!pad && !map;
    const events = this.events; this.events = [];
    if (this.paused) {
      this.armed = false; this.toggleArm = false; this.switchBlocked = true;
      return { sticks: this.sticks, armed: false, hint: '', events: [], acroSwitch: null };
    }
    let armLevel = null; // true/false when arm is a switch that is on/off
    if (map) {
      if (this.source !== 'gamepad') this.prev = { arm: true, mode: true, reset: true }; // no phantom edges on connect
      this.source = 'gamepad';
      Object.assign(this.sticks, readSticks(pad.axes, map));
      for (const key of ['arm', 'mode', 'reset']) {
        const src = map[key];
        const on = sourceOn(src, pad.axes, pad.buttons);
        const level = !!src && (src.type === 'axis' || src.kind === 'switch');
        const edge = on && !this.prev[key];
        this.prev[key] = on;
        if (key === 'arm') { if (level) armLevel = on; else if (edge) this.toggleArm = true; }
        else if (key === 'mode') { this.acroSwitch = level ? on : null; if (!level && edge) events.push('mode'); }
        else if (edge) events.push('reset');
      }
    } else {
      if (this.source !== 'keyboard') this.sticks.throttle = 0;
      this.source = 'keyboard';
      this.acroSwitch = null;
      keyboardSticks(this.sticks, this.keys, dt);
    }
    // Arming. Push button / Space toggles; a switch arms while on. Refused while throttle is up.
    const low = this.sticks.throttle <= ARM_THROTTLE_MAX;
    this.hintTime = Math.max(0, (this.hintTime || 0) - dt);
    if (this.toggleArm) {
      this.toggleArm = false;
      if (this.armed) this.armed = false;
      else if (low) this.armed = true;
      else this.hintTime = 2.5;
    }
    if (armLevel === false) { this.armed = false; this.switchBlocked = false; }
    if (armLevel === true && !this.armed) {
      if (this.switchBlocked) { /* hint below */ } else if (low) this.armed = true; else this.hintTime = 0.2;
    }
    const blocked = armLevel === true && !this.armed && this.switchBlocked;
    this.hint = blocked ? 'Flip the arm switch off, then on again' : this.hintTime > 0 ? ARM_HINT : '';
    return { sticks: this.sticks, armed: this.armed, hint: this.hint, events, acroSwitch: this.acroSwitch };
  }

  // The sim disarmed us (crash or reset). A physical arm switch must be cycled before it arms again.
  disarm() {
    this.armed = false;
    this.switchBlocked = true;
    if (this.source === 'keyboard') this.sticks.throttle = 0;
  }
}
