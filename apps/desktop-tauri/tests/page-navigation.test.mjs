import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "pageNavigation.ts");

async function loadPageNavigation() {
  const source = readFileSync(modulePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: modulePath,
  });
  const encoded = encodeURIComponent(`${compiled.outputText}\n//# sourceURL=${pathToFileURL(modulePath).href}`);

  return import(`data:text/javascript;charset=utf-8,${encoded}`);
}

test("page jump input accepts first and last 1-based pages", async () => {
  const { parsePageJumpInput } = await loadPageNavigation();

  assert.deepEqual(parsePageJumpInput("1", 10), { ok: true, pageIndex: 0 });
  assert.deepEqual(parsePageJumpInput("10", 10), { ok: true, pageIndex: 9 });
});

test("page jump input trims whitespace around page numbers", async () => {
  const { parsePageJumpInput } = await loadPageNavigation();

  assert.deepEqual(parsePageJumpInput(" 2 ", 10), { ok: true, pageIndex: 1 });
});

test("page jump input rejects blank values", async () => {
  const { parsePageJumpInput } = await loadPageNavigation();

  assert.deepEqual(parsePageJumpInput("", 10), { ok: false, message: "请输入页码。" });
  assert.deepEqual(parsePageJumpInput("   ", 10), { ok: false, message: "请输入页码。" });
});

test("page jump input rejects non-integer values", async () => {
  const { parsePageJumpInput } = await loadPageNavigation();

  assert.deepEqual(parsePageJumpInput("abc", 10), { ok: false, message: "页码必须是整数。" });
  assert.deepEqual(parsePageJumpInput("1.5", 10), { ok: false, message: "页码必须是整数。" });
});

test("page jump input rejects out-of-range values", async () => {
  const { parsePageJumpInput } = await loadPageNavigation();

  assert.deepEqual(parsePageJumpInput("0", 10), { ok: false, message: "页码必须在 1 到 10 之间。" });
  assert.deepEqual(parsePageJumpInput("-1", 10), { ok: false, message: "页码必须在 1 到 10 之间。" });
  assert.deepEqual(parsePageJumpInput("11", 10), { ok: false, message: "页码必须在 1 到 10 之间。" });
});
