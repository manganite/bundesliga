import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  §Codex §5 — the RATING_SIGMA causal error, as a repo-wide scan.
//
//  RATING_SIGMA models uncertainty over a club's STRENGTH (§3, Methodik step 1);
//  that a favourite does not win every match comes from the GOAL DRAW (step 2),
//  not from the strength spread. An anchor that guarded ONE occurrence let the
//  copy in the README survive — so the wrong causal shape is now forbidden
//  everywhere a user-facing surface could carry it.
//
//  Scope: app sources + the README + top-level operational docs. NOT the briefs,
//  the review, or CLAUDE.md — those are the immutable protocol that deliberately
//  QUOTES the wrong sentence in order to forbid it.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../../..");

// The wrong shape: a causal connector tying „Favorit" to „RATING_SIGMA"/
// „Streuung" across a short window, in either order. The correct wording keeps
// the strength spread and the match randomness in separate sentences with no
// causal link between them, so it does not match.
const WRONG_CAUSAL = [
  /(RATING_SIGMA|Streuung)[\s\S]{0,150}?Favorit[\s\S]{0,40}?(darum|deshalb|weil)/i,
  /Favorit[\s\S]{0,40}?(darum|deshalb|weil)[\s\S]{0,150}?(RATING_SIGMA|Streuung)/i,
];
const hasWrongCausal = (text) => WRONG_CAUSAL.some((re) => re.test(text));

function walk(dir, exts, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// App sources + README + top-level docs (not docs/briefs, docs/reviews, …).
const files = [
  ...walk(path.join(REPO, "apps/public/src"), [".js", ".jsx"]),
  path.join(REPO, "README.md"),
  ...fs.readdirSync(path.join(REPO, "docs"))
    .filter((n) => n.endsWith(".md"))
    .map((n) => path.join(REPO, "docs", n)),
];

test("self-test: the scan catches the wrong causal shape (order both ways)", () => {
  assert.ok(hasWrongCausal("… steckt als RATING_SIGMA im Modell. Ein Favorit gewinnt deshalb nicht in jedem Lauf."));
  assert.ok(hasWrongCausal("Ein Favorit verliert weil die Streuung streut."));
  // The corrected wording — strength spread and match randomness kept apart —
  // must NOT trip it.
  assert.ok(!hasWrongCausal(
    "Diese Streuung bildet die Unsicherheit über die Stärke ab, nicht den Zufall des einzelnen "
    + "Spiels. Dass ein Favorit nicht jedes Spiel gewinnt, entsteht erst bei der Torziehung.",
  ));
});

test("no user-facing surface ties a lost favourite to RATING_SIGMA/Streuung", () => {
  const offenders = files.filter((f) => hasWrongCausal(fs.readFileSync(f, "utf8")));
  assert.deepEqual(
    offenders.map((f) => path.relative(REPO, f)),
    [],
    "the wrong causal pattern (Favorit … darum/weil … RATING_SIGMA/Streuung) appears in these files",
  );
});
