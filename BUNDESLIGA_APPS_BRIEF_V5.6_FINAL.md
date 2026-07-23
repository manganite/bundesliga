# Build Brief v5.6 — Bundesliga-Simulator + Kicktipp-Optimierer

**Supersedes v1–v5.5 and all addenda. Work from this file alone.**

**This version is frozen as the sole build specification.** Five review rounds
(v5.1–v5.5) closed every delegated decision, fixed the statistical and
governance contracts, and baked in the completed external verifications. v5.6
adds only the two final acceptance/governance hardenings from the last review:
the annual refit is now an **explicit acceptance criterion** (so the two-process
workflow cannot be built half), and the **reproduction tolerance for the
Process-A escape hatch is fixed ex ante** in checked-in configuration, never
chosen after seeing the result. The remaining before-building verifications in
§11 are deliberate gates, not open questions. Every open choice below is
decided; where a decision is genuinely the user's, it is marked **[USER]**.

## Reference material

| what | where |
|---|---|
| WM app repo — architecture and components to reuse | https://github.com/manganite/wm2026 |
| WM app live | https://manganite.github.io/wm2026/ |
| Model lab — evidence and fitted parameters | https://github.com/manganite/football-model-lab |

Do not modify either repo.

---

# 0 · Decisions that were ambiguous in v4

**"Private" means "not published as a website", nothing more.** App B lives in the
public monorepo, so **its source is public**. This is **decided** (option A) — the
acceptance criteria must not ask for it again. No personal data, no credentials,
no pool identifiers in the repo. **[USER]** Only if you later want the code itself
hidden does App B move to a separate private repo consuming the engine as a
versioned package.

**App B's form is decided: a single self-contained HTML file.** No dev server —
it must be openable on a phone at tipping time.

**Why a forecast moves.** The v4 wording ("caused by rating updates, never by
parameter adaptation") was wrong. Use this instead, everywhere:

> „Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings.
> Die Modellparameter bleiben während der Saison unverändert."

**The live-vs-frozen comparison is descriptive, not a decomposition.** v4 called
the gap a "revaluation effect" and the frozen curve a "points effect". That is
causal language for a counterfactual contrast; the frozen curve also carries
reduced remaining uncertainty, changed table and tiebreak situations, and
schedule interactions. Label the two curves neutrally —
**„Prognose mit eingefrorener Saisonstart-Stärke"** and **„zusätzliche
Veränderung bei aktuellen Ratings"** — and state in the caption that this is a
descriptive comparison, not a causal attribution.

---

# 1 · Release slicing

v4's scope was a multi-release roadmap. Build in this order; each release must be
independently shippable and useful.

| release | contents |
|---|---|
| **V1** | Current season, **Bundesliga only**. Pages: Übersicht (reduced), Tabelle & Prognose, Spieltage, Teams. Data pipeline with **rating snapshot archiving from day one**. Timeline in its *frozen-rating* form only (see §5). |
| **V1.1** | 2. Bundesliga via league toggle; relegation play-off (§6). |
| **V1.2** | Modellgüte page (calibration, accuracy, scorecard). **Live-rating timeline and the frozen/live comparison** — possible only once snapshots have accumulated. |
| **V2** | Szenarien page (what-if, "was muss passieren", sample season); historical seasons (replay, surprise-champion panel, historical annotations). **Historical window: 1995/96 onward** — see §5.4. |
| **App B** | Separate track, independent of the above. |

**Critical sequencing:** rating snapshots must be archived from **V1 day one**,
even though nothing uses them until V1.2. Without that, the live-rating timeline
can never be built retroactively.

---

# 2 · The model — settled

**Poisson + Dixon-Coles (`v1`), live per-match club ratings, flat fitted
`HOME_ADV`.**

The following mechanisms were all tested in the lab and are **not built**,
because no measurable advantage was found under this model form, window and
power — *not* because absence was proven: negative-binomial dispersion,
ordered-outcome hybrid, per-club home advantage, pairwise "Angstgegner" term,
in-season parameter refitting, recency weighting.

The one positive result is **live ratings instead of pre-season ratings**:
positive in 9 of 10 held-out seasons, season-clustered CI ≈ **[0.001, 0.024]**
log-loss. Do not quote the lab's per-match intervals — they are too narrow.

Ship parameters as `data/season-params.json` from the **Track C pooled BL1+BL2
fit** (not Track A's BL1-only figures), stamped with fit date and season window.
Refit once before each season, never during.

**One parameter set serves both leagues.** The pooled fit yields a single set;
per-league distinctions (e.g. a league-specific baseline goal rate — BL1 and BL2
differ measurably in scoring) exist **only** where `season-params.json` itself
carries per-league fields from the lab fit. The apps consume what the file
provides and **never synthesise per-league parameters**. Whether the Track C
artefact distinguishes league baselines is a **before-building verification
item** (§11): if it does not, BL2 forecasts inherit the pooled baseline, and
that must be a documented, deliberate state — not an accident.

---

# 3 · Monte-Carlo contract

| item | decision |
|---|---|
| `RATING_SIGMA` | Gaussian noise on each club's rating, drawn **once per club per simulation run**, independent across clubs. One run = one hypothetical "true strength" configuration. It represents uncertainty about strength, not match-level randomness. |
| default runs | 20,000 for the current outlook; 5,000 for timeline points; user-adjustable |
| mobile | lower default (e.g. 5,000) with a note; never block the UI |
| **two keys, never one** | v5 made the seed depend on the data hash *and* demanded CRN across data states — those contradict, because the hash changes every matchday and the streams then diverge. Separate them: **cache/artefact key** = `(dataHash, runCount, engineVersion)`, deciding *which artefact* is being viewed; **random key** = independent of the data state. |
| **random key** | fixture draws: `(seasonId, simulationProtocolVersion, runIndex, fixtureId, drawKind)`; club rating noise: `(seasonId, simulationProtocolVersion, runIndex, clubId)`. **`runCount` is deliberately absent** — raising the run count must extend the sample, not resample it, so the first N runs stay identical. |
| **one simulation per data state** | The artefact is identified by the cache key alone — **never by the UI view**. Compute one distribution per data state and let every page consume it, so Übersicht and Tabelle can never disagree about the same number. |
| **common random numbers** | Because the random key excludes the data state, a fixture still unplayed in two data states draws the *same* numbers in both, so most simulation error cancels in the difference. |
| **sampling mechanism — inverse CDF, mandatory** | CRN only cancels error if the *same underlying uniform* maps to *nearby outcomes* when the distribution shifts. Therefore: derive a **deterministic uniform** from the random key (counter-based generator, e.g. hash/Philox-style — no mutable stream state), then map it through the **quantile function** of the target distribution — for fixture draws the Dixon-Coles-corrected scoreline distribution (one uniform per fixture over a canonical scoreline ordering, fixed in the engine and never changed without bumping `simulationProtocolVersion`), for club noise the inverse normal CDF. A stream-based sampler (Knuth Poisson, rejection methods) consumes a data-dependent number of variates, silently desynchronises the streams, and destroys the promised cancellation despite identical seeds. |
| **canonical artefact for deltas** | Displayed matchday deltas always come from the **canonical pipeline artefact** (20,000 runs). The user's run-count control changes the current view only — it must never silently change the basis of a historical difference. |
| **delta standard error** | Estimate SE(Δ) **empirically from paired batches**. Split the runs into `B` equal batches (e.g. 20 × 1,000). With CRN, batch `b` uses the same random stream in both data states, so `Δ_b = p_new,b − p_old,b` is a *paired* difference. Then: **`SE(Δ) = SD(Δ_b) / √B`** — the sample SD of the batch differences **divided by √B**. (v5 said only "the SD of the batch-level differences", which is the spread of a *single* batch, not the SE of the overall estimate; at B = 20 that made the floor ≈ 4.5× too large and would have hidden genuine movement as „unverändert".) |
| **noise floor** | Suppress changes below **2 · SE(Δ)** and display them as „unverändert". Illustrative scale only: at N = 20,000 and B = 20, the floor is ≈ 0.8 pp without CRN; with CRN it is substantially smaller, but **how much smaller depends on the correlation between the two data states and must be measured, not assumed** — CRN guarantees no fixed reduction. |
| snapshots | Store, per snapshot, **the per-batch target frequencies** — not only the aggregate distribution. Without them the paired batch differences cannot be recomputed later, and SE(Δ) is not obtainable. Snapshots feed both the deltas and the timeline: build once, use twice. |
| heavy artefacts | full timeline simulations are **precomputed in the pipeline** and committed, never recomputed per browser visit. |

---

# 4 · Metric definitions

Every metric below must exist as a documented, unit-tested function in
`packages/engine`. UI and tests consume that function; neither re-implements it.

| metric | definition |
|---|---|
| **Spannungsindex** | Shannon entropy reported as the **effective number of contenders** `exp(H)`, `H = −Σ pᵢ ln pᵢ`. **The probabilities must sum to 1 before applying it.** For the championship they already do. For relegation they do **not** — individual relegation probabilities sum to the number of relegation places — so **normalise to sum 1 first** and rename the reading accordingly: „effektive Zahl gefährdeter Klubs". State the normalisation in the caption — **and state the floor**: with `k` relegation places fully decided among exactly `k` clubs, the normalised probabilities are `1/k` each and the reading is `k`, not 1. The caption must say that the minimum equals the number of places („2,0 = vollständig entschieden" for two direct spots), or every reader will misread the floor as residual suspense. |
| **Wichtigstes kommendes Spiel** | expected shift of a target distribution: `Σ_o q_o · ½ Σ_clubs |P_o(club) − P_now(club)|` — expected total-variation distance, `q_o` the fixture's outcome probabilities, `P_o` the target distribution conditioned on that outcome. **Conditioning semantics — decided: `P_o` is obtained by filtering the canonical artefact's runs on the fixture's simulated outcome `o`** — never by a separate forced-outcome resimulation. Filtering is the exact conditional distribution *within the model's own joint simulation*: with `RATING_SIGMA`, an outcome is informative about latent strength (an underdog win selects runs with a favourable noise draw and shifts that club's other fixtures too), which is an implicit Bayes update under the model's internal prior. **Interpretation — state it honestly, it is a constraint on every caption:** the real app updates differently after the match (new results and table, an *external* ClubElo rating, uncertainty freshly re-integrated), and the model has no mechanism that reproduces the filtered posterior. The metric therefore **measures how strongly the fixture is coupled to the target distribution within the current joint season simulation — it is not a forecast of the percentage-point change the app will actually display after the match**, and no caption may claim that it is. Forced-outcome resimulation answers yet another (exogenous-intervention) question and would additionally require extending the §3 artefact key by `(fixtureId, outcome)`; it is not built. **Normalisation — mandatory for multi-place targets:** total-variation distance presupposes vectors summing to 1. Championship probabilities do; a `k`-place target (e.g. two direct relegation spots) sums to `k` in every run and in every conditional, so **both `P_o` and `P_now` are divided by `k` before the distance** — otherwise the relegation reading is inflated ≈ `k`-fold and structurally wins the „larger of the two" comparison. Same principle as the Spannungsindex normalisation. **Mechanics:** the pipeline tallies `P_o(club, target)` per `(fixture, outcome)` during the canonical 20,000-run simulation — no extra simulations, and consistent with „one simulation per data state". `q_o` is the empirical outcome frequency in the same artefact, so the conditional probabilities recombine exactly to `P_now`. An outcome's conditional sample is ≈ `q_o · N` runs; rare outcomes stay in the expectation (they carry weight `q_o`), and the card states the smallest conditional sample it rests on. **Computed separately for the championship and the (normalised) relegation distribution; the Übersicht card shows the larger of the two and labels which** (e.g. „größter Einfluss auf den Abstiegskampf"). |
| **Größte Überraschung** | surprisal `−log₂ P(actual tendency)` under that match's pre-match prediction. Higher = more surprising. |
| **Über-/Unterperformance** | `actual points − Σ_played (3·P(Sieg) + 1·P(Remis))`, using each match's **pre-match** prediction, divided by that club's matches played. Before rating snapshots exist, pre-season ratings are used and the chart says so. |
| **Treffsicherheit (Accuracy)** | share of played matches where the argmax of the pre-match tendency equals the actual tendency. **Higher is better. Random baseline = 1/3.** |
| **Brier / Log-Loss** | multiclass Brier and log-loss of the pre-match tendency. **Lower is better. Random baselines: Brier `2/3 ≈ 0.667`, log-loss `ln 3 ≈ 1.0986`.** |
| **Direktes Duell** | a remaining fixture in which **both** clubs have `P(target) ≥ θ` for the **same** target; `θ` configurable, default 10%. |
| **„Favorit ab Spieltag M"** | the earliest matchday from which the club holds the highest `P(target)` of all clubs **and holds it for every matchday since**. Transient leads do not count. |
| **Restprogramm-Schwere** | mean opponent rating over remaining fixtures, reported separately for home and away. |
| **Kalibrierung / ECE** | **Pool all three outcome probabilities per match** — `n` matches yield `3n` (predicted probability, hit ∈ {0,1}) pairs, not only the predicted class. **Fixed buckets**, ten of equal width `[0,0.1), [0.1,0.2), …, [0.9,1.0]`. Per non-empty bucket report mean predicted probability `x_b`, observed frequency `y_b` and count `n_b`. **`ECE = Σ_b (n_b / N) · |x_b − y_b|`**, reported in percentage points. Buckets with `n_b < 10` are drawn but marked unreliable (small/greyed marker). **The three pairs per match are not independent** — they sum to 1 — so the caption counts matches, not pairs: „basiert auf n Spielen (3n Wahrscheinlichkeiten)", never „3n Beobachtungen". Empty buckets are not drawn and contribute nothing. |

**Chart direction must be stated per chart**: accuracy charts say "höher ist
besser" with the 1/3 line; Brier/log-loss charts say "niedriger ist besser" with
their baselines. Never describe a *falling accuracy* curve as improvement — v5's
prose conflated a falling **loss** with accuracy.

---

# 5 · Data contract

## 5.1 Live data (V1)

A **scheduled GitHub Actions workflow** (cron ~2 h in season, plus manual
dispatch) is the *only* data path.

- Fetch results and fixtures from **OpenLigaDB**; ratings from **clubelo.com**.
  **Both access assumptions are unverified and must be gated before building:**
  usability without an API key and the terms of use; a current-season/matchday
  endpoint (otherwise a documented date rule); and **clubelo's coverage and
  quality for the current season, for the 2. Bundesliga, and — for V2 — for the
  historical window fixed in §5.4**.
- **Verify before writing:** pre-match rating check (a decisive result must be
  followed by a rating rise for the winner); sane fixture and matchday counts;
  **every fixture club resolves to a rating**.
- Commit only on change. **No browser-side live fetch** — v4 allowed one "for
  freshness", which contradicts the committed-data contract and can produce
  inconsistent states. Committed files are the single source.
- **Failure handling — the repository stays unchanged.** v5 asked the job both to
  commit nothing and to write a status field; those contradict. On failure
  nothing is committed and no status is written; the workflow reports the
  actual failure through **Actions notification**.
- **Data age and workflow health are two different questions — one timestamp
  cannot answer both.** Under „commit only on change", a successful check that
  finds nothing new commits nothing — so any committed timestamp goes stale
  whenever there is simply no football, and updating it on every check would
  force a commit and deployment every two hours, breaking the contract. v5.4's
  „Daten seit X Stunden nicht aktualisiert" derived from `generatedAt` conflated
  the two and is **replaced**:
  - **`dataUpdatedAt`** — the moment of the last *substantive* data change,
    written only when data actually changed. The app displays it neutrally as
    **„Datenstand: <Zeitpunkt>"** and **must not infer a workflow failure from
    its age** — an old value is normal in an international break and all
    off-season.
  - **Workflow health** is monitored **exclusively via GitHub Actions
    notifications** (failure alerts to the maintainer). The app has no access
    to job status and does not pretend to.
  - **The one warning the app can honestly derive is schedule-aware:** if a
    fixture's scheduled kickoff lies more than a **configurable grace period
    (default 6 hours)** in the past and no result is committed, the app shows
    „Ergebnis vom <Spiel> steht noch aus — Daten möglicherweise veraltet".
    That statement is true regardless of *why* the result is missing
    (postponement, source outage, workflow failure) and is the only staleness
    claim the committed data can support.
- **Archiving is an idempotent, atomic snapshot append**, never a move.
  Existing paths must keep working; re-running the job must not duplicate or
  corrupt history.

## 5.2 Club name mapping — fail closed

Clubs come from fixture data; ratings join via a **curated one-to-one ID
mapping**. Four failure modes, the last being the dangerous one:

1. different naming conventions between sources;
2. transliteration (`1860 München → "Muenchen60"`);
3. missing fields (Erzgebirge Aue had an empty `shortName`);
4. **genuine ambiguity** — pooling both divisions over many seasons puts *both*
   clubs of many pairs in the data: **Frankfurt** (Eintracht/FSV), **Köln**
   (1. FC/Fortuna), **München** (Bayern/1860), **Stuttgart** (VfB/Kickers),
   **Leipzig** (RB/VfB), **Borussia** (Dortmund/Gladbach), **Kickers**
   (Offenbach/Stuttgart/Würzburg), **Fortuna** (Düsseldorf/Köln).

**Never join on a short name or substring.** An unresolved club **fails the job
and blocks the commit**. A wrong match is worse than a missing one because it is
silent, so a test asserts both that every fixture club resolves and that no two
clubs map to the same rating key.

## 5.3 Historical and snapshot data contract

**A live-rating timeline cannot be reconstructed from results alone.** It
requires archived **point-in-time ratings**, pre-season ratings, the season's
fixtures with home/away, the season's rule and slot configuration, and the
parameter version used.

**Snapshot semantics.** A rating between two matches is *simultaneously*
post-match for the previous fixture and pre-match for the next, so a single
global `phase` field is ambiguous — and the temporally nearest fixture may be the
one already played. Therefore **no global phase**. Instead:

- **Raw snapshots** carry `observedAt` (when fetched) and `effectiveAt` (the date
  the rating refers to), and nothing else. They are **immutable**; corrections
  are appended, never edited.
- A **separate pre-match dataset per `fixtureId`** records which
  `ratingSnapshotId` was used for that fixture, **the rule under which it was
  valid before kickoff**, and — decisively — its **`provenance`**, plus
  `createdAt` and `modelVersion`:
  - **`contemporaneous`** — actually fetched before kickoff. Only these may be
    presented as „die damalige Prognose".
  - **`backfilled`** — reconstructed later from clubelo's published history. Valid
    for *retrospective* calculation only.

  Without this distinction the brief contradicts itself: a value fetched after
  kickoff must never become a pre-match rating, yet mid-season backfill does
  exactly that from today's vantage point. Provenance is what makes both true.
  **Model-quality evaluations must never silently pool the two groups** — report
  them separately, or state which group a figure rests on.

**Pre-season snapshot and the degraded state.** A pre-season snapshot per club is
required for the frozen-rating timeline. Where it is missing and cannot be
backfilled, the feature does **not** fail — but it must not claim what it does not
have: the curve is then labelled with its actual start, e.g. „Eingefrorene Stärke
ab 12. September; frühere Daten nicht verfügbar", never „Saisonstart-Stärke".

**Mid-season launch — the bootstrap v5 assumed away.** "Archive from V1 day one"
only suffices if V1 ships at season start. If it ships in October, pre-season and
early pre-match ratings are missing while V1 already requires the frozen timeline
and the Elo history. Therefore:

1. **Backfill from clubelo's published history** for the current season on first
   run, with the same pre-match verification as live data.
2. If backfill is unavailable for a club or period, the app enters a **defined
   degraded state**: the timeline and Elo history begin at the first available
   date and the chart says so. They are never silently truncated or
   back-extrapolated.

A *frozen-rating* retrospective **is** computable from results plus a pre-season
rating — that is what V1 ships, labelled as such. Any replay computed today with
today's parameters is a **retrospective model calculation**, not "what the model
said at the time"; label it so and stamp each artefact with its parameter
version. Historical timeline artefacts are precomputed in the pipeline and
committed.

## 5.4 Historical window (V2)

**1995/96 onward**, ~30 seasons, subject to per-season coverage verification.
Structural breaks that make the data season-dependent — these are configuration,
never constants:

| break | handling |
|---|---|
| 3 points for a win (Bundesliga from 1995/96 — **verify the exact season**) | earlier seasons used 2 points; this is the cutoff |
| 1991/92: 20 clubs, 38 matchdays, four direct relegations | outside the window; excluded |
| **No relegation play-off 1992/93 – 2007/08** | abolished in 1991, **reintroduced only in 2008/09**. In 1995/96–2007/08 the bottom three go down directly and 16th is *not* a play-off place. Targets, clinch logic and the §6 play-off computation must all be season-dependent. |
| Relegation away-goals rule: **last applied 2020/21, not applied from 2021/22** (verified against DFL statements) | note it if leg-level detail is ever modelled |
| European slot formats changed repeatedly | Conference League only from 2021/22; UEFA Cup → Europa League 2009; CL berths per country varied. Each historical season needs its own slot configuration. |
| drifting goal rates and home advantage | **do not fit shipped parameters on 30 years.** The lab's recency conclusion ("equal weighting wins") was established on 15 seasons; re-run that test on the wider window before any refit, or 1990s football is imported into a current forecast. |

The history serves **context and validation, not fitting**.

## 5.5 Longevity — automatic operation in future seasons

*(Restored from v4; v5 dropped these by accident and they are not optional.)*

- **Season detection is automatic** — from OpenLigaDB's current-season endpoint
  where available, otherwise a documented date rule. **Never hardcode a season.**
- **Off-season must not break the app.** Between the last matchday and the
  release of new fixtures, show the completed season with a clear „Saison
  beendet" state; switch to the new season's pre-season forecast as soon as
  fixtures appear.
- **Season-stamped configuration.** European slot mapping and any rule change
  live in one file stamped with its season; the app **warns visibly** if that
  stamp does not match the detected season.
- **Annual refit as a pull request — two distinct processes, not one.** A summer
  job runs from the lab's code and **opens a PR**; it never commits directly.
  v5.4's two-stage design fixed the one-season lag but made its own gate
  vacuous: in a normal year the "validation fit" (15 seasons before the newly
  completed season S) and the incumbent (last summer's production fit, same 15
  seasons, same pinned code) arise from **identical data and identical code**
  — they are the same parameters, and comparing them tests nothing. Therefore
  the refit is split into the two processes it actually contains:

  **Process A — yearly monitoring and window refresh (procedure unchanged).**
  1. **Monitoring report:** evaluate the **incumbent** on the newly completed
     season S — a genuine out-of-sample result, since the incumbent never saw
     S. Report log-loss, Brier, RPS and calibration on S, alongside the random
     baselines (§4) and the incumbent procedure's historical fold results for
     context. **There is no comparative gate here** — there is nothing
     independent to compare against.
  2. **Human review:** the maintainer checks the report for anomalies (a
     performance collapse signals data problems or regime change and triggers
     investigation before any refresh).
  3. **Window refresh:** after review, fit the **unchanged procedure on the
     newest 15 completed seasons — now including S** — and ship those
     parameters. They receive their out-of-sample test in next year's
     monitoring report, which is stated in the PR template.
  The PR contains the monitoring report and the new production parameters,
  separately labelled.

  **Process B — methodological change (fit code, model form or hyperparameters
  differ).**
  1. **Rolling-origin backtest:** compare old and new procedure on **multiple
     identical rolling-origin folds** — the lab's time-forward protocol: each
     of the last **10 completed seasons** (or as many as coverage allows,
     minimum 5) serves once as hold-out, both procedures fitted on the 15
     seasons preceding that fold. Same folds, same data, per-fold paired
     differences.
  2. **The comparative gates apply here, and only here:** decision metric is
     the **fold-mean held-out log-loss**, which may not worsen by more than
     **0.5 % relative**; fold-mean Brier and RPS are guardrails at **1 %
     relative**, ECE at **1 pp**. Any guardrail breach blocks the default
     merge regardless of log-loss.
  3. After approval, fit the new procedure on the newest 15 completed seasons
     and ship; from then on it is the incumbent of Process A.

  **Shared rules for both processes:**
  - **Override:** the gate (B) and the review (A) are defaults, not locks — a
    human may merge against them or refuse despite them, but only with a
    **written justification recorded in the PR**; a human merges only when the
    report is present; silent overrides are prohibited. The noise argument
    stands: a single season is ~306 matches, and even the 10-fold mean carries
    substantial noise — the gates order evidence, they do not replace
    judgement.
  - **Window provenance:** 15 seasons is the window on which the lab's recency
    conclusion ("equal weighting beats every half-life") was established.
    **If the window rule ever changes, that is a Process B change** and the
    recency test must be re-run first — otherwise older football is imported
    into a current forecast.
  - **Code provenance:** every fit runs from a **pinned lab commit hash**,
    recorded in the PR; the procedure version is stamped into
    `season-params.json`. Whether a summer is Process A or Process B is
    decided by exactly this hash and the hyperparameter set: **any difference
    means Process B** — with one cheap escape hatch: a changed hash may still
    count as Process A if the new code, **fitted on the incumbent's exact
    window, reproduces the incumbent parameters**. **Bit-identical
    reproduction is preferred and is the default expectation.** Where
    numerical noise makes that unattainable, the fallback bounds are **fixed
    ex ante in a checked-in configuration file** (one absolute and one
    relative tolerance per parameter class) — **never chosen or adjusted after
    seeing the result**; the PR reports only pass/fail against those
    pre-committed bounds. A reproduction outside the bounds means Process B,
    with no discretion at this step (discretion lives in the override rule
    above, with written justification). The reproduction check is part of the
    PR; without it, Process B applies.
- **Dependency hygiene:** pinned Node version in the workflow, pinned package
  versions, minimal dependency surface (charts remain hand-rolled SVG),
  automated dependency updates enabled.
- **README carries the yearly checklist:** verify European slots, check for rule
  changes, review the refit PR.

---

# 6 · League rules — season-dependent, never constants

- **Tiebreakers:** Punkte → Tordifferenz → Tore → Direkter Vergleich (Punkte,
  Tordifferenz, Auswärtstore) → Auswärtstore → Entscheidungsspiel. Port the
  lab's tested ranker. **Verify against the DFL Spielordnung itself** — the lab
  sourced it from a third-party site, adequate for a study, not for a published
  app. **For V2, additionally verify whether the tiebreak order changed at any
  point within the 1995/96 window** — a current ranker applied blindly would
  otherwise reconstruct historical replay tables wrongly. If it changed, the
  order becomes part of the per-season configuration like every other rule; if
  it did not, that finding is recorded with its source.
- **Relegation play-off exists only from 2008/09.** Between 1992/93 and 2007/08
  the bottom three went down directly and 16th was not a play-off place. Also:
  1991/92 had 20 clubs; the away-goals rule in the play-off was last applied in
  2020/21 and does not apply from 2021/22 onward (verified — see §5.4).
- **European places: show placement zones, not qualification.** Actual European
  qualification depends on cup winners and title holders, which needs data the
  app does not have. Display `P(Platz 1–4)`, `P(Platz 5)` etc. and label them as
  placement probabilities — honest and simple. A qualification mapping may come
  later; do not fake it in V1.
- **Relegation play-off must be pairing-specific** (V1.1). The v4 formula
  implied a single play-off win probability. Correct form:

```
P(BL1-Klub i bleibt) = P(i auf 1.–15.)
                     + Σ_j P(i auf 16.) · P(j auf 3. in BL2) · P(i schlägt j)
```

  The **BL2 side is the same computation, stated explicitly** so no second
  implementation arises:

```
P(BL2-Klub j steigt auf) = P(j auf 1.–2.)
                         + Σ_i P(j auf 3.) · P(i auf 16. in BL1) · P(j schlägt i)
```

  with `P(j schlägt i) = 1 − P(i schlägt j)` — **both league views consume the
  one pairing simulation, from complementary sides.** A test asserts the
  complement holds per pairing.

  League marginals suffice, but the sum over possible opponents is required. No
  joint two-league simulation.

  **`P(i schlägt j)` must be defined, not left open** — different readings give
  materially different Klassenerhalt probabilities. Contract:
  - **Two legs.** The home order is **pairing-specific, not a season
    constant** — the verified DFL rule: home right in the *second* leg goes to
    the club with **fewer match-free days before the first leg** (per the
    completed season's schedule); on a tie, **a lot decides**. The season
    configuration therefore carries **the rule and the relevant dates** (the
    play-off dates and each club's last league matchday), not a hard-coded
    order; the engine derives the order per hypothetical pairing. Where the
    rule yields a tie and the lot has not yet been drawn, simulate **both
    orders at 50/50**; once the order is officially fixed, the configuration
    records it and the mixture is replaced. Leg-specific rules likewise come
    from the season configuration.
  - Each leg simulated with the **shared engine model** (Poisson + Dixon-Coles,
    flat `HOME_ADV`), goals aggregated over both legs.
  - **Away-goals rule is season-dependent** — **verified boundary: applied
    through the 2020/21 season, not applied from 2021/22 onward.** v5.2's "up
    to 2021/22" would have wrongly simulated the 2021/22 play-off *with* the
    rule. The season configuration carries the boundary as two explicit fields
    (`lastSeasonWithAwayGoals: "2020/21"`, `firstSeasonWithout: "2021/22"`),
    never as a single ambiguous cutoff.
  - If level after both legs (under the season's rule): **extra time as an
    additional Poisson phase**, fully specified: **`ET_FACTOR = 1/3` exactly**
    (30/90 minutes — a decision, not an approximation); the ET goal rates are
    the second leg's full-match `λ`s — **including the second-leg host's
    `HOME_ADV`, which thereby scales proportionally with the phase** —
    multiplied by `ET_FACTOR`; **no Dixon-Coles correction term in the ET
    phase** — DC is fitted on full matches and its low-score correction has no
    basis at third-length rates, so the ET phase is plain independent Poisson.
    If still level, a **configurable penalty prior, default 50 %**.
  - Ratings: **frozen at the current data state.** "The same pre-match rating
    source as any other fixture" is insufficient for a play-off computed months
    in advance — its true pre-match ratings do not exist yet. Contract: advance
    calculations use the **ratings of the current data state, frozen for both
    legs**; the pairing is **recomputed whenever the data state changes**, and
    once the participants are fixed, with the then-current ratings. No
    extrapolation of ratings to the play-off date.
  - **The marginal approximation is named, not hidden.** Computing
    `P(i schlägt j)` from current ratings and multiplying it with
    `P(i auf 16.) · P(j auf 3.)` treats play-off strength as independent of
    *how* the clubs got there — finishing 16th is mildly informative about
    end-of-season strength, and the play-off simulation redraws
    `RATING_SIGMA` rather than inheriting the league runs' conditioned draws.
    This is a deliberate, pragmatic approximation (the alternative would be a
    joint two-league simulation, excluded above); documentation and the
    Klassenerhalt caption state it as such.
  - **The play-off is its own simulation, with its own runs.** It is computed
    from league marginals plus a separate pairing simulation, so its runs are
    not the league artefact's runs. Its random keys live in a **dedicated
    namespace** (a `context = playoff` component alongside `seasonId`,
    `simulationProtocolVersion`, `runIndex`, `clubId`/`fixtureId`, `drawKind`,
    with legs, extra time and penalties as distinct `drawKind`s), so play-off
    draws can never collide with league draws. Within each play-off run,
    **`RATING_SIGMA` is drawn once per club and applies to both legs** —
    consistent with §3; it must not be redrawn per leg.

- **Clinch / elimination claims — the tiebreak rule, corrected.** Earlier drafts
  allowed "a locked head-to-head" as a free tiebreak. Under the **DFL order that
  is wrong**: Tordifferenz and Tore rank *ahead* of the direkter Vergleich, so a
  locked head-to-head only matters once goal difference **and** goals are equal
  too — which cannot be guaranteed, because future goal margins are unbounded.
  The conservative rule is therefore:

  > Where two clubs can finish level on points, the tiebreak is treated as
  > **unfavourable** for the club in question, unless the complete ordering
  > between them is *already* mathematically fixed by completed matches. **No
  > upper bound on future goals is ever assumed.** In practice a guarantee is
  > issued only on **strict points separation**.

  This makes „sicher" genuinely sicher, at the cost of declaring things settled
  slightly later than a naive implementation would. **The same rule binds the
  scenario solver in §7.** Verified under §7's scoping — exhaustive enumeration
  is a **test oracle on small synthetic leagues only**, with property tests
  covering larger cases.

---

# 7 · Pages

Hash-based routing. German UI (code and comments English). Header carries: title,
one-line description, repo link, current matchday, **„Datenstand"
(`dataUpdatedAt`, §5.1) plus the schedule-aware missing-result warning when it
applies**, league toggle (V1.1+), and simulation controls.

**Tracked targets** — configuration, per season and league:
`Meister · Platz 1–4 · Platz 5–6 · Klassenerhalt · Relegationsplatz · Abstieg`
(+ `Herbstmeister` until matchday 17). BL2: `Aufstieg (Top 2) ·
Relegationsplatz (3.) · Klassenerhalt · Relegationsplatz (16.) · Abstieg`.

| page | release | contents |
|---|---|---|
| **Übersicht** | V1 | **V1 cards:** Titelrennen · Abstiegskampf · Platzierungszonen · Letzter Spieltag · Spannungsindex · Bereits entschieden. **Deferred:** „Wichtigstes kommendes Spiel" (needs the per-`(fixture, outcome)` conditional tallies of §4 added to the pipeline artefact — under the decided filtering semantics this is cheap, but the artefact schema and card ship together in V1.2; the release slicing does not change) and „Überflieger & Enttäuschungen" (needs the pre-match prediction history) → **V1.2**. Cards hide when they have nothing to say. Must work on a phone. |
| **Tabelle & Prognose** | V1 | current table · projected final table (expected points, median + 10–90%) · **18×18 Platzierungs-Heatmap** · Restprogramm-Schwere · direkte Duelle · Clinch · (V1.1) Relegation |
| **Spieltage** | V1 | matchday selector 1–34 → results/predictions, table snapshot, that matchday's movers. **„Wichtigstes kommendes Spiel" is V1.2 here too** — it ships with the artefact schema extension of §4, so it must not appear earlier on this page; when it arrives it is computed **once** in the pipeline and consumed by both pages. |
| **Teams** | V1 | club selector → position range over time, outcome-band distribution, remaining schedule, performance vs expectation, **Elo-Verlauf** |
| **Verlauf** | V1 (frozen) / V1.2 (live) | target-selectable probability curves; Ausgangsverteilung per club; Spieltags-Einfluss across all targets; Spannungsindex curve; (V1.2) the frozen-vs-live comparison per §0 |
| **Modellgüte** | V1.2 | Kalibrierung (§8) · Treffsicherheit über die Zeit (§8) · Spiel-Zeugnis with matchday selector and a season-wide Top-20 surprises · Leistung vs Erwartung · Platzierung vs Erwartung · Trefferquote live vs eingefroren · Rating-Verzögerung |
| **Szenarien** | V2 | what-if · „was muss passieren" · Beispielsaison — the *only* page with interactive tools |

**„Was muss passieren?" — solver contract (V2).** A points total alone **cannot**
express a minimal sufficient condition: six points taken off direct rivals also
deny them those points, six against mid-table clubs do not, and home/away and
head-to-head affect tiebreaks. The contract is therefore:

**Scope clause, binding for the whole contract:** wherever the contract
quantifies over „other clubs' results", the club's **own fixtures are excluded**
— an opponent's result in a head-to-head is already fixed by the assumed
distribution of the club's own points, and counting it twice produces wrong
bounds. All quantified combinations must be **consistent** with the assumed
own-points distribution.

1. **Primary — a conservative own-strength guarantee.** The smallest own points
   total `P*` such that the target is reached **under every distribution of
   those points across the club's own remaining fixtures and every combination
   of other clubs' results consistent with it** (per the scope clause). This is
   a genuine guarantee and is stated as „X Punkte aus den letzten N Spielen
   reichen — unabhängig davon, wie sie zustande kommen."
2. **If no such `P*` exists**, say so plainly („nicht aus eigener Kraft") and
   report the minimum own points needed **under the most favourable other
   results** (the necessary condition), together with the required help. Help is
   **not** a single list of independent bounds — there are usually several
   alternatives, e.g. *„A holt höchstens 2 Punkte"* **oder** *„B verliert gegen
   C"* **oder** *„A höchstens 3 **und** B höchstens 4"*. The solver outputs
   **sufficient help combinations as explicit logical alternatives**, each
   carrying a **machine-checkable certificate** that the target is reached
   whenever that combination holds. **„Minimal" is defined as subset-minimal**:
   no constraint can be removed from the combination without invalidating its
   certificate. **Completeness is explicitly not claimed and not testable** —
   with ~45 remaining fixtures the space of combinations cannot be exhausted.
   The contract is: within a **fixed compute budget — a deterministic node
   limit set in configuration, never a wall-clock limit** — emit **at least one
   subset-minimal sufficient combination if any is found**. "Same inputs → same
   output on every device" needs more than the node limit and is required in
   full: **canonical sorting** of fixtures, clubs and constraints before
   search; a **deterministic branching order** defined on that sorted
   representation; and **no dependence on hash-map iteration order or parallel
   scheduling** anywhere in the search path. On budget exhaustion without a
   sufficient combination, report only the necessary
   condition and state that the search was truncated („mögliche Kombinationen
   nicht vollständig durchsucht"). Acceptance tests verify **certificate
   validity and subset-minimality of every emitted combination** — never
   exhaustiveness of the search.
3. **Optionally**, where the conservative total does not exist but a small set of
   fixtures decides it, name those fixtures explicitly ("ein Sieg im direkten
   Duell gegen Y genügt").

**Availability:** offered only when at most **5 matchdays** remain; earlier it is
hidden rather than approximated.

**On "exhaustive enumeration".** Unbounded scorelines cannot be enumerated, so
the phrase is scoped as follows and applies identically to **clinch detection and
this solver**:

- **Production logic** reasons on points bounds under the **conservative
  tiebreak rule of §6** — a points-level tie counts against the club unless the
  ordering is already mathematically fixed by completed matches, and no bound on
  future goals is assumed — and states only **conservatively proven
  guarantees**.
- **Exhaustive enumeration is a test oracle only**, run on small synthetic
  leagues with a bounded number of remaining fixtures and bounded scorelines.
- Larger cases are covered by **property tests** (a claimed guarantee must never
  be violated by any sampled scenario) and, where practical, by comparison
  against an independent solver implementation.

**Metric placement rule.** The "no metric in more than two places" rule applies
to the metric itself, not to a pointer. Über-/Unterperformance lives on **Teams**
(per club) and **Modellgüte** (model-quality framing); the Übersicht card shows
only the leading names and links there.

**Note:** the "all clubs have played equally many matches" simplification from v4
is **false** during a matchday and after postponements. Always normalise by each
club's actual matches played.

---

# 8 · Honesty requirements

**Never turn a null into an absence.** Write „kein messbarer Vorteil" /
„in diesen Daten nicht nachweisbar", never „gibt es nicht" or „ist ein Artefakt".
Label untested mechanisms as reasoning. Make no causal claim about the
closed-door seasons — not randomised, and every relevant interval included zero.

**Kalibrierung.** Lead with the plain question: *„Wenn die App 70 % sagt — tritt
es dann auch in 70 % der Fälle ein?"* Add a **generated, data-driven sentence**
(*„…tatsächlich in 65 % der Fälle — hier ist das Modell etwas zu optimistisch"*).
**Bar view by default**; scatter-with-diagonal as an expert toggle. Explain the
calibration error in percentage points, in one sentence.

**Modellgüte über die Zeit — the model does not learn within a season.** State
this for the **loss** charts, where it applies: a **falling log-loss or Brier
score** is a running average stabilising after early noise, plus later matches
being more predictable — not the model improving. (Do **not** phrase this about
*Treffsicherheit*: accuracy rising is better, and a falling accuracy curve would
mean the opposite. §4 fixes the direction per chart.) In the Bundesliga a second,
genuine effect exists — live ratings do improve during the season — so
**distinguish the two, do not merge them**.

---

# 9 · App B — Kicktipp optimiser

Not deployed, not linked. **A single self-contained HTML file** (decided in §0) —
openable on a phone at tipping time, no dev server. **The source imports
`packages/engine`; the build bundles it into that one HTML file.** It is never a
manual copy of the engine.

- **Input:** paste the Kicktipp tipping page (it carries both **Tippquoten** and
  **1X2 Buchmacherquoten**); parse and show for confirmation; manual entry as
  fallback.
- **Pasted content is untrusted input — treat it as such.** Parse with
  `DOMParser`; **never** assign pasted markup via `innerHTML` or any equivalent;
  render **only validated, typed fields** (club names, quotas, odds) as text.
  Anything unparsed is discarded, not displayed. Tests must cover pasted
  `<script>` tags, inline event handlers, and malformed markup, and assert that
  nothing executes and nothing unvalidated reaches the DOM.
- **The points schema is verified — best-of, maximum 11.** Checked against the
  official Kicktipp rules (kicktipp.de „Punkteregel: 3 – 11 Punkte" and the
  linked Quoten-Punkteregel explanation, retrieved 2026-07-23), and confirmed
  by the user's own pool experience (maximum observed: 11). The facts:
  - **Tendency pays the quota, 3–9 points**, derived from the *pool's* tipping
    behaviour, per the published formula
    `Punkte = MAX / (10 × T/N) − MAX/10 + MIN` with `MIN = 3`, `MAX = 9`,
    `N` = tips submitted, `T` = tips on that tendency — rounded and clamped to
    `[MIN, MAX]`.
  - **Bonus tiers are best-of, not stacking:** win — goal difference +1 *or*
    exact result +2; draw — exact result +2, **no goal-difference tier** (the
    official table shows „–"). The arithmetic is conclusive: max 11 = 9 + 2;
    stacking (+1 and +2) would allow 12, contradicting the official header.
    The hypothetical stacking variant from v5.2 is **deleted** — one formula,
    no configuration switch.
  - **The pasted quota is a snapshot.** The quota is recalculated after every
    tip submission — including one's own, which raises `T` for the chosen
    tendency — so the values at paste time can differ from the values at
    scoring time. **Decision unchanged: the quota is taken as given** (the
    snapshot is what the user can see, and inverting the rounded, clamped
    formula is not reliable), but the UI states in one sentence that quotas may
    still shift until kickoff.
- **Optimiser:**

```
E = P(Tendenz) × Quote
  + P(exaktes Ergebnis) × 2
  + P(gleiche Tordifferenz, nicht exakt, nur bei Sieg) × 1
```

  This is the verified best-of schema: the bonus is +2 for the exact result
  *or* +1 for the correct goal difference, never both, added on top of the
  quota.

  `Quote` is the payout, taken as given. **`P(Tendenz)` comes from the bookmaker
  odds with the overround removed by simple normalisation:
  `pᵢ = (1/quoteᵢ) / Σⱼ (1/quoteⱼ)`.** Fix this method for reproducibility; other
  schemes (Shin, power) are not used. Missing, non-positive or unparseable odds
  trigger the model fallback. Draws carry
  **no** goal-difference tier — the +1 applies only to decisive tips, per the
  official table. This asymmetry flips real cases.
- **Scoreline shape: region reweighting, not λ-fitting.** v5 asked for λ to be
  fitted to the market's H/D/A and left the objective, tolerance and fallback
  undefined. **Drop λ-fitting entirely** — it introduces an identification
  problem that does not need to exist. Instead use the Phase-4 hybrid
  construction: take the model's scoreline matrix `M(h,a)` at its own λ, split it
  into the three outcome regions, renormalise each region to sum to 1, and weight
  the regions by the market's `P(H)`, `P(D)`, `P(A)`:

```
P(h,a) = P_markt(Region von (h,a)) · M_Region(h,a)
```

  The market margins are then exact **by construction** — no optimiser, no
  tolerance, no failure mode. The model supplies only the shape within an
  outcome, which is exactly what it is good for.
- **Grid extent — one rule, evaluated after reweighting.** The bound must account
  for the reweighting factors `f_r = P_markt(r) / P_Modell(r)`, since reweighting
  can heavily upweight a rare region. **`P_Modell(r)` must be the region's full
  model probability, not the truncated matrix sum** — otherwise the factors are
  computed on a moving basis and are wrong. Extend the matrix until

  `Σ_r f_r · omittedMass_r < 1e-4`

  (the weighted sum, not the conservative `omittedMass × max_r f_r`). There is no
  hard cap. Practical guard: if this requires more than **20 goals per side**,
  the market is pathological relative to the model — log the fixture, fall back
  to the model's own probabilities for it, and surface a visible note.
  Selectable tips remain the 0–6 grid; the bonus terms are summed over the full
  matrix and are **never renormalised onto 0–6**.
- **Warning — conditional, not categorical, and mathematically honest.** The
  market favourite is by definition the tendency with the highest `P(Tendenz)`,
  so per match `P(optimierte Tendenz) ≤ P(Favoriten-Tendenz)` under the same
  probability measure — with equality exactly when the optimised tip *is* the
  favourite (or the probabilities tie). Summed over a matchday, **the optimised
  tips therefore have the same expected tendency hit rate as the favourite tips
  when they coincide, and a strictly lower one otherwise — never a higher
  one.** (Only *realised* hit rates can go either way, by luck.) The expected
  *points* can still be higher — that is the entire purpose. v5.2's "can even
  have the higher hit rate" was wrong and is retracted. So compute **both** for
  the current matchday (expected hit rate under the optimised tips and under
  favourite tips) and show the warning **exactly when the optimised expected
  hit rate is strictly lower** — equivalently, when at least one optimised tip
  uses a tendency with **strictly lower market probability** than that match's
  favourite tendency. Tips that differ only in scoreline within the same
  tendency (1:0 vs 2:0), or that pick an equally probable tendency, change
  nothing and trigger **no** warning. The warning carries that matchday's own
  numbers. Once logging has data, show the realised figures. The
  "~55% → ~47%" figures from design came from a single nine-match matchday and
  must never be printed as fact.
- **No form-override heuristic.** The lab found no such adjustment earning its
  keep. That market odds absorb the Elo lag is **reasoning, not measurement**.
- **Logging** of quotas, odds, tips and outcomes needs **export/import and a
  schema version**; `localStorage` alone is lost on a browser change.
- **No automation against Kicktipp or Oddset.** Manual paste only.

---

# 10 · Guardrails

- `wm2026` and `football-model-lab` untouched.
- App A: static Pages site, Monte-Carlo in a Web Worker, no backend, no secrets
  beyond `GITHUB_TOKEN`; Vite `base` set to the repo path; the deploy workflow
  publishes only `apps/public`.
- **App A contains nothing Kicktipp-, quota- or tipping-related.** Model quality
  is *Vorhersagegüte / Trefferquote*, never tipping efficiency.
- `packages/engine` is the single source of truth for the model, league rules and
  every metric in §4; neither app forks or re-implements them.
- Carry over the WM app's later fixes from day one: OG/social meta with a
  1200×630 image; chart accessibility (`role="img"`, data-driven `aria-label`,
  `<title>`/`<desc>`, visually-hidden data tables for chart-only sections);
  `aria-current`, skip link; breakpoints beyond a single 720 px rule; dark mode.
- Simplicity rules: one primary element per page above the fold; interactive
  tools only on Szenarien; no metric in more than two places; simple view
  default, expert behind a toggle; a plain-German takeaway caption per chart;
  empty cards hide; every chart's numbers also as a table.

---

# 11 · Acceptance criteria

**Before building** — verify: OpenLigaDB terms and current-season endpoint (or a
documented fallback); clubelo coverage per season and club, including
2. Bundesliga **and its historical backfill for the current season**; the DFL
tiebreak order against the Spielordnung, **including whether the order changed
within the 1995/96 window (§6)**; the 3-points-rule cutoff season;
**whether the Track C `season-params.json` artefact carries per-league fields
(per §2)**. **Already verified, do not re-open:** the Kicktipp points schema
(best-of, max 11 = 9 + 2 — §9), the away-goals season boundary (last with:
2020/21, first without: 2021/22 — §5.4/§6), and the play-off home-order rule
(fewer match-free days before the first leg → home right in the second leg;
lot on a tie — §6). (The App B privacy question is **decided** in §0 and is not
re-opened here.)

**V1** — Bundesliga current season live at the github.io URL. Pipeline fetches,
verifies and commits results **and immutable rating snapshots carrying
`observedAt` and `effectiveAt`, plus a per-`fixtureId` pre-match dataset naming
the snapshot used and why it was valid before kickoff**; backfills the current
season from
clubelo history on first run; refuses to commit unverified data; on failure
commits nothing and reports via Actions; the app shows **`dataUpdatedAt` as
„Datenstand"**, derives **no workflow-health claim from any timestamp**, and
warns **schedule-aware** when a finished fixture's result is missing past the
grace period (§5.1). No browser-side fetch. Every fixture club resolves or the job
fails; no two clubs share a rating key. Table ranker reproduces real final tables
with tiebreak tests. Every §4 metric exists as a tested engine function, with the
Spannungsindex normalised before entropy and accuracy/loss charts carrying their
own direction and baseline. MC contract implemented: per-run club noise,
view-independent seeding, CRN per `(run, fixture)` **via inverse-CDF sampling
from counter-based uniforms (§3) — a stream-based sampler fails this
criterion**, empirically estimated SE(Δ), noise floor at 2·SE(Δ). The six V1 Übersicht cards, Tabelle & Prognose,
Spieltage, Teams and the frozen-rating Verlauf render; heatmap and clinch present;
**clinch claims verified per §7's scoping** — production logic on points bounds,
exhaustive enumeration only as a test oracle on small synthetic leagues, property
tests for larger cases. Longevity per §5.5:
automatic season detection, off-season state, season-stamped config with mismatch
warning, pinned dependencies, yearly checklist in the README. **Annual refit —
a Process-A dry run produces the incumbent's out-of-sample monitoring report
and a production fit on the newest 15 completed seasons; a changed procedure
(hash or hyperparameters, absent a passing pre-bounded reproduction check)
triggers Process B, runs both procedures on identical rolling-origin folds and
applies the comparative gates; neither process commits directly — both open a
PR carrying code, window and parameter provenance.** German UI;
accessibility and responsive criteria met.

**V1.1** — league toggle with per-league targets; BL2 served by the **shared
pooled parameter set of §2** (per-league fields only as present in
`season-params.json`, never synthesised); displayed league unmistakable;
relegation play-off computed pairing-specifically as in §6, as its own
simulation in its own random-key namespace, with the **home order derived per
pairing from the DFL rule** (50/50 mixture on an undrawn lot) and the
**complement test** `P(j schlägt i) = 1 − P(i schlägt j)` passing — both league
views consume the one pairing simulation.

**V1.2** — Modellgüte renders; calibration leads with the plain question and
defaults to bars, counting matches per §4; the accuracy caption distinguishes
"the model does not learn within a season" from the live-rating effect;
live-rating timeline and the frozen/live comparison work from archived snapshots
and are labelled descriptive, not causal; **„Wichtigstes kommendes Spiel" is
computed by filtering the canonical artefact per §4** — a test asserts that the
`q_o`-weighted conditional distributions recombine to `P_now`, multi-place
targets are normalised by `k` before the total-variation distance, and **no
caption claims the metric forecasts the actually displayed post-match change**
— and appears on Übersicht and Spieltage from one pipeline computation.

**V2** — Szenarien tools present and nowhere else; the solver delivers the
conservative own-strength guarantee of §7, names concrete rival bounds when no
such guarantee exists, and is hidden with more than 5 matchdays remaining;
emitted help combinations are **subset-minimal with valid machine-checked
certificates**, the search runs under a **deterministic node budget** and
satisfies the §7 determinism requirements — canonical input sorting,
deterministic branching, no hash-map- or parallelism-dependent ordering,
verified by a repeated-run identity test — and declares truncation, and **no
acceptance test demands exhaustiveness**; its claims are verified under the
same scoping as clinch (test oracle on small synthetic leagues, property tests
otherwise). Historical seasons cover **1995/96 onward** with season-dependent
rules per §5.4, **the tiebreak order verified across the window per §6** (and
made season configuration if it changed); replays are labelled as retrospective
model calculations with their parameter version; historical annotations state
their window.

**App B** — single self-contained HTML file bundled from `packages/engine`;
parses a pasted matchday **via `DOMParser`, with no pasted markup reaching the
DOM** and tests covering script tags, event handlers and malformed input;
scoreline distribution built by **region reweighting** against the market's
H/D/A (no λ-fitting); matrix extended until **`Σ_r f_r · omittedMass_r < 1e-4`**
with `P_Modell(r)` the region's full probability, and the >20-goal fallback
implemented; bonus terms summed over the full matrix; asymmetric bonus terms
correct per the **verified best-of schema of §9** (win: +1 goal difference *or*
+2 exact; draw: +2 exact only; a test asserts no scoreline ever earns both
bonuses); the hit-rate comparison satisfies the §9 invariant — **expected hit
rate of the optimised tips never exceeds that of the favourite tips**, asserted
by a property test — and the warning appears **exactly when that expected hit
rate is strictly lower** (equivalently: some optimised tip uses a strictly less
probable tendency), never merely because tip sets differ in scoreline;
the UI notes that pasted quotas are a snapshot; no fixed hit-rate figure;
logging exports with a schema version; no automation.

**Throughout** — no null stated as absence; no causal claim about the closed-door
seasons; no precision figure copied from the lab's per-match intervals.
