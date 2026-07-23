import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { drawSeasonRun } from "../../../packages/engine/src/simulate.mjs";
import { predictFixture } from "../src/lib/season.js";
import { predictMatch, effectiveParams } from "../../../packages/engine/src/model.mjs";

// ============================================================================
//  SZENARIEN_UX — presentation polish. The states are driven by component
//  state, so they are tested through the exported presentational pieces with
//  props: open vs. fixed vs. stale, the fixed-summary, the Beispielsaison index
//  round-trip, and the ONE shared fixture-prediction component.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const PARAMS = read("data/season-params.json");
const SEASON = read("data/seasons/2026/bl1/season.json");
const OUTLOOK = read("data/seasons/2026/bl1/outlook.json");
const PREMATCH = read("data/seasons/2026/bl1/prematch.json");
const CONFIG = read("data/seasons/2026/config.json");
const nameOf = (() => { const m = new Map(SEASON.clubs.map((c) => [c.clubId, c.name])); return (id) => m.get(id) ?? id; })();

const EP = effectiveParams(PARAMS.params, { league: "bl1" });
const predictFixtureFor = (eh, ea) => predictMatch(eh, ea, EP);

const mod = await harness();
const { FixturePrediction, FixtureRow, FixedSummary, WhatIfResult, SampleResult, StepEinSpiel, Methodik, Szenarien } = mod;

const someOpen = SEASON.fixtures.find((f) => f.gh === undefined);
const prediction = predictFixture(someOpen, PREMATCH, PARAMS, "bl1");

// ---------------------------------------------------------------------------
//  §1.2 open state · §1.3 fixed state
// ---------------------------------------------------------------------------

test("an open fixture shows its state and prediction — no score input", () => {
  const html = renderToStaticMarkup(React.createElement(FixtureRow, {
    fixture: { id: someOpen.id, homeClubId: someOpen.homeClubId, awayClubId: someOpen.awayClubId },
    nameOf, prediction, fixed: undefined, onFix: () => {}, onReset: () => {},
  }));
  const text = strip(html);
  assert.match(text, /Simuliert/);
  assert.match(text, /wahrscheinlichstes Ergebnis \d+:\d+/);
  assert.match(text, /Festsetzen/);
  // The 0:0 default input must NOT be present in the open state (§1.2).
  assert.doesNotMatch(html, /<select/);
});

test("a fixed fixture shows „Festgesetzt: g:g“ and a reset, no prediction", () => {
  const html = renderToStaticMarkup(React.createElement(FixtureRow, {
    fixture: { id: someOpen.id, homeClubId: someOpen.homeClubId, awayClubId: someOpen.awayClubId },
    nameOf, prediction, fixed: { gh: 0, ga: 2 }, onFix: () => {}, onReset: () => {},
  }));
  const text = strip(html);
  assert.match(text, /Festgesetzt: 0:2/);
  assert.match(text, /zurück zu simuliert/);
  assert.doesNotMatch(text, /Simuliert —/);
});

// ---------------------------------------------------------------------------
//  §1.1 the fixed-summary keeps off-matchday fixtures visible
// ---------------------------------------------------------------------------

test("a fixed fixture appears in the summary even when its matchday is not selected", () => {
  // Two fixtures on different matchdays, both fixed; the summary lists both.
  const f1 = SEASON.fixtures.find((f) => f.gh === undefined && f.matchday === 1);
  const f2 = SEASON.fixtures.find((f) => f.gh === undefined && f.matchday === 3);
  const fixed = { [f1.id]: { gh: 2, ga: 1 }, [f2.id]: { gh: 0, ga: 0 } };
  const html = strip(renderToStaticMarkup(React.createElement(FixedSummary, {
    fixedList: [
      { id: f1.id, homeClubId: f1.homeClubId, awayClubId: f1.awayClubId },
      { id: f2.id, homeClubId: f2.homeClubId, awayClubId: f2.awayClubId },
    ],
    fixed, nameOf, onClearOne: () => {}, onClearAll: () => {},
  })));
  assert.match(html, /Festgesetzt \(2\)/);
  assert.match(html, new RegExp(`${nameOf(f1.homeClubId)} 2:1`));
  assert.match(html, new RegExp(`${nameOf(f2.homeClubId)} 0:0`));
  assert.match(html, /alles zurücksetzen/);
});

// ---------------------------------------------------------------------------
//  §1.4 stale state · §1.5 result table title + sentences
// ---------------------------------------------------------------------------

const fakeSim = {
  status: "done",
  result: {
    deltas: {
      meister: { [SEASON.clubs[0].clubId]: { baseline: 0.4, modified: 0.5, delta: 0.1, se: 0.01, floor: 0.02, significant: true } },
    },
  },
};
const targets = [{ id: "meister", label: "Meister" }];

test("the result table carries its title, the coupling sentence and the noise-floor clause", () => {
  const html = strip(renderToStaticMarkup(React.createElement(WhatIfResult, {
    sim: fakeSim, targets, nameOf, runs: 20000, stale: false,
  })));
  assert.match(html, /Veränderung gegenüber der unveränderten Prognose/);
  assert.match(html, /jedes Ergebnis verschiebt zugleich die Rechnung der Konkurrenten/);
  assert.match(html, /Unterschiede, die auch reiner Zufall erzeugen könnte, sind ausgeblendet/);
});

test("a stale result is dimmed and labelled until re-run (§1.4)", () => {
  const fresh = renderToStaticMarkup(React.createElement(WhatIfResult, { sim: fakeSim, targets, nameOf, runs: 20000, stale: false }));
  const stale = renderToStaticMarkup(React.createElement(WhatIfResult, { sim: fakeSim, targets, nameOf, runs: 20000, stale: true }));
  assert.doesNotMatch(fresh, /is-stale/);
  assert.match(stale, /is-stale/);
  assert.match(strip(stale), /Eingaben geändert — Ergebnis veraltet/);
});

// ---------------------------------------------------------------------------
//  §2 Methodik: the Beispielsaison index round-trip, and the ONE shared component
// ---------------------------------------------------------------------------

function sampleFor(runIndex) {
  return drawSeasonRun({
    seasonId: "2026-bl1", league: "bl1",
    clubs: SEASON.clubs.map((c) => ({ clubId: c.clubId, rating: OUTLOOK.ratings[c.clubId] })),
    fixtures: SEASON.fixtures.map((f) => ({ id: f.id, home: f.homeClubId, away: f.awayClubId, ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}) })),
    params: PARAMS.params,
    rules: { pointsForWin: 3, pointsForDraw: 1, criteria: CONFIG.leagues.bl1.tiebreakCriteria },
    runIndex,
  });
}

test("the Beispielsaison renders a run identically for the same index (round-trip)", () => {
  const a = renderToStaticMarkup(React.createElement(SampleResult, { sim: { status: "done", result: sampleFor(14381) }, nameOf }));
  const b = renderToStaticMarkup(React.createElement(SampleResult, { sim: { status: "done", result: sampleFor(14381) }, nameOf }));
  assert.equal(a, b, "the same index must render the same season");
  const other = renderToStaticMarkup(React.createElement(SampleResult, { sim: { status: "done", result: sampleFor(14382) }, nameOf }));
  assert.notEqual(a, other, "a different index must render a different season");
});

test("real results are visually distinguished from drawn ones in the Beispielsaison", () => {
  const withResults = { ...SEASON, fixtures: SEASON.fixtures.map((f, i) => (i < 5 ? { ...f, gh: 1, ga: 0 } : f)) };
  const sample = drawSeasonRun({
    seasonId: "2026-bl1", league: "bl1",
    clubs: withResults.clubs.map((c) => ({ clubId: c.clubId, rating: OUTLOOK.ratings[c.clubId] })),
    fixtures: withResults.fixtures.map((f) => ({ id: f.id, home: f.homeClubId, away: f.awayClubId, ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}) })),
    params: PARAMS.params, rules: { pointsForWin: 3, pointsForDraw: 1, criteria: CONFIG.leagues.bl1.tiebreakCriteria }, runIndex: 3,
  });
  const html = renderToStaticMarkup(React.createElement(SampleResult, { sim: { status: "done", result: sample }, nameOf }));
  assert.match(html, /real-score/, "played results carry a distinct class");
  assert.match(html, /drawn-score/, "drawn results carry the drawn class");
});

test("the shared component shows the CONDITIONAL scoreline — a win tendency never reads as a draw", () => {
  // A home favourite whose global modal is a draw: the display must show the
  // conditional modal, which is a home win (§SCORELINE_KONVENTION).
  const homeFav = predictFixtureFor(1720, 1600);
  assert.equal(homeFav.mostLikely.score.join(":"), "1:1", "the global modal is a draw for this case");
  const html = strip(renderToStaticMarkup(React.createElement(FixturePrediction, { prediction: homeFav, prefix: "Simuliert" })));
  assert.match(html, /Heimsieg/);
  // The shown scoreline is a home win (home goals strictly greater), never the 1:1.
  const m = html.match(/wahrscheinlichstes Ergebnis (\d+):(\d+)/);
  assert.ok(m, "a scoreline must be shown");
  assert.ok(Number(m[1]) > Number(m[2]), `shown ${m[1]}:${m[2]} is not a home win`);
});

test("Methodik step 2 shows the SAME fixture presentation as the what-if „Simuliert“ state", () => {
  // Both must render FixturePrediction for the same prediction → same text.
  const shared = strip(renderToStaticMarkup(React.createElement(FixturePrediction, { prediction, prefix: null })));
  const inRow = strip(renderToStaticMarkup(React.createElement(FixtureRow, {
    fixture: { id: someOpen.id, homeClubId: someOpen.homeClubId, awayClubId: someOpen.awayClubId },
    nameOf, prediction, fixed: undefined, onFix: () => {}, onReset: () => {},
  })));
  // The favourite/modal phrasing from the shared component appears verbatim in the row.
  assert.ok(inRow.includes(shared), "the what-if row must render the shared prediction component");
});

// ---------------------------------------------------------------------------
//  §2.1 the §10 refinement: Beispielsaison is on Methodik and NOT on Szenarien
// ---------------------------------------------------------------------------

function ctx() {
  return {
    season: SEASON, outlook: OUTLOOK, prematch: PREMATCH, params: PARAMS,
    leagueConfig: CONFIG.leagues.bl1, config: CONFIG, league: "bl1", leagueLabel: "Bundesliga",
    nameOf, matchday: 1,
  };
}

test("Szenarien no longer carries the Beispielsaison; its header describes only the what-if", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Szenarien, { ctx: ctx() })));
  assert.match(html, /Was-wäre-wenn/);
  assert.doesNotMatch(html, /Beispielsaison/);
  assert.doesNotMatch(html, /Neue Beispielsaison/);
});

test("Methodik carries the four steps and the Beispielsaison exhibit", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Methodik, { ctx: ctx() })));
  assert.match(html, /So entsteht die Prognose/);
  assert.match(html, /1 · Stärke/);
  assert.match(html, /2 · Ein Spiel/);
  assert.match(html, /3 · Eine Saison/);
  assert.match(html, /Saisons/); // step 4 heading includes the run count
  assert.match(html, /Neue Beispielsaison auswürfeln/);
  assert.match(html, /Das ist EIN vollständiger Durchlauf/);
});

test("the §10 refinement holds in source: no analytic tool leaked off Szenarien", () => {
  const pagesDir = path.join(REPO, "apps/public/src/pages");
  const offenders = [];
  for (const file of fs.readdirSync(pagesDir)) {
    if (file === "Szenarien.jsx") continue;
    const src = fs.readFileSync(path.join(pagesDir, file), "utf8");
    // analyseRequirement and the what-if delta are the ANALYTIC bits; drawSeasonRun
    // (the illustrative sample) is allowed on Methodik.
    if (/analyseRequirement|kind: "whatif"/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `analytic tooling leaked into: ${offenders.join(", ")}`);
});
