import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { ratingStatus } from "../../../packages/engine/src/dataState.mjs";

// ============================================================================
//  The second clock (Brief 34): how current the RATINGS behind the forecast are.
//
//  It exists because results and ratings come from different sources with
//  different outages, and one timestamp for both made an outage of one look
//  like an outage of everything. The line states a fact the committed data
//  carries — which day's ratings the forecast used — and never a claim about
//  the workflow, which the app cannot observe.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { Ready } = await harness();
const LIVE = read("data/meta.json").season;

test("today and yesterday are fresh; two days is stale", () => {
  const now = new Date("2026-08-29T18:00:00Z");
  assert.equal(ratingStatus({ ratingsEffectiveAt: "2026-08-29" }, now).fresh, true);
  // Yesterday is the ORDINARY state for part of every day: clubelo publishes
  // once a day and a run may land before that file exists. Calling it stale
  // would raise the warning daily and teach the reader to ignore it.
  assert.equal(ratingStatus({ ratingsEffectiveAt: "2026-08-28" }, now).fresh, true);
  assert.equal(ratingStatus({ ratingsEffectiveAt: "2026-08-27" }, now).fresh, false);
  assert.equal(ratingStatus({ ratingsEffectiveAt: "2026-08-27" }, now).ageDays, 2);
});

test("a fresh clock carries no warning; a stale one names the date and says results are fine", () => {
  const now = new Date("2026-08-29T18:00:00Z");
  assert.equal(ratingStatus({ ratingsEffectiveAt: "2026-08-29" }, now).warning, null);
  const stale = ratingStatus({ ratingsEffectiveAt: "2026-08-20" }, now);
  assert.match(stale.warning, /20\.08\.2026/, "the date is spelled out, never just „alt“");
  assert.match(stale.warning, /Ergebnisse und die Tabelle sind aktuell/,
    "without this half the reader distrusts the table too");
  assert.doesNotMatch(stale.warning, /Pipeline|Workflow|Fehler/,
    "the app cannot observe workflow health and must not claim to");
});

test("data without the field renders nothing rather than „unbekannt“", () => {
  assert.equal(ratingStatus({}, new Date()), null);
  assert.equal(ratingStatus({ ratingsEffectiveAt: "keine Ahnung" }, new Date()), null);
  assert.equal(ratingStatus(null, new Date()), null);
});

// ---------------------------------------------------------------------------

function renderReady(meta, { isArchive = false } = {}) {
  const league = "bl1";
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return renderToStaticMarkup(React.createElement(Ready, {
    route: "methodik",
    seasonId: LIVE,
    league,
    isArchive,
    data: {
      meta,
      config: read(`data/seasons/${LIVE}/config.json`),
      season: read(`data/seasons/${LIVE}/${league}/season.json`),
      outlook: maybe(`data/seasons/${LIVE}/${league}/outlook.json`),
      timeline: maybe(`data/seasons/${LIVE}/${league}/timeline-frozen.json`),
      timelineLive: null,
      prematch: maybe(`data/seasons/${LIVE}/${league}/prematch.json`),
      params: read("data/season-params.json"),
      playoff: null,
    },
    available: ["bl1", "bl2"], onLeague: () => {},
    seasons: [2015, LIVE], season: LIVE, newestSeason: LIVE, onSeason: () => {},
  }));
}

test("the header shows the rating date, and the colour is only an accent on it", () => {
  const base = read("data/meta.json");
  const html = renderReady({ ...base, ratingsEffectiveAt: "2026-01-02" });
  const text = strip(html);
  // The DATE is in the text either way — colour is never the sole carrier
  // (§FARBEN_UNTERTITEL), so a reader who cannot see it loses nothing.
  assert.match(text, /Ratings: 02\.01\.2026/);
  assert.match(html, /rating-age is-stale/);

  const fresh = renderReady({ ...base, ratingsEffectiveAt: new Date().toISOString().slice(0, 10) });
  assert.match(fresh, /rating-age is-fresh/);
  assert.doesNotMatch(strip(fresh), /Die Prognose rechnet mit Ratings vom/, "no warning when current");
});

test("an ARCHIVE season shows no rating clock — it has no „current“ to be", () => {
  const base = read("data/meta.json");
  const html = renderReady({ ...base, ratingsEffectiveAt: "2026-01-02" }, { isArchive: true });
  assert.doesNotMatch(html, /rating-age/);
  assert.doesNotMatch(strip(html), /Ratings: 02\.01\.2026/);
});
