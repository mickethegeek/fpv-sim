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
- **M5 Real-life mechanics, gamified** (Mike, 2026-11-16: the goal is to learn to fly a *real* one, so gamify real mechanics, not just tutorials). Build in this order; if time runs out, cut from the bottom and say so in M7.
  1. **Skill meters with consistency gating.** Skills in the order real pilots learn them: hover, orbit around a pole, figure-8, gates at speed. Score each one from measured data: altitude and position variance, stick smoothness (jerk), line accuracy. A skill unlocks after **3 good attempts in a row**, not one lucky pass, because consistency is what transfers. Angle mode first, acro after.
  2. **Battery.** One pack lasts about 3–5 minutes (cite it). Voltage sags under punch-outs, thrust drops as the pack empties, and landing below a safe voltage scores as a damaged pack. A session is **4 packs**, like a real day at the field.
  3. **Crash wallet.** Crashes cost real-world part prices (props, arms, motors, camera), depending on impact speed and what was hit (cite the prices). Show money spent per session. This teaches real risk management, not just "reset".
  4. **Stick overlay + replay.** Live overlay of both sticks, as real pilots use with stick cams. After each attempt, a replay with an optional ghost of your best run.
  5. **Video like real FPV.** Fisheye distortion, slight noise, and breakup that grows with distance and when obstacles block the line of sight. Signal lost → failsafe → the drone drops. A video-latency setting (analog-like low vs digital-like higher).
  6. **Wind.** Steady wind plus gusts, settable. Optional "today's wind" setting: the browser fetches the live wind for Zurich from open-meteo.com at runtime (data, not a library, so it's allowed). Shows "would today be flyable?".
  7. **Real rules.** Swiss/EASA open category: soft ceiling at 120 m with a warning and score penalty, and a pre-flight checklist screen that includes the FPV observer rule (cite the EASA source).
  8. **Bring your real settings.** Paste a Betaflight `rateprofile` / CLI dump, and the sim uses those exact rates. Later the same rates go on the real drone.
- **M5b Lessons:** the 4 lessons from before become the first tier of the skill meters (hover box → 3 gates in angle → acro hover → acro lap).
- **M6 Settings + feel + look:** settings panel: rates, uptilt, FOV, mode, controller remap, wind, latency. One "5-inch freestyle" preset. Tune feel against the cited numbers. **Look**, in order of impact: sun with real shadows, sky lighting (hemisphere/environment light), ACES tone mapping, distance fog/haze, ground with detail at every scale (procedural textures, since asset sites aren't reachable from the sandbox), grass/clutter near the ground for speed and depth cues. Keep it at 60 fps on a MacBook Air: quality setting low/high.
- **M7 Finish:** 60 fps check, README (how to play, controls, how to connect a controller), final screenshot set in `proof/`, final report to Mike.

## Definition of done
Mike opens the live link, plugs in a controller, maps it in under a minute, and can do lesson 1 to 4 and free laps. Every milestone has screenshots in `proof/Mx/` from the automated flight script.
