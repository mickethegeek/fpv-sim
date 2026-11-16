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

await page.goto(url + '?fast'); // ?fast: no antialiasing or anisotropic filtering, 3x quicker in software GL; same sim and UI
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
  await page.click('#btn-setup');
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
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fpvsim.controller.v1')));
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
  check('M3 HUD shows armed, mode, throttle, speed', /ARMED/.test(hudText) && /ANGLE/.test(hudText) && /1[5-9]%/.test(hudText) && /km\/h/.test(hudText), `("${hudText.trim()}")`);
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
  check('M5 feel measured in Chrome: hover throttle 12 to 22 %', m.hoverThrottle > 0.12 && m.hoverThrottle < 0.22, `(${(m.hoverThrottle * 100).toFixed(1)} %)`);
  check('M5 acro full-stick roll reaches the configured rate without big overshoot', Math.abs(m.acro.roll.heldRate - m.acro.roll.target) < 15 && m.acro.roll.overshootPct < 10, `(held ${m.acro.roll.heldRate.toFixed(0)} deg/s, overshoot ${m.acro.roll.overshootPct.toFixed(1)} %)`);
  check('M5 angle mode holds its tilt and levels without swinging past', Math.abs(m.angle.held - m.angle.target) < 2 && m.angle.undershootDeg < 1 && m.angle.overshootPct < 5, `(held ${m.angle.held.toFixed(1)} of ${m.angle.target} deg, swing-back ${m.angle.undershootDeg.toFixed(2)} deg)`);
  // Plots: one page with every step response, rendered by Chrome and saved as proof.
  const plots = await browser.newPage({ viewport: { width: 1180, height: 1130 } });
  await plots.setContent(`<body style="margin:0;background:#fff;font-family:system-ui,sans-serif"><h1 style="font-size:18px;margin:12px 16px 4px">Feel: step responses measured in the browser sim (1 kHz physics)</h1><div style="display:grid;grid-template-columns:repeat(2,560px);gap:10px 20px;padding:8px 16px">${feel.svgs.map(([, svg]) => svg).join('')}</div></body>`);
  await plots.screenshot({ path: `${outDir}32-m5-feel-step-responses.png`, fullPage: true });
  await plots.close();
  check('M5 step-response plots saved', feel.svgs.length >= 8, `(${feel.svgs.length} plots)`);
}

const simErrors = await page.evaluate(() => window.__sim.errors);
check('no page errors', problems.length === 0 && simErrors.length === 0, JSON.stringify([...problems, ...simErrors]));

await browser.close();
server.close();
console.log(failed ? 'FLIGHT SCRIPT FAILED' : `flight script passed, screenshots in proof/${milestone}/`);
process.exit(failed ? 1 : 0);
