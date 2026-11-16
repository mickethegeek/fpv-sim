// Proves the unit tests can fail: copies src/ and test/ to a temp dir, breaks the model one way at a time,
// reruns the tests, and reports which tests caught each breakage. Run: node test/mutations.mjs
// Exits non-zero if any test is never failed by any mutation (a test that cannot fail proves nothing).
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MUTATIONS = [
  ['thrust x0', 'src/physics.js', 'const t = p.maxThrustPerMotor * u', 'const t = 0 * p.maxThrustPerMotor * u'],
  ['gravity x0', 'src/physics.js', 'export const GRAVITY = 9.80665;', 'export const GRAVITY = 9.80665; const G0 = 0;', ['/ p.mass - GRAVITY;', '/ p.mass - G0;']],
  ['gravity x2', 'src/physics.js', '/ p.mass - GRAVITY;', '/ p.mass - 2 * GRAVITY;'],
  ['motor lag x20', 'src/params.js', 'motorTau: 0.033', 'motorTau: 0.6'],
  ['no thrust loss with airspeed', 'src/params.js', 'pitchSpeed: 65', 'pitchSpeed: 1e9'],
  ['rate PID off', 'src/params.js', 'kp: 120, ki: 30', 'kp: 0, ki: 0'],
  ['roll torque sign flipped', 'src/physics.js', 'tz += m.sx * d * f;', 'tz -= m.sx * d * f;'],
  ['max rate ignored', 'src/flightcontroller.js', 'Math.max(0, r.max - r.center)', '0'],
  ['angle mode never levels', 'src/flightcontroller.js', 'if (mode === MODES.ANGLE) {', 'if (false) {'],
  ['acro self-levels', 'src/flightcontroller.js', 'if (mode === MODES.ANGLE) {', 'if (true) {'],
  ['no ground', 'src/physics.js', 'if (s.pos[1] <= p.groundHeight) {', 'if (false) {'],
  ['never crashes', 'src/params.js', 'crashSpeed: 6', 'crashSpeed: 1e9'],
  ['quaternion not normalised + bad integration', 'src/physics.js', 'const n = 1 / Math.hypot(nx, ny, nz, nw);', 'const n = 1.0005;'],
];

function run(dir) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'test/unit/physics.test.mjs'], { cwd: dir, encoding: 'utf8' });
  const res = {};
  for (const m of r.stdout.matchAll(/^(not ok|ok) \d+ - (.*)$/gm)) res[m[2]] = m[1] === 'ok';
  return res;
}

const base = run(ROOT);
const names = Object.keys(base);
if (names.length === 0 || names.some((n) => !base[n])) { console.error('baseline tests must pass first'); process.exit(1); }
const caughtBy = Object.fromEntries(names.map((n) => [n, []]));

for (const [label, file, from, to, extra] of MUTATIONS) {
  const dir = mkdtempSync(join(tmpdir(), 'fpv-mut-'));
  cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(ROOT, 'test'), join(dir, 'test'), { recursive: true });
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  let text = readFileSync(join(dir, file), 'utf8');
  for (const [a, b] of [[from, to], ...(extra ? [extra] : [])]) {
    if (!text.includes(a)) { console.error(`mutation "${label}" no longer matches the source: ${a}`); process.exit(1); }
    text = text.replace(a, b);
  }
  writeFileSync(join(dir, file), text);
  const res = run(dir);
  const failed = names.filter((n) => res[n] !== true);
  failed.forEach((n) => caughtBy[n].push(label));
  console.log(`${label}: ${failed.length} of ${names.length} tests fail`);
  rmSync(dir, { recursive: true, force: true });
}

console.log('\nPer test, the breakages that make it fail:');
let bad = 0;
for (const n of names) {
  console.log(`- ${n}: ${caughtBy[n].join(', ') || 'NONE'}`);
  if (caughtBy[n].length === 0) bad++;
}
process.exit(bad ? 1 : 0);
