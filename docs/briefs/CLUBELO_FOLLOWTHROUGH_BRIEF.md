# Brief — clubelo permission follow-through

**One PR. Closes the licence question, makes the reproduction gate CI-real,
reduces clubelo traffic, and prepares for the announced site relaunch.**

## 0 · Record the permission

Append to `docs/verification/clubelo.md` (append-only, per Addendum A §2.8):
date of the reply, the verbatim answer — „in principle this is fine, both, no
problem at all, just be aware that i relaunch the website before the new
season and have projections myself" — and what it covers: (a) the planned
access pattern, (b) public redistribution of derived rating snapshots
including the training Elo data. Note the relaunch announcement as an
operational fact (see §3). The standing courtesy rule stays in force verbatim:
**access as sparingly as possible; permission is not a licence to be greedy.**

## 1 · Commit the training Elo data — zero new requests

The data already sits behind `BUNDESLIGA_RATINGS_DIR` from the lab migration;
committing it costs **no clubelo request at all**. In this PR:

- Remove the `data/ratings/training-elo/` exclusion from `.gitignore`; commit
  the files with `source` fields and clubelo attribution, mirroring the
  OpenLigaDB pattern.
- The six licence-pending skips **become running tests** — the reproduction
  gate (8/8 bit-identical) now executes in CI on every push and PR.
- **The skip guard must move in the same commit:** it currently asserts
  exactly six skips; after this change the expected count is zero. Read the
  expected count from one place (a constant or small JSON next to the guard)
  so the next legitimate change touches one line, not the guard's logic.
- `refit.yml` now works on a fresh runner; remove the fresh-runner abort path
  and its message. Update `docs/DEVELOPMENT.md` and the CLAUDE.md state
  section (standing rule: same commit).
- §10 note: the deploy-key proviso for a private archive is moot; the storage
  adapter stays — it is good hygiene independent of the licence question.

## 2 · Fetch economy — the data-sparing rule as code

clubelo publishes at most one snapshot per day; our cron runs twelve times a
day and currently fetches the daily CSV on every run. Change: **skip the
clubelo fetch entirely when today's date is already in the archive** (the
OpenLigaDB fetch keeps its 2-hour rhythm — results do change intraday).
Effect: at most one clubelo request per day in steady state, ~11/12 less than
today. Log the skip in one line („clubelo: Tagesstand vorhanden, kein Abruf")
so a run's log still accounts for every source. The carry-forward logic is
untouched — it reads the archive, not the network.

## 3 · Relaunch preparedness — expect the interface to move

The operator relaunches the site before the season. Assume that endpoints,
name forms, or CSV shape may change **exactly in the weeks before the BL2
start (2026-08-07)**. No preemptive code changes — the existing guards
(≥100-row check, date-coverage ≥90 %, fail-closed mapping) are the correct
detectors. But write the playbook down so the first red run is diagnosed in
minutes, not hours. Append to `docs/verification/clubelo.md` and reference
from CLAUDE.md:

> Wenn der Cron nach dem Relaunch rot wird: zuerst Formatdrift annehmen, nicht
> Datenfehler. Prüfreihenfolge: (1) HTTP-Status und Zeilenzahl der Tages-CSV,
> (2) Header-Spalten, (3) Namensformen gegen das Mapping (beide Formen!),
> (4) Datumsabdeckung. Erst wenn alle vier stimmen, ist es ein Datenproblem.
> Nach dem Relaunch einmalig die Namensform-Verifikation aus
> docs/verification/clubelo.md für alle 36 Klubs wiederholen — als Gate-Lauf,
> nicht als Bulk (die Tages-CSV enthält alle Namen in einem Abruf).

A plausible upside, stated as hope not plan: the relaunch may unstick the four
frozen rating rows. If it does, the carry-forward markers clear themselves and
the 2026-08-14 flag simply expires unused.

## 4 · App B enters CI

Add `npm run build:kicktipp` to `test.yml` after the suite. Assert the output
exists and is **a single file** (the §9 form decision, now machine-checked).
No size gate, no content heuristics — build success plus single-file existence
is the contract; everything else is covered by the existing tests.

## 5 · Acceptance

- Permission recorded verbatim with date; courtesy rule restated.
- Training Elo committed with attribution; **zero clubelo requests in this
  PR** (assert by absence in the run log); reproduction gate green **in CI**;
  skip guard expects zero from a single-sourced count; `refit.yml`
  fresh-runner path removed.
- Steady-state clubelo traffic: one request per day, verified across two
  consecutive scheduled runs (first fetches, second logs the skip).
- Relaunch playbook appended; CLAUDE.md state section updated in the same
  commit.
- `test.yml` builds App B and checks single-file output; a deliberately broken
  import in `apps/kicktipp` turns CI red (prove once on a throwaway branch,
  as done for the test workflow).
