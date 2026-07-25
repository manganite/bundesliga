import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";

// ============================================================================
//  V2b.1 §3/§4 — archive page behaviour and the two anchored honesty sentences.
//  A render test that the retrospective label and the in-sample note appear on
//  archive seasons (and not on the live one), the scenario clause is added, and
//  the Übersicht becomes the Saisonbilanz with the season's outcome.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { Verlauf, Modellguete, Explainer, Uebersicht } = await harness();

function ctxFor(year, league, isArchive) {
  const config = read(`data/seasons/${year}/config.json`);
  const season = read(`data/seasons/${year}/${league}/season.json`);
  const names = new Map(season.clubs.map((c) => [c.clubId, c.name]));
  const maybe = (rel) => (fs.existsSync(path.join(REPO, rel)) ? read(rel) : null);
  return {
    seasonId: year, league, leagueLabel: league === "bl1" ? "Bundesliga" : "2. Bundesliga",
    leagueConfig: config.leagues[league], config, season,
    outlook: maybe(`data/seasons/${year}/${league}/outlook.json`),
    timeline: maybe(`data/seasons/${year}/${league}/timeline-frozen.json`),
    timelineLive: null,
    prematch: maybe(`data/seasons/${year}/${league}/prematch.json`),
    params: read("data/season-params.json"),
    relegation: read("data/relegation.json"),
    playoff: null,
    clubs: names, nameOf: (id) => names.get(id) ?? id,
    matchday: 34, phase: "finished", carried: [], isArchive,
  };
}

test("§4.2: the retrospective label appears on an archive Verlauf, not on the live one", () => {
  const archive = strip(renderToStaticMarkup(React.createElement(Verlauf, { ctx: ctxFor(2015, "bl1", true) })));
  assert.match(archive, /Retrospektive Modellrechnung mit den heutigen Parametern \(Parameterversion track-c-part0-v1\) — nicht die damalige Vorhersage/);
  const live = strip(renderToStaticMarkup(React.createElement(Verlauf, { ctx: ctxFor(2015, "bl1", false) })));
  assert.doesNotMatch(live, /Retrospektive Modellrechnung/);
});

test("§4.2: a missing parameter version drops the clause, never shows the word undefined", async () => {
  const { retrospectiveLabel } = await import("../src/lib/archive.js");
  assert.match(retrospectiveLabel("track-c-part0-v1"), /\(Parameterversion track-c-part0-v1\)/);
  const noVersion = retrospectiveLabel(undefined);
  assert.doesNotMatch(noVersion, /undefined/);
  assert.match(noVersion, /heutigen Parametern — nicht die damalige Vorhersage/);
});

test("§4.1: the in-sample note appears on an archive Modellgüte, not on the live one", () => {
  const archive = strip(renderToStaticMarkup(React.createElement(Modellguete, { ctx: ctxFor(2015, "bl1", true) })));
  assert.match(archive, /Trainingsfenster der heutigen Parameter — Rückblicke in diesem Fenster sind keine unabhängige Prüfung des Modells/);
  const live = strip(renderToStaticMarkup(React.createElement(Modellguete, { ctx: ctxFor(2015, "bl1", false) })));
  assert.doesNotMatch(live, /Trainingsfenster der heutigen Parameter/);
});

test("§3: the scenario ratings-do-not-rewind clause gains the archive half-sentence", () => {
  const archive = strip(renderToStaticMarkup(React.createElement(Explainer, { isArchive: true })));
  assert.match(archive, /Ratings des aktuellen Datenstands \(hier: die Ratings vom Saisonende\)/);
  const live = strip(renderToStaticMarkup(React.createElement(Explainer, { isArchive: false })));
  assert.doesNotMatch(live, /Saisonende/);
});

test("§3: an archive Übersicht is the Saisonbilanz — outcome, relegation, the improbable moment", () => {
  const html = renderToStaticMarkup(React.createElement(Uebersicht, { ctx: ctxFor(2015, "bl1", true) }));
  const text = strip(html);
  assert.match(text, /Saisonbilanz/);
  // The real 2015/16 champion.
  assert.match(text, /FC Bayern München/);
  // The relegation outcome from G1 (2015/16 BL1/BL2: KSC beat HSV).
  assert.match(text, /Relegation Bundesliga \/ 2\. Bundesliga/);
  assert.match(text, /setzte sich gegen/);
  // The improbable-moment and biggest-surprise cards.
  assert.match(text, /Unwahrscheinlichster Moment/);
  assert.match(text, /auf den Titel — und war es am Ende/);
  assert.match(text, /Größte Überraschung/);
  assert.match(text, /Bit\./);
  // The broad „Klassenerhalt" catch-all (rank 1–15) is NOT listed as an outcome.
  assert.doesNotMatch(text, /Klassenerhalt/);
});

test("the Saisonbilanz also renders for BL2 (Aufstieg as the title target)", () => {
  const html = renderToStaticMarkup(React.createElement(Uebersicht, { ctx: ctxFor(2015, "bl2", true) }));
  const text = strip(html);
  assert.match(text, /Saisonbilanz — 2\. Bundesliga/);
  // 2015/16 BL2 champion was SC Freiburg.
  assert.match(text, /SC Freiburg/);
  assert.match(text, /auf den Aufstieg/);
  assert.doesNotMatch(text, /Klassenerhalt/);
});

test("the live Übersicht is NOT the Saisonbilanz", () => {
  const html = strip(renderToStaticMarkup(React.createElement(Uebersicht, { ctx: ctxFor(2015, "bl1", false) })));
  assert.doesNotMatch(html, /Saisonbilanz/);
});
