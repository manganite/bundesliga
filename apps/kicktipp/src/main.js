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
import { parseTippPage, resolveClub, ParseError } from "./parse.mjs";
import { buildMarketMatrix } from "./market.mjs";
import { optimiseMatchday, favouriteTendency } from "./optimise.mjs";
import { marketPercent, oddsSourceShort, MODEL_BASIS_CAPTION } from "./rechenweg.mjs";
import { renderRechenweg } from "./render.mjs";
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
// The Grundlage toggle (§KICKTIPP_TRANSPARENZ §3): "market" | "model". A
// fixture without odds is always on the model basis regardless of the toggle.
let basis = "market";

const effectiveBasis = (f) => (basis === "model" || !f.hasOdds ? "model" : "market");
const basisData = (f) => f[effectiveBasis(f)];

/**
 * Run the SAME optimiser on the chosen basis matrix per fixture (§3). The TIP
 * follows the chosen basis (its matrix), but the hit-rate warning always
 * references the true MARKET masses (`f.market.region`) — the honest „weicht vom
 * Markt ab" reading, not the model comparing against itself. The chosen-basis
 * favourite travels separately as `basisTendency` for the decision sentence.
 */
function optimiseCurrent() {
  const forOpt = fixtures.map((f) => {
    const b = basisData(f);
    return {
      ...f,
      matrix: b.matrix,
      maxGoals: b.maxGoals,
      market: f.market.region, // the real market (or the model fallback when odds-less)
      basisTendency: favouriteTendency(b.region),
    };
  });
  return optimiseMatchday(forOpt);
}

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
// Resolution against the bundled register lives in parse.mjs (pure, tested);
// here it is bound to the embedded clubs.
const matchClub = (name) => resolveClub(name, clubData.clubs);

function buildFixtures(parsed) {
  const notes = [];
  const built = [];
  // The „Das habe ich verstanden" panel (§3): every row, used or rejected, with
  // its reason — nothing is guessed and nothing is silently dropped.
  const understood = [];
  const rejected = parsed.skipped.map((s) => ({ text: s.text, reason: s.reason }));

  for (const f of parsed.fixtures) {
    const home = matchClub(f.home);
    const away = matchClub(f.away);
    if (!home || !away || !params) {
      const which = !home ? f.home : !away ? f.away : "Rating";
      rejected.push({
        text: `${f.home} – ${f.away}`,
        reason: params ? `„${which}" ist keinem Klub im Register zugeordnet` : "keine Ratings eingebettet",
      });
      continue;
    }

    // Odds ONLY where the page carried them; otherwise model-only mode (§1).
    const market = buildMarketMatrix({
      eloHome: home.rating, eloAway: away.rating, params, odds: f.odds,
    });
    // The model basis IS the existing odds-less fallback path (§3), so model
    // mode reproduces it bit-identically — not a second, slightly different
    // model computation.
    const model = buildMarketMatrix({ eloHome: home.rating, eloAway: away.rating, params, odds: null });
    const modelOnly = !f.odds;
    if (market.note && !modelOnly) notes.push(`${f.home} – ${f.away}: ${market.note}`);

    built.push({
      id: f.id ?? `${home.clubId}-${away.clubId}`,
      homeName: home.name,
      awayName: away.name,
      odds: f.odds ?? null,
      hasOdds: Boolean(f.odds),
      quotas: f.quotas ?? { homeWin: 3, draw: 3, awayWin: 3 },
      // Both bases, so the Grundlage toggle (§3) runs the SAME optimiser on
      // either without recomputing. For a model-only fixture the two coincide.
      market: { matrix: market.matrix, maxGoals: market.maxGoals, region: market.market },
      model: { matrix: model.matrix, maxGoals: model.maxGoals, region: model.market },
    });
    // The odds source, from the margin (§Quellen-Label §2): a short tag in the
    // check table, the full sentence in the Rechenweg.
    const source = f.odds ? oddsSourceShort(marketPercent(f.odds).margin) : null;
    understood.push({
      pairing: `${home.name} – ${away.name}`,
      rule: f.quotas ? `${f.quotas.homeWin} - ${f.quotas.draw} - ${f.quotas.awayWin}` : "—",
      // §KICKTIPP_MD1_QUOTENFIX §2: a quote-less row says so at its line, and the
      // suggestion table shows „Grundlage: Modell" for it — mixed matchdays are
      // first class, not a special case.
      odds: f.odds
        ? `${fmt(f.odds.home)} / ${fmt(f.odds.draw)} / ${fmt(f.odds.away)} (${source})`
        : "nicht gefunden — Nur-Modell-Modus",
    });
  }

  const withoutOdds = built.filter((f) => !f.odds).length;
  if (withoutOdds === built.length && built.length) {
    notes.push("Diese Runde trägt keine Wettquoten — die Empfehlungen entstehen rein aus dem Modell.");
  } else if (withoutOdds > 0) {
    notes.push(`${withoutOdds} Spiel(e) ohne Wettquoten — dort empfiehlt allein das Modell.`);
  }

  return { built, notes, understood, rejected };
}

function renderFixtures() {
  renderTable(
    $("fixtures"),
    ["Begegnung", "Quote H", "Quote U", "Quote A", "Tippquote H/U/A", "Grundlage"],
    fixtures.map((f) => [
      `${f.homeName} – ${f.awayName}`,
      f.odds ? fmt(f.odds.home) : "—",
      f.odds ? fmt(f.odds.draw) : "—",
      f.odds ? fmt(f.odds.away) : "—",
      `${f.quotas.homeWin}/${f.quotas.draw}/${f.quotas.awayWin}`,
      effectiveBasis(f) === "market" ? "Markt" : "Modell",
    ]),
  );
  $("fixtures-section").hidden = fixtures.length === 0;
}

/**
 * „Das habe ich verstanden" (§3): after every paste, what the parser made of the
 * page — the used rows (pairing · point rule · odds or „ohne") and, named, the
 * rows it could not use. The reader checks this BEFORE trusting the suggestion.
 */
function renderUnderstood(understood, rejected) {
  const el = $("understood");
  el.replaceChildren();

  const h = document.createElement("p");
  h.textContent = understood.length
    ? `${understood.length} Spiel(e) erkannt:`
    : "Kein Spiel konnte verwertet werden.";
  el.append(h);

  if (understood.length) {
    renderTable(
      el,
      ["Begegnung", "Punkteregel", "Wettquoten H/U/A"],
      understood.map((u) => [u.pairing, u.rule, u.odds]),
    );
  }

  if (rejected.length) {
    const r = document.createElement("p");
    r.className = "note";
    r.textContent = `${rejected.length} Zeile(n) nicht verwertet:`;
    el.append(r);
    const ul = document.createElement("ul");
    for (const item of rejected) {
      const li = document.createElement("li");
      li.textContent = `${item.text} — ${item.reason}`;
      ul.append(li);
    }
    el.append(ul);
  }

  $("understood-section").hidden = understood.length === 0 && rejected.length === 0;
}

function renderResult() {
  if (!optimised) return;

  renderTable(
    $("result"),
    ["Begegnung", "Tipp", "erwartete Punkte", "Favoriten-Tipp", "dessen Punkte", "Grundlage"],
    optimised.rows.map((r) => [
      `${r.homeName} – ${r.awayName}`,
      `${r.tip.home}:${r.tip.away}`,
      fmt(r.tip.expected),
      `${r.favouriteTip.home}:${r.favouriteTip.away}`,
      fmt(r.favouriteTip.expected),
      effectiveBasis(r) === "market" ? "Markt" : "Modell",
    ]),
  );

  // §2: each fixture gets a „Wie gerechnet?" disclosure, following the chosen basis.
  const rw = $("rechenweg");
  rw.replaceChildren();
  for (const r of optimised.rows) rw.append(renderRechenweg(r, document));

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

/** Re-optimise on the current basis and redraw everything that depends on it. */
function recompute() {
  optimised = optimiseCurrent();
  renderFixtures();
  renderResult();
  const cap = $("grundlage-caption");
  cap.textContent = MODEL_BASIS_CAPTION;
  $("grundlage-row").hidden = fixtures.length === 0;
}

/** Reflect the basis state in the toggle control. */
function syncBasisControl() {
  const sel = $("grundlage");
  if (sel) sel.value = basis;
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

// The rich clipboard HTML captured on paste (§3): Strg+A/Strg+C on the live
// Kicktipp page delivers `text/html`, the DevTools-outerHTML path delivers plain
// markup in the textarea. Both land in the same parser. A manual edit clears it,
// so the textarea path stays authoritative when the user types.
let pastedHtml = null;

$("paste").addEventListener("paste", (event) => {
  const html = event.clipboardData?.getData("text/html");
  if (html && html.trim()) pastedHtml = html;
});
// A paste ALSO fires an `input` (inputType "insertFromPaste") right after — do
// not let it wipe the rich HTML the paste handler just captured. Manual typing
// (any other inputType) clears it, so the textarea path stays authoritative.
$("paste").addEventListener("input", (event) => {
  if (event.inputType !== "insertFromPaste") pastedHtml = null;
});

$("parse").addEventListener("click", () => {
  const status = $("paste-status");
  // Prefer the captured rich HTML; fall back to whatever is in the textarea.
  const typed = $("paste").value;
  const source = pastedHtml && pastedHtml.includes("<") ? pastedHtml : typed;
  if (!source || !source.includes("<")) {
    $("understood-section").hidden = true;
    $("fixtures-section").hidden = true;
    $("result-section").hidden = true;
    say(status, "Bitte die Seite kopieren, nicht nur den Text — oder in den DevTools das Tabellen-HTML kopieren.", "warn");
    return;
  }

  try {
    const parsed = parseTippPage(source);
    const { built, notes, understood, rejected } = buildFixtures(parsed);
    fixtures = built;

    // The verification panel first — the reader confirms it before trusting the
    // suggestion below.
    renderUnderstood(understood, rejected);

    const n = $("notes");
    n.replaceChildren();
    for (const note of notes) {
      const li = document.createElement("p");
      li.className = "note";
      li.textContent = note;
      n.append(li);
    }

    renderFixtures();
    if (fixtures.length) {
      // Default the toggle to Markt when any fixture carries odds, else Modell.
      basis = fixtures.some((f) => f.hasOdds) ? "market" : "model";
      syncBasisControl();
      recompute();
      say(status, `${fixtures.length} Spiel(e) erkannt.`, "ok");
    } else {
      $("result-section").hidden = true;
      say(status, "Keine Begegnung konnte zugeordnet werden.", "warn");
    }
  } catch (e) {
    $("understood-section").hidden = true;
    $("fixtures-section").hidden = true;
    $("result-section").hidden = true;
    say(status, e instanceof ParseError ? e.message : `Fehler: ${e.message}`, "warn");
  }
});

$("grundlage").addEventListener("change", (event) => {
  basis = event.target.value === "model" ? "model" : "market";
  recompute();
});

$("demo").addEventListener("click", () => {
  const sample = clubData.clubs.slice(0, 4);
  if (sample.length < 4) return;
  // The real Kicktipp „stack" structure, so the demo exercises the same
  // structural path a pasted page does (home name + point rule + odds in col1).
  const datarow = (home, away, id, rule, oh, od, oa) => `
    <tr class="datarow"><td class="cell col0 hide">Fr.</td>
      <td class="cell col1"><div class="stack">
        <div class="stackElement" data-from="1">${home}</div>
        <div class="stackElement" data-from="3">${rule}</div>
        <div class="stackElement" data-from="5"><div class="tippabgabe-quoten">
          <span class="quote quote-heim"><span class="quote-text">${oh}</span></span>
          <span class="quote quote-remis"><span class="quote-text">${od}</span></span>
          <span class="quote quote-gast"><span class="quote-text">${oa}</span></span>
        </div></div>
      </div></td>
      <td class="cell col2">${away}</td>
      <td class="cell col4"><input name="spieltippForms[${id}].heimTipp"></td></tr>`;
  $("paste").value = "<table id=\"tippabgabeSpiele\"><tbody>"
    + datarow(sample[0].kicktipp ?? sample[0].name, sample[1].kicktipp ?? sample[1].name, "9000001", "3 - 6 - 8", "1.75", "3.90", "4.20")
    + datarow(sample[2].kicktipp ?? sample[2].name, sample[3].kicktipp ?? sample[3].name, "9000002", "5 - 5 - 5", "2.40", "3.30", "2.95")
    + "</tbody></table>";
  pastedHtml = null;
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
      odds: r.odds ?? {},
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
