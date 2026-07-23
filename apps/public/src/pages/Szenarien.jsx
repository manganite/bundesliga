import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import { useScenario } from "../hooks/useScenario.js";
import { targetList } from "../lib/season.js";
import { remainingFixtures, toEngineFixtures } from "../lib/data.js";
import { currentTable } from "../lib/season.js";
import { analyseRequirement, verifyHelpCertificate } from "../../../../packages/engine/src/solver.mjs";
import { percent, number, weekdayDate } from "../lib/format.js";

// ============================================================================
//  Szenarien (§10, V2a) — the ONLY page with interactive tools.
//
//  Three tools, in the brief's order of certainty: what-if, Beispielsaison, and
//  „Was muss passieren?" (built and tested, shown only when ≤ 5 matchdays
//  remain). All state is session-only: no storage, no URL encoding.
// ============================================================================

const GRID_MAX = 10;
const SOLVER_MATCHDAY_THRESHOLD = 5;

export default function Szenarien({ ctx }) {
  const { season, outlook, leagueConfig, league, leagueLabel, nameOf, params, matchday } = ctx;
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

  // How many matchdays are still to come — the solver's visibility gate.
  const matchdaysRemaining = new Set(remaining.map((f) => f.matchday)).size;

  return (
    <>
      <h2>Szenarien — {leagueLabel}</h2>
      <p className="page-intro">
        Zum Durchspielen: eigene Ergebnisse setzen, eine mögliche Saison ziehen. Alles läuft im
        Browser und wird nirgends gespeichert.
      </p>

      <div className="stack">
        <WasWaereWenn ctx={ctx} remaining={remaining} />
        <Beispielsaison ctx={ctx} />
        {/* The solver renders ONLY when the season is close enough to decide.
            Earlier it is absent — not greyed, not teased (§7). */}
        {matchdaysRemaining <= SOLVER_MATCHDAY_THRESHOLD
          ? <WasMussPassieren ctx={ctx} remaining={remaining} />
          : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  1 · Was-wäre-wenn
// ---------------------------------------------------------------------------

function WasWaereWenn({ ctx, remaining }) {
  const { season, outlook, leagueConfig, league, nameOf, params } = ctx;
  const runs = outlook.runs ?? 20000;
  const batches = outlook.batches ?? 20;

  // fixtureId -> { gh, ga }. Session-only.
  const [fixed, setFixed] = useState({});
  const fixedCount = Object.keys(fixed).length;

  const request = useMemo(() => {
    if (!fixedCount) return null;
    const clubs = season.clubs.map((c) => ({ clubId: c.clubId, rating: outlook.ratings[c.clubId] }));
    const baselineFixtures = toEngineFixtures(season.fixtures);
    const modifiedFixtures = toEngineFixtures(
      season.fixtures.map((f) => (fixed[f.id] ? { ...f, gh: fixed[f.id].gh, ga: fixed[f.id].ga } : f)),
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
        baselineFixtures,
        modifiedFixtures,
      },
    };
  }, [fixed, fixedCount, season, outlook, league, leagueConfig, params, runs, batches]);

  const sim = useScenario(request);

  const setScore = (id, gh, ga) => setFixed((prev) => ({ ...prev, [id]: { gh, ga } }));
  const clearOne = (id) => setFixed((prev) => { const next = { ...prev }; delete next[id]; return next; });
  const clearAll = () => setFixed({});

  const targets = targetList(leagueConfig);

  return (
    <Card
      title="Was-wäre-wenn"
      caption={
        `Eigene Ergebnisse für einzelne offene Spiele festlegen; die übrigen werden simuliert. Die `
        + `Veränderung gegenüber der unveränderten Prognose beruht auf ${number(runs, 0)} Läufen mit `
        + `denselben Zufallszahlen — kleine Unterschiede unterhalb des Rauschens werden als `
        + `„unverändert“ ausgewiesen und nicht als Bewegung verkauft. Tendenz-Was-wäre-wenn (nur `
        + `Sieg/Remis/Niederlage ohne genaues Ergebnis) gibt es bewusst nicht.`
      }
    >
      <div className="controls" style={{ marginBottom: "0.6rem", justifyContent: "space-between" }}>
        <span>{fixedCount ? `${fixedCount} Spiel(e) festgelegt` : "Noch kein Spiel festgelegt"}</span>
        {fixedCount ? <button type="button" onClick={clearAll}>alles zurücksetzen</button> : null}
      </div>

      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">offenes Spiel</th>
              <th scope="col">Ergebnis</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {remaining.slice(0, 40).map((f) => (
              <tr key={f.id}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>
                  {nameOf(f.homeClubId)} – {nameOf(f.awayClubId)}
                  <span className="axis-label"> · {f.matchday}. Spieltag</span>
                </th>
                <td>
                  <ScorePicker
                    home={nameOf(f.homeClubId)}
                    away={nameOf(f.awayClubId)}
                    value={fixed[f.id]}
                    onChange={(gh, ga) => setScore(f.id, gh, ga)}
                  />
                </td>
                <td>
                  {fixed[f.id]
                    ? <button type="button" onClick={() => clearOne(f.id)}>zurück zu simuliert</button>
                    : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remaining.length > 40
        ? <p className="caption">Gezeigt sind die nächsten 40 offenen Spiele.</p>
        : null}

      {fixedCount ? (
        <WhatIfResult sim={sim} targets={targets} nameOf={nameOf} runs={runs} />
      ) : null}
    </Card>
  );
}

function ScorePicker({ home, away, value, onChange }) {
  const opts = Array.from({ length: GRID_MAX + 1 }, (_, i) => i);
  const gh = value?.gh ?? 0;
  const ga = value?.ga ?? 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
      <label className="visually-hidden">{home} Tore</label>
      <select value={gh} onChange={(e) => onChange(Number(e.target.value), ga)} aria-label={`${home} Tore`}>
        {opts.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span>:</span>
      <select value={ga} onChange={(e) => onChange(gh, Number(e.target.value))} aria-label={`${away} Tore`}>
        {opts.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </span>
  );
}

function WhatIfResult({ sim, targets, nameOf, runs }) {
  if (sim.status === "running" || sim.status === "idle") {
    return <p className="caption">Wird gerechnet …</p>;
  }
  if (sim.status === "error") {
    return <p className="caption">Konnte nicht gerechnet werden: {sim.error}</p>;
  }
  const { deltas } = sim.result;
  // The most-moved clubs, per target, above the noise floor. Nothing below 2·SE
  // is shown as a change — that is the honesty the whole machinery exists for.
  const movers = [];
  for (const t of targets) {
    const rows = Object.entries(deltas[t.id] ?? {})
      .map(([clubId, d]) => ({ clubId, ...d }))
      .filter((d) => d.significant)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
    for (const r of rows) movers.push({ target: t.label, ...r });
  }
  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return (
    <div className="table-scroll" style={{ marginTop: "0.8rem" }}>
      <table className="data">
        <thead>
          <tr>
            <th scope="col" className="left">Klub</th>
            <th scope="col" className="left">Ziel</th>
            <th scope="col">vorher</th>
            <th scope="col">im Szenario</th>
            <th scope="col">Veränderung</th>
          </tr>
        </thead>
        <tbody>
          {movers.length ? movers.map((m) => (
            <tr key={`${m.clubId}-${m.target}`}>
              <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(m.clubId)}</th>
              <td className="left">{m.target}</td>
              <td>{percent(m.baseline, 1)}</td>
              <td>{percent(m.modified, 1)}</td>
              <td>{m.delta >= 0 ? "+" : ""}{number(m.delta * 100, 1)} Pp.</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={5} className="left">
                Keine Veränderung über dem Rauschen — die festgelegten Ergebnisse verschieben die
                Wahrscheinlichkeiten nicht messbar (bei {number(runs, 0)} Läufen).
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  2 · Beispielsaison
// ---------------------------------------------------------------------------

function Beispielsaison({ ctx }) {
  const { season, outlook, league, leagueConfig, nameOf, params } = ctx;
  const runs = outlook.runs ?? 20000;
  const [runIndex, setRunIndex] = useState(0);

  const request = useMemo(() => ({
    kind: "sample",
    payload: {
      seasonId: `${season.season}-${league}`,
      league,
      clubs: season.clubs.map((c) => ({ clubId: c.clubId, rating: outlook.ratings[c.clubId] })),
      fixtures: toEngineFixtures(season.fixtures),
      params: params.params,
      rules: {
        pointsForWin: leagueConfig.pointsForWin,
        pointsForDraw: leagueConfig.pointsForDraw,
        criteria: leagueConfig.tiebreakCriteria,
      },
      runIndex,
    },
  }), [season, outlook, league, leagueConfig, params, runIndex]);

  const sim = useScenario(request);
  const nextSample = () => setRunIndex((i) => (i + 1) % runs);

  return (
    <Card
      title="Beispielsaison"
      caption={
        `Eine mögliche Saison — keine Prognose. Jedes offene Spiel bekommt ein gezogenes Ergebnis, `
        + `daraus die Abschlusstabelle. Der Laufindex macht die Ziehung reproduzierbar: „Lauf #${runIndex + 1} `
        + `von ${number(runs, 0)}“ ist genau die ${runIndex + 1}. Stichprobe aus der Verteilung, immer dieselbe.`
      }
    >
      <div className="controls" style={{ marginBottom: "0.6rem", justifyContent: "space-between" }}>
        <span>Lauf #{runIndex + 1} von {number(runs, 0)}</span>
        <button type="button" onClick={nextSample}>Neue Beispielsaison</button>
      </div>
      <SampleResult sim={sim} season={season} nameOf={nameOf} />
    </Card>
  );
}

function SampleResult({ sim, season, nameOf }) {
  if (sim.status !== "done" || !sim.result) return <p className="caption">Wird gezogen …</p>;
  const { table, scorelines } = sim.result;
  const drawn = scorelines.filter((s) => !s.played);

  return (
    <>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="left">Klub</th>
              <th scope="col">Sp</th>
              <th scope="col">Diff</th>
              <th scope="col">Pkt</th>
            </tr>
          </thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.clubId}>
                <td className={r.sharedRank ? "shared-rank" : undefined}>{r.rank}.</td>
                <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                <td>{r.played}</td>
                <td>{r.gd > 0 ? "+" : ""}{r.gd}</td>
                <td><strong>{r.pts}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="caption" style={{ marginTop: "0.8rem" }}>
        Gezogene Ergebnisse dieser Beispielsaison (echte Ergebnisse sind hervorgehoben):
      </p>
      <div className="table-scroll">
        <table className="data">
          <tbody>
            {drawn.slice(0, 18).map((s) => (
              <tr key={s.id}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>
                  {nameOf(s.home)} – {nameOf(s.away)}
                </th>
                <td className="drawn-score">{s.gh}:{s.ga}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {drawn.length > 18 ? <p className="caption">… und {drawn.length - 18} weitere gezogene Spiele.</p> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
//  3 · Was muss passieren? — visible only when ≤ 5 matchdays remain.
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
      caption={
        "Nur noch wenige Spieltage — hier steht, was ein Klub für ein Ziel braucht. Gerechnet wird "
        + "konservativ nach der Spielordnung: bei Punktgleichheit zählt der Vergleich zuungunsten des "
        + "Klubs, und für künftige Tore wird keine Obergrenze angenommen. Eine Garantie steht deshalb "
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

      {result ? <SolverResult result={result} rows={rows} target={target} nameOf={nameOf} /> : null}
    </Card>
  );
}

function SolverResult({ result, rows, target, nameOf }) {
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

  // kind === "help"
  return (
    <>
      <p className="lead-sentence">
        {target.label} nicht aus eigener Kraft. Nötig sind mindestens {result.necessary} eigene Punkte —
        und zusätzlich muss eine der folgenden Bedingungen eintreten:
      </p>
      {result.combinations.length ? (
        <ul className="scenario-list">
          {result.combinations.map((combo, i) => {
            // RE-VERIFY the certificate here, in the view, so the page never
            // shows a combination it has not itself checked.
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
