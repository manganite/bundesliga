import test from "node:test";
// Wegwerf-Zweig: prüft, ob die Skip-Zählung in CI wirklich anschlägt.
test("ein siebter Skip, der niemandem auffallen dürfte", { skip: "absichtlich" }, () => {});
