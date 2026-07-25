import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  V2b.1 §2 — the season as a second global dimension. Two things a render test
//  can pin: the archive MARKING is present, and the live-only elements
//  (staleness, config-stamp, carry-forward, „season starts soon") NEVER render
//  on an archive season. The gate is `isArchive`; the test proves it both ways.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { Ready, SeasonSwitch } = await harness();

/** A committed archive season, assembled the way loadLeagueSeason would. */
function dataFor(year, league) {
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    meta: maybe("data/seasons/2026/meta.json") ?? { dataUpdatedAt: "2026-07-01T00:00:00Z" },
    config: read(`data/seasons/${year}/config.json`),
    season: read(`data/seasons/${year}/${league}/season.json`),
    outlook: maybe(`data/seasons/${year}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${year}/${league}/timeline-frozen.json`),
    timelineLive: null,
    prematch: maybe(`data/seasons/${year}/${league}/prematch.json`),
    params: read("data/season-params.json"),
    playoff: null,
  };
}

const renderReady = (year, league, isArchive) => renderToStaticMarkup(React.createElement(Ready, {
  route: "methodik", // a season-independent page keeps the test about the header
  seasonId: year, league, data: dataFor(year, league), isArchive,
  available: ["bl1", "bl2"], onLeague: () => {},
  seasons: [2015, 2025, 2026], season: year, newestSeason: 2026, onSeason: () => {},
}));

test("the season switch marks archive seasons and defaults to the live one", () => {
  const html = renderToStaticMarkup(React.createElement(SeasonSwitch, {
    seasons: [2015, 2025, 2026], season: 2026, newestSeason: 2026, onSeason: () => {},
  }));
  assert.match(html, /2015\/16 · Archiv<\/option>/, "older seasons are marked · Archiv");
  assert.match(html, />2026\/27<\/option>/, "the live season option carries no · Archiv suffix");
  assert.doesNotMatch(html, /archive-badge/, "no archive badge when the live season is selected");

  const archived = renderToStaticMarkup(React.createElement(SeasonSwitch, {
    seasons: [2015, 2025, 2026], season: 2015, newestSeason: 2026, onSeason: () => {},
  }));
  assert.match(archived, /archive-badge/, "an archive badge appears when an archive is selected");
});

test("an archive season carries the archive marking in the header", () => {
  const html = renderReady(2015, "bl1", true);
  const text = strip(html);
  assert.match(text, /· Archiv/, "the heading is tagged · Archiv");
  assert.match(text, /Abgeschlossene Saison/, "the datenstand line is replaced by the season state");
});

test("the live-only elements NEVER render on an archive season", () => {
  const html = renderReady(2015, "bl1", true);
  const text = strip(html);
  // Results-overdue staleness (would fire on any past season without the gate).
  assert.doesNotMatch(text, /steht noch aus/);
  // Carry-forward warning.
  assert.doesNotMatch(text, /älteren Rating|clubelo sie derzeit nicht/);
  // Config-stamp mismatch alert.
  assert.doesNotMatch(html, /role="alert"/);
  // „Season starts soon" — a finished season is never pre-season.
  assert.doesNotMatch(text, /Saison beginnt in Kürze/);
});

test("the gate is what suppresses staleness — an overdue fixture fires ungated, not archived", () => {
  // A finished season has no overdue results, so construct one: a past fixture
  // with no result. Ungated it is flagged overdue; as an archive it is silent.
  const data = dataFor(2015, "bl1");
  const withOverdue = {
    ...data,
    season: {
      ...data.season,
      fixtures: data.season.fixtures.map((f, i) => (i === 0 ? { ...f, gh: undefined, ga: undefined } : f)),
    },
  };
  const props = {
    route: "methodik", seasonId: 2015, league: "bl1",
    available: ["bl1", "bl2"], onLeague: () => {},
    seasons: [2015, 2025, 2026], season: 2015, newestSeason: 2026, onSeason: () => {},
  };
  const ungated = renderToStaticMarkup(React.createElement(Ready, { ...props, data: withOverdue, isArchive: false }));
  const archived = renderToStaticMarkup(React.createElement(Ready, { ...props, data: withOverdue, isArchive: true }));
  assert.match(strip(ungated), /steht noch aus/, "ungated: the overdue fixture is flagged");
  assert.doesNotMatch(strip(archived), /steht noch aus/, "archived: the same data is silent");
});
