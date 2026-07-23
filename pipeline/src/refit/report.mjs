// ============================================================================
//  The refit pull-request body (§5.5).
//
//  NEITHER PROCESS COMMITS DIRECTLY — both open a PR, and the PR carries CODE,
//  WINDOW and PARAMETER PROVENANCE. The report is not decoration: a human merges
//  only when it is present, and an override is only valid if its justification
//  is written down here.
// ============================================================================

import { PROCESS_A } from "./decide.mjs";

const num = (v, d = 4) => (Number.isFinite(v) ? v.toFixed(d) : "–");
const pctRel = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(3)} %` : "–");

function provenanceSection({ candidateCommit, incumbentCommit, hyperparameters, window, procedureVersion }) {
  return [
    "## Herkunft",
    "",
    "| | |",
    "|---|---|",
    `| Lab-Commit dieses Laufs | \`${candidateCommit}\` |`,
    `| Lab-Commit des Amtsinhabers | \`${incumbentCommit}\` |`,
    `| Prozedurversion | \`${procedureVersion ?? "–"}\` |`,
    `| Fenster | ${window.seasons} Saisons, ${window.weighting === "equal" ? "gleichgewichtet" : window.weighting} |`,
    `| Hyperparameter | \`${JSON.stringify(hyperparameters)}\` |`,
    "",
    "Das Fenster von 15 Saisons ist das Fenster, auf dem die Recency-Aussage des Labs",
    "(„gleiche Gewichtung schlägt jede Halbwertszeit“) überhaupt erst festgestellt wurde.",
    "**Ändert sich die Fensterregel, ist das ein Prozess-B-Wechsel** und der Recency-Test",
    "muss vorher erneut laufen — sonst wandert älterer Fußball in eine aktuelle Prognose.",
    "",
  ].join("\n");
}

function monitoringSection(monitoring, baselines) {
  if (!monitoring) return "";
  return [
    "## Monitoring-Bericht — Amtsinhaber auf der neuen Saison",
    "",
    `Ausgewertet auf **Saison ${monitoring.season}**, ${monitoring.matches} Spiele.`,
    "Das ist ein **echtes Out-of-Sample-Ergebnis**: der Amtsinhaber hat diese Saison nie gesehen.",
    "",
    "| Metrik | Amtsinhaber | Zufallsbasis | Richtung |",
    "|---|---|---|---|",
    `| Log-Loss | ${num(monitoring.logLoss)} | ${num(baselines.logLoss)} | niedriger ist besser |`,
    `| Brier | ${num(monitoring.brier)} | ${num(baselines.brier)} | niedriger ist besser |`,
    `| RPS | ${num(monitoring.rps)} | – | niedriger ist besser |`,
    `| ECE | ${num(monitoring.ece, 2)} pp | – | niedriger ist besser |`,
    "",
    monitoring.historicalFolds?.length
      ? `Zum Vergleich die historischen Fold-Ergebnisse derselben Prozedur: `
        + `Log-Loss ${monitoring.historicalFolds.map((f) => num(f.logLoss)).join(", ")}.`
      : "",
    "",
    "**Hier gibt es kein vergleichendes Gate** — es existiert nichts Unabhängiges, wogegen",
    "verglichen werden könnte. Der Bericht ist zum Lesen da: ein Leistungseinbruch deutet auf",
    "Datenprobleme oder einen Regimewechsel hin und löst eine Untersuchung aus, bevor",
    "irgendetwas aufgefrischt wird.",
    "",
  ].join("\n");
}

function reproductionSection(reproduction) {
  if (!reproduction) return "";
  const lines = [
    "## Reproduktionsprüfung",
    "",
    reproduction.bitIdentical
      ? "Der neue Code reproduziert die Parameter des Amtsinhabers **bitgleich**."
      : "Der neue Code reproduziert die Parameter des Amtsinhabers **nicht bitgleich**; "
        + "geprüft wurde gegen die vorab festgelegten Schranken.",
    "",
    `Ergebnis: **${reproduction.passes ? "bestanden" : "nicht bestanden"}**`,
    "",
    "Die Schranken stehen in `data/refit-tolerances.json` und wurden **vor** diesem Lauf",
    "festgelegt. Sie werden nie nach Sicht des Ergebnisses gewählt oder angepasst; dieser",
    "Bericht meldet ausschließlich bestanden/nicht bestanden gegen sie.",
    "",
  ];
  if (reproduction.failed.length) {
    lines.push(
      "| Parameter | Klasse | Amtsinhaber | Kandidat | abs. Differenz | Schranke abs. |",
      "|---|---|---|---|---|---|",
      ...reproduction.failed.map((f) => `| \`${f.parameter}\` | ${f.class ?? "–"} | ${f.incumbent ?? "–"} `
        + `| ${f.candidate ?? "–"} | ${f.absDiff !== undefined ? f.absDiff.toExponential(2) : "–"} `
        + `| ${f.absoluteBound ?? "–"} |`),
      "",
    );
  }
  return lines.join("\n");
}

function gatesSection(gates) {
  if (!gates) return "";
  const g = gates.decision;
  return [
    "## Vergleichende Gates (nur Prozess B)",
    "",
    `Entscheidungsmetrik: **${g.metric}**, ausgewertet über ${gates.guardrails.length ? "dieselben" : ""} Rolling-Origin-Folds.`,
    "",
    "| Metrik | Amtsinhaber | Kandidat | Verschlechterung | Grenze | |",
    "|---|---|---|---|---|---|",
    `| **Log-Loss** (Entscheidung) | ${num(g.incumbent)} | ${num(g.candidate)} `
      + `| ${pctRel(g.relativeWorsening)} | ${pctRel(g.limit)} | ${g.passes ? "✅" : "❌"} |`,
    ...gates.guardrails.map((x) => (x.kind === "relative"
      ? `| ${x.metric} (Leitplanke) | ${num(x.incumbent)} | ${num(x.candidate)} `
        + `| ${pctRel(x.relativeWorsening)} | ${pctRel(x.limit)} | ${x.passes ? "✅" : "❌"} |`
      : `| ${x.metric} (Leitplanke) | ${num(x.incumbent, 2)} pp | ${num(x.candidate, 2)} pp `
        + `| ${num(x.absoluteWorsening, 2)} pp | ${num(x.limit, 2)} pp | ${x.passes ? "✅" : "❌"} |`)),
    "",
    gates.blockedByGuardrail
      ? "**Eine Leitplanke ist gerissen. Das blockiert den Standard-Merge unabhängig vom Log-Loss.**"
      : gates.passes
        ? "Alle Gates bestanden."
        : "Die Entscheidungsmetrik hat ihr Gate nicht bestanden.",
    "",
    "Die Gates **ordnen Evidenz, sie ersetzen kein Urteil**. Eine Saison sind rund 306 Spiele,",
    "und selbst das Mittel über zehn Folds trägt erhebliches Rauschen. Ein Mensch darf gegen",
    "ein Gate mergen — aber nur mit **schriftlicher Begründung in diesem PR**. Stille",
    "Übersteuerungen sind unzulässig.",
    "",
  ].join("\n");
}

/** The complete PR body. */
export function buildPullRequestBody(input) {
  const { decision, provenance, monitoring, baselines, reproduction, gates, newParameters } = input;
  const isA = decision.process === PROCESS_A;

  return [
    `# Jährlicher Refit — Prozess ${decision.process}`,
    "",
    `**Einstufung:** ${decision.reason}`,
    "",
    isA
      ? "Prozess A ist die jährliche Überwachung und Fensterauffrischung. Die Prozedur bleibt "
        + "unverändert; sie wird auf die neuesten 15 abgeschlossenen Saisons neu gefittet."
      : "Prozess B ist eine methodische Änderung. Alte und neue Prozedur laufen auf **identischen** "
        + "Rolling-Origin-Folds, und nur hier gelten die vergleichenden Gates.",
    "",
    "> Dieser Lauf committet nichts direkt. Er öffnet ausschließlich diesen Pull Request.",
    "",
    provenanceSection(provenance),
    reproductionSection(reproduction),
    monitoringSection(monitoring, baselines ?? {}),
    gatesSection(gates),
    "## Neue Produktionsparameter",
    "",
    newParameters
      ? "```json\n" + `${JSON.stringify(newParameters, null, 2)}\n` + "```"
      : "_Keine — dieser Lauf schlägt keine neuen Parameter vor._",
    "",
    isA
      ? "Diese Parameter erhalten ihren Out-of-Sample-Test im **Monitoring-Bericht des nächsten "
        + "Jahres**. Das ist der einzige unabhängige Test, den sie bekommen."
      : "Nach Freigabe wird die neue Prozedur auf die neuesten 15 abgeschlossenen Saisons "
        + "gefittet und ausgeliefert; ab dann ist sie der Amtsinhaber von Prozess A.",
    "",
    "## Vor dem Merge",
    "",
    "- [ ] Monitoring-Bericht gelesen, keine Auffälligkeiten (oder Untersuchung dokumentiert)",
    "- [ ] Herkunft geprüft: Lab-Commit, Fenster, Hyperparameter",
    isA ? "" : "- [ ] Gates geprüft; bei Übersteuerung: schriftliche Begründung unten ergänzt",
    "- [ ] Europapokalplätze und Regeländerungen der kommenden Saison geprüft",
    "",
  ].filter((x) => x !== "").join("\n");
}
