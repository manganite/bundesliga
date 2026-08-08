import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// ============================================================================
//  A cron data commit must reach the deployed site.
//
//  Why a test and not a comment: this coupling was broken for weeks and looked
//  correct the whole time. deploy.yml listed `paths: data/**`, every data
//  commit satisfied it, and the trigger still never fired — GitHub refuses to
//  start workflows from a push made with the GITHUB_TOKEN. Nothing failed.
//  No run turned red. The repository simply kept newer data than the site
//  served, because `prebuild` copies the committed data INTO the build (§5.1,
//  no browser-side fetch), so an undeployed data commit is invisible rather
//  than merely late. It surfaced only when a human noticed a played match
//  showing as unplayed.
//
//  Same failure class as the lockfile drift next door: silently wrong, with a
//  green light on top. The dispatch in data.yml is what replaces the dead
//  trigger, so it is the thing worth guarding.
// ============================================================================

const REPO = path.resolve(import.meta.dirname, "../..");
const readWorkflow = (name) =>
  fs.readFileSync(path.join(REPO, ".github/workflows", name), "utf8");

/**
 * The check itself, so the self-test below can run it against constructed
 * input. Returns an array of problems; empty means the chain is intact.
 */
export function deployChainProblems(dataYml, deployYml) {
  const problems = [];

  // 1. The dispatch has to exist at all — it is the only live path from a cron
  //    data commit to a deployment.
  if (!/gh workflow run\s+deploy\.yml/.test(dataYml)) {
    problems.push(
      "data.yml does not dispatch deploy.yml — a cron data commit would never deploy",
    );
  }

  // 2. `gh workflow run` against the GITHUB_TOKEN needs this scope. Without it
  //    the step fails loudly, which is survivable, but the grant belongs with
  //    the step that needs it.
  if (!/^\s*actions:\s*write\s*$/m.test(dataYml)) {
    problems.push("data.yml lacks `actions: write` — the dispatch cannot authenticate");
  }

  // 3. A dispatch only lands if the target declares the trigger.
  if (!/^\s*workflow_dispatch:\s*$/m.test(deployYml)) {
    problems.push("deploy.yml has no workflow_dispatch trigger — the dispatch has no target");
  }

  // 4. „Commit only on change" has to stay „deploy only on change": the
  //    dispatch is gated on the commit step actually having pushed, never on
  //    the job merely reaching the end. Read the gate from the dispatch step
  //    itself — from its `- name:` up to the command — so an `if:` sitting on
  //    some other step cannot stand in for it.
  const at = dataYml.search(/gh workflow run\s+deploy\.yml/);
  if (at !== -1) {
    const before = dataYml.slice(0, at);
    const stepBlock = before.slice(before.lastIndexOf("- name:"));
    if (!/if:\s*steps\.commit\.outputs\.pushed\s*==\s*'true'/.test(stepBlock)) {
      problems.push(
        "the dispatch is not gated on a pushed commit — every run would deploy, changed or not",
      );
    }
  }

  return problems;
}

test("a cron data commit still reaches the deployed site", () => {
  assert.deepEqual(
    deployChainProblems(readWorkflow("data.yml"), readWorkflow("deploy.yml")),
    [],
  );
});

test("that check can fail — it recognises each broken link", () => {
  const data = readWorkflow("data.yml");
  const deploy = readWorkflow("deploy.yml");

  // The exact regression this PR fixes: relying on deploy.yml's `paths: data/**`
  // alone. It reads as correct and never fires.
  const withoutDispatch = data.replace(/gh workflow run\s+deploy\.yml.*/, "echo done");
  assert.match(deployChainProblems(withoutDispatch, deploy).join("\n"), /never deploy/);

  const withoutScope = data.replace(/^\s*actions:\s*write\s*$/m, "");
  assert.match(deployChainProblems(withoutScope, deploy).join("\n"), /cannot authenticate/);

  const withoutTarget = deploy.replace(/^\s*workflow_dispatch:\s*$/m, "");
  assert.match(deployChainProblems(data, withoutTarget).join("\n"), /no target/);

  const ungated = data.replace(
    /if:\s*steps\.commit\.outputs\.pushed\s*==\s*'true'/,
    "if: always()",
  );
  assert.match(deployChainProblems(ungated, deploy).join("\n"), /changed or not/);
});
