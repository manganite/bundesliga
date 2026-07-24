import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import FixturePrediction, { favouriteOf } from "../components/FixturePrediction.jsx";
import DuelChip, { duelStripeColor } from "../components/DuelChip.jsx";
import LeagueTable from "../components/LeagueTable.jsx";
import Tabs from "../components/Tabs.jsx";
import { useScenario } from "../hooks/useScenario.js";
import {
  targetList,
  currentTable,
  orderWithinSharedRanks,
  predictFixture,
  fixtureModel,
  duelTargetsByFixture,
  scenarioFixtures,
  scenarioSeason,
  expectedShiftIndicator,
  computePreset,
} from "../lib/season.js";
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

// The what-if runs at a FIXED 2 000 runs (B = 20 batches of 100), no user choice
// (§UEBERSICHT_HEADER_FOOTER §2.5). The price is named, not hidden: the 2·SE
// floor grows ≈ 3× against the canonical 20 000, so small far-effects fall under
// „unverändert" more often. By key design the first 2 000 runs are a prefix of
// the canonical 20 000 (runCount is in no key, §3), so this is a shorter sample
// of the same distribution, not a different one.
const WHATIF_RUNS = 2000;
const WHATIF_BATCHES = 20;

function WasWaereWenn({ ctx, remaining }) {
  const { season, outlook, leagueConfig, league, nameOf, params, prematch } = ctx;
  const runs = WHATIF_RUNS;
  const batches = WHATIF_BATCHES;

  // fixtureId -> override. THE INPUTS; editing them never runs anything.
  //   { kind: "fixed", gh, ga }  — set to a chosen result (open OR played)
  //   { kind: "released" }        — a played match, simulated like an open one
  // Absent: the default — open stays simulated, played keeps its real result.
  const [overrides, setOverrides] = useState({});
  const [committed, setCommitted] = useState(null);
  const [message, setMessage] = useState(null);
  const overrideCount = Object.keys(overrides).length;

  // The whole fixture list, played AND open (§PRESETS §1). One matchday at a time.
  const matchdays = useMemo(
    () => [...new Set(season.fixtures.map((f) => f.matchday))].sort((a, b) => a - b),
    [season],
  );
  const firstOpen = remaining.length ? Math.min(...remaining.map((f) => f.matchday)) : matchdays[0];
  const [selectedMd, setSelectedMd] = useState(() => firstOpen);
  const visibleFixtures = season.fixtures
    .filter((f) => f.matchday === selectedMd)
    .sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));

  const duelBy = useMemo(() => duelTargetsByFixture(season, outlook, leagueConfig), [season, outlook, leagueConfig]);
  const modelOf = (fixture) => fixtureModel(fixture, prematch, params, league);
  const predictionOf = (fixture) => predictFixture(fixture, prematch, params, league);

  const request = useMemo(() => {
    if (!committed || !Object.keys(committed).length) return null;
    const clubs = season.clubs.map((c) => ({ clubId: c.clubId, rating: outlook.ratings[c.clubId] }));
    // The data-state transformation happens HERE, in the UI layer — no engine
    // change (§PRESETS §1). „released" removes BOTH goals, „fixed" sets both, so
    // the half-defined guard in the engine can never fire.
    const modifiedFixtures = scenarioFixtures(season.fixtures, committed);
    return {
      kind: "whatif",
      payload: {
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
  const stale = overrideCount > 0 && JSON.stringify(overrides) !== JSON.stringify(committed ?? {});
  const canRun = overrideCount > 0 && stale;

  const setOverride = (id, o) => setOverrides((prev) => ({ ...prev, [id]: o }));
  const clearOne = (id) => setOverrides((prev) => { const next = { ...prev }; delete next[id]; return next; });
  // „Alles zurücksetzen" räumt wirklich komplett: die Eingaben UND den zuletzt
  // gerechneten Stand, sonst bliebe das veraltete Ergebnis stehen (§2.4).
  const clearAll = () => { setOverrides({}); setCommitted(null); setMessage(null); };
  const runScenario = () => setCommitted({ ...overrides });

  const targets = targetList(leagueConfig);
  const overrideList = Object.keys(overrides)
    .map((id) => ({ fixture: season.fixtures.find((f) => f.id === id), o: overrides[id] }))
    .filter((x) => x.fixture);

  return (
    <Card title="Was-wäre-wenn">
      <Explainer />

      <PresetBar
        ctx={ctx}
        matchdays={matchdays}
        duelBy={duelBy}
        modelOf={modelOf}
        // „Anwenden & rechnen" (§SZENARIO_TABELLE §1): a preset fills the states
        // AND starts the run in one click. Manual single edits afterwards still
        // only touch `overrides`, so they dim and wait for „Szenario rechnen" —
        // the no-silent-autorun rule from the UX brief is untouched.
        onApply={(next, msg) => { setOverrides(next); setMessage(msg); setCommitted(next); }}
        overrides={overrides}
      />
      {message ? <p className="preset-message" role="status">{message}</p> : null}

      {overrideCount ? (
        <OverrideSummary overrideList={overrideList} nameOf={nameOf} onClearOne={clearOne} onClearAll={clearAll} />
      ) : null}

      <div className="controls" style={{ margin: "0.8rem 0 0.4rem" }}>
        <label>
          Spieltag{" "}
          <select value={selectedMd} onChange={(e) => setSelectedMd(Number(e.target.value))}>
            {matchdays.map((m) => <option key={m} value={m}>{m}. Spieltag</option>)}
          </select>
        </label>
      </div>

      <p className="caption" style={{ marginBottom: "0.3rem" }}>
        Hervorgehoben: direkte Duelle (beide Klubs ≥ 10 % auf dasselbe Ziel).
      </p>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Spiel</th>
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
                override={overrides[f.id]}
                duel={duelBy.get(f.id)}
                onFix={(gh, ga) => setOverride(f.id, { kind: "fixed", gh, ga })}
                onRelease={() => setOverride(f.id, { kind: "released" })}
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

      {outlook ? <ScenarioTable ctx={ctx} committed={committed} sim={sim} stale={stale} /> : null}

      {committed && Object.keys(committed).length
        ? <WhatIfResult sim={sim} targets={targets} nameOf={nameOf} runs={runs} stale={stale} />
        : null}
    </Card>
  );
}

/**
 * The scenario's simulated FINAL table, above the change tabs (§SZENARIO_TABELLE
 * §2). Real columns (Sp, Tore, Diff, Pkt) come from `currentTable` on the
 * TRANSFORMED data state — fixed and released fixtures show here; expected points
 * and the 10–90 band come from the scenario run; the position-shift indicator
 * compares against the PAIRED 2 000-run baseline (CRN), never the artefact.
 *
 * Base semantics (§2.3):
 *   - before the first run: the canonical-artefact defaults, NO indicator,
 *     identical to Tabelle & Prognose — the caption says so;
 *   - after a run: the scenario numbers with the indicator and the CRN caption;
 *   - stale: dimmed together with the tabs.
 */
export function ScenarioTable({ ctx, committed, sim, stale }) {
  const { season, outlook, leagueConfig, nameOf, carried = [] } = ctx;
  const zoneTargets = targetList(leagueConfig);
  const carriedByClub = new Map(carried.map((c) => [c.clubId, c]));

  const hasScenario = committed
    && Object.keys(committed).length
    && sim.status === "done"
    && sim.result?.points;

  const points = hasScenario ? sim.result.points : outlook.points;
  const indicator = hasScenario
    ? expectedShiftIndicator(sim.result.points, sim.result.basePoints)
    : undefined;
  const ranked = currentTable(
    hasScenario ? scenarioSeason(season, committed) : season,
    leagueConfig,
  );
  const table = orderWithinSharedRanks(ranked, points);
  const anyShared = table.some((r) => r.sharedRank);

  const caption = hasScenario
    ? "Simulierte Schlusstabelle des Szenarios. Vergleich gegen die unveränderte Prognose, gleiche Zufallszahlen."
    : "Noch kein Szenario — Standardprognose (kanonischer 20 000-Läufe-Lauf), inhaltsgleich mit Tabelle & Prognose."
      ;

  return (
    <div className={stale && hasScenario ? "whatif-result is-stale" : undefined} style={{ marginTop: "1rem" }}>
      <Card
        title="Simulierte Schlusstabelle"
        caption={caption
          + (anyShared
            ? " Auf geteilten Plätzen (Spielordnung) stehen die Klubs hier nach erwarteten Punkten."
            : "")}
      >
        <LeagueTable
          table={table}
          nameOf={nameOf}
          zoneTargets={zoneTargets}
          points={points}
          indicator={indicator}
          carriedByClub={carriedByClub}
        />
      </Card>
    </div>
  );
}

/** §1.6 + §1 honesty: the three states, and that ratings do not rewind. */
export function Explainer() {
  return (
    <>
      <p className="page-intro" style={{ marginBottom: "0.4rem" }}>
        Jedes offene Spiel ist zunächst <strong>simuliert</strong>: Sein Ergebnis wird in jedem
        Durchlauf neu ausgewürfelt — mal so, mal so, gemäß den Torraten beider Klubs. Setzt du ein
        Spiel <strong>fest</strong>, gilt stattdessen in allen Durchläufen genau dieses Ergebnis;
        ein bereits gespieltes Spiel kannst du <strong>freigeben</strong>, dann wird es wieder
        simuliert. Dann <strong>Szenario rechnen</strong>: Dieselbe Simulation läuft erneut, mit
        demselben Zufall — Veränderungen kommen so wirklich von deinen Ergebnissen und nicht vom
        Würfeln.
      </p>
      <p className="caption" style={{ marginTop: 0 }}>
        Ratings spulen nicht zurück — auch bei geänderten früheren Ergebnissen rechnet die
        Simulation mit den Ratings des aktuellen Datenstands.
      </p>
    </>
  );
}

// ---------------------------------------------------------------------------
//  Preset bar: Bereich × Rezept (§PRESETS §2).
// ---------------------------------------------------------------------------

const RECIPES = [
  { id: "forecast", label: "Wie prognostiziert" },
  { id: "global", label: "Absolut wahrscheinlichstes Ergebnis" },
  { id: "clubWins", label: "Verein gewinnt alles" },
  { id: "clubLoses", label: "Verein verliert alles" },
  { id: "surprise", label: "Nur Überraschungen" },
  { id: "reroll", label: "Neu auswürfeln" },
];

const RECIPE_CAPTION = {
  forecast: "Setzt jedes Spiel auf das wahrscheinlichste Ergebnis innerhalb der wahrscheinlichsten Tendenz.",
  global: "Setzt auf das absolut wahrscheinlichste Einzelergebnis — oft ein Remis (siehe Methodik, Schritt 2).",
  clubWins: "Setzt jedes Spiel des Vereins auf sein wahrscheinlichstes Ergebnis innerhalb der Siegregion dieses Vereins.",
  clubLoses: "Setzt jedes Spiel des Vereins auf sein wahrscheinlichstes Ergebnis innerhalb der Niederlagenregion dieses Vereins.",
  surprise: "Überraschung = der aus Modellsicht unwahrscheinlichste Ausgang, mit dessen wahrscheinlichstem Ergebnis.",
  reroll: "Offene Spiele zurück auf simuliert, gespielte werden freigegeben.",
};

export function PresetBar({ ctx, matchdays, duelBy, modelOf, onApply, overrides }) {
  const { season, nameOf } = ctx;
  const [area, setArea] = useState("open");
  const [recipe, setRecipe] = useState("forecast");
  const [club, setClub] = useState(season.clubs[0]?.clubId);
  const [areaMd, setAreaMd] = useState(matchdays[0]);

  const needsClub = area === "club" || recipe === "clubWins" || recipe === "clubLoses";
  const needsMd = area === "matchday";

  const apply = () => {
    const { overrides: next, message } = computePreset({
      fixtures: season.fixtures, overrides, area, recipe, club, areaMd, duelBy, modelOf,
    });
    onApply(next, message);
  };

  return (
    <div className="preset-bar">
      <label>
        Bereich{" "}
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="open">Alle offenen Spiele</option>
          <option value="played">Alle gespielten Spiele</option>
          <option value="matchday">Ein Spieltag</option>
          <option value="club">Ein Verein</option>
          <option value="duels">Direkte Duelle</option>
        </select>
      </label>
      {needsMd ? (
        <label>
          Spieltag{" "}
          <select value={areaMd} onChange={(e) => setAreaMd(Number(e.target.value))}>
            {matchdays.map((m) => <option key={m} value={m}>{m}.</option>)}
          </select>
        </label>
      ) : null}
      {needsClub ? (
        <label>
          Verein{" "}
          <select value={club} onChange={(e) => setClub(e.target.value)}>
            {season.clubs.map((c) => <option key={c.clubId} value={c.clubId}>{nameOf(c.clubId)}</option>)}
          </select>
        </label>
      ) : null}
      <label>
        Rezept{" "}
        <select value={recipe} onChange={(e) => setRecipe(e.target.value)}>
          {RECIPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <button type="button" onClick={apply}>Anwenden &amp; rechnen</button>
      <p className="caption preset-recipe-caption">{RECIPE_CAPTION[recipe]}</p>
    </div>
  );
}

/**
 * Overrides in force, shown above the table so nothing that is set or released is
 * ever off-screen (§1.1), across all matchdays.
 */
export function OverrideSummary({ overrideList, nameOf, onClearOne, onClearAll }) {
  return (
    <div className="fixed-summary">
      <strong>Im Szenario ({overrideList.length}):</strong>{" "}
      {overrideList.map(({ fixture, o }) => (
        <span key={fixture.id} className="fixed-chip">
          {o.kind === "fixed"
            ? `${nameOf(fixture.homeClubId)} ${o.gh}:${o.ga} ${nameOf(fixture.awayClubId)}`
            : `${nameOf(fixture.homeClubId)} – ${nameOf(fixture.awayClubId)} (freigegeben)`}
          <button type="button" className="chip-x" onClick={() => onClearOne(fixture.id)} aria-label="zurücksetzen">×</button>
        </span>
      ))}
      <button type="button" onClick={onClearAll}>alles zurücksetzen</button>
    </div>
  );
}

export function FixtureRow({ fixture, nameOf, prediction, override, duel, onFix, onRelease, onReset }) {
  const [editing, setEditing] = useState(false);
  const modal = prediction ? favouriteOf(prediction).modal : [0, 0];
  const played = fixture.gh !== undefined;
  const real = played ? `${fixture.gh}:${fixture.ga}` : null;
  // What „real" was, kept small whenever a played match is overridden (§1).
  const insteadOf = played && override ? <span className="instead-of"> statt real {real}</span> : null;

  return (
    <tr className={duel ? "duel-row" : undefined}>
      <th
        scope="row"
        className={duel ? "left zone-stripe" : "left"}
        style={{ fontWeight: 400, ...(duel ? { borderLeftColor: duelStripeColor(duel) } : {}) }}
      >
        {nameOf(fixture.homeClubId)} – {nameOf(fixture.awayClubId)}
        {duel ? <> <DuelChip targets={duel} /></> : null}
      </th>
      <td className="left">
        {editing ? (
          <ScorePicker
            home={nameOf(fixture.homeClubId)}
            away={nameOf(fixture.awayClubId)}
            initial={override?.kind === "fixed" ? [override.gh, override.ga] : modal}
            onConfirm={(gh, ga) => { onFix(gh, ga); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        ) : override?.kind === "fixed" ? (
          <span className="fixed-state"><strong>Festgesetzt: {override.gh}:{override.ga}</strong>{insteadOf}</span>
        ) : override?.kind === "released" ? (
          <span className="fixed-state"><strong>Freigegeben</strong> — wird simuliert{insteadOf}</span>
        ) : played ? (
          <span className="real-state">Real <strong>{real}</strong></span>
        ) : (
          <FixturePrediction prediction={prediction} />
        )}
      </td>
      <td>
        {editing ? null : override ? (
          <button type="button" onClick={onReset}>{played ? "zurück zu real" : "zurück zu simuliert"}</button>
        ) : played ? (
          <span style={{ display: "inline-flex", gap: "0.4rem" }}>
            <button type="button" onClick={onRelease}>Freigeben</button>
            <button type="button" onClick={() => setEditing(true)}>Festsetzen</button>
          </span>
        ) : (
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
        reiner Zufall erzeugen könnte, sind ausgeblendet — gerechnet mit {number(runs, 0)} Durchläufen,
        kleine Verschiebungen erscheinen dann als „unverändert“.
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
