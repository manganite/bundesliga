import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import { currentTable, predictFixture, scoredMatches } from "../lib/season.js";
import { percent, number, weekdayDate } from "../lib/format.js";

/**
 * Spieltage — matchday selector, results or predictions, the table snapshot at
 * that point, and that matchday's movers.
 *
 * „Wichtigstes kommendes Spiel" is V1.2 here too: it ships with the artefact
 * schema extension it needs, computed ONCE in the pipeline and consumed by both
 * this page and the Übersicht. It must not appear earlier.
 */
export default function Spieltage({ ctx }) {
  const { season, leagueConfig, nameOf, matchday, prematch, params, league, leagueLabel } = ctx;
  const matchdays = useMemo(
    () => [...new Set(season.fixtures.map((f) => f.matchday))].sort((a, b) => a - b),
    [season],
  );
  const [selected, setSelected] = useState(matchday);

  const fixtures = season.fixtures.filter((f) => f.matchday === selected);
  const scored = useMemo(
    () => scoredMatches(season, prematch, params, league),
    [season, prematch, params, league],
  );
  const scoredHere = scored.filter((s) => s.fixture.matchday === selected);

  // The table as it stood after this matchday.
  const snapshotTable = useMemo(() => {
    const upTo = {
      ...season,
      fixtures: season.fixtures.map((f) => (f.matchday <= selected ? f : { ...f, gh: undefined, ga: undefined })),
    };
    return currentTable(upTo, leagueConfig);
  }, [season, selected, leagueConfig]);

  const movers = useMemo(() => {
    if (selected <= 1) return [];
    const before = currentTable(
      { ...season, fixtures: season.fixtures.map((f) => (f.matchday <= selected - 1 ? f : { ...f, gh: undefined, ga: undefined })) },
      leagueConfig,
    );
    const rankBefore = new Map(before.map((r) => [r.clubId, r.rank]));
    return snapshotTable
      .map((r) => ({ clubId: r.clubId, change: (rankBefore.get(r.clubId) ?? r.rank) - r.rank }))
      .filter((m) => m.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);
  }, [season, selected, leagueConfig, snapshotTable]);

  return (
    <>
      <h2>Spieltage — {leagueLabel}</h2>
      <p className="page-intro">
        Ergebnisse und Prognosen je Spieltag, dazu die Tabelle, wie sie danach stand.
      </p>

      <div className="controls">
        <label htmlFor="matchday">Spieltag</label>
        <select id="matchday" value={selected} onChange={(e) => setSelected(Number(e.target.value))}>
          {matchdays.map((m) => <option key={m} value={m}>{m}. Spieltag</option>)}
        </select>
      </div>

      <div className="stack">
        <Card title={`${selected}. Spieltag`}>
          <div className="table-scroll"><table className="data">
            <thead>
              <tr>
                <th scope="col" className="left">Begegnung</th>
                <th scope="col">Ergebnis</th>
                <th scope="col">Heim / Remis / Auswärts</th>
                <th scope="col">Termin</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((f) => {
                const done = f.gh !== undefined;
                const pred = done
                  ? scoredHere.find((s) => s.fixture.id === f.id)?.prediction
                  : predictFixture(f, prematch, params, league)?.tendency;
                return (
                  <tr key={f.id}>
                    <th scope="row" className="left" style={{ fontWeight: 400 }}>
                      {nameOf(f.homeClubId)} – {nameOf(f.awayClubId)}
                    </th>
                    <td>{done ? `${f.gh}:${f.ga}` : "–"}</td>
                    <td>
                      {pred
                        ? `${percent(pred.homeWin, 0)} / ${percent(pred.draw, 0)} / ${percent(pred.awayWin, 0)}`
                        : "–"}
                    </td>
                    <td style={{ color: "var(--text-muted)" }}>{weekdayDate(f.kickoff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </Card>

        <Card
          title="Größte Überraschungen dieses Spieltags"
          when={scoredHere.length > 0}
          caption="Überraschungswert −log₂ P(tatsächliche Tendenz) unter der Vorhersage vor dem Spiel. Höher heißt überraschender."
        >
          <div className="table-scroll"><table className="data">
            <tbody>
              {[...scoredHere].sort((a, b) => b.surprisal - a.surprisal).slice(0, 3).map((s) => (
                <tr key={s.fixture.id}>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>
                    {nameOf(s.fixture.homeClubId)} – {nameOf(s.fixture.awayClubId)}
                  </th>
                  <td>{s.fixture.gh}:{s.fixture.ga}</td>
                  <td>{number(s.surprisal, 1)} Bit</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        <Card title="Bewegung in der Tabelle" when={movers.length > 0}>
          <div className="table-scroll"><table className="data">
            <tbody>
              {movers.map((m) => (
                <tr key={m.clubId}>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>{nameOf(m.clubId)}</th>
                  <td style={{ color: m.change > 0 ? "var(--good)" : "var(--bad)" }}>
                    {m.change > 0 ? `${m.change} Plätze hoch` : `${Math.abs(m.change)} Plätze runter`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        <Card title={`Tabelle nach dem ${selected}. Spieltag`}>
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
                {snapshotTable.map((r) => (
                  <tr key={r.clubId}>
                    <td className={r.sharedRank ? "shared-rank" : undefined}>{r.rank}.</td>
                    <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(r.clubId)}</th>
                    <td>{r.played}</td>
                    <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                    <td><strong>{r.pts}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {fixtures.length === 0 ? <Empty>Für diesen Spieltag liegen keine Spiele vor.</Empty> : null}
      </div>
    </>
  );
}
