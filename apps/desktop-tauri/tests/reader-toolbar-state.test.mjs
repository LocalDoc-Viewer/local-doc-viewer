import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const toolbarModulePath = resolve(desktopRoot, "src", "readerToolbarState.ts");
const scaleModulePath = resolve(desktopRoot, "src", "readerScaleState.ts");

function compileModule(modulePath, source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: modulePath,
  });

  return `${compiled.outputText}\n//# sourceURL=${pathToFileURL(modulePath).href}`;
}

async function loadReaderToolbarState() {
  const scaleSource = readFileSync(scaleModulePath, "utf8");
  const scaleModule = compileModule(scaleModulePath, scaleSource);
  const scaleModuleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(scaleModule)}`;
  const toolbarSource = readFileSync(toolbarModulePath, "utf8");
  const toolbarModule = compileModule(
    toolbarModulePath,
    toolbarSource.replace(
      'from "./readerScaleState"',
      `from "${scaleModuleUrl}"`,
    ),
  );

  return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(toolbarModule)}`);
}

test("reader toolbar disables document actions when no document is open", async () => {
  const { readerToolbarState } = await loadReaderToolbarState();

  const state = readerToolbarState({
    isBusy: false,
    hasSession: false,
    currentPage: 0,
    pageCount: 0,
    scale: 1,
    canScaleCurrentDocument: false,
    canUseContinuousView: false,
    readerViewMode: "single",
  });

  assert.equal(state.pageNumberInputDisabled, true);
  assert.equal(state.previousPageDisabled, true);
  assert.equal(state.nextPageDisabled, true);
  assert.equal(state.jumpPageDisabled, true);
  assert.equal(state.zoomOutDisabled, true);
  assert.equal(state.zoomInDisabled, true);
  assert.equal(state.resetZoomDisabled, true);
  assert.equal(state.fitWidthDisabled, true);
  assert.equal(state.fitPageDisabled, true);
  assert.equal(state.singlePageViewDisabled, true);
  assert.equal(state.continuousPageViewDisabled, true);
  assert.equal(state.printDocumentDisabled, true);
});

test("reader toolbar exposes page navigation and zoom boundaries", async () => {
  const { readerToolbarState } = await loadReaderToolbarState();

  const firstPage = readerToolbarState({
    isBusy: false,
    hasSession: true,
    currentPage: 0,
    pageCount: 3,
    scale: 0.5,
    canScaleCurrentDocument: true,
    canUseContinuousView: true,
    readerViewMode: "single",
  });

  assert.equal(firstPage.previousPageDisabled, true);
  assert.equal(firstPage.nextPageDisabled, false);
  assert.equal(firstPage.zoomOutDisabled, true);
  assert.equal(firstPage.zoomInDisabled, false);
  assert.equal(firstPage.resetZoomDisabled, false);
  assert.equal(firstPage.singlePageViewPressed, true);
  assert.equal(firstPage.continuousPageViewPressed, false);

  const lastPage = readerToolbarState({
    isBusy: false,
    hasSession: true,
    currentPage: 2,
    pageCount: 3,
    scale: 3,
    canScaleCurrentDocument: true,
    canUseContinuousView: true,
    readerViewMode: "continuous",
  });

  assert.equal(lastPage.previousPageDisabled, false);
  assert.equal(lastPage.nextPageDisabled, true);
  assert.equal(lastPage.zoomOutDisabled, false);
  assert.equal(lastPage.zoomInDisabled, true);
  assert.equal(lastPage.singlePageViewPressed, false);
  assert.equal(lastPage.continuousPageViewPressed, true);
});

test("reader toolbar respects busy and non-scalable document states", async () => {
  const { readerToolbarState } = await loadReaderToolbarState();

  const busy = readerToolbarState({
    isBusy: true,
    hasSession: true,
    currentPage: 1,
    pageCount: 3,
    scale: 1,
    canScaleCurrentDocument: true,
    canUseContinuousView: true,
    readerViewMode: "single",
  });

  assert.equal(busy.pageNumberInputDisabled, true);
  assert.equal(busy.nextPageDisabled, true);
  assert.equal(busy.zoomInDisabled, true);
  assert.equal(busy.printDocumentDisabled, true);

  const textDocument = readerToolbarState({
    isBusy: false,
    hasSession: true,
    currentPage: 0,
    pageCount: 1,
    scale: 1,
    canScaleCurrentDocument: false,
    canUseContinuousView: false,
    readerViewMode: "single",
  });

  assert.equal(textDocument.zoomOutDisabled, true);
  assert.equal(textDocument.zoomInDisabled, true);
  assert.equal(textDocument.resetZoomDisabled, true);
  assert.equal(textDocument.fitWidthDisabled, true);
  assert.equal(textDocument.fitPageDisabled, true);
  assert.equal(textDocument.singlePageViewDisabled, false);
  assert.equal(textDocument.continuousPageViewDisabled, true);
});
