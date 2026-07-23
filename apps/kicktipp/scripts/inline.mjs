#!/usr/bin/env node
/**
 * Collapse the Vite build into ONE self-contained HTML file (§9).
 *
 * App B must be openable on a phone at tipping time: no dev server, no second
 * request, no network. So every script and stylesheet is inlined and the loose
 * assets are removed.
 *
 * Done here rather than with a plugin to keep the dependency surface minimal
 * (§5.5) — it is a dozen lines of string work and one integrity check.
 */
import fs from "node:fs/promises";
import path from "node:path";

const DIST = path.resolve(import.meta.dirname, "..", "dist");
const OUT = path.join(DIST, "kicktipp.html");

let html = await fs.readFile(path.join(DIST, "index.html"), "utf8");

const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"[^>]*><\/script>/g)];
const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];

const assetPath = (href) => path.join(DIST, href.replace(/^\.?\//, ""));
const inlined = [];

for (const [tag, href] of styles) {
  const css = await fs.readFile(assetPath(href), "utf8");
  html = html.replace(tag, `<style>\n${css}\n</style>`);
  inlined.push(href);
}

for (const [tag, src] of scripts) {
  const js = await fs.readFile(assetPath(src), "utf8");
  // `</script>` inside a string literal would close the tag early.
  html = html.replace(tag, `<script type="module">\n${js.replace(/<\/script>/g, "<\\/script>")}\n</script>`);
  inlined.push(src);
}

// A file that still references an external asset is not self-contained, and
// shipping it would break silently on a phone with no network.
const remaining = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|data:|#|mailto:)/.test(u));
if (remaining.length) {
  throw new Error(`not self-contained — still references: ${remaining.join(", ")}`);
}

await fs.writeFile(OUT, html);

// Remove the loose build output so only the single file remains.
for (const rel of new Set(inlined)) {
  await fs.rm(assetPath(rel), { force: true });
}
await fs.rm(path.join(DIST, "index.html"), { force: true });
await fs.rm(path.join(DIST, "assets"), { recursive: true, force: true });

const { size } = await fs.stat(OUT);
process.stderr.write(`kicktipp.html: ${(size / 1024).toFixed(0)} kB, self-contained\n`);
