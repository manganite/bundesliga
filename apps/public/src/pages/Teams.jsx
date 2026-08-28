import { useMemo, useState } from "react";
import { Card, Empty } from "../components/ui.jsx";
import Chart from "../components/Chart.jsx";
import ChartLegend from "../components/ChartLegend.jsx";
import ChartTooltip from "../components/ChartTooltip.jsx";
import { HalfSeasonMarker, HitAreas, useActivePoint, YAxisTitle } from "../components/ChartInteractive.jsx";
import { currentTable, scoredMatches, targetList } from "../lib/season.js";
import { performanceVsExpectation, zonePartition } from "../../../../packages/engine/src/metrics.mjs";
import { perfColor } from "../lib/colors.js";
import { zoneColor, zoneOfRank } from "../lib/zones.js";
import { percent, number, signed, signedInt, weekdayDate } from "../lib/format.js";
import { remainingFixtures } from "../lib/data.js";
import { HALVES, halfBoundary, halfSeasonBalance, performanceByHalf } from "../lib/halbserie.js";
import { HALBSERIE_ERWARTUNG_NOTE } from "../lib/archive.js";
import { carriedRatingNote } from "../../../../packages/engine/src/dataState.mjs";

export default function Teams({ ctx }) {
  const { season, outlook, timeline, leagueConfig, nameOf, prematch, params, league, carried = [], leagueLabel } = ctx;

  const table = useMemo(() => currentTable(season, leagueConfig), [season, leagueConfig]);
  const [clubId, setClubId] = useState(() => table[0]?.clubId ?? season.clubs[0]?.clubId);

  const scored = useMemo(
    () => scoredMatches(season, prematch, params, league),
    [season, prematch, params, league],
  );

  const perf = useMemo(() => {
    const rules = { pointsForWin: leagueConfig.pointsForWin, pointsForDraw: leagueConfig.pointsForDraw };
    const mine = scored.filter((s) => s.fixture.homeClubId === clubId || s.fixture.awayClubId === clubId);
    if (!mine.length) return null;
    const rows = mine.map((s) => {
      const atHome = s.fixture.homeClubId === clubId;
      const gf = atHome ? s.fixture.gh : s.fixture.ga;
      const ga = atHome ? s.fixture.ga : s.fixture.gh;
      const points = gf > ga ? rules.pointsForWin : gf === ga ? rules.pointsForDraw : 0;
      return {
        points,
        pWin: atHome ? s.prediction.homeWin : s.prediction.awayWin,
        pDraw: s.prediction.draw,
      };
    });
    // Normalised by this club's OWN matches played — clubs do not all have the
    // same number during a matchday or after a postponement (§7).
    return performanceVsExpectation(rows, rules);
  }, [scored, clubId, leagueConfig]);

  const provenance = useMemo(() => {
    const mine = scored.filter((s) => s.fixture.homeClubId === clubId || s.fixture.awayClubId === clubId);
    const backfilled = mine.filter((s) => s.provenance === "backfilled").length;
    return { total: mine.length, backfilled };
  }, [scored, clubId]);

  const remaining = remainingFixtures(season.fixtures)
    .filter((f) => f.homeClubId === clubId || f.awayClubId === clubId);

  // §2 — the real balance per half, and §5 — over/under expectation per half.
  // Both are the existing figures over a filtered match set; neither computes a
  // new metric (the ranking and `performanceVsExpectation` stay in the engine).
  const boundary = halfBoundary(leagueConfig);
  const balances = useMemo(() => {
    if (!boundary) return null;
    const byHalf = Object.fromEntries(
      HALVES.map(({ id }) => [id, halfSeasonBalance(season, leagueConfig, id)?.get(clubId)]),
    );
    // Both halves must have matches. With only the first half played „Gesamt"
    // and „Hinrunde" are the same row twice — a split that does not split.
    if (!(byHalf.hin?.played > 0) || !(byHalf.rueck?.played > 0)) return null;
    return HALVES.map(({ id, label }) => ({ id, label, ...byHalf[id] }));
  }, [season, leagueConfig, boundary, clubId]);

  const halfPerf = useMemo(() => {
    if (!boundary) return null;
    const row = performanceByHalf(scored, leagueConfig).get(clubId);
    // The card only earns its place once BOTH halves have matches — with one
    // half played it would merely repeat „Leistung gegenüber der Erwartung".
    return row?.hin && row?.rueck ? row : null;
  }, [scored, leagueConfig, boundary, clubId]);

  const positions = outlook?.positionDistribution?.[clubId] ?? null;

  // The zone partition per matchday for this club (§CHART_AUSBAU §2.1): each
  // point is the disjoint spread Meister … Abstieg, summing to 1.
  const zoneSeries = useMemo(() => {
    if (!timeline?.points?.length) return null;
    const zones = targetList(leagueConfig);
    return timeline.points.map((p) => {
      const prob = {};
      for (const z of zones) prob[z.id] = p.probabilities?.[z.id]?.[clubId] ?? 0;
      return { matchday: p.matchday, bands: zonePartition(prob, zones) };
    });
  }, [timeline, clubId, leagueConfig]);

  return (
    <>
      <h2>Teams — {leagueLabel}</h2>
      <p className="page-intro">Ein Klub im Detail: Aussichten, Restprogramm und Leistung gegenüber der Erwartung.</p>

      <div className="controls">
        <label htmlFor="club">Klub</label>
        <select id="club" value={clubId} onChange={(e) => setClubId(e.target.value)}>
          {table.map((r) => <option key={r.clubId} value={r.clubId}>{nameOf(r.clubId)}</option>)}
        </select>
      </div>

      <div className="stack">
        {carried.find((c) => c.clubId === clubId) ? (
          <p className="banner warn" role="status">
            {carriedRatingNote(carried.find((c) => c.clubId === clubId))}
          </p>
        ) : null}

        <Card
          title="Wo die Saison endet"
          when={Boolean(positions)}
          caption="Verteilung der Endplatzierung über alle simulierten Saisons."
        >
          {positions ? <PositionBars positions={positions} clubName={nameOf(clubId)} zones={targetList(leagueConfig)} /> : null}
        </Card>

        <Card
          title="Leistung gegenüber der Erwartung"
          when={Boolean(perf)}
          caption={
            "Tatsächliche Punkte minus erwartete Punkte aus der Vorhersage vor jedem Spiel, geteilt durch die "
            + "eigenen absolvierten Spiele."
            + (provenance.backfilled === provenance.total && provenance.total > 0
              ? " Diese Werte beruhen vollständig auf nachträglich rekonstruierten Ratings — sie sind eine rückblickende Modellrechnung, nicht das, was die App damals gesagt hätte."
              : provenance.backfilled > 0
                ? ` ${provenance.backfilled} von ${provenance.total} Spielen beruhen auf nachträglich rekonstruierten Ratings.`
                : "")
          }
        >
          {perf ? (
            <div className="table-scroll"><table className="data">
              <tbody>
                <tr><th scope="row" className="left">Punkte tatsächlich</th><td>{number(perf.actual, 0)}</td></tr>
                <tr><th scope="row" className="left">Punkte erwartet</th><td>{number(perf.expected, 1)}</td></tr>
                <tr>
                  <th scope="row" className="left">Differenz je Spiel</th>
                  <td style={{ color: perfColor(perf.perMatch) }}>
                    {signed(perf.perMatch, 2)}
                  </td>
                </tr>
                <tr><th scope="row" className="left">Spiele</th><td>{perf.played}</td></tr>
              </tbody>
            </table></div>
          ) : null}
        </Card>

        <Card
          title="Bilanz je Halbserie"
          when={Boolean(balances)}
          caption="Die echten Ergebnisse, nach Hinrunde und Rückrunde getrennt — keine Prognose."
        >
          {balances ? (
            <div className="table-scroll"><table className="data">
              <thead>
                <tr>
                  <th scope="col" className="left">Zeitraum</th>
                  <th scope="col">Sp</th>
                  <th scope="col">S/U/N</th>
                  <th scope="col">Tore</th>
                  <th scope="col">Diff</th>
                  <th scope="col">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.id}>
                    <th scope="row" className="left" style={{ fontWeight: b.id === "gesamt" ? 500 : 400 }}>
                      {b.label}
                    </th>
                    <td>{b.played}</td>
                    <td>{b.won}/{b.drawn}/{b.lost}</td>
                    <td>{b.gf}:{b.ga}</td>
                    <td>{signedInt(b.gd)}</td>
                    <td>{b.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : null}
        </Card>

        <Card
          title="Über die Halbserien"
          when={Boolean(halfPerf)}
          caption={HALBSERIE_ERWARTUNG_NOTE}
          method={
            <p className="caption" style={{ marginTop: "0.5rem" }}>
              Je Halbserie dieselbe Rechnung wie oben — tatsächliche Punkte minus erwartete Punkte
              aus der Vorhersage vor jedem Spiel, geteilt durch die Spiele der jeweiligen Halbserie.
              „Entwicklung“ ist die Differenz der beiden Werte je Spiel: sie misst, ob ein Klub seine
              Erwartung in der Rückrunde stärker übertrifft als in der Hinrunde — nicht, ob er mehr
              Punkte holt.
            </p>
          }
        >
          {halfPerf ? (
            <div className="table-scroll"><table className="data">
              <thead>
                <tr>
                  <th scope="col" className="left">Zeitraum</th>
                  <th scope="col">Sp</th>
                  <th scope="col">Punkte</th>
                  <th scope="col">erwartet</th>
                  <th scope="col">je Spiel</th>
                </tr>
              </thead>
              <tbody>
                {[["Hinrunde", halfPerf.hin], ["Rückrunde", halfPerf.rueck]].map(([label, r]) => (
                  <tr key={label}>
                    <th scope="row" className="left" style={{ fontWeight: 400 }}>{label}</th>
                    <td>{r.played}</td>
                    <td>{number(r.actual, 0)}</td>
                    <td>{number(r.expected, 1)}</td>
                    <td style={{ color: perfColor(r.perMatch) }}>{signed(r.perMatch, 2)}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row" className="left">Entwicklung</th>
                  <td colSpan={3} />
                  <td style={{ color: perfColor(halfPerf.entwicklung) }}>{signed(halfPerf.entwicklung, 2)}</td>
                </tr>
              </tbody>
            </table></div>
          ) : null}
        </Card>

        <Card
          title="Zonenverteilung im Saisonverlauf"
          when={Boolean(zoneSeries)}
          caption={
            `${timeline?.label?.label ?? "Eingefrorene Saisonstart-Stärke"}. Wie sich die `
            + "Wahrscheinlichkeit auf die Tabellenzonen verteilt — die Kurve enthält keine "
            + "Rating-Aktualisierungen, sie zeigt, was allein die Ergebnisse bewirkt haben."
          }
        >
          {zoneSeries ? <ZoneStack series={zoneSeries} clubName={nameOf(clubId)} boundary={boundary} /> : null}
        </Card>

        <Card title="Restprogramm" when={remaining.length > 0}>
          <div className="table-scroll"><table className="data">
            <tbody>
              {remaining.map((f) => (
                <tr key={f.id}>
                  <th scope="row" className="left" style={{ fontWeight: 400 }}>
                    {f.homeClubId === clubId ? `gegen ${nameOf(f.awayClubId)}` : `bei ${nameOf(f.homeClubId)}`}
                  </th>
                  <td>{f.homeClubId === clubId ? "Heim" : "Auswärts"}</td>
                  <td style={{ color: "var(--text-muted)" }}>{weekdayDate(f.kickoff)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>

        {remaining.length === 0 && !positions ? <Empty>Für diesen Klub liegt nichts vor.</Empty> : null}
      </div>
    </>
  );
}

function mdLabel(md) {
  return md === 0 ? "vor dem 1. Spieltag" : `${md}. Spieltag`;
}

// „Wo die Saison endet" (§CHART_AUSBAU §2.2): % axis, bars in each rank's zone
// colour, a legend, and a per-bar tooltip „Platz 11 · 9,8 %".
function PositionBars({ positions, clubName, zones }) {
  const n = positions.length;
  const w = 720;
  const h = 220;
  const pad = { l: 52, r: 8, t: 10, b: 28 };
  const plotH = h - pad.t - pad.b;
  const bw = (w - pad.l - pad.r) / n;
  // A tidy axis top: the smallest 5 %-multiple above the tallest bar.
  const rawMax = Math.max(...positions, 0.02);
  const top = Math.min(1, Math.ceil((rawMax * 100) / 5) * 5 / 100);
  const y = (v) => pad.t + plotH * (1 - v / top);
  const cx = (i) => pad.l + i * bw + bw / 2;

  const zoneOf = (i) => zoneOfRank(i + 1, zones);
  const { active, setActive, onKeyDown } = useActivePoint(n);

  // The distinct zones present, in table order, for the legend (+ Mittelfeld).
  const legend = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const z = zoneOf(i);
    const key = z?.id ?? "mittelfeld";
    if (seen.has(key)) continue;
    seen.add(key);
    legend.push({ key, label: z?.label ?? "Mittelfeld", color: z?.color ?? zoneColor("mittelfeld") });
  }

  const ticks = [0, top / 2, top];

  return (
    <>
      <Chart
        title={`Endplatzierung von ${clubName}`}
        ariaLabel={`Balkendiagramm: Wahrscheinlichkeit für jeden Tabellenplatz von 1 bis ${n} für ${clubName}, Balken in der Farbe der jeweiligen Tabellenzone.`}
        width={w}
        height={h}
        table={{
          columns: ["Platz", "Wahrscheinlichkeit"],
          rows: positions.map((p, i) => [`Platz ${i + 1}`, percent(p)]),
        }}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} className="grid-line" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{percent(v, 0)}</text>
          </g>
        ))}
        <YAxisTitle label="%" top={pad.t} bottom={pad.t + plotH} />
        {positions.map((p, i) => (
          <rect
            key={i}
            x={pad.l + i * bw + 1}
            y={y(p)}
            width={Math.max(1, bw - 2)}
            height={pad.t + plotH - y(p)}
            fill={zoneOf(i)?.color ?? zoneColor("mittelfeld")}
            opacity={active == null || active === i ? 0.9 : 0.45}
            rx="2"
          />
        ))}
        {positions.map((_, i) => (
          (i === 0 || (i + 1) % 3 === 0) ? (
            <text key={`t${i}`} x={cx(i)} y={h - 8} textAnchor="middle" className="axis-label">{i + 1}</text>
          ) : null
        ))}
        <HitAreas
          centers={positions.map((_, i) => cx(i))}
          top={pad.t}
          bottom={pad.t + plotH}
          active={active}
          setActive={setActive}
          onKeyDown={onKeyDown}
          labelAt={(i) => `Platz ${i + 1}: ${percent(positions[i])}`}
        />
        {active != null ? (
          <ChartTooltip
            x={cx(active)}
            width={w}
            title={`Platz ${active + 1}`}
            rows={[{ label: zoneOf(active)?.label ?? "Mittelfeld", value: percent(positions[active]), color: zoneOf(active)?.color ?? zoneColor("mittelfeld") }]}
          />
        ) : null}
      </Chart>
      <ChartLegend items={legend} />
    </>
  );
}

// „Zonenverteilung im Saisonverlauf" (§CHART_AUSBAU §2.1): stacked area of the
// zone partition per matchday, Meister at the top of the plot to Abstieg at the
// bottom. Legend + per-matchday tooltip over the shared components.
function ZoneStack({ series, clubName, boundary }) {
  const w = 720;
  const h = 260;
  const pad = { l: 52, r: 12, t: 12, b: 30 };
  const plotH = h - pad.t - pad.b;
  const xs = series.map((p) => p.matchday);
  const maxX = Math.max(...xs, 1);
  const x = (md) => pad.l + (md / maxX) * (w - pad.l - pad.r);
  const y = (frac) => pad.t + frac * plotH; // frac 0 = top of the plot
  const centers = series.map((p) => x(p.matchday));

  // Band identity/order is stable across matchdays (partition sorts by rank), so
  // index k names the same band everywhere; the last point supplies labels.
  const canon = series[series.length - 1].bands;
  const cumBefore = (bands, k) => bands.slice(0, k).reduce((s, b) => s + b.value, 0);

  const { active, setActive, onKeyDown } = useActivePoint(series.length);

  const legend = canon.map((b) => ({ key: b.id, label: b.label, color: zoneColor(b.id) }));

  return (
    <>
      <Chart
        title={`Zonenverteilung von ${clubName} im Saisonverlauf`}
        ariaLabel={`Gestapeltes Flächendiagramm: wie sich die Endplatzierungs-Wahrscheinlichkeit von ${clubName} über die Spieltage auf die Tabellenzonen von Meister bis Abstieg verteilt.`}
        width={w}
        height={h}
        table={{
          columns: ["Spieltag", ...canon.map((b) => b.label)],
          rows: series.map((p) => [p.matchday === 0 ? "vor 1." : `${p.matchday}.`, ...p.bands.map((b) => percent(b.value))]),
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} y1={y(v)} x2={w - pad.r} y2={y(v)} className="grid-line" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">{Math.round(v * 100)} %</text>
          </g>
        ))}
        <YAxisTitle label="%" top={pad.t} bottom={pad.t + plotH} />
        {canon.map((band, k) => {
          const dTop = series.map((p) => `${x(p.matchday).toFixed(1)},${y(cumBefore(p.bands, k)).toFixed(1)}`);
          const dBottom = series.map((p) => `${x(p.matchday).toFixed(1)},${y(cumBefore(p.bands, k) + p.bands[k].value).toFixed(1)}`).reverse();
          const d = `M${dTop.join(" L")} L${dBottom.join(" L")} Z`;
          return <path key={band.id} d={d} fill={zoneColor(band.id)} opacity={active == null ? 0.85 : 0.7} stroke="var(--surface)" strokeWidth="0.5" />;
        })}
        <HalfSeasonMarker boundary={boundary} maxMatchday={maxX} x={x} top={pad.t} bottom={pad.t + plotH} />
        <text x={w - pad.r} y={h - 8} textAnchor="end" className="axis-label">Spieltag</text>
        <HitAreas
          centers={centers}
          top={pad.t}
          bottom={pad.t + plotH}
          active={active}
          setActive={setActive}
          onKeyDown={onKeyDown}
          labelAt={(i) => `${mdLabel(series[i].matchday)}: ${series[i].bands.map((b) => `${b.label} ${percent(b.value)}`).join(", ")}`}
        />
        {active != null ? (
          <ChartTooltip
            x={centers[active]}
            width={w}
            title={mdLabel(series[active].matchday)}
            rows={series[active].bands.map((b, k) => ({
              label: b.label,
              value: percent(b.value),
              delta: active > 0 ? b.value - series[active - 1].bands[k].value : undefined,
              color: zoneColor(b.id),
            }))}
          />
        ) : null}
      </Chart>
      <ChartLegend items={legend} />
    </>
  );
}
