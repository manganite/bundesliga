import { zoneOfRank, zoneColor, ZONE_TOKEN } from "../lib/zones.js";
import { number, integer, signedInt, signed } from "../lib/format.js";
import { perfColor } from "../lib/colors.js";
import { carriedRatingNote } from "../../../../packages/engine/src/dataState.mjs";

// ============================================================================
//  LeagueTable — ONE league standings table, three consumers
//  (§SZENARIO_TABELLE §3): Spieltage (real columns only), Tabelle & Prognose
//  (+ expected points and the 10–90 band), and the Szenario-Schlusstabelle
//  (+ the position-shift indicator). The zone stripe + legend, the shared-rank
//  marking and the carry-forward flag live HERE once, so a change lands in all
//  three at once.
//
//  The rows are handed in ALREADY ordered (the caller applies
//  orderWithinSharedRanks with the relevant expected points); the zone accent is
//  by DISPLAY position, so the stripe always matches the projected finish.
// ============================================================================

/**
 * @param {object}  p
 * @param {Array}   p.table        rows from currentTable, already ordered
 * @param {(id)=>string} p.nameOf
 * @param {Array}   p.zoneTargets  targetList(leagueConfig) — for stripe + legend
 * @param {object}  [p.points]     per-club { expected, p10, p90 } → prognosis columns
 * @param {Map}     [p.indicator]  clubId → { posDelta, ptsDelta } → indicator column
 * @param {Map}     [p.carriedByClub]  clubId → carry entry → ⚑ flag
 * @param {boolean} [p.legend=true]
 */
export default function LeagueTable({ table, nameOf, zoneTargets, points, indicator, carriedByClub, legend = true }) {
  const legendZones = zoneTargets.filter((t) => ZONE_TOKEN[t.id]);
  return (
    <>
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col" className="left">Klub</th>
              <th scope="col">Sp</th>
              <th scope="col">Tore</th>
              <th scope="col">Diff</th>
              <th scope="col">Pkt</th>
              {points ? <th scope="col">erw. Pkt</th> : null}
              {points ? <th scope="col">10–90 %</th> : null}
              {/* The indicator measures the shift in the EXPECTED-POINTS order, so
                  it sits at the RIGHT edge beside those columns — not next to #,
                  where it would read as a rank change (§SZENARIO_TABELLE_ABSCHLUSS). */}
              {indicator ? (
                <th scope="col">
                  Δ Platz
                  <span className="visually-hidden">
                    {" "}— Verschiebung in der Reihenfolge nach erwarteten Punkten gegenüber der unveränderten Prognose
                  </span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => {
              const pts = points?.[r.clubId];
              // Zone accent by DISPLAY position (the projected finish order).
              const zone = zoneOfRank(i + 1, zoneTargets);
              return (
                <tr key={r.clubId}>
                  <td
                    className={r.sharedRank ? "shared-rank zone-stripe" : "zone-stripe"}
                    style={zone ? { borderLeftColor: zone.color } : undefined}
                  >
                    {r.rank}.
                    {r.sharedRank ? <span className="visually-hidden"> geteilter Platz</span> : null}
                  </td>
                  <th scope="row" className="left" style={{ fontWeight: 500 }}>
                    {nameOf(r.clubId)}
                    {carriedByClub?.has(r.clubId) ? (
                      <span className="carried" title={carriedRatingNote(carriedByClub.get(r.clubId))}>
                        {" "}⚑<span className="visually-hidden">
                          {" "}{carriedRatingNote(carriedByClub.get(r.clubId))}
                        </span>
                      </span>
                    ) : null}
                  </th>
                  <td>{r.played}</td>
                  <td>{r.gf}:{r.ga}</td>
                  <td>{signedInt(r.gd)}</td>
                  <td><strong>{r.pts}</strong></td>
                  {points ? <td>{number(pts?.expected, 1)}</td> : null}
                  {points ? <td>{pts ? `${integer(pts.p10)}–${integer(pts.p90)}` : "–"}</td> : null}
                  {indicator ? <ShiftCell shift={indicator.get(r.clubId)} /> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {legend ? (
        <div className="zone-legend">
          {legendZones.map((t) => (
            <span key={t.id}>
              <span className="zone-dot" style={{ background: zoneColor(t.id) }} aria-hidden="true" />
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * The position-shift indicator cell (§SZENARIO_TABELLE §2.2): an arrow WITH the
 * place count (text, not colour alone — A11y), the intensity scaled by
 * |Δ expected points|, the title naming both numbers.
 *
 * Sign colour is DELIBERATELY allowed here and only here: climbing the table is
 * unambiguously good for the club, so `perfColor` fits. This is NOT the
 * probability-tab delta, where a „+" on Abstieg is bad and colour is banned —
 * that ban stays.
 */
function ShiftCell({ shift }) {
  if (!shift) return <td className="shift-cell" />;
  const { posDelta, ptsDelta } = shift;
  const arrow = posDelta > 0 ? `↑${posDelta}` : posDelta < 0 ? `↓${Math.abs(posDelta)}` : "·";
  const dir = posDelta > 0 ? "auf" : "ab";
  const mag = Math.abs(ptsDelta);
  // Intensity purely as a second signal; the arrow and number carry the meaning.
  const level = mag >= 3 ? 3 : mag >= 1 ? 2 : mag >= 0.2 ? 1 : 0;
  const title = posDelta === 0
    ? `Position unverändert, ${signed(ptsDelta, 1)} erwartete Punkte`
    : `${Math.abs(posDelta)} ${Math.abs(posDelta) === 1 ? "Platz" : "Plätze"} ${dir}, ${signed(ptsDelta, 1)} erwartete Punkte`;
  return (
    <td
      className={`shift-cell shift-l${level}`}
      style={posDelta !== 0 ? { color: perfColor(posDelta) } : undefined}
      title={title}
    >
      {arrow}
    </td>
  );
}
