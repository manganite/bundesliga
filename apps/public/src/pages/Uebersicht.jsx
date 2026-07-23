import { useMemo } from "react";
import { Card, ProbList, Empty } from "../components/ui.jsx";
import { currentTable, targetList, tension, clinched, scoredMatches } from "../lib/season.js";
import { percent, number, weekdayDate } from "../lib/format.js";
import { playedFixtures } from "../lib/data.js";

/**
 * Übersicht — the V1 cards (§7):
 *   Titelrennen · Abstiegskampf · Platzierungszonen · Letzter Spieltag ·
 *   Spannungsindex · Bereits entschieden
 *
 * „Wichtigstes kommendes Spiel" and „Überflieger & Enttäuschungen" are
 * deliberately absent: they are V1.2, and they ship together with the artefact
 * schema extension they need. Cards with nothing to say hide entirely.
 */
export default function Uebersicht({ ctx }) {
  const { season, outlook, leagueConfig, nameOf, prematch, params, league, leagueLabel } = ctx;

  const table = useMemo(() => currentTable(season, leagueConfig), [season, leagueConfig]);
  const targets = targetList(leagueConfig);
  const byId = Object.fromEntries(targets.map((t) => [t.id, t]));

  const ranked = (targetId) => {
    if (!outlook?.probabilities?.[targetId]) return [];
    return Object.entries(outlook.probabilities[targetId])
      .map(([clubId, value]) => ({ clubId, value }))
      .sort((a, b) => b.value - a.value);
  };

  const titleTarget = byId.meister ?? byId.aufstieg;
  const dropTarget = byId.abstieg;

  const titleTension = titleTarget ? tension(outlook, titleTarget) : null;
  const dropTension = dropTarget ? tension(outlook, dropTarget) : null;

  const decided = useMemo(
    () => (outlook ? clinched(season, table, leagueConfig) : []),
    [season, table, leagueConfig, outlook],
  );
  const seasonOver = ctx.phase === "finished";

  const lastMatchday = useMemo(() => {
    const played = playedFixtures(season.fixtures);
    if (!played.length) return null;
    const md = Math.max(...played.map((f) => f.matchday));
    return { matchday: md, fixtures: played.filter((f) => f.matchday === md) };
  }, [season]);

  const surprises = useMemo(() => {
    if (!lastMatchday) return [];
    const scored = scoredMatches(season, prematch, params, league);
    const ids = new Set(lastMatchday.fixtures.map((f) => f.id));
    return scored.filter((s) => ids.has(s.fixture.id)).sort((a, b) => b.surprisal - a.surprisal);
  }, [season, prematch, params, league, lastMatchday]);

  if (!outlook) {
    return (
      <Empty>
        Für diese Saison liegt noch keine Simulation vor. Die Artefakte entstehen in der
        Pipeline und werden committet — die App rechnet sie nicht selbst nach.
      </Empty>
    );
  }

  return (
    <>
      <h2>Übersicht — {leagueLabel}</h2>
      <p className="page-intro">
        Der Stand der Saison in sechs Karten. Alle Wahrscheinlichkeiten stammen aus einer
        einzigen Simulation dieses Datenstands, damit keine zwei Seiten für dieselbe Zahl
        etwas Verschiedenes sagen.
      </p>

      <div className="card-grid">
        <Card
          title={titleTarget?.label === "Meister" ? "Titelrennen" : "Aufstiegsrennen"}
          when={Boolean(titleTarget) && ranked(titleTarget.id).some((e) => e.value > 0)}
          caption="Wahrscheinlichkeit, die Saison auf diesem Platz zu beenden."
        >
          <ProbList entries={ranked(titleTarget?.id)} nameOf={nameOf} limit={5} />
        </Card>

        <Card
          title="Abstiegskampf"
          when={Boolean(dropTarget) && ranked(dropTarget.id).some((e) => e.value > 0)}
          caption={`Direkter Abstieg (${dropTarget?.label}). Der Relegationsplatz wird separat ausgewiesen.`}
        >
          <ProbList entries={ranked(dropTarget?.id)} nameOf={nameOf} limit={5} />
        </Card>

        <Card
          title="Platzierungszonen"
          caption="Platzierungswahrscheinlichkeiten, keine Qualifikationen: wer tatsächlich europäisch spielt, hängt auch von Pokalsiegern ab — Daten, die diese App nicht hat."
        >
          <div className="table-scroll"><table className="data">
            <thead>
              <tr><th scope="col" className="left">Zone</th><th scope="col">Führend</th><th scope="col">Anteil</th></tr>
            </thead>
            <tbody>
              {targets.filter((t) => t.places <= 6).map((t) => {
                const top = ranked(t.id)[0];
                return (
                  <tr key={t.id}>
                    <th scope="row" className="left">{t.label}</th>
                    <td className="left">{top && top.value > 0 ? nameOf(top.clubId) : "–"}</td>
                    <td>{top ? percent(top.value) : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </Card>

        <Card
          title="Spannungsindex"
          when={Boolean(titleTension)}
          caption={
            `Effektive Zahl der Bewerber, exp(H). Für ${titleTarget?.label} ist der tiefste mögliche Wert 1,0 — dann ist alles entschieden.`
            + (dropTension
              ? ` Beim Abstieg sind es zwei Plätze: dort ist der tiefste mögliche Wert ${number(dropTension.floor, 1)} („${number(dropTension.floor, 1)} = vollständig entschieden“), nicht 1,0.`
              : "")
          }
        >
          <div className="table-scroll"><table className="data">
            <tbody>
              <tr>
                <th scope="row" className="left">{titleTarget?.label}</th>
                <td>{number(titleTension?.value, 1)}</td>
                <td style={{ color: "var(--text-muted)" }}>Minimum {number(titleTension?.floor, 1)}</td>
              </tr>
              {dropTension ? (
                <tr>
                  <th scope="row" className="left">effektive Zahl gefährdeter Klubs</th>
                  <td>{number(dropTension.value, 1)}</td>
                  <td style={{ color: "var(--text-muted)" }}>Minimum {number(dropTension.floor, 1)}</td>
                </tr>
              ) : null}
            </tbody>
          </table></div>
        </Card>

        <Card
          title={lastMatchday ? `Letzter Spieltag (${lastMatchday.matchday}.)` : "Letzter Spieltag"}
          when={Boolean(lastMatchday)}
          caption={
            surprises.length
              ? `Größte Überraschung: ${nameOf(surprises[0].fixture.homeClubId)} – ${nameOf(surprises[0].fixture.awayClubId)}, Überraschungswert ${number(surprises[0].surprisal, 1)} Bit.`
              : null
          }
        >
          <div className="table-scroll"><table className="data">
            <tbody>
              {lastMatchday?.fixtures.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>
                    {nameOf(f.homeClubId)} – {nameOf(f.awayClubId)}
                  </th>
                  <td>{f.gh}:{f.ga}</td>
                  <td style={{ color: "var(--text-muted)" }}>{weekdayDate(f.kickoff)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        <Card
          title="Bereits entschieden"
          when={decided.length > 0}
          caption="Nur mathematisch garantierte Aussagen, je Klub die stärkste. Bei Punktgleichheit wird der Vergleich zuungunsten des Klubs gewertet und keine Obergrenze für künftige Tore angenommen — deshalb steht „sicher“ hier etwas später, ist dafür aber wirklich sicher."
        >
          {seasonOver ? (
            <p style={{ margin: 0 }}>
              Die Saison ist gespielt — alle Plätze sind vergeben. Die Tabelle steht unter
              „Tabelle &amp; Prognose“.
            </p>
          ) : (
            <div className="table-scroll"><table className="data">
              <tbody>
                {decided.map((d) => (
                  <tr key={`${d.clubId}-${d.target.id}-${d.kind}`}>
                    <th scope="row" className="left" style={{ fontWeight: 500 }}>{nameOf(d.clubId)}</th>
                    <td className="left">
                      {d.kind === "secured"
                        ? `${d.target.label} sicher`
                        : d.viaPlayoff
                        // Not „nicht mehr möglich": the zone is gone, the season is not.
                        ? `${d.target.label} nur noch über die Relegation`
                        : `${d.target.label} nicht mehr möglich`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      </div>
    </>
  );
}
