# Theory cards: where each claim comes from

The cards and check questions are in `src/theory.js` (one chapter per lesson). Rule from PLAN.md: what a card says must match the sim's own physics, and a claim about real drones needs a source. Sources were read on 2026-11-16.

| Card | Claim | Source |
|---|---|---|
| props, tilt | Thrust from four props; tilting by speeding up the props on one side | Sim: `src/physics.js` (thrust per motor, torque from the arm). Real quads: Oscar Liang, "What is a Quadcopter": roll is "increasing motor speed on either the left or right side, and decreasing on the opposite side"; pitch "the same way as roll using the motors at the front and rear". https://oscarliang.com/what-is-quadcopter |
| yaw | Two props spin one way, two the other; yaw by changing the speed of one pair | Same page: two on opposite corners "rotate in clockwise direction (CW)", the other two counter-clockwise; yaw is "controlled by increasing or decreasing the speed of the 2 motors that turn in the same direction". Sim: reaction torque per motor in `src/physics.js`. |
| sticks | Mode 2 layout | PLAN.md fixed decision; `src/input.js`. |
| arm | Arm only with the throttle down | Betaflight refuses to arm with the throttle up; already cited in `docs/physics.md` (arming). "Clear of people" is common-sense safety advice, no number in it. |
| relative, nose-in, lost | Controls are relative to the drone | Sim: sticks act in the body frame (`src/flightcontroller.js`). The advice "turn the nose away from you" and "nudge forward to find the nose" is **UNSOURCED** (standard line-of-sight teaching, no source read). |
| tilt-move, tilt-height | Tilt moves the drone and costs lift | Sim: thrust is along the body's up axis, so the vertical part is thrust x cos(tilt). Geometry, no outside source needed. |
| turn | Yaw and roll together | Sim behaviour (yaw alone leaves the velocity where it was). The bike comparison is a teaching picture, **UNSOURCED**. |
| no-brakes, stop-early | The drone coasts; stopping distance grows fast with speed | Sim: drag values cited in `docs/physics.md`; M9's demo should measure and show the real stopping distances at two speeds. |
| camera | Camera tilted up because the drone flies nose down; beginners 10 to 15 degrees | Oscar Liang, "What's the Best Camera Angle": "a 10°–15° camera angle is an excellent starting point"; "20°–35° works well for general freestyle flying". https://oscarliang.com/camera-angle/ . This is also the source for M10's beginner uptilt. |
| wind-drift, wind-lean | The drone drifts with the air | Sim: drag acts on speed through the air (`quad.wind` in `src/physics.js`); wind speed cited in `docs/physics.md`. |
| disarm | Disarm on a crash | Lesson 6 already teaches it. "Safer than props still spinning" is **UNSOURCED** (common practice). |
| failsafe | On signal loss the drone stops its motors and drops | Betaflight Failsafe guide: "By default, the craft immediately disarms and drops" (after about 1.5 s of signal loss in Betaflight 4.5). https://betaflight.com/docs/wiki/guides/current/Failsafe |
| spotter | Goggles need an observer beside the pilot | FOCA (Switzerland), flight rules for drones: the pilot "is assisted by an observer ... who is positioned beside them" and who "keeps the drone in visual line of sight (VLOS) with the naked eye at all times". https://www.bazl.admin.ch/en/flight-rules-drones . EASA says the same for the EU: flying with goggles is allowed "provided you have a person next to you, a UA observer, keeping direct visual contact with the drone". https://www.easa.europa.eu/en/faq/116511 |
| angle, acro, rates, acro-level | Angle sets tilt, acro sets rotation speed; full stick about half a second per flip | Sim: Betaflight default Actual rates, 670 deg/s at full stick (cited in `docs/feel.md`), so 360 degrees takes 0.54 s. |

Also on the FOCA page, useful for a later safety card: maximum height 120 m above ground in the open category; no flying over assemblies of people.

## Demos
Each card names a `demo` in `src/demos.js`: a short scene the sim plays beside the card. A demo only stages the scene (where the quad starts, what the sticks do and when, where the camera stands, slow motion or not); what the quad then does is the sim's physics. `test/unit/demos.test.mjs` flies every demo and checks that it shows what its card says. Measured in those tests (Trainer quad):

| Card | What the demo shows, measured |
|---|---|
| tilt-height | 30 degrees of tilt (half stick) at hover throttle for 1.6 s: the quad sinks more than 0.6 m. The same tilt with throttle added: height stays within 0.5 m. |
| no-brakes, stop-early | Levelled at 3.3 m/s (12 km/h) it is still moving 4 s later and has glided about 6 m; tilting back stops it in about 1 m. The stopping distances at higher speeds are not shown yet. |
| relative, nose-in | Nose toward the pilot, roll stick right: the quad moves to the pilot's left. Turned away, the same stick moves it right. |
| wind-drift, wind-lean | In the 2.6 m/s breeze a level quad drifts more than 3 m in 6 s; holding the spot takes a lean of a few degrees. |
| angle, acro, acro-level | Angle mode: back under 3 degrees of tilt 1.8 s after release. Acro: the tilt stays within 3 degrees of where the stick left it, until the counter-move. |
| rates | Full roll stick for 0.54 s: one flip (670 deg/s, Betaflight default). |

The arrows (`src/arrows.js`) are the sim's own numbers each frame: thrust of each motor from `motorThrust()` in `src/physics.js` (0.22 m of arrow per newton), the weight (mass x g, same scale) and the velocity (0.25 m per m/s). The two scales, the demo camera's zoom and the quad drawn at twice its size in demos are display choices (**UNSOURCED**).

The rates card also draws the rates curve: rotation speed against stick position from `actualRate()` with the quad's current rates, and a dot at the stick's position during the flip.
