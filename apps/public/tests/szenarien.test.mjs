import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  Szenarien (V2a) — the only page with interactive tools.
//
//  What a render test can see that a logic test cannot: that the solver section
//  is ABSENT (not greyed, not teased) until ≤ 5 matchdays remain, and that the
//  page is the only place these tools live.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const PARAMS = read("data/season-params.json");
const { Szenarien } = await harness();

function ctxFor(season, league, { fixtures } = {}) {
  const config = read(`data/seasons/${season}/config.json`);
  const seasonData = read(`data/seasons/${season}/${league}/season.json`);
  if (fixtures) seasonData.fixtures = fixtures;
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    season: seasonData,
    outlook: maybe(`data/seasons/${season}/${league}/outlook.json`),
    leagueConfig: config.leagues[league],
    config,
    league,
    leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    params: PARAMS,
    nameOf: (id) => names.get(id) ?? id,
    matchday: 1,
  };
}

const renderPage = (ctx) => renderToStaticMarkup(React.createElement(Szenarien, { ctx }));

test("the page offers what-if — and no longer the Beispielsaison (moved to Methodik)", () => {
  const html = strip(renderPage(ctxFor(2026, "bl1")));
  assert.match(html, /Was-wäre-wenn/);
  assert.doesNotMatch(html, /Beispielsaison/);
});

test("the what-if explainer describes the three states in user language", () => {
  const html = strip(renderPage(ctxFor(2026, "bl1")));
  assert.match(html, /neu ausgewürfelt — mal so, mal so/);
  assert.match(html, /mit demselben Zufall — Veränderungen kommen so wirklich von deinen Ergebnissen/);
  // The insider sentence was removed (§2.2).
  assert.doesNotMatch(html, /Tendenz-Was-wäre-wenn/);
});

test("the solver is ABSENT at the start of a season, not greyed or teased", () => {
  // 2026/27 pre-season: all 34 matchdays remain.
  const html = strip(renderPage(ctxFor(2026, "bl1")));
  assert.doesNotMatch(html, /Was muss passieren/);
});

test("the solver APPEARS only when at most five matchdays remain", () => {
  const base = read("data/seasons/2026/bl1/season.json");
  // Mark all but the last five matchdays as played, so exactly 5 remain.
  const maxMd = Math.max(...base.fixtures.map((f) => f.matchday));
  const withResults = base.fixtures.map((f) =>
    (f.matchday <= maxMd - 5 ? { ...f, gh: 1, ga: 0 } : f));
  const html = strip(renderPage(ctxFor(2026, "bl1", { fixtures: withResults })));
  assert.match(html, /Was muss passieren/);
  // And the conservative-rule caption is present.
  assert.match(html, /Der Vergleich wird bei Punktgleichheit zuungunsten des Klubs entschieden/);
});

test("six matchdays remaining is still too early — the boundary is exact", () => {
  const base = read("data/seasons/2026/bl1/season.json");
  const maxMd = Math.max(...base.fixtures.map((f) => f.matchday));
  const withResults = base.fixtures.map((f) =>
    (f.matchday <= maxMd - 6 ? { ...f, gh: 1, ga: 0 } : f));
  const html = strip(renderPage(ctxFor(2026, "bl1", { fixtures: withResults })));
  assert.doesNotMatch(html, /Was muss passieren/);
});

test("a fully played season offers nothing to play through", () => {
  const base = read("data/seasons/2025/bl1/season.json");
  const html = strip(renderPage(ctxFor(2025, "bl1")));
  const anyRemaining = base.fixtures.some((f) => f.gh === undefined);
  if (!anyRemaining) {
    assert.match(html, /keine Spiele mehr offen/);
    assert.doesNotMatch(html, /Was-wäre-wenn/);
  }
});

test("no OTHER page carries an ANALYTIC tool — the §10 refinement", () => {
  // Refined by SZENARIEN_UX §2.1: ANALYTIC interaction (inputs that alter a
  // forecast) stays exclusive to Szenarien. The ILLUSTRATIVE Beispielsaison
  // (drawSeasonRun via the sample worker) is allowed on Methodik, because it
  // analyses nothing and changes nothing.
  const pagesDir = path.join(REPO, "apps/public/src/pages");
  const offenders = [];
  for (const file of fs.readdirSync(pagesDir)) {
    if (file === "Szenarien.jsx") continue;
    const src = fs.readFileSync(path.join(pagesDir, file), "utf8");
    if (/analyseRequirement|kind: "whatif"/.test(src)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `analytic tooling leaked into: ${offenders.join(", ")}`);
  // And Methodik is exactly where the illustrative widget lives.
  const methodik = fs.readFileSync(path.join(pagesDir, "Methodik.jsx"), "utf8");
  assert.match(methodik, /kind: "sample"/, "the illustrative Beispielsaison belongs on Methodik");
});
