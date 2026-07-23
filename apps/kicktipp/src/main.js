// ============================================================================
//  App B — the UI.
//
//  ONE RULE GOVERNS EVERYTHING HERE: pasted content is untrusted. It is parsed
//  with DOMParser (parse.mjs) and only validated, typed fields come back. This
//  file renders those fields with `textContent` and `document.createElement`.
//  `innerHTML` is never assigned anywhere in this file — grep for it.
// ============================================================================

import "./style.css";
import clubData from "./generated/clubs.json";
import { parseTippPage, ParseError } from "./parse.mjs";
import { buildMarketMatrix } from "./market.mjs";
import { optimiseMatchday } from "./optimise.mjs";
import { quotaFromPool } from "./scoring.mjs";
import { effectiveParams } from "../../../packages/engine/src/model.mjs";
import {
  loadLog, saveLog, addEntry, exportLog, importLog, realisedFigures, LOG_SCHEMA_VERSION,
} from "./log.mjs";

const $ = (id) => document.getElementById(id);
const params = clubData.params ? effectiveParams(clubData.params, { league: "bl1" }) : null;

let fixtures = [];
let optimised = null;
let log = loadLog();

const fmt = (v, d = 2) => new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: d, maximumFractionDigits: d,
}).format(v);
const pct = (v) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(v * 100)} %`;

/** Build a table from plain data. Every cell goes in as text, never as markup. */
function renderTable(container, columns, rows) {
  container.replaceChildren();
  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  for (const c of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = c;
    hr.append(th);
  }
  thead.append(hr);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    row.forEach((cell, i) => {
      const el = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) el.scope = "row";
      // textContent, always. A pasted club name cannot become markup here.
      el.textContent = String(cell);
      tr.append(el);
    });
    tbody.append(tr);
  }

  table.append(thead, tbody);
  container.append(table);
}

function say(el, text, kind = "") {
  el.textContent = text;
  el.className = kind;
}

/**
 * Match a pasted club name to a bundled club. Returns null rather than a near
 * miss — the user sees what was matched and what was not.
 */
function matchClub(name) {
  const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const target = norm(name);
  let exact = null;
  const partial = [];
  for (const c of clubData.clubs) {
    const n = norm(c.name);
    if (n === target) exact = c;
    else if (n.includes(target) || target.includes(n)) partial.push(c);
  }
  if (exact) return exact;
  // Exactly one plausible partial is accepted; two or more is ambiguous and
  // resolving it by guessing is how the wrong club silently gets used.
  return partial.length === 1 ? partial[0] : null;
}

function buildFixtures(parsed) {
  const notes = [];
  const built = [];

  for (const f of parsed.fixtures) {
    const home = matchClub(f.home);
    const away = matchClub(f.away);
    if (!home || !away || !params) {
      notes.push(
        `„${f.home} – ${f.away}“ konnte keinem Klub mit hinterlegtem Rating zugeordnet werden `
        + "und bleibt deshalb außen vor.",
      );
      continue;
    }

    const quotas = f.quotas ?? null;
    if (!quotas) {
      notes.push(`Für „${f.home} – ${f.away}“ standen keine Tippquoten auf der Seite; es gilt 3/3/3.`);
    }

    const market = buildMarketMatrix({
      eloHome: home.rating, eloAway: away.rating, params, odds: f.odds,
    });
    if (market.note) notes.push(`${f.home} – ${f.away}: ${market.note}`);

    built.push({
      id: `${home.clubId}-${away.clubId}`,
      homeName: f.home,
      awayName: f.away,
      odds: f.odds,
      quotas: quotas ?? { homeWin: 3, draw: 3, awayWin: 3 },
      matrix: market.matrix,
      maxGoals: market.maxGoals,
      market: market.market,
      source: market.source,
    });
  }

  return { built, notes };
}

function renderFixtures() {
  renderTable(
    $("fixtures"),
    ["Begegnung", "Quote H", "Quote U", "Quote A", "Tippquote H/U/A", "Grundlage"],
    fixtures.map((f) => [
      `${f.homeName} – ${f.awayName}`,
      fmt(f.odds.home), fmt(f.odds.draw), fmt(f.odds.away),
      `${f.quotas.homeWin}/${f.quotas.draw}/${f.quotas.awayWin}`,
      f.source === "market" ? "Markt" : "Modell",
    ]),
  );
  $("fixtures-section").hidden = fixtures.length === 0;
}

function renderResult() {
  if (!optimised) return;

  renderTable(
    $("result"),
    ["Begegnung", "Tipp", "erwartete Punkte", "Favoriten-Tipp", "dessen Punkte"],
    optimised.rows.map((r) => [
      `${r.homeName} – ${r.awayName}`,
      `${r.tip.home}:${r.tip.away}`,
      fmt(r.tip.expected),
      `${r.favouriteTip.home}:${r.favouriteTip.away}`,
      fmt(r.favouriteTip.expected),
    ]),
  );

  const t = $("totals");
  t.replaceChildren();
  const p = document.createElement("p");
  p.textContent =
    `Erwartete Punkte insgesamt: ${fmt(optimised.expectedPointsTotal)} `
    + `gegenüber ${fmt(optimised.favouritePointsTotal)} bei reinen Favoritentipps.`;
  t.append(p);

  // The warning is CONDITIONAL and carries this matchday's own numbers. It
  // appears exactly when the optimised expected hit rate is strictly lower —
  // never merely because the tip sets differ in scoreline.
  const w = $("warning");
  w.replaceChildren();
  const hr = optimised.hitRate;
  if (hr.warn) {
    const box = document.createElement("p");
    box.className = "warn";
    box.textContent =
      `Achtung: ${hr.differing.length} von ${hr.matches} Tipps weichen auf eine Tendenz aus, `
      + `die der Markt für weniger wahrscheinlich hält. Die erwartete Trefferquote sinkt dadurch von `
      + `${pct(hr.favouriteExpected)} auf ${pct(hr.optimisedExpected)}. `
      + "Die erwarteten Punkte steigen trotzdem — genau darum geht es.";
    w.append(box);
  } else {
    const box = document.createElement("p");
    box.className = "ok";
    box.textContent =
      "Kein Tipp weicht auf eine unwahrscheinlichere Tendenz aus; die erwartete Trefferquote "
      + `bleibt bei ${pct(hr.favouriteExpected)}.`;
    w.append(box);
  }

  $("result-section").hidden = false;
}

function renderLogFigures() {
  const el = $("log-figures");
  el.replaceChildren();
  const f = realisedFigures(log);
  const p = document.createElement("p");
  if (f.matches === 0) {
    // No fixed hit-rate figure is ever printed (§9).
    p.textContent = `${log.entries.length} Eintrag/Einträge gespeichert, davon keiner mit Ergebnis. `
      + "Sobald Ergebnisse eingetragen sind, stehen hier die tatsächlich erzielten Werte.";
  } else {
    p.textContent = `Tatsächlich erzielt über ${f.matches} Spiele: Trefferquote ${pct(f.hitRate)}, `
      + `im Mittel ${fmt(f.meanPoints)} Punkte.`;
  }
  el.append(p);
}

// --- wiring -----------------------------------------------------------------

$("parse").addEventListener("click", () => {
  const status = $("paste-status");
  try {
    const parsed = parseTippPage($("paste").value);
    const { built, notes } = buildFixtures(parsed);
    fixtures = built;

    const n = $("notes");
    n.replaceChildren();
    for (const note of [...notes, ...parsed.skipped.map((s) => `Nicht verwertbare Zeile übersprungen: ${s}`)]) {
      const li = document.createElement("p");
      li.className = "note";
      li.textContent = note;
      n.append(li);
    }

    renderFixtures();
    if (fixtures.length) {
      optimised = optimiseMatchday(fixtures);
      renderResult();
      say(status, `${fixtures.length} Spiel(e) erkannt.`, "ok");
    } else {
      $("result-section").hidden = true;
      say(status, "Keine Begegnung konnte zugeordnet werden.", "warn");
    }
  } catch (e) {
    $("fixtures-section").hidden = true;
    $("result-section").hidden = true;
    say(status, e instanceof ParseError ? e.message : `Fehler: ${e.message}`, "warn");
  }
});

$("demo").addEventListener("click", () => {
  const sample = clubData.clubs.slice(0, 4);
  if (sample.length < 4) return;
  const rows = [
    [sample[0].name, sample[1].name, "1,75", "3,90", "4,20", 3, 6, 8],
    [sample[2].name, sample[3].name, "2,40", "3,30", "2,95", 5, 5, 5],
  ];
  $("paste").value = `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  say($("paste-status"), "Beispiel eingefügt — jetzt „Einlesen“.", "");
});

$("log-add").addEventListener("click", () => {
  if (!optimised) return;
  const now = new Date().toISOString();
  for (const r of optimised.rows) {
    log = addEntry(log, {
      tippedAt: now,
      home: r.homeName,
      away: r.awayName,
      odds: r.odds,
      quotas: r.quotas,
      tip: r.tip,
      expectedPoints: r.tip.expected,
      favouriteTip: r.favouriteTip,
    });
  }
  const stored = saveLog(log);
  say($("log-status"), stored
    ? `${optimised.rows.length} Eintrag/Einträge gespeichert.`
    : "Lokal konnte nicht gespeichert werden — bitte exportieren.", stored ? "ok" : "warn");
  renderLogFigures();
});

$("log-export").addEventListener("click", () => {
  const blob = new Blob([exportLog(log)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `kicktipp-protokoll-v${LOG_SCHEMA_VERSION}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  say($("log-status"), "Exportiert.", "ok");
});

$("log-import").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    log = importLog(await file.text());
    saveLog(log);
    say($("log-status"), `${log.entries.length} Eintrag/Einträge importiert.`, "ok");
    renderLogFigures();
  } catch (e) {
    say($("log-status"), e.message, "warn");
  }
  event.target.value = "";
});

// --- provenance -------------------------------------------------------------

const prov = $("provenance");
prov.textContent = clubData.clubs.length
  ? `${clubData.clubs.length} Klubs mit Ratings aus Saison ${clubData.season}, `
    + `Modellparameter ${clubData.procedureVersion ?? "unbekannt"}. Stand ${clubData.generatedAt}.`
  : "Keine Klub-Ratings eingebettet — diese Datei wurde ohne committete Saisondaten gebaut.";

renderLogFigures();
