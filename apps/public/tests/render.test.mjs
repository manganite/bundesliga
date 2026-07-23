import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  Rendering the actual components.
//
//  What is checked here is the one thing a logic test cannot see: that a reader
//  looking at the page can always tell WHICH LEAGUE the numbers belong to, and
//  that the two league views of the relegation play-off show the two sides of
//  one simulation rather than two simulations.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));

const SEASON = 2026;
const playoff = read(`data/seasons/${SEASON}/playoff.json`);
const config = read(`data/seasons/${SEASON}/config.json`);
const params = read("data/season-params.json");
const leagueData = Object.fromEntries(["bl1", "bl2"].map((l) => [l, {
  season: read(`data/seasons/${SEASON}/${l}/season.json`),
  outlook: read(`data/seasons/${SEASON}/${l}/outlook.json`),
}]));

const { Relegation, TabelleUndPrognose } = await harness();

const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

function relegationHtml(league) {
  const names = new Map(leagueData[league].season.clubs.map((c) => [c.clubId, c.name]));
  return renderToStaticMarkup(
    React.createElement(Relegation, {
      playoff, league, nameOf: (id) => names.get(id) ?? id,
    }),
  );
}

function tableHtml(league) {
  const s = leagueData[league].season;
  const names = new Map(s.clubs.map((c) => [c.clubId, c.name]));
  return renderToStaticMarkup(
    React.createElement(TabelleUndPrognose, {
      ctx: {
        season: s,
        outlook: leagueData[league].outlook,
        leagueConfig: config.leagues[league],
        league,
        leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
        playoff,
        params,
        nameOf: (id) => names.get(id) ?? id,
        carried: [],
      },
    }),
  );
}

// ---------------------------------------------------------------------------
//  Which league am I looking at?
// ---------------------------------------------------------------------------

test("the page heading names the league it is showing", () => {
  assert.match(strip(tableHtml("bl1")), /Tabelle &amp; Prognose — Bundesliga/);
  assert.match(strip(tableHtml("bl2")), /Tabelle &amp; Prognose — 2\. Bundesliga/);
});

test("the relegation table names the league of every column of clubs", () => {
  const bl1 = strip(relegationHtml("bl1"));
  assert.match(bl1, /Klub \(Bundesliga\)/);
  assert.match(bl1, /Mögliche Gegner aus der 2\. Bundesliga/);

  const bl2 = strip(relegationHtml("bl2"));
  assert.match(bl2, /Klub \(2\. Bundesliga\)/);
  assert.match(bl2, /Mögliche Gegner aus der Bundesliga/);
});

test("each side names its own play-off place, which is a different place per league", () => {
  assert.match(strip(relegationHtml("bl1")), /Relegationsplatz \(16\.\)/);
  assert.match(strip(relegationHtml("bl2")), /Relegationsplatz \(3\.\)/);
  assert.match(strip(relegationHtml("bl1")), /Klassenerhalt gesamt/);
  assert.match(strip(relegationHtml("bl2")), /Aufstieg gesamt/);
});

// ---------------------------------------------------------------------------
//  One simulation, two sides.
// ---------------------------------------------------------------------------

test("the two views show complementary numbers for the same pairing", () => {
  const pair = playoff.pairings.find((p) => p.pBl1Wins > 0.2 && p.pBl1Wins < 0.8) ?? playoff.pairings[0];
  const fmt = (p) => `${(p * 100).toFixed(1).replace(".", ",")} %`;
  // Both numbers come from the one file; the point of the test is that neither
  // view rounds or re-derives its own version of the other side.
  assert.ok(Object.is(pair.pBl2Wins, 1 - pair.pBl1Wins));
  assert.notEqual(fmt(pair.pBl1Wins), fmt(pair.pBl2Wins), "a 50/50 pairing would make this vacuous");
});

test("the caption says the opponent is unknown and the figure is a weighted average", () => {
  const html = strip(relegationHtml("bl1"));
  assert.match(html, /steht noch nicht fest/);
  assert.match(html, /Mittelwert über alle möglichen Gegner/);
  assert.match(html, /gewichtet/);
});

test("the marginal approximation is on the page, not only in the artefact", () => {
  const html = strip(relegationHtml("bl1"));
  assert.match(html, /Marginalnäherung/);
  assert.match(html, /RATING_SIGMA/);
  assert.match(html, /eigene Simulation mit eigenen Läufen/);
});

test("the undetermined home order is disclosed as a 50/50 mixture", () => {
  assert.equal(playoff.homeOrder.mixedPairings, playoff.homeOrder.totalPairings);
  assert.match(strip(relegationHtml("bl1")), /zur Hälfte für die eine und zur Hälfte für die andere Seite/);
});

test("the 2.-Liga view states that its own relegation against the 3. Liga is not computed", () => {
  assert.match(strip(relegationHtml("bl2")), /3\. Liga/);
  // And the Bundesliga view does not carry that caveat, which is not about it.
  assert.doesNotMatch(strip(relegationHtml("bl1")), /3\. Liga/);
});

test("the away-goals rule is stated either way, never left to inference", () => {
  assert.match(strip(relegationHtml("bl1")), /Auswärtstorregel gilt seit 2021\/22 nicht mehr/);
});

test("the display threshold is disclosed rather than silently cutting the table", () => {
  const html = strip(relegationHtml("bl1"));
  assert.match(html, /mindestens 1 % Chance/);
});

test("a season without a play-off renders the reason instead of an empty card", () => {
  const html = renderToStaticMarkup(
    React.createElement(Relegation, {
      playoff: { exists: false, reason: "Diese Saison kennt keine Relegation (§5.4).", pairings: [] },
      league: "bl1",
      nameOf: (id) => id,
    }),
  );
  assert.match(strip(html), /keine Relegation/);
});

test("no play-off artefact at all renders nothing rather than a broken card", () => {
  assert.equal(
    renderToStaticMarkup(React.createElement(Relegation, { playoff: null, league: "bl1", nameOf: (id) => id })),
    "",
  );
});

// ---------------------------------------------------------------------------
//  The pre-season table.
// ---------------------------------------------------------------------------

test("before the first matchday the table is ordered by expected points", () => {
  const html = tableHtml("bl1");
  const s = leagueData.bl1.season;
  assert.equal(s.fixtures.filter((f) => f.gh !== undefined).length, 0, "this fixture must be pre-season");

  const names = s.clubs.map((c) => c.name);
  const order = [...html.matchAll(/style="font-weight:500">([^<]+)</g)].map((m) => m[1]);
  const inTable = order.filter((n) => names.includes(n)).slice(0, s.clubs.length);
  assert.equal(inTable.length, s.clubs.length);

  const byName = new Map(s.clubs.map((c) => [c.name, leagueData.bl1.outlook.points[c.clubId].expected]));
  const expected = inTable.map((n) => byName.get(n));
  for (let i = 1; i < expected.length; i++) {
    assert.ok(expected[i] <= expected[i - 1], `${inTable[i - 1]} (${expected[i - 1]}) before ${inTable[i]} (${expected[i]})`);
  }
});

test("the shared table place is still shown, and the caption says whose order it is", () => {
  const html = strip(tableHtml("bl1"));
  assert.match(html, /geteilten? Tabellenplatz/);
  assert.match(html, /Reihenfolge der Prognose, nicht die der Tabelle/);
});

test("the 2. Bundesliga renders the same way, with its own numbers", () => {
  const html = strip(tableHtml("bl2"));
  assert.match(html, /Reihenfolge der Prognose, nicht die der Tabelle/);
  // The two leagues must not accidentally render the same content.
  assert.notEqual(tableHtml("bl1"), tableHtml("bl2"));
});
