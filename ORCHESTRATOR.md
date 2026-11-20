# ORCHESTRATOR — how this build is run (read this first in a new chat)

Mike plans and decides with the orchestrator (a Claude chat). The orchestrator never builds: it writes the plan, starts and watches the builders, and reports to Mike. Builders are fresh cloud sessions ("legs") that read this repo and do the work. **This repo is the memory** — not any chat.

## Files
| File | Who writes it | What it is |
|---|---|---|
| `PLAN.md` | orchestrator | Goal, Mike's fixed decisions (quoted), milestones. Builders never reopen fixed decisions. |
| `PROGRESS.md` | builders | Status, `Next:`, milestone checklist, log in Zurich time, notes between legs. |
| `RELAY.md` | orchestrator | Rules every leg follows: lock, leg budget, save every 15 min, verify in Chrome, hand over. |
| `REPORT.md` | builders | What's built, how it was checked, what's UNSOURCED or open. |
| `docs/` | builders | Physics, feel, theory, reviews — every number with a source. |

## Running a leg
- Scheduled task **"FPV sim relay"** (`trig_018PLv8MZ4mDMNXaZgtat56V`, model `claude-opus-5-5`; Fable now needs paid credits). Its hourly schedule is **off**: the orchestrator starts each leg with `fire_trigger` (firing does not re-enable it), passing the brief as the fire text. A backup task "FPV sim relay (backup)" (`trig_01PDndyURbRCFukXrgh5h99Z`) exists, also off.
- To add work: write it into `PLAN.md` (quote Mike), add it to the checklist and `Next:` in `PROGRESS.md`, set `Status: IN PROGRESS`, push, then fire.
- Watch: a `send_later` check every 20–30 min reads newest commit time, `LOCK`, Status/Next; if no leg is working and not DONE, fire again. If a run failed with "usage limit", tell Mike and stop.
- Report to Mike in the **final message** of a turn only (text between tool calls is hidden from him). Short, plain, Zurich time.

## Lessons from this build
- Legs can't start the next leg (blocked by the permission check): the orchestrator must.
- "Auto mode classifier gave no verdict" errors are transient; legs retry once and save often.
- A dead leg's `LOCK` goes stale after 25 min without a commit.
- Cloud network: Limited + `mickethegeek.github.io`, `raw/objects.githubusercontent.com` allowed (added 2026-11-18), so builders can test the live site.
- Mike's own flying finds what automated checks miss (the yaw climb); a fresh, independent leg finds what builders miss (M10f review, M12 inertia).
- Mike's 5-hour usage limit is what stops legs; nothing is lost, everything up to the last push survives.

## Status (2026-11-20)
- Phases 1–3 done. Live: https://mickethegeek.github.io/fpv-sim/ · repo public.
- Open on purpose: **I5** (orientation-dependent body drag; disarmed tumble never slows — the friend's exact example when disarmed), **I7b** (translational lift). See `docs/inertia-review.md`.
- Mike's "don't build" list is in `PLAN.md` ("Decided by Mike on 2026-11-17"). Replay is done.
- Waiting on: Mike's friend flying it again; Mike's go for I5.
