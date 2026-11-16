// Browser flight script: node test/flight.mjs <Mx> [only]   (only = M1..M5 runs just that block, for quick reruns)
// Opens the sim in real Chrome (software GL), checks it runs, saves screenshots to proof/<Mx>/.
// Later milestones add steps to STEPS below (drive the sim through window.__sim).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { serve } from '../tools/serve.mjs';
import { stickForThrust } from '../src/params.js';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }

const milestone = process.argv[2] || 'M0';
const only = process.argv[3] || '';
const runs = (m) => !only || only === m;
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

await page.goto(url + '?fast&free&preset=freestyle'); // ?fast: no antialiasing or anisotropic filtering, 3x quicker in software GL; same sim and UI
await page.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 20000 });
const f0 = await page.evaluate(() => window.__sim.frames);
await page.waitForTimeout(1000);
const f1 = await page.evaluate(() => window.__sim.frames);
check('page ready', true);
check('render loop advancing', f1 > f0, `(${f1 - f0} frames in 1 s, software GL)`);
await shot('01-loaded');

// Helpers to fly the sim from the script.
const snap = () => page.evaluate(() => window.__sim.snapshot());
// Wait in SIM time, not wall-clock: software GL in the sandbox renders slowly and the sim then runs slower than real time.
const simWait = async (ms) => {
  const target = (await page.evaluate(() => window.__sim.physicsSteps)) + ms;
  await page.waitForFunction((t) => window.__sim.physicsSteps >= t, target, { timeout: 120000, polling: 20 });
};
const fly = async (sticks, ms) => { await page.evaluate((s) => window.__sim.setSticks(s), sticks); await simWait(ms); return snap(); };
const neutral = { roll: 0, pitch: 0, yaw: 0, throttle: 0 };
// The open-loop throttles below were written when thrust went with command squared (hover at 30 % stick).
// thr(old) gives the stick with the same thrust on today's curve, so the flights stay the same.
const thr = (old) => stickForThrust(9 * (0.05 + 0.95 * old) ** 2);

// --- M1: the physics core runs in the browser (same modules as the unit tests) ---
if (runs('M1')) {
  await page.evaluate(() => { window.__sim.reset(); window.__sim.setMode('angle'); });
  let s = await fly(neutral, 300);
  check('M1 sits on the ground disarmed', s.onGround && !s.armed && Math.abs(s.pos[1] - 0.05) < 1e-6, `(alt ${s.pos[1].toFixed(3)} m)`);
  await page.evaluate(() => window.__sim.arm(true));
  s = await fly({ ...neutral, throttle: thr(0.5) }, 1200);
  check('M1 takes off at 50 % throttle', s.pos[1] > 1 && !s.crashed, `(alt ${s.pos[1].toFixed(2)} m, climb ${s.vel[1].toFixed(2)} m/s)`);
  await shot('02-m1-takeoff');
  s = await fly({ ...neutral, throttle: thr(0.3) }, 1500);
  check('M1 near hover at hover throttle', Math.abs(s.vel[1]) < 3 && Math.abs(s.rollDeg) < 3 && Math.abs(s.pitchDeg) < 3, `(vertical ${s.vel[1].toFixed(2)} m/s, roll ${s.rollDeg.toFixed(1)}, pitch ${s.pitchDeg.toFixed(1)})`);
  const z0 = s.pos[2];
  s = await fly({ ...neutral, throttle: thr(0.4), pitch: 0.4 }, 1500);
  check('M1 angle mode: stick forward tilts nose down and flies forward', s.pitchDeg < -15 && s.pitchDeg > -30 && s.pos[2] < z0 - 2, `(pitch ${s.pitchDeg.toFixed(1)} deg, moved ${(z0 - s.pos[2]).toFixed(1)} m, ${(Math.hypot(...s.vel) * 3.6).toFixed(0)} km/h)`);
  await shot('03-m1-forward-angle');
  s = await fly({ ...neutral, throttle: thr(0.6) }, 1500);
  check('M1 angle mode: self-levels on release', Math.abs(s.pitchDeg) < 3 && Math.abs(s.rollDeg) < 3, `(pitch ${s.pitchDeg.toFixed(1)}, roll ${s.rollDeg.toFixed(1)})`);
  await page.evaluate(() => window.__sim.setMode('acro'));
  const r0 = await snap();
  s = await fly({ ...neutral, throttle: thr(0.6), roll: 1 }, 400);
  const rollRate = -s.omega[2] * 180 / Math.PI;
  check('M1 acro: full roll stick spins at about 670 deg/s', Math.abs(rollRate - 670) < 40, `(${rollRate.toFixed(0)} deg/s)`);
  await shot('04-m1-acro-roll');
  s = await fly({ ...neutral, throttle: thr(0.6) }, 600);
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
if (runs('M2')) {
  const hold = async (code, ms) => { await page.keyboard.down(code); await simWait(ms); await page.keyboard.up(code); };
  await page.evaluate(() => { try { localStorage.clear(); } catch {} window.__sim.input.clear(); window.__sim.setMode('angle'); window.__sim.useInput(); });
  let s = await snap();
  check('M2 keyboard is the fallback and its keys are shown', s.source === 'keyboard' && await page.isVisible('#keys') && (await page.textContent('#keys')).includes('Space'));
  await shot('07-m2-keyboard-help');
  await hold('KeyW', 500);
  await page.keyboard.press('Space');
  await simWait(150);
  s = await snap();
  check('M2 arming refused while throttle is up, with a hint', !s.armed && /throttle/i.test(s.hint) && await page.isVisible('#hint'), `(throttle ${(s.sticks.throttle * 100).toFixed(0)} %, hint "${s.hint}")`);
  await shot('08-m2-arm-refused');
  await hold('KeyS', 900);
  await page.keyboard.press('Space');
  await simWait(150);
  s = await snap();
  check('M2 Space arms with throttle low', s.armed && s.sticks.throttle === 0);
  await hold('KeyW', 800);
  await simWait(800);
  s = await snap();
  check('M2 W raises throttle and the quad takes off', s.sticks.throttle > 0.4 && s.pos[1] > 0.5, `(throttle ${(s.sticks.throttle * 100).toFixed(0)} %, alt ${s.pos[1].toFixed(1)} m)`);
  const z0 = s.pos[2];
  await hold('ArrowUp', 1200);
  s = await snap();
  check('M2 arrow up flies forward', s.pos[2] < z0 - 0.5, `(moved ${(z0 - s.pos[2]).toFixed(1)} m)`);
  await page.keyboard.press('KeyM');
  await simWait(100);
  check('M2 M switches to acro', (await snap()).mode === 'acro');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyR');
  await simWait(200);
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
  await simWait(200);
  check('M2 unknown controller is detected and asks for setup', (await page.textContent('#controller')).includes('needs setup'), `("${await page.textContent('#controller')}")`);
  check('M6 setup screen opens by itself for a controller with no standard layout', (await snap()).setupOpen);
  await simWait(900);
  check('M2 setup screen asks for throttle first', (await page.textContent('#setup .prompt')).includes('THROTTLE'));
  await shot('09-m2-setup-throttle');
  const wizardStep = () => page.evaluate(() => (window.__sim.setup.wizard ? window.__sim.setup.wizard.step : -1));
  const waitStep = (n) => page.waitForFunction((k) => { const w = window.__sim.setup.wizard; return !w || w.step >= k; }, n, { timeout: 15000 });
  await axes([0, 0, -1, 0, -1, 0]); await waitStep(1);                         // throttle up, left up like a radio
  await simWait(800);
  await axes([0, 0, -1, -1, -1, 0]); await waitStep(2); await axes([0, 0, -1, 0, -1, 0]);   // yaw right
  await simWait(800);
  await shot('10-m2-setup-pitch');
  check('M2 setup screen reaches the pitch step', (await page.textContent('#setup .prompt')).includes('PITCH'));
  await axes([0, 1, -1, 0, -1, 0]); await waitStep(3); await axes([0, 0, -1, 0, -1, 0]);    // pitch forward
  await simWait(800);
  await axes([1, 0, -1, 0, -1, 0]); await waitStep(4); await axes([0, 0, -1, 0, -1, 0]);    // roll right
  await simWait(800);
  await axes([0, 0, -1, 0, 1, 0]); await waitStep(5);                          // arm switch (an axis)
  await simWait(800);
  await shot('11-m2-setup-mode');
  await button(0, true); await simWait(150); await button(0, false);          // mode = push button
  await page.waitForFunction(() => !window.__sim.setup.open, null, { timeout: 15000 });
  const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('fpvsim.controllers.v2')) || { profiles: {} }).profiles['Test Radio (USB Joystick)'] || null);
  const want = { throttle: { index: 2, sign: -1 }, yaw: { index: 3, sign: -1 }, pitch: { index: 1, sign: 1 }, roll: { index: 0, sign: 1 } };
  check('M2 setup saved the right axes and inversions', JSON.stringify(saved && saved.axes) === JSON.stringify(want), JSON.stringify(saved && saved.axes));
  check('M2 setup saved arm switch and mode button', saved && saved.arm.type === 'axis' && saved.arm.index === 4 && saved.mode.type === 'button' && saved.mode.kind === 'toggle', JSON.stringify(saved && [saved.arm, saved.mode]));

  // Fly with the mapped radio. The arm switch is still on with throttle up: must not arm until both are safe.
  await simWait(300);
  s = await snap();
  check('M2 radio: no arming with throttle up', !s.armed && s.source === 'gamepad' && s.sticks.throttle > 0.9, `(hint "${s.hint}")`);
  await axes([0, 0, 1, 0, -1, 0]); await simWait(200);            // throttle down, switch off
  await axes([0, 0, 1, 0, 1, 0]); await simWait(200);             // switch on
  s = await snap();
  check('M2 radio: arm switch arms with throttle low', s.armed);
  await axes([0, 0, -0.1, 0, 1, 0]); await simWait(1200);         // 55 % throttle
  s = await snap();
  check('M2 radio: throttle stick lifts the quad', s.pos[1] > 1 && Math.abs(s.sticks.throttle - 0.55) < 0.01, `(alt ${s.pos[1].toFixed(1)} m)`);
  await axes([0.5, 0, -0.1, 0, 1, 0]); await simWait(700);
  s = await snap();
  check('M2 radio: roll stick right rolls right (angle mode)', s.rollDeg > 15 && s.rollDeg < 35, `(roll ${s.rollDeg.toFixed(0)} deg)`);
  await axes([0.03, -0.03, -0.1, 0.03, 1, 0]); await simWait(100);
  s = await snap();
  check('M2 radio: deadzone swallows stick noise', s.sticks.roll === 0 && s.sticks.pitch === 0 && s.sticks.yaw === 0);
  await button(0, true); await simWait(120); await button(0, false); await simWait(100);
  check('M2 radio: mode button switches to acro', (await snap()).mode === 'acro');
  await shot('12-m2-flying-with-radio');
  await axes([0, 0, 1, 0, -1, 0]); await simWait(150);
  check('M2 radio: arm switch off disarms', !(await snap()).armed);

  // The mapping survives a reload.
  await page.reload();
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  await page.evaluate(() => {
    const pad = { id: 'Test Radio (USB Joystick)', index: 0, connected: true, mapping: '', timestamp: 0, axes: [0, 1, -1, 0, -1, 0], buttons: [{ pressed: false, value: 0 }] };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
  await simWait(300);
  s = await snap();
  const label = await page.textContent('#controller');
  check('M2 mapping survives a page reload', s.source === 'gamepad' && s.sticks.throttle === 1 && s.sticks.pitch === 1 && !label.includes('needs setup'), `("${label}")`);
  await shot('13-m2-after-reload');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

// --- M3: FPV view, world, crash and reset, HUD ---
if (runs('M3')) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    window.__sim.view.chase = false; window.__sim.setMode('angle'); window.__sim.useInput();
  });
  await simWait(200);
  let s = await snap();
  const tilt = Math.asin(s.camera.dir[1]) * 180 / Math.PI;
  check('M3 FPV camera sits on the quad, tilted up 25 deg', Math.abs(tilt - 25) < 0.5 && Math.hypot(s.camera.pos[0] - s.pos[0], s.camera.pos[1] - s.pos[1], s.camera.pos[2] - s.pos[2]) < 0.1 && s.camera.dir[2] < 0, `(tilt ${tilt.toFixed(1)} deg)`);
  const hfov = 2 * Math.atan(Math.tan(s.camera.fov * Math.PI / 360) * 1280 / 720) * 180 / Math.PI;
  check('M3 horizontal field of view is 115 deg', Math.abs(hfov - 115) < 0.5, `(${hfov.toFixed(1)} deg, vertical ${s.camera.fov.toFixed(1)})`);
  check('M3 on the pad: hint tells how to start, panel visible', /arm/i.test(await page.textContent('#hint')) && await page.isVisible('#btn-reset'));
  await shot('14-m3-on-the-pad');

  // Fly it from the script: hover, cruise, look around.
  await page.evaluate(() => { window.__sim.place(0, 3, 6, 0); window.__sim.arm(true); });
  s = await fly({ ...neutral, throttle: thr(0.3) }, 600);
  const hudText = (await page.textContent('#hud')).replace(/\s+/g, ' ');
  check('M3 HUD shows armed, mode, throttle, speed', /ARMED/.test(hudText) && /ANGLE/.test(hudText) && /1[0-9]%/.test(hudText) && /km\/h/.test(hudText), `("${hudText.trim()}")`);
  check('M3 side panel hides while armed', await page.evaluate(() => getComputedStyle(document.getElementById('panel')).opacity === '0' || document.body.classList.contains('flying')));
  await shot('15-m3-hover-3m');
  s = await fly({ ...neutral, throttle: thr(0.42), pitch: 0.45 }, 3500);
  check('M3 cruising forward over the field', s.pos[2] < -10 && !s.crashed, `(${(Math.hypot(...s.vel) * 3.6).toFixed(0)} km/h, alt ${s.pos[1].toFixed(1)} m)`);
  await shot('16-m3-cruise');
  await page.evaluate(() => { window.__sim.place(40, 6, -30, 90); window.__sim.arm(true); });   // facing the barn
  await fly({ ...neutral, throttle: thr(0.3) }, 500);
  await shot('17-m3-barn-and-poles');
  await page.evaluate(() => { window.__sim.place(0, 25, 40, 0); window.__sim.setMode('acro'); window.__sim.arm(true); });
  await fly({ ...neutral, throttle: thr(0.3) }, 300);
  s = await fly({ ...neutral, throttle: thr(0.3), roll: 0.25 }, 250);
  s = await fly({ ...neutral, throttle: thr(0.3) }, 100);
  check('M3 acro: banked view stays banked', Math.abs(s.rollDeg) > 12, `(roll ${s.rollDeg.toFixed(0)} deg)`);
  await shot('18-m3-acro-banked-25m');
  await page.evaluate(() => { window.__sim.view.chase = true; });
  await fly({ ...neutral, throttle: thr(0.3) }, 300);
  await shot('19-m3-outside-view');
  await page.evaluate(() => { window.__sim.view.chase = false; window.__sim.setMode('angle'); });

  // Crash into a pole: crash shown, short pause, automatic reset to the pad, disarmed.
  const before = (await snap()).crashes;
  await page.evaluate(() => { window.__sim.place(-10, 2.5, -4, 0); window.__sim.arm(true); });   // pole at (-10, -12) dead ahead
  await page.evaluate((st) => window.__sim.setSticks(st), { ...neutral, throttle: thr(0.33), pitch: 0.3 });
  await page.waitForFunction(() => window.__sim.snapshot().crashed, null, { timeout: 60000, polling: 20 });
  s = await snap();
  check('M3 hitting a pole is a crash', s.crashed && s.crashedInto === 'pole' && Math.abs(s.pos[2] + 12) < 0.6, `(into ${s.crashedInto} at z ${s.pos[2].toFixed(1)})`);
  check('M3 crash is announced', /Crashed into a pole/.test(await page.textContent('#hint')) && /CRASHED/.test(await page.textContent('#hud')));
  await shot('20-m3-crashed-into-pole');
  await page.evaluate((st) => window.__sim.setSticks(st), neutral);
  await page.waitForFunction(() => !window.__sim.snapshot().crashed, null, { timeout: 30000, polling: 20 });
  s = await snap();
  check('M3 after a short pause: back on the pad, disarmed', !s.armed && Math.hypot(s.pos[0], s.pos[2]) < 0.01 && s.pos[1] < 0.1 && s.crashes === before + 1, `(crashes ${before} -> ${s.crashes})`);

  // Reset button.
  await page.evaluate(() => { window.__sim.place(20, 10, -20, 0); });
  await page.click('#btn-reset');
  await simWait(50);
  s = await snap();
  check('M3 reset button puts the quad back on the pad', Math.hypot(s.pos[0], s.pos[2]) < 0.01 && !s.armed);

  // The whole thing by keyboard, as Mike would without a controller: arm, climb, fly forward.
  await page.evaluate(() => window.__sim.useInput());
  await page.keyboard.press('Space');
  await page.keyboard.down('KeyW'); await simWait(650); await page.keyboard.up('KeyW');
  await simWait(700);
  await page.keyboard.down('ArrowUp'); await simWait(1500); await page.keyboard.up('ArrowUp');
  s = await snap();
  check('M3 keyboard flight in FPV: took off and flew forward', s.armed && s.pos[1] > 1 && s.pos[2] < -1 && !s.crashed, `(alt ${s.pos[1].toFixed(1)} m, ${(-s.pos[2]).toFixed(1)} m down the field)`);
  await shot('21-m3-keyboard-flight');
  await page.keyboard.press('Space');
  await page.evaluate(() => window.__sim.reset());
}

// --- M4: gates, next-gate highlight, lap timer, best lap ---
if (runs('M4')) {
  const gateColor = (i) => page.evaluate((k) => window.__sim.scene.getObjectByName('gates').children[k].children[0].material.color.getHex(), i);
  const ORANGE = 0xff7a1a;
  await page.evaluate(() => {
    try { localStorage.clear(); } catch {}
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    window.__sim.race.best = null; window.__sim.view.chase = false; window.__sim.setMode('angle'); window.__sim.useInput();
  });
  await simWait(200);
  let s = await snap();
  const nGates = await page.evaluate(() => window.__sim.world.course.gates.length);
  let hudText = (await page.textContent('#hud')).replace(/\s+/g, ' ');
  check('M4 course has 6 to 8 gates', nGates >= 6 && nGates <= 8, `(${nGates})`);
  check('M4 on the pad: HUD shows gate 1, no lap running, no best yet', hudText.includes(`GATE 1/${nGates}`) && /LAP –/.test(hudText) && /BEST –/.test(hudText) && !s.race.running, `("${hudText.trim()}")`);
  check('M4 gate 1 is highlighted, the others are not', await gateColor(0) === ORANGE && await gateColor(1) !== ORANGE && await gateColor(nGates - 1) !== ORANGE);
  await shot('22-m4-pad-gate-1-ahead');

  // Through gate 1: the clock starts and the highlight moves to gate 2.
  await page.evaluate(() => { window.__sim.place(0, 1.2, -14, 0); window.__sim.arm(true); });
  await fly({ ...neutral, throttle: thr(0.3) }, 300);
  check('M4 guide to the next gate shows while armed', await page.isVisible('#guide') && /gate 1 · \d+ m/i.test(await page.textContent('#guide')), `("${await page.textContent('#guide')}")`);
  await shot('23-m4-approaching-gate-1');
  await page.evaluate((st) => window.__sim.setSticks(st), { ...neutral, throttle: thr(0.31), pitch: 0.3 });
  await page.waitForFunction(() => window.__sim.snapshot().race.running || window.__sim.snapshot().crashed || window.__sim.snapshot().pos[2] < -40, null, { timeout: 60000, polling: 20 });
  s = await snap();
  check('M4 flying through gate 1 starts the lap clock', s.race.running && s.race.next === 1 && !s.crashed && s.pos[2] < -22, `(z ${s.pos[2].toFixed(1)}, alt ${s.pos[1].toFixed(1)} m)`);
  check('M4 "Lap started" is shown and gate 2 is now highlighted', /Lap started/.test(await page.textContent('#toast')) && await gateColor(1) === ORANGE && await gateColor(0) !== ORANGE);
  await shot('24-m4-lap-started');
  await simWait(1500);
  s = await snap();
  hudText = (await page.textContent('#hud')).replace(/\s+/g, ' ');
  check('M4 lap clock runs on the HUD', s.race.lapTime > 1 && /LAP 0:0\d\.\d\d/.test(hudText) && hudText.includes(`GATE 2/${nGates}`), `("${hudText.trim()}")`);

  // Flying past the side of gate 2 does not count.
  await page.evaluate(() => { const r = window.__sim.race; window.__sim.place(4, 1.2, -52, 0); r.next = 1; r.running = true; window.__sim.arm(true); });
  await page.evaluate((st) => window.__sim.setSticks(st), { ...neutral, throttle: thr(0.31), pitch: 0.3 });
  await page.waitForFunction(() => window.__sim.snapshot().pos[2] < -62, null, { timeout: 60000, polling: 20 });
  s = await snap();
  check('M4 passing beside a gate does not count', s.race.next === 1 && !s.crashed && Math.abs(s.pos[0] - 4) < 1, `(x ${s.pos[0].toFixed(1)}, next gate ${s.race.next + 1})`);

  // Hitting a gate post is a crash and throws the lap away.
  await page.evaluate(() => { const r = window.__sim.race; window.__sim.place(1.58, 1.2, -50, 0); r.next = 1; r.running = true; window.__sim.arm(true); });
  await page.evaluate((st) => window.__sim.setSticks(st), { ...neutral, throttle: thr(0.31), pitch: 0.3 });
  await page.waitForFunction(() => window.__sim.snapshot().crashed || window.__sim.snapshot().pos[2] < -70, null, { timeout: 60000, polling: 20 });
  s = await snap();
  check('M4 hitting a gate post is a crash', s.crashedInto === 'gate' && Math.abs(s.pos[2] + 58) < 0.6, `(into ${s.crashedInto} at z ${s.pos[2].toFixed(1)})`);
  check('M4 crash is announced as a gate', /Crashed into a gate/.test(await page.textContent('#hint')));
  await shot('25-m4-crashed-into-gate');
  await page.evaluate((st) => window.__sim.setSticks(st), neutral);
  await page.waitForFunction(() => !window.__sim.snapshot().crashed, null, { timeout: 30000, polling: 20 });
  s = await snap();
  check('M4 after the crash the lap is reset to gate 1', !s.race.running && s.race.next === 0 && await gateColor(0) === ORANGE);

  // A whole lap, flown in the browser by the test autopilot (angle mode, same sticks a pilot has), from the pad.
  await page.evaluate(async (base) => {
    const { createAutopilot } = await import(base + 'test/autopilot.mjs');
    const sim = window.__sim, ap = createAutopilot(sim.world.course);
    sim.reset(); sim.arm(true);
    window.__ap = { on: true, shots: {} };
    const tick = () => { if (!window.__ap.on) return; if (!sim.sim.state.crashed) sim.setSticks(ap.update(sim.sim.state)); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }, url);
  const waitRace = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 400000, polling: 30 });
  for (const [gate, name] of [[2, '26-m4-lap-toward-gate-3'], [3, '27-m4-lap-toward-gate-4'], [5, '28-m4-lap-toward-gate-6'], [0, '29-m4-lap-last-turn-to-gate-1']]) {
    await waitRace((g) => { const x = window.__sim.snapshot(); return x.crashed || x.race.laps > 0 || (x.race.running && x.race.next === g); }, gate);
    await simWait(gate === 0 ? 1500 : 700);
    await shot(name);
  }
  await waitRace(() => { const x = window.__sim.snapshot(); return x.crashed || x.race.laps >= 1; });
  s = await snap();
  const toastText = await page.textContent('#toast');
  check('M4 autopilot flew a full lap through all gates without crashing', s.race.laps === 1 && s.crashes !== undefined && !s.crashed, `(lap ${s.race.lastLap && s.race.lastLap.toFixed(2)} s)`);
  check('M4 lap time is shown with "new best"', /Lap 0:\d\d\.\d\d · new best!/.test(toastText), `("${toastText}")`);
  await shot('30-m4-lap-done-new-best');
  const stored = await page.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith('fpvsim.bestlap')); return k ? JSON.parse(localStorage.getItem(k)) : null; });
  check('M4 best lap saved in the browser', stored !== null && Math.abs(stored - s.race.best) < 1e-9 && Math.abs(stored - s.race.lastLap) < 1e-9, `(${stored && stored.toFixed(2)} s)`);
  check('M4 a new lap starts straight away', s.race.running && s.race.next === 1);
  await page.evaluate(() => { window.__ap.on = false; window.__sim.reset(); });
  const best = s.race.best;

  // The best lap survives a reload.
  await page.reload();
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  await simWait(100);
  s = await snap();
  hudText = (await page.textContent('#hud')).replace(/\s+/g, ' ');
  const m = Math.floor(best / 60), shown = `${m}:${(Math.round(best * 100) / 100 - m * 60).toFixed(2).padStart(5, '0')}`;
  check('M4 best lap survives a page reload', Math.abs(s.race.best - best) < 1e-9 && hudText.includes(`BEST ${shown}`), `("${hudText.trim()}")`);
  await shot('31-m4-best-after-reload');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

// --- M5: feel. Step inputs into the sim running in Chrome (same 1 kHz physics), responses plotted to proof/M5-style images ---
if (runs('M5')) {
  const feel = await page.evaluate(async (base) => {
    const [{ createSim, simSteps }, { attitude }, { measureFeel, traceSvg, feelRows }] = await Promise.all([
      import(base + 'src/sim.js'), import(base + 'src/physics.js'), import(base + 'test/feel-measure.mjs')]);
    const m = measureFeel({ createSim, simSteps, attitude });
    return { rows: feelRows(m), svgs: Object.entries(m.traces).map(([name, tr]) => [name, traceSvg(name, tr)]), m: { ...m, traces: undefined } };
  }, url);
  for (const [k, v] of feel.rows) console.log(`     ${k}: ${v}`);
  const m = feel.m;
  check('M5 feel measured in Chrome: hover throttle 10 to 20 %', m.hoverThrottle > 0.10 && m.hoverThrottle < 0.20, `(${(m.hoverThrottle * 100).toFixed(1)} %)`);
  check('M5 acro full-stick roll reaches the configured rate without big overshoot', Math.abs(m.acro.roll.heldRate - m.acro.roll.target) < 15 && m.acro.roll.overshootPct < 10, `(held ${m.acro.roll.heldRate.toFixed(0)} deg/s, overshoot ${m.acro.roll.overshootPct.toFixed(1)} %)`);
  check('M5 angle mode holds its tilt and levels without swinging past', Math.abs(m.angle.held - m.angle.target) < 2 && m.angle.undershootDeg < 1 && m.angle.overshootPct < 5, `(held ${m.angle.held.toFixed(1)} of ${m.angle.target} deg, swing-back ${m.angle.undershootDeg.toFixed(2)} deg)`);
  // Plots: one page with every step response, rendered by Chrome and saved as proof.
  const plots = await browser.newPage({ viewport: { width: 1180, height: 1130 } });
  await plots.setContent(`<body style="margin:0;background:#fff;font-family:system-ui,sans-serif"><h1 style="font-size:18px;margin:12px 16px 4px">Feel: step responses measured in the browser sim (1 kHz physics)</h1><div style="display:grid;grid-template-columns:repeat(2,560px);gap:10px 20px;padding:8px 16px">${feel.svgs.map(([, svg]) => svg).join('')}</div></body>`);
  await plots.screenshot({ path: `${outDir}32-m5-feel-step-responses.png`, fullPage: true });
  await plots.close();
  check('M5 step-response plots saved', feel.svgs.length >= 8, `(${feel.svgs.length} plots)`);
}

// --- M5b: Feel tuning panel, presets, and the PlayStation spring-stick throttle (page opened the way Mike opens it) ---
if (runs('M5')) {
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto(url + '?fast&free');
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  await simWait(100);
  const tune = () => page.evaluate(() => ({ t: window.__sim.tuning, hover: window.__sim.config.hover, limit: window.__sim.sim.fcCfg.throttleLimit,
    max: window.__sim.sim.fcCfg.rates.roll.max, kp: window.__sim.sim.fcCfg.kp, drag: window.__sim.sim.quad.dragLinear, inp: window.__sim.input.tune }));
  const slide = (key, v) => page.evaluate(([k, x]) => { const el = document.getElementById('tune-' + k); el.value = String(x); el.dispatchEvent(new Event('input', { bubbles: true })); }, [key, v]);
  let t = await tune();
  check('M5 first visit starts on the Trainer preset (throttle limit 70 %)', t.t.preset === 'trainer' && t.limit === 0.7, `(hover ${(t.hover * 100).toFixed(1)} %)`);
  await page.click('#tuning summary');
  await shot('33-m5-feel-tuning-panel-trainer');
  const info = await page.textContent('#tune-info');
  check('M5 panel shows the hover throttle and 8 sliders', /Hovers at \d+% throttle/.test(info) && await page.locator('#tune-sliders input[type=range]').count() === 8, `("${info}")`);

  // A standard-layout pad (PlayStation controller) with the sticks at rest: throttle = hover, and the quad holds height.
  await page.evaluate(() => {
    const pad = { id: 'DualSense Wireless Controller (test)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
  });
  await simWait(200);
  let s = await snap();
  check('M5 PlayStation pad at rest gives hover throttle, no setup needed', s.source === 'gamepad' && Math.abs(s.sticks.throttle - t.hover) < 1e-9 && !s.setupOpen, `(throttle ${(s.sticks.throttle * 100).toFixed(1)} %)`);
  await page.evaluate(() => { window.__pad.axes = [0, 1, 0, 0]; }); await simWait(100);          // throttle stick down
  await page.evaluate(() => { window.__pad.buttons[5] = { pressed: true, value: 1 }; }); await simWait(100);
  await page.evaluate(() => { window.__pad.buttons[5] = { pressed: false, value: 0 }; }); await simWait(100);
  check('M5 pad: stick down then R1 arms', (await snap()).armed);
  await page.evaluate(() => { window.__pad.axes = [0, -0.5, 0, 0]; }); await simWait(1500);      // push up: climb
  await page.evaluate(() => { window.__pad.axes = [0, 0, 0, 0]; }); await simWait(2500);         // let go: should settle near hover
  s = await snap();
  const y0 = s.pos[1];
  await simWait(2000);
  s = await snap();
  check('M5 pad: let go of the stick and the quad hovers (angle mode)', s.armed && !s.crashed && y0 > 1 && Math.abs(s.pos[1] - y0) < 1.5 && Math.abs(s.vel[1]) < 0.6, `(alt ${y0.toFixed(1)} -> ${s.pos[1].toFixed(1)} m, vertical ${s.vel[1].toFixed(2)} m/s)`);
  await shot('34-m5-pad-hands-off-hover');
  await page.evaluate(() => { window.__pad.buttons[9] = { pressed: true, value: 1 }; }); await simWait(100);
  await page.evaluate(() => { window.__pad.buttons[9] = { pressed: false, value: 0 }; }); await simWait(200);
  s = await snap();
  const padLabel = await page.textContent('#controller'), padHint = await page.textContent('#hint');
  check('M6 pad: Options resets; PlayStation button names on screen', !s.armed && s.onGround && /R1 arm · L1 angle\/acro · Options reset/.test(padLabel) && /press R1 to arm/.test(padHint), `("${padHint}")`);
  await shot('37-m6-playstation-names');

  // Sliders change the sim, survive a reload, and Reset to default undoes them.
  await page.selectOption('#tune-preset', 'freestyle');
  await slide('rateMax', 900); await slide('responsiveness', 0.5); await slide('floatiness', 2); await slide('throttleMid', 0.3);
  const d = await tune();
  check('M5 preset and sliders change the sim', d.t.preset === 'freestyle' && d.limit === 1 && d.max === 900 && Math.abs(d.kp - 60) < 1e-9 && Math.abs(d.drag - 0.15) < 1e-9 && d.inp.throttleMid === 0.3 && d.hover < t.hover, JSON.stringify(d.t));
  await shot('35-m5-feel-tuning-changed');
  await page.reload();
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  const r = await tune();
  check('M5 tuning survives a page reload', JSON.stringify(r.t) === JSON.stringify(d.t) && r.max === 900);
  await page.click('#tuning summary');
  await page.click('#tune-reset');
  const z = await tune();
  check('M5 Reset to default restores the sourced values, keeps the chosen quad', z.t.preset === 'freestyle' && z.max === 670 && z.kp === 120 && Math.abs(z.drag - 0.3) < 1e-9 && z.t.throttleMid === null && Math.abs(z.inp.throttleMid - z.hover) < 1e-12);
  await shot('36-m5-feel-tuning-reset');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

// --- M6: stick overlay and line-of-sight view ---
if (runs('M6')) {
  await page.goto(url + '?fast&free&preset=freestyle');
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  await page.evaluate(() => { window.__sim.reset(); window.__sim.setMode('angle'); window.__sim.arm(true); });
  let s = await fly({ ...neutral, throttle: stickForThrust(1.25), roll: 0.5, yaw: -0.5 }, 700);
  const dots = await page.evaluate(() => ['stick-l', 'stick-r'].map((id) => { const d = document.getElementById(id).getBoundingClientRect(), b = document.getElementById(id).parentElement.getBoundingClientRect();
    return [(d.x + d.width / 2 - b.x - b.width / 2), (d.y + d.height / 2 - b.y - b.height / 2)]; }));
  check('M6 stick overlay shows the live sticks (left: throttle + yaw, right: pitch + roll)', s.sticksShown && dots[0][0] < -14 && dots[0][1] > 10 && dots[1][0] > 14 && Math.abs(dots[1][1]) < 1, JSON.stringify(dots.map((d) => d.map((v) => Math.round(v)))));
  await shot('38-m6-stick-overlay-fpv');
  await page.evaluate(() => { window.__sim.place(-3, 2.5, -8, 90); window.__sim.arm(true); });
  await fly({ ...neutral, throttle: stickForThrust(1) }, 300);
  await page.keyboard.press('KeyV');
  await simWait(100);
  s = await snap();
  const onScreen = await page.evaluate(() => { const p = window.__sim.scene.children.find((c) => c.visible && c.type === 'Group' && c.children.length === 8).position.clone().project(window.__sim.camera); return [p.x, p.y, p.z]; });
  check('M6 V switches to line of sight: camera stands at the pilot, quad in the middle of the view', s.view === 'los' && Math.abs(s.camera.pos[1] - 1.7) < 1e-6 && Math.abs(s.camera.pos[2] - 5) < 1e-6 && Math.abs(onScreen[0]) < 0.05 && Math.abs(onScreen[1]) < 0.05 && /LINE OF SIGHT/.test(await page.textContent('#hud')), JSON.stringify(onScreen.map((v) => +v.toFixed(3))));
  await shot('39-m6-line-of-sight');
  await page.keyboard.press('KeyO');
  await simWait(100);
  check('M6 O hides the stick overlay', !(await snap()).sticksShown);
  await page.keyboard.press('KeyO'); await page.keyboard.press('KeyV');
  await simWait(100);
  s = await snap();
  check('M6 V again goes back to FPV', s.view === 'fpv' && s.sticksShown);
  await page.evaluate(() => window.__sim.reset());
}

// --- M6: the lessons, flown in Chrome by the test pilot (test/autopilot.mjs) ---
if (runs('M6L')) {
  const open = async (query, seed) => {
    await page.goto(url + '?fast' + query);
    if (seed !== undefined) { await page.evaluate((v) => { if (v === null) localStorage.removeItem('fpvsim.lessons.v1'); else localStorage.setItem('fpvsim.lessons.v1', JSON.stringify(v)); }, seed); await page.reload(); }
    await page.waitForFunction(() => window.__sim && window.__sim.ready);
    await page.evaluate(async (u) => {
      const { createLessonPilot, setPilotQuad } = await import(u + 'test/autopilot.mjs');
      setPilotQuad(window.__sim.sim.quad, window.__sim.sim.fcCfg);
      // Fly one run of the current lesson; resolves with the snapshot when the result card is up.
      window.__flyLesson = (opts) => new Promise((res) => {
        const sim = window.__sim, pilot = createLessonPilot(opts);
        let started = false;
        const tick = () => {
          const a = sim.attempt, snap = sim.snapshot();
          if (a.state === 'running') started = true;
          if (started && snap.card) { sim.arm(false); sim.setSticks({ roll: 0, pitch: 0, yaw: 0, throttle: 0 }); return res(snap); }
          const out = pilot.update(sim.sim.state, a);
          sim.setSticks(out.sticks); sim.arm(out.arm && !sim.sim.state.crashed);
          requestAnimationFrame(tick);
        };
        tick();
      });
    }, url);
  };
  const flyLesson = (opts = {}) => page.evaluate((o) => window.__flyLesson(o), opts);
  const until = (fn, arg) => page.waitForFunction(fn, arg, { timeout: 90000, polling: 30 });
  const T = { timeout: 300000 };

  // First visit: lesson 1 is up, the rest are locked, free flight is open.
  await open('', null);
  let s = await snap();
  const list = await page.$$eval('#lesson-list button', (bs) => bs.map((b) => [b.textContent, b.disabled, b.classList.contains('on')]));
  const banner = await page.textContent('#lesson');
  check('M6 first visit opens lesson 1 with the real-radio line; lessons 2 to 8 locked; free flight open', s.lesson && s.lesson.id === 'takeoff' && s.lesson.state === 'ready' && /On a real radio the throttle stays where you leave it/.test(banner)
    && list.length === 9 && list[0][2] && !list[0][1] && list.slice(1, 8).every((b) => b[1]) && !list[8][1], `("${banner}")`);
  await shot('40-m6-lesson1-start');
  let run = flyLesson();
  await until(() => window.__sim.attempt.state === 'running' && window.__sim.attempt.hold > 2);
  await shot('41-m6-lesson1-hover-in-box-fpv');
  let r = await run;
  check('M6 lesson 1 in FPV: a good run counts 1 of 3', r.card.good && /1 of 3 in a row in FPV/.test(r.card.title) && r.progress.takeoff.fpv.streak === 1, `("${r.card.title}" · "${r.card.text}")`);
  await shot('42-m6-lesson1-good-run-card');
  r = await flyLesson({ descend: 5 });
  check('M6 a hard landing is not a good run and puts the streak back to 0', !r.card.good && /Touchdown/.test(r.card.text) && r.progress.takeoff.fpv.streak === 0, `("${r.card.title}" · "${r.card.text}")`);
  await shot('43-m6-lesson1-hard-landing');
  for (let i = 0; i < 3; i++) r = await flyLesson();
  check('M6 three good runs in a row pass lesson 1 in FPV; lesson 2 stays locked until line of sight is done too', r.progress.takeoff.fpv.passed && /Passed in FPV/.test(r.card.title) && /line of sight/.test(r.card.text)
    && await page.$eval('#lesson-list button[data-id=directions]', (b) => b.disabled), `("${r.card.title}" · "${r.card.text}")`);
  await page.keyboard.press('KeyV');
  run = flyLesson();
  await until(() => window.__sim.attempt.state === 'running' && window.__sim.attempt.hold > 2);
  await shot('44-m6-lesson1-line-of-sight');
  await run;
  await flyLesson(); r = await flyLesson();
  check('M6 lesson 1 passed in both views: lesson 2 unlocked, progress saved', /Lesson passed/.test(r.card.title) && /Hover facing four ways/.test(r.card.text) && !(await page.$eval('#lesson-list button[data-id=directions]', (b) => b.disabled))
    && JSON.parse(await page.evaluate(() => localStorage.getItem('fpvsim.lessons.v1'))).takeoff.los.passed, `("${r.card.title}" · "${r.card.text}")`);
  await shot('45-m6-lesson1-passed');

  // Lesson 2 comes up by itself once the quad is disarmed; nose toward you in line of sight.
  await page.evaluate(() => window.__sim.arm(false)); await simWait(200);
  s = await snap();
  check('M6 after a pass the next lesson is selected by itself', s.lesson.id === 'directions' && s.lesson.state === 'ready' && /Lesson passed/.test(s.card.title), JSON.stringify(s.lesson));
  run = flyLesson();
  await until(() => window.__sim.attempt.step === 2 && window.__sim.attempt.hold > 1.5);
  s = await snap();
  check('M6 lesson 2: nose toward you, held in the box', Math.abs(Math.abs(s.yawDeg) - 180) < 20 && s.view === 'los' && /Nose toward you/.test(s.lesson.status), `(heading ${s.yawDeg.toFixed(0)}°, "${s.lesson.status}")`);
  await shot('46-m6-lesson2-nose-toward-you');
  r = await run;
  check('M6 lesson 2 run is good', r.card.good, `("${r.card.title}")`);

  // The other lessons, opened with ?unlock.
  await open('&unlock');
  for (const [id, view, name] of [['turns', 'los', '47-m6-lesson3-figure8'], ['outback', 'fpv', '48-m6-lesson4-coming-back'], ['wind', 'fpv', '49-m6-lesson5-wind']]) {
    await page.click(`#lesson-list button[data-id=${id}]`);
    if ((await snap()).view !== view) await page.keyboard.press('KeyV');
    run = flyLesson();
    await until(() => window.__sim.attempt.state === 'running' && window.__sim.attempt.step === 1 && (window.__sim.attempt.lesson.id !== 'turns' || Math.abs(window.__sim.attempt.wind) > 2));
    s = await snap();
    await shot(name);
    r = await run;
    check(`M6 lesson "${id}" flown to a good run in ${view}`, r.card.good && (id === 'wind') === !!s.wind, `("${r.card.title}" · "${r.card.text}"${s.wind ? ` · wind ${s.wind[0]} m/s` : ''})`);
    await page.evaluate(() => window.__sim.arm(false)); await simWait(100);
  }
  await page.click('#lesson-list button[data-id=emergency]');
  run = flyLesson({ disarmDelay: 0.7 });
  await until(() => window.__sim.attempt.prompt === true);
  await shot('50-m6-lesson6-disarm-now');
  check('M6 lesson 6: DISARM NOW is called during the low hover', /DISARM NOW/.test(await page.textContent('#lesson-step')));
  await until(() => window.__sim.attempt.step === 4);
  s = await snap();
  await shot('51-m6-lesson6-spun-round');
  r = await run;
  check('M6 lesson 6: disarmed in time, armed again, spun round at the far ring, came back and landed', r.card.good && /Disarm reaction 0\.[0-9] s/.test(r.card.text) && Math.abs(s.yawDeg) > 60, `(heading after the spin ${s.yawDeg.toFixed(0)}°, "${r.card.text}")`);
  await page.evaluate(() => window.__sim.arm(false)); await simWait(100);
  await page.click('#lesson-list button[data-id=acro]');
  s = await snap();
  r = await flyLesson();
  check('M6 lesson 7: choosing it switches to acro; flown to a good run', s.mode === 'acro' && r.card.good, `("${r.card.title}" · "${r.card.text}")`);
  await shot('52-m6-lesson7-acro');

  // Ready check with lessons 1 to 7 passed: one good run gives the badge.
  const seed = await page.evaluate(() => { const L = window.__sim.LS, p = L.createProgress(); for (const l of L.LESSONS.slice(0, 7)) for (const k of Object.keys(p[l.id])) p[l.id][k] = { streak: 3, runs: 3, passed: true }; return p; });
  await open('', seed);
  s = await snap();
  check('M6 with lessons 1 to 7 passed the page opens on the Ready check, no badge yet', s.lesson.id === 'ready' && !(await page.isVisible('#badge')));
  run = flyLesson();
  await until(() => window.__sim.attempt.step === 4);
  await shot('53-m6-ready-check-figure8-in-wind');
  r = await run;
  check('M6 Ready check: one good run in light wind gives the real-drone ready badge', /REAL-DRONE READY/.test(r.card.title) && await page.isVisible('#badge') && r.wind && r.wind[0] === 2.6, `("${r.card.title}" · "${r.card.text}")`);
  await page.evaluate(() => window.__sim.arm(false)); await simWait(200);
  s = await snap();
  check('M6 after the badge the page goes to free flight; the pass is saved', s.lesson === null && s.progress.ready.any.passed && /Free flight/.test(await page.$eval('#lesson-list button.on', (b) => b.textContent)), JSON.stringify(s.lesson));
  await shot('54-m6-real-drone-ready-badge');

  // "Reset this controller": a PlayStation pad that was put through the setup screen (so it is treated as a radio) gets its default back.
  await page.evaluate(() => {
    const pad = { id: 'DualSense Wireless Controller (test)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
    window.__sim.useInput();
    window.__sim.input.save({ version: 1, id: pad.id, deadzone: 0.05, axes: { throttle: { index: 1, sign: -1 }, yaw: { index: 0, sign: 1 }, pitch: { index: 3, sign: -1 }, roll: { index: 2, sign: 1 } }, arm: null, mode: null, reset: null });
  });
  await simWait(200);
  s = await snap();
  const radioThr = s.sticks.throttle, shown = await page.isVisible('#btn-forget');
  await shot('55-m6-reset-this-controller');
  await page.click('#btn-forget');
  await simWait(200);
  s = await snap();
  check('M6 "Reset this controller" shows for a saved setup and gives the pad its default back (stick centre = hover again)', shown && Math.abs(radioThr - 0.5) < 0.01 && Math.abs(s.sticks.throttle - (await page.evaluate(() => window.__sim.config.hover))) < 1e-9
    && !(await page.isVisible('#btn-forget')) && /R1 arm/.test(await page.textContent('#controller')), `(throttle at rest ${(radioThr * 100).toFixed(0)} % -> ${(s.sticks.throttle * 100).toFixed(1)} %)`);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

// --- M6b: the look (sun and its shadows, sky, haze, ground detail, Graphics setting) ---
if (runs('M6b')) {
  await page.goto(url + '?fast&free&preset=freestyle');
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  const look = await page.evaluate(async (base) => {
    const S = await import(base + 'src/scene.js'), sim = window.__sim, sc = sim.scene;
    const sun = sc.children.find((c) => c.isDirectionalLight), sky = sc.getObjectByName('sky');
    const dir = sun.position.clone().normalize().toArray();
    return { quality: sim.quality, tone: sim.renderer.toneMapping, fog: !!sc.fog.isFogExp2, sunDir: S.SUN_DIR, lightDir: dir, skySun: sky.material.uniforms.sunDir.value.toArray(),
      elevationDeg: Math.asin(S.SUN_DIR[1]) * 180 / Math.PI, discDeg: Math.acos(sky.material.uniforms.cosSun.value) * 2 * 180 / Math.PI,
      shadows: sc.children.filter((c) => c.name === 'shadow').length + sc.getObjectByName('gate-shadows').children.length,
      casters: 2 + sim.world.poles.length + 2 * sim.world.buildings.length + 3 * sim.world.gates.length };
  }, url);
  const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);
  check('M6b one sun: the light, the sun in the sky and the shadows use the same direction; disc 0.53° wide; haze and tone mapping on', same(look.sunDir, look.lightDir) && same(look.sunDir, look.skySun)
    && Math.abs(look.discDeg - 0.533) < 0.01 && look.fog && look.tone !== 0 && look.elevationDeg > 30 && look.elevationDeg < 60, `(sun ${look.elevationDeg.toFixed(1)}° up, disc ${look.discDeg.toFixed(3)}°)`);
  check('M6b every tree, pole, building and gate casts a shadow', look.shadows === look.casters, `(${look.shadows} shadow shapes for ${look.casters} casters)`);

  // Brightness of the ground at a world point, with and without shadows, seen from straight above. Rendered and read in one go.
  // quadAt: first put the quad at that height above (0, -6) and look at the middle of its shadow instead (all in one go, so it has no time to fall).
  const darkening = (point, camHeight, quadAt = null) => page.evaluate(([pt, h, quadAt]) => {
    const sim = window.__sim, r = sim.renderer, gl = r.getContext(), cam = sim.camera.clone(), info = {};
    if (quadAt !== null) {
      sim.place(0, quadAt, -6, 0);
      const m = sim.scene.getObjectByName('quad-shadow');
      m.update(sim.sim.state.pos, sim.sim.state.quat);
      pt = [m.matrix.elements[12], m.matrix.elements[14]];
      Object.assign(info, { pos: [...sim.sim.state.pos], centre: pt, expect: sim.shadowPoint(sim.sim.state.pos), opacity: m.material.opacity });
    }
    cam.fov = 40; cam.position.set(pt[0], h, pt[1] + 0.001); cam.up.set(0, 0, -1); cam.lookAt(pt[0], 0, pt[1]); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const sh = []; sim.scene.traverse((o) => { if (o.name === 'shadow' || o.name === 'quad-shadow' || (o.parent && o.parent.name === 'gate-shadows')) sh.push(o); });
    const lum = () => { r.render(sim.scene, cam); const px = new Uint8Array(4 * 9 * 9); gl.readPixels(gl.drawingBufferWidth / 2 - 4, gl.drawingBufferHeight / 2 - 4, 9, 9, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let t = 0; for (let i = 0; i < px.length; i += 4) t += px[i] + px[i + 1] + px[i + 2]; return t / (3 * 81); };
    const withShadow = lum(); sh.forEach((o) => { o.visible = false; });
    const without = lum(); sh.forEach((o) => { o.visible = true; });
    return { ...info, withShadow, without, ratio: withShadow / without };
  }, [point, camHeight, quadAt]);
  // The tower is 18 m tall: the shadow of the middle of its roof lands 18 m / tan(elevation) away, opposite the sun.
  const tower = await page.evaluate(() => { const b = window.__sim.world.buildings.find((x) => x.h === 18); return { mid: window.__sim.shadowPoint([b.x, b.h * 0.6, b.z]), top: window.__sim.shadowPoint([b.x, b.h, b.z]), b }; });
  const reach = Math.hypot(tower.top[0] - tower.b.x, tower.top[1] - tower.b.z), expectReach = 18 / Math.tan(look.elevationDeg * Math.PI / 180);
  const dTower = await darkening(tower.mid, 30);
  check('M6b the tower shadow is as long as the sun height says and darkens the grass inside it', Math.abs(reach - expectReach) < 0.05 && dTower.ratio < 0.8, `(roof shadow ${reach.toFixed(1)} m away, expected ${expectReach.toFixed(1)} m; grass ${Math.round((1 - dTower.ratio) * 100)} % darker)`);
  const dOpen = await darkening([0, -6], 30);
  check('M6b open grass is not darkened', Math.abs(dOpen.ratio - 1) < 0.01, `(ratio ${dOpen.ratio.toFixed(3)})`);

  // The quad's own shadow: where the sun puts it, and softer the higher the quad is.
  const lowQ = await darkening(null, 6, 1.5), highQ = await darkening(null, 6, 20);
  const off = Math.hypot(lowQ.centre[0] - lowQ.pos[0], lowQ.centre[1] - lowQ.pos[2]);
  check('M6b the quad shadow lies where the sun puts it (not straight below) and darkens the grass', same(lowQ.centre, lowQ.expect) && Math.abs(off - lowQ.pos[1] / Math.tan(look.elevationDeg * Math.PI / 180)) < 0.05 && lowQ.ratio < 0.8,
    `(quad at ${lowQ.pos[1].toFixed(2)} m, shadow ${off.toFixed(2)} m to the side, grass ${Math.round((1 - lowQ.ratio) * 100)} % darker)`);
  check('M6b the quad shadow is fainter from 20 m up than from 1.5 m', highQ.opacity < lowQ.opacity * 0.8 && highQ.ratio > lowQ.ratio && highQ.ratio < 0.98, `(opacity ${lowQ.opacity.toFixed(2)} -> ${highQ.opacity.toFixed(2)})`);

  // Hold the quad still at a place and attitude (noseDown in degrees) and take a picture.
  const view = async (x, y, z, yaw, noseDown, name, mode = 'fpv') => {
    await page.evaluate(([x, y, z, yaw, noseDown, mode]) => {
      const s = window.__sim, h = -yaw * Math.PI / 360, p = -noseDown * Math.PI / 360;
      s.place(x, y, z, yaw); s.paused = true; s.view.mode = mode; s.sim.state.onGround = false;
      s.sim.state.quat = [Math.cos(h) * Math.sin(p), Math.sin(h) * Math.cos(p), -Math.sin(h) * Math.sin(p), Math.cos(h) * Math.cos(p)];
    }, [x, y, z, yaw, noseDown, mode]);
    const f = await page.evaluate(() => window.__sim.frames);
    await page.waitForFunction((f) => window.__sim.frames >= f + 2, f);
    await shot(name);
  };
  const release = () => page.evaluate(() => { window.__sim.paused = false; window.__sim.view.mode = 'fpv'; window.__sim.reset(); });
  await view(-80, 36, -50, 0, 55, '56-m6b-tower-shadow-from-above');
  await view(3, 2.5, -7, 90, 0, '57-m6b-line-of-sight-quad-and-its-shadow', 'los');
  await release();

  // Graphics setting: High on a first visit, Low is saved and survives a reload, the panel shows the frame rate.
  await page.goto(url + '?free&preset=freestyle');
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  const hi = await page.evaluate(() => ({ q: window.__sim.quality, aa: window.__sim.renderer.getContext().getContextAttributes().antialias, sel: document.getElementById('quality').value }));
  await view(0, 9, -60, 180, 0, '58-m6b-high-quality-sun-and-sky');
  await view(-20, 14, 8, 20, 35, '59-m6b-high-quality-field-and-shadows');
  await view(-14, 0.8, -4, -35, 20, '60-m6b-high-quality-low-over-the-grass');
  await page.waitForFunction(() => window.__sim.fps > 0, null, { timeout: 30000 });
  const fpsText = await page.textContent('#fps');
  await release();
  await Promise.all([page.waitForNavigation(), page.selectOption('#quality', 'low')]);
  await page.waitForFunction(() => window.__sim && window.__sim.ready);
  const lo = await page.evaluate(() => ({ q: window.__sim.quality, aa: window.__sim.renderer.getContext().getContextAttributes().antialias, sel: document.getElementById('quality').value, saved: localStorage.getItem('fpvsim.quality.v1') }));
  check('M6b Graphics: High by default (smooth edges), Low is saved and applied after the reload; frame rate shown', hi.q === 'high' && hi.aa && hi.sel === 'high' && lo.q === 'low' && !lo.aa && lo.sel === 'low' && lo.saved === 'low' && /^\d+ fps$/.test(fpsText), `(${fpsText} in software GL on high)`);
  await shot('61-m6b-graphics-low');
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}

const simErrors = await page.evaluate(() => window.__sim.errors);
check('no page errors', problems.length === 0 && simErrors.length === 0, JSON.stringify([...problems, ...simErrors]));

await browser.close();
server.close();
console.log(failed ? 'FLIGHT SCRIPT FAILED' : `flight script passed, screenshots in proof/${milestone}/`);
process.exit(failed ? 1 : 0);
