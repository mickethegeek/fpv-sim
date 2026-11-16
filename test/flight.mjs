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

// --- milestone steps go here (M1+) ---

const simErrors = await page.evaluate(() => window.__sim.errors);
check('no page errors', problems.length === 0 && simErrors.length === 0, JSON.stringify([...problems, ...simErrors]));

await browser.close();
server.close();
console.log(failed ? 'FLIGHT SCRIPT FAILED' : `flight script passed, screenshots in proof/${milestone}/`);
process.exit(failed ? 1 : 0);
