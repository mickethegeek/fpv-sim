# PROGRESS — the relay's log (newest at the bottom)

Status: **IN PROGRESS**
Next: M2
Live link: https://mickethegeek.github.io/fpv-sim/ (not checkable from the cloud sandbox, see Assumptions)

## Milestones
- [x] M0 Scaffold
- [x] M1 Physics core
- [ ] M2 Controller input
- [ ] M3 FPV view + world  ← notify Mike when done
- [ ] M4 Gates + timer
- [ ] M5 Learning path
- [ ] M6 Settings + feel
- [ ] M7 Finish  ← notify Mike when done

## Assumptions made without asking Mike
(one line each: what, why, how to change it)
- Live link is assumed to be https://mickethegeek.github.io/fpv-sim/ (Pages from `main` root). The relay sandbox cannot reach github.io or the Pages API (proxy 403), so no leg can confirm it is switched on. If the link 404s: repo Settings → Pages → Deploy from branch → `main` / root. Tell Mike this in the M3 message.
- three.js r170 vendored as `vendor/three.module.min.js` (latest stable fetched from npm). Change by replacing the file.
- Axis conventions fixed in the header of `src/physics.js` (Y up, body -Z forward, quaternion [x,y,z,w]). Everything else follows them.

- Mass 0.68 kg, thrust-to-weight 9, arm 0.11 m, motor lag 30 ms are PLAN.md starting values with no source found yet (marked "uncited" in `docs/physics.md`). Inertia, linear drag, yaw torque, rates and the 150 km/h top speed are cited. M6 should source the rest. Change in `src/params.js`.
- Top speed is limited by prop thrust falling with airspeed (one tuned number, `pitchSpeed`), not by heavy body drag, so the quad coasts when throttle is cut. Sim gives 148 km/h level.
- Rate PID is in physical units, tuned to the cited rates; Betaflight's own PID numbers are not copied (they depend on its filters). Change gains in `defaultFc()`.
- Angle mode max tilt is Betaflight's default 60°. M6 settings can offer a gentler value for lessons.
- Crash = touching the ground faster than 6 m/s or more than 60° from upright. Change `crashSpeed` in `src/params.js`.
- Until M3 the page shows a chase camera and a placeholder quad model; `window.__sim` is the test hook (set sticks, arm, mode, snapshot) and `sticks` in `src/main.js` is where M2 plugs in the controller.

## Notes for the next leg
- Run: `npm test` (11 unit tests), `node test/mutations.mjs` (proof each test fails on a broken model, 13 breakages), `node test/flight.mjs Mx` (browser, screenshots to proof/Mx/; add your milestone's steps after the M1 block).
- Stick conventions are in the header of `src/flightcontroller.js`: pitch + = stick forward = nose down; throttle 0..1.
- Software GL in the sandbox renders about 25 fps; the sim caps catch-up at 50 ms per frame, so browser tests assert on state, not on wall-clock timing.

## Log
- 2026-11-16 09:46 UTC · M0 done: scaffold, vendored three.js r170, `npm test` (node unit tests), `node test/flight.mjs Mx` (Chrome flight script → proof/Mx/), static server in tools/ · next: M1 physics core
- 2026-11-16 09:55 UTC · M1 done: physics.js, flightcontroller.js (Actual rates, angle + acro, rate PID, mixer), sim.js, params.js; 11 unit tests pass and each fails on at least one deliberate breakage (test/mutations.mjs: thrust x0 fails 7 of 11); flown in Chrome (proof/M1/) · next: M2 controller input
