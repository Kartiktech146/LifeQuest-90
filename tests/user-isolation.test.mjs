import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const stateRouteSource = await readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8");

test("new player state does not contain a developer profile or completed progress", () => {
  assert.doesNotMatch(pageSource, /name:\s*["']Kartik["']/);
  assert.match(pageSource, /function createInitialState/);
  assert.match(pageSource, /function isLegacyDemoState/);
  assert.match(pageSource, /xp:\s*0,\s*coins:\s*0,\s*streak:\s*0/);
  assert.doesNotMatch(pageSource, /className=["']avatar["']>KK</);
});

test("saved state is keyed only by the authenticated LifeQuest session", () => {
  assert.match(stateRouteSource, /currentUser\(request\)/);
  assert.doesNotMatch(stateRouteSource, /oai-authenticated-user-email/);
});
