import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
test("personal responses and documents never enter the offline cache", () => {
  const handlers: Record<string, (event: any) => void> = {};
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    URL, self: { location: { origin: "https://modalis.test" }, addEventListener: (name: string, handler: any) => { handlers[name] = handler; } },
  });
  for (const path of ["/api/money", "/api/plan", "/api/account", "/app", "/app/activity", "/plan"]) {
    let intercepted = false;
    handlers.fetch({ request: { method: "GET", url: `https://modalis.test${path}`, headers: { authorization: "Bearer a-personal-session" } }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false, path);
  }
});
test("activation deletes the old cache containing personal data", async () => {
  const handlers: Record<string, (event: any) => void> = {};
  const deleted: string[] = [];
  runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), {
    self: { addEventListener: (name: string, handler: any) => { handlers[name] = handler; }, clients: { claim: async () => {} } },
    caches: { keys: async () => ["modalis-v1", "modalis-public-v2", "other-app"], delete: async (key: string) => { deleted.push(key); } },
  });
  let done: Promise<unknown> | undefined;
  handlers.activate({ waitUntil: (promise: Promise<unknown>) => { done = promise; } });
  await done;
  assert.deepEqual(deleted, ["modalis-v1"]);
});
