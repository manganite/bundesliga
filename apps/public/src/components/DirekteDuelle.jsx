import { Card } from "./ui.jsx";
import Tabs from "./Tabs.jsx";
import { targetList } from "../lib/season.js";
import { DUEL_ARCHIVE_CAPTION, DUEL_PLAYED_NOTE } from "../lib/archive.js";
import { percent } from "../lib/format.js";

// ============================================================================
//  „Direkte Duelle" — one tab per target (§TEXTMASS_DUELLE), over the SAME tab
//  component the what-if result table uses.
//
//  Two worlds per tab (§DUELLE_ERGEBNISSE): „Anstehend" (remaining duels from the
//  outlook) and „Gespielt" (the season's past duels from the timeline derivation,
//  each with its real result). Empty sections hide (§7): pre-season shows only
//  „Anstehend", the finished season only „Gespielt". The pre-match percentages
//  stay beside the result — what was at stake, and how it ended.
//
//  The clubId already IS the short name the tables want (Bayern, Stuttgart, St.
//  Pauli …); nameOf() would give the full name, too long for the compact value.
// ============================================================================

/** „Bayern 95,1 % · Stuttgart 38,5 %" — the two values, each tied to its club. */
function DuelValue({ duel }) {
  return (
    <span className="duel-value">
      <strong>{duel.home}</strong> {percent(duel.pHome)} · <strong>{duel.away}</strong> {percent(duel.pAway)}
    </span>
  );
}

function Section({ title, rows, showResult }) {
  if (!rows.length) return null;
  return (
    <div className="duel-section">
      <h4 className="duel-section-title">{title}</h4>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col" className="left">Spieltag</th>
              <th scope="col" className="left">Duell</th>
              {showResult ? <th scope="col">Ergebnis</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.fixtureId}>
                <th scope="row" className="left" style={{ fontWeight: 400 }}>
                  {d.matchday !== null ? `${d.matchday}. Spieltag` : "—"}
                </th>
                <td className="left"><DuelValue duel={d} /></td>
                {showResult ? <td><strong>{d.result.gh}:{d.result.ga}</strong></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const byTargetMap = (list) => {
  const m = new Map();
  for (const d of list) { if (!m.has(d.target)) m.set(d.target, []); m.get(d.target).push(d); }
  return m;
};

export default function DirekteDuelle({ pending = [], played = [], leagueConfig, nameOf, isArchive = false }) {
  if (!pending.length && !played.length) return null; // §7: nothing to say → hide.

  const pendingBy = byTargetMap(pending);
  const playedBy = byTargetMap(played);
  // „Anstehend": hottest first (min(P) desc), matchday breaks ties.
  const sortPending = (a, b) => b.heat - a.heat || (a.matchday ?? 0) - (b.matchday ?? 0);
  // „Gespielt": the season as a story. Archive keeps chronological ASCENDING
  // (§ARCHIV_DUELLE); a live card shows the most recent first (DESCENDING).
  const sortPlayed = isArchive
    ? (a, b) => (a.matchday ?? 0) - (b.matchday ?? 0)
    : (a, b) => (b.matchday ?? 0) - (a.matchday ?? 0);

  const order = targetList(leagueConfig);
  const groups = order
    .filter((t) => pendingBy.has(t.id) || playedBy.has(t.id))
    .map((t) => ({
      id: t.id,
      label: t.label,
      pending: (pendingBy.get(t.id) ?? []).slice().sort(sortPending),
      played: (playedBy.get(t.id) ?? []).slice().sort(sortPlayed),
    }));

  // The headline tab: the one with the single most brisant duel across both
  // sections (largest heat) — the same rule as the scenario tabs.
  const heatOf = (g) => Math.max(...[...g.pending, ...g.played].map((d) => d.heat));
  const defaultId = groups.slice().sort((a, b) => heatOf(b) - heatOf(a))[0].id;

  const tabs = groups.map((g) => ({
    id: g.id,
    label: g.label,
    preview: `(${g.pending.length + g.played.length})`,
    content: (
      <>
        <Section title="Anstehend" rows={g.pending} showResult={false} />
        <Section title="Gespielt" rows={g.played} showResult />
      </>
    ),
  }));

  const caption = isArchive
    ? DUEL_ARCHIVE_CAPTION
    : `Verbleibende Spiele, in denen beide Klubs mindestens 10 % Chance auf dasselbe Ziel haben. ${DUEL_PLAYED_NOTE}`;

  return (
    <Card
      title="Direkte Duelle"
      caption={caption}
      method={
        <p className="caption" style={{ marginTop: "0.5rem" }}>
          Ein Tab je Ziel; „Anstehend" nach dem kleineren der beiden Werte (ein Duell ist am heißesten,
          wenn beide Klubs im Rennen sind), „Gespielt" nach Spieltag. Die Schwelle von 10 % ist die
          θ-Regel aus §4; die Prozente eines gespielten Duells sind die vor seinem Spieltag.
        </p>
      }
    >
      <Tabs tabs={tabs} defaultId={defaultId} idPrefix="duelle" ariaLabel="Ziele mit direkten Duellen" />
    </Card>
  );
}
