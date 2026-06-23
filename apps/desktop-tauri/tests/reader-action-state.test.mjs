import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "readerActionState.ts");

async function loadReaderActionState() {
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

test("document find is available only for idle searchable sessions", async () => {
  const { canUseDocumentFindState } = await loadReaderActionState();

  assert.equal(canUseDocumentFindState({
    isBusy: false,
    isFindingDocument: false,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: true,
  }), true);
  assert.equal(canUseDocumentFindState({
    isBusy: false,
    isFindingDocument: false,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: false,
  }), false);
  assert.equal(canUseDocumentFindState({
    isBusy: false,
    isFindingDocument: false,
    hasSession: true,
    fileType: "ofd",
    hasActivePdfDocument: false,
  }), true);
  for (const fileType of ["txt", "log", "csv", "md"]) {
    assert.equal(canUseDocumentFindState({
      isBusy: false,
      isFindingDocument: false,
      hasSession: true,
      fileType,
      hasActivePdfDocument: false,
    }), true, `${fileType} should support current-document find`);
  }
  assert.equal(canUseDocumentFindState({
    isBusy: false,
    isFindingDocument: false,
    hasSession: true,
    fileType: "png",
    hasActivePdfDocument: false,
  }), false);
  assert.equal(canUseDocumentFindState({
    isBusy: true,
    isFindingDocument: false,
    hasSession: true,
    fileType: "ofd",
    hasActivePdfDocument: false,
  }), false);
  assert.equal(canUseDocumentFindState({
    isBusy: false,
    isFindingDocument: true,
    hasSession: true,
    fileType: "ofd",
    hasActivePdfDocument: false,
  }), false);
  assert.equal(canUseDocumentFindState({
    isBusy: false,
    isFindingDocument: false,
    hasSession: false,
    fileType: "ofd",
    hasActivePdfDocument: false,
  }), false);
});

test("view rotation is available only for idle PDF or image sessions with loaded backing views", async () => {
  const { canRotateViewState } = await loadReaderActionState();

  assert.equal(canRotateViewState({
    isBusy: false,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: true,
    isImageSession: false,
    hasImageDocumentView: false,
  }), true);
  assert.equal(canRotateViewState({
    isBusy: false,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: false,
    isImageSession: false,
    hasImageDocumentView: false,
  }), false);
  assert.equal(canRotateViewState({
    isBusy: false,
    hasSession: true,
    fileType: "png",
    hasActivePdfDocument: false,
    isImageSession: true,
    hasImageDocumentView: true,
  }), true);
  assert.equal(canRotateViewState({
    isBusy: false,
    hasSession: true,
    fileType: "png",
    hasActivePdfDocument: false,
    isImageSession: true,
    hasImageDocumentView: false,
  }), false);
  assert.equal(canRotateViewState({
    isBusy: true,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: true,
    isImageSession: false,
    hasImageDocumentView: false,
  }), false);
  assert.equal(canRotateViewState({
    isBusy: false,
    hasSession: false,
    fileType: null,
    hasActivePdfDocument: false,
    isImageSession: false,
    hasImageDocumentView: false,
  }), false);
});

test("scaling is available only for opened non-text sessions", async () => {
  const { canScaleCurrentDocumentState } = await loadReaderActionState();

  assert.equal(canScaleCurrentDocumentState({
    hasSession: true,
    isTextSession: false,
  }), true);
  assert.equal(canScaleCurrentDocumentState({
    hasSession: true,
    isTextSession: true,
  }), false);
  assert.equal(canScaleCurrentDocumentState({
    hasSession: false,
    isTextSession: false,
  }), false);
});

test("current-page text selection follows text and PDF backing availability", async () => {
  const { canSelectCurrentPageTextState } = await loadReaderActionState();

  assert.equal(canSelectCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "txt",
    isTextSession: true,
    hasTextPreviewContent: true,
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
  }), true);
  assert.equal(canSelectCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "txt",
    isTextSession: true,
    hasTextPreviewContent: false,
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
  }), false);
  assert.equal(canSelectCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "pdf",
    isTextSession: false,
    hasTextPreviewContent: false,
    hasActivePdfDocument: true,
    isCurrentPageTextCopyUnavailable: false,
  }), true);
  assert.equal(canSelectCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "pdf",
    isTextSession: false,
    hasTextPreviewContent: false,
    hasActivePdfDocument: true,
    isCurrentPageTextCopyUnavailable: true,
  }), false);
  assert.equal(canSelectCurrentPageTextState({
    isBusy: true,
    hasSession: true,
    fileType: "pdf",
    isTextSession: false,
    hasTextPreviewContent: false,
    hasActivePdfDocument: true,
    isCurrentPageTextCopyUnavailable: false,
  }), false);
});

test("current-page text copy follows PDF text layer text and OFD availability", async () => {
  const { canCopyCurrentPageTextState } = await loadReaderActionState();

  assert.equal(canCopyCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: true,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: false,
  }), true);
  assert.equal(canCopyCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "pdf",
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: false,
  }), false);
  assert.equal(canCopyCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "txt",
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: true,
  }), true);
  assert.equal(canCopyCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "txt",
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: false,
  }), false);
  assert.equal(canCopyCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "ofd",
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: false,
  }), true);
  assert.equal(canCopyCurrentPageTextState({
    isBusy: false,
    hasSession: true,
    fileType: "png",
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: false,
  }), false);
  assert.equal(canCopyCurrentPageTextState({
    isBusy: true,
    hasSession: true,
    fileType: "ofd",
    hasActivePdfDocument: false,
    isCurrentPageTextCopyUnavailable: false,
    hasTextPreviewContent: false,
  }), false);
});
