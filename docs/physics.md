# Physics numbers and where they come from

Rule (RELAY.md): real-world numbers are looked up and cited here, never taken from memory.
Every parameter in `src/params.js` is listed below as **cited**, **derived** (computed from cited values), or **uncited** (a starting value from PLAN.md that no leg has sourced yet). Uncited values are open work for M6.

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
| Mass with battery | 0.68 kg | uncited | PLAN.md range 0.6 to 0.7 kg. Close to the 0.768 kg of [7], whose inertia is used. |
| Thrust-to-weight | 9 | uncited | PLAN.md range 8 to 10. Gives 15 N static thrust per motor. |
| Motor arm length | 0.11 m | uncited | PLAN.md |
| Motor time constant | 30 ms | uncited | PLAN.md range 20 to 40 ms. [7] models motors as first order but prints no value. |
| Quadratic body drag | 0.006 N per (m/s)² | uncited | placeholder, equal to a drag area of about 0.01 m² |
| Prop pitch speed at full throttle | tuned | tuned | Chosen so level top speed lands on the cited 150 km/h. See below. |

## Model choices

- **Thrust falls with airspeed.** A fixed-pitch prop makes less thrust as air flows faster through it. Model: `T = Tmax * u * (u - v_axial / v_pitch)`, clamped at 0, where `u` is motor speed 0..1 and `v_axial` is airspeed along the thrust axis. At rest this is `Tmax * u²`. This, not body drag, is what limits top speed, so the quad still coasts when you cut throttle. `v_pitch` is the one tuned number.
- **Throttle stick is linear in motor speed**, thrust goes with speed squared, so hover sits at `sqrt(1 / thrust-to-weight)` = 33 % stick.
- **Motors**: first-order lag on motor speed.
- **Integration**: 1 kHz fixed step, semi-implicit Euler, quaternion renormalised each step.

## Sources

1. Betaflight source, `src/main/fc/controlrate_profile.c`: https://github.com/betaflight/betaflight/blob/master/src/main/fc/controlrate_profile.c
2. Betaflight source, `src/main/fc/rc.c`: https://github.com/betaflight/betaflight/blob/master/src/main/fc/rc.c
3. Betaflight source, `src/main/flight/pid.c`: https://github.com/betaflight/betaflight/blob/master/src/main/flight/pid.c
4. Betaflight source, `src/main/flight/pid_init.c`: https://github.com/betaflight/betaflight/blob/master/src/main/flight/pid_init.c
5. Oscar Liang, "FPV Drone Rates and Expo Explained": https://oscarliang.com/rates/
6. Betaflight source, `src/main/flight/pid.h`: https://github.com/betaflight/betaflight/blob/master/src/main/flight/pid.h
7. Kaufmann, Bauersfeld, Scaramuzza, "A Benchmark Comparison of Learned Control Policies for Agile Quadrotor Flight", 2022, Table II: https://arxiv.org/pdf/2202.10796
8. Unmanned Tech, "FPV drone top speed: how fast, real world, by build class" (June 2026): https://www.unmannedtechshop.co.uk/blogs/knowledge-base/fpv-drone-top-speed-how-fast-real-world-by-build-class

## Still to source (M6)
Thrust per motor for a 2207-class motor on 6S with a 5-inch prop, all-up weight, motor time constant, arm length, camera uptilt and FOV. Two pages tried on 2026-11-16 had no usable figures (Unmanned Tech thrust-to-weight article; arXiv 2312.09981 covers 9 to 10 inch props only).
