#!/usr/bin/env node
/**
 * Copy the committed data the app needs into public/, so the built site serves
 * it from its own origin.
 *
 * There is NO browser-side live fetch (§5.1): the app reads only these
 * committed files. Rating snapshots are deliberately NOT copied — the app
 * consumes the derived artefacts, not the archive.
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SRC = path.join(ROOT, "data");
const DEST = path.join(import.meta.dirname, "..", "public", "data");

const PER_LEAGUE = ["season.json", "outlook.json", "timeline-frozen.json", "prematch.json"];

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function copy(rel) {
  const from = path.join(SRC, rel);
  if (!(await exists(from))) return false;
  const to = path.join(DEST, rel);
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.copyFile(from, to);
  return true;
}

await fs.rm(DEST, { recursive: true, force: true });
await fs.mkdir(DEST, { recursive: true });

const copied = [];
if (await copy("meta.json")) copied.push("meta.json");
if (await copy("season-params.json")) copied.push("season-params.json");

// Which seasons exist is discovered, never hardcoded (§5.5).
const seasonsDir = path.join(SRC, "seasons");
const seasons = (await exists(seasonsDir))
  ? (await fs.readdir(seasonsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

const index = { seasons: [] };
for (const season of seasons.sort()) {
  if (await copy(path.join("seasons", season, "config.json"))) copied.push(`${season}/config.json`);
  const leagues = [];
  for (const league of ["bl1", "bl2"]) {
    const files = [];
    for (const f of PER_LEAGUE) {
      if (await copy(path.join("seasons", season, league, f))) files.push(f);
    }
    if (files.length) { leagues.push({ league, files }); copied.push(...files.map((f) => `${season}/${league}/${f}`)); }
  }
  if (leagues.length) index.seasons.push({ season: Number(season), leagues });
}

// A manifest, so the app never has to probe for files that may not exist.
await fs.writeFile(path.join(DEST, "index.json"), `${JSON.stringify(index, null, 2)}\n`);

process.stderr.write(
  index.seasons.length
    ? `synced ${copied.length} file(s) for season(s) ${index.seasons.map((s) => s.season).join(", ")}\n`
    : "no committed season data found — the app will render its empty state\n",
);
