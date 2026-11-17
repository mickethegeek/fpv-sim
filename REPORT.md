# Report (phase 1: M7, 2026-11-16 · phase 2: M11, 2026-11-17)

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

## Phase 2: learn, then fly (2026-11-17)

| Milestone | What you get | Proof |
|---|---|---|
| M8 Menu and freedom | Start menu (Learn, Gates, Free fly, Theory, Stick patterns, Settings), pause menu on Options / Esc, nothing locked, everything works with the PlayStation controller, keyboard or mouse | `proof/M8/` |
| M9 Chapters | Each lesson is a chapter: Learn (cards with a live demo and the real forces as arrows), Watch (a test pilot flies it), Check (quick questions), Try; every part skippable; Theory page | `proof/M9/` |
| M10 Helpers | Force arrows in any flight (F), one coaching line after a failed run computed from that run, camera tilt 12° in Learn | `proof/M10/` |
| M10b Demo fixes | Nose-toward-you demos with a big nose arrow, the tilt demo frozen at the motor push, stopping distance at two speeds | `proof/M10b/` |
| M10d Yaw jump + stick patterns | The yaw jump you hit is real (Betaflight "yaw jump") and is taught; 8 stick patterns flown right and with one part forgotten; live throttle under the left stick | `proof/M10d/` |
| M10e Curriculum | Learn in 4 levels (basics, combinations, physics, acro); **Why? (motors)** on every card shows which motors speed up and the forces | `proof/M10e/` |
| M10f Independent review | Every number and card claim rechecked against its source; 3 card sentences fixed; findings in `docs/review.md` | `proof/M10f/` |
| M10c Replay | Pause menu > Replay last run: play / pause, scrub, slow motion down to 0.1x, FPV / line of sight / chase, with your sticks shown | `proof/M10c/` |
| M11 Finish | Every chapter walked through with the controller in Chrome; HUD fits narrow windows; live site checked | `proof/M11/` |

## How it was checked

- 88 unit tests on the physics, controller logic, course, lessons, demos, coaching, curriculum and replay. Each physics test was shown to fail on a deliberately broken model (`node test/mutations.mjs`).
- 184 checks in real Chrome, flown by a script (final run 2026-11-17, phase 2): take-off, crashes, a full lap, the setup screen with a simulated USB radio, a simulated PlayStation controller, all 8 lessons flown to the badge by a test pilot, every menu with controller / keyboard / mouse, every theory card's demo, every chapter walked through with the controller only (Learn, Watch, Check, Try, Skip), stick patterns, Why? (motors), replay. Screenshots of that run: `proof/M11/` (phase 1: `proof/final/`).
- Narrow windows (800x1273 as on your MacBook, and phone width) and the live site: `node test/narrow.mjs`, screenshots `proof/M11/narrow-*` and `proof/M11/live-*`.

## What was not checked: please try these

1. **The live link.** Checked from the sandbox on 2026-11-17 (M11): it loads, the menu works, no errors in the console.
2. **Your real controller.** Only simulated controllers were used (the sandbox has no USB). First thing to try: plug in the PlayStation controller, press a button, pull the left stick down, press R1.
3. **The frame rate.** Measured by you on the MacBook Air (M4): 60 frames a second in free flight.
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
| Camera | 115° field of view | PLAN value. Uptilt is now sourced: 12° in Learn (guides: 10 to 15° for beginners), 25° in Gates and Free fly (freestyle 20 to 35°) |
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
- **Shadows fall on the grass only**, not on walls or on the quad. The quad's shadow lies where the sun puts it, to the side, not straight below.
- **A PlayStation controller put through the setup screen is treated as a radio** (linear throttle). "Reset this controller" gives the default back.

## The single thing to decide first

Open **Learn > Level 1** and go through the cards with **Why? (motors)** on (□ on the controller). This is the "from zero to motor thrust" path you asked for: say where it still does not click, and fly **Turn on the spot** from Stick patterns to see whether the yaw jump now makes sense. After a messy run, **Replay last run** (pause menu) at 0.25x shows what your thumbs did.

Still open from phase 1: whether the hover feels right with the stick centred (Settings > Feel tuning has the sliders).
