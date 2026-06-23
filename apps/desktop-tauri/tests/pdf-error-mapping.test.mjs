import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "pdf", "pdfErrorMapping.ts");
const standardFontDataUrl = `${resolve(
  desktopRoot,
  "node_modules",
  "pdfjs-dist",
  "standard_fonts",
).replaceAll("\\", "/")}/`;

async function loadPdfErrorMapping() {
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

test("PDF password errors map to unsupported feature without leaking paths", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const error = new Error("Password required for C:\\Users\\example\\secret.pdf");
  error.name = "PasswordException";
  const mapped = renderErrorFromPdfOpenFailure(error);

  assert.equal(mapped.code, "UNSUPPORTED_PDF_FEATURE");
  assert.equal(mapped.message, "该 PDF 受密码或权限保护，暂不支持打开。");
  assert.equal(mapped.safe_to_show, true);
  assert.match(mapped.detail_for_report, /<local-path>/);
  assert.doesNotMatch(mapped.detail_for_report, /secret\.pdf/);
});

test("PDF invalid structure errors map to PDF_STRUCTURE_ERROR", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const error = new Error("Invalid PDF structure: bad xref table");
  error.name = "InvalidPDFException";
  const mapped = renderErrorFromPdfOpenFailure(error);

  assert.equal(mapped.code, "PDF_STRUCTURE_ERROR");
  assert.equal(mapped.message, "无法打开该 PDF 文件。");
  assert.equal(mapped.recoverable, false);
});

test("PDF structure error diagnostics redact POSIX local paths", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const error = new Error("Invalid PDF trailer near /home/example/private/secret.pdf");
  error.name = "InvalidPDFException";
  const mapped = renderErrorFromPdfOpenFailure(error);

  assert.equal(mapped.code, "PDF_STRUCTURE_ERROR");
  assert.match(mapped.detail_for_report, /<local-path>/);
  assert.doesNotMatch(mapped.detail_for_report, /secret\.pdf/);
});

test("PDF structure error diagnostics redact Windows local paths with spaces", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const error = new Error("Invalid PDF trailer near C:\\Users\\Jane Doe\\private\\secret.pdf");
  error.name = "InvalidPDFException";
  const mapped = renderErrorFromPdfOpenFailure(error);

  assert.equal(mapped.code, "PDF_STRUCTURE_ERROR");
  assert.match(mapped.detail_for_report, /<local-path>/);
  assert.doesNotMatch(mapped.detail_for_report, /Jane Doe/);
  assert.doesNotMatch(mapped.detail_for_report, /secret\.pdf/);
});

test("PDF structure error diagnostics redact file URL local paths", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const error = new Error("Invalid PDF trailer near file:///home/example/private/secret.pdf");
  error.name = "InvalidPDFException";
  const mapped = renderErrorFromPdfOpenFailure(error);

  assert.equal(mapped.code, "PDF_STRUCTURE_ERROR");
  assert.match(mapped.detail_for_report, /<local-path>/);
  assert.doesNotMatch(mapped.detail_for_report, /secret\.pdf/);
});

test("PDF missing-data errors map to PDF_STRUCTURE_ERROR", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const error = new Error("Missing PDF data.");
  error.name = "MissingPDFException";
  const mapped = renderErrorFromPdfOpenFailure(error);

  assert.equal(mapped.code, "PDF_STRUCTURE_ERROR");
  assert.equal(mapped.message, "无法打开该 PDF 文件。");
  assert.equal(mapped.recoverable, false);
});

test("real corrupt public PDF fixture maps to PDF_STRUCTURE_ERROR", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();
  const pdfjs = await import(
    pathToFileURL(resolve(desktopRoot, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")).href
  );
  const data = new Uint8Array(readFileSync(resolve(desktopRoot, "..", "..", "testdata", "public", "pdf", "corrupt.pdf")));
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  try {
    console.log = () => {};
    console.warn = () => {};
    const loadingTask = pdfjs.getDocument({
      data,
      disableWorker: true,
      disableRange: true,
      disableAutoFetch: true,
      disableStream: true,
      stopAtErrors: true,
      useWasm: false,
      useWorkerFetch: false,
      standardFontDataUrl,
    });
    await loadingTask.promise;
  } catch (error) {
    const mapped = renderErrorFromPdfOpenFailure(error);

    assert.equal(error.name, "InvalidPDFException");
    assert.equal(mapped.code, "PDF_STRUCTURE_ERROR");
    assert.equal(mapped.message, "无法打开该 PDF 文件。");
    return;
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  }

  assert.fail("corrupt public PDF fixture should not open");
});

test("real encrypted public PDF fixture maps to UNSUPPORTED_PDF_FEATURE", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();
  const pdfjs = await import(
    pathToFileURL(resolve(desktopRoot, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")).href
  );
  const data = new Uint8Array(
    readFileSync(resolve(desktopRoot, "..", "..", "testdata", "public", "pdf", "encrypted-password.pdf")),
  );
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    disableRange: true,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: true,
    useWasm: false,
    useWorkerFetch: false,
    standardFontDataUrl,
  });

  try {
    await loadingTask.promise;
  } catch (error) {
    const mapped = renderErrorFromPdfOpenFailure(error);

    assert.equal(error.name, "PasswordException");
    assert.equal(mapped.code, "UNSUPPORTED_PDF_FEATURE");
    assert.equal(mapped.message, "该 PDF 受密码或权限保护，暂不支持打开。");
    assert.doesNotMatch(mapped.detail_for_report, /encrypted-password\.pdf/);
    return;
  } finally {
    await loadingTask.destroy();
  }

  assert.fail("encrypted public PDF fixture should not open without a password");
});

test("unknown PDF renderer errors keep the generic renderer code", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();

  const mapped = renderErrorFromPdfOpenFailure(new Error("canvas failed"));

  assert.equal(mapped.code, "PDF_RENDERER_ERROR");
  assert.equal(mapped.message, "无法打开该 PDF 文件。");
  assert.equal(mapped.recoverable, true);
});

test("safe RenderError objects from Rust are preserved", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();
  const rustError = {
    code: "FILE_NOT_FOUND",
    message: "未找到该文件。",
    recoverable: true,
    safe_to_show: true,
    detail_for_report: "selected path is not a file",
  };

  const mapped = renderErrorFromPdfOpenFailure(rustError);

  assert.deepEqual(mapped, rustError);
});

test("safe Rust RenderError wins over PDF.js fingerprint matching", async () => {
  const { renderErrorFromPdfOpenFailure } = await loadPdfErrorMapping();
  const rustError = {
    code: "FILE_TOO_LARGE",
    message: "Password protected sample exceeded local size budget.",
    recoverable: true,
    safe_to_show: true,
    detail_for_report: "size_bytes=999999999",
  };

  const mapped = renderErrorFromPdfOpenFailure(rustError);

  assert.deepEqual(mapped, rustError);
});
