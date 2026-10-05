/**
 * The terminology boundary, enforced.
 *
 * The product rule is "technical concepts belong in the implementation, not in the user's
 * vocabulary". A rule nobody checks drifts within a week, so this file checks it: it sweeps the
 * domain layer's own user-facing strings for protocol vocabulary and fails if any leaked.
 *
 * It sweeps SOURCE rather than only generated output, because a sentence that only appears on one
 * branch would otherwise never be seen by a test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { INTERNAL_ONLY, TERMS, explainTerm, findLeakedJargon, productTerm } from "../src/terms.ts";

test("the guard catches protocol vocabulary in a sentence", () => {
  assert.deepEqual(findLeakedJargon("Your mandate's maxSingleAssetBps was exceeded on Monad"), [
    "Monad",
  ]);
  assert.deepEqual(findLeakedJargon("The adapter reported slippage above the nonce"), [
    "nonce",
    "adapter",
    "slippage",
  ]);
  assert.deepEqual(findLeakedJargon("Your money is where your plan says it should be."), []);
});

test("the guard does not fire on a word that merely contains a term", () => {
  // "adapter" must not match "adapted", "gas" must not match "gasp".
  assert.deepEqual(findLeakedJargon("Modalis adapted your plan and nobody gasped"), []);
});

test("every mapped term has a product name and an explanation a person could read", () => {
  for (const key of Object.keys(TERMS) as (keyof typeof TERMS)[]) {
    const product = productTerm(key);
    const describe = explainTerm(key);
    assert.ok(product.length > 0, `${key} needs a product name`);
    assert.ok(describe.length > 15, `${key} needs a real explanation`);
    assert.deepEqual(
      findLeakedJargon(describe),
      [],
      `the explanation of "${key}" leaks protocol vocabulary: ${describe}`,
    );
  }
});

test("the internal-only list covers the infrastructure the brief names", () => {
  for (const term of [
    "PortfolioMandate",
    "PortfolioVault",
    "AssetRegistry",
    "RebalanceExecutor",
    "Monad",
    "Kuru",
    "Chainlink CRE",
    "Envio",
  ]) {
    assert.ok(
      (INTERNAL_ONLY as readonly string[]).includes(term),
      `${term} should be marked internal-only`,
    );
  }
});

/**
 * Strings in the domain layer that reach a person.
 *
 * Collected from source rather than from output so a message on a rarely-taken branch is still
 * checked. Only sentences are considered: a string with a space and a final stop or a
 * sentence-like shape is copy; `"no_plan"` is an identifier.
 */
function userFacingStrings(dir: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  for (const entry of walk(dir)) {
    const source = readFileSync(entry, "utf8")
      // Comments explain the code to a developer; they are allowed to name the infrastructure.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    // A JS string literal cannot span a line unescaped, so one line at a time is exact.
    for (const line of source.split("\n")) {
      for (const match of line.matchAll(/"((?:[^"\\]|\\.){20,}?)"|`([^`\n]{20,}?)`/g)) {
        const raw = (match[1] ?? match[2]).replace(/\$\{[^}]*\}/g, " ").replace(/\\n/g, " ");
        const text = raw.replace(/\s+/g, " ").trim();
        if (isCopy(text)) out.push({ file: entry, text });
      }
    }
  }
  return out;
}

/** A sentence a person reads, as opposed to an identifier, a path or a fragment of code. */
function isCopy(text: string): boolean {
  if (text.split(" ").length < 4) return false;
  if (/[{}();=<>]|_[a-z]/.test(text)) return false;
  return /^[A-Z]/.test(text) || /[.!?]$/.test(text);
}

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (path.endsWith(".ts") && !path.endsWith("terms.ts")) found.push(path);
  }
  return found;
}

test("no user-facing sentence in the domain layer leaks protocol vocabulary", () => {
  const src = new URL("../src", import.meta.url).pathname;
  const strings = userFacingStrings(src);

  // A guard that found nothing to check is a broken guard.
  assert.ok(strings.length > 15, `expected to find product copy to check, found ${strings.length}`);

  const leaks: string[] = [];
  for (const { file, text } of strings) {
    const found = findLeakedJargon(text);
    if (found.length > 0) leaks.push(`${file.split("/src/")[1]}: [${found.join(", ")}] in "${text}"`);
  }
  assert.deepEqual(leaks, [], `protocol vocabulary reached user-facing copy:\n${leaks.join("\n")}`);
});
