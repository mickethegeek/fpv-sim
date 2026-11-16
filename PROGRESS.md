# PROGRESS — the relay's log (newest at the bottom)

Status: **IN PROGRESS**
Next: M5 Feel, in progress. Done: measurement harness, `docs/feel.md` scoreboard, rate loop + angle mode + motor lag tuned. Left, in this order: (1) hover throttle decision and PlayStation throttle mid (notes 2 in `docs/feel.md`), (2) Feel tuning panel with sliders and Reset to default, (3) input path review (deadzone for PS sticks), (4) update `docs/physics.md` statuses from the new sources in `docs/feel.md`, then tick M5.
Live link: https://mickethegeek.github.io/fpv-sim/ (not checkable from the cloud sandbox, see Assumptions)

## Milestones
- [x] M0 Scaffold
- [x] M1 Physics core
- [x] M2 Controller input
- [x] M3 FPV view + world  ← Mike notified
- [x] M4 Gates + timer
- [ ] M5 Feel (top priority)
- [ ] M6 Beginner path + line-of-sight view
- [ ] M6b Look (if time)
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
- The area around (0, -70), radius 62 m, is kept free of trees for the gate course (`CLEAR` in `src/world.js`); M4 added a third clear zone for the last turn past the pad, which moved some trees.
- Gates are 3.0 m wide x 2.4 m tall openings standing on the ground, about twice a standard 5 ft race gate (cited in `docs/physics.md`), so a beginner gets through. Change `GATE_W`, `GATE_H` in `src/course.js`.
- Course: 7 gates, clockwise, gate 1 straight ahead of the pad and also the start/finish line. The clock starts on the first pass of gate 1 (flying start, like a race). Layout is `LAYOUT` in `src/course.js`.
- Touching a gate frame is a crash, like every other obstacle. Flying past or over a gate just does not count: it stays "next" until flown through in the right direction.
- A crash or reset throws the current lap away; the best lap is kept (localStorage key `fpvsim.bestlap.field-7.v1`).
- Lap times use sim time, so a slow computer does not change them.
- Added without being asked: a small guide at the top of the screen while armed (arrow toward the next gate + distance), because a beginner loses the next gate easily.

- Feel tuning (M5): rate PID `kp` 120, `kd` 1.5 and angle gain 10, chosen by scanning against the targets in `docs/feel.md` (45 ms to 90 % rate, 200 ms lean, no wobble). The 200 ms lean target is a judgement, not sourced. Change in `defaultFc()`.
- Motor lag 33 ms, mass, arm, thrust-to-weight, angle limit, linear drag and top speed now all have sources (listed in `docs/feel.md`).
- Hover throttle is 30 % against a cited 15 to 20 % for a powerful 5-inch: left as is until the thrust-versus-command curve is sourced.

## Notes for the next leg
- After any physics or controller change: `node test/feel.mjs` and update the tables in `docs/feel.md`.
- Run: `npm test` (38 unit tests), `node test/mutations.mjs` (proof each test fails on a broken model, 13 breakages), `node test/flight.mjs Mx` (browser, screenshots to proof/Mx/; add your milestone's steps after the M1 block).
- Stick conventions are in the header of `src/flightcontroller.js`: pitch + = stick forward = nose down; throttle 0..1.
- Input: `src/input.js` (mapping, wizard state machine, `InputManager`), `src/setup.js` (setup screen). `main.js` copies `input.update()` into `sticks` each frame unless the flight script has taken over (`__sim.setSticks`); `__sim.useInput()` hands control back. Crash handling in `main.js` is minimal (hint + R): M3 owns crash → pause → reset.
- World: `src/world.js` is plain data + `hit()` (unit-tested); `src/scene.js` draws it. Add gates to both. `__sim.place(x, y, z, yawDeg)` puts the quad in the air for tests and lessons.
- Software GL in the sandbox is slow (6 fps with anisotropic filtering, 18 fps with `?fast`, which the flight script uses). The sim then runs slower than real time, so the flight script waits in sim time (`simWait`, `fly`), never wall-clock. Full script takes about 70 s. Real frame rate on a GPU is unmeasured: M7's 60 fps check has to be done by Mike or stated as unverified.
- Gotcha found in M3: fog renders wrong on giant two-triangle planes when the camera is near the ground; ground planes are subdivided for that reason. Look at the on-the-pad screenshot after touching the ground.
- M3 message to Mike was sent at the end of the M3 leg, including what to do if the live link 404s.
- Course and lap timer: `src/course.js` (pure: gates, `gateCrossing`, `gateHit`, `createRace`/`raceUpdate`/`resetRace`, best-lap storage). `world.gates` are obstacles in `world.hit`. `scene.js` `buildGates()` draws them and `highlight(next)` recolours. `main.js` calls `raceUpdate` once per frame; `__sim.race` and `snapshot().race` expose it.
- `test/autopilot.mjs` flies the course in angle mode from quad state to sticks (about 50 s a lap). Use it for lesson pass-condition tests: unit test in node, and in the browser via `import(url + 'test/autopilot.mjs')` (see the M4 block in `test/flight.mjs`).
- `node test/flight.mjs Mx M4` runs only one block (quick reruns); without the second argument it runs everything (about 150 s).
- Open-loop test flying: hover is about 30 % throttle; 31 % with 0.3 forward pitch holds height roughly. More than that climbs over the gates.

- For M6 lessons: `src/skills.js` already has the "3 good runs in a row" gating (`recordResult`, `isUnlocked`, storage), an attempt recorder at 50 Hz, tasks for hover-in-a-box, orbit a pole, figure 8 and a gate lap, and scoring from drift, height wobble, line and stick jerk (`scoreAttempt`). It is unit-tested (`test/unit/skills.test.mjs`) but **not wired into the page yet** and its skill list follows the old plan: M6 must reshape the list to the 8 lessons in PLAN.md. `test/autopilot.mjs` has test pilots (`createHoverPilot`, `createCirclePilot`, `createAutopilot`, `steer`) to fly lessons in tests.

## Log
- 2026-11-16 09:46 UTC · M0 done: scaffold, vendored three.js r170, `npm test` (node unit tests), `node test/flight.mjs Mx` (Chrome flight script → proof/Mx/), static server in tools/ · next: M1 physics core
- 2026-11-16 09:55 UTC · M1 done: physics.js, flightcontroller.js (Actual rates, angle + acro, rate PID, mixer), sim.js, params.js; 11 unit tests pass and each fails on at least one deliberate breakage (test/mutations.mjs: thrust x0 fails 7 of 11); flown in Chrome (proof/M1/) · next: M2 controller input
- 2026-11-16 10:00 UTC · M2 done: Gamepad API input, setup screen (axes, inversions, arm/mode button or switch), deadzone, Mode 2 default, localStorage in try/catch, keyboard fallback with on-screen keys, arm rules; 20 unit tests, browser proof with keyboard and a simulated USB radio (proof/M2/) · next: M3 FPV view + world
- 2026-11-16 10:18 UTC · M3 done: FPV camera (25° uptilt, 115° horizontal FOV), field with grass grid, trees, banded poles, buildings, sky and fog, obstacle collisions, crash → pause → reset, reset button, HUD; 23 unit tests, 44 browser checks (proof/M3/) · next: M4 gates + timer
- 2026-11-16 10:38 UTC · M4 done: 7-gate course, next gate highlighted orange, gate frames solid, lap timer with flying start, best lap saved and shown, guide arrow to the next gate; 29 unit tests incl. autopilot flying two laps on the real physics, 64 browser checks incl. a full lap in Chrome (proof/M4/) · next: M5 learning path
- 2026-11-16 10:44 UTC · built for the old M5 plan (skill meters), logic only: `src/skills.js` (8 skills, attempts recorded at 50 Hz, scored from drift, height wobble, line, lap time, stick jerk; next skill unlocks after 3 good attempts in a row), test pilots for hover, circles and laps, 38 unit tests · the plan then changed (M5 is now Feel); this logic is kept for the M6 lessons · next: M5 Feel
- 2026-11-16 10:48 UTC · M5 started: `test/feel-measure.mjs` + `node test/feel.mjs` (step responses on the real sim), same measurement in Chrome with plots (proof/M5/32), `docs/feel.md` with sourced targets against measured values. Findings: rate loop too slow (93 ms to 90 %), hover throttle high (30 % against 15 to 20 %), angle mode soft (411 ms) · next: tune the rate loop
- 2026-11-16 10:52 UTC · M5 tuning: rate loop 93 → 45 ms to 90 % (5 % overshoot), angle mode lean 411 → 202 ms with no overshoot, motor lag set to the cited 33 ms; 38 unit tests, 68 browser checks, plots in proof/M5/ · next: hover throttle + PS throttle mid, then the Feel tuning panel
