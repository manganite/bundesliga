import test from "node:test";
import assert from "node:assert/strict";
import {
  analyseRequirement, verifyHelpCertificate, isSubsetMinimal, DEFAULT_NODE_BUDGET,
} from "../src/solver.mjs";
import { buildTable, rankTable } from "../src/ranking.mjs";

// ============================================================================
//  „Was muss passieren?" — the solver.
//
//  The load-bearing test is the EXHAUSTIVE ORACLE below: on small synthetic
//  leagues it enumerates every remaining scoreline and checks that the solver's
//  guarantee is NEVER violated by any completion. That is the whole point — the
//  guarantee must be sound, not tight. Nothing here demands the search be
//  exhaustive (§7 forbids testing that).
// ============================================================================

const RULES = { pointsForWin: 3, pointsForDraw: 1 };

/** Round-robin remaining fixtures among `clubs`, minus the already-played set. */
function roundRobin(clubs) {
  const fixtures = [];
  for (let i = 0; i < clubs.length; i++) {
    for (let j = 0; j < clubs.length; j++) {
      if (i !== j) fixtures.push({ home: clubs[i], away: clubs[j] });
    }
  }
  return fixtures;
}

/** The final ranked table for one completion (a scoreline per remaining fixture). */
function finalTable(clubs, played, remaining, scorelines, rules = RULES) {
  const matches = played.concat(remaining.map((f, i) => ({ ...f, gh: scorelines[i][0], ga: scorelines[i][1] })));
  const table = buildTable(clubs, matches, rules);
  return rankTable(table, matches, { inSeason: false, rules });
}

/** X's finishing position (worst position within a shared rank — a tie is unfavourable). */
function worstPositionOf(ranked, clubId) {
  const row = ranked.find((r) => r.clubId === clubId);
  const sameRank = ranked.filter((r) => r.rank === row.rank);
  // Standard competition ranking already gives the block's top position as
  // `rank`; the worst position within the block is rank + size − 1.
  return row.rank + sameRank.length - 1;
}

/**
 * Enumerate every completion. Scorelines are bounded to a small set — enough to
 * realise every points outcome (win/draw/loss) AND to vary goal difference, so
 * the oracle exercises the tiebreak, not only the points.
 */
const SCORELINES = [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2], [1, 1], [3, 0], [0, 3]];

function* completions(nFixtures) {
  const idx = new Array(nFixtures).fill(0);
  while (true) {
    yield idx.map((i) => SCORELINES[i]);
    let k = nFixtures - 1;
    while (k >= 0) {
      idx[k]++;
      if (idx[k] < SCORELINES.length) break;
      idx[k] = 0;
      k--;
    }
    if (k < 0) return;
  }
}

/**
 * THE ORACLE. For a small league, assert: whenever X earns at least P* own
 * points in a completion, X actually finishes in the target — under the real
 * DFL ranker, worst-position-within-a-tie. No completion may violate it.
 */
function assertGuaranteeSound({ clubs, played, remaining, clubId, target }) {
  const table = buildTable(clubs, played, RULES);
  const rows = clubs.map((c) => ({ clubId: c, pts: table.find((r) => r.clubId === c)?.pts ?? 0 }));
  const result = analyseRequirement({ table: rows, remaining, clubId, target, rules: RULES });

  const ownIdx = remaining
    .map((f, i) => ((f.home === clubId || f.away === clubId) ? i : -1))
    .filter((i) => i >= 0);

  let checked = 0;
  let sawAtOrAboveP = 0;
  for (const scorelines of completions(remaining.length)) {
    checked++;
    const ranked = finalTable(clubs, played, remaining, scorelines);
    const pos = worstPositionOf(ranked, clubId);

    // Own points in this completion.
    let ownPts = 0;
    for (const i of ownIdx) {
      const [gh, ga] = scorelines[i];
      const xHome = remaining[i].home === clubId;
      const xGoals = xHome ? gh : ga;
      const oGoals = xHome ? ga : gh;
      ownPts += xGoals > oGoals ? RULES.pointsForWin : xGoals === oGoals ? RULES.pointsForDraw : 0;
    }

    if (result.kind === "guaranteed" && ownPts >= result.pStar) {
      sawAtOrAboveP++;
      assert.ok(
        pos <= target.to,
        `GUARANTEE VIOLATED: X earned ${ownPts} ≥ P*=${result.pStar} but finished ${pos} (target ≤ ${target.to})`,
      );
    }
  }
  return { result, checked, sawAtOrAboveP };
}

// ---------------------------------------------------------------------------
//  Guarantee soundness on synthetic leagues.
// ---------------------------------------------------------------------------

test("ORACLE: a two-club decider — the guarantee is never violated", () => {
  // Two clubs, they play each other twice. X one point behind.
  const clubs = ["x", "y"];
  const played = [{ home: "x", away: "y", gh: 0, ga: 1 }];
  const remaining = [{ home: "x", away: "y" }, { home: "y", away: "x" }];
  const { result, sawAtOrAboveP } = assertGuaranteeSound({
    clubs, played, remaining, clubId: "x", target: { from: 1, to: 1 },
  });
  assert.equal(result.kind, "guaranteed");
  assert.ok(sawAtOrAboveP > 0, "the oracle must actually reach the P* case");
});

test("ORACLE: a three-club title race — guarantee sound across every completion", () => {
  const clubs = ["a", "b", "c"];
  const played = [
    { home: "a", away: "b", gh: 1, ga: 0 },
    { home: "b", away: "c", gh: 2, ga: 0 },
    { home: "c", away: "a", gh: 0, ga: 0 },
  ];
  const remaining = [{ home: "b", away: "a" }, { home: "c", away: "b" }, { home: "a", away: "c" }];
  for (const clubId of clubs) {
    const { result } = assertGuaranteeSound({ clubId, clubs, played, remaining, target: { from: 1, to: 1 } });
    assert.ok(["guaranteed", "help", "impossible"].includes(result.kind));
  }
});

test("ORACLE: a four-club top-two race, several fixtures left", () => {
  const clubs = ["a", "b", "c", "d"];
  const played = [
    { home: "a", away: "b", gh: 2, ga: 1 },
    { home: "c", away: "d", gh: 1, ga: 1 },
    { home: "a", away: "c", gh: 0, ga: 0 },
    { home: "b", away: "d", gh: 3, ga: 0 },
  ];
  const remaining = [
    { home: "b", away: "c" }, { home: "d", away: "a" }, { home: "c", away: "a" }, { home: "d", away: "b" },
  ];
  for (const clubId of clubs) {
    assertGuaranteeSound({ clubId, clubs, played, remaining, target: { from: 1, to: 2 } });
  }
});

test("ORACLE: full round-robin from scratch, three clubs, every target", () => {
  const clubs = ["a", "b", "c"];
  const remaining = roundRobin(clubs);
  for (const to of [1, 2]) {
    for (const clubId of clubs) {
      assertGuaranteeSound({ clubId, clubs, played: [], remaining, target: { from: 1, to } });
    }
  }
});

// ---------------------------------------------------------------------------
//  The conservative rule itself.
// ---------------------------------------------------------------------------

test("a runaway leader is guaranteed with zero further points", () => {
  const clubs = ["x", "y", "z"];
  // X on 30, others on 3, one game each left → nobody can catch X.
  const table = [{ clubId: "x", pts: 30 }, { clubId: "y", pts: 3 }, { clubId: "z", pts: 3 }];
  const remaining = [{ home: "y", away: "z" }];
  const r = analyseRequirement({ table, remaining, clubId: "x", target: { from: 1, to: 1 }, rules: RULES });
  assert.equal(r.kind, "guaranteed");
  assert.equal(r.pStar, 0);
});

test("a tie on points counts against the club — the guarantee needs strict separation", () => {
  const clubs = ["x", "y"];
  // Level on points, X plays nobody remaining, Y can draw level exactly.
  const table = [{ clubId: "x", pts: 10 }, { clubId: "y", pts: 7 }];
  const remaining = [{ home: "y", away: "z" }]; // z not in the title picture
  const r = analyseRequirement({
    table: [...table, { clubId: "z", pts: 0 }], remaining, clubId: "x", target: { from: 1, to: 1 }, rules: RULES,
  });
  // Y can reach 10 (7+3) = tie → threat. X has no games, so X cannot separate →
  // not guaranteed from own strength.
  assert.notEqual(r.kind, "guaranteed");
});

test("„nicht aus eigener Kraft“ is reported with a necessary minimum and help", () => {
  // X wins out to 23; two rivals sit below that but can each climb past it, so X
  // cannot guarantee first from own strength — one of them must be held down.
  const table = [
    { clubId: "x", pts: 20 }, { clubId: "y", pts: 18 }, { clubId: "z", pts: 18 }, { clubId: "w", pts: 0 },
  ];
  const remaining = [
    { home: "x", away: "w" },
    { home: "y", away: "w" }, { home: "y", away: "w" },
    { home: "z", away: "w" }, { home: "z", away: "w" },
  ];
  const r = analyseRequirement({ table, remaining, clubId: "x", target: { from: 1, to: 1 }, rules: RULES });
  assert.equal(r.kind, "help");
  assert.equal(typeof r.necessary, "number");
  assert.ok(r.combinations.length > 0, "at least one sufficient combination must be emitted");
});

// ---------------------------------------------------------------------------
//  Certificates and subset-minimality — the acceptance criteria.
// ---------------------------------------------------------------------------

function helpCase() {
  // Two rivals both able to overtake X; target is „win the title", so exactly
  // one of them must be held down.
  const table = [
    { clubId: "x", pts: 20 }, { clubId: "y", pts: 18 }, { clubId: "z", pts: 18 },
    { clubId: "w", pts: 0 },
  ];
  const remaining = [
    { home: "x", away: "w" },       // X wins out → 23
    { home: "y", away: "w" }, { home: "y", away: "w" }, // y can reach 24
    { home: "z", away: "w" }, { home: "z", away: "w" }, // z can reach 24
  ];
  return analyseRequirement({ table, remaining, clubId: "x", target: { from: 1, to: 1 }, rules: RULES });
}

test("every emitted combination carries a VALID certificate", () => {
  const r = helpCase();
  assert.equal(r.kind, "help");
  const state = certificateState(r);
  for (const combo of r.combinations) {
    assert.ok(verifyHelpCertificate(state, combo).ok, `certificate invalid for ${JSON.stringify(combo)}`);
  }
});

test("every emitted combination is SUBSET-MINIMAL", () => {
  const r = helpCase();
  const state = certificateState(r);
  for (const combo of r.combinations) {
    assert.ok(isSubsetMinimal(state, combo), `not subset-minimal: ${JSON.stringify(combo)}`);
    // And concretely: dropping any one constraint breaks the certificate.
    for (let i = 0; i < combo.constraints.length; i++) {
      const without = { constraints: combo.constraints.filter((_, j) => j !== i) };
      assert.ok(!verifyHelpCertificate(state, without).ok, "a constraint was removable — not minimal");
    }
  }
});

test("a certificate rejects a combination that does not actually suffice", () => {
  const r = helpCase();
  const state = certificateState(r);
  // An empty combination cannot suffice when there are two threats and one seat.
  assert.equal(verifyHelpCertificate(state, { constraints: [] }).ok, false);
});

// Rebuild the certificate state the solver used, from the public result. In the
// UI this comes back on the result; here we reconstruct it for the assertions.
const certificateState = (result) => result.__state;

// ---------------------------------------------------------------------------
//  Determinism.
// ---------------------------------------------------------------------------

test("same inputs give byte-identical output, regardless of input order", () => {
  const table = [
    { clubId: "z", pts: 18 }, { clubId: "x", pts: 20 }, { clubId: "w", pts: 0 }, { clubId: "y", pts: 18 },
  ];
  const remaining = [
    { home: "z", away: "w" }, { home: "x", away: "w" }, { home: "y", away: "w" },
    { home: "z", away: "w" }, { home: "y", away: "w" },
  ];
  const a = analyseRequirement({ table, remaining, clubId: "x", target: { from: 1, to: 1 }, rules: RULES });
  // Shuffle both arrays; canonical sorting inside must erase the difference.
  const b = analyseRequirement({
    table: [...table].reverse(),
    remaining: [...remaining].reverse(),
    clubId: "x", target: { from: 1, to: 1 }, rules: RULES,
  });
  assert.deepEqual(stripState(a), stripState(b));
});

test("the node budget bounds the search and declares truncation", () => {
  const table = Array.from({ length: 10 }, (_, i) => ({ clubId: `c${i}`, pts: i === 0 ? 20 : 19 }));
  const remaining = [];
  for (let i = 1; i < 10; i++) remaining.push({ home: `c${i}`, away: "opp" }, { home: `c${i}`, away: "opp" });
  remaining.push({ home: "c0", away: "opp" });
  table.push({ clubId: "opp", pts: 0 });
  const tight = analyseRequirement({
    table, remaining, clubId: "c0", target: { from: 1, to: 1 }, rules: RULES, nodeBudget: 3,
  });
  if (tight.kind === "help") {
    assert.equal(tight.truncated, true);
    assert.match(tight.truncationNote, /nicht vollständig durchsucht/);
  }
});

const stripState = (r) => { const { __state, ...rest } = r; return rest; };

// ---------------------------------------------------------------------------
//  Property tests on larger leagues — a claimed guarantee is never violated by
//  any SAMPLED completion. Deterministic pseudo-random, so a failure reproduces.
// ---------------------------------------------------------------------------

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

test("PROPERTY: on random 6-club leagues the guarantee holds on every sampled completion", () => {
  const clubs = ["a", "b", "c", "d", "e", "f"];
  const rand = lcg(20260807);
  let guaranteesChecked = 0;

  for (let trial = 0; trial < 40; trial++) {
    // A random partial season: each pair may have played 0, 1 or 2 of their games.
    const played = [];
    const remaining = [];
    for (let i = 0; i < clubs.length; i++) {
      for (let j = 0; j < clubs.length; j++) {
        if (i === j) continue;
        const f = { home: clubs[i], away: clubs[j] };
        if (rand() < 0.55) {
          const gh = Math.floor(rand() * 4);
          const ga = Math.floor(rand() * 4);
          played.push({ ...f, gh, ga });
        } else {
          remaining.push(f);
        }
      }
    }
    if (remaining.length === 0 || remaining.length > 9) continue; // keep sampling tractable

    const table = buildTable(clubs, played, RULES);
    const rows = clubs.map((c) => ({ clubId: c, pts: table.find((r) => r.clubId === c)?.pts ?? 0 }));

    for (const clubId of clubs) {
      for (const to of [1, 4]) {
        const target = { from: 1, to };
        const result = analyseRequirement({ table: rows, remaining, clubId, target, rules: RULES });
        if (result.kind !== "guaranteed") continue;

        const ownIdx = remaining
          .map((f, k) => ((f.home === clubId || f.away === clubId) ? k : -1)).filter((k) => k >= 0);

        // Sample completions rather than enumerate (up to 9 fixtures = 8^9).
        for (let s = 0; s < 300; s++) {
          const scorelines = remaining.map(() => SCORELINES[Math.floor(rand() * SCORELINES.length)]);
          let ownPts = 0;
          for (const k of ownIdx) {
            const [gh, ga] = scorelines[k];
            const xHome = remaining[k].home === clubId;
            const xg = xHome ? gh : ga;
            const og = xHome ? ga : gh;
            ownPts += xg > og ? 3 : xg === og ? 1 : 0;
          }
          if (ownPts < result.pStar) continue;
          const ranked = finalTable(clubs, played, remaining, scorelines);
          const pos = worstPositionOf(ranked, clubId);
          assert.ok(pos <= to, `VIOLATION trial ${trial} ${clubId} to=${to}: own ${ownPts} ≥ ${result.pStar}, finished ${pos}`);
          guaranteesChecked++;
        }
      }
    }
  }
  assert.ok(guaranteesChecked > 0, "the property test must actually exercise some guarantees");
});

test("the default node budget is a documented constant, used when none is passed", () => {
  assert.equal(typeof DEFAULT_NODE_BUDGET, "number");
  assert.ok(DEFAULT_NODE_BUDGET > 0);
});
