import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "printViewState.ts");

async function loadPrintViewState() {
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

test("single page print state preserves page surface mode and rotation", async () => {
  const { singlePagePrintState } = await loadPrintViewState();

  assert.deepEqual(singlePagePrintState({
    pageOrientation: "landscape",
    documentMode: "image",
    viewRotation: 90,
  }), {
    printOrientation: "landscape",
    printDocumentMode: "image",
    viewRotation: "90",
  });
});

test("single page print state falls back to portrait page mode", async () => {
  const { singlePagePrintState } = await loadPrintViewState();

  assert.deepEqual(singlePagePrintState({
    pageOrientation: undefined,
    documentMode: undefined,
    viewRotation: 0,
  }), {
    printOrientation: "portrait",
    printDocumentMode: "page",
    viewRotation: "0",
  });
});

test("continuous print state targets the active page only", async () => {
  const { continuousPrintState } = await loadPrintViewState();

  assert.deepEqual(continuousPrintState({
    pageSize: { width: 1000, height: 700 },
    viewRotation: 270,
  }), {
    printOrientation: "landscape",
    printDocumentMode: "page",
    printViewMode: "continuous",
    viewRotation: "270",
  });

  assert.deepEqual(continuousPrintState({
    pageSize: null,
    viewRotation: 0,
  }), {
    printOrientation: "portrait",
    printDocumentMode: "page",
    printViewMode: "continuous",
    viewRotation: "0",
  });
});
