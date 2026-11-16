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

const simErrors = await page.evaluate(() => window.__sim.errors);
check('no page errors', problems.length === 0 && simErrors.length === 0, JSON.stringify([...problems, ...simErrors]));

await browser.close();
server.close();
console.log(failed ? 'FLIGHT SCRIPT FAILED' : `flight script passed, screenshots in proof/${milestone}/`);
process.exit(failed ? 1 : 0);
