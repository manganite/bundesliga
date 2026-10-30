#!/usr/bin/env node
// Offline study behind docs/verification/elo-bruecke.md.
//
// Question: if clubelo stays unreachable, how well does a league-only Elo
// bridge (start from the last clubelo value, update from OpenLigaDB results)
// track the real clubelo series — compared with today's behaviour, which
// freezes every rating at the last archived snapshot?
//
// Reads only committed data (data/training/results, data/ratings/training-elo).
// No network, no writes. Deterministic: same data, same numbers.
//
//   node pipeline/src/eloBridgeStudy.mjs [--anchor-matchday 1]

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data");
const LEAGUES = ["bl1", "bl2"];
const SEASONS = Array.from({ length: 15 }, (_, i) => 2011 + i);

// A match counts as "clean" when both clubs' ratings moved by exactly
// opposite amounts until their next league match: then nothing else (cup,
// Europe) happened in between, and the change is this match's update alone.
const CLEAN_TOLERANCE = 0.01;

const expected = (x) => 1 / (1 + 10 ** (-x / 400));
const score = (m) => (m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? 0 : 0.5);
const margin = (m) => Math.abs(m.homeGoals - m.awayGoals);

function loadSeason(league, season) {
  const res = JSON.parse(readFileSync(`${ROOT}/training/results/${league}-${season}.json`, "utf8"));
  const elo = JSON.parse(readFileSync(`${ROOT}/ratings/training-elo/${league}-${season}.json`, "utf8"));
  const matches = res.matches
    .filter((m) => m.homeGoals != null && elo.ratings[m.id])
    .map((m) => ({ ...m, eloHome: elo.ratings[m.id].eloHome, eloAway: elo.ratings[m.id].eloAway }))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  // Observed change: the club's pre-match value at its next league match minus this one.
  const byClub = new Map();
  for (const m of matches) {
    for (const side of ["home", "away"]) {
      if (!byClub.has(m[side])) byClub.set(m[side], []);
      byClub.get(m[side]).push({ m, side });
    }
  }
  const pre = ({ m, side }) => (side === "home" ? m.eloHome : m.eloAway);
  for (const list of byClub.values()) {
    list.forEach((entry, i) => {
      const key = entry.side === "home" ? "dHome" : "dAway";
      entry.m[key] = list[i + 1] ? pre(list[i + 1]) - pre(entry) : null;
    });
  }
  return matches;
}

const isClean = (m) => m.dHome != null && m.dAway != null && Math.abs(m.dHome + m.dAway) < CLEAN_TOLERANCE;

// Update rule, estimated from data rather than assumed:
//   delta = K * w(g) * (S - E(dr + H)),  w(0) = 1,  w(g) = a * sqrt(g) for g >= 1.
function update(p, H, m, eloHome, eloAway) {
  const w = margin(m) ? p.a * Math.sqrt(margin(m)) : 1;
  return p.K * w * (score(m) - expected(eloHome - eloAway + H));
}

function sse(set, p, H) {
  let s = 0;
  for (const m of set) s += (m.dHome - update(p, H, m, m.eloHome, m.eloAway)) ** 2;
  return s;
}

function fitRule(set) {
  let best = null;
  for (let H = 30; H <= 100; H += 1) {
    let sxy = 0, sxx = 0;
    for (const m of set.filter((x) => !margin(x))) {
      const x = 0.5 - expected(m.eloHome - m.eloAway + H);
      sxy += x * m.dHome; sxx += x * x;
    }
    const K = sxy / sxx;
    let ay = 0, ax = 0;
    for (const m of set.filter((x) => margin(x))) {
      const x = K * Math.sqrt(margin(m)) * (score(m) - expected(m.eloHome - m.eloAway + H));
      ay += x * m.dHome; ax += x * x;
    }
    const p = { K, a: ay / ax };
    const e = sse(set, p, H);
    if (!best || e < best.sse) best = { ...p, H, sse: e, rmse: Math.sqrt(e / set.length), n: set.length };
  }
  return best;
}

function fitHome(set, p) {
  let best = null;
  for (let H = 20; H <= 110; H += 1) {
    const e = sse(set, p, H);
    if (!best || e < best.sse) best = { H, sse: e };
  }
  return best.H;
}

function main(argv) {
  const i = argv.indexOf("--anchor-matchday");
  const anchorMatchday = i >= 0 ? Number(argv[i + 1]) : 1;

  const data = {};
  for (const l of LEAGUES) for (const s of SEASONS) data[`${l}${s}`] = loadSeason(l, s);
  const cleanIn = (pred) =>
    Object.entries(data).filter(([k]) => pred(k)).flatMap(([, ms]) => ms.filter(isClean));

  const all = cleanIn(() => true);
  const rule = fitRule(all);
  console.log("## Update-Regel (alle sauberen Spiele 2011–2025)");
  console.log(`n=${rule.n}  K=${rule.K.toFixed(2)}  a=${rule.a.toFixed(3)}  H=${rule.H}  RMSE=${rule.rmse.toFixed(2)} Elo`);

  // Backtest: for each target season, fit the rule WITHOUT that season and the
  // home advantage on the PREVIOUS season only — nothing from the future leaks in.
  const horizons = [5, 10, 15, 20, 25, 30, 34];
  const err = { bridge: {}, frozen: {}, bridgeGap: {}, frozenGap: {} };
  const add = (o, k, v) => (o[k] ??= []).push(v);
  const finals = [];
  for (const s of SEASONS.slice(1)) {
    const p = fitRule(cleanIn((k) => !k.endsWith(String(s))));
    for (const l of LEAGUES) {
      const H = fitHome(data[`${l}${s - 1}`].filter(isClean), p);
      const anchor = {};
      for (const m of data[`${l}${s}`]) {
        if (m.matchday <= anchorMatchday) continue;
        anchor[m.home] ??= m.eloHome;
        anchor[m.away] ??= m.eloAway;
      }
      const bridge = { ...anchor };
      const last = { b: 0, f: 0, n: 0 };
      for (const m of data[`${l}${s}`]) {
        if (m.matchday <= anchorMatchday) continue;
        const eb = [bridge[m.home] - m.eloHome, bridge[m.away] - m.eloAway];
        const ef = [anchor[m.home] - m.eloHome, anchor[m.away] - m.eloAway];
        for (const e of eb) add(err.bridge, m.matchday, Math.abs(e));
        for (const e of ef) add(err.frozen, m.matchday, Math.abs(e));
        add(err.bridgeGap, m.matchday, Math.abs(eb[0] - eb[1]));
        add(err.frozenGap, m.matchday, Math.abs(ef[0] - ef[1]));
        if (m.matchday === 34) {
          last.b += Math.abs(eb[0] - eb[1]); last.f += Math.abs(ef[0] - ef[1]); last.n++;
        }
        const d = update(p, H, m, bridge[m.home], bridge[m.away]);
        bridge[m.home] += d;
        bridge[m.away] -= d;
      }
      finals.push({ key: `${l} ${s}/${String(s + 1).slice(2)}`, H, bridge: last.b / last.n, frozen: last.f / last.n });
    }
  }

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const p90 = (a) => [...a].sort((x, y) => x - y)[Math.floor(0.9 * (a.length - 1))];
  console.log(`\n## Rückwirkender Test, Anker nach Spieltag ${anchorMatchday}, Saisons 2012–2025, beide Ligen`);
  console.log("| Spieltag | Klub: Brücke (Mittel / p90) | Klub: eingefroren (Mittel / p90) | Differenz: Brücke | Differenz: eingefroren |");
  console.log("|---|---|---|---|---|");
  for (const k of horizons) {
    console.log(
      `| ${k} | ${mean(err.bridge[k]).toFixed(1)} / ${p90(err.bridge[k]).toFixed(1)} | ` +
        `${mean(err.frozen[k]).toFixed(1)} / ${p90(err.frozen[k]).toFixed(1)} | ` +
        `${mean(err.bridgeGap[k]).toFixed(1)} | ${mean(err.frozenGap[k]).toFixed(1)} |`,
    );
  }
  console.log("\n## Fehler der Elo-Differenz am 34. Spieltag je Saison");
  console.log("| Saison | H (Vorsaison) | Brücke | eingefroren |");
  console.log("|---|---|---|---|");
  for (const f of finals) console.log(`| ${f.key} | ${f.H} | ${f.bridge.toFixed(1)} | ${f.frozen.toFixed(1)} |`);
}

main(process.argv.slice(2));
