import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import {
  recipeScoreline,
  scenarioFixtures,
  computePreset,
  fixtureModel,
  duelTargetsByFixture,
} from "../src/lib/season.js";
import {
  predictMatch,
  effectiveParams,
  eloToLambdas,
  buildScorelineDistribution,
} from "../../../packages/engine/src/model.mjs";
import { drawSeasonRun } from "../../../packages/engine/src/simulate.mjs";

// ============================================================================
//  PRESETS_FREIGEBEN_DUELLE (Brief 16) — the released primitive, the preset bar,
//  and the shared duel highlighting.
//
//  The transformation and the preset logic are pure functions in the lib, so the
//  contract is tested directly; the three played states and the „statt real“
//  display are tested through the rendered FixtureRow; the honesty captions are
//  anchored so the corrected wording cannot silently drift.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const PARAMS = read("data/season-params.json");
const CONFIG = read("data/seasons/2026/config.json");
const SEASON = read("data/seasons/2026/bl1/season.json");
const OUTLOOK = read("data/seasons/2026/bl1/outlook.json");
const PREMATCH = read("data/seasons/2026/bl1/prematch.json");
const nameOf = (() => { const m = new Map(SEASON.clubs.map((c) => [c.clubId, c.name])); return (id) => m.get(id) ?? id; })();

const EP = effectiveParams(PARAMS.params, { league: "bl1" });
const modelFromElos = (eh, ea) => {
  const { lamH, lamA } = eloToLambdas(eh, ea, EP);
  return { dist: buildScorelineDistribution(lamH, lamA, EP), prediction: predictMatch(eh, ea, EP) };
};

// ---------------------------------------------------------------------------
//  §2.3 recipeScoreline — the recipe definitions are the contract
// ---------------------------------------------------------------------------

test("„forecast“ sets the favourite-tendency modal; „global“ sets the absolute modal", () => {
  const model = modelFromElos(1800, 1500); // strong home favourite
  const fixture = { homeClubId: "H", awayClubId: "A" };
  assert.deepEqual(recipeScoreline("forecast", model, fixture), model.prediction.favourite.scoreline);
  assert.deepEqual(recipeScoreline("global", model, fixture), model.prediction.mostLikely.score);
  // For a strong home favourite the two often DIFFER: the global modal can be a
  // draw while the favourite tendency is a home win.
  const fav = recipeScoreline("forecast", model, fixture);
  assert.ok(fav[0] > fav[1], "favourite of a strong home side is a home win");
});

test("„clubWins“ sets the modal within THAT club's win region, and only for its own matches", () => {
  const model = modelFromElos(1650, 1650);
  const fixture = { homeClubId: "H", awayClubId: "A" };
  const home = recipeScoreline("clubWins", model, fixture, "H");
  const away = recipeScoreline("clubWins", model, fixture, "A");
  assert.ok(home[0] > home[1], "home wins region → home goals greater");
  assert.ok(away[0] < away[1], "away wins region → away goals greater");
  // A club not in this match has no unambiguous result → left untouched.
  assert.equal(recipeScoreline("clubWins", model, fixture, "OTHER"), null);
});

test("„clubLoses“ is the mirror of „clubWins“ — the modal within THAT club's LOSS region", () => {
  const model = modelFromElos(1650, 1650);
  const fixture = { homeClubId: "H", awayClubId: "A" };
  // The home club losing = an away win; the away club losing = a home win.
  const homeLoses = recipeScoreline("clubLoses", model, fixture, "H");
  const awayLoses = recipeScoreline("clubLoses", model, fixture, "A");
  assert.ok(homeLoses[0] < homeLoses[1], "home club loses → away goals greater");
  assert.ok(awayLoses[0] > awayLoses[1], "away club loses → home goals greater");
  // It is exactly the opposite region of clubWins for the same club.
  assert.deepEqual(homeLoses, recipeScoreline("clubWins", model, fixture, "A"));
  assert.deepEqual(awayLoses, recipeScoreline("clubWins", model, fixture, "H"));
  assert.equal(recipeScoreline("clubLoses", model, fixture, "OTHER"), null);
});

test("„surprise“ sets the modal within the LEAST likely tendency — even when that is the draw", () => {
  // Two equally strong sides: the draw is the least likely tendency (home and
  // away each carry more mass), so the surprise is a draw scoreline.
  const model = modelFromElos(1700, 1700);
  const t = model.prediction.tendency;
  assert.ok(t.draw < t.homeWin && t.draw < t.awayWin, "draw must be the least likely tendency here");
  const sl = recipeScoreline("surprise", model, { homeClubId: "H", awayClubId: "A" });
  assert.equal(sl[0], sl[1], `surprise ${sl.join(":")} must be a draw when the draw is least likely`);
});

// ---------------------------------------------------------------------------
//  §1 the data-state transformation (released → both goals removed)
// ---------------------------------------------------------------------------

test("scenarioFixtures: released removes BOTH goals; fixed sets both; the guard can never fire", () => {
  const open = SEASON.fixtures[0];
  // A synthetic played fixture (2026 pre-season has none of its own), distinct id.
  const played = { ...SEASON.fixtures[1], gh: 2, ga: 1 };
  const fixtures = [open, played];
  const overrides = {
    [open.id]: { kind: "fixed", gh: 3, ga: 0 },
    [played.id]: { kind: "released" },
  };
  const out = scenarioFixtures(fixtures, overrides);
  const byId = Object.fromEntries(out.map((f) => [f.id, f]));
  // Released → neither goal present (both removed, never one).
  assert.equal("gh" in byId[played.id], false);
  assert.equal("ga" in byId[played.id], false);
  // Fixed → both present.
  assert.deepEqual([byId[open.id].gh, byId[open.id].ga], [3, 0]);
  // The half-defined guard fires on exactly-one-goal; no output fixture is ever
  // half defined.
  for (const f of out) assert.equal("gh" in f, "ga" in f, `${f.id} is half-defined`);
});

test("scenarioFixtures leaves an untouched played fixture at its real result and open ones open", () => {
  const open = SEASON.fixtures.find((f) => f.gh === undefined);
  const played = { ...SEASON.fixtures[1], gh: 0, ga: 0 };
  const out = scenarioFixtures([open, played], {});
  const byId = Object.fromEntries(out.map((f) => [f.id, f]));
  assert.equal("gh" in byId[open.id], false, "an untouched open fixture stays open");
  assert.deepEqual([byId[played.id].gh, byId[played.id].ga], [0, 0], "an untouched played fixture keeps its result");
});

// ---------------------------------------------------------------------------
//  §1 CRN: untouched fixtures contribute 0 even with a released neighbour
// ---------------------------------------------------------------------------

test("CRN: releasing one played fixture does not perturb any OTHER fixture's draw in the same run", () => {
  // Baseline: fixture A is played 2:1. Modified: A is released (both goals gone,
  // so it is simulated). Because the fixture keys exclude the data state (§3),
  // every OTHER fixture draws byte-identically in both worlds — so an untouched
  // fixture contributes exactly 0 to the paired-batch delta.
  const engineFixtures = SEASON.fixtures.map((f, i) =>
    (i === 0
      ? { id: f.id, home: f.homeClubId, away: f.awayClubId, gh: 2, ga: 1 } // A played
      : { id: f.id, home: f.homeClubId, away: f.awayClubId }));            // rest open
  const A = engineFixtures[0].id;
  const released = engineFixtures.map((f) => (f.id === A ? { id: f.id, home: f.home, away: f.away } : f));

  const clubs = SEASON.clubs.map((c) => ({ clubId: c.clubId, rating: OUTLOOK.ratings[c.clubId] }));
  const rules = { pointsForWin: 3, pointsForDraw: 1, criteria: CONFIG.leagues.bl1.tiebreakCriteria };
  const draw = (fixtures, runIndex) =>
    drawSeasonRun({ seasonId: "2026-bl1", league: "bl1", clubs, fixtures, params: PARAMS.params, rules, runIndex });

  let matchingRuns = 0;
  for (let r = 0; r < 200; r++) {
    const base = draw(engineFixtures, r);
    const mod = draw(released, r);
    const baseById = new Map(base.scorelines.map((s) => [s.id, s]));
    for (const s of mod.scorelines) {
      if (s.id === A) continue; // A itself legitimately differs (played vs drawn)
      const b = baseById.get(s.id);
      assert.equal(s.gh, b.gh, `${s.id} home draw diverged`);
      assert.equal(s.ga, b.ga, `${s.id} away draw diverged`);
    }
    // When the released fixture happens to draw its real 2:1, the WHOLE season is
    // identical to the baseline — the cancellation the paired SE rests on.
    const drewA = mod.scorelines.find((s) => s.id === A);
    if (drewA.gh === 2 && drewA.ga === 1) {
      matchingRuns++;
      assert.deepEqual(mod.table.map((t) => [t.clubId, t.pts, t.rank]), base.table.map((t) => [t.clubId, t.pts, t.rank]));
    }
  }
  assert.ok(matchingRuns > 0, "the oracle must find runs where the released fixture drew its real result");
});

// ---------------------------------------------------------------------------
//  §2 the preset bar: counters, „unberührt“ clause, and stacking
// ---------------------------------------------------------------------------

const modelOf = (f) => fixtureModel(f, PREMATCH, PARAMS, "bl1");

test("applying „forecast“ to all open fixtures reports the count and the unberührt clause", () => {
  const { overrides, message } = computePreset({
    fixtures: SEASON.fixtures, overrides: {}, area: "open", recipe: "forecast", modelOf,
  });
  const openCount = SEASON.fixtures.filter((f) => f.gh === undefined).length;
  assert.equal(Object.keys(overrides).length, openCount, "every open fixture is set");
  assert.match(message, new RegExp(`^${openCount} festgesetzt`));
  // Every open fixture had a model → nothing „unverändert“ → no unberührt clause.
  assert.doesNotMatch(message, /unberührt/);
  assert.ok(message.endsWith("."), "the message is a full sentence");
});

test("„reset“ on the played area frees played fixtures and counts them as freigegeben", () => {
  // Inject a couple of played fixtures.
  const fixtures = SEASON.fixtures.map((f, i) => (i < 3 ? { ...f, gh: 1, ga: 0 } : f));
  const { overrides, message } = computePreset({
    fixtures, overrides: {}, area: "played", recipe: "reset", modelOf,
  });
  assert.equal(Object.values(overrides).filter((o) => o.kind === "released").length, 3);
  assert.match(message, /^3 freigegeben/);

  // Applying it a SECOND time re-releases nothing: already-released fixtures count
  // as unchanged, so the message says so and the map is not rewritten.
  const again = computePreset({ fixtures, overrides, area: "played", recipe: "reset", modelOf });
  assert.deepEqual(again.overrides, overrides, "already-released fixtures are not rewritten");
  assert.match(again.message, /3 unverändert/);
  assert.doesNotMatch(again.message, /freigegeben/);
});

test("„random“ is Elo-free and deterministic given an injected rng — both teams draw fairly", () => {
  // A fixed rng makes the pure function testable; the same rng yields the same
  // scorelines, and the draw uses NO model (modelOf is never consulted).
  const fixtures = SEASON.fixtures.filter((f) => f.matchday === 1);
  const seq = [0.05, 0.95, 0.5, 0.5, 0.99, 0.01]; // deterministic uniforms
  let i = 0;
  const rng = () => seq[(i++) % seq.length];
  let modelCalls = 0;
  const spyModel = (f) => { modelCalls++; return modelOf(f); };
  const a = computePreset({ fixtures, overrides: {}, area: "matchday", areaMd: 1, recipe: "random", modelOf: spyModel, rng });
  assert.equal(modelCalls, 0, "the random recipe must not consult the Elo model");
  // Every game in the area is fixed to a concrete scoreline.
  for (const f of fixtures) {
    const o = a.overrides[f.id];
    assert.equal(o.kind, "fixed");
    assert.ok(Number.isInteger(o.gh) && Number.isInteger(o.ga) && o.gh >= 0 && o.ga >= 0);
  }
  // Deterministic: same rng sequence → identical result (purity).
  i = 0;
  const b = computePreset({ fixtures, overrides: {}, area: "matchday", areaMd: 1, recipe: "random", modelOf, rng: () => seq[(i++) % seq.length] });
  assert.deepEqual(b.overrides, a.overrides);
  assert.match(a.message, new RegExp(`^${fixtures.length} festgesetzt`));
});

test("presets STACK — a second application overwrites only its own area (§2.4)", () => {
  const md1 = SEASON.fixtures.filter((f) => f.matchday === 1).map((f) => f.id);
  const md2 = SEASON.fixtures.filter((f) => f.matchday === 2).map((f) => f.id);

  const first = computePreset({
    fixtures: SEASON.fixtures, overrides: {}, area: "matchday", areaMd: 1, recipe: "forecast", modelOf,
  }).overrides;
  const firstMd1 = md1.map((id) => JSON.stringify(first[id]));

  const second = computePreset({
    fixtures: SEASON.fixtures, overrides: first, area: "matchday", areaMd: 2, recipe: "global", modelOf,
  }).overrides;

  // Matchday 1's overrides are carried through untouched…
  for (let i = 0; i < md1.length; i++) assert.equal(JSON.stringify(second[md1[i]]), firstMd1[i]);
  // …and matchday 2 is now set too.
  for (const id of md2) assert.ok(second[id], `${id} should be set by the second application`);
});

test("the club filter INTERSECTS the area — only that club's matches within it", () => {
  // The club is a first-level filter now, not an area. With area „open" and a
  // chosen club, only that club's OPEN matches are set.
  const club = SEASON.clubs[0].clubId;
  const { overrides } = computePreset({
    fixtures: SEASON.fixtures, overrides: {}, area: "open", club, recipe: "forecast", modelOf,
  });
  assert.ok(Object.keys(overrides).length > 0, "the club has open matches to act on");
  for (const id of Object.keys(overrides)) {
    const f = SEASON.fixtures.find((x) => x.id === id);
    assert.ok(f.homeClubId === club || f.awayClubId === club, `${id} is not a match of ${club}`);
    assert.equal(f.gh, undefined, `${id} must be an OPEN match (area = open)`);
  }
});

test("club = null (Alle Vereine) passes every fixture in the area", () => {
  const withoutClub = computePreset({ fixtures: SEASON.fixtures, overrides: {}, area: "open", club: null, recipe: "forecast", modelOf });
  const openCount = SEASON.fixtures.filter((f) => f.gh === undefined).length;
  assert.equal(Object.keys(withoutClub.overrides).length, openCount, "no club filter → the whole area");
});

test("the „duels“ area restricts to the artefact's θ-duel list — one shared source", () => {
  const duelBy = duelTargetsByFixture(SEASON, OUTLOOK, CONFIG.leagues.bl1);
  const { overrides } = computePreset({
    fixtures: SEASON.fixtures, overrides: {}, area: "duels", recipe: "forecast", duelBy, modelOf,
  });
  const setIds = new Set(Object.keys(overrides));
  // Exactly the duel fixtures that had a model result are set; none outside.
  for (const id of setIds) assert.ok(duelBy.has(id), `${id} set but is not a duel`);
  assert.ok(setIds.size > 0, "the pre-season has duels to act on");
});

// ---------------------------------------------------------------------------
//  Render: the three played states and the „statt real“ display
// ---------------------------------------------------------------------------

const mod = await harness();
const { FixtureRow, DuelChip, Explainer, PresetBar } = mod;

const played = { id: "PL", homeClubId: SEASON.clubs[0].clubId, awayClubId: SEASON.clubs[1].clubId, gh: 2, ga: 1, matchday: 1 };
const prediction = predictMatch(1700, 1500, EP);

const renderRow = (override) => strip(renderToStaticMarkup(React.createElement(FixtureRow, {
  fixture: played, nameOf, prediction, override, onFix: () => {}, onRelease: () => {}, onReset: () => {},
})));

test("a played fixture defaults to its real result with Freigeben and Festsetzen", () => {
  const html = renderRow(undefined);
  assert.match(html, /Real 2:1/);
  assert.match(html, /Freigeben/);
  assert.match(html, /Festsetzen/);
  assert.doesNotMatch(html, /statt real/);
});

test("a released played fixture reads „Freigegeben — wird simuliert“ and keeps „statt real 2:1“", () => {
  const html = renderRow({ kind: "released" });
  assert.match(html, /Freigegeben — wird simuliert/);
  assert.match(html, /statt real 2:1/);
  assert.match(html, /zurück zu real/);
});

test("a re-fixed played fixture reads „Festgesetzt: g:g“ and keeps „statt real 2:1“", () => {
  const html = renderRow({ kind: "fixed", gh: 0, ga: 3 });
  assert.match(html, /Festgesetzt: 0:3/);
  assert.match(html, /statt real 2:1/);
});

// ---------------------------------------------------------------------------
//  §3 duel highlighting — the chip, the multi-target case, one source
// ---------------------------------------------------------------------------

test("DuelChip shows the highest-ranked target and names all in its title", () => {
  const targets = [
    { target: "meister", label: "Meister", rank: 0 },
    { target: "platz1bis4", label: "Platz 1–4", rank: 1 },
  ];
  const html = renderToStaticMarkup(React.createElement(DuelChip, { targets }));
  assert.match(strip(html), /Titelduell/);           // the rank-0 target's label
  assert.match(html, /title="Titelduell · Duell um Platz 1–4"/); // all, in order
});

test("the duel highlighting is driven from ONE shared source in both places", () => {
  // Both the what-if list and the Spieltage page read the shared ctx-aware
  // selector (which picks the live or archive source) and render the shared
  // DuelChip — no second duel computation.
  const szen = fs.readFileSync(path.join(REPO, "apps/public/src/pages/Szenarien.jsx"), "utf8");
  const spielt = fs.readFileSync(path.join(REPO, "apps/public/src/pages/Spieltage.jsx"), "utf8");
  for (const [name, src] of [["Szenarien", szen], ["Spieltage", spielt]]) {
    assert.match(src, /duelTargetsForCtx/, `${name} must read the shared ctx selector`);
    assert.match(src, /DuelChip/, `${name} must render the shared chip`);
  }
  // The building blocks each exist once, in the lib, and the θ-rule is the one
  // engine directDuels — live and archive are two data sources, one implementation.
  const lib = fs.readFileSync(path.join(REPO, "apps/public/src/lib/season.js"), "utf8");
  assert.equal((lib.match(/export function duelTargetsFromList/g) ?? []).length, 1);
  assert.equal((lib.match(/export function seasonDuels/g) ?? []).length, 1);
  assert.equal((lib.match(/directDuels\(/g) ?? []).length, 2, "one call for live, one for archive — same engine fn");
});

// ---------------------------------------------------------------------------
//  Honesty captions — anchored so the wording cannot drift (§1, §2.2)
// ---------------------------------------------------------------------------

test("the „ratings do not rewind“ caption is present in the what-if explainer", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Explainer)));
  assert.match(html, /Ratings spulen nicht zurück — auch bei geänderten früheren Ergebnissen rechnet die Simulation mit den Ratings des aktuellen Datenstands\./);
});

test("the surprise definition is anchored verbatim in the preset captions", () => {
  const src = fs.readFileSync(path.join(REPO, "apps/public/src/pages/Szenarien.jsx"), "utf8");
  assert.match(src, /Überraschung = der aus Modellsicht unwahrscheinlichste Ausgang, mit dessen wahrscheinlichstem Ergebnis\./);
});

test("the duel caption half-sentence is present on the what-if list", () => {
  // Rendered as the Card caption over the fixture list.
  const src = fs.readFileSync(path.join(REPO, "apps/public/src/pages/Szenarien.jsx"), "utf8");
  assert.match(src, /Hervorgehoben: direkte Duelle \(beide Klubs ≥ 10 % auf dasselbe Ziel\)\./);
});
