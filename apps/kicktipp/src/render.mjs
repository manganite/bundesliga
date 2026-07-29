// ============================================================================
//  The per-fixture „Wie gerechnet?" disclosure DOM (§KICKTIPP_TRANSPARENZ §2,
//  reworded per the Quellen-Label prompt). Extracted from main.js so the guard
//  test can render it against a jsdom document and check that the MODEL line
//  shows the model — not the market wearing the model's hat (§3).
//
//  Pure over its inputs and injectable `doc`: every value is text via
//  textContent, never markup. No `innerHTML` anywhere.
// ============================================================================

import {
  marketPercent, tendencyBreakdown, deviation, decisionSentence, TENDENCIES, oddsSourceLabel,
} from "./rechenweg.mjs";

const nf2 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmt = (v) => nf2.format(v);
const pct = (v) => `${nf1.format(v * 100)} %`;
const LABEL = { homeWin: "H", draw: "U", awayWin: "A" };
const label = (t) => LABEL[t];

/**
 * @param {object} row  an optimised fixture row: { homeName, awayName, odds|null,
 *   model: { region }, matrix, maxGoals, quotas, basisTendency? , favouriteTendency }
 * @param {Document} doc  injectable so tests render without a browser
 */
export function renderRechenweg(row, doc = globalThis.document) {
  const details = doc.createElement("details");
  details.className = "method-disclosure";
  const summary = doc.createElement("summary");
  summary.textContent = `${row.homeName} – ${row.awayName} — Wie gerechnet?`;
  details.append(summary);
  const body = doc.createElement("div");
  body.className = "method-body";
  const line = (text) => { const p = doc.createElement("p"); p.textContent = text; body.append(p); return p; };

  // 1 · The odds source, then the market in %, with the margin made plain in
  // user language („ohne Marge") — no bookmaker jargon.
  const mkt = row.odds ? marketPercent(row.odds) : null;
  if (mkt) {
    line(`Quotenquelle: ${oddsSourceLabel(mkt.margin)}.`);
    line(`Markt: Quoten ${fmt(row.odds.home)} / ${fmt(row.odds.draw)} / ${fmt(row.odds.away)} → ohne Marge `
      + `${pct(mkt.homeWin)} / ${pct(mkt.draw)} / ${pct(mkt.awayWin)} (Marge ${pct(mkt.margin)}).`);
    line(`Kehrwerte der Quoten summieren auf ${pct(1 + mkt.margin)} — der Überschuss ist die Marge `
      + "(Gewinnaufschlag des Anbieters); geteilt durch die Summe ergeben sich die Prozente.");
  } else {
    line("Markt: keine Wettquoten auf der Seite — dieses Spiel läuft im Nur-Modell-Modus.");
  }

  // 2 · The MODEL in %, straight from the odds-less run (row.model.region) —
  // never the reweighted matrix, whose margins are the market's by construction.
  const model = row.model.region;
  const dev = deviation(mkt, model);
  const flagged = TENDENCIES.filter((t) => dev[t]).map(label);
  line(`Modell: ${pct(model.homeWin)} / ${pct(model.draw)} / ${pct(model.awayWin)}`
    + (flagged.length ? ` — deutliche Abweichung vom Markt bei ${flagged.join(", ")}.` : "."));

  // 3 · Per tendency: the best tip with the expected value split into three tiers.
  line("Je Tendenz der beste Tipp (erwartete Punkte = Tendenz + Differenz + exakt):");
  const ul = doc.createElement("ul");
  const breakdown = tendencyBreakdown(row.matrix, row.maxGoals, row.quotas);
  breakdown.forEach((b, i) => {
    const li = doc.createElement("li");
    li.textContent =
      `${label(b.tendency)} · ${b.tip.home}:${b.tip.away} · ${fmt(b.expected)} = `
      + `${fmt(b.parts.tendenz)} (Tendenz) + ${fmt(b.parts.differenz)} (Differenz) + ${fmt(b.parts.exakt)} (exakt)`
      + (i === 0 ? "  ← Empfehlung" : "");
    ul.append(li);
  });
  body.append(ul);

  // 4 · One sentence on the decision — the favourite follows the chosen basis.
  line(decisionSentence(breakdown, row.basisTendency ?? row.favouriteTendency, label));

  details.append(body);
  return details;
}
