import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { preSeason, throughMatchday, withPostponed } from "./harness/seasonStates.mjs";
import { anchorSource, halfSeasonTable, herbstmeisterFact } from "../src/lib/halbserie.js";
import { simulateSeason } from "../../../packages/engine/src/simulate.mjs";

// ============================================================================
//  The half-season package (HALBSERIEN §2–§6), through the PAGES.
//
//  Two things this file is careful about, both learned the hard way here:
//
//  * The season STATE is constructed, never borrowed from the running season.
//    „The Hinrunde is complete" is true in January and false in August, and a
//    test that reads it off `data/seasons/2026` is a weather report that would
//    take the deploy gate down with it.
//  * The gate is tested through the PAGE, not under it. A helper that returns
//    the right answer while the page never calls it is exactly the failure the
//    2014 archive test missed.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { TabelleUndPrognose, Teams, Modellguete, Verlauf, Uebersicht, HalfSeasonMarker } = await harness();

const LIVE = read("data/meta.json").season;
const ARCHIVE = 2015;

const load = (year, league) => {
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    season: read(`data/seasons/${year}/${league}/season.json`),
    config: read(`data/seasons/${year}/config.json`),
    outlook: maybe(`data/seasons/${year}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${year}/${league}/timeline-frozen.json`),
    prematch: maybe(`data/seasons/${year}/${league}/prematch.json`),
    params: read("data/season-params.json"),
  };
};

/** A page context in the shape App.jsx builds. */
function ctxFor(year, league, { season, isArchive = false } = {}) {
  const d = load(year, league);
  const s = season ?? d.season;
  const names = new Map(s.clubs.map((c) => [c.clubId, c.name ?? c.clubId]));
  return {
    season: s,
    config: d.config,
    leagueConfig: d.config.leagues[league],
    outlook: d.outlook,
    timeline: d.timeline,
    timelineLive: null,
    prematch: d.prematch,
    params: d.params,
    playoff: null,
    relegation: null,
    league,
    leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    nameOf: (id) => names.get(id) ?? id,
    carried: [],
    isArchive,
    phase: "running",
    matchday: 1,
    clubs: s.clubs,
  };
}

const renderPage = (Page, ctx) => renderToStaticMarkup(React.createElement(Page, { ctx }));

// ---------------------------------------------------------------------------
//  §2 — the half-season switch on Tabelle & Prognose.
// ---------------------------------------------------------------------------

test("no half is offered before it has a played match — the switch simply is not there", () => {
  const ctx = ctxFor(LIVE, "bl1", { season: preSeason(load(LIVE, "bl1").season) });
  const html = renderPage(TabelleUndPrognose, ctx);
  assert.doesNotMatch(html, /Hinrunde/, "a Hinrunde tab with nothing played says nothing");
  assert.doesNotMatch(html, /Rückrunde/);
});

test("the switch arrives with the first Rückrunde result, not before", () => {
  const base = load(LIVE, "bl1").season;
  // Asserted on the TAB, not on prose: the „Wie gerechnet?" text names both
  // halves either way, so a plain word match would pass for the wrong reason.
  const tab = (html, id) => html.includes(`id="halbserie-tab-${id}"`);

  const early = renderPage(TabelleUndPrognose, ctxFor(LIVE, "bl1", { season: throughMatchday(base, 3) }));
  assert.ok(!tab(early, "hin"), "while only the first half is played, „Gesamt“ IS the Hinrunde");
  assert.ok(!tab(early, "rueck"));

  const late = renderPage(TabelleUndPrognose, ctxFor(LIVE, "bl1", { season: throughMatchday(base, 20) }));
  assert.ok(tab(late, "gesamt") && tab(late, "hin") && tab(late, "rueck"));
});

test("the half table drops the forecast columns — half results never sit beside full-season expectations", () => {
  const base = load(LIVE, "bl1").season;
  const html = renderPage(TabelleUndPrognose, ctxFor(LIVE, "bl1", { season: throughMatchday(base, 20) }));
  // The projected columns exist exactly once — in the „Gesamt" panel. Tabs render
  // every panel into the DOM, so a second occurrence would mean a half table
  // grew them.
  assert.equal((html.match(/>erw\. Pkt</g) ?? []).length, 1);
});

// ---------------------------------------------------------------------------
//  §2 — the per-club balance on Teams.
// ---------------------------------------------------------------------------

test("the club balance splits into halves only once both halves have matches", () => {
  const base = load(LIVE, "bl1").season;
  const early = strip(renderPage(Teams, ctxFor(LIVE, "bl1", { season: throughMatchday(base, 10) })));
  assert.doesNotMatch(early, /Bilanz je Halbserie/, "with only the first half played, the split is the same row twice");

  const late = strip(renderPage(Teams, ctxFor(LIVE, "bl1", { season: throughMatchday(base, 25) })));
  assert.match(late, /Bilanz je Halbserie/);
});

// ---------------------------------------------------------------------------
//  §4 + §7 — the completeness gate. The load-bearing test of this package.
// ---------------------------------------------------------------------------

test("the Halbzeitbilanz waits for the LAST fixture of the first half, not for the calendar", () => {
  const base = load(ARCHIVE, "bl1").season;
  const boundary = load(ARCHIVE, "bl1").config.leagues.bl1.herbstmeisterUntilMatchday;

  const before = strip(renderPage(Modellguete, ctxFor(ARCHIVE, "bl1", {
    season: throughMatchday(base, boundary - 1), isArchive: true,
  })));
  assert.doesNotMatch(before, /Halbzeitbilanz/, "one matchday short");

  const on = strip(renderPage(Modellguete, ctxFor(ARCHIVE, "bl1", {
    season: throughMatchday(base, boundary), isArchive: true,
  })));
  assert.match(on, /Halbzeitbilanz/, "exactly on the boundary it appears");

  // The case the completeness rule exists for: matchday 25 is long played, but
  // one fixture of matchday 12 was postponed. The Hinrunde is NOT finished, and
  // a section that gates on „current matchday > 17" would be wrong here.
  const postponed = strip(renderPage(Modellguete, ctxFor(ARCHIVE, "bl1", {
    season: withPostponed(base, 25, 12), isArchive: true,
  })));
  assert.doesNotMatch(postponed, /Halbzeitbilanz/, "a hole in the first half keeps it open");
});

test("the same hole withholds the Herbstmeister FACT — it is never announced over a missing result", () => {
  const base = load(ARCHIVE, "bl1").season;
  const boundary = load(ARCHIVE, "bl1").config.leagues.bl1.herbstmeisterUntilMatchday;

  const complete = strip(renderPage(Uebersicht, ctxFor(ARCHIVE, "bl1", {
    season: throughMatchday(base, boundary), isArchive: true,
  })));
  assert.match(complete, /Herbstmeister:/);

  const postponed = strip(renderPage(Uebersicht, ctxFor(ARCHIVE, "bl1", {
    season: withPostponed(base, 25, 12), isArchive: true,
  })));
  // The forecast line may still show; the FACT must not.
  assert.doesNotMatch(postponed, /Herbstmeister \(geteilt\)/);
  const factLike = /Herbstmeister: [^%]*$/.test(postponed);
  assert.ok(!factLike || /%/.test(postponed), "without a complete first half there is no fact, only a probability");
});

test("every number the Halbzeitbilanz prints is a number", () => {
  // This test exists because the first version of the card printed NaN in three
  // columns and every other test stayed green. The engine's quality metrics
  // return { value, n, baseline, direction }, not a bare number, and formatting
  // the OBJECT is silent — it renders, it just renders nonsense. A page-level
  // scan for NaN is the cheapest thing that would have caught it.
  const base = load(ARCHIVE, "bl1").season;
  const html = strip(renderPage(Modellguete, ctxFor(ARCHIVE, "bl1", { season: base, isArchive: true })));
  assert.match(html, /Modellgüte je Halbserie/, "the section is actually rendered");
  assert.doesNotMatch(html, /NaN/, "a formatted metric object renders as NaN");
  assert.doesNotMatch(html, /undefined/);
  // And the figures are the real ones, not zeros: a first half of a Bundesliga
  // season has 153 matches, and the accuracy of a working model is well clear
  // of the floor.
  assert.match(html, /Treffsicherheit/);
  assert.match(html, /\d{2,3},\d %/, "a percentage with real digits");
});

// ---------------------------------------------------------------------------
//  The anchor is ranked ONCE. Engine and page must not disagree about it.
// ---------------------------------------------------------------------------

test("a half is ranked under the IN-SEASON rules even when it is complete", () => {
  // Codex review of PR #47. `inSeason: false` unlocks the direct comparison
  // (criteria 3–5), and the Spielordnung releases it only once a tied group has
  // met home AND away. Inside a half no pair ever does — the Hinrunde is exactly
  // one leg per pairing. Ranking a finished Hinrunde as „not in season" therefore
  // separates clubs on a single-leg head-to-head, silently: the table just looks
  // decided.
  //
  // Four clubs, one leg each. A and B beat C and D and draw with each other, so
  // both stand on 7 points, +2, 2 scored — level on criteria 1 and 2, and the
  // rules stop there.
  const clubs = ["A", "B", "C", "D"].map((clubId) => ({ clubId, name: clubId }));
  const results = [
    ["A", "B", 0, 0], ["A", "C", 1, 0], ["D", "A", 0, 1],
    ["B", "C", 1, 0], ["B", "D", 1, 0], ["C", "D", 0, 0],
  ];
  const season = {
    clubs,
    fixtures: results.map(([home, away, gh, ga], i) => ({
      id: `f${i}`, matchday: i < 3 ? 1 : i < 5 ? 2 : 3,
      homeClubId: home, awayClubId: away, gh, ga, finished: true,
      kickoff: `2026-08-0${i + 1}T15:30:00Z`,
    })),
  };
  const leagueConfig = {
    pointsForWin: 3, pointsForDraw: 1, matchdayCount: 6, herbstmeisterUntilMatchday: 3,
    tiebreakCriteria: ["goalDifference", "goalsFor", "h2hAggregate", "h2hAwayGoals", "awayGoals"],
    targets: { meister: { places: 1, from: 1, to: 1, label: "Meister" } },
  };

  const table = halfSeasonTable(season, leagueConfig, "hin");
  const leaders = table.filter((r) => r.rank === 1).map((r) => r.clubId).sort();
  assert.deepEqual(leaders, ["A", "B"], "a single-leg head-to-head must not separate them");
  assert.ok(table[0].sharedRank);

  const fact = herbstmeisterFact(season, leagueConfig);
  assert.deepEqual(fact.clubIds.slice().sort(), ["A", "B"]);
  assert.equal(fact.shared, true);
});

test("the page's Herbstmeister fact agrees with the engine's tally, club for club", () => {
  // The invariant that matters: two implementations of „who leads at the anchor"
  // exist — the engine ranks it per run, the page reads it off the real results.
  // They must never contradict each other, or the page disputes the artefact it
  // is there to display. This is the case that caught it.
  const ids = ["A", "B", "C", "D"];
  const clubs = ids.map((clubId, i) => ({ clubId, name: clubId, rating: 1700 - i * 40 }));
  const results = [
    ["A", "B", 0, 0], ["A", "C", 1, 0], ["D", "A", 0, 1],
    ["B", "C", 1, 0], ["B", "D", 1, 0], ["C", "D", 0, 0],
  ];
  const fixtures = results.map(([home, away, gh, ga], i) => ({
    id: `f${i}`, matchday: i < 3 ? 1 : i < 5 ? 2 : 3,
    homeClubId: home, awayClubId: away, gh, ga, finished: true,
    kickoff: `2026-08-0${i + 1}T15:30:00Z`,
  }));
  const leagueConfig = {
    pointsForWin: 3, pointsForDraw: 1, matchdayCount: 6, herbstmeisterUntilMatchday: 3,
    tiebreakCriteria: ["goalDifference", "goalsFor", "h2hAggregate", "h2hAwayGoals", "awayGoals"],
    targets: { meister: { places: 1, from: 1, to: 1, label: "Meister" } },
  };

  const sim = simulateSeason({
    seasonId: "agree", league: "bl1", clubs, params: read("data/season-params.json").params,
    targets: { meister: { places: 1, positions: (r) => r === 1 } },
    runs: 200, batches: 10,
    rules: { pointsForWin: 3, pointsForDraw: 1, criteria: leagueConfig.tiebreakCriteria },
    fixtures: fixtures.map((f) => ({
      id: f.id, home: f.homeClubId, away: f.awayClubId, matchday: f.matchday, gh: f.gh, ga: f.ga,
    })),
    herbstmeisterUntilMatchday: 3,
  });

  const engineLeaders = Object.entries(sim.herbstmeister.probabilities)
    .filter(([, p]) => p === 1).map(([id]) => id).sort();
  const pageLeaders = herbstmeisterFact({ clubs, fixtures }, leagueConfig).clubIds.slice().sort();
  assert.deepEqual(pageLeaders, engineLeaders, "page and artefact must name the same leaders");
  assert.deepEqual(engineLeaders, ["A", "B"]);
  assert.equal(sim.herbstmeister.sharedProbability, 1);
});

// ---------------------------------------------------------------------------
//  §5 — the honesty anchor. Required verbatim, and „Form" is banned.
// ---------------------------------------------------------------------------

test("the half-season performance view carries the §5 sentence verbatim", async () => {
  const { HALBSERIE_ERWARTUNG_NOTE } = await import("../src/lib/archive.js");
  assert.match(HALBSERIE_ERWARTUNG_NOTE, /Die Erwartung lernt mit/);
  assert.match(HALBSERIE_ERWARTUNG_NOTE, /kennen die Hinrunde bereits/);
  assert.match(HALBSERIE_ERWARTUNG_NOTE, /zeigt hier keinen Einbruch/);
  assert.match(HALBSERIE_ERWARTUNG_NOTE, /nicht Punkteform\.$/);

  const base = load(ARCHIVE, "bl1").season;
  const html = strip(renderPage(Teams, ctxFor(ARCHIVE, "bl1", { season: base, isArchive: true })));
  assert.ok(
    html.includes(strip(HALBSERIE_ERWARTUNG_NOTE)),
    "without this sentence the view tells regression to the mean as a collapse",
  );
});

test("„Form“ does not appear in any UI string of this package", () => {
  // The word is banned because it is the misreading the §5 sentence exists to
  // prevent — what is measured is performance against the expectation of the
  // moment, and „Form" says something else. Same shape as the „entrandet" scan.
  const files = [
    "apps/public/src/lib/halbserie.js",
    "apps/public/src/components/Halbzeitbilanz.jsx",
    "apps/public/src/components/Herbstmeister.jsx",
    "apps/public/src/components/DreiAnker.jsx",
  ];
  const offenders = [];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(REPO, rel), "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      // Only whole-word „Form" / „Formkurve" and friends — „Information",
      // „formatted" and „Plattform" are not the word being banned.
      if (/\bForm(kurve|schwäche|hoch|tief|krise)?\b/.test(line)) offenders.push(`${rel}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [], `„Form“ is not the measured quantity; found at ${offenders.join(", ")}`);
});

// ---------------------------------------------------------------------------
//  §6 — the three anchors, gated on a complete season.
// ---------------------------------------------------------------------------

test("the three-anchor comparison needs a FINISHED season, and every archive season has one", () => {
  const base = load(ARCHIVE, "bl1").season;
  const running = strip(renderPage(Verlauf, ctxFor(ARCHIVE, "bl1", {
    season: throughMatchday(base, 30), isArchive: true,
  })));
  assert.doesNotMatch(running, /Saisonstart, Halbzeit, Ausgang/, "the outcome is not known yet");

  const finished = strip(renderPage(Verlauf, ctxFor(ARCHIVE, "bl1", { season: base, isArchive: true })));
  assert.match(finished, /Saisonstart, Halbzeit, Ausgang/);
  assert.match(finished, /erreicht/, "the outcome column is the third anchor");
  // §V2b.1: a historical curve says what it is.
  assert.match(finished, /Retrospektive Modellrechnung/);
});

test("the anchor wording follows the CURVE — the frozen one never claims rating updates", () => {
  // The §0 v5 sentence („neue Ergebnisse und aktualisierte Ratings") is true of
  // the live-rating curve only. An archive season has just the frozen curve,
  // which holds every rating at its pre-season value by construction — and the
  // archive is where this comparison is read most. Shipping the live wording as
  // the default would therefore have made the usual case the false one.
  const base = load(ARCHIVE, "bl1").season;
  const html = strip(renderPage(Verlauf, ctxFor(ARCHIVE, "bl1", { season: base, isArchive: true })));
  assert.match(html, /Ratings sind über die ganze Saison eingefroren/);
  assert.doesNotMatch(
    html, /verändert sich durch neue Ergebnisse und aktualisierte Ratings/,
    "the frozen curve contains no rating update to credit",
  );
  assert.doesNotMatch(html, /Aufwertungseffekt|Punkteeffekt/, "no causal naming, on either curve");

  // And the live wording is what the live curve gets. `anchorSource` is the one
  // place that pairs curve and sentence, so it is testable directly.
  const live = anchorSource(null, { points: [{ matchday: 0 }] });
  assert.equal(live.live, true);
  assert.match(live.note, /neue Ergebnisse und aktualisierte Ratings/);
  const frozen = anchorSource({ points: [{ matchday: 0 }] }, null);
  assert.equal(frozen.live, false);
  assert.match(frozen.note, /eingefroren/);
  assert.equal(anchorSource(null, null), null);
});

// ---------------------------------------------------------------------------
//  §2 — one marker implementation.
// ---------------------------------------------------------------------------

test("only ChartInteractive.jsx writes .half-marker", () => {
  const roots = ["apps/public/src/pages", "apps/public/src/components"];
  const offenders = [];
  for (const rootRel of roots) {
    for (const file of fs.readdirSync(path.join(REPO, rootRel))) {
      if (!/\.jsx?$/.test(file) || file === "ChartInteractive.jsx") continue;
      const src = fs.readFileSync(path.join(REPO, rootRel, file), "utf8");
      if (/["']half-marker["']/.test(src)) offenders.push(`${rootRel}/${file}`);
    }
  }
  assert.deepEqual(offenders, [], `a second .half-marker writer: ${offenders.join(", ")}`);
});

test("the marker renders once the chart spans the boundary — and not before", () => {
  const x = (md) => md * 10;
  const spans = renderToStaticMarkup(React.createElement(HalfSeasonMarker, {
    boundary: 17, maxMatchday: 30, x, top: 0, bottom: 100,
  }));
  assert.match(spans, /half-marker/);
  assert.match(spans, /Halbserie/);

  // A chart that stops at matchday 9 must not assert a boundary it has not
  // reached, and a season without a configured boundary has none to assert.
  for (const props of [{ boundary: 17, maxMatchday: 9 }, { boundary: null, maxMatchday: 30 }, { boundary: 17, maxMatchday: 17 }]) {
    assert.equal(
      renderToStaticMarkup(React.createElement(HalfSeasonMarker, { ...props, x, top: 0, bottom: 100 })),
      "",
      `marker must not render for ${JSON.stringify(props)}`,
    );
  }
});
