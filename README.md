# FPV sim

A browser simulator for learning to fly an FPV drone before you own one. A 5-inch freestyle quad on an open field, flown with a game controller. No install: open the link.

**Play:** https://mickethegeek.github.io/fpv-sim/

![The field from the air](proof/final/59-m6b-high-quality-field-and-shadows.png)

## Connect a controller

**PlayStation controller (DualShock 4 or DualSense)**
1. Plug it in with a USB cable, or pair it over Bluetooth.
2. Open the link and press any button on the controller. The panel at the top right shows its name.
3. No setup needed. It flies in Mode 2:

| Control | Does |
|---|---|
| Left stick up / down | throttle (stick centre = about hover) |
| Left stick left / right | yaw (turn) |
| Right stick up / down | pitch (forward / back) |
| Right stick left / right | roll (left / right) |
| R1 | arm / disarm |
| L1 | angle mode / acro mode |
| △ | FPV view / line-of-sight view |
| Options | reset to the pad |

To arm: pull the left stick down, then press R1. This is the same safety rule as a real quad (no arming with the throttle up).

**A real radio over USB (BetaFPV LiteRadio and others)**
1. Switch the radio on and plug it in. It shows up as a joystick.
2. The setup screen opens by itself: move each stick when asked, then flip the arm switch.
3. The radio keeps its own saved setup, separate from the PlayStation controller. Its throttle is linear, as on the real quad.

Other gamepads with the standard layout work like the PlayStation one (RB arm, LB mode, Y view, Start reset). "Set up controller" in the panel maps anything else. "Reset this controller" throws a saved setup away.

**No controller:** the keyboard works as a backup. The keys are listed on screen (W / S throttle, A / D yaw, arrows pitch and roll, Space arm).

## How to play

- **Lessons** (panel, top right). Eight lessons take you from the first take-off to a "real-drone ready" badge: hover, hover facing all four ways, turns and a figure 8, fly out and come back, the same in wind, emergencies, a first taste of acro, and a final check. A lesson is passed after 3 good runs in a row. Lessons 1 to 4 are flown twice: through the camera (FPV) and standing on the ground watching the drone (line of sight).
- **Free flight and gates** is always open: a 7-gate course with a lap timer. The orange gate is the next one. Your best lap is saved.
- **Angle mode** levels the quad when you let go. **Acro mode** does not: it holds the angle you leave it at, like a real FPV quad.
- **Quad** (under "Feel tuning"): *Trainer* is the same quad limited to 70 % power, the default. *5-inch freestyle* is full power.
- **Crash:** the quad goes back to the pad after a moment. R (or Options) does the same at any time.
- Other keys: V view, C chase view, O stick overlay, M mode.

## Settings

- **Graphics:** High or Low. The frame rate is shown next to it. If it is under 60, choose Low.
- **Feel tuning:** rates, expo, responsiveness, floatiness, throttle at stick centre, deadzone. "Reset to default" goes back to the sourced values.
- Everything is saved in the browser, per computer.

Link options: `?free` starts in free flight, `?unlock` opens every lesson, `?preset=freestyle` picks the full-power quad, `?quality=low`.

## How real is it

Every flight number comes from a published source or is marked UNSOURCED: Betaflight's default rates and tilt limit, bench thrust tables for 2207 motors on 6S, a measured motor time constant, measured rotor drag. The list, with links and the sim's measured values, is in [`docs/feel.md`](docs/feel.md) and [`docs/physics.md`](docs/physics.md). What is still open is in [`REPORT.md`](REPORT.md).

Physics runs at 1000 steps per second, whatever the frame rate.

## Run it yourself

No build step. Any static file server works:

```
node tools/serve.mjs 8080      # then open http://localhost:8080
npm test                       # unit tests (physics, controller, course, lessons)
node test/flight.mjs out       # flies the sim in Chrome, screenshots to proof/out/
```

Layout: `src/` (physics, flight controller, input, lessons, scene), `test/`, `docs/`, `proof/` (screenshots from the automated flights, one folder per milestone; `proof/final/` is the last full run), `vendor/` (three.js r170, the only library).
