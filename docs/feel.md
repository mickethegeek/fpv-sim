# Feel: targets, sources, and what the sim does today

Mike: "the feel needs to be perfect." This page is the scoreboard. Every sim number below is **measured** by step inputs into the real sim code (`node test/feel.mjs`, and the same measurement inside Chrome in the M5 block of `test/flight.mjs`, plots in `proof/M5/32-m5-feel-step-responses.png`). Re-run after every tuning change and update the tables.

Status on 2026-11-16 (third measurement): rate loop, angle mode and motor lag tuned; thrust curve fitted to a bench table, which moved hover from 30 % to 15.2 %; Trainer preset, Feel tuning panel and the PlayStation throttle centre added. Before tuning: roll/pitch 93 ms to 90 %, angle mode 411 ms, motor lag 30 ms.

Rule from PLAN.md (Mike, 2026-11-16): every number comes from real-life data. Rows without a real-world source are marked **UNSOURCED**.

## Targets against measurements

| What | Real-world target | Source | Sim today | Verdict |
|---|---|---|---|---|
| Rate loop, full-stick step: time to 90 % of the commanded rate | Under 80 ms; above that a freestyle tune counts as "sluggish". Aggressive tunes: under 50 ms | third-party tuner thresholds [F1] (no primary source found for a millisecond figure) | roll/pitch 46 / 44 ms, yaw 166 ms | ok for roll and pitch. Yaw is limited by motor torque, not by the gain (unchanged from kp 25 to 160): **check yaw authority against a real quad** |
| Rate loop overshoot | "A tiny bit of overshoot is acceptable" [F2]; about 10 % ideal, 25 % max [F1] | [F1][F2] | 5 to 6 % roll/pitch (8 % on a 30 % stick step), 1 % yaw | ok |
| Time to stop a roll after letting go | Same order as the rise time | follows from [F1] | 50 ms roll/pitch, 183 ms yaw | ok for roll and pitch |
| Hover throttle | "A powerful 5-inch freestyle rig hovers at roughly 15-20 % throttle" [F3]; "hovering around 20% to 30% throttle" for a typical FPV drone [F18] | [F3][F18] | 15.2 % (freestyle preset), 18.0 % (Trainer preset) | ok: inside the cited 15 to 20 %. It follows from the bench thrust curve and thrust-to-weight 9 (note 2) |
| Thrust against throttle command | 2207 1750 KV on 6S, 5143 prop: 224 / 566 / 850 / 1286 / 1677 g at 20 / 40 / 60 / 80 / 100 % [F5]. 2306 2550 KV at 16 V, HQ 5x4x3: 149 / 449 / 816 / 1237 g at 25 / 50 / 75 / 100 % [F19] | [F5][F19] | thrust = max x command^1.35 | ok: two 2207 tables at 6S voltage disagree (best-fit exponent 1.24 for [F5], 1.45 for [F26]: 192 / 554 / 1034 / 1531 g at 25 / 50 / 75 / 100 % with an HQ 5x4.3x3, about 24 V), so the middle is used, as PLAN says. The 2306 table [F19] fits 1.47. The [F5] part-throttle rows were read through a page summary, not seen verbatim; [F26] was read directly |
| Idle thrust | 40 g of 1237 g = 3.2 % of max at idle [F19] | [F19] | 2.0 % (5.5 % command) | ok. Idle command 5.5 % is Betaflight's default `motorIdle = 550` [F25] |
| Thrust-to-weight | 7.5 measured on a load cell for an 870 g 5-inch race quad [F4]. Bench thrust per motor 1.6 to 1.9 kg for a 2207 on 6S [F5][F6], which would give 10 to 11 at 625 to 670 g but overstates installed thrust | [F4][F5][F6] | 9 | ok, inside the range |
| All-up weight | 625 to 670 g with a 6S 1300 mAh pack, 750 to 800 g with an action camera | [F7] | 680 g | ok |
| Motor + prop time constant | 33 ms (5-inch three-blade props) | [F8] | 33 ms set; thrust reaches 63 % in 35 ms | ok |
| Motor arm, motor to centre | 107.5 to 112.5 mm (215 mm and 225 mm frames) | [F4][F9] | 110 mm | ok |
| Angle mode tilt limit | 60 deg (Betaflight 4.5 default; 55 in 4.4) | [F10] | 60 deg | ok |
| Angle mode: time to reach the tilt, overshoot | No number found. Betaflight 4.5 added angle feedforward "to enhance responsiveness" | [F11] | 202 ms to 90 % of 30 deg, level again 233 ms after letting go, no overshoot, no swing-back | better; the 200 ms target is a judgement, not a sourced number. Mike should say if it feels right |
| Linear (rotor) drag | 0.24 to 0.54 per second, mass-normalised (610 g quad, 6-inch props, measured at 4 to 5 m/s) = 0.16 to 0.37 N per m/s at 0.68 kg | [F12] | 0.3 N per m/s | ok |
| Coasting after centring the sticks | Follows from the drag above (time constant m/k = about 2 to 4 s) | [F12] | half speed after 1.7 s, 13 m from 23 km/h | ok, consistent |
| Top speed, level | 150 km/h (freestyle, reviewer) to 179 km/h (870 g race quad) | [F4][F13] | 148 km/h (unit test), 145 km/h in angle mode | ok |
| Falling with motors off | not found | | 60 km/h terminal | unknown; the linear drag term dominates here and was only measured at 4 to 5 m/s |
| Camera uptilt | Beginners 10 to 15 deg; freestyle 20 to 35 deg | [F14] | 25 deg | **consider 15 deg as the beginner default** (M6 has a setting) |
| Camera field of view | DJI O3: 155 deg (lens figure) | [F15] | 115 deg horizontal | open: the lens figure is probably diagonal; not comparable yet |
| Throttle mid / expo | Betaflight default mid 0.50, expo 0. Guides: mid at or just above hover, expo 0.3 to 0.65 | [F16][F3][F17] | PlayStation stick: centre = hover throttle of the chosen preset, expo 0, both adjustable. Radios: linear | ok. Mike's fixed decision: centred stick = about hover |
| Beginner power limit (Trainer preset) | Betaflight throttle limit, type SCALE, "especially useful for FPV beginners", example 80 % [F18]; beginner table for 6S 5-inch: throttle limit 70 %, motor output limit 67 % [F20] | [F18][F20] | throttle limit 70 %: thrust-to-weight 5.6, hover 21.7 %, punch 4.0 g, 111 km/h in angle mode | ok as a tamed 5-inch. **PLAN now asks for a Trainer modelled on a real beginner-class quad: not done** (specs collected in note 7) |
| Stick deadband | Betaflight default: `deadband = 0`, `yaw_deadband = 0` (radio gimbals) [F21] | [F21] | 5 % on gamepad sticks, rescaled so there is no jump; adjustable 0 to 20 % | **UNSOURCED** for PlayStation sticks: no figure found for their resting error. Mike's controller is the test: lower it until the quad drifts hands-off |

## All measurements (sim today, freestyle preset)

| What | Measured |
|---|---|
| Hover throttle (stick) | 15.2 % |
| Acro roll, full stick: time to 50 % / 90 % of 670 deg/s | 26 ms / 45 ms |
| Acro roll, full stick: overshoot, rate held | 5.8 %, 670 deg/s |
| Acro roll: time to stop after letting go (below 5 %) | 48 ms |
| Acro pitch, full stick: time to 50 % / 90 % of 670 deg/s | 25 ms / 43 ms |
| Acro pitch, full stick: overshoot, rate held | 6.1 %, 670 deg/s |
| Acro pitch: time to stop after letting go (below 5 %) | 47 ms |
| Acro yaw, full stick: time to 50 % / 90 % of 670 deg/s | 106 ms / 166 ms |
| Acro yaw, full stick: overshoot, rate held | 1.3 %, 670 deg/s |
| Acro yaw: time to stop after letting go (below 5 %) | 183 ms |
| Acro roll, 30 % stick: rate held, time to 90 %, overshoot | 75 deg/s, 40 ms, 7.6 % |
| Angle mode, half roll stick: tilt held (target), time to 90 % | 29.9 deg (30), 203 ms |
| Angle mode: overshoot going in, swing past level coming back | 0.0 %, 0.0 deg |
| Angle mode: time to level (within 2 deg) after letting go | 233 ms |
| Throttle punch from hover: peak extra acceleration | 6.7 g |
| Throttle punch: time to 63 % / 90 % of that (motor lag) | 30 ms / 58 ms |
| Throttle punch: climb speed after 1 s | 119 km/h |
| Throttle chop from hover: sink rate and drop after 1 s (free fall: 9.8 m/s, 4.9 m) | 6.0 m/s, 3.2 m |
| Coasting from 23 km/h after centring the sticks (angle mode): half speed after, below 1 m/s after, distance | 1.6 s, 4.1 s, 12 m |
| Top speed in angle mode (60 deg tilt limit, full throttle) | 145 km/h |
| Falling with motors off: terminal speed | 60 km/h |

Trainer preset (throttle limit 70 %): hover 21.7 %, punch 4.0 g, climb after 1 s 80 km/h, 111 km/h top speed in angle mode. Rotation numbers are the same as above.

## Notes for tuning (next steps of M5)

1. **Done: rate loop.** `kp` 25 to 120, `kd` 0.3 to 1.5 in `defaultFc()` (`src/params.js`), picked from a scan: 45 ms to 90 % with about 5 % overshoot. Higher gains only add overshoot. Yaw did not change with gain (about 165 ms): it is limited by how much reaction torque the motors have (`yawTorquePerThrust`), which is realistic in kind; whether the amount is right is unsourced.
2. **Done: hover throttle.** Before: stick linear in motor speed and thrust with speed squared gave 30 %. Betaflight sends the stick linearly to the ESC; bench tables show static thrust rising more slowly than the square of the command. Fit of thrust/max = command^e, two 2207 motors at 6S voltage: T-HOBBY P2207 1750 KV [F5] gives e = 1.25, 1.18, 1.33, 1.19 at 20, 40, 60, 80 % (mean 1.24); DYS Storm 2207 1750 KV [F26] gives 1.50, 1.47, 1.36 at 25, 50, 75 % with an HQ 5x4.3x3 and 1.49, 1.43, 1.25 with a Gemfan 5149 (mean 1.45). The two differ (different ESCs and throttle calibration), so the middle is used: **1.35** (`thrustExponent` in `src/params.js`). Hover = (1 / 9)^(1/1.35) = 20 % command = 15 % stick above the 5.5 % idle. A 2306 at 16 V [F19] fits 1.47.
3. **Done: angle mode.** `angleGain` 5 to 10: lean in 202 ms, no overshoot, no swing-back (gain 20 starts to overshoot). No feedforward added; add it only if Mike finds it soft.
4. **Done: Feel tuning panel** (`src/tuning.js`, panel in `index.html`): quad preset (Trainer / Freestyle), max rate, centre sensitivity, expo, responsiveness (rate-loop gains), floatiness (air drag), throttle at stick centre, throttle expo, stick deadzone, and Reset to default. Saved in the browser. Defaults are the sourced values in this page.
5. **Done: input path review.** `InputManager.update()` reads the gamepad once per rendered frame; the only shaping is the deadzone, the throttle-centre curve (spring sticks only) and Betaflight Actual rates. No smoothing or filtering anywhere. Physics runs a fixed 1 kHz whatever the frame rate (`simAdvance`). The keyboard is the exception: keys ramp a virtual stick at 5 per second, because a key has no travel.
6. **UNSOURCED** today: rate-loop rise time from a primary source (only third-party thresholds [F1]); the angle-mode 200 ms lean (a judgement); yaw authority; terminal fall speed; speed at a given tilt; gamepad deadzone; quadratic drag; crash speed 6 m/s. Best fix for the first four: replay a real blackbox log through the sim (PLAN: validation against a real flight). **Tried on 2026-11-16 and not possible from the relay sandbox**: its web tool returns page text only and does not keep binary files, so no log could be brought in (two public logs were reachable: `good_tune.BBL` and `stock_tune.BFL` in github.com/Plasmatree/PID-Analyzer), and the one dataset that matches this quad (TII race dataset, [F4]) ships only as 12 GB archives. If Mike drops one blackbox log (.bbl) of a 5-inch into the repo, a leg can replay it. A real pilot's settings on that quad are in [F27]: 533 deg/s full-stick rate, close to the 670 default here.
7. Specs collected for a real beginner quad (for the Trainer rework). BetaFPV Cetus X: 55 g without battery, 81 g with two 1S 450 mAh, 95 mm wheelbase, 1103 11000 KV motors, Gemfan 2020 four-blade props, about 5 min flight [F22][F23]. BetaFPV Cetus Pro: 33.19 g without battery, 1102 18000 KV, 40 mm three-blade props, 1S 450 mAh, modes N/S/M with speeds slow/mid/fast [F24]. None of these pages gives thrust, top speed, tilt limits or rates: those still need a source (motor thrust tables for 1103 / 1102, or a flight log).

## Sources

- F1. FPV PID Lab (third-party Betaflight tuning tool), threshold table for overshoot, rise time and settling: https://github.com/eddycek/fpvpidlab
- F2. Oscar Liang, "How to Tune FPV Drone Filters & PID with Blackbox": https://oscarliang.com/pid-filter-tuning-blackbox/
- F3. Unmanned Tech, "Betaflight Throttle Control: How to Set Mid, Expo & Hover Point": https://blog.unmanned.tech/betaflight-throttle-mid-expo-hover-point-guide/
- F4. "Race Against the Machine" dataset paper (870 g 5-inch race quad: thrust-to-weight 7.5, 179 km/h, 215 mm diagonal, 30 deg camera): https://arxiv.org/pdf/2311.02667
- F5. T-Motor P2207 V3 thrust table (1750 KV: 1677 g, 1950 KV: 1815 g on 6S with a 5143 prop): https://www.ligpower.com/product/p2207-v3-fpv-motor.html
- F6. MiniQuadTestBench, SunnySky R2207 1800 KV (1907 g on HQ 5x4.3x3): https://www.miniquadtestbench.com/sunnysky-e-r2207-1800kv.html
- F7. Unmanned Tech, "FPV drone weight build mistakes": https://www.unmannedtechshop.co.uk/blogs/knowledge-base/fpv-drone-weight-build-mistakes-why-your-quad-feels-sluggish
- F8. Bauersfeld, Kaufmann, Foehn, Sun, Scaramuzza, "NeuroBEM" (motor time constant 33 ms, 752 g quad): https://arxiv.org/pdf/2106.08015
- F9. SpeedyBee 5-inch freestyle frame, wheelbase 225 mm: https://www.myfpvstore.com/quadcopter-frames/speedy-bee-5-inch-freestyle-frame/
- F10. Betaflight 4.5.0 source, `pid.c` (`angle_limit = 60`, `PID_LEVEL = { 50, 75, 75, 50 }`, `angle_earth_ref = 100`): https://raw.githubusercontent.com/betaflight/betaflight/4.5.0/src/main/flight/pid.c
- F11. Oscar Liang, "Betaflight 4.5": https://oscarliang.com/betaflight-4-5/
- F12. Faessler, Franchi, Scaramuzza, "Differential Flatness of Quadrotor Dynamics Subject to Rotor Drag": https://arxiv.org/pdf/1712.02402
- F13. Oscar Liang, SpeedyBee Mario 5 review (about 150 km/h seen): https://oscarliang.com/speedybee-mario-5
- F14. Oscar Liang, "FPV camera angle": https://oscarliang.com/camera-angle/
- F15. Oscar Liang, DJI O3 Air Unit review: https://oscarliang.com/dji-o3-air-unit-fpv-goggles-2/
- F16. Betaflight 4.5.0 source, `controlrate_profile.c` (`thrMid8 = 50`, `thrExpo8 = 0`): https://raw.githubusercontent.com/betaflight/betaflight/4.5.0/src/main/fc/controlrate_profile.c
- F17. Oscar Liang, "Throttle Mid & Throttle Expo": https://oscarliang.com/throttle-mid-expo/
- F18. Oscar Liang, "How To Slow Down FPV Drone Using Throttle Scale": https://oscarliang.com/throttle-scale/
- F19. MiniQuadTestBench, Hypetrain Cricket 2306.6 2550 KV, thrust at idle / 25 / 50 / 75 / 100 % per prop: https://www.miniquadtestbench.com/assets/components/motordata/motorinfo.php?uid=282
- F20. UAVModel blog, "FPV Drone Throttle Scaling: Motor Output Limit, Throttle Mid, and Expo for Beginner Control": https://blog.uavmodel.com/?p=3797 (its "8 % hover" rests on an 8 to 10 kg thrust claim far above bench data; not used)
- F21. Betaflight 4.5.0 source, `rc_controls.c` (`.deadband = 0`, `.yaw_deadband = 0`): https://raw.githubusercontent.com/betaflight/betaflight/4.5.0/src/main/fc/rc_controls.c
- F22. BetaFPV Cetus X brushless quadcopter: https://betafpv.com/products/cetus-x-brushless-quadcopter
- F23. Oscar Liang, BetaFPV Cetus X review: https://oscarliang.com/betafpv-cetus-x/
- F24. BetaFPV Cetus Pro FPV kit: https://betafpv.com/products/cetus-pro-fpv-kit
- F25. Betaflight source, `src/main/pg/motor.c` (`motorConfig->motorIdle = 550`, read as 5.5 %): https://raw.githubusercontent.com/betaflight/betaflight/master/src/main/pg/motor.c
- F26. MiniQuadTestBench, DYS Storm 2207 1750 KV (thrust at idle / 25 / 50 / 75 / 100 % per prop, logged at about 24 V): https://www.miniquadtestbench.com/assets/components/motordata/motorinfo.php?uid=244
- F27. Betaflight settings of the real 870 g race quad of [F4] (Betaflight 4.3.1, rates type BETAFLIGHT, rc_rate 80, srate 70: by Betaflight's formula 200 x 0.8 / (1 - 0.7) = 533 deg/s at full stick; PIDs roll 63/67/46, pitch 75/81/47): https://raw.githubusercontent.com/tii-racing/drone-racing-dataset/main/quadrotor/BTFL_cli_backup.txt

F5 note: the page is headed "T-HOBBY P2207 V3"; its part-throttle rows (20 to 100 % in steps of 20, at 25.2 to 24.8 V) came through a page summary.

The quotes behind these figures were collected by a research pass on 2026-11-16 through page extracts; spot-check any figure before leaning hard on it.
