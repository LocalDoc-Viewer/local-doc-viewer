import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "ofdDocumentPolicyState.ts");

async function loadOfdDocumentPolicyState() {
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

test("OFD page limit presets expose stable extension gates", async () => {
  const { ofdPageLimitPresets } = await loadOfdDocumentPolicyState();

  assert.deepEqual(ofdPageLimitPresets.map((preset) => [preset.id, preset.maxPages]), [
    ["stable", 20],
    ["extended", 50],
    ["long_experimental", 200],
  ]);
});

test("OFD open policy blocks documents above the selected limit", async () => {
  const { ofdOpenPolicyForPageCount } = await loadOfdDocumentPolicyState();

  assert.equal(ofdOpenPolicyForPageCount({ pageCount: 20, presetId: "stable" }).allowed, true);
  assert.equal(ofdOpenPolicyForPageCount({ pageCount: 21, presetId: "stable" }).allowed, false);
  assert.equal(ofdOpenPolicyForPageCount({ pageCount: 50, presetId: "extended" }).allowed, true);
  assert.equal(ofdOpenPolicyForPageCount({ pageCount: 51, presetId: "extended" }).allowed, false);
  assert.equal(ofdOpenPolicyForPageCount({ pageCount: 200, presetId: "long_experimental" }).allowed, true);
  assert.equal(ofdOpenPolicyForPageCount({ pageCount: 201, presetId: "long_experimental" }).allowed, false);
});

test("long OFD experimental preset disables continuous mode", async () => {
  const { canUseOfdContinuousViewForPreset } = await loadOfdDocumentPolicyState();

  assert.equal(canUseOfdContinuousViewForPreset("stable"), true);
  assert.equal(canUseOfdContinuousViewForPreset("extended"), true);
  assert.equal(canUseOfdContinuousViewForPreset("long_experimental"), false);
});

test("OFD policy copy explains the product boundary without blaming the file", async () => {
  const { ofdOpenPolicyForPageCount, ofdPageLimitPresets } = await loadOfdDocumentPolicyState();

  const blocked = ofdOpenPolicyForPageCount({ pageCount: 80, presetId: "extended" });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.message, /当前 OFD 页数上限为 50 页/);
  assert.match(blocked.message, /为保证阅读器稳定/);
  assert.doesNotMatch(blocked.message, /损坏|失败/);

  const longPreset = ofdPageLimitPresets.find((preset) => preset.id === "long_experimental");
  assert.ok(longPreset);
  assert.match(longPreset.description, /禁用 OFD 连续模式/);
  assert.match(longPreset.description, /后续 OFD 引擎升级/);
});
