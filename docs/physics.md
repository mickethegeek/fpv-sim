# Physics numbers and where they come from

Rule (RELAY.md): real-world numbers are looked up and cited here, never taken from memory.
Every parameter in `src/params.js` is listed below as **cited**, **derived** (computed from cited values), or **uncited** (a starting value from PLAN.md that no leg has sourced yet). Since PLAN.md's real-data rule (2026-11-16), a value with no source is marked **UNSOURCED**. The newer sources (F numbers) are listed in `docs/feel.md`, which is the scoreboard.

Looked up 2026-11-16.

## Flight controller (Betaflight)

| What | Value | Status | Source |
|---|---|---|---|
| Default rates type | Actual | cited | Betaflight `controlrate_profile.c`: `.rates_type = RATES_TYPE_ACTUAL` [1] |
| PID sum limit roll / pitch, yaw | 500, 400 (of 1000) | cited | `pidsum_limit = 500`, `pidsum_limit_yaw = 400`, Betaflight 4.0 CLI reference [13]; the current CLI reference gives the same two values [14]. Reading 1000 as the whole motor command range is **UNSOURCED** (not stated on those pages). Sim: `pidsumLimit` / `pidsumLimitYaw` in `src/params.js`, applied in the mixer of `src/flightcontroller.js` |
| Default center sensitivity (roll, pitch, yaw) | 70 deg/s | cited | `.rcRates[...] = 7`, multiplied by 10 in `applyActualRates` [1][2] |
| Default max rate (roll, pitch, yaw) | 670 deg/s | cited | `.rates[...] = 67`, multiplied by 10 [1][2] |
| Default expo | 0 | cited | `.rcExpo[...] = 0` [1] |
| Actual rates formula | see below | cited | `applyActualRates` in `rc.c` [2] |
| Setpoint hard limit | ±1998 deg/s | cited | `SETPOINT_RATE_LIMIT_MAX 1998.0f` [2] |
| Angle mode max tilt | 60° | cited | `.angle_limit = 60` in `resetPidProfile` [3] |
| Angle mode gain | Betaflight: 5 (deg/s of rate per degree of error) plus angle feedforward and a pt3 filter. **Sim: 10, tuned** (no feedforward modelled) | derived / tuned | `pidRuntime.angleGain = pidProfile->pid[PID_LEVEL].P / 10.0f`, default P = 50 [3][4]; see `docs/review.md` R1 |
| Typical freestyle Actual rates | center 100 to 200, max 800 to 1000, expo 0.5 to 0.7 | cited | Oscar Liang rates guide [5]. Not used as the default; offered for the M6 preset. |

Actual rates, from the Betaflight source [2] (stick `x` in −1..1, result in deg/s):

    expof = |x| * (x^5 * expo + x * (1 - expo))
    rate  = x * center + max(0, maxRate - center) * expof

Not copied from Betaflight: the PID loop itself. Betaflight's default gains (roll 45/80/40, yaw 45/80/0, F 120 [6], 4.5.0; the sim copies only yaw D = 0, M12) are in its own internal units and depend on its filters and loop rate. The sim uses a PID on angular rate in physical units (`src/flightcontroller.js`), tuned so that a full-stick roll reaches the configured max rate within about 0.2 s (unit test).

## Airframe

| What | Value | Status | Source |
|---|---|---|---|
| Inertia roll / pitch / yaw | 2.5e-3 / 2.1e-3 / 4.3e-3 kg m² | cited | Kaufmann, Bauersfeld, Scaramuzza 2022, Table II, identified from a real racing quad of 0.768 kg [7] |
| Prop inertia, prop speed at full | 1.34e-6 kg m², 3275 rad/s | cited | Emax Avan Flow spec; T-Motor P2306 V3 table (docs/inertia-review.md I6) |
| Yaw torque per newton of thrust | 0.0122 m | derived | c_d / c_l = 1.909e-8 / 1.563e-6 from the same Table II [7] |
| Linear (rotor) drag | 0.3 N per m/s at hover prop speed, in the rotor plane only, body frame, scaled by prop speed (none with props stopped) | cited | in-plane k_vx, k_vy of Table II [7]; body-frame form from Faessler 2018 Eq. 2 (dz = 0 there); per rotor ∝ prop speed × in-plane airspeed, Martin 2014 Eq. 1 (docs/inertia-review.md I3, I4) |
| Level top speed target | about 150 km/h | cited | "A typical 6S 5-inch freestyle FPV drone can reach about 150 km/h" [8] |
| Mass with battery | 0.68 kg | cited | 625 to 670 g with a 6S 1300 mAh pack (`docs/feel.md` F7) |
| Thrust-to-weight | 9 | cited (range) | 7.5 measured in flight trim on an 870 g race quad, 10 to 11 from bench thrust (`docs/feel.md` F4 to F6); 9 is the middle. Gives 15 N static thrust per motor. |
| Motor arm length | 0.11 m | cited | 107.5 to 112.5 mm (`docs/feel.md` F4, F9) |
| Motor time constant | 33 ms | cited | NeuroBEM paper (`docs/feel.md` F8) |
| Thrust against command | max x command^1.35 | cited (fit) | middle of two 2207 6S bench tables, 1.24 and 1.45 (`docs/feel.md` F5, F26, note 2) |
| Idle command | 5.5 % | cited | Betaflight default `digitalIdleOffsetValue = 550` (of 10000 = full output; DShot) (`docs/feel.md` F25) |
| Quadratic body drag | 0.006 N per (m/s)² | **UNSOURCED** | placeholder, equal to a drag area of about 0.01 m² |
| Prop pitch speed at full throttle | tuned | tuned | Chosen so level top speed lands on the cited 150 km/h. See below. |

## Model choices

- **Thrust falls with airspeed.** A fixed-pitch prop makes less thrust as air flows faster through it. Model: `T = Tmax * n * (n - v_axial / v_pitch)`, clamped at 0, where `n` is prop speed 0..1 and `v_axial` is airspeed along the thrust axis. At rest this is `Tmax * n²`. This, not body drag, is what limits top speed, so the quad still coasts when you cut throttle. `v_pitch` is the one tuned number.
- **Throttle stick is linear in the ESC command** (as in Betaflight). Static thrust = `Tmax * command^1.35`, fitted to bench tables, so prop speed `n = command^0.675` and hover sits at 15 % stick (was 30 % with thrust = command²).
- **Motors**: first-order lag (33 ms) on the command.
- **Integration**: 1 kHz fixed step, semi-implicit Euler, quaternion renormalised each step.

## Gate course (M4)

| What | Value | Status | Source |
|---|---|---|---|
| Standard race gate opening | 5 ft x 5 ft (1.52 m x 1.52 m) | cited | MultiGP "Standard MultiGP Gate 5'x5'" [9] |
| Large start/finish gate | 7 ft x 6 ft (2.13 m x 1.83 m) | cited | MultiGP "Champ Size Start-Finish Gate 7'x6'" [10] |
| Gates in the sim | 3.0 m wide x 2.4 m tall opening | assumption | About twice the standard width so a beginner gets through. `GATE_W`, `GATE_H` in `src/course.js`. |

## Lessons (M6)

| What | Value | Status | Source |
|---|---|---|---|
| Light wind (lesson 5, Ready check) | 2.6 m/s steady, from the left | cited | Beaufort force 2 "Light breeze", limits 4 to 6 knots (2 to 3 m/s); the middle, 5 knots x 0.514 = 2.6 m/s [11]. `WIND` in `src/lessons.js`. No gusts: no sourced gust figure yet. |
| Wind force on the quad | body drag on air speed (ground speed minus wind) | derived | Same drag numbers as above, applied to the velocity through the air; also used for the thrust loss with airspeed. `src/physics.js`. |
| Gentle landing | touchdown under 1.5 m/s | **UNSOURCED** | A judgement: a quarter of the 6 m/s crash speed. `GENTLE_LANDING`. |
| "Slow" in the turns lesson | under 8 m/s (29 km/h) | **UNSOURCED** | A judgement. `SLOW`. |
| Disarm reaction | within 1.0 s of the call | **UNSOURCED** | A judgement. `DISARM_REACTION`. |
| Heading tolerance | 20° either side | **UNSOURCED** | A judgement. `HEADING_TOL`. |
| Lesson layout | hover box 3 x 3 m, 1 to 3 m up; cones 8.6 m out; far ring 12 m out | assumption | Sized so the quad stays readable in line-of-sight view (within about 17 m of the pilot). |

## Look (M6b)
These are not flight parameters; they are listed so every number on screen has a known origin.

| What | Value | Status | Where from |
|---|---|---|---|
| Sun's width in the sky | 0.533° | cited | 1919 seconds of arc at 1 AU (1887 to 1952 over the year) [12]. `SUN_ANGULAR_DIAMETER` in `src/scene.js`. Sets the disc in the sky. |
| Soft edge of a shadow | grows 0.93 cm per metre between object and shadow | derived | tan(0.533°). Used for how fast the quad's shadow fades with height (`quadShadowStrength`). |
| Shadow position and length | object slid along the sun's rays onto the flat ground | derived | geometry; length = height / tan(sun elevation). Checked in the browser (18 m tower: 17.4 m). |
| Sun elevation and direction | 46° up, behind the pilot's left shoulder | **UNSOURCED** | A choice (mid-morning or mid-afternoon sun, not in the pilot's eyes on the pad). `SUN_DIR` in `src/scene.js`. |
| Haze | half of the contrast gone at about 800 m | **UNSOURCED** | A choice for depth cues; a real clear day has far less haze. Fog density in `buildScene`. |
| Quad shadow size and darkness | a 0.2 m disc, 42 % darker grass | **UNSOURCED** | The disc is the quad's outline with spinning props; the darkness is a choice. |

## Sources

1. Betaflight source, `src/main/fc/controlrate_profile.c`: https://github.com/betaflight/betaflight/blob/master/src/main/fc/controlrate_profile.c
2. Betaflight source, `src/main/fc/rc.c`: https://github.com/betaflight/betaflight/blob/master/src/main/fc/rc.c
3. Betaflight source, `src/main/flight/pid.c`: https://github.com/betaflight/betaflight/blob/master/src/main/flight/pid.c
4. Betaflight source, `src/main/flight/pid_init.c`: https://github.com/betaflight/betaflight/blob/master/src/main/flight/pid_init.c
5. Oscar Liang, "FPV Drone Rates and Expo Explained": https://oscarliang.com/rates/
6. Betaflight source, `src/main/flight/pid.h`: https://github.com/betaflight/betaflight/blob/master/src/main/flight/pid.h
7. Kaufmann, Bauersfeld, Scaramuzza, "A Benchmark Comparison of Learned Control Policies for Agile Quadrotor Flight", 2022, Table II: https://arxiv.org/pdf/2202.10796
8. Unmanned Tech, "FPV drone top speed: how fast, real world, by build class" (June 2026): https://www.unmannedtechshop.co.uk/blogs/knowledge-base/fpv-drone-top-speed-how-fast-real-world-by-build-class
9. MultiGP shop, "Standard MultiGP Gate 5'x5'": https://shop.multigp.com/?p=569
10. MultiGP shop, "Champ Size MultiGP Start - Finish Gate 7'x6'": https://shop.multigp.com/?p=615
11. Met Office, "Beaufort wind force scale" (force 2, Light breeze: 4-6 knots, 2-3 m/s; "for m/s multiply by 0.514"): https://weather.metoffice.gov.uk/guides/coast-and-sea/beaufort-scale
12. NASA NSSDC, "Sun Fact Sheet" (apparent diameter from Earth: at 1 A.U. 1919, maximum 1952, minimum 1887 seconds of arc): https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html
13. Betaflight 4.0 CLI command reference: https://betaflight.com/docs/wiki/guides/archive/Betaflight-4.0-CLI-commands
14. Betaflight CLI reference (current): https://betaflight.com/docs/wiki/guides/current/Cli
15. Betaflight 4.2 Tuning Notes (yaw): https://betaflight.com/docs/wiki/tuning/4-2-Tuning-Notes
16. Betaflight Mixer guide, "Mixer Algorithm (`mixer_type`)": LEGACY "enabled by default" (the old Mixer-Types page has moved): https://betaflight.com/docs/wiki/guides/current/Mixer ; source `mixer_init.c`: `mixerConfig->mixer_type = MIXER_LEGACY;`
17. IntoFPV, "Drone throttling upwards aggressively when yawing" (5-inch, Betaflight 4.4/4.5, pilot report): https://intofpv.com/t-drone-throttling-upwards-aggressively-when-yawing

## Yaw jump (M10d)
Mike, flying lesson 2: "when I turn I shoot up". Measured on the sim from a hover, throttle stick unchanged, yaw stick held 2 s: half yaw climbs 1.2 m, full yaw 4.2 m (after the yaw pidsum limit; 1.4 m and 4.7 m before it). After M12 (new drag, prop spin-up torque, yaw D = 0): half 1.2 m, full 5.0 m. The climb comes in the first 0.2 s: the yaw needs a big motor difference (prop drag torque is only 0.0122 m per newton of thrust, against 0.078 m of arm for roll), two motors drop to idle, so the mixer raises all four to keep the yaw (airmode-style), and the total thrust briefly reaches about 3x the weight.
- Real quads do this. Betaflight 4.2 tuning notes [15]: "for big, fast yaw inputs, the motors quickly get driven to a very high differential, with one pair at 100% and the other at zero", and they name "yaw jump" as a typical yaw problem. Betaflight's default mixer keeps throttle until it cannot, then "will drastically start to change throttle to still get desired authority" [16]. A 5-inch pilot reports the climb on "really sharp yaw turns", and a log reader says the motors were "maxed out and spun down all the way to idle in order to produce the needed yaw" [17].
- Not validated: no source gives a height for a real 5-inch, so the sim's 1.2 m / 4.2 m is the model's own number (**UNSOURCED** magnitude). Kept and taught: the Stick patterns card "Turn on the spot" shows a snapped yaw jumping up and a smooth yaw with a touch less throttle holding height.

## Still to source
See `docs/feel.md`, note 6 (UNSOURCED list) and note 7 (beginner quad specs).
