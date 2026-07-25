import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  Committed historical artefacts vs. reality (§V2b.1). The finished-season
//  outlook is degenerate — the champion sits at 100% „Meister". That champion
//  MUST be the real one; a wrong reconstruction, a mis-joined result or a broken
//  ranker would surface here immediately. This guards the committed data, not
//  the generator (which has its own tests).
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");

// Real Bundesliga champions, 2011/12–2024/25 (clubId = training short-name).
const CHAMPIONS = {
  2011: "Dortmund", 2012: "Bayern", 2013: "Bayern", 2014: "Bayern",
  2015: "Bayern", 2016: "Bayern", 2017: "Bayern", 2018: "Bayern",
  2019: "Bayern", 2020: "Bayern", 2021: "Bayern", 2022: "Bayern",
  2023: "Leverkusen", 2024: "Bayern",
};

for (const [year, champion] of Object.entries(CHAMPIONS)) {
  const outlookPath = path.join(REPO, `data/seasons/${year}/bl1/outlook.json`);
  if (!fs.existsSync(outlookPath)) continue; // not yet generated → nothing to guard

  test(`${year}/… BL1: the 100% champion is the real one (${champion})`, () => {
    const outlook = JSON.parse(fs.readFileSync(outlookPath, "utf8"));
    assert.equal(outlook.remainingCount, 0, "a historical season is fully played");
    const certain = Object.entries(outlook.probabilities.meister).filter(([, p]) => p === 1);
    assert.equal(certain.length, 1, "exactly one club is certain champion");
    assert.equal(certain[0][0], champion, `${year}: reconstructed champion should be ${champion}`);
  });
}
