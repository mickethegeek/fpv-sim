# PROGRESS — the relay's log (newest at the bottom)

Status: **IN PROGRESS**
Next: M1
Live link: https://mickethegeek.github.io/fpv-sim/ (not checkable from the cloud sandbox, see Assumptions)

## Milestones
- [x] M0 Scaffold
- [ ] M1 Physics core
- [ ] M2 Controller input
- [ ] M3 FPV view + world  ← notify Mike when done
- [ ] M4 Gates + timer
- [ ] M5 Learning path
- [ ] M6 Settings + feel
- [ ] M7 Finish  ← notify Mike when done

## Assumptions made without asking Mike
(one line each: what, why, how to change it)
- Live link is assumed to be https://mickethegeek.github.io/fpv-sim/ (Pages from `main` root). The relay sandbox cannot reach github.io or the Pages API (proxy 403), so no leg can confirm it is switched on. If the link 404s: repo Settings → Pages → Deploy from branch → `main` / root. Tell Mike this in the M3 message.
- three.js r170 vendored as `vendor/three.module.min.js` (latest stable fetched from npm). Change by replacing the file.
- Axis conventions fixed in the header of `src/physics.js` (Y up, body -Z forward, quaternion [x,y,z,w]). Everything else follows them.

## Log
- 2026-11-16 09:46 UTC · M0 done: scaffold, vendored three.js r170, `npm test` (node unit tests), `node test/flight.mjs Mx` (Chrome flight script → proof/Mx/), static server in tools/ · next: M1 physics core
