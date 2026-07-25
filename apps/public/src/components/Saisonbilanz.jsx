import { Card } from "./ui.jsx";
import { currentTable, scoredMatches, targetList } from "../lib/season.js";
import { zoneColor } from "../lib/zones.js";
import { percent, number } from "../lib/format.js";

// ============================================================================
//  Saisonbilanz — the Übersicht of an ARCHIVE season (§V2b.1 §3). A finished
//  season has no forecast to make; what it has is a story. This carries the
//  outcome (champion, the decided zones, the relegation play-offs from G1), the
//  season's biggest surprise (surprisal maximum), and the most improbable moment
//  of the run — the eventual champion at its lowest title probability.
//
//  Every number is a fact of the season or a figure the model already produced;
//  nothing new is computed. Empty inputs render nothing (§7).
// ============================================================================

/** The champion's lowest title/promotion probability across the frozen timeline. */
function championLow(timeline, championId, targetId) {
  if (!timeline?.points?.length || !championId) return null;
  let low = null;
  for (const p of timeline.points) {
    const v = p.probabilities?.[targetId]?.[championId];
    if (v === undefined) continue;
    if (low === null || v < low.value) low = { matchday: p.matchday, value: v };
  }
  return low;
}

/** The relegation outcome lines relevant to this league, from the G1 record. */
function relegationLines(relegation, seasonYear, league) {
  const s = relegation?.seasons?.[String(seasonYear)];
  if (!s) return [];
  const boundaries = league === "bl1" ? ["bl1-bl2"] : ["bl1-bl2", "bl2-3liga"];
  const label = { "bl1-bl2": "Relegation Bundesliga / 2. Bundesliga", "bl2-3liga": "Relegation 2. Bundesliga / 3. Liga" };
  return boundaries
    .map((b) => (s[b] ? { boundary: b, label: label[b], ...s[b] } : null))
    .filter(Boolean);
}

export default function Saisonbilanz({ ctx }) {
  const { season, leagueConfig, nameOf, prematch, params, league, leagueLabel, timeline, relegation, config } = ctx;
  const table = currentTable(season, leagueConfig);
  const champion = table[0];
  // Only the DECISIVE zones belong in a season balance — not the broad
  // „Klassenerhalt" catch-all (rank 1–15), which would just list the 15 clubs
  // that stayed up. Anything spanning more than a third of the table is dropped.
  const clubCount = table.length;
  const zones = targetList(leagueConfig)
    .filter((t) => t.from != null && (t.to - t.from + 1) <= clubCount / 3);

  const scored = scoredMatches(season, prematch, params, league);
  const surprise = scored.length
    ? scored.reduce((m, s) => (s.surprisal > m.surprisal ? s : m))
    : null;
  // The title target is „Meister" in BL1 and „Aufstieg" in BL2.
  const titleTargetId = leagueConfig.targets?.meister ? "meister" : "aufstieg";
  const titleWord = titleTargetId === "meister" ? "den Titel" : "den Aufstieg";
  const low = championLow(timeline, champion?.clubId, titleTargetId);
  const relLines = relegationLines(relegation, season.season, league);
  const annotation = config?.annotation; // §5 [USER]: empty until content is supplied

  return (
    <>
      <h2>Saisonbilanz — {leagueLabel}</h2>
      <p className="page-intro">
        Wie diese abgeschlossene Saison ausging — und die unwahrscheinlichsten Momente auf dem Weg.
      </p>

      <div className="card-columns">
        <Card title="Ausgang der Saison">
          <table className="data">
            <tbody>
              {zones.map((z) => {
                const clubs = table.filter((r) => r.rank >= z.from && r.rank <= z.to);
                if (!clubs.length) return null;
                return (
                  <tr key={z.id}>
                    <th scope="row" className="left zone-stripe" style={{ borderLeftColor: zoneColor(z.id) ?? undefined }}>
                      {z.label}
                    </th>
                    <td className="left">{clubs.map((c) => nameOf(c.clubId)).join(", ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card
          title="Relegation"
          when={relLines.length > 0}
          caption="Ergebnis nach Verlängerung; entschieden per Tore, Auswärtstoren oder Elfmeterschießen."
        >
          <table className="data">
            <tbody>
              {relLines.map((r) => (
                <tr key={r.boundary}>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>{r.label}</th>
                  <td className="left">
                    <strong>{r.winner}</strong> setzte sich gegen {r.loser} durch ({r.aggregate})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title="Unwahrscheinlichster Moment"
          when={Boolean(low && champion)}
          caption="Der spätere Meister an seinem tiefsten Titel-Wahrscheinlichkeitspunkt der Saison — gerechnet mit eingefrorener Saisonstart-Stärke."
        >
          {low && champion ? (
            <p className="stat-line">
              <strong>{nameOf(champion.clubId)}</strong> stand nach dem {low.matchday}. Spieltag bei{" "}
              <strong>{percent(low.value, 1)}</strong> auf {titleWord} — und war es am Ende.
            </p>
          ) : null}
        </Card>

        <Card
          title="Größte Überraschung"
          when={Boolean(surprise)}
          caption="Höchster Überraschungswert −log₂ P(tatsächliche Tendenz) unter der Vorhersage vor dem Spiel."
        >
          {surprise ? (
            <p className="stat-line">
              {surprise.fixture.matchday}. Spieltag:{" "}
              <strong>{nameOf(surprise.fixture.homeClubId)} {surprise.fixture.gh}:{surprise.fixture.ga} {nameOf(surprise.fixture.awayClubId)}</strong>{" "}
              — {number(surprise.surprisal, 1)} Bit.
            </p>
          ) : null}
        </Card>

        {annotation ? (
          <Card title="Anmerkung" textOnly>
            <p>{annotation}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
