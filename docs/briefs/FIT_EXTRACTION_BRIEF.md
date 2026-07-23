# Brief — Fit extraction: `packages/fit` replaces the lab dependency

**Amends v5.7 (§5.5, §10) and closes the `LAB_REPO_TOKEN` question by removing
its reason to exist. Runs BEFORE V1.1. Requires a session with BOTH working
copies on disk (this monorepo and the private `football-model-lab`) — the lab
is read, never modified, and nothing beyond the scope below is copied out.**

## Why

The public repo currently references a private lab: the README cites it as
evidence (a 404 for every visitor) and `refit.yml` needs a cross-repo secret
plus a lab-side script that does not exist. Publishing the lab is the wrong
fix — it contains tipping research that §0/§10 deliberately keep quiet, and
publishing would expose its full git history unaudited. The right fix: the
**production fit procedure** moves into this monorepo as `packages/fit`; the
lab stays private as the research notebook.

What this buys: `LAB_REPO_TOKEN` is never created; §10 shrinks back to
`GITHUB_TOKEN` alone; the annual refit becomes publicly reproducible from one
repo; "pinned lab commit hash" becomes an ordinary commit hash of this repo.

## Phase 0 — Inventory (before any code moves)

In the lab working copy, identify and record in the PR description:
1. The exact code path that produced the shipped Track C parameters
   (`data/season-params.json`, `fitDate: 2026-06-30`): entry point, language,
   dependencies, and the lab commit hash it corresponds to.
2. The training dataset it consumed: seasons, leagues, and where the
   per-match pre-match Elo values live.
3. Whether the rolling-origin evaluation (Process B) shares that code path or
   has its own.

**Decision gate in Phase 0:** if the fit is JavaScript/Node, this is a move;
if it is Python (or anything else), it is a **port**, and the reproduction
gate below is the correctness proof either way. Do not start Phase 2 before
recording this.

## Phase 1 — Scope: what moves, what stays

**Moves into `packages/fit`:**
- The parameter fit (Poisson + Dixon-Coles on pre-match Elo; produces every
  field of the `season-params.json` schema, including per-league deltas).
- The rolling-origin fold evaluation (fits + held-out metrics per fold) that
  Process B requires.
- Report generation to the JSON contract documented in
  `pipeline/src/refit/cli.mjs` — the contract does not change; only its
  fulfiller does. `pipeline/src/refit/{gates,decide,report}.mjs` stay as they
  are.
- The lab's **already-fetched training data** for the 15-season window:
  results (OpenLigaDB-derived, ODbL — committable) and per-match pre-match
  Elo values. **No new clubelo requests. None.** The Elo training data
  migrates from the lab's local store into the ratings store behind
  `BUNDESLIGA_RATINGS_DIR` — which means: results data is committed to the
  repo; **Elo training data follows the archive's location rule** and is NOT
  committed publicly while the clubelo permission is outstanding. If the
  answer allows it, committing it later is one configuration-and-copy change.

**Stays in the lab, explicitly:** research phases and notebooks, every
tipping/Kicktipp analysis, negative-result explorations, anything not needed
to run the two refit processes. Future *research* happens in the lab; a
procedure change that should ship becomes a Process B change in THIS repo.

## Phase 2 — Implementation

- `packages/fit` is Node, no native dependencies, consuming
  `packages/engine`'s model code for the likelihood (one implementation of
  Poisson/DC in the monorepo, not two — if the lab fit has its own, the
  engine's is authoritative and the reproduction gate arbitrates).
- Deterministic: same inputs, same output, byte-stable JSON serialisation.
- `refit.yml`: the token check and lab checkout are deleted; the workflow
  calls `packages/fit` directly. The workflow's Process A/B structure,
  gates and PR mechanics are untouched.
- CLI: `node packages/fit/src/cli.mjs --window 2011-2025 --out <file>` and a
  `--folds` mode for Process B, both emitting the documented JSON contract.

## Phase 3 — The reproduction gate (the acceptance criterion that matters)

Run the extracted procedure on the recorded Track C window with the migrated
training data. The output must reproduce the shipped
`data/season-params.json` **within the ex-ante tolerance classes of
`data/refit-tolerances.json`** — the same pre-committed bounds the v5.5
escape hatch uses, applied for exactly the purpose they were designed for.

- Same-language move: expect bit-identical; anything else is a bug.
- Port: numerical differences must stay within the tolerance classes. A
  breach is **investigated, never resolved by widening a tolerance** — the
  bounds are ex ante precisely so this moment cannot be negotiated.
- The comparison table (shipped vs. reproduced, per parameter, with its
  tolerance class) goes into the PR. This PR is the reproduction check that
  Part 1.3 of v5.7 demands for a procedure-carrier change.

## Phase 4 — Follow-through

- **Spec wording:** §5.5 "pinned lab commit hash" → "pinned commit hash of
  this repository"; §10 secrets list → `GITHUB_TOKEN` only (deploy key
  proviso for a private archive stays).
- **`docs/MODEL_EVIDENCE.md`:** a short public summary of the lab findings
  the README wants to cite — the live-vs-frozen result with its
  season-clustered CI, the tested-and-not-built list, the recency conclusion
  and its 15-season window. §8 rules apply verbatim: nulls stay nulls
  („kein messbarer Vorteil"), no per-match intervals, no causal claims.
- **README:** the lab link is replaced by links to `packages/fit` and
  `docs/MODEL_EVIDENCE.md`.
- **User task list shrinks:** `LAB_REPO_TOKEN` and the lab-side
  `run-refit.mjs` are struck; what remains with the user is only the topics
  review and the clubelo reply.

## Acceptance

Phase-0 inventory in the PR; `packages/fit` fulfils the JSON contract with
tests; the reproduction gate passes with the per-parameter table in the PR;
one Poisson/DC implementation (engine) in the monorepo; `refit.yml` runs
without secrets beyond `GITHUB_TOKEN`; results training data committed under
ODbL with source fields, Elo training data behind `BUNDESLIGA_RATINGS_DIR`
and not committed; zero clubelo requests in the entire extraction;
`docs/MODEL_EVIDENCE.md` present and §8-clean; README references repaired;
spec wording amended. V1.1 starts after this merges.
