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

## After the fixes (`proof/M12/repro-after.txt`)

| Manoeuvre | Before | After |
|---|---|---|
| Hover spin damping (motors held) | none | 64 % of a roll rate left after 0.5 s (I2) |
| 20 m/s sideways, level, hover throttle | slowed by world drag | slowed by rotor drag in the prop plane, 0.3 N per m/s at hover prop speed, more at full throttle (I3, I4) |
| Disarmed fall | 0.3 N per m/s rotor drag even with props stopped | no rotor drag; 120 km/h terminal (UNSOURCED quadratic drag only) |
| Straight down at 7 m/s | +25 % thrust | 80 % of hover thrust (I7a) |
| Full yaw from hover, 90 % of rate | 208 ms | 183 ms (prop spin-up kick, I6) |
| Zero-throttle flip (airmode) | full rate | full rate (real) |
| 30 m/s, throttle cut, full yaw | the quad keeps going the old way, nose turns | same: that is momentum, correct |

## Checked and correct

- **I1. Rigid-body equation and attitude update.** `I dω = τ − ω × Iω` in body axes (`stepPhysics`): the three cross-product components checked by hand. Quaternion update `q̇ = ½ q ⊗ (ω, 0)` with body-frame ω, normalised each step: correct. Torque from each motor `r × F` with r = (±d, 0, ±d): signs correct. Body vs world: thrust and torques built in the body frame, rotated to world for the linear motion. **No bug here**: rotations and translation are already coupled the right way (thrust follows the tilt, momentum keeps going when you yaw).

## Found and fixed

- **I2. No rotational damping from the props (fixed).** Each prop's thrust falls with the air flowing through it (`motorThrust`, docs/physics.md). The old model used the *body's* axial airspeed for all four props, so a roll or pitch rotation did not change any prop's airflow. Now each prop gets its own: body axial airspeed + (ω × r)·up. A motor swinging up loses thrust, one swinging down gains: a damping torque against the rotation, from the existing thrust law, no new number. Size: time constant I / (4 d² dT/dv) ≈ 1.3 s at hover, ≈ 3 s at idle, ≈ 0.5 s at full throttle (dT/dv = Tmax·n / v_pitch). Small against the rate loop (120 1/s), so the stick feel is unchanged (`node test/feel.mjs`: same numbers). Its size rests on `pitchSpeed`, which is tuned (to the 150 km/h top speed). Yaw is not damped by this (the props do not move axially in yaw). Test: `test/unit/inertia.test.mjs` I2.
- **I3. Linear drag was the same on every axis, in the world frame (fixed).** Rotor drag acts in the body frame: Faessler, Franchi, Scaramuzza 2018 [F], Eq. 2: `v̇ = −g z_W + c z_B − R D Rᵀ v`, D = diag(dx, dy, dz), "rotor drag, which is a linear effect in the quadrotor's velocity". Identified in-plane on a 610 g quad: dx 0.43 to 0.54 s⁻¹, dy 0.24 to 0.39 s⁻¹ (Sec. VII.C, Fig. 3), i.e. 0.15 to 0.33 N per m/s; dz set to 0 ("a non zero drag coefficient in the z-direction does not improve the tracking"). Martin 2014 [M] Eq. 1: the velocity terms "arise from the velocity imbalance of the blade on a complete turn" and lie in the rotor plane. So the sim now applies 0.3 N per m/s (Kaufmann Table II k_vx, k_vy [7]) in the rotor plane, in the body frame, and **none along the thrust axis**: the axial effect is already in the thrust law (thrust falls with axial inflow), and Kaufmann's k_vz = 0.15 stands in for that in a model without inflow, so using both would count it twice. Test: I3.
- **I4. Rotor drag did not depend on the props spinning (fixed).** Martin 2014 [M] Eq. 1: per rotor the drag is λ₁ · ω_i · (in-plane airspeed), linear in rotor speed; NeuroBEM [N] Sec. III-C: induced drag "depends on the propeller speed and body-relative air velocity", "the dominant source of drag for quadrotors". The sim now scales the in-plane coefficient by mean prop speed / hover prop speed (the cited 0.3 holds at hover: an assumption, the papers identified it in flight near hover thrust). Effects: none with the props stopped (disarmed), 0.17 at idle, 0.9 at full throttle. Measured (`node test/feel.mjs`): coasting from 23 km/h unchanged (1.5 s to half speed), falling with motors off 60 → 120 km/h (now only the UNSOURCED quadratic drag), `pitchSpeed` retuned 65 → 54 m/s so the angle-mode top speed is 151 km/h again. Test: I4.
- Felt change from I3: a climb or a sink slows only through the prop inflow now (about 0.38 N per m/s at hover, time constant about 1.8 s; was 0.63 and 1 s), so after a punch the quad floats up longer before it settles. Kaufmann's k_vz = 0.15 [7], identified on a real quad with a model that has no inflow term, suggests real axial damping is if anything smaller still. Two old browser checks waited too little for this and were given more time (M1 hover, M5 pad hover).
- With I3 + I4 a flat and an edge-on disarmed fall are again identical: the leftover quadratic drag is still the same on every axis (I5).
- **I6. Spinning props were massless (fixed).** Each prop carries angular momentum J·Ω along the motor axis. J = 13.4 g cm² = 1.34e-6 kg m² for a 5-inch tri-blade (Emax Avan Flow 5x4.3x3, maker's spec [E]; the motor bell is not included, so this is a lower bound); Ω = 31,277 rpm = 3275 rad/s at full command (T-Motor P2306 V3 1750 KV with a T5143S-3 prop at 24.8 V, maker's table [T]; LIGPOWER V2207.5 1750 KV gives 29,000 to 31,100 rpm at 22.3 V [L]); prop speed follows the sim's n. Two effects, both in `stepPhysics` now:
  - **Spin-up reaction (yaw):** speeding a prop up twists the frame the other way, τ = −dH/dt. A yaw command speeds two props up and slows two: from hover the yaw rate after 20 ms is more than 1.3x what drag torque alone gives. Real quads yaw with this "kick" first. Measured: full-stick yaw from hover reaches 90 % of 670 deg/s in 183 ms (208 before). The yaw jump from hover over 2 s: 5.0 m full stick, 1.2 m half (docs/physics.md "Yaw jump"; size still UNSOURCED).
  - **Gyroscopic coupling:** τ = −ω × H. With all four props equal, two spin each way and H = 0: no coupling in a normal flip or roll. Only while yawing hard (one pair fast, the other at idle) is there a net H, at most 7.6e-3 N m s, giving 0.09 N m at 670 deg/s of roll, against about 2.3 N m of roll control: a 4 % effect the rate loop absorbs. Small, as expected for a 5-inch, but now there.
  - Side effect: the instant reaction torque made the yaw D-term ring (the D term sees its own output with no lag). Betaflight's own default has **no yaw D**: `PID_YAW_DEFAULT { 45, 80, 0, 120 }` in 4.5.0 `src/main/flight/pid.h` [B]. The sim now does the same (`kdYaw: 0`). (The same file gives roll D 40; docs/physics.md said 30, corrected.)
  - Test: I6 (yaw kick with vs without prop inertia; gyroscopic pitch from roll with uneven props).

## Found, still open (next legs)

- **I5. Body (parasitic) drag the same on every axis, and a disarmed spin that never stops.** With the props stopped what is left is the frame, stopped props and battery. Flat should be draggier than edge-on, and the arms and stopped blades should slow a tumble (flat plate Cd 1.28, NASA Glenn [G]). Needs sourced areas of a 5-inch frame, battery and stopped props (top vs side). Not found yet: the battery (CNHL 1300 6S, 77 x 48 x 33 mm [C]) and frame (SpeedyBee FS225: 225 mm wheelbase, 5 mm arms, 36 mm tall [S]) have published sizes, but arm width and stopped-blade area do not. Left open on purpose: it changes only a disarmed quad, which always ends in a crash, so it matters least to what a pilot can do. I2 does not help here because it needs spinning props.
- **I7a. Vortex ring state (fixed).** Before, sinking along the thrust axis gave *more* thrust (up to +25 %, review R7), so a fast vertical drop was free. Veismann et al. 2021 [V] measured "mean thrust losses of up to 20% compared to hover conditions" in the regime −2v_h < v_z < 0 (v_h = hover induced speed). Now: v_h from momentum theory at the prop's current thrust, v_h = √(T / 2ρA) (5-inch disc, ρ = 1.225), 7.3 m/s for this quad at hover; between 0 and 2 v_h the thrust blends (sin², UNSOURCED shape) toward 80 % of hover thrust, worst at v_h, and the loss fades out as in-plane airspeed reaches v_h (UNSOURCED: moving forward leaves the wash behind, as the card says). At hover thrust: 1.00 / 1.06 / 0.98 / 0.80 / 0.93 / 1.25 x at 0 / 2 / 4 / 7 / 10 / 16 m/s of sink. So a slow descent is unchanged, a fast straight drop sinks faster and faster (the real runaway), and coming down while moving forward is safe. The shaking pilots feel is not modelled. The two curriculum demos that come down "just under hover" now cut 2 % stick instead of 3 to 4 % (with 4 % the freestyle quad now runs into the ring and drops). Card "Coming down" no longer says the sim does not model it. Test: I7.
- **I7b. Translational lift** (in-plane airflow raising thrust): still missing; the thrust law only knows the axial airflow. Needs a sourced size for a 5-inch prop.

## Sources

- [F] Faessler, Franchi, Scaramuzza, "Differential Flatness of Quadrotor Dynamics Subject to Rotor Drag for Accurate Tracking of High-Speed Trajectories", IEEE RA-L 2018: https://arxiv.org/pdf/1712.02402 (Sec. III Eq. 2 and 4, Sec. VII.A mass 610 g, Sec. VII.C and Fig. 3 coefficients).
- [M] P. Martin, "Accelerometers on Quadrotors: What do they Really Measure?", AerospaceLab 8, 2014, Eq. 1: https://aerospacelab.onera.fr/aerospacelab/sites/default/files/2024-01/AL08-06.pdf
- [N] Bauersfeld, Kaufmann, Foehn, Sun, Scaramuzza, "NeuroBEM: Hybrid Aerodynamic Quadrotor Model", RSS 2021, Sec. III-C: https://arxiv.org/pdf/2106.08015
- [G] NASA Glenn, "Shape Effects on Drag": flat plate Cd = 1.28: https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/shape-effects-on-drag/
- [E] Emax Avan Flow 5x4.3x3 product page, "Moment of inertia: 13.4 g*cm^2": https://www.emaxmodel.com/avan-flow.html
- [T] T-Motor P2306 V3 thrust table (1750 KV, T5143S-3, 24.8 V: 31,277 rpm, 1612 g at 100 %): https://store.tmotor.com/product/p2306-v3-fpv-motor.html
- [L] LIGPOWER V2207.5 V2 thrust table (1750 KV, 6S): https://www.ligpower.com/jp/product/v2207_5-v2-fpv-motor.html
- [B] Betaflight 4.5.0 `src/main/flight/pid.h`, PID_ROLL_DEFAULT { 45, 80, 40, 120 }, PID_YAW_DEFAULT { 45, 80, 0, 120 }: https://github.com/betaflight/betaflight/blob/4.5.0/src/main/flight/pid.h
- [V] Veismann et al. 2021 (NASA Ames): https://rotorcraft.arc.nasa.gov/Publications/files/77-2021-0193_Veismann.pdf
- [C] CNHL Black Series V2.0 1300 mAh 6S, getfpv: https://www.getfpv.com/cnhl-black-series-v2-0-1300mah-22-2v-130c-6s-lipo-battery-xt60.html
- [S] SpeedyBee 5" Freestyle Frame, getfpv: https://www.getfpv.com/multi-rotor-frames/5-quad-frames/speedybee-5-freestyle-frame.html
- [7] Kaufmann, Bauersfeld, Scaramuzza 2022, Table II (docs/physics.md): k_vx, k_vy 0.3, k_vz 0.15 N per m/s. (Could not be reread this leg: fetch not permitted; values as cited by earlier legs.)
