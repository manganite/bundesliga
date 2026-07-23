import test from "node:test";
import assert from "node:assert/strict";
// Wegwerf-Zweig: prüft, ob ein roter Test den Lauf wirklich rot macht.
test("absichtlich rot", () => assert.equal(1, 2));
