# PLAN — FPV drone simulator

**Owner:** Mike. **Built by:** a relay of cloud sessions (see `RELAY.md`).
**Goal:** a browser sim to **learn to fly FPV** before his real drone exists. Must feel like a real quad to a pilot. Done today.

## Fixed decisions (Mike, 2026-11-16) — never reopen
- Purpose: learning to fly FPV.
- Input: a controller (game controller via the browser Gamepad API). Keyboard as backup.
- **Mike's controller is a PlayStation controller** (DualShock 4 or DualSense) for now (2026-11-16). Make it work perfectly with no setup: standard mapping, Mode 2 (left stick = throttle + yaw, right stick = pitch + roll).
  - **Throttle on a spring-centred stick:** the left stick snaps back to the middle, unlike a real radio. Default mapping: stick bottom = 0%, top = 100%, and a **throttle mid** setting so the centred stick gives about hover throttle in angle mode. So letting go means "roughly hover", not "climb". Setting: throttle mid (default ≈ hover), throttle expo.
  - Stick deadzone tuned for PS sticks (small, adjustable). Arm on a shoulder button, mode switch on another, reset on Options; show the button names as PlayStation symbols.
  - In the beginner path, one line in lesson 1: "On a real radio the throttle stays where you leave it."
  - Keep the setup screen for other controllers. **Mike will soon get a BetaFPV LiteRadio** (a real radio that shows up as a USB joystick, not a standard gamepad). When a non-standard controller connects, open the setup screen automatically. Radios have a non-centring throttle: for them, map throttle linearly (no "throttle mid = hover" default) and save a separate profile per controller, so the PS controller and the radio each keep their own settings.
- Drone: a typical 5-inch freestyle FPV quad.
- World: open field with a few gates.
- Platform: browser, opens from a link, no install. Public repo, live on GitHub Pages.
- Tech: vanilla JS + ES modules, **no build step**. three.js vendored into `vendor/` (no CDN).
- Physics feel matters more than graphics.
- **Everything comes from real-life data** (Mike, 2026-11-16: "everything should be real life data. the angle flip, the speed, the pace, the throttling"). No number is tuned by feel or picked because it looks right.
  - Every physical and flight-controller parameter has a row in `docs/feel.md` or `docs/physics.md`: value, real-world source (link), and the sim's measured value. A parameter with no source is marked **UNSOURCED** in red and listed in the M7 report.
  - Where sources disagree, give the range and use the middle, unless a source measured the exact kind of quad (5-inch freestyle, 6S) — then use that.
  - Preferred sources, best first: (1) **real flight logs** (Betaflight blackbox logs of 5-inch quads, or research datasets of real FPV flights with stick inputs and gyro data), (2) published bench measurements (motor/prop thrust tables, load-cell tests), (3) Betaflight defaults and docs, (4) reviews and guides.
  - **Validate against a real flight** if any log with stick inputs + gyro can be obtained (GitHub-hosted blackbox logs, or datasets reachable from the sandbox): replay the logged sticks through the sim and compare roll/pitch/yaw rates and throttle response with the logged ones; put the overlay plots in `proof/validation/`. If no log is reachable, say so in M7 and list where Mike could get one.
  - The Trainer preset follows the same rule: model it on a real beginner-class quad with published specs.

## Physics model (research and cite the real numbers in `docs/physics.md`)
Look up typical values with sources; the numbers below are starting points, not facts.
- Rigid body, 6 degrees of freedom, fixed timestep (e.g. 1 kHz physics, render at display rate).
- 5-inch quad: ~0.6–0.7 kg with battery, X frame, motor arm ~0.11 m, thrust-to-weight ~8–10.
- Per motor: thrust ∝ (motor speed)², first-order motor lag (~20–40 ms time constant), yaw from reaction torque.
- Drag: linear + quadratic body drag, so level top speed lands around 120–160 km/h.
- Gravity, ground and obstacle collisions, crash on hard impact.
- Flight controller like Betaflight: stick → target rotation rate via **Actual rates** (center rate, max rate, expo, Betaflight's defaults), PID on angular rate, motor mixer, throttle.
- **Angle mode** (self-levelling, max tilt) for beginners, **Acro mode** (rate) for real FPV. Toggle.

## Milestones (do in order; tick in PROGRESS.md)
- **M0 Scaffold:** `index.html`, vendored three.js, `src/` modules, `test/` with node unit tests and a Playwright flight script using `/usr/bin/google-chrome` (args `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`). GitHub Pages serves `main` root. Live link works.
- **M1 Physics core:** `src/physics.js` + `src/flightcontroller.js`, pure functions, no DOM. Unit tests: free fall = g; hover throttle in a sane range (~20–35%); a full-stick roll reaches the configured max rate within ~0.2 s; no NaN after 60 s of random sticks; top speed in range. Each test must **fail** on a deliberately broken model (e.g. thrust ×0) — prove it once and note it.
- **M2 Controller input:** Gamepad API, setup screen ("move throttle up", "move roll right"...) that maps axes and inversions, deadzone, Mode 2 default, saved in localStorage (wrapped in try/catch). Arm/disarm button. Keyboard fallback (document keys on screen).
- **M3 FPV view + world:** camera fixed to the quad with uptilt (default 25°), FOV ~110–120°. Open field: textured ground with scale cues (grass grid, trees, poles, a few buildings), sky. Crash → short pause → reset. Reset button. Minimal HUD (armed, mode, throttle, speed).
  → **FIRST FLYABLE: notify Mike** (see RELAY.md).
- **M4 Gates + timer:** a 6–8 gate course, gate highlight for next gate, lap timer, best lap saved.
- **M5 Feel (top priority).** Mike: "the feel needs to be perfect." Feel beats every other feature, so spend the time here.
  - Measure it, don't guess. Write `docs/feel.md` with each target, its source, and the sim's measured value: stick-to-rotation response time, hover throttle, how fast it stops a roll, momentum and drift after letting go, top speed, how it falls with zero throttle, motor lag. Use Betaflight defaults and published 5-inch data; cite everything.
  - Input path: read the gamepad every frame, no smoothing beyond Betaflight-style rates and expo, deadzone small. Physics stays at 1 kHz, and no frame drop changes the physics.
  - Angle mode must feel like a real beginner quad: self-levels, holds its tilt limit, no wobble.
  - One "Feel tuning" panel with a few named sliders (rates, expo, responsiveness, floatiness) and **Reset to default**.
  - Prove it with the browser script: step inputs, plotted responses saved to `proof/M5/`.
- **M6 Beginner path** — first, check that every PS-controller item under "Fixed decisions" is done; if not, do those first. **Goal: "if someone hands you a real drone, you can fly it with confidence."** Beginner-first, not racer-first. Keep explanations to one line each; no battery or throttle-detail lessons (Mike, 2026-11-16).
  - Live **stick overlay** on screen, always available.
  - Lessons, each passed only after **3 good runs in a row** (measured, not one lucky pass):
    1. Take off, hover in a box, land gently.
    2. Hover facing 4 directions, including **nose toward you**, where the controls feel reversed. That's the classic beginner failure with a real drone.
    3. Slow turns, an orbit around a pole, a figure 8.
    4. Fly out, turn around, come back and land on the pad.
    5. The same with light wind.
    6. Emergencies: disarm instantly, and recover when you lose orientation.
    7. Acro intro (only after 1–6).
    8. **"Ready" check:** one run combining lessons 1–6 → a "real-drone ready" badge.
  - **Two views:** FPV (default), and **line-of-sight**: you stand on the ground and watch the drone, which is how most people fly a real drone handed to them. Lessons 1–4 are done in both views.
  - Gates and free flight stay unlocked.
- **M6b Look** (only if M5 and M6 are done): sun with real shadows, sky lighting, tone mapping, haze, ground detail at every scale for speed and height cues, procedural textures. Quality setting low/high; keep 60 fps on a MacBook Air.
- **M7 Finish:** 60 fps check, README (how to play, controls, how to connect a controller), final screenshot set in `proof/`, final report to Mike.

## Decided by Mike on 2026-11-17 (do not build)
- No real-life consequences (crash wallet, battery, video breakup/failsafe in flight, live wind, 120 m ceiling).
- No Betaflight rates import.
- Trainer modelled on a real beginner quad: maybe later, not now.
- Real flight-log validation: not a priority.

## Phase 2: learn, then fly (Mike, 2026-11-16 evening)
Mike: the lessons test him but never teach him. "I need a bit more theory, less practice. What makes what what." But **not** a wall of text: "more like skip tutorial to access the gates, or just skip chapter, not to overlay everything but to allow the player to control where and what as a complete sim for beginner to advanced." English.

Rules for every M8–M11 change:
- **The player decides.** Nothing is locked. Every chapter, part and tutorial can be skipped; gates and free flight are one click from anywhere. Progress is shown, never required.
- **Show, don't tell.** Max 2 short sentences on screen at once. The sim does the explaining: slow motion, freeze, arrows.
- **No overlays the player didn't ask for** during free flight and gates. Helpers (force arrows, stick overlay, coaching) are toggles.
- Theory must match the sim's real physics (the arrows are the real forces from `physics.js`), and claims about real drones get a source in `docs/` like everything else.

- **M8 Menu and freedom.** A start menu: **Learn** (chapters), **Gates**, **Free fly**, **Settings**. Remove lesson locking. Fully usable with the PlayStation controller (D-pad to move, ✕ to select, ◯ back, Options = pause menu) and with mouse/keyboard. Pause menu with Skip, Restart, Back to menu.
- **M9 Chapters with theory.** Turn the 8 lessons into chapters. Each chapter has up to 4 parts, each skippable: **Learn** (1–4 cards; each card = one idea in ≤2 sentences + a live demo in the sim), **Watch** (the existing test pilot flies it with the stick overlay on), **Try** (the current lesson), **Check** (2–3 quick questions, optional). Concepts to cover, spread over the chapters where they're needed:
  1. How 4 props fly, tilt and turn (yaw from props spinning opposite ways).
  2. What each stick changes (show which motors speed up).
  3. Tilt = move; tilting also costs height, so you add throttle when you go forward.
  4. No brakes: momentum, drift, stopping by tilting back early.
  5. Angle vs acro: in acro the stick sets rotation speed, letting go keeps the angle. Show the rates curve.
  6. Orientation: controls are relative to the drone; why nose-in feels reversed.
  7. Coordinated turns: roll + yaw (+ a little pitch), like leaning a bike.
  8. Wind: the drone drifts with the air; lean into it.
  9. The FPV camera: why it's tilted up, and why the drone flies tilted.
  10. Safety on a real field: arm only when ready, disarm the moment you crash, props, failsafe, the observer rule.
  A **Theory** page in the menu lists every card, so the player can revise any time.
- **M10 Helpers.** Toggleable **force arrows** (thrust per motor, gravity, velocity) usable anywhere, including free flight. **Coaching**: after a failed Try, one line saying why, computed from the flight data ("you drifted left: you held roll too long, release earlier"). In the Learn camera, uptilt starts at a beginner value (guides: 10–15°; cite) and the setting stays the player's.
- **M10b Demo fixes** (orchestrator, 2026-11-17; flagged by the M9 leg, never done because that leg died): (1) nose-toward-you demos: make the nose unmistakable (bigger quad in demos, bright nose marker, camera placed so the direction is obvious); (2) per-motor arrows during a tilt: hold the moment (freeze or much slower) and label which motors speed up; (3) "stop early": show two speeds so the longer stopping distance at speed is visible.
- **M10d Yaw climb + stick patterns** (Mike, 2026-11-17, flying lesson 2 as a beginner: "when I turn I shoot up, I compensate, I go all over the place. the video helped A LOT but some theory still isnt clear... I just need the patterns of combinations of the sticks... As a beginner, I dont know that ill shoot up keeping the same thrust just turning").
  1. **Yaw climb, check against real data first.** The orchestrator measured it on the sim: from a hover, yaw alone with the throttle stick unchanged climbs 0.5 m in 2 s at no yaw, 1.9 m at half yaw, **5.2 m at full yaw**. Cause in the model: two motors speed up and two slow down, and with thrust ∝ command^1.35 the total thrust rises. Find out how much a real 5-inch on Betaflight actually climbs or drops on a yaw (Betaflight mixer and yaw authority docs, airmode, pilot reports, flight logs if any). If the sim overstates it, fix the model (cite the source). If it's real, keep it, and teach it.
  2. **Thumb coupling on the PlayStation stick.** Throttle and yaw share the left stick, so a sideways push easily drifts up too. Measure it in the stick overlay (show the throttle value live) and teach it; don't add assists a real radio doesn't have.
  3. **Stick patterns.** What resonates with Mike: the *combinations*. For every manoeuvre in the lessons, a pattern card: both sticks drawn, animated in sync with the demo, plus **what happens if you forget one part** (e.g. turn on the spot = yaw only and hold the throttle height; forget it and you climb). Patterns at least for: hover, climb/descend, turn on the spot, fly forward (forward + a little more throttle), stop, nose-in hover, coordinated turn (roll + yaw same side + a bit of throttle), orbit. Show the pattern again in Try as a small reminder (toggle). Add a **Stick patterns** page to the menu next to Theory. Max 2 sentences per card; the animation does the rest.
- **M10e Curriculum: from zero to understanding motor thrust** (Mike, 2026-11-17: "you know its like basics. how to turn, how to go backwards, how to go down... the goal is really to go from 0 to understanding motor thrust. and for that to work the physics need to be impeccably researched, but also taught."). Reorganise Learn into levels; every card keeps two layers: **the pattern** (what to do with the sticks) and a one-tap **"Why? (motors)"** layer showing which motors speed up or slow down and the resulting forces, drawn from the real physics.
  - **Level 1, the basics, one move each:** up, down, turn left/right, forward, backward, sideways, stop, hover. Each: pattern + motors.
  - **Level 2, combinations:** forward + throttle, banked turn, orbit, nose-in, wind.
  - **Level 3, the physics:** thrust vs throttle (the measured curve, why hover sits near 15 %), thrust tilt = horizontal force and lost lift, yaw from prop torque (and why it changes height), momentum and drag (why there are no brakes), **going down** (why descending fast is hard: falling into your own prop wash. Not modelled yet: research it, model it if a sourced model exists, otherwise teach it honestly as "the sim doesn't do this yet").
  - **Level 4, acro.**
  - Existing chapters, demos and stick patterns (M10d) are reused, not rebuilt; this is mainly order, the motors layer, and the missing basics.
- **M10f Independent physics review.** A leg that did not build the physics audits it cold: every model parameter and every factual sentence on a card is checked against a primary source; anything wrong is fixed, anything unsourceable is marked UNSOURCED and listed in REPORT.md. Its findings go in `docs/review.md`.
- **M10c Replay** (Mike, 2026-11-17: "replay keep for the end"): after any run (lesson Try, gates lap, free flight), watch it back with the stick overlay, from FPV, line of sight or chase view, with play/pause/scrub and slow motion. Optional ghost of your best gates lap. The last feature before the finish.
- **M11 Finish phase 2.** **New (orchestrator, 2026-11-17): the cloud machine can now reach `mickethegeek.github.io`.** Check the live site itself after the final push (it loads, menu works, no console errors), not only the local copy. Measured on Mike's MacBook Air (Apple M4) in his desktop app: 60 fps in free flight, so the frame-rate question is answered. Also seen there: in a narrow, tall window (800×1273) the HUD bar is cut off on the left ("ARMED" shows as "MED"); make the HUD and menus fit narrow windows. Every chapter checked in Chrome (cards, demo, watch, try, check, skip at each step, controller navigation), README and REPORT updated, notify Mike.

## Definition of done
Mike opens the live link, plugs in a controller, maps it in under a minute, and the flying feels right. A beginner can go from zero to the "real-drone ready" badge, and free laps. Every milestone has screenshots in `proof/Mx/` from the automated flight script.
