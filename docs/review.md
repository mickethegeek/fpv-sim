# M10f: independent physics review

Done on 2026-11-17 by a relay leg that did not build the physics. Method: every parameter in `src/params.js` and `src/physics.js`, and every factual sentence on the Learn cards (`src/curriculum.js`, `src/theory.js`, `src/patterns.js`), checked against its primary source, read again this leg (Betaflight source at tag 4.5.0 and 4.4.0 from raw.githubusercontent.com; the papers and bench pages listed below). betaflight.com itself was blocked by the proxy, so its docs were read from their Markdown source in the `betaflight/betaflight.com` repo. arXiv PDFs were blocked; the same papers were read from the authors' copies.

## Verdict in one line
The model's sourced numbers are right. Three card sentences were wrong for the sim or for real drones and are fixed; one model number (angle-mode gain) is double Betaflight's and is now marked as tuned; two model pieces stay **UNSOURCED** and are listed in REPORT.md.

## Findings

| # | What | Found | Action |
|---|---|---|---|
| R1 | Angle-mode gain (`angleGain` 10) | Betaflight 4.5: `pidRuntime.angleGain = pidProfile->pid[PID_LEVEL].P / 10.0f` with default P 50, so **5**; it then adds angle feedforward (`F/100`, default F 50) and a pt3 filter (`pid_init.c`, `pid.c` `pidLevel()`). The sim has no feedforward and uses 10 to get a similar lean time. docs/physics.md claimed the sim used 5. | Doc row corrected: sim value is **tuned**, not Betaflight's. Kept at 10 (with P alone at 5 the lean took 411 ms, docs/feel.md). Listed as UNSOURCED-tuned in REPORT.md. A later leg could model Betaflight's feedforward + filter and drop to 5. |
| R2 | Card "Momentum and drag" said air drag sets the top speed | Wrong for the sim: docs/physics.md "Model choices" says top speed is set by prop thrust falling with airspeed (`pitchSpeed`), not body drag. | Card text fixed: "The faster the air rushes through the props, the less they push, and that sets the top speed". |
| R3 | Card "Prop torque" compared the 1.2 cm twist with "the 11 cm arm that tilts it" | In an X frame the roll / pitch lever is 0.11 m × cos 45° = 7.8 cm (`d` in `physics.js`). | Card says "about 8 cm of lever for tilting (the 11 cm arm, at 45° in an X frame)". |
| R4 | Card "Stop" (Why?): tilting back "is the only brake a drone has" | Contradicts "Momentum and drag" (the air slows it too). | "Apart from air drag, that is the only brake a drone has." |
| R5 | Mass 0.68 kg | Source range 625 to 670 g (F7); 680 g is 10 g above it, and docs/feel.md said "ok". The PLAN rule says use the middle (about 650 g). | Not changed this leg (it moves hover throttle and every measured table); flagged. Effect: about 5 % more weight, hover stick about +0.5 points. Comment in `params.js` fixed (it still said "uncited"). |
| R6 | Motor idle "`motorIdle = 550`" | The field is `digitalIdleOffsetValue = 550`; `motor.h`: "Idle value for DShot protocol, full motor output = 10000". Value 5.5 % confirmed. | Name corrected in docs/physics.md, docs/feel.md and `params.js`. |
| R7 | Thrust cap when descending (`1.25 ×` static in `motorThrust`) | Not documented anywhere and no source. In descent the model gives *more* thrust (air coming up through the props), up to +25 %. Real quads in a fast vertical descent lose up to 20 % (vortex ring state, Veismann 2021): the sim errs the other way. The "Coming down" card already says the sim does not model this. | Marked **UNSOURCED** in `physics.js` and here; listed in REPORT.md. |
| R8 | Trainer hover in docs/feel.md table: "18.0 %" | Stale. `hoverStick()` with throttle limit 0.7 gives 21.4 % static; the measured value elsewhere on the page is 21.7 %. | Table corrected to 21.7 %. |
| R9 | Mixer source [16] | The Mixer-Types page has moved. Current docs (Mixer, "Mixer Algorithm"): LEGACY "enabled by default", "Keeps requested throttle position as long as possible, then drastically changes throttle to maintain authority". Source: `mixer_type = MIXER_LEGACY` in `mixer_init.c`. | Link and quote updated in docs/physics.md. |
| R10 | Motor time constant 33 ms (NeuroBEM) | Confirmed verbatim ("τΩ = 33 ms"), but the quad is a 752 g, 6-inch frame with 5-inch three-blade props and thrust-to-weight 4.5, on Hobbywing 2306 motors: heavier props-per-motor load than a 2207 freestyle quad. | Kept (best source found). Caveat noted here. |
| R11 | Linear drag 0.3 N per m/s on all axes | Kaufmann Table II: kvx = kvy = 0.3, kvz = 0.15, and randomised **±100 %** in that paper (0.3 ± 0.3), i.e. the authors treat it as poorly known. Faessler: 0.236 to 0.544 s⁻¹ (mass-normalised) on a 610 g quad at up to 4 m/s, dz set to 0. Rotor drag also scales with rotor speed, which the sim ignores (it applies with motors off too). | Kept; it is inside both sources. Extrapolation above 4 m/s noted. Feeds the UNSOURCED free-fall speed (60 km/h). |
| R12 | Inertia [2.5, 2.1, 4.3] × 10⁻³ kg m² | Kaufmann Table II, J = diag(Jx, Jy, Jz) on a 0.768 kg quad (not 0.752 kg: that is NeuroBEM). The sim maps 2.5e-3 to roll and 2.1e-3 to pitch. | Confirmed. The paper's x/y axis convention was not checked against the sim's roll/pitch mapping; the two differ by 20 %, small for feel. |
| R13 | Yaw torque per thrust 0.0122 m | c_d / c_l = 1.909e-8 / 1.563e-6 = 0.01221 (Table II, values confirmed). | Confirmed. |

## Confirmed as written (no change)
- Betaflight 4.5.0 `controlrate_profile.c`: `rates_type = RATES_TYPE_ACTUAL`, `rcRates = 7`, `rates = 67`, `rcExpo = 0` on all axes (70 / 670 deg/s, expo 0), `thrMid8 = 50`, `thrExpo8 = 0`.
- `rc.c`: the Actual rates formula exactly as in docs/physics.md; `SETPOINT_RATE_LIMIT_MAX 1998.0f` (in rc.c, not rc.h).
- `pid.c` 4.5.0: `.angle_limit = 60`, `[PID_LEVEL] = { 50, 75, 75, 50 }`; 4.4.0: `.levelAngleLimit = 55`. `pid.h`: `PIDSUM_LIMIT 500`, `PIDSUM_LIMIT_YAW 400`.
- Failsafe: "By default, the craft immediately disarms and drops" after `failsafe_delay` (1.5 s in 4.5); source `failsafe_procedure = FAILSAFE_PROCEDURE_DROP_IT`. The Lost signal card and its check question are right.
- DYS Storm 2207 1750 KV, HQ 5x4.3x3, about 24 V (MiniQuadTestBench): 192 / 554 / 1034 / 1531 g at 25 / 50 / 75 / 100 %. Exponent fit and the hover numbers (15 % freestyle, about 21 % Trainer) recomputed from `params.js`: right.
- Veismann et al. 2021 (NASA Ames): "mean thrust losses of up to 20% compared to hover conditions"; regime −2v_h < v_z < 0. Vehicle: a variable-pitch quad (modified Stingray 500) flown free in Caltech's vertical wind tunnel. The card's "NASA wind-tunnel tests of a quadcopter" is fair.
- Unmanned Tech: "A typical 6S 5-inch freestyle FPV drone can reach about 150 km/h".
- Oscar Liang camera angle: 10° to 15° for beginners, 20° to 35° freestyle.
- FOCA (Switzerland): an observer "positioned beside them" keeps the drone in VLOS "with the naked eye at all times"; EASA FAQ 116511: "a person next to you, a UA observer, keeping direct visual contact". The Spotter card is right.
- Card geometry: cos 30° = 87 %, cos 60° = 50 %, sin 30° = half sideways; 0.5^1.35 = 0.39 ("well under half"); one flip at 670 deg/s = 0.54 s.

## Still UNSOURCED after this review (also in REPORT.md)
Angle-mode gain 10 (R1, tuned); descent thrust cap +25 % (R7); quadratic body drag 0.006 and the 120 km/h free fall it gives (60 before M12); `pitchSpeed` 54 m/s (65 before M12) (tuned to the cited 150 km/h); yaw-jump height; crash speed 6 m/s; lesson limits (landing 1.5 m/s, slow 8 m/s, disarm 1.0 s, heading 20°); gamepad deadzone; look choices.

## Sources read this leg
- Betaflight 4.5.0 / 4.4.0 source: `src/main/fc/controlrate_profile.c`, `fc/rc.c`, `flight/pid.c`, `flight/pid.h`, `flight/pid_init.c`, `flight/failsafe.c`, `flight/mixer_init.c`, `pg/motor.c`, `drivers/motor.h` (raw.githubusercontent.com/betaflight/betaflight/4.5.0/...)
- Betaflight docs source: github.com/betaflight/betaflight.com, `docs/wiki/guides/current/Failsafe.md`, `Mixer.md`
- Kaufmann et al., ICRA 2022, Table II: https://lbfd.github.io/papers/ICRA22_Kaufmann.pdf
- Bauersfeld et al., NeuroBEM, RSS 2021: https://rpg.ifi.uzh.ch/docs/RSS21_Bauersfeld.pdf
- Faessler et al., rotor drag: https://arxiv.org/pdf/1712.02402v2
- MiniQuadTestBench DYS Storm 2207: https://www.miniquadtestbench.com/assets/components/motordata/motorinfo.php?uid=244
- Veismann et al. 2021: https://rotorcraft.arc.nasa.gov/Publications/files/77-2021-0193_Veismann.pdf
- Unmanned Tech top speed; Oscar Liang camera angle; FOCA flight rules; EASA FAQ 116511 (URLs as in docs/physics.md and docs/theory.md)
