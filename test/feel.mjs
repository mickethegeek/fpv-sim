// node test/feel.mjs [outDir]  -> prints the feel measurements; with outDir also writes one SVG plot per step response.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createSim, simSteps } from '../src/sim.js';
import { attitude } from '../src/physics.js';
import { measureFeel, traceSvg, feelRows } from './feel-measure.mjs';

const m = measureFeel({ createSim, simSteps, attitude });
for (const [k, v] of feelRows(m)) console.log(`| ${k} | ${v} |`);
const out = process.argv[2];
if (out) {
  mkdirSync(out, { recursive: true });
  for (const [name, tr] of Object.entries(m.traces)) writeFileSync(`${out}/${name}.svg`, traceSvg(name, tr));
  console.log(`plots written to ${out}/`);
}
