# Inertia / coupling review (M12, phase 3)

Mike's friend: "the 3 dimensions aren't treated together when they should, allowing some impossible things, e.g. while falling down turning with the motors cut."

Reproduced with `node test/inertia-repro.mjs` (same physics and flight controller as the page). Output before any fix: `proof/M12/repro-before.txt`; after each fix: `proof/M12/repro-after-*.txt`.

## What the sim did (before M12)

| Manoeuvre | Sim | Real quad |
|---|---|---|
| B. Disarmed, spinning 600 deg/s roll, falling | still 600 deg/s after 3 s, for ever | motors off: no control torque, and the air slows the spin |
| E. Disarmed fall, flat vs rolled 90° | identical (14.4 m/s after 3 s in both) | drag depends on which way the air hits the frame and props |
| A/C. Zero-throttle flip, armed (airmode) | full 670 deg/s flip, collective thrust peaks at 1.6 x weight for a few ms | real: airmode does the same (keeps PID authority at zero throttle) |
| D. 30 m/s, throttle cut, full yaw | yaw 344 deg/s within 0.14 s; motors pushed to 80 % on one pair (yaw jump: quad climbs 1.6 m) | Betaflight does the same with pidsum_limit_yaw 400 (docs/physics.md "Yaw jump"); real yaw is helped by prop spin-up torque (not modelled, I6) |
| G. 20 m/s sideways, level | slows like any direction | rotor drag (in the rotor plane) is the strongest drag on a flying quad |

## Checked and correct

- **I1. Rigid-body equation and attitude update.** `I dω = τ − ω × Iω` in body axes (`stepPhysics`): the three cross-product components checked by hand. Quaternion update `q̇ = ½ q ⊗ (ω, 0)` with body-frame ω, normalised each step: correct. Torque from each motor `r × F` with r = (±d, 0, ±d): signs correct. Body vs world: thrust and torques built in the body frame, rotated to world for the linear motion. **No bug here**: rotations and translation are already coupled the right way (thrust follows the tilt, momentum keeps going when you yaw).

## Found and fixed

- **I2. No rotational damping from the props (fixed).** Each prop's thrust falls with the air flowing through it (`motorThrust`, docs/physics.md). The old model used the *body's* axial airspeed for all four props, so a roll or pitch rotation did not change any prop's airflow. Now each prop gets its own: body axial airspeed + (ω × r)·up. A motor swinging up loses thrust, one swinging down gains: a damping torque against the rotation, from the existing thrust law, no new number. Size: time constant I / (4 d² dT/dv) ≈ 1.3 s at hover, ≈ 3 s at idle, ≈ 0.5 s at full throttle (dT/dv = Tmax·n / v_pitch). Small against the rate loop (120 1/s), so the stick feel is unchanged (`node test/feel.mjs`: same numbers). Its size rests on `pitchSpeed`, which is tuned (to the 150 km/h top speed). Yaw is not damped by this (the props do not move axially in yaw). Test: `test/unit/inertia.test.mjs` I2.
- **I3. Linear drag was the same on every axis, in the world frame (fixed).** Rotor drag acts in the body frame: Faessler, Franchi, Scaramuzza 2018 [F], Eq. 2: `v̇ = −g z_W + c z_B − R D Rᵀ v`, D = diag(dx, dy, dz), "rotor drag, which is a linear effect in the quadrotor's velocity". Identified in-plane on a 610 g quad: dx 0.43 to 0.54 s⁻¹, dy 0.24 to 0.39 s⁻¹ (Sec. VII.C, Fig. 3), i.e. 0.15 to 0.33 N per m/s; dz set to 0 there ("a non zero drag coefficient in the z-direction does not improve the tracking"). The sim now uses the already-cited Kaufmann 2022 Table II values [7]: 0.3 N per m/s in the rotor plane, 0.15 along the thrust axis, applied as `R D Rᵀ v`. Test: I3. Side effect: level top speed rose to 162 km/h (motion at 75° tilt is half along the thrust axis), so `pitchSpeed` was retuned 65 → 60 m/s (150 km/h again).

## Found, still open (next legs)

- **I4. Disarmed / stopped-prop drag.** Rotor drag only exists while the props spin; [F] also assumes it does not depend on thrust ("not true in reality"). With motors off what is left is the parasitic drag of frame, stopped props and battery, which should depend on orientation (flat is draggier than edge-on). After I3 the sim has the opposite: a flat fall is now *faster* (18.3 m/s after 3 s) than edge-on (14.4) because the axial rotor-drag coefficient is the smaller one. Fix: make rotor drag scale with prop speed and give the quadratic drag per-axis areas, sourced.
- **I5. Disarmed spin never stops.** I2 only damps while the props spin. With motors off, the spin needs air drag on the arms and stopped props (quadratic in ω). Source a flat-plate drag coefficient and the arm / prop areas.
- **I6. Prop spin-up reaction torque on yaw** and **prop gyroscopic precession**: both missing. Check their size at 5-inch scale (prop inertia) with sources.
- **I7. Translational lift / in-plane airflow raising thrust**, and the vortex ring loss in descent (review R7): still missing.

## Sources

- [F] Faessler, Franchi, Scaramuzza, "Differential Flatness of Quadrotor Dynamics Subject to Rotor Drag for Accurate Tracking of High-Speed Trajectories", IEEE RA-L 2018: https://arxiv.org/pdf/1712.02402 (Sec. III Eq. 2 and 4, Sec. VII.A mass 610 g, Sec. VII.C and Fig. 3 coefficients).
- [7] Kaufmann, Bauersfeld, Scaramuzza 2022, Table II (docs/physics.md): k_vx, k_vy 0.3, k_vz 0.15 N per m/s. (Could not be reread this leg: fetch not permitted; values as cited by earlier legs.)
