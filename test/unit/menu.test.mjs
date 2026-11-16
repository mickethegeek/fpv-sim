// Menu navigation with a controller: pure logic (src/menu.js navUpdate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { NAV_BUTTONS, createNav, navUpdate, navNames } from '../../src/menu.js';

const B = (...on) => Array.from({ length: 17 }, (_, i) => ({ pressed: on.includes(i), value: on.includes(i) ? 1 : 0 }));
const run = (nav, buttons, axes, seconds, dt = 0.016) => { const ev = []; for (let t = 0; t < seconds; t += dt) ev.push(...navUpdate(nav, buttons, axes, dt)); return ev; };

test('menu nav: D-pad moves once per press and repeats when held; cross and circle fire once', () => {
  const nav = createNav();
  assert.deepEqual(navUpdate(nav, B(), [0, 0], 0.016), []);
  assert.deepEqual(navUpdate(nav, B(NAV_BUTTONS.down), [0, 0], 0.016), ['down']);
  assert.deepEqual(run(nav, B(NAV_BUTTONS.down), [0, 0], 0.3), [], 'no repeat before 0.4 s');
  const held = run(nav, B(NAV_BUTTONS.down), [0, 0], 1.0);
  assert.ok(held.length >= 6 && held.length <= 9 && held.every((e) => e === 'down'), `repeats about 8 times a second (${held.length})`);
  navUpdate(nav, B(), [0, 0], 0.016);
  assert.deepEqual(navUpdate(nav, B(NAV_BUTTONS.select), [0, 0], 0.016), ['select']);
  assert.deepEqual(run(nav, B(NAV_BUTTONS.select), [0, 0], 2), [], 'holding cross does not select again');
  navUpdate(nav, B(), [0, 0], 0.016);
  assert.deepEqual(navUpdate(nav, B(NAV_BUTTONS.back), [0, 0], 0.016), ['back']);
  navUpdate(nav, B(), [0, 0], 0.016);
  assert.deepEqual(navUpdate(nav, B(NAV_BUTTONS.pause), [0, 0], 0.016), ['pause']);
});

test('menu nav: the left stick moves too; a button already held when the menu opens does nothing', () => {
  let nav = createNav();
  navUpdate(nav, B(), [0, 0], 0.016);
  assert.deepEqual(navUpdate(nav, B(), [0, -1], 0.016), ['up']);
  navUpdate(nav, B(), [0, 0], 0.016);
  assert.deepEqual(navUpdate(nav, B(), [0.9, 0], 0.016), ['right']);
  assert.deepEqual(navUpdate(nav, B(), [0.3, 0.3], 0.016), [], 'a resting or slightly off-centre stick does nothing');
  nav = createNav();
  assert.deepEqual(run(nav, B(NAV_BUTTONS.select, NAV_BUTTONS.down), [0, 1], 2), [], 'held from before: ignored until let go');
  navUpdate(nav, B(), [0, 0], 0.016);
  assert.deepEqual(navUpdate(nav, B(NAV_BUTTONS.select), [0, 0], 0.016), ['select']);
});

test('menu nav: button names follow the controller', () => {
  assert.deepEqual(navNames('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), { select: '✕', back: '◯', pause: 'Options' });
  assert.deepEqual(navNames('Xbox 360 Controller'), { select: 'A', back: 'B', pause: 'Menu' });
});
