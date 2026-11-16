// M2 unit tests: mapping, deadzone, setup wizard, keyboard, arming rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeadzone, readSticks, defaultMapping, createWizard, wizardUpdate, wizardSkip, WIZARD_STEPS,
  mappingValid, keyboardSticks, InputManager, STORAGE_KEY, ARM_HINT } from '../../src/input.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('deadzone: zero inside, no jump at the edge, full at the end', () => {
  assert.equal(applyDeadzone(0.04, 0.05), 0);
  assert.equal(applyDeadzone(-0.05, 0.05), 0);
  near(applyDeadzone(0.06, 0.05), 0.01 / 0.95);
  near(applyDeadzone(-1, 0.05), -1);
  near(applyDeadzone(1, 0.05), 1);
});

test('default mapping is Mode 2: left stick throttle/yaw, right stick pitch/roll, up = more', () => {
  const m = defaultMapping('pad');
  //            LX    LY   RX   RY      (gamepad: up is -1)
  let s = readSticks([0.5, -1, 0, 0], m);
  near(s.throttle, 1); near(s.yaw, (0.5 - 0.05) / 0.95); assert.equal(s.roll, 0); assert.equal(s.pitch, 0);
  s = readSticks([0, 1, 1, -1], m);
  near(s.throttle, 0); near(s.roll, 1); near(s.pitch, 1);
  s = readSticks([0, 0, 0, 0], m);
  near(s.throttle, 0.5); // sprung gamepad stick rests at half throttle
});

// Feed the wizard a constant reading for some seconds.
function feed(w, axes, buttons, seconds) {
  for (let t = 0; t < seconds; t += 1 / 60) wizardUpdate(w, axes, buttons, 1 / 60);
}

test('setup wizard maps a radio with unusual axis order and inverted axes', () => {
  // Radio: axis0 roll, axis1 pitch (forward = +1), axis2 throttle (up = -1, rests low at +1), axis3 yaw (right = -1), axis4 arm switch.
  const rest = [0, 0, 1, 0, -1], none = [false, false];
  const w = createWizard('radio');
  feed(w, rest, none, 1);
  assert.equal(w.step, 0, 'advanced without input');
  const up = [0, 0, -1, 0, -1];
  feed(w, up, none, 1);                       // throttle up (stays up, like a real radio)
  assert.equal(w.step, 1);
  feed(w, [0, 0, -1, -1, -1], none, 1.2);     // yaw right
  feed(w, up, none, 0.3);
  feed(w, [0, 1, -1, 0, -1], none, 1.2);      // pitch forward
  feed(w, up, none, 0.3);
  feed(w, [1, 0, -1, 0, -1], none, 1.2);      // roll right
  feed(w, up, none, 0.3);
  assert.equal(WIZARD_STEPS[w.step].key, 'arm');
  feed(w, [0, 0, -1, 0, 1], none, 1.2);       // arm switch is an axis
  assert.equal(WIZARD_STEPS[w.step].key, 'mode');
  wizardSkip(w);
  assert.ok(w.done);
  assert.deepEqual(w.mapping.axes, {
    throttle: { index: 2, sign: -1 }, yaw: { index: 3, sign: -1 }, pitch: { index: 1, sign: 1 }, roll: { index: 0, sign: 1 } });
  assert.deepEqual(w.mapping.arm, { type: 'axis', index: 4, sign: 1 });
  assert.equal(w.mapping.mode, null);
  assert.ok(mappingValid(w.mapping));
  const s = readSticks([1, 1, -1, -1, 1], w.mapping);
  near(s.roll, 1); near(s.pitch, 1); near(s.throttle, 1); near(s.yaw, 1);
});

test('setup wizard: ignores small wiggles and already-assigned axes; tells push buttons from switches', () => {
  const w = createWizard('pad');
  feed(w, [0, 0, 0, 0], [false, false, false], 0.8);
  feed(w, [0.3, 0.2, 0, 0], [false, false, false], 1);  // wiggle: nothing
  assert.equal(w.step, 0);
  feed(w, [0, -1, 0, 0], [false, false, false], 1);     // throttle = axis 1
  feed(w, [0, 0, 0, 0], [false, false, false], 0.7);
  feed(w, [0, -1, 0, 0], [false, false, false], 1);     // same axis again must not become yaw
  assert.equal(w.step, 1);
  feed(w, [1, 0, 0, 0], [false, false, false], 1);
  feed(w, [0, 0, 0, 0], [false, false, false], 0.7);
  feed(w, [0, 0, 0, -1], [false, false, false], 1);
  feed(w, [0, 0, 0, 0], [false, false, false], 0.7);
  feed(w, [0, 0, 1, 0], [false, false, false], 1);
  feed(w, [0, 0, 0, 0], [false, false, false], 0.7);
  assert.equal(WIZARD_STEPS[w.step].key, 'arm');
  feed(w, [0, 0, 0, 0], [true, false, false], 0.2);     // quick press = push button
  feed(w, [0, 0, 0, 0], [false, false, false], 0.8);
  assert.deepEqual(w.mapping.arm, { type: 'button', index: 0, kind: 'toggle' });
  feed(w, [0, 0, 0, 0], [false, false, true], 1.5);     // stays on = switch
  assert.ok(w.done);
  assert.deepEqual(w.mapping.mode, { type: 'button', index: 2, kind: 'switch' });
});

test('keyboard: keys ramp the virtual sticks, throttle stays where you leave it', () => {
  const s = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
  for (let i = 0; i < 60; i++) keyboardSticks(s, new Set(['KeyW', 'ArrowUp', 'KeyA']), 1 / 60);
  near(s.throttle, 0.7, 1e-6); near(s.pitch, 1); near(s.yaw, -1);
  for (let i = 0; i < 60; i++) keyboardSticks(s, new Set(), 1 / 60);
  near(s.throttle, 0.7, 1e-6); near(s.pitch, 0); near(s.yaw, 0);
});

// Minimal fake window for InputManager.
function fakeWindow({ storageThrows = false } = {}) {
  const store = new Map(), handlers = {};
  const win = {
    pads: [],
    navigator: { getGamepads: () => win.pads },
    localStorage: {
      getItem: (k) => { if (storageThrows) throw new Error('denied'); return store.has(k) ? store.get(k) : null; },
      setItem: (k, v) => { if (storageThrows) throw new Error('denied'); store.set(k, v); },
      removeItem: (k) => { if (storageThrows) throw new Error('denied'); store.delete(k); },
    },
    addEventListener: (t, f) => { handlers[t] = f; },
    key: (code, down = true) => handlers[down ? 'keydown' : 'keyup']({ code, preventDefault() {}, repeat: false }),
    store,
  };
  return win;
}
const pad = (axes, buttons = [], mapping = 'standard') => ({ id: 'Fake Pad', connected: true, mapping, axes, buttons: buttons.map((p) => ({ pressed: p, value: p ? 1 : 0 })) });

test('keyboard arming: Space toggles; refused while throttle is up', () => {
  const win = fakeWindow();
  const inp = new InputManager(win);
  win.key('Space');
  assert.equal(inp.update(0.016).armed, true);
  win.key('Space', false); win.key('Space');
  assert.equal(inp.update(0.016).armed, false);
  win.key('Space', false);
  win.key('KeyW');
  for (let i = 0; i < 30; i++) inp.update(0.016);
  win.key('KeyW', false);
  win.key('Space');
  const r = inp.update(0.016);
  assert.equal(r.armed, false);
  assert.equal(r.hint, ARM_HINT);
});

test('gamepad: standard pad works without setup; A arms only with throttle low; Y toggles mode; B resets', () => {
  const win = fakeWindow();
  const inp = new InputManager(win);
  win.pads = [pad([0, 0, 0, 0], [false, false, false, false])];
  inp.update(0.016);
  assert.equal(inp.source, 'gamepad');
  win.pads = [pad([0, 0, 0, 0], [true, false, false, false])];   // throttle at 50 %: refuse
  let r = inp.update(0.016);
  assert.equal(r.armed, false); assert.equal(r.hint, ARM_HINT);
  win.pads = [pad([0, 1, 0, 0], [false, false, false, false])];
  inp.update(0.016);
  win.pads = [pad([0, 1, 0, 0], [true, false, false, true])];    // throttle low: arm; Y: mode
  r = inp.update(0.016);
  assert.equal(r.armed, true);
  assert.deepEqual(r.events, ['mode']);
  r = inp.update(0.016);                                         // held: no repeat
  assert.equal(r.armed, true); assert.deepEqual(r.events, []);
  win.pads = [pad([0, -1, 0, 0], [false, true, false, false])];  // B: reset; throttle up while armed is fine
  r = inp.update(0.016);
  assert.equal(r.armed, true); assert.deepEqual(r.events, ['reset']); near(r.sticks.throttle, 1);
});

test('gamepad: non-standard pad needs setup, falls back to keyboard until mapped; mapping is saved and reloaded', () => {
  const win = fakeWindow();
  let inp = new InputManager(win);
  win.pads = [pad([0, 0, 1, 0, -1], [], '')];
  inp.update(0.016);
  assert.equal(inp.needsSetup, true); assert.equal(inp.source, 'keyboard');
  const mapping = { version: 1, id: 'Fake Pad', deadzone: 0.05,
    axes: { throttle: { index: 2, sign: -1 }, yaw: { index: 3, sign: -1 }, pitch: { index: 1, sign: 1 }, roll: { index: 0, sign: 1 } },
    arm: { type: 'axis', index: 4, sign: 1 }, mode: null, reset: null };
  assert.equal(inp.save(mapping), true);
  assert.ok(win.store.has(STORAGE_KEY));
  inp = new InputManager(win);                                   // "page reload"
  assert.deepEqual(inp.mapping, mapping);
  assert.equal(inp.update(0.016).armed, false);                  // switch off seen: now allowed to arm
  win.pads = [pad([0, 0, -1, 0, 1], [], '')];                    // arm switch on, throttle up: refused
  assert.equal(inp.update(0.016).armed, false);
  win.pads = [pad([0, 0, 1, 0, 1], [], '')];                     // arm switch on, throttle low
  assert.equal(inp.update(0.016).armed, true);
  inp.disarm();                                                  // crash: switch must be cycled
  let r = inp.update(0.016);
  assert.equal(r.armed, false); assert.match(r.hint, /switch/);
  win.pads = [pad([0, 0, 1, 0, -1], [], '')];
  inp.update(0.016);
  win.pads = [pad([0, 0, 1, 0, 1], [], '')];
  assert.equal(inp.update(0.016).armed, true);
});

test('localStorage that throws does not break input', () => {
  const win = fakeWindow({ storageThrows: true });
  const inp = new InputManager(win);
  assert.equal(inp.mapping, null);
  assert.equal(inp.save(defaultMapping('x')), false);
  assert.ok(inp.mapping);
  inp.clear();
  assert.equal(inp.update(0.016).armed, false);
});
