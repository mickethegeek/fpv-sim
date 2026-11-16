# Physics numbers and where they come from

Rule (RELAY.md): real-world numbers are looked up and cited here, never taken from memory.
Every parameter in `src/params.js` is listed below as **cited**, **derived** (computed from cited values), or **uncited** (a starting value from PLAN.md that no leg has sourced yet). Since PLAN.md's real-data rule (2026-11-16), a value with no source is marked **UNSOURCED**. The newer sources (F numbers) are listed in `docs/feel.md`, which is the scoreboard.

Looked up 2026-11-16.

## Flight controller (Betaflight)

| What | Value | Status | Source |
|---|---|---|---|
| Default rates type | Actual | cited | Betaflight `controlrate_profile.c`: `.rates_type = RATES_TYPE_ACTUAL` [1] |
| Default center sensitivity (roll, pitch, yaw) | 70 deg/s | cited | `.rcRates[...] = 7`, multiplied by 10 in `applyActualRates` [1][2] |
| Default max rate (roll, pitch, yaw) | 670 deg/s | cited | `.rates[...] = 67`, multiplied by 10 [1][2] |
| Default expo | 0 | cited | `.rcExpo[...] = 0` [1] |
| Actual rates formula | see below | cited | `applyActualRates` in `rc.c` [2] |
| Setpoint hard limit | ±1998 deg/s | cited | `SETPOINT_RATE_LIMIT_MAX 1998.0f` [2] |
| Angle mode max tilt | 60° | cited | `.angle_limit = 60` in `resetPidProfile` [3] |
| Angle mode gain | 5 (deg/s of rate per degree of error) | derived | `angleGain = pid[PID_LEVEL].P / 10`, default P = 50 [3][4] |
| Typical freestyle Actual rates | center 100 to 200, max 800 to 1000, expo 0.5 to 0.7 | cited | Oscar Liang rates guide [5]. Not used as the default; offered for the M6 preset. |

Actual rates, from the Betaflight source [2] (stick `x` in −1..1, result in deg/s):

    expof = |x| * (x^5 * expo + x * (1 - expo))
    rate  = x * center + max(0, maxRate - center) * expof

Not copied from Betaflight: the PID loop itself. Betaflight's default gains (roll 45/80/30, F 120 [6]) are in its own internal units and depend on its filters and loop rate. The sim uses a PID on angular rate in physical units (`src/flightcontroller.js`), tuned so that a full-stick roll reaches the configured max rate within about 0.2 s (unit test).

## Airframe

| What | Value | Status | Source |
|---|---|---|---|
| Inertia roll / pitch / yaw | 2.5e-3 / 2.1e-3 / 4.3e-3 kg m² | cited | Kaufmann, Bauersfeld, Scaramuzza 2022, Table II, identified from a real racing quad of 0.768 kg [7] |
| Yaw torque per newton of thrust | 0.0122 m | derived | c_d / c_l = 1.909e-8 / 1.563e-6 from the same Table II [7] |
| Linear drag | 0.3 N per m/s | cited | k_vx, k_vy in Table II [7] (the paper uses 0.15 on the thrust axis; the sim uses 0.3 on all axes) |
| Level top speed target | about 150 km/h | cited | "A typical 6S 5-inch freestyle FPV drone can reach about 150 km/h" [8] |
| Mass with battery | 0.68 kg | cited | 625 to 670 g with a 6S 1300 mAh pack (`docs/feel.md` F7) |
| Thrust-to-weight | 9 | cited (range) | 7.5 measured in flight trim on an 870 g race quad, 10 to 11 from bench thrust (`docs/feel.md` F4 to F6); 9 is the middle. Gives 15 N static thrust per motor. |
| Motor arm length | 0.11 m | cited | 107.5 to 112.5 mm (`docs/feel.md` F4, F9) |
| Motor time constant | 33 ms | cited | NeuroBEM paper (`docs/feel.md` F8) |
| Thrust against command | max x command^1.35 | cited (fit) | middle of two 2207 6S bench tables, 1.24 and 1.45 (`docs/feel.md` F5, F26, note 2) |
| Idle command | 5.5 % | cited | Betaflight default `motorIdle = 550` (`docs/feel.md` F25) |
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

## Still to source
See `docs/feel.md`, note 6 (UNSOURCED list) and note 7 (beginner quad specs).
