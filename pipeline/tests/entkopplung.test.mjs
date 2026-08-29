import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  Results and ratings are two channels (Brief 34).
//
//  The coupling this guards against is not hypothetical and not subtle in its
//  effect: for three separate clubelo outages in one season, „no ratings" meant
//  „no data at all", and league results stopped reaching the app while the
//  results source itself was perfectly healthy. The ratings gate simply sat
//  before every write.
//
//  Two halves, and both are easy to undo by accident:
//    * the results job must never contact clubelo,
//    * the two jobs must commit DISJOINT paths and report on SEPARATE channels,
//      or one source's outage colours the other's marker red again.
//
//  Same shape as deployTrigger.test.mjs next door: the check is a pure function
//  so the self-test can run it against deliberately broken input.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const wf = (name) => fs.readFileSync(path.join(REPO, ".github/workflows", name), "utf8");

/** Problems with the split. Empty means the two channels are actually separate. */
export function decouplingProblems(dataYml, ratingsYml) {
  const problems = [];

  // 1. The results job must run the pipeline WITHOUT the ratings fetch. This is
  //    the single line that keeps a clubelo outage away from league results.
  const pipelineLine = dataYml.split("\n").find((l) => l.includes("pipeline/src/cli.mjs"));
  if (!pipelineLine) problems.push("data.yml no longer runs the pipeline at all");
  else if (!pipelineLine.includes("--no-ratings-fetch")) {
    problems.push(
      "data.yml runs the pipeline WITHOUT --no-ratings-fetch — a clubelo outage would block results again",
    );
  }

  // 2. The backfill is the heaviest clubelo caller there is — one full club
  //    history per club. It must be gated on the same switch, or the results job
  //    reaches for clubelo the moment the archive lacks a required date, which
  //    is precisely when clubelo is down (Codex-Befund zu PR #51).
  const update = fs.readFileSync(path.join(REPO, "pipeline/src/update.mjs"), "utf8");
  if (!/fetchRatings\s*\n?\s*\?\s*backfillDates|fetchRatings\s*\?\s*backfillDates/.test(update)) {
    problems.push("update.mjs runs the history backfill unconditionally — the results path would call clubelo");
  }

  // 3. The ratings job must exist and be the one that fetches.
  if (!/pipeline\/src\/ratingsCli\.mjs/.test(ratingsYml)) {
    problems.push("ratings.yml does not run the ratings entry point — nothing would ever archive a snapshot");
  }

  // 4. Disjoint writes. A job that commits the other's files makes both markers
  //    lie: the results channel would go red for a ratings problem and back.
  const added = (yml) => [...yml.matchAll(/git add ([^\n]+)/g)].map((m) => m[1].trim());
  const dataAdds = added(dataYml).join(" ");
  const ratingsAdds = added(ratingsYml).join(" ");
  if (/(^|\s)data(\s|$)/.test(dataAdds)) {
    problems.push("data.yml commits all of data/ — that includes the rating archive it does not own");
  }
  if (/data\/ratings/.test(dataAdds)) problems.push("data.yml commits data/ratings — that belongs to ratings.yml");
  if (/data\/seasons|data\/meta/.test(ratingsAdds)) {
    problems.push("ratings.yml commits season data — that belongs to data.yml");
  }

  // 5. Separate `betrieb` channels. The marker key is what keeps one outage from
  //    opening the other channel's issue.
  const channel = (yml) => [...yml.matchAll(/BETRIEB_WORKFLOW:\s*(\S+)/g)].map((m) => m[1]);
  const dataChannels = new Set(channel(dataYml));
  const ratingsChannels = new Set(channel(ratingsYml));
  if (!dataChannels.size) problems.push("data.yml reports on no betrieb channel");
  if (!ratingsChannels.size) problems.push("ratings.yml reports on no betrieb channel");
  for (const c of ratingsChannels) {
    if (dataChannels.has(c)) {
      problems.push(`both workflows report on the betrieb channel "${c}" — one outage would colour the other`);
    }
  }

  return problems;
}

test("the results job never contacts clubelo, and the two channels are separate", () => {
  assert.deepEqual(decouplingProblems(wf("data.yml"), wf("ratings.yml")), []);
});

test("the guard catches each half of the split being undone", () => {
  const data = wf("data.yml");
  const ratings = wf("ratings.yml");

  // Mutate the COMMAND LINE, not the comment above it that also names the flag —
  // otherwise the self-test proves nothing about the check.
  const coupled = data.replace(
    /(run: node pipeline\/src\/cli\.mjs[^\n]*) --no-ratings-fetch/,
    "$1",
  );
  assert.notEqual(coupled, data, "the self-test must actually change the command line");
  assert.match(
    decouplingProblems(coupled, ratings).join("\n"), /--no-ratings-fetch/,
    "removing the switch must be caught — it is the whole mechanism",
  );

  const greedy = data.replace(/git add data\/seasons data\/meta\.json/, "git add data");
  assert.match(decouplingProblems(greedy, ratings).join("\n"), /rating archive it does not own/);

  const sameChannel = ratings.replace(/BETRIEB_WORKFLOW:\s*ratings/g, "BETRIEB_WORKFLOW: data");
  assert.match(decouplingProblems(data, sameChannel).join("\n"), /would colour the other/);

  const noRatingsJob = ratings.replace(/pipeline\/src\/ratingsCli\.mjs/g, "echo nothing");
  assert.match(decouplingProblems(data, noRatingsJob).join("\n"), /nothing would ever archive/);
});

test("the results job runs often enough for a result to be minutes old, not hours", () => {
  const cron = wf("data.yml").match(/cron:\s*"([^"]+)"/)?.[1];
  assert.ok(cron, "data.yml has a schedule");
  // The minute field must name several slots per hour. Two-hourly meant a
  // Saturday afternoon result routinely reached the app an hour late, which is
  // the complaint that started Brief 34.
  const slots = cron.split(/\s+/)[0].split(",").length;
  assert.ok(slots >= 4, `results should be checked at least every 15 minutes, got "${cron}"`);
});

test("the ratings job stays polite — at most hourly, and it skips a day it already has", () => {
  const cron = wf("ratings.yml").match(/cron:\s*"([^"]+)"/)?.[1];
  assert.ok(cron, "ratings.yml has a schedule");
  assert.equal(cron.split(/\s+/)[0].split(",").length, 1, "at most one clubelo attempt per hour");
  const src = fs.readFileSync(path.join(REPO, "pipeline/src/ratingsCli.mjs"), "utf8");
  assert.match(src, /findSnapshotOn\(index, today/, "today already archived → no request at all");
});
