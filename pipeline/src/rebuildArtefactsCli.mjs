// CLI for rebuildArtefacts.mjs — see the header there.
//
//   node pipeline/src/rebuildArtefactsCli.mjs --season 2025 [--check] [--data-dir data]
//   node pipeline/src/rebuildArtefactsCli.mjs --all [--check]

import fs from "node:fs";
import path from "node:path";
import { rebuildSeason } from "./rebuildArtefacts.mjs";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const dataDir = value("--data-dir", "data");
const check = flag("--check");
const seasonsDir = path.join(dataDir, "seasons");

let years;
if (flag("--all")) {
  years = fs.readdirSync(seasonsDir).filter((n) => /^\d{4}$/.test(n)).map(Number).sort((a, b) => a - b)
    // The running season carries a live timeline and is refused by the rebuild
    // itself; skipping it here keeps `--all` usable instead of fatal.
    .filter((y) => !fs.existsSync(path.join(seasonsDir, String(y), "bl1", "timeline-live.json")));
} else {
  const year = Number(value("--season"));
  if (!Number.isInteger(year)) {
    console.error("usage: rebuildArtefactsCli.mjs (--season <year> | --all) [--check] [--data-dir data]");
    process.exit(2);
  }
  years = [year];
}

let changed = 0;
for (const year of years) {
  const t0 = Date.now();
  for (const { league, files } of rebuildSeason({ dataDir, year, check })) {
    for (const f of files) {
      if (f.changed) changed++;
      console.log(`  ${f.changed ? (check ? "WOULD CHANGE" : "wrote") : "unchanged   "}  ${f.file}`);
    }
    void league;
  }
  console.log(`${year}: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
console.log(check ? `${changed} file(s) would change` : `${changed} file(s) written`);
