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

  // 5. Both workflows have to report red AND green. The red half is the alarm;
  //    the green half is what makes the open issue trustworthy as a state marker
  //    — a reporter that only ever opens issues teaches the operator to ignore
  //    them. `issues: write` is checked too, because without it the reporting
  //    job fails at the API call, which reads as „the reporter is broken" rather
  //    than „the workflow is red".
  for (const [name, yml] of [["data.yml", dataYml], ["deploy.yml", deployYml]]) {
    if (!/betrieb-melden\.sh/.test(yml)) {
      problems.push(`${name} does not report its status — a red run would notify nobody`);
      continue;
    }
    if (!/BETRIEB_STATUS:\s*rot/.test(yml)) {
      problems.push(`${name} has no red path — failures would go unreported`);
    }
    if (!/BETRIEB_STATUS:\s*gruen/.test(yml)) {
      problems.push(`${name} has no green path — the marker would never clear itself`);
    }
    if (!/^\s*issues:\s*write\s*$/m.test(yml)) {
      problems.push(`${name} lacks \`issues: write\` — the report cannot be filed`);
    }
  }

  // 6. deploy.yml's reporter must watch the TEST job, not just the deploy job.
  //    This is the concrete regression: on 2026-08-09..11 the gate went red,
  //    `build` and `deploy` were skipped, and four deploys died unannounced.
  const meldenNeeds = deployYml.match(/needs:\s*\[([^\]]*)\][^]*?betrieb-melden\.sh/);
  if (meldenNeeds && !/\btest\b/.test(meldenNeeds[1])) {
    problems.push(
      "deploy.yml's reporter does not depend on the test job — a red gate would be silent",
    );
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

test("that check can fail — it recognises a silently removed status report", () => {
  const data = readWorkflow("data.yml");
  const deploy = readWorkflow("deploy.yml");

  // A later edit drops the reporting job entirely — the case this guard exists
  // for, since nothing else in the suite would notice.
  const mute = (yml) => yml.replace(/betrieb-melden\.sh/g, "true");
  assert.match(deployChainProblems(mute(data), deploy).join("\n"), /data\.yml does not report/);
  assert.match(deployChainProblems(data, mute(deploy)).join("\n"), /deploy\.yml does not report/);

  // Half-removed: the alarm stays, the self-healing half goes. An issue that
  // never closes is worse than none, because it trains the operator to ignore it.
  const noGreen = (yml) => yml.replace(/BETRIEB_STATUS:\s*gruen/g, "BETRIEB_STATUS: rot");
  assert.match(deployChainProblems(noGreen(data), deploy).join("\n"), /never clear itself/);

  const noRed = (yml) => yml.replace(/BETRIEB_STATUS:\s*rot/g, "BETRIEB_STATUS: gruen");
  assert.match(deployChainProblems(data, noRed(deploy)).join("\n"), /no red path/);

  const noScope = (yml) => yml.replace(/^\s*issues:\s*write\s*$/m, "");
  assert.match(deployChainProblems(noScope(data), deploy).join("\n"), /cannot be filed/);

  // The 2026-08-09..11 regression in its exact shape: the reporter watches the
  // deploy job only, so a red TEST gate skips build+deploy and says nothing.
  const deployOnly = deploy.replace(/needs:\s*\[test, build, deploy\]/, "needs: [deploy]");
  assert.match(deployChainProblems(data, deployOnly).join("\n"), /red gate would be silent/);
});
