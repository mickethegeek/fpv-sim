import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS_HZ, GRAVITY } from '../../src/physics.js';
import { MODES } from '../../src/flightcontroller.js';

test('physics and flight controller modules load in node (no DOM)', () => {
  assert.equal(PHYSICS_HZ, 1000);
  assert.ok(Math.abs(GRAVITY - 9.80665) < 1e-9);
  assert.deepEqual(Object.values(MODES).sort(), ['acro', 'angle']);
});
