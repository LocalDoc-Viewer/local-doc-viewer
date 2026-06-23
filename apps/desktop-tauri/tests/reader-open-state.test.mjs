import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "readerOpenState.ts");

async function loadReaderOpenState() {
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

test("reader open snapshot preserves the previous reader state for failed opens", async () => {
  const { readerOpenSnapshot } = await loadReaderOpenState();
  const session = { id: "old-session", file_type: "pdf" };
  const pdfDocument = { kind: "pdf-handle" };
  const officePreview = { source: "local", layout: "preserve" };
  const imageDocumentView = { source_path: "asset://old-image" };
  const documentOutlineItems = [{ title: "Intro", pageIndex: 0, level: 0 }];

  const snapshot = readerOpenSnapshot({
    session,
    currentPage: 7,
    scale: 1.75,
    pdfViewRotation: 90,
    currentDocumentName: "old.pdf",
    currentDocumentStatus: "已打开",
    currentActivityFeedback: "已复制",
    activePdfDocument: pdfDocument,
    currentOfficePreview: officePreview,
    currentImageDocumentView: imageDocumentView,
    documentOutlineItems,
    readerViewMode: "continuous",
  });

  assert.deepEqual(snapshot, {
    session,
    currentPage: 7,
    scale: 1.75,
    pdfViewRotation: 90,
    currentDocumentName: "old.pdf",
    currentDocumentStatus: "已打开",
    currentActivityFeedback: "已复制",
    activePdfDocument: pdfDocument,
    currentOfficePreview: officePreview,
    currentImageDocumentView: imageDocumentView,
    documentOutlineItems,
    readerViewMode: "continuous",
  });
});
