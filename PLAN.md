# PLAN — FPV drone simulator

**Owner:** Mike. **Built by:** a relay of cloud sessions (see `RELAY.md`).
**Goal:** a browser sim to **learn to fly FPV** before his real drone exists. Must feel like a real quad to a pilot. Done today.

## Fixed decisions (Mike, 2026-11-16) — never reopen
- Purpose: learning to fly FPV.
- Input: a controller (game controller via the browser Gamepad API). Keyboard as backup.
- Drone: a typical 5-inch freestyle FPV quad.
- World: open field with a few gates.
- Platform: browser, opens from a link, no install. Public repo, live on GitHub Pages.
- Tech: vanilla JS + ES modules, **no build step**. three.js vendored into `vendor/` (no CDN).
- Physics feel matters more than graphics.

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
- **M6 Beginner path: "if someone hands you a real drone, you can fly it with confidence."** Beginner-first, not racer-first. Keep explanations to one line each; no battery or throttle-detail lessons (Mike, 2026-11-16).
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

## Definition of done
Mike opens the live link, plugs in a controller, maps it in under a minute, and the flying feels right. A beginner can go from zero to the "real-drone ready" badge, and free laps. Every milestone has screenshots in `proof/Mx/` from the automated flight script.
