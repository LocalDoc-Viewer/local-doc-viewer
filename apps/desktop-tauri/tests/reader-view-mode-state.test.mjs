import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "readerViewModeState.ts");

async function loadReaderViewModeState() {
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

test("reader view mode request falls back when continuous view is unavailable", async () => {
  const { readerViewModeForRequest } = await loadReaderViewModeState();

  assert.equal(readerViewModeForRequest({
    requestedMode: "continuous",
    canUseContinuousView: false,
  }), "single");
  assert.equal(readerViewModeForRequest({
    requestedMode: "continuous",
    canUseContinuousView: true,
  }), "continuous");
  assert.equal(readerViewModeForRequest({
    requestedMode: "single",
    canUseContinuousView: true,
  }), "single");
});

test("opened documents preserve continuous mode only when supported", async () => {
  const { readerViewModeAfterDocumentOpen } = await loadReaderViewModeState();

  assert.equal(readerViewModeAfterDocumentOpen({
    currentMode: "continuous",
    canUseContinuousView: true,
  }), "continuous");
  assert.equal(readerViewModeAfterDocumentOpen({
    currentMode: "continuous",
    canUseContinuousView: false,
  }), "single");
  assert.equal(readerViewModeAfterDocumentOpen({
    currentMode: "single",
    canUseContinuousView: false,
  }), "single");
});
