// Browser flight script: node test/flight.mjs <Mx>
// Opens the sim in real Chrome (software GL), checks it runs, saves screenshots to proof/<Mx>/.
// Later milestones add steps to STEPS below (drive the sim through window.__sim).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { serve } from '../tools/serve.mjs';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const milestone = process.argv[2] || 'M0';
const outDir = new URL(`../proof/${milestone}/`, import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });

const { server, url } = await serve(0);
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--disable-background-networking', '--disable-component-update', '--no-first-run'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('requestfailed', (r) => problems.push('requestfailed: ' + r.url()));
page.on('request', (r) => { if (!r.url().startsWith(url)) problems.push('external request (no CDNs allowed): ' + r.url()); });

let failed = false;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`); if (!ok) failed = true; };
const shot = (name) => page.screenshot({ path: `${outDir}${name}.png` });

await page.goto(url);
await page.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 20000 });
const f0 = await page.evaluate(() => window.__sim.frames);
await page.waitForTimeout(1000);
const f1 = await page.evaluate(() => window.__sim.frames);
check('page ready', true);
check('render loop advancing', f1 > f0, `(${f1 - f0} frames in 1 s, software GL)`);
await shot('01-loaded');

// Helpers to fly the sim from the script.
const snap = () => page.evaluate(() => window.__sim.snapshot());
const fly = async (sticks, ms) => { await page.evaluate((s) => window.__sim.setSticks(s), sticks); await page.waitForTimeout(ms); return snap(); };
const neutral = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };

// --- M1: the physics core runs in the browser (same modules as the unit tests) ---
{
  await page.evaluate(() => { window.__sim.reset(); window.__sim.setMode('angle'); });
  let s = await fly(neutral, 300);
  check('M1 sits on the ground disarmed', s.onGround && !s.armed && Math.abs(s.pos[1] - 0.05) < 1e-6, `(alt ${s.pos[1].toFixed(3)} m)`);
  await page.evaluate(() => window.__sim.arm(true));
  s = await fly({ ...neutral, throttle: 0.5 }, 1200);
  check('M1 takes off at 50 % throttle', s.pos[1] > 1 && !s.crashed, `(alt ${s.pos[1].toFixed(2)} m, climb ${s.vel[1].toFixed(2)} m/s)`);
  await shot('02-m1-takeoff');
  s = await fly({ ...neutral, throttle: 0.3 }, 1500);
  check('M1 near hover at 30 % throttle', Math.abs(s.vel[1]) < 3 && Math.abs(s.rollDeg) < 3 && Math.abs(s.pitchDeg) < 3, `(vertical ${s.vel[1].toFixed(2)} m/s, roll ${s.rollDeg.toFixed(1)}, pitch ${s.pitchDeg.toFixed(1)})`);
  const z0 = s.pos[2];
  s = await fly({ ...neutral, throttle: 0.4, pitch: 0.4 }, 1500);
  check('M1 angle mode: stick forward tilts nose down and flies forward', s.pitchDeg < -15 && s.pitchDeg > -30 && s.pos[2] < z0 - 2, `(pitch ${s.pitchDeg.toFixed(1)} deg, moved ${(z0 - s.pos[2]).toFixed(1)} m, ${(Math.hypot(...s.vel) * 3.6).toFixed(0)} km/h)`);
  await shot('03-m1-forward-angle');
  s = await fly({ ...neutral, throttle: 0.6 }, 1500);
  check('M1 angle mode: self-levels on release', Math.abs(s.pitchDeg) < 3 && Math.abs(s.rollDeg) < 3, `(pitch ${s.pitchDeg.toFixed(1)}, roll ${s.rollDeg.toFixed(1)})`);
  await page.evaluate(() => window.__sim.setMode('acro'));
  const r0 = await snap();
  s = await fly({ ...neutral, throttle: 0.6, roll: 1 }, 400);
  const rollRate = -s.omega[2] * 180 / Math.PI;
  check('M1 acro: full roll stick spins at about 670 deg/s', Math.abs(rollRate - 670) < 40, `(${rollRate.toFixed(0)} deg/s)`);
  await shot('04-m1-acro-roll');
  s = await fly({ ...neutral, throttle: 0.6 }, 600);
  check('M1 acro: holds attitude with sticks centred (no self-level)', Math.abs(s.omega[2]) < 0.2, `(roll ${s.rollDeg.toFixed(0)} deg, rate ${(s.omega[2] * 57.3).toFixed(1)} deg/s)`);
  await shot('05-m1-acro-hold');
  await page.evaluate(() => window.__sim.arm(false));
  await page.waitForFunction(() => { const x = window.__sim.snapshot(); return x.crashed || x.onGround; }, null, { timeout: 30000 });
  s = await snap();
  check('M1 disarmed in the air: falls and crashes', s.crashed, `(crashed ${s.crashed})`);
  await shot('06-m1-crashed');
  const steps = await page.evaluate(() => [window.__sim.physicsSteps, window.__sim.sim.state.time]);
  check('M1 state finite', [...s.pos, ...s.vel, ...s.quat].every(Number.isFinite));
  console.log(`     physics steps run in browser: ${steps[0]}`);
}

// --- M2: controller input (keyboard, then a simulated USB radio through the real Gamepad API path) ---
{
  const hold = async (code, ms) => { await page.keyboard.down(code); await page.waitForTimeout(ms); await page.keyboard.up(code); };
  await page.evaluate(() => { try { localStorage.clear(); } catch {} window.__sim.input.clear(); window.__sim.setMode('angle'); window.__sim.useInput(); });
  let s = await snap();
  check('M2 keyboard is the fallback and its keys are shown', s.source === 'keyboard' && await page.isVisible('#keys') && (await page.textContent('#keys')).includes('Space'));
  await shot('07-m2-keyboard-help');
  await hold('KeyW', 500);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  s = await snap();
  check('M2 arming refused while throttle is up, with a hint', !s.armed && /throttle/i.test(s.hint) && await page.isVisible('#hint'), `(throttle ${(s.sticks.throttle * 100).toFixed(0)} %, hint "${s.hint}")`);
  await shot('08-m2-arm-refused');
  await hold('KeyS', 900);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  s = await snap();
  check('M2 Space arms with throttle low', s.armed && s.sticks.throttle === 0);
  await hold('KeyW', 800);
  await page.waitForTimeout(800);
  s = await snap();
  check('M2 W raises throttle and the quad takes off', s.sticks.throttle > 0.4 && s.pos[1] > 0.5, `(throttle ${(s.sticks.throttle * 100).toFixed(0)} %, alt ${s.pos[1].toFixed(1)} m)`);
  const z0 = s.pos[2];
  await hold('ArrowUp', 1200);
  s = await snap();
  check('M2 arrow up flies forward', s.pos[2] < z0 - 0.5, `(moved ${(z0 - s.pos[2]).toFixed(1)} m)`);
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(100);
  check('M2 M switches to acro', (await snap()).mode === 'acro');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(200);
  s = await snap();
  check('M2 R resets to the start, disarmed', !s.armed && s.onGround && Math.hypot(s.pos[0], s.pos[2]) < 0.01);

  // A fake USB radio: 6 axes in an unusual order, no "standard" layout, so it must go through the setup screen.
  // Axes: 0 roll, 1 pitch (forward +1), 2 throttle (up = -1), 3 yaw (right = -1), 4 arm switch, 5 unused. Button 0 = mode.
  await page.evaluate(() => {
    const pad = { id: 'Test Radio (USB Joystick)', index: 0, connected: true, mapping: '', timestamp: 0,
      axes: [0, 0, 1, 0, -1, 0], buttons: [{ pressed: false, value: 0 }, { pressed: false, value: 0 }] };
    window.__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  });
  const axes = (a) => page.evaluate((v) => { window.__pad.axes = v; }, a);
  const button = (i, on) => page.evaluate(([j, v]) => { window.__pad.buttons[j] = { pressed: v, value: v ? 1 : 0 }; }, [i, on]);
  await page.waitForTimeout(200);
  check('M2 unknown controller is detected and asks for setup', (await page.textContent('#controller')).includes('needs setup'), `("${await page.textContent('#controller')}")`);
  await page.click('#btn-setup');
  await page.waitForTimeout(900);
  check('M2 setup screen asks for throttle first', (await page.textContent('#setup .prompt')).includes('THROTTLE'));
  await shot('09-m2-setup-throttle');
  const wizardStep = () => page.evaluate(() => (window.__sim.setup.wizard ? window.__sim.setup.wizard.step : -1));
  const waitStep = (n) => page.waitForFunction((k) => { const w = window.__sim.setup.wizard; return !w || w.step >= k; }, n, { timeout: 15000 });
  await axes([0, 0, -1, 0, -1, 0]); await waitStep(1);                         // throttle up, left up like a radio
  await page.waitForTimeout(800);
  await axes([0, 0, -1, -1, -1, 0]); await waitStep(2); await axes([0, 0, -1, 0, -1, 0]);   // yaw right
  await page.waitForTimeout(800);
  await shot('10-m2-setup-pitch');
  check('M2 setup screen reaches the pitch step', (await page.textContent('#setup .prompt')).includes('PITCH'));
  await axes([0, 1, -1, 0, -1, 0]); await waitStep(3); await axes([0, 0, -1, 0, -1, 0]);    // pitch forward
  await page.waitForTimeout(800);
  await axes([1, 0, -1, 0, -1, 0]); await waitStep(4); await axes([0, 0, -1, 0, -1, 0]);    // roll right
  await page.waitForTimeout(800);
  await axes([0, 0, -1, 0, 1, 0]); await waitStep(5);                          // arm switch (an axis)
  await page.waitForTimeout(800);
  await shot('11-m2-setup-mode');
  await button(0, true); await page.waitForTimeout(150); await button(0, false);          // mode = push button
  await page.waitForFunction(() => !window.__sim.setup.open, null, { timeout: 15000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fpvsim.controller.v1')));
  const want = { throttle: { index: 2, sign: -1 }, yaw: { index: 3, sign: -1 }, pitch: { index: 1, sign: 1 }, roll: { index: 0, sign: 1 } };
  check('M2 setup saved the right axes and inversions', JSON.stringify(saved && saved.axes) === JSON.stringify(want), JSON.stringify(saved && saved.axes));
  check('M2 setup saved arm switch and mode button', saved && saved.arm.type === 'axis' && saved.arm.index === 4 && saved.mode.type === 'button' && saved.mode.kind === 'toggle', JSON.stringify(saved && [saved.arm, saved.mode]));

  // Fly with the mapped radio. The arm switch is still on with throttle up: must not arm until both are safe.
  await page.waitForTimeout(300);
  s = await snap();
  check('M2 radio: no arming with throttle up', !s.armed && s.source === 'gamepad' && s.sticks.throttle > 0.9, `(hint "${s.hint}")`);
  await axes([0, 0, 1, 0, -1, 0]); await page.waitForTimeout(200);            // throttle down, switch off
  await axes([0, 0, 1, 0, 1, 0]); await page.waitForTimeout(200);             // switch on
  s = await snap();
  check('M2 radio: arm switch arms with throttle low', s.armed);
  await axes([0, 0, -0.1, 0, 1, 0]); await page.waitForTimeout(1200);         // 55 % throttle
  s = await snap();
  check('M2 radio: throttle stick lifts the quad', s.pos[1] > 1 && Math.abs(s.sticks.throttle - 0.55) < 0.01, `(alt ${s.pos[1].toFixed(1)} m)`);
  await axes([0.5, 0, -0.1, 0, 1, 0]); await page.waitForTimeout(700);
  s = await snap();
  check('M2 radio: roll stick right rolls right (angle mode)', s.rollDeg > 15 && s.rollDeg < 35, `(roll ${s.rollDeg.toFixed(0)} deg)`);
  await axes([0.03, -0.03, -0.1, 0.03, 1, 0]); await page.waitForTimeout(100);
  s = await snap();
  check('M2 radio: deadzone swallows stick noise', s.sticks.roll === 0 && s.sticks.pitch === 0 && s.sticks.yaw === 0);
  await button(0, true); await page.waitForTimeout(120); await button(0, false); await page.waitForTimeout(100);
  check('M2 radio: mode button switches to acro', (await snap()).mode === 'acro');
  await shot('12-m2-flying-with-radio');
  await axes([0, 0, 1, 0, -1, 0]); await page.waitForTimeout(150);
  check('M2 radio: arm switch off disarms', !(await snap()).armed);

  // The mapping survives a reload.
  await page.reload();
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  await page.evaluate(() => {
    const pad = { id: 'Test Radio (USB Joystick)', index: 0, connected: true, mapping: '', timestamp: 0, axes: [0, 1, -1, 0, -1, 0], buttons: [{ pressed: false, value: 0 }] };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  await page.waitForTimeout(300);
  s = await snap();
  const label = await page.textContent('#controller');
  check('M2 mapping survives a page reload', s.source === 'gamepad' && s.sticks.throttle === 1 && s.sticks.pitch === 1 && !label.includes('needs setup'), `("${label}")`);
  await shot('13-m2-after-reload');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

const simErrors = await page.evaluate(() => window.__sim.errors);
check('no page errors', problems.length === 0 && simErrors.length === 0, JSON.stringify([...problems, ...simErrors]));

await browser.close();
server.close();
console.log(failed ? 'FLIGHT SCRIPT FAILED' : `flight script passed, screenshots in proof/${milestone}/`);
process.exit(failed ? 1 : 0);
