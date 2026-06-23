import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "readerNavigationState.ts");

async function loadReaderNavigationState() {
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

test("page navigation is available only for multi-page paged documents without outline", async () => {
  const { canUsePageNavigationState, canUseReaderNavigationState } = await loadReaderNavigationState();

  assert.equal(canUsePageNavigationState({
    hasSession: true,
    pageCount: 18,
    isTextSession: false,
    isImageSession: false,
    outlineCount: 0,
  }), true);
  assert.equal(canUsePageNavigationState({
    hasSession: true,
    pageCount: 1,
    isTextSession: false,
    isImageSession: false,
    outlineCount: 0,
  }), false);
  assert.equal(canUsePageNavigationState({
    hasSession: true,
    pageCount: 18,
    isTextSession: true,
    isImageSession: false,
    outlineCount: 0,
  }), false);
  assert.equal(canUsePageNavigationState({
    hasSession: true,
    pageCount: 18,
    isTextSession: false,
    isImageSession: true,
    outlineCount: 0,
  }), false);
  assert.equal(canUsePageNavigationState({
    hasSession: true,
    pageCount: 18,
    isTextSession: false,
    isImageSession: false,
    outlineCount: 2,
  }), false);

  assert.equal(canUseReaderNavigationState(false, 0), false);
  assert.equal(canUseReaderNavigationState(true, 0), true);
  assert.equal(canUseReaderNavigationState(false, 2), true);
});

test("outline active item follows current page and honors a valid preferred click", async () => {
  const { nextDocumentOutlinePreference, activeDocumentOutlineIndex } = await loadReaderNavigationState();
  const outlineItems = [
    { pageIndex: 0 },
    { pageIndex: 2 },
    { pageIndex: 2 },
    { pageIndex: 5 },
  ];

  assert.deepEqual(
    nextDocumentOutlinePreference({
      preferredIndex: 2,
      preferredPageIndex: 2,
      currentPage: 2,
      preservedScrollTop: 120,
    }),
    { preferredIndex: 2, preferredPageIndex: 2 },
  );
  assert.deepEqual(
    nextDocumentOutlinePreference({
      preferredIndex: 2,
      preferredPageIndex: 2,
      currentPage: 4,
      preservedScrollTop: null,
    }),
    { preferredIndex: null, preferredPageIndex: null },
  );

  assert.equal(activeDocumentOutlineIndex({
    items: outlineItems,
    currentPage: 4,
    preferredIndex: null,
  }), 2);
  assert.equal(activeDocumentOutlineIndex({
    items: outlineItems,
    currentPage: 4,
    preferredIndex: 1,
  }), 1);
  assert.equal(activeDocumentOutlineIndex({
    items: outlineItems,
    currentPage: 1,
    preferredIndex: 9,
  }), 0);
  assert.equal(activeDocumentOutlineIndex({
    items: outlineItems,
    currentPage: -1,
    preferredIndex: null,
  }), null);
});
