import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { harness } from "./harness/build.mjs";
import { DUEL_PLAYED_NOTE, DUEL_ARCHIVE_CAPTION } from "../src/lib/archive.js";
import { playedDuels } from "../src/lib/season.js";

// ============================================================================
//  DUELLE_ERGEBNISSE — the Duelle card shows both worlds: „Anstehend" (remaining,
//  from the outlook) and „Gespielt" (past duels with their real result). Empty
//  sections hide (§7); the tab counter is the sum; results are home-first.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), "utf8"));
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const { DirekteDuelle, TabelleUndPrognose } = await harness();

const cfg = { targets: { meister: { places: 1, from: 1, to: 1, label: "Meister" } } };
const pend = (id, md, heat) => ({ fixtureId: id, target: "meister", home: "A", away: "B", pHome: heat, pAway: heat, heat, matchday: md });
const play = (id, md, heat, gh, ga) => ({ ...pend(id, md, heat), result: { gh, ga } });

const render = (props) => renderToStaticMarkup(React.createElement(DirekteDuelle, { leagueConfig: cfg, nameOf: (x) => x, ...props }));

test("mid-season shows BOTH sections; each sorted per its own rule; counter = sum", () => {
  const pending = [pend("p1", 30, 0.3), pend("p2", 25, 0.5)]; // min(P) desc → p2(25) then p1(30)
  const played = [play("g1", 5, 0.4, 2, 1), play("g2", 12, 0.2, 0, 0)]; // live: matchday DESC → g2(12) then g1(5)
  const html = render({ pending, played });
  const text = strip(html);
  assert.match(html, />Anstehend</);
  assert.match(html, />Gespielt</);
  // Tab counter = 2 + 2.
  assert.match(text, /\(4\)/);
  // Pending order: 25 before 30 (heat 0.5 > 0.3).
  const mds = [...text.matchAll(/(\d+)\. Spieltag/g)].map((m) => Number(m[1]));
  // Anstehend rows first (25, 30), then Gespielt rows (12, 5).
  assert.deepEqual(mds, [25, 30, 12, 5]);
});

test("pre-season shows only „Anstehend“ (nothing played)", () => {
  const html = render({ pending: [pend("p1", 1, 0.5)], played: [] });
  assert.match(html, />Anstehend</);
  assert.doesNotMatch(html, />Gespielt</);
});

test("a finished/archive season shows only „Gespielt“, chronological ascending, with results", () => {
  const played = [play("g1", 30, 0.5, 3, 1), play("g2", 5, 0.4, 1, 1)];
  const html = render({ pending: [], played, isArchive: true });
  const text = strip(html);
  assert.doesNotMatch(html, />Anstehend</);
  assert.match(html, />Gespielt</);
  // Archive keeps ASCENDING: 5 before 30.
  const mds = [...text.matchAll(/(\d+)\. Spieltag/g)].map((m) => Number(m[1]));
  assert.deepEqual(mds, [5, 30]);
  // Results shown.
  assert.match(text, /1:1/);
  assert.match(text, /3:1/);
});

test("the result is home-first, consistent with the row's club order", () => {
  // Row shows „C … · D …"; the result must read home:away = 2:0, not 0:2.
  const played = [{ fixtureId: "g", target: "meister", home: "C", away: "D", pHome: 0.5, pAway: 0.5, heat: 0.5, matchday: 8, result: { gh: 2, ga: 0 } }];
  const text = strip(render({ pending: [], played }));
  assert.match(text, /C .* · D .*/);
  assert.match(text, /2:0/);
  assert.doesNotMatch(text, /0:2/);
});

test("captions: live gains the played-note; archive caption is unchanged", () => {
  const live = strip(render({ pending: [pend("p", 1, 0.5)], played: [play("g", 2, 0.4, 1, 0)] }));
  assert.match(live, new RegExp(DUEL_PLAYED_NOTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const archive = strip(render({ pending: [], played: [play("g", 2, 0.4, 1, 0)], isArchive: true }));
  assert.match(archive, new RegExp(DUEL_ARCHIVE_CAPTION.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(archive, /die Prozente sind die von damals/);
});

test("the caption names only the sections present (no dangling half-sentences)", () => {
  // Pre-season: pending only → no played-note.
  const preSeason = strip(render({ pending: [pend("p", 1, 0.5)], played: [] }));
  assert.match(preSeason, /Verbleibende Spiele/);
  assert.doesNotMatch(preSeason, /die Prozente sind die von damals/);
  // Finished non-archive: played only → no „remaining games" line.
  const finished = strip(render({ pending: [], played: [play("g", 34, 0.5, 2, 1)] }));
  assert.doesNotMatch(finished, /Verbleibende Spiele/);
  assert.match(finished, /die Prozente sind die von damals/);
});

test("integration: an archive season's card renders played duels with results", () => {
  const config = read("data/seasons/2015/config.json");
  const season = read("data/seasons/2015/bl1/season.json");
  const names = new Map(season.clubs.map((c) => [c.clubId, c.name]));
  const ctx = {
    league: "bl1", leagueLabel: "Bundesliga", leagueConfig: config.leagues.bl1, config, season,
    outlook: read("data/seasons/2015/bl1/outlook.json"),
    timeline: read("data/seasons/2015/bl1/timeline-frozen.json"), timelineLive: null,
    prematch: read("data/seasons/2015/bl1/prematch.json"), params: read("data/season-params.json"),
    relegation: read("data/relegation.json"), playoff: null,
    clubs: names, nameOf: (id) => names.get(id) ?? id, matchday: 34, phase: "finished", carried: [], isArchive: true,
  };
  const html = renderToStaticMarkup(React.createElement(TabelleUndPrognose, { ctx }));
  const text = strip(html);
  assert.match(text, /Direkte Duelle/);
  assert.match(html, />Gespielt</);
  assert.match(text, /\d+:\d+/, "played duels carry results");
  assert.doesNotMatch(html, />Anstehend</, "a finished season has nothing pending");
});

test("playedDuels needs BOTH goals — a partial result is never joined", () => {
  const season = {
    fixtures: [
      { id: "f1", matchday: 1, homeClubId: "A", awayClubId: "B", gh: 2, ga: 1 }, // full
      { id: "f2", matchday: 1, homeClubId: "C", awayClubId: "D", gh: 0 },          // partial
    ],
    clubs: [],
  };
  const timeline = { points: [{ matchday: 0, probabilities: { meister: { A: 0.5, B: 0.5, C: 0.5, D: 0.5 } } }] };
  const out = playedDuels(season, timeline, cfg);
  assert.equal(out.length, 1, "only the fully-played fixture is a played duel");
  assert.equal(out[0].fixtureId, "f1");
  assert.deepEqual(out[0].result, { gh: 2, ga: 1 });
});
