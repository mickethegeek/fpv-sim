# RELAY — instructions for every session

You are one leg of a relay building Mike's FPV simulator. A scheduled task starts a fresh session every hour. You have no memory of previous legs: **this repo is the memory.** Your job: move the work forward, save it, hand over cleanly.

## 1. Start
1. Read `PLAN.md`, `PROGRESS.md`, `RELAY.md` in full.
2. **Done?** If `PROGRESS.md` says `Status: DONE`: turn off this scheduled task (list_triggers, find every scheduled task whose name starts with "FPV sim relay" (the main one and the backup), update_trigger enabled=false on each) and stop.
3. **Lock.** If a file `LOCK` exists on main **and the newest commit on main is less than 25 minutes old**, another leg is working: stop without changing anything. (Working legs push at least every 15 minutes, so a lock with no commit for 25 minutes belongs to a leg that died: take it over.) Otherwise write `LOCK` with the current UTC time, commit "lock", push. If the push is rejected, someone else just took it: stop.

## 2. Work
- Do the milestone named in `Next:`. Budget: **about 45 minutes of work or 2 milestones, whichever comes first**, then hand over. Short legs mean a usage-limit cut-off loses little.
- **Save after every working step:** commit + push with a clear message, and append one line to the Log in `PROGRESS.md` (`UTC time · what changed · what's next`). Never leave more than ~15 minutes of work unpushed.
- **Verify before ticking a milestone:** run the unit tests and the browser flight script; save screenshots to `proof/Mx/`; look at them yourself. A milestone is ticked only when it works in the browser, not when the code looks right.
- **Never ask Mike questions mid-relay.** Take the most sensible default, write it under "Assumptions" in `PROGRESS.md`, keep going. Stop only for something that can't be undone.
- Don't reopen anything under "Fixed decisions" in `PLAN.md`.
- Look up real-world numbers (rates, motor lag, masses, speeds) and cite them in `docs/physics.md`. Never from memory.

## 3. Hand over (always, even if you're stopping early)
1. Update `Next:` and `Status:` (`IN PROGRESS` or `DONE`) in `PROGRESS.md`.
2. Delete `LOCK`. Commit, push.
3. If you just ticked **M3** or **M7**: send Mike a SendUserMessage, 4 lines max: what he can do now, the live link, the single thing you most want him to try or decide. (After M7: also how to plug in his controller.)
4. If this was M7: set `Status: DONE`, turn off both "FPV sim relay" scheduled tasks (main and backup).
5. **Chain the next leg.** If `Status` is not `DONE`, start the next leg right away: list_triggers, find "FPV sim relay", then fire_trigger on it. Do this as your very last action, after the lock is deleted and pushed. If the fire fails (for example a usage limit), do nothing else: the hourly run at :45 restarts the relay.

## If tool checks fail ("auto mode classifier gave no verdict")
This is a temporary failure of the safety check, not a refusal. Retry the same command once. If it keeps failing, do read-only work (reading code, planning the next step) and try again a few minutes later. If it still fails and the turn is about to stop, nothing is lost: everything up to your last push is saved, and the next leg takes over the lock after 25 minutes. Don't try to work around the check with a different command.

## Rules
- Work on `main`. Small commits. Plain commit messages, **no Co-Authored-By lines** (Mike's rule).
- Never handle tokens, passwords or keys.
- Use `gh api` (REST) for GitHub; GraphQL is unavailable. Push with `git -c push.negotiate=true push`.
- No CDNs at runtime: vendor libraries into `vendor/` (npm is reachable for fetching them).
