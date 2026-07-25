import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { simulateSeason } from "../../../packages/engine/src/simulate.mjs";
import { reportDelta } from "../../../packages/engine/src/metrics.mjs";

// ============================================================================
//  FIX — Szenarien on an ARCHIVE (fully-played) season. The `remaining.length`
//  early-return was a Brief-16 leftover that walled off a working path. Two
//  tests: one THROUGH THE PAGE (the missing level — the old test checked the
//  mechanics below the guard and stayed green while the page blocked), and one
//  on the deterministic base the delta path must digest.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { Szenarien } = await harness();

function ctxFor(year, league, isArchive = true) {
  const config = read(`data/seasons/${year}/config.json`);
  const season = read(`data/seasons/${year}/${league}/season.json`);
  const names = new Map(season.clubs.map((c) => [c.clubId, c.name]));
  return {
    seasonId: year, league, leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    leagueConfig: config.leagues[league], config, season,
    outlook: read(`data/seasons/${year}/${league}/outlook.json`),
    timeline: read(`data/seasons/${year}/${league}/timeline-frozen.json`),
    timelineLive: null,
    prematch: read(`data/seasons/${year}/${league}/prematch.json`),
    params: read("data/season-params.json"),
    relegation: read("data/relegation.json"),
    playoff: null,
    clubs: names, nameOf: (id) => names.get(id) ?? id,
    matchday: 34, phase: "finished", carried: [], isArchive,
  };
}

test("§3: an archive season renders the fixture list, not the old empty state", () => {
  const html = renderToStaticMarkup(React.createElement(Szenarien, { ctx: ctxFor(2015, "bl1") }));
  const text = strip(html);
  // The old „season is played, nothing open" empty state must NEVER show.
  assert.doesNotMatch(text, /keine Spiele mehr offen/);
  // The what-if tool and its fixture list ARE there…
  assert.match(text, /Was-wäre-wenn/);
  // …every game in the (default = last) matchday shown as a real result with
  // the Freigeben and Festsetzen controls.
  assert.match(text, /Real \d+:\d+/);
  assert.match(text, /Freigeben/);
  assert.match(text, /Festsetzen/);
  // The preset bar is present (an archive season is the purest form of the tool).
  assert.match(text, /Anwenden &(?:amp;)? rechnen/);
  // The scenario final table renders its default (no run yet).
  assert.match(text, /Simulierte Schlusstabelle/);
});

test("§FIX: the archive Explainer clause is reachable and anchored on the page", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Szenarien, { ctx: ctxFor(2015, "bl1") })));
  assert.match(html, /Ratings des aktuellen Datenstands \(hier: die Ratings vom Saisonende\)/);
});

test("§FIX: the solver stays absent on a fully-played season (no open games to solve)", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Szenarien, { ctx: ctxFor(2015, "bl1") })));
  assert.doesNotMatch(html, /Was muss passieren/);
});

test("a season with NO fixtures shows the reworded data-less empty state", () => {
  const ctx = { ...ctxFor(2015, "bl1"), season: { ...ctxFor(2015, "bl1").season, fixtures: [] } };
  const html = strip(renderToStaticMarkup(React.createElement(Szenarien, { ctx })));
  assert.match(html, /Für diese Saison liegen keine Spieldaten vor/);
});

// ---------------------------------------------------------------------------
//  §2 — the deterministic base the delta path must digest cleanly.
// ---------------------------------------------------------------------------

test("§2: a fully-played base is deterministic (Meister 100%), and releasing games moves it", () => {
  const season = read("data/seasons/2015/bl1/season.json");
  const config = read("data/seasons/2015/config.json").leagues.bl1;
  const params = read("data/season-params.json").params;
  const outlook = read("data/seasons/2015/bl1/outlook.json");
  const clubs = season.clubs.map((c) => ({ clubId: c.clubId, rating: outlook.ratings[c.clubId] }));
  const rules = { pointsForWin: config.pointsForWin, pointsForDraw: config.pointsForDraw, criteria: config.tiebreakCriteria };
  const targets = Object.fromEntries(
    Object.entries(config.targets).map(([n, t]) => [n, { places: t.places, positions: (r) => r >= t.from && r <= t.to }]),
  );
  const common = { seasonId: "2015-bl1", league: "bl1", clubs, params, targets, runs: 2000, batches: 20, rules };
  const engine = (f) => ({ id: f.id, home: f.homeClubId, away: f.awayClubId, ...(f.gh !== undefined ? { gh: f.gh, ga: f.ga } : {}) });

  const baseFixtures = season.fixtures.map(engine);
  const baseline = simulateSeason({ ...common, fixtures: baseFixtures });
  // The real champion is 100% certain when everything is played (degenerate).
  assert.equal(baseline.probabilities.meister.Bayern, 1);

  // „Freigeben": remove BOTH goals from all of Bayern's games → they are simulated.
  const released = season.fixtures.map((f) => {
    const e = engine(f);
    if (f.homeClubId === "Bayern" || f.awayClubId === "Bayern") { delete e.gh; delete e.ga; }
    return e;
  });
  const modified = simulateSeason({ ...common, fixtures: released });
  assert.ok(modified.probabilities.meister.Bayern < 1, "releasing Bayern's games injects real uncertainty");
  assert.ok(modified.probabilities.meister.Bayern > 0);

  // The paired-batch delta digests the 0/1 base cleanly — no NaN, a real move.
  const perBatch = modified.batchFrequencies.meister.Bayern.map((v, b) => v - baseline.batchFrequencies.meister.Bayern[b]);
  const report = reportDelta(perBatch);
  assert.ok(Number.isFinite(report.delta) && Number.isFinite(report.floor));
  assert.ok(report.significant, "the title probability moves measurably off 100%");
});
