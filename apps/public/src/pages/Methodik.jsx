import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import FixturePrediction from "../components/FixturePrediction.jsx";
import { useScenario } from "../hooks/useScenario.js";
import { predictFixture } from "../lib/season.js";
import { remainingFixtures, toEngineFixtures } from "../lib/data.js";
import { number, signedInt } from "../lib/format.js";

// ============================================================================
//  Methodik — „So entsteht die Prognose" (SZENARIEN_UX §2).
//
//  A four-step narrative that reuses only outputs the app already computes; it
//  adds no engine function and no new number. It carries exactly ONE
//  illustrative widget, the Beispielsaison, which analyses nothing and changes
//  nothing — the §10 refinement: analytic interaction stays on Szenarien, this
//  page only SHOWS.
// ============================================================================

export default function Methodik({ ctx }) {
  const { season, outlook, leagueLabel, params, prematch, league } = ctx;

  return (
    <>
      <h2>So entsteht die Prognose — {leagueLabel}</h2>
      <p className="page-intro">
        Von einem Rating zu 20 000 durchgespielten Saisons, in vier Schritten. Jede Zahl hier stammt
        aus derselben Simulation wie die übrigen Seiten.
      </p>

      <div className="stack">
        <StepStaerke ctx={ctx} />
        <StepEinSpiel season={season} prematch={prematch} params={params} league={league} />
        {outlook && params?.params
          ? <StepEineSaison ctx={ctx} />
          : (
            <Card title="3 · Eine Saison">
              <Empty>Die Beispielsaison braucht die aktuelle Prognoserechnung; sie liegt noch nicht vor.</Empty>
            </Card>
          )}
        <StepVieleSaisons runs={outlook?.runs} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
//  1 · Stärke
// ---------------------------------------------------------------------------

function StepStaerke() {
  return (
    <Card title="1 · Stärke" textOnly>
      <p className="methodik-step">
        Als Eingabe dienen die Elo-Ratings von <a href="http://clubelo.com/" rel="noreferrer">clubelo.com</a> —
        eine Zahl je Klub für die aktuelle Spielstärke. Wir kennen die wahre Stärke aber nicht exakt:
        Jede simulierte Saison nimmt deshalb eine leicht andere an, gesteuert von einer festen
        Streuung um das Rating. Diese Streuung bildet unser Unwissen über die Stärke ab — der Zufall
        eines einzelnen Spiels kommt erst in Schritt 2.
      </p>
      <p className="caption">
        Wie aktuell die verwendeten Ratings je Spiel waren, steht auf der{" "}
        <a href="#/modellguete">Modellgüte-Seite</a> unter „Rating-Aktualität“.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  2 · Ein Spiel — the live predictMatch output of the next real fixture.
// ---------------------------------------------------------------------------

export function StepEinSpiel({ season, prematch, params, league }) {
  const nextFixture = useMemo(() => {
    const remaining = remainingFixtures(season.fixtures)
      .slice()
      .sort((a, b) => String(a.kickoff).localeCompare(String(b.kickoff)));
    return remaining[0] ?? null;
  }, [season]);

  const prediction = nextFixture ? predictFixture(nextFixture, prematch, params, league) : null;
  const nameOf = useMemo(() => {
    const m = new Map(season.clubs.map((c) => [c.clubId, c.name]));
    return (id) => m.get(id) ?? id;
  }, [season]);

  return (
    <Card title="2 · Ein Spiel" textOnly>
      <p className="methodik-step">
        Aus den beiden Ratings ergeben sich zwei erwartete Torraten; daraus zieht das Modell ein
        Ergebnis (Poisson, mit einer kleinen Korrektur für knappe Ergebnisse nach Dixon-Coles).
        Ein Favorit gewinnt darum nicht jedes Spiel — auch bei klaren Wahrscheinlichkeiten fällt
        jedes Ergebnis einzeln. Eine Eigenheit dabei: Das wahrscheinlichste Einzelergebnis ist oft
        ein Remis wie das 1:1 — selbst wenn ein Sieg die wahrscheinlichere Tendenz ist. Siege
        verteilen ihre Wahrscheinlichkeit auf viele mögliche Ergebnisse (1:0, 2:0, 2:1 …), Remis
        bündeln sie auf wenige. Angezeigt wird deshalb überall das wahrscheinlichste Ergebnis
        innerhalb der wahrscheinlichsten Tendenz. So sieht die Vorhersage für das nächste anstehende
        Spiel aus:
      </p>
      {nextFixture && prediction ? (
        <p className="lead-sentence">
          {nameOf(nextFixture.homeClubId)} – {nameOf(nextFixture.awayClubId)}:{" "}
          <FixturePrediction prediction={prediction} prefix={null} />
        </p>
      ) : (
        <p className="caption">Derzeit steht kein Spiel zur Vorhersage an.</p>
      )}
      <p className="caption">
        Genau diese Darstellung erscheint im Was-wäre-wenn für jedes noch nicht festgesetzte Spiel.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
//  3 · Eine Saison — the Beispielsaison exhibit.
// ---------------------------------------------------------------------------

function StepEineSaison({ ctx }) {
  const { season, outlook, league, leagueConfig, nameOf, params } = ctx;
  const runs = outlook.runs ?? 20000;

  // The run index is displayed AND editable (§2.2): typing an index reproduces
  // exactly that draw. Session-only.
  const [runIndex, setRunIndex] = useState(0);
  const [entry, setEntry] = useState("1");

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

  const roll = () => {
    // A different sample. Deterministic per index; advancing by a large stride
    // makes each roll visibly different without repeating soon.
    const next = (runIndex + 4382) % runs;
    setRunIndex(next);
    setEntry(String(next + 1));
  };
  const applyEntry = () => {
    const n = Number(entry.replace(/\D/g, ""));
    if (Number.isFinite(n) && n >= 1 && n <= runs) setRunIndex(n - 1);
  };

  return (
    <Card
      title="3 · Eine Saison"
      caption={
        "Das ist EIN vollständiger Durchlauf — so verschieden können Saisons ausgehen, die alle zur "
        + "aktuellen Prognose passen. Der Laufindex macht die Ziehung reproduzierbar; dieselbe Nummer "
        + "ergibt immer dieselbe Saison."
      }
    >
      <div className="controls" style={{ marginBottom: "0.6rem", gap: "0.8rem", flexWrap: "wrap" }}>
        <label>
          Lauf #{" "}
          <input
            type="text"
            inputMode="numeric"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            onBlur={applyEntry}
            onKeyDown={(e) => { if (e.key === "Enter") applyEntry(); }}
            aria-label="Laufnummer"
            style={{ width: "6rem" }}
          />
          {" "}von {number(runs, 0)}
        </label>
        <button type="button" onClick={roll}>Neue Beispielsaison auswürfeln</button>
      </div>
      <SampleResult sim={sim} nameOf={nameOf} />
    </Card>
  );
}

export function SampleResult({ sim, nameOf }) {
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
                <td>{signedInt(r.gd)}</td>
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
            {scorelines.slice(0, 18).map((s) => (
              <tr key={s.id}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>
                  {nameOf(s.home)} – {nameOf(s.away)}
                </th>
                <td className={s.played ? "real-score" : "drawn-score"}>
                  {s.gh}:{s.ga}{s.played ? <span className="visually-hidden"> (echtes Ergebnis)</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {drawn.length > 18 ? <p className="caption">… und weitere Spiele.</p> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
//  4 · 20 000 Saisons
// ---------------------------------------------------------------------------

function StepVieleSaisons({ runs }) {
  return (
    <Card title={`4 · ${number(runs ?? 20000, 0)} Saisons`} textOnly>
      <p className="methodik-step">
        Der dritte Schritt wird {number(runs ?? 20000, 0)}-mal wiederholt. Aus dem Anteil der
        Durchläufe, in denen ein Klub ein Ziel erreicht, werden die Prozente aller übrigen Seiten.
        Die Prognose verändert sich durch neue Ergebnisse und aktualisierte Ratings; die
        Modellparameter bleiben während der Saison unverändert.
      </p>
      <p className="caption">
        Ob die Prozente stimmen, prüft die <a href="#/modellguete">Kalibrierung</a>. Wie sich die
        Wahrscheinlichkeiten über die Saison bewegen, zeigt der <a href="#/verlauf">Verlauf</a>.
      </p>
    </Card>
  );
}
