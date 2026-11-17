// M11: narrow windows (800x1273 seen on Mike's MacBook, and a phone width): HUD inside the window, menu and a card readable, no errors.
// node test/narrow.mjs [out]  (local copy)  ·  node test/narrow.mjs https://mickethegeek.github.io/fpv-sim/ [out]  (live site)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/npm-tools/node_modules/playwright')); }
import { serve } from '../tools/serve.mjs';
const live = process.argv[2] && process.argv[2].startsWith('http');
const { server, url: base } = live ? { server: null, url: process.argv[2] } : await serve(0);
const out = process.argv[live ? 3 : 2] || 'proof/M11';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const [w, h] of [[800, 1273], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(base + '?fast&gates'); await p.waitForFunction(() => window.__sim && window.__sim.ready, null, { timeout: 60000 });
  await p.evaluate(() => { window.__sim.arm(true); window.__sim.place(0, 2, -3); });
  await p.waitForTimeout(1500);
  const r = await p.$eval('#hud', (e) => { const b = e.getBoundingClientRect(); return [b.left, b.right]; });
  const st = await p.$eval('#hud-state', (e) => { const b = e.getBoundingClientRect(); return [b.left, b.right, e.textContent]; });
  console.log(w, 'hud', r.map(Math.round), 'state', st);
  await p.screenshot({ path: `${out}/narrow-${w}-gates.png` });
  await p.evaluate(() => window.__sim.menu.open('main')); await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/narrow-${w}-menu.png` });
  await p.evaluate(() => { window.__sim.menu.push('learn'); }); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#lesson-list button.deck[data-level=basics]').click()); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/narrow-${w}-card.png` });
  await p.close();
}
console.log('errors', JSON.stringify(errs));
await b.close(); if (server) server.close();
