import test from "node:test";
import assert from "node:assert/strict";
import {
  fetchDailySnapshot, dateCoverage, parseCsv, DATE_COVERAGE_MIN_SHARE, RatingSourceError,
} from "../src/sources/clubelo.mjs";

/** A daily CSV whose rows cover `[from, to]`, plus optional stuck rows. */
function csv({ from, to, rows = 600, stuck = 0, stuckTo = "2026-07-03" }) {
  const out = ["Rank,Club,Country,Level,Elo,From,To"];
  for (let i = 0; i < rows - stuck; i++) out.push(`${i + 1},Club${i},GER,1,${1500 + i},${from},${to}`);
  for (let i = 0; i < stuck; i++) out.push(`None,Stuck${i},GER,1,${1600 + i},2026-05-21,${stuckTo}`);
  return out.join("\n");
}

const fetchWith = (text) => async () => text;

test("a snapshot whose rows cover the requested date passes", async () => {
  const snap = await fetchDailySnapshot("2026-07-23", fetchWith(csv({ from: "2026-07-20", to: "2026-08-29" })));
  assert.equal(snap.effectiveAt, "2026-07-23");
  assert.equal(snap.rows.length, 600);
  assert.ok(snap.coverage.share >= DATE_COVERAGE_MIN_SHARE);
});

// The failure mode this exists for: clubelo serves cached pages when overloaded.
// The response is structurally perfect and describes another day entirely.
test("a snapshot shifted by weeks throws and names both dates", async () => {
  const stale = csv({ from: "2026-05-01", to: "2026-05-14" });
  await assert.rejects(
    () => fetchDailySnapshot("2026-07-23", fetchWith(stale)),
    (e) => {
      assert.ok(e instanceof RatingSourceError);
      assert.match(e.message, /2026-07-23/, "must name the date that was requested");
      assert.match(e.message, /2026-05-01/, "must name what the response describes");
      assert.match(e.message, /stale cache is a source failure/);
      return true;
    },
  );
});

// Exactly today's real situation: four clubs stuck, everything else current.
// A strict "every row must cover it" rule would fail permanently on this.
test("a handful of stuck clubs still passes — they surface as unresolved instead", async () => {
  const mostlyFresh = csv({ from: "2026-07-20", to: "2026-08-29", rows: 600, stuck: 4 });
  const snap = await fetchDailySnapshot("2026-07-23", fetchWith(mostlyFresh));
  assert.equal(snap.rows.length, 600);
  assert.ok(snap.coverage.share > 0.99);
  // The stuck clubs are simply not usable for that date — which is what feeds
  // the carry-forward decision.
  const stuck = snap.rows.filter((r) => r.to < "2026-07-23");
  assert.equal(stuck.length, 4);
});

test("the threshold sits between the two cases", async () => {
  // 89 % coverage fails, 91 % passes.
  const at89 = csv({ from: "2026-07-20", to: "2026-08-29", rows: 1000, stuck: 110 });
  await assert.rejects(() => fetchDailySnapshot("2026-07-23", fetchWith(at89)), RatingSourceError);
  const at91 = csv({ from: "2026-07-20", to: "2026-08-29", rows: 1000, stuck: 90 });
  const ok = await fetchDailySnapshot("2026-07-23", fetchWith(at91));
  assert.ok(ok.coverage.share >= DATE_COVERAGE_MIN_SHARE);
});

test("the row-count guard still fires before the coverage check", async () => {
  const thin = csv({ from: "2026-07-20", to: "2026-08-29", rows: 40 });
  await assert.rejects(() => fetchDailySnapshot("2026-07-23", fetchWith(thin)), /only 40 rows/);
});

test("dateCoverage reports what the response actually describes", () => {
  const rows = parseCsv(csv({ from: "2026-05-01", to: "2026-05-14", rows: 120 }));
  const c = dateCoverage(rows, "2026-07-23");
  assert.equal(c.share, 0);
  assert.equal(c.describes.earliestFrom, "2026-05-01");
  assert.equal(c.describes.latestTo, "2026-05-14");
});
