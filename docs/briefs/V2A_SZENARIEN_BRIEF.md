# Brief — V2a: Szenarien. V2b (Historie) explicitly deferred.

**Scope decision: v5.6's V2 is split. This brief releases only the Szenarien
half. The historical-seasons half (V2b) is NOT released, is not to be started,
and its trigger condition is defined at the end. Appending this brief to the
CLAUDE.md precedence chain is part of the work.**

## Hard boundary first — what this brief does NOT authorise

- **No historical seasons.** No replay, no surprise-champion panel, no
  historical annotations, no §5.4 coverage verification, no per-season rule
  configs beyond those already committed.
- **Zero clubelo history requests.** Not one. The 30-season coverage check
  would generate bulk traffic against an interface whose replacement is
  announced, to verify results the relaunch may invalidate. It violates the
  courtesy rule and wastes work. The regular cron continues unchanged.
- If any V2a task appears to need historical data, stop and report — that
  means the task was misread.

## V2a scope — the Szenarien page, three tools, nothing elsewhere

The Szenarien page is **the only page with interactive tools** (§10 stands).
German UI, captions per the simplicity rules, tools ship in this order of
certainty:

### 1 · Was-wäre-wenn (what-if)

- The user fixes **exact scorelines** for chosen remaining fixtures of the
  selected league (grid 0–10 per side); fixed fixtures enter the simulation
  input as played. **Tendency-level what-if is explicitly out of scope** — it
  would need outcome-conditioned drawing and a second mechanism; one mechanism
  only.
- The simulation runs in the browser Web Worker at the user's run-count
  setting, with the **standard random keys** — CRN against the unmodified
  data state is automatic because the keys exclude the data state (§3).
- Displayed changes vs. the unmodified view use the **paired-batch SE
  machinery that already exists**: same run count, same batches, Δ per batch,
  `SE(Δ) = SD(Δ_b)/√B`, suppress below 2·SE as „unverändert" (§3 verbatim).
  The caption states run count and that small differences are hidden as noise.
- Resetting a fixture returns it to simulated; a „alles zurücksetzen" control
  clears the scenario. Scenario state is session-only — no storage, no URL
  encoding in this release.

### 2 · Beispielsaison

- Shows **one complete simulated season**: every remaining fixture's drawn
  scoreline and the resulting final table, computed with the engine's
  canonical keys at a **named run index**, so the sample is reproducible.
- „Neue Beispielsaison" advances the run index. The index is displayed
  (»Lauf #17 von 20 000«) — it is the honest label that this is one sample
  from the distribution, and the caption says exactly that: „Eine mögliche
  Saison — keine Prognose."
- Played fixtures show their real results, visually distinct from drawn ones.

### 3 · „Was muss passieren?" — build fully, ship hidden

- Implemented and tested **now**, per the §7 contract as amended: scope
  clause (own fixtures excluded, consistency with the assumed own-points
  distribution), conservative guarantee `P*`, subset-minimal help
  combinations with machine-checkable certificates, deterministic node budget
  (canonical sorting, deterministic branching, no hash-map or parallel
  ordering), truncation declared in German.
- The **corrected §6 tiebreak chain binds it**, including in-season shared
  ranks: guarantees only on strict points separation, no bound on future
  goals, ties count against the club unless already mathematically fixed.
- **Verification per §7's scoping:** exhaustive enumeration as test oracle on
  small synthetic leagues (bounded fixtures, bounded scorelines); property
  tests on larger cases — a claimed guarantee is never violated by any
  sampled scenario; certificate validity and subset-minimality of every
  emitted combination are asserted; **no test demands exhaustiveness.**
- **UI visibility follows the spec, not the calendar of this release:** the
  section renders only when ≤ 5 matchdays remain in the selected league;
  until then it is absent — not greyed, not teased. At an August launch it
  will therefore be invisible for months. That is correct and expected; the
  tests are its proof of existence. No debug backdoor to force it visible in
  production.

## Rolled-in small task from the V1.2 review

One test proving the §5.3 backfill path can construct a **pre-season
snapshot** after the fact: simulate the relaunch case where clubelo's history
becomes available only after a league's first matchday, run the backfill, and
assert the frozen timeline builds from matchday 1 with `backfilled`
provenance and the degraded state clears. If the current backfill only covers
matchday dates and not the pre-season point, extend it — this is the BL2 edge
(relaunch landing between 2026-08-07 and the BL1 start).

## Standing rules (unchanged, restated because this is a new page)

- Every displayed number comes from a tested engine function; the UI computes
  nothing itself. No metric in more than two places.
- CLAUDE.md: precedence chain gains this brief; „Aktueller Zustand" updated
  in the same commit as the state changes.
- Heavy artefacts stay pipeline-side; the what-if and Beispielsaison run
  browser-side by design (user-interactive, session-scoped) — this is the
  §3-consistent split, not an exception to it.

## Acceptance

- Szenarien page live with what-if and Beispielsaison; solver merged, tested,
  and invisible; no interactive tool on any other page.
- What-if deltas use paired-batch SE with the 2·SE floor; a test fixes a
  scoreline already drawn identically in a run and asserts the CRN
  cancellation shows „unverändert" where it should.
- Beispielsaison reproducible by run index; real results visually distinct.
- Solver: oracle agreement on synthetic leagues, property tests, certificate
  and subset-minimality checks, determinism identity test (repeated runs,
  same output), German truncation message.
- Pre-season backfill test present and green.
- Zero clubelo history requests in the whole release (assert by run logs).
- CLAUDE.md chain and state current.

## V2b trigger — defined now so nobody guesses later

V2b (historical seasons) starts only when **all three** hold: (1) the clubelo
relaunch is live; (2) the playbook's one-time re-verification (name forms,
CSV shape, date coverage for all 36 clubs) has passed on the new interface;
(3) a dedicated V2b brief exists — the §5.4 coverage verification plan
depends on what the new interface offers and will be written then. Until all
three: V2b does not exist as a task.
