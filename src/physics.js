// Rigid-body quad physics. Pure functions, no DOM, runs in node and browser.
// Filled in by M1. Conventions (fixed here so every leg agrees):
//   World frame: three.js style, Y up, right-handed. Units SI (m, kg, s, rad).
//   Body frame:  +X right, +Y up (thrust axis), -Z forward (nose).
//   Orientation: unit quaternion [x, y, z, w], body -> world.
export const PHYSICS_HZ = 1000;
export const GRAVITY = 9.80665;
