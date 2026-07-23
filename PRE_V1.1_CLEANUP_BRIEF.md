# Brief — Pre-V1.1 cleanup

**Small, blocking, one PR. V1.1 starts when this is merged. Nothing here is
new design — it closes the acceptance gaps from the fit-extraction review and
sets the already-decided carry-forward flag.**

## 1 · CLAUDE.md — complete what Phase 4 ordered

Phase 4(b) of the fit-extraction brief is done (refit paragraph replaced,
summation-order entry added — keep both). Points (a) and (c) are not:

1. **Precedence chain.** The spec-pointer section names only v5.6 and the
   v5.7 erratum. Replace the list with the full chain, later beats earlier:

   `BUNDESLIGA_APPS_BRIEF_V5.6_FINAL.md` → `V5.7_ERRATUM_AND_V1_FIXES.md` →
   `V5.7_ADDENDUM_CLUBELO.md` → `FIT_EXTRACTION_BRIEF.md`

   One sentence each on what the last two govern (bounded carry-forward and
   CSV date check; fit procedure, reproduction gate, summation order =
   Process B).

2. **„Aktueller Zustand" is self-contradictory.** The first two bullets still
   claim the blocked pipeline and the displayed, completed 2025/26 season with
   100 % forecasts — directly above the newer, correct fit bullets. Replace
   them with the truth at HEAD: season 2026/27 live; four clubs on a
   carried-forward rating from 2026-07-03, visibly marked; the hard 42-day
   ceiling makes carry-forward impossible after **2026-08-14** regardless of
   any flag.

3. **The standing rule, verbatim, as the first line of the section:**
   „Wer den Projektzustand ändert, aktualisiert diese Sektion im selben
   Commit." It was ordered in Phase 4 and is absent — and the drift it
   prevents already happened once.

## 2 · Test skips must say why

A fresh checkout runs 297 of 303 tests; six skip because the clubelo-derived
training Elo data is not committed. Verify each skip message names the missing
prerequisite (`BUNDESLIGA_RATINGS_DIR` / `data/ratings/training-elo/`) and
states that this is the licence-pending state, not a defect — so a future
„297/303" alarms nobody and misleads nobody. If any of the six skips silently,
give it a reason string. Add one line to `docs/DEVELOPMENT.md` and to the
CLAUDE.md state section: the reproduction gate is currently verifiable only
locally; it enters CI the day the training data may be committed.

## 3 · Carry-forward flag in `data.yml` — the decided option

Add `--carry-forward-until=2026-08-14` to the scheduled pipeline invocation,
with a comment carrying the reasoning so the file explains itself:

```yaml
# Zeitlich begrenzte Brücke (Addendum A §2.6): clubelo führt vier Klubs seit
# 2026-07-03 nicht fort. 2026-08-14 ist der Tag, an dem die harte 42-Tage-
# Decke ab effectiveAt ohnehin greift — danach ist der Übertrag unabhängig
# von dieser Flag unmöglich und der Lauf scheitert wieder fail-closed.
# Läuft von selbst ab; NICHT verlängern. Wenn clubelo bis ~2026-08-10 die
# vier Klubs nicht wieder führt, ist eine Eskalation fällig (zweite Mail an
# den Betreiber, mit Hinweis auf die am 03.07. geschlossenen Reihen).
```

The flag changes no default anywhere else: manual runs and every other entry
point stay fail-closed without it.

## 4 · Acceptance

- CLAUDE.md: full four-document precedence chain; state section true at HEAD
  with the standing rule as its first line; no bullet contradicts another.
- All six data-dependent skips carry a reason naming the missing data and the
  licence-pending state; `docs/DEVELOPMENT.md` notes the local-only
  reproduction gate.
- `data.yml` carries the dated flag with the comment block; the next scheduled
  run commits 2026/27 data instead of failing; Actions notifications stop
  arriving twelve times a day.
- No engine, model, or artefact change of any kind in this PR — if one seems
  needed, stop and report instead.

**After merge, V1.1 is released, with two scope additions carried over:** the
pre-season table ordered by expected points (presentation order only; the
shared rank stays displayed and the caption says so), and everything else per
v5.6 §6/§7/§11 V1.1 as amended by the erratum.
