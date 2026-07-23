import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { buildLiveTimeline, targetsFromConfig } from "../../../pipeline/src/artefacts.mjs";
import { findSnapshotAsOf } from "../../../pipeline/src/snapshots.mjs";

// ============================================================================
//  V1.2 — Modellgüte, „Wichtigstes kommendes Spiel", frozen vs live.
//
//  Two things are checked that no logic test can see:
//   * the EMPTY state, which is the normal state of this release until the
//     season starts, must read as a deliberate answer rather than a broken page;
//   * the honesty constraints of §5.3 and §4 are CAPTIONS. If they are not on
//     the page, they do not exist.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const PARAMS = read("data/season-params.json");
const { Modellguete, WichtigstesSpiel, Uebersicht, Verlauf } = await harness();

function ctxFor(season, league) {
  const config = read(`data/seasons/${season}/config.json`);
  const seasonData = read(`data/seasons/${season}/${league}/season.json`);
  const names = new Map(seasonData.clubs.map((c) => [c.clubId, c.name]));
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    season: seasonData,
    outlook: maybe(`data/seasons/${season}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${season}/${league}/timeline-frozen.json`),
    timelineLive: maybe(`data/seasons/${season}/${league}/timeline-live.json`),
    prematch: maybe(`data/seasons/${season}/${league}/prematch.json`),
    playoff: maybe(`data/seasons/${season}/playoff.json`),
    params: PARAMS,
    config,
    leagueConfig: config.leagues[league],
    league,
    leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    nameOf: (id) => names.get(id) ?? id,
    carried: [],
    matchday: 1,
    phase: "preSeason",
  };
}

const renderPage = (Component, ctx) => renderToStaticMarkup(React.createElement(Component, { ctx }));

// ---------------------------------------------------------------------------
//  The empty state IS the normal state until the season starts.
// ---------------------------------------------------------------------------

test("before the first matchday the Modellgüte page says so instead of improvising", () => {
  const ctx = ctxFor(2026, "bl1");
  assert.equal(ctx.season.fixtures.filter((f) => f.gh !== undefined).length, 0, "this fixture must be pre-season");
  const html = strip(renderPage(Modellguete, ctx));
  assert.match(html, /noch kein Spiel gespielt/);
  assert.match(html, /füllt sich ab dem 1\. Spieltag/);
  // And nothing invented: no calibration, no accuracy, no scorecard.
  assert.doesNotMatch(html, /Kalibrierung/);
  assert.doesNotMatch(html, /Treffsicherheit/);
  assert.doesNotMatch(html, /Rating-Aktualität/);
});

test("the empty page is not blank — it still names the league it is about", () => {
  const html = strip(renderPage(Modellguete, ctxFor(2026, "bl1")));
  assert.match(html, /Modellgüte — Bundesliga/);
  assert.match(strip(renderPage(Modellguete, ctxFor(2026, "bl2"))), /Modellgüte — 2\. Bundesliga/);
});

test("cards with nothing to say hide — the Übersicht carries no empty scaffolding", () => {
  const html = strip(renderPage(Uebersicht, ctxFor(2026, "bl1")));
  // Über-/Unterperformance needs played matches; the card must be absent, not
  // present and showing zeros.
  assert.doesNotMatch(html, /Überflieger/);
  assert.doesNotMatch(html, /Letzter Spieltag \(/);
});

// ---------------------------------------------------------------------------
//  A season with results: the completed 2025/26.
// ---------------------------------------------------------------------------

const past = ctxFor(2025, "bl1");
const pastHtml = strip(renderPage(Modellguete, past));

test("the completed season renders every card the brief lists", () => {
  for (const heading of [
    "Kalibrierung", "Treffsicherheit über die Zeit", "Trefferquote live vs eingefroren",
    "Rating-Aktualität", "Leistung vs Erwartung", "Platzierung vs Erwartung", "Spiel-Zeugnis",
  ]) {
    assert.match(pastHtml, new RegExp(heading), `${heading} is missing`);
  }
});

test("calibration leads with the plain question and counts MATCHES, never 3n observations", () => {
  assert.match(pastHtml, /wenn die App 70 % sagt/i);
  assert.match(pastHtml, /Basiert auf \d+ Spielen \(\d+ Wahrscheinlichkeiten\)/);
  assert.doesNotMatch(pastHtml, /Beobachtungen/);
});

test("the accuracy caption separates „does not learn“ from the live-rating effect", () => {
  assert.match(pastHtml, /lernt während der Saison nichts dazu/);
  assert.match(pastHtml, /Höher ist besser/);
  assert.match(pastHtml, /nicht dasselbe und werden hier nicht zusammengeworfen/);
});

test("Rating-Aktualität is named as an operational figure, and disclaims the lag measurement", () => {
  assert.match(pastHtml, /Rating-Aktualität/);
  assert.match(pastHtml, /Betriebszahl über den Datenstand/);
  assert.match(pastHtml, /nachläuft; diese Messung findet hier nicht statt/);
  // The old name promised exactly the measurement that is not made.
  assert.doesNotMatch(pastHtml, /Rating-Verzögerung/);
});

test("the frozen comparison is called descriptive, never a decomposition", () => {
  assert.match(pastHtml, /beschreibende Gegenüberstellung, keine Zerlegung/);
  assert.doesNotMatch(pastHtml, /Aufwertungseffekt|Punkteeffekt/);
});

test("the three provenances are never pooled without saying so", () => {
  // 2025 is entirely backfilled, so there is no mix and no note — the correct
  // outcome. The guard is that the page must not claim a live provenance.
  const counts = new Set(past.prematch.entries.map((e) => e.provenance));
  assert.deepEqual([...counts], ["backfilled"]);
  const expertHtml = strip(renderToStaticMarkup(
    React.createElement(Modellguete, { ctx: past }),
  ));
  assert.doesNotMatch(expertHtml, /vor Anstoß geholt/, "no contemporaneous group exists in this season");
});

test("a mixed season would carry the pooling note on the page", () => {
  // Constructed from the real current season, which HAS a carried-forward group:
  // give it a played fixture so the page renders its cards at all.
  const ctx = ctxFor(2026, "bl1");
  const withResults = {
    ...ctx,
    season: {
      ...ctx.season,
      fixtures: ctx.season.fixtures.map((f, i) => (i < 40 ? { ...f, gh: 2, ga: 1 } : f)),
    },
  };
  const html = strip(renderPage(Modellguete, withResults));
  const provenances = new Set(
    ctx.prematch.entries.filter((e) => ctx.season.fixtures.slice(0, 40).some((f) => f.id === e.fixtureId))
      .map((e) => e.provenance),
  );
  if (provenances.size > 1) {
    assert.match(html, /Diese Zahl mischt/, "a mixed figure must disclose the mix on the page");
    assert.match(html, /nur rückblickend/);
  }
  // Either way the freshness card must separate the groups rather than average.
  assert.match(html, /Herkunft des Ratings/);
});

// ---------------------------------------------------------------------------
//  „Wichtigstes kommendes Spiel" (§4).
// ---------------------------------------------------------------------------

const upcoming = ctxFor(2026, "bl1");

test("the card ranks fixtures and names WHICH target it is about", () => {
  const html = strip(renderToStaticMarkup(React.createElement(WichtigstesSpiel, {
    outlook: upcoming.outlook, season: upcoming.season,
    leagueConfig: upcoming.leagueConfig, nameOf: upcoming.nameOf, limit: 3,
  })));
  assert.match(html, /Wichtigstes kommendes Spiel/);
  assert.match(html, /größter Einfluss auf/);
  assert.match(html, /Meister|Abstieg/);
});

test("THE CAPTION CONSTRAINT: it must not claim to forecast the displayed change", () => {
  const html = strip(renderToStaticMarkup(React.createElement(WichtigstesSpiel, {
    outlook: upcoming.outlook, season: upcoming.season,
    leagueConfig: upcoming.leagueConfig, nameOf: upcoming.nameOf,
  })));
  assert.match(html, /keine Prognose, um wie viele Prozentpunkte sich die Anzeige nach dem Spiel tatsächlich ändert/);
  assert.match(html, /wie stark ein Spiel mit dem Ziel zusammenhängt/);
});

test("the k-normalisation and the smallest conditional sample are both stated", () => {
  const html = strip(renderToStaticMarkup(React.createElement(WichtigstesSpiel, {
    outlook: upcoming.outlook, season: upcoming.season,
    leagueConfig: upcoming.leagueConfig, nameOf: upcoming.nameOf,
  })));
  assert.match(html, /durch die Zahl ihrer Plätze geteilt/);
  assert.match(html, /kleinste bedingte Stichprobe/);
});

test("the same computation feeds both pages — one artefact, two views", () => {
  const wholeSeason = renderToStaticMarkup(React.createElement(WichtigstesSpiel, {
    outlook: upcoming.outlook, season: upcoming.season,
    leagueConfig: upcoming.leagueConfig, nameOf: upcoming.nameOf, limit: 400,
  }));
  const oneMatchday = renderToStaticMarkup(React.createElement(WichtigstesSpiel, {
    outlook: upcoming.outlook, season: upcoming.season,
    leagueConfig: upcoming.leagueConfig, nameOf: upcoming.nameOf, matchday: 1, limit: 50,
  }));
  // Every matchday-1 row must appear with the identical number in the full list.
  const numbers = (html) => [...strip(html).matchAll(/(\d+,\d) Pp\./g)].map((m) => m[1]);
  const md1 = new Set(numbers(oneMatchday));
  const all = new Set(numbers(wholeSeason));
  for (const v of md1) assert.ok(all.has(v), `${v} appears on one page but not the other`);
});

test("without the artefact field the card renders nothing rather than guessing", () => {
  const html = renderToStaticMarkup(React.createElement(WichtigstesSpiel, {
    outlook: { ...upcoming.outlook, fixtureImpact: null },
    season: upcoming.season, leagueConfig: upcoming.leagueConfig, nameOf: upcoming.nameOf,
  }));
  assert.equal(html, "");
});

// ---------------------------------------------------------------------------
//  Frozen vs live — the §0 labels, verbatim.
// ---------------------------------------------------------------------------

test("the two curve names are the neutral ones §0 prescribes", () => {
  const config = read("data/seasons/2025/config.json");
  const seasonData = read("data/seasons/2025/bl1/season.json");
  const index = read("data/ratings/index.json");
  const live = buildLiveTimeline({
    seasonId: "2025-bl1",
    league: "bl1",
    clubs: seasonData.clubs,
    fixtures: seasonData.fixtures,
    params: PARAMS.params,
    targets: targetsFromConfig(config.leagues.bl1),
    rules: {
      pointsForWin: config.leagues.bl1.pointsForWin,
      pointsForDraw: config.leagues.bl1.pointsForDraw,
      criteria: config.leagues.bl1.tiebreakCriteria,
    },
    ratingsOn: (date) => {
      const meta = findSnapshotAsOf(index, date);
      if (!meta) return null;
      return { snapshotId: meta.snapshotId, ratings: read(`data/ratings/snapshots/${meta.snapshotId}.json`).ratings };
    },
    runs: 200,
  });

  const html = strip(renderPage(Verlauf, { ...past, timelineLive: live }));
  assert.match(html, /Prognose mit eingefrorener Saisonstart-Stärke/);
  assert.match(html, /zusätzliche Veränderung bei aktuellen Ratings/);
  assert.match(html, /beschreibende Gegenüberstellung, keine Zerlegung in Ursachen/);
  assert.doesNotMatch(html, /Aufwertungseffekt/);
});

test("without a live timeline the comparison is absent, and the page says why", () => {
  const html = strip(renderPage(Verlauf, { ...past, timelineLive: null }));
  assert.doesNotMatch(html, /eingefroren gegen aktuelle Ratings/);
  assert.match(html, /sobald archivierte Ratings für gespielte Spieltage vorliegen/);
});
