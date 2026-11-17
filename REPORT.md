# Final report (M7, 2026-11-16)

**Live link:** https://mickethegeek.github.io/fpv-sim/ · how to play and how to connect a controller: [`README.md`](README.md)

## What is built

| Milestone | What you get | Proof |
|---|---|---|
| M1 Physics | 5-inch quad, 6 degrees of freedom, 1000 steps per second, Betaflight-style rates, angle and acro mode | `proof/M1/` |
| M2 Controller | PlayStation controller with no setup, setup screen for USB radios, one saved profile per controller, keyboard backup | `proof/M2/` |
| M3 FPV + world | Camera on the quad (25° uptilt), field with trees, poles, buildings, crash and reset | `proof/M3/` |
| M4 Gates | 7-gate course, lap timer, best lap saved | `proof/M4/` |
| M5 Feel | Every flight number checked against a source, Trainer and Freestyle presets, Feel tuning panel | `proof/M5/`, `docs/feel.md` |
| M6 Beginner path | 8 lessons with 3 good runs in a row, line-of-sight view, stick overlay, wind, "real-drone ready" badge | `proof/M6/` |
| M6b Look | Sun and real shadows, sky, haze, ground detail, Graphics High / Low | `proof/M6b/` |
| M7 Finish | README, this report, final screenshot set | `proof/final/` |

## How it was checked

- 54 unit tests on the physics, controller logic, course and lessons. Each physics test was shown to fail on a deliberately broken model (`node test/mutations.mjs`).
- 103 checks in real Chrome, flown by a script: take-off, crashes, a full lap, the setup screen with a simulated USB radio, a simulated PlayStation controller, and all 8 lessons flown to the badge by a test pilot. Screenshots of the last full run are in `proof/final/`.

## What was not checked: please try these

1. **The live link.** The build sandbox cannot reach github.io. If the link gives a 404: repo Settings → Pages → Deploy from branch → `main` / root.
2. **Your real controller.** Only simulated controllers were used (the sandbox has no USB). First thing to try: plug in the PlayStation controller, press a button, pull the left stick down, press R1.
3. **The frame rate.** Not measurable here (the sandbox draws in software, 2 to 12 frames a second). What was measured: the physics costs 0.09 ms per frame, and a frame is 87 draw calls and about 32,000 triangles, which is light for any laptop graphics chip. The panel shows the frame rate next to "Graphics": if it reads under 60 on the MacBook Air, switch to Low and tell the next session.
4. **The feel, by hand.** Nobody has flown it with their hands. The lessons were flown by a test pilot in code only, so their limits may be too strict or too easy for a person.

## Numbers with no real-world source (UNSOURCED)

PLAN rule: every number from real-life data. These are the ones still without a source. Details in `docs/feel.md` (note 6) and `docs/physics.md`.

| Number | Value in the sim | Why it is open |
|---|---|---|
| Rate-loop response time | 45 ms to 90 % | Only third-party tuner thresholds found, no primary measurement |
| Angle-mode lean time | 200 ms | A judgement; no published figure |
| Yaw authority | 166 ms to 90 % | Follows from the motor model; not checked against a real quad |
| Falling speed with motors off | 60 km/h | No figure found |
| Quadratic body drag | 0.006 N per (m/s)² | Placeholder |
| Crash speed | 6 m/s | A choice |
| Gamepad stick deadzone | 5 % | No figure for PlayStation sticks; slider in the panel |
| Lesson limits | landing under 1.5 m/s, "slow" under 8 m/s, disarm within 1.0 s, heading within 20° | Judgements |
| Line-of-sight view | pilot 5 m behind the pad, 50° view, quad drawn 1.5x | Choices |
| Camera | 25° uptilt, 115° field of view | PLAN values; guides say 10 to 15° uptilt for beginners |
| Look | sun 46° up, haze strength, shadow darkness | Choices (the sun's width is sourced) |
| Angle-mode gain (M10f review) | 10 deg/s per degree | Betaflight 4.5 uses 5 plus angle feedforward and a filter; the sim has no feedforward, so 10 is tuned to a similar lean (docs/review.md R1) |
| Thrust when sinking (M10f review) | up to +25 % over static | The model gives extra thrust in a descent, capped at +25 % with no source; real quads lose up to 20 % in a fast vertical descent (vortex ring state, not modelled; docs/review.md R7) |
| Mass (M10f review) | 680 g | 10 g above the cited 625 to 670 g (docs/review.md R5) |
| Prop pitch speed | 65 m/s | Tuned so level top speed lands on the cited 150 km/h |
| Yaw-jump height | 1.2 m (half yaw) / 4.2 m (full yaw) in 2 s | Real yaw jump is cited, its size is not |

Independent physics review (M10f, 2026-11-17): every parameter and card claim rechecked against primary sources; findings and fixes in `docs/review.md`.

## Other open points

- **No real flight log replayed.** PLAN asked to replay a real flight's sticks through the sim and compare. The sandbox could not download a log (its web tool keeps no binary files) and the one matching dataset ships as 12 GB archives. If you put one Betaflight blackbox log (.bbl) of a 5-inch quad in the repo, a session can do the comparison. Candidates: `good_tune.BBL` and `stock_tune.BFL` in github.com/Plasmatree/PID-Analyzer; the TII "Race Against the Machine" dataset (github.com/tii-racing/drone-racing-dataset).
- **Trainer preset is not a real beginner quad.** It is the same 5-inch limited to 70 % power (a sourced Betaflight beginner setting). PLAN asked for a real beginner-class quad; specs for the BetaFPV Cetus X and Cetus Pro were collected (`docs/feel.md` note 7) but no thrust or rate data was found for them.
- **One thrust table was read through a page summary** (T-Motor P2207, source F5 in `docs/feel.md`), not from the page itself. The second table (F19) was read directly; the model uses the middle of the two.
- **Hover throttle is 15 %** (Freestyle) and 22 % (Trainer). The earlier note expected 20 to 25 %; the bench data gave 15 %, inside the 15 to 20 % the guides give for a powerful 5-inch.
- **Lessons are chosen with the mouse.** After a pass the next lesson is selected by itself, but there is no controller button to pick another one.
- **Shadows fall on the grass only**, not on walls or on the quad. The quad's shadow lies where the sun puts it, to the side, not straight below.
- **A PlayStation controller put through the setup screen is treated as a radio** (linear throttle). "Reset this controller" gives the default back.

## The single thing to decide first

Fly lesson 1 with the PlayStation controller and say whether the hover feels right with the stick centred. Everything else in the feel hangs on that: throttle at stick centre, the Trainer power limit and the deadzone are all sliders under "Feel tuning".
