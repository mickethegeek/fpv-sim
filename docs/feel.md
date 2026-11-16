# Feel: targets, sources, and what the sim does today

Mike: "the feel needs to be perfect." This page is the scoreboard. Every sim number below is **measured** by step inputs into the real sim code (`node test/feel.mjs`, and the same measurement inside Chrome in the M5 block of `test/flight.mjs`, plots in `proof/M5/32-m5-feel-step-responses.png`). Re-run after every tuning change and update the tables.

Status on 2026-11-16 (first measurement, **nothing tuned yet**).

## Targets against measurements

| What | Real-world target | Source | Sim today | Verdict |
|---|---|---|---|---|
| Rate loop, full-stick step: time to 90 % of the commanded rate | Under 80 ms; above that a freestyle tune counts as "sluggish". Aggressive tunes: under 50 ms | third-party tuner thresholds [F1] (no primary source found for a millisecond figure) | roll/pitch 93 ms, yaw 173 ms | **too slow: tune** |
| Rate loop overshoot | "A tiny bit of overshoot is acceptable" [F2]; about 10 % ideal, 25 % max [F1] | [F1][F2] | 3 % roll/pitch, 1 % yaw | ok |
| Time to stop a roll after letting go | Same order as the rise time | follows from [F1] | 104 ms roll/pitch, 202 ms yaw | tune with the rise time |
| Hover throttle | "A powerful 5-inch freestyle rig hovers at roughly 15-20 % throttle" | [F3] | 30.1 % | **too high: decide** (see notes) |
| Thrust-to-weight | 7.5 measured on a load cell for an 870 g 5-inch race quad [F4]. Bench thrust per motor 1.6 to 1.9 kg for a 2207 on 6S [F5][F6], which would give 10 to 11 at 625 to 670 g but overstates installed thrust | [F4][F5][F6] | 9 | ok, inside the range |
| All-up weight | 625 to 670 g with a 6S 1300 mAh pack, 750 to 800 g with an action camera | [F7] | 680 g | ok |
| Motor + prop time constant | 33 ms (5-inch three-blade props) | [F8] | 30 ms set; thrust reaches 63 % in 32 ms | ok (could set exactly 33) |
| Motor arm, motor to centre | 107.5 to 112.5 mm (215 mm and 225 mm frames) | [F4][F9] | 110 mm | ok |
| Angle mode tilt limit | 60 deg (Betaflight 4.5 default; 55 in 4.4) | [F10] | 60 deg | ok |
| Angle mode: time to reach the tilt, overshoot | No number found. Betaflight 4.5 added angle feedforward "to enhance responsiveness" | [F11] | 411 ms to 90 % of 30 deg, no overshoot, no swing-back | **feels soft: likely too slow** (add feedforward, raise gain; keep zero wobble) |
| Linear (rotor) drag | 0.24 to 0.54 per second, mass-normalised (610 g quad, 6-inch props, measured at 4 to 5 m/s) = 0.16 to 0.37 N per m/s at 0.68 kg | [F12] | 0.3 N per m/s | ok |
| Coasting after centring the sticks | Follows from the drag above (time constant m/k = about 2 to 4 s) | [F12] | half speed after 1.7 s, 13 m from 23 km/h | ok, consistent |
| Top speed, level | 150 km/h (freestyle, reviewer) to 179 km/h (870 g race quad) | [F4][F13] | 148 km/h (unit test), 145 km/h in angle mode | ok |
| Falling with motors off | not found | | 60 km/h terminal | unknown; the linear drag term dominates here and was only measured at 4 to 5 m/s |
| Camera uptilt | Beginners 10 to 15 deg; freestyle 20 to 35 deg | [F14] | 25 deg | **consider 15 deg as the beginner default** (M6 has a setting) |
| Camera field of view | DJI O3: 155 deg (lens figure) | [F15] | 115 deg horizontal | open: the lens figure is probably diagonal; not comparable yet |
| Throttle mid / expo | Betaflight default mid 0.50, expo 0. Guides: mid at or just above hover, expo 0.3 to 0.65 | [F16][F3][F17] | none (linear) | to do with the PlayStation spring-stick throttle (PLAN, Fixed decisions) |

## All measurements (sim today)

| What | Measured |
|---|---|
| Hover throttle (stick) | 30.1 % |
| Acro roll, full stick: time to 50 % / 90 % of 670 deg/s | 49 ms / 93 ms |
| Acro roll, full stick: overshoot, rate held | 3.2 %, 669 deg/s |
| Acro roll: time to stop after letting go (below 5 %) | 104 ms |
| Acro pitch, full stick: time to 50 % / 90 % of 670 deg/s | 48 ms / 93 ms |
| Acro pitch, full stick: overshoot, rate held | 3.1 %, 669 deg/s |
| Acro pitch: time to stop after letting go (below 5 %) | 104 ms |
| Acro yaw, full stick: time to 50 % / 90 % of 670 deg/s | 104 ms / 173 ms |
| Acro yaw, full stick: overshoot, rate held | 1.0 %, 671 deg/s |
| Acro yaw: time to stop after letting go (below 5 %) | 202 ms |
| Acro roll, 30 % stick: rate held, time to 90 %, overshoot | 77 deg/s, 98 ms, 3.2 % |
| Angle mode, half roll stick: tilt held (target), time to 90 % | 29.2 deg (30), 411 ms |
| Angle mode: overshoot going in, swing past level coming back | 0.0 %, 0.0 deg |
| Angle mode: time to level (within 2 deg) after letting go | 455 ms |
| Throttle punch from hover: peak extra acceleration | 6.7 g |
| Throttle punch: time to 63 % / 90 % of that (motor lag) | 32 ms / 59 ms |
| Throttle punch: climb speed after 1 s | 119 km/h |
| Throttle chop from hover: sink rate and drop after 1 s (free fall: 9.8 m/s, 4.9 m) | 7.5 m/s, 4.1 m |
| Coasting from 23 km/h after centring the sticks (angle mode): half speed after, below 1 m/s after, distance | 1.7 s, 4.3 s, 13 m |
| Top speed in angle mode (60 deg tilt limit, full throttle) | 145 km/h |
| Falling with motors off: terminal speed | 60 km/h |

## Notes for tuning (next steps of M5)

1. **Rate loop is the first job.** 93 ms to 90 % is slower than even a "smooth" tune. Raise `kp` (and `kd` to keep overshoot under about 10 %) in `defaultFc()` in `src/params.js` until roll and pitch reach 90 % in 40 to 60 ms. Yaw is naturally slower on a real quad (it only has reaction torque), but 173 ms is likely still too slow: check motor saturation first.
2. **Hover throttle.** The sim maps the stick linearly to motor speed and thrust goes with speed squared, so thrust-to-weight 9 gives sqrt(1/9) = 33 % (30 % measured). Real guides say 15 to 20 %. Betaflight sends the stick linearly to the ESC, and how thrust follows the ESC command is not sourced yet. Options: (a) keep it, (b) make thrust closer to linear in the command at the low end. Source this before changing; it also sets where "throttle mid" goes for the PlayStation stick.
3. **Angle mode.** Add Betaflight-4.5-style feedforward from the stick to the rate setpoint and raise `angleGain`; target a clearly quicker lean (around 200 ms) with zero overshoot and zero swing-back. The measurement prints both.
4. **Feel tuning panel** (PLAN M5): sliders for rates, expo, responsiveness (rate-loop gain), floatiness (drag), plus Reset to default. Not started.
5. **Input path** (PLAN M5): `src/input.js` is read once per frame in `main.js` with no smoothing; the deadzone value and its fit for PlayStation sticks have not been reviewed in this leg.
6. Numbers still without a source: millisecond rise time from a primary source (PIDtoolbox wiki not opened), thrust versus ESC command, terminal fall speed, speed at a given tilt.

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

The quotes behind these figures were collected by a research pass on 2026-11-16 through page extracts; spot-check any figure before leaning hard on it.
