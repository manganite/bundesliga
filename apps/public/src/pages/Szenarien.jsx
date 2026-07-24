import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import FixturePrediction, { favouriteOf } from "../components/FixturePrediction.jsx";
import Tabs from "../components/Tabs.jsx";
import { useScenario } from "../hooks/useScenario.js";
import { targetList, currentTable, predictFixture } from "../lib/season.js";
import { remainingFixtures, toEngineFixtures } from "../lib/data.js";
import { analyseRequirement, verifyHelpCertificate } from "../../../../packages/engine/src/solver.mjs";
import { percent, number, pp } from "../lib/format.js";

// ============================================================================
//  Szenarien — the ONLY page with ANALYTIC tools (§10, refined by the
//  SZENARIEN_UX brief: analytic interaction = inputs that alter forecasts). The
//  illustrative Beispielsaison moved to Methodik, which changes nothing.
//
//  Two tools: what-if, and „Was muss passieren?" (built and tested, shown only
//  when ≤ 5 matchdays remain). All state is session-only.
// ============================================================================

const GRID_MAX = 10;
const SOLVER_MATCHDAY_THRESHOLD = 5;

export default function Szenarien({ ctx }) {
  const { season, outlook, leagueLabel, params } = ctx;
  const remaining = useMemo(() => remainingFixtures(season.fixtures), [season]);

  if (!outlook || !params?.params) {
    return (
      <>
        <h2>Szenarien — {leagueLabel}</h2>
        <Empty>
          Für Szenarien wird die Simulation dieses Datenstands gebraucht. Sie liegt noch nicht vor —
          die Artefakte entstehen in der Pipeline und werden committet.
        </Empty>
      </>
    );
  }

  if (!remaining.length) {
    return (
      <>
        <h2>Szenarien — {leagueLabel}</h2>
        <Empty>
          Die Saison ist gespielt — es sind keine Spiele mehr offen, mit denen sich etwas
          durchspielen ließe.
        </Empty>
      </>
    );
  }

  const matchdaysRemaining = new Set(remaining.map((f) => f.matchday)).size;

  return (
    <>
      <h2>Szenarien — {leagueLabel}</h2>
      <p className="page-intro">
        Was wäre, wenn …? Ergebnisse festsetzen und sehen, wie sich die Prognose verschiebt.
        Alles läuft im Browser und wird nirgends gespeichert.
      </p>

      <div className="stack">
        <WasWaereWenn ctx={ctx} remaining={remaining} />
        {matchdaysRemaining <= SOLVER_MATCHDAY_THRESHOLD
          ? <WasMussPassieren ctx={ctx} remaining={remaining} />
          : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Was-wäre-wenn
// ---------------------------------------------------------------------------

function WasWaereWenn({ ctx, remaining }) {
  const { season, outlook, leagueConfig, league, nameOf, params, prematch } = ctx;
  const runs = outlook.runs ?? 20000;
  const batches = outlook.batches ?? 20;

  // fixtureId -> { gh, ga }. The INPUTS. Editing these never runs anything.
  const [fixed, setFixed] = useState({});
  // The inputs the last run was computed from. The result is stale whenever
  // `fixed` has moved away from this. §1.4: no simulation without the button.
  const [committed, setCommitted] = useState(null);
  const fixedCount = Object.keys(fixed).length;

  // Matchday grouping (§1.1): show one matchday, default to the next unplayed.
  const matchdays = useMemo(
    () => [...new Set(remaining.map((f) => f.matchday))].sort((a, b) => a - b),
    [remaining],
  );
  const [selectedMd, setSelectedMd] = useState(() => matchdays[0]);
  const visibleFixtures = remaining.filter((f) => f.matchday === selectedMd);

  // Predictions for the visible fixtures — the modal scoreline both displays the
  // „Simuliert" state (§1.2) and prefills „Festsetzen" (§1.3).
  const predictionOf = (fixture) => predictFixture(fixture, prematch, params, league);

  const request = useMemo(() => {
    if (!committed || !Object.keys(committed).length) return null;
    const clubs = season.clubs.map((c) => ({ clubId: c.clubId, rating: outlook.ratings[c.clubId] }));
    const modifiedFixtures = toEngineFixtures(
      season.fixtures.map((f) => (committed[f.id] ? { ...f, gh: committed[f.id].gh, ga: committed[f.id].ga } : f)),
    );
    return {
      kind: "whatif",
      payload: {
        // The SAME seasonId as the canonical artefact → the same random keys →
        // CRN against the baseline (§3).
        seasonId: `${season.season}-${league}`,
        league,
        clubs,
        params: params.params,
        targets: leagueConfig.targets,
        runs,
        batches,
        rules: {
          pointsForWin: leagueConfig.pointsForWin,
          pointsForDraw: leagueConfig.pointsForDraw,
          criteria: leagueConfig.tiebreakCriteria,
        },
        baselineFixtures: toEngineFixtures(season.fixtures),
        modifiedFixtures,
      },
    };
  }, [committed, season, outlook, league, leagueConfig, params, runs, batches]);

  const sim = useScenario(request);
  const stale = fixedCount > 0 && JSON.stringify(fixed) !== JSON.stringify(committed ?? {});
  const canRun = fixedCount > 0 && stale;

  const fixTo = (id, gh, ga) => setFixed((prev) => ({ ...prev, [id]: { gh, ga } }));
  const clearOne = (id) => setFixed((prev) => { const next = { ...prev }; delete next[id]; return next; });
  const clearAll = () => setFixed({});
  const runScenario = () => setCommitted({ ...fixed });

  const targets = targetList(leagueConfig);
  const fixedList = Object.keys(fixed).map((id) => remaining.find((f) => f.id === id)).filter(Boolean);

  return (
    <Card title="Was-wäre-wenn">
      <Explainer />

      {/* Fixed fixtures on OTHER matchdays stay visible, so nothing that is in
          force is ever off-screen (§1.1). */}
      {fixedCount ? (
        <FixedSummary fixedList={fixedList} fixed={fixed} nameOf={nameOf} onClearOne={clearOne} onClearAll={clearAll} />
      ) : null}

      <div className="controls" style={{ margin: "0.8rem 0 0.4rem" }}>
        <label>
          Spieltag{" "}
          <select value={selectedMd} onChange={(e) => setSelectedMd(Number(e.target.value))}>
            {matchdays.map((m) => <option key={m} value={m}>{m}. Spieltag</option>)}
          </select>
        </label>
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">offenes Spiel</th>
              <th scope="col" className="left">Zustand</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {visibleFixtures.map((f) => (
              <FixtureRow
                key={f.id}
                fixture={f}
                nameOf={nameOf}
                prediction={predictionOf(f)}
                fixed={fixed[f.id]}
                onFix={(gh, ga) => fixTo(f.id, gh, ga)}
                onReset={() => clearOne(f.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="controls" style={{ marginTop: "0.9rem", gap: "1rem" }}>
        <button type="button" className="primary" disabled={!canRun} onClick={runScenario}>
          Szenario rechnen
        </button>
        {sim.status === "running" ? <span className="axis-label">rechnet …</span> : null}
      </div>

      {committed && Object.keys(committed).length
        ? <WhatIfResult sim={sim} targets={targets} nameOf={nameOf} runs={runs} stale={stale} />
        : null}
    </Card>
  );
}

/**
 * Fixed fixtures, shown above the table so a result in force is NEVER off-screen
 * even when its matchday is not the selected one (§1.1).
 */
export function FixedSummary({ fixedList, fixed, nameOf, onClearOne, onClearAll }) {
  return (
    <div className="fixed-summary">
      <strong>Festgesetzt ({fixedList.length}):</strong>{" "}
      {fixedList.map((f) => (
        <span key={f.id} className="fixed-chip">
          {nameOf(f.homeClubId)} {fixed[f.id].gh}:{fixed[f.id].ga} {nameOf(f.awayClubId)}
          <button type="button" className="chip-x" onClick={() => onClearOne(f.id)} aria-label="zurücksetzen">×</button>
        </span>
      ))}
      <button type="button" onClick={onClearAll}>alles zurücksetzen</button>
    </div>
  );
}

/** §1.6: the process, not the features — simuliert → festgesetzt → rechnen. */
export function Explainer() {
  return (
    <p className="page-intro" style={{ marginBottom: "0.8rem" }}>
      Jedes offene Spiel ist zunächst <strong>simuliert</strong>: Sein Ergebnis wird in jedem
      Durchlauf neu ausgewürfelt — mal so, mal so, gemäß den Torraten beider Klubs. Setzt du ein
      Spiel <strong>fest</strong>, gilt stattdessen in allen Durchläufen genau dieses Ergebnis. Dann
      <strong>Szenario rechnen</strong>: Dieselbe Simulation läuft erneut, mit demselben Zufall —
      Veränderungen kommen so wirklich von deinen Ergebnissen und nicht vom Würfeln.
    </p>
  );
}

export function FixtureRow({ fixture, nameOf, prediction, fixed, onFix, onReset }) {
  const [editing, setEditing] = useState(false);
  const modal = prediction ? favouriteOf(prediction).modal : [0, 0];

  return (
    <tr>
      <th scope="row" className="left" style={{ fontWeight: 400 }}>
        {nameOf(fixture.homeClubId)} – {nameOf(fixture.awayClubId)}
      </th>
      <td className="left">
        {fixed ? (
          <span className="fixed-state"><strong>Festgesetzt: {fixed.gh}:{fixed.ga}</strong></span>
        ) : editing ? (
          <ScorePicker
            home={nameOf(fixture.homeClubId)}
            away={nameOf(fixture.awayClubId)}
            initial={modal}
            onConfirm={(gh, ga) => { onFix(gh, ga); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          // §1.2: open fixtures show STATE, never a 0:0 input that reads as an
          // assumption the simulation does not make.
          <FixturePrediction prediction={prediction} />
        )}
      </td>
      <td>
        {fixed ? (
          <button type="button" onClick={onReset}>zurück zu simuliert</button>
        ) : editing ? null : (
          <button type="button" onClick={() => setEditing(true)}>Festsetzen</button>
        )}
      </td>
    </tr>
  );
}

/**
 * The score input, PREFILLED with the modal scoreline (§1.3). Editing from the
 * model's most likely result is what makes the CHANGE meaningful — turning a
 * likely 2:1 into a 0:2 is a visible decision; editing from 0:0 is guessing in
 * the dark.
 */
function ScorePicker({ home, away, initial, onConfirm, onCancel }) {
  const [gh, setGh] = useState(initial[0]);
  const [ga, setGa] = useState(initial[1]);
  const opts = Array.from({ length: GRID_MAX + 1 }, (_, i) => i);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
      <select value={gh} onChange={(e) => setGh(Number(e.target.value))} aria-label={`${home} Tore`}>
        {opts.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span>:</span>
      <select value={ga} onChange={(e) => setGa(Number(e.target.value))} aria-label={`${away} Tore`}>
        {opts.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <button type="button" className="primary" onClick={() => onConfirm(gh, ga)}>übernehmen</button>
      <button type="button" onClick={onCancel}>abbrechen</button>
    </span>
  );
}

export function WhatIfResult({ sim, targets, nameOf, runs, stale }) {
  if (sim.status === "error") {
    return <p className="caption">Konnte nicht gerechnet werden: {sim.error}</p>;
  }
  if (sim.status !== "done" || !sim.result) {
    return <p className="caption" style={{ marginTop: "0.8rem" }}>Wird gerechnet …</p>;
  }

  const { deltas } = sim.result;

  // One tab per target that HAS a supra-noise change (§1). Targets are kept in
  // the league config's order; within a tab, clubs are sorted by |Δ|.
  const tabs = [];
  for (const t of targets) {
    const rows = Object.entries(deltas[t.id] ?? {})
      .map(([clubId, d]) => ({ clubId, ...d }))
      .filter((d) => d.significant)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    if (rows.length) tabs.push({ id: t.id, label: t.label, rows, top: rows[0] });
  }

  return (
    // §1.4: after any input change the previous result is dimmed and labelled.
    <div className={stale ? "whatif-result is-stale" : "whatif-result"} style={{ marginTop: "1rem" }}>
      <h3>Veränderung gegenüber der unveränderten Prognose</h3>
      {stale ? <p className="banner warn" role="status">Eingaben geändert — Ergebnis veraltet. „Szenario rechnen“ drücken.</p> : null}
      <p className="caption" style={{ marginTop: 0 }}>
        Alle Klubs, deren Chancen sich spürbar ändern — auch ohne eigenes festgesetztes Spiel, denn
        jedes Ergebnis verschiebt zugleich die Rechnung der Konkurrenten. Unterschiede, die auch
        reiner Zufall erzeugen könnte, sind ausgeblendet (gerechnet mit {number(runs, 0)} Durchläufen).
      </p>
      {tabs.length ? <ResultTabs tabs={tabs} nameOf={nameOf} /> : (
        <p className="caption">
          Keine messbare Veränderung — die festgesetzten Ergebnisse verschieben die
          Wahrscheinlichkeiten nicht stärker, als es der Zufall auch könnte.
        </p>
      )}
    </div>
  );
}

/**
 * One tab per target, ARIA tablist/tab/tabpanel. The default tab is the one
 * holding the single largest |Δ| across all targets, so the headline effect is
 * visible without a click (§1). Each tab label previews its count and biggest
 * change, so the tab bar already tells the story.
 */
export function ResultTabs({ tabs, nameOf }) {
  // Default: the target holding the single largest |Δ| — the headline effect
  // without a click. Consumes the shared Tabs component (§TEXTMASS_DUELLE).
  const defaultId = tabs
    .slice()
    .sort((a, b) => Math.abs(b.top.delta) - Math.abs(a.top.delta))[0].id;

  const tabItems = tabs.map((t) => ({
    id: t.id,
    label: t.label,
    preview: `(${t.rows.length} · ${pp(t.top.delta)})`,
    content: (
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Klub</th>
              <th scope="col">vorher</th>
              <th scope="col">im Szenario</th>
              <th scope="col">Veränderung</th>
            </tr>
          </thead>
          <tbody>
            {t.rows.map((m) => (
              <tr key={m.clubId}>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(m.clubId)}</th>
                <td>{percent(m.baseline, 1)}</td>
                <td>{percent(m.modified, 1)}</td>
                <td>{pp(m.delta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  }));

  return <Tabs tabs={tabItems} defaultId={defaultId} idPrefix="whatif" ariaLabel="Ziele mit Veränderung" />;
}

// ---------------------------------------------------------------------------
//  Was muss passieren? — visible only when ≤ 5 matchdays remain.
// ---------------------------------------------------------------------------

function WasMussPassieren({ ctx, remaining }) {
  const { season, leagueConfig, nameOf } = ctx;
  const table = useMemo(() => currentTable(season, leagueConfig), [season, leagueConfig]);
  const rows = useMemo(() => table.map((r) => ({ clubId: r.clubId, pts: r.pts })), [table]);
  const zoneTargets = targetList(leagueConfig).filter((t) => t.from === 1);

  const [clubId, setClubId] = useState(table[0]?.clubId);
  const [targetId, setTargetId] = useState(zoneTargets[0]?.id);
  const target = zoneTargets.find((t) => t.id === targetId) ?? zoneTargets[0];

  const rem = useMemo(
    () => remaining.map((f) => ({ home: f.homeClubId, away: f.awayClubId })),
    [remaining],
  );
  const rules = {
    pointsForWin: leagueConfig.pointsForWin,
    pointsForDraw: leagueConfig.pointsForDraw,
    criteria: leagueConfig.tiebreakCriteria,
  };

  const result = useMemo(() => {
    if (!clubId || !target) return null;
    return analyseRequirement({ table: rows, remaining: rem, clubId, target, rules });
  }, [rows, rem, clubId, target]);

  return (
    <Card
      title="Was muss passieren?"
      textOnly
      caption={
        "Nur noch wenige Spieltage — hier steht, was ein Klub für ein Ziel braucht. Gerechnet wird "
        + "konservativ nach der Spielordnung: Der Vergleich wird bei Punktgleichheit zuungunsten des "
        + "Klubs entschieden, und für künftige Tore wird keine Obergrenze angenommen. Eine Garantie steht deshalb "
        + "nur bei strikter Punktetrennung."
      }
    >
      <div className="controls" style={{ marginBottom: "0.8rem", gap: "1rem", flexWrap: "wrap" }}>
        <label>
          Klub{" "}
          <select value={clubId ?? ""} onChange={(e) => setClubId(e.target.value)}>
            {table.map((r) => <option key={r.clubId} value={r.clubId}>{nameOf(r.clubId)}</option>)}
          </select>
        </label>
        <label>
          Ziel{" "}
          <select value={targetId ?? ""} onChange={(e) => setTargetId(e.target.value)}>
            {zoneTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {result ? <SolverResult result={result} target={target} nameOf={nameOf} /> : null}
    </Card>
  );
}

function SolverResult({ result, target, nameOf }) {
  if (result.kind === "guaranteed") {
    return (
      <p className="lead-sentence">
        {result.pStar} Punkte aus den letzten {result.ownRemaining} Spielen reichen für {target.label} —
        unabhängig davon, wie sie zustande kommen.
      </p>
    );
  }

  if (result.kind === "impossible") {
    return (
      <p className="lead-sentence">
        {target.label} ist nicht mehr aus eigener Kraft erreichbar, auch nicht mit Hilfe:{" "}
        {result.reason.replace(result.clubId, nameOf(result.clubId))}
      </p>
    );
  }

  return (
    <>
      <p className="lead-sentence">
        {target.label} nicht aus eigener Kraft. Nötig sind mindestens {result.necessary} eigene Punkte —
        und zusätzlich muss eine der folgenden Bedingungen eintreten:
      </p>
      {result.combinations.length ? (
        <ul className="scenario-list">
          {result.combinations.map((combo, i) => {
            const ok = verifyHelpCertificate(result.__state, combo).ok;
            return (
              <li key={i}>
                {combo.constraints
                  .map((c) => `${nameOf(c.clubId)} holt höchstens ${c.maxRemainingPoints} Punkte`)
                  .join(" und ")}
                {ok ? null : <span className="axis-label"> (Zertifikat ungültig — nicht anzeigen)</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="caption">Keine ausreichende Kombination gefunden.</p>
      )}
      {result.decidingFixture ? (
        <p className="caption">
          {result.decidingFixture.note.replace(result.decidingFixture.rivalId, nameOf(result.decidingFixture.rivalId))}
        </p>
      ) : null}
      {result.truncated ? (
        <p className="caption">Hinweis: {result.truncationNote}. Es können weitere Kombinationen existieren.</p>
      ) : null}
    </>
  );
}
