# PROGRESS — the relay's log (newest at the bottom)

Status: **IN PROGRESS**
Next: M4
Live link: https://mickethegeek.github.io/fpv-sim/ (not checkable from the cloud sandbox, see Assumptions)

## Milestones
- [x] M0 Scaffold
- [x] M1 Physics core
- [x] M2 Controller input
- [x] M3 FPV view + world  ← Mike notified
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
- GitHub Pages could not be switched on through the API; Mike is turning it on by hand (told to the relay at 09:55 UTC). The live link may not be up yet.
- Arming follows Betaflight: refused while throttle is above 10 %, with an on-screen hint. On a sprung gamepad stick (rests at 50 %) the pilot pulls throttle down to arm. An arm switch that is already on at page load or after a crash must be flipped off and on. Change `ARM_THROTTLE_MAX` in `src/input.js`.
- A "standard"-layout gamepad works without setup (Mode 2: left stick throttle/yaw, right stick pitch/roll, A arm, Y angle/acro, B reset). Anything else (USB radios) goes through the setup screen. Arm and mode can each be a push button, a held switch or a switch on an axis.
- Keyboard: W/S move the throttle and it stays put; arrows and A/D spring back. First connected controller wins over the keyboard.
- M2 was verified with a simulated controller (the page's `navigator.getGamepads` replaced in Chrome), not real hardware: the sandbox has no USB. Mike's real controller is the first true test.
- FOV setting is the horizontal field of view, 115° (82.9° vertical at 16:9). Uptilt 25°. Both are PLAN.md values, not sourced; in `view` in `src/main.js` until M6 adds settings.
- Any touch of a tree, pole or building is a crash. Crash → 1.5 s pause → back on the pad, disarmed (`CRASH_PAUSE` in `src/main.js`).
- Extra key C toggles an outside (chase) view: useful for a beginner to see what the quad is doing. The side panel fades out while armed.
- The area around (0, -70), radius 62 m, is kept free of trees for the M4 gate course (`CLEAR` in `src/world.js`).

## Notes for the next leg
- Run: `npm test` (11 unit tests), `node test/mutations.mjs` (proof each test fails on a broken model, 13 breakages), `node test/flight.mjs Mx` (browser, screenshots to proof/Mx/; add your milestone's steps after the M1 block).
- Stick conventions are in the header of `src/flightcontroller.js`: pitch + = stick forward = nose down; throttle 0..1.
- Input: `src/input.js` (mapping, wizard state machine, `InputManager`), `src/setup.js` (setup screen). `main.js` copies `input.update()` into `sticks` each frame unless the flight script has taken over (`__sim.setSticks`); `__sim.useInput()` hands control back. Crash handling in `main.js` is minimal (hint + R): M3 owns crash → pause → reset.
- World: `src/world.js` is plain data + `hit()` (unit-tested); `src/scene.js` draws it. Add gates to both. `__sim.place(x, y, z, yawDeg)` puts the quad in the air for tests and lessons.
- Software GL in the sandbox is slow (6 fps with anisotropic filtering, 18 fps with `?fast`, which the flight script uses). The sim then runs slower than real time, so the flight script waits in sim time (`simWait`, `fly`), never wall-clock. Full script takes about 70 s. Real frame rate on a GPU is unmeasured: M7's 60 fps check has to be done by Mike or stated as unverified.
- Gotcha found in M3: fog renders wrong on giant two-triangle planes when the camera is near the ground; ground planes are subdivided for that reason. Look at the on-the-pad screenshot after touching the ground.
- M3 message to Mike was sent at the end of this leg, including what to do if the live link 404s.

## Log
- 2026-11-16 09:46 UTC · M0 done: scaffold, vendored three.js r170, `npm test` (node unit tests), `node test/flight.mjs Mx` (Chrome flight script → proof/Mx/), static server in tools/ · next: M1 physics core
- 2026-11-16 09:55 UTC · M1 done: physics.js, flightcontroller.js (Actual rates, angle + acro, rate PID, mixer), sim.js, params.js; 11 unit tests pass and each fails on at least one deliberate breakage (test/mutations.mjs: thrust x0 fails 7 of 11); flown in Chrome (proof/M1/) · next: M2 controller input
- 2026-11-16 10:00 UTC · M2 done: Gamepad API input, setup screen (axes, inversions, arm/mode button or switch), deadzone, Mode 2 default, localStorage in try/catch, keyboard fallback with on-screen keys, arm rules; 20 unit tests, browser proof with keyboard and a simulated USB radio (proof/M2/) · next: M3 FPV view + world
- 2026-11-16 10:18 UTC · M3 done: FPV camera (25° uptilt, 115° horizontal FOV), field with grass grid, trees, banded poles, buildings, sky and fog, obstacle collisions, crash → pause → reset, reset button, HUD; 23 unit tests, 44 browser checks (proof/M3/) · next: M4 gates + timer
