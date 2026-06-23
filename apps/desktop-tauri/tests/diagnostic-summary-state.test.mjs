import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "diagnosticSummaryState.ts");

async function loadDiagnosticSummaryState() {
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

test("diagnostic summary prefers pending open context over previous session", async () => {
  const { diagnosticSummaryFromState } = await loadDiagnosticSummaryState();

  assert.deepEqual(diagnosticSummaryFromState({
    renderError: { code: "PDF_STRUCTURE_ERROR" },
    message: "无法读取该 PDF 文档。",
    pendingFileType: "pdf",
    session: {
      fileType: "ofd",
      page: "3/10",
      engine: "ofdrw 1 protocol 1",
    },
    scale: "125%",
    action: "正在打开",
    performancePhase: "none",
    performanceDurationBucket: "n/a",
    performanceRecentEvents: "none",
    performanceRecommendation: "insufficient_events",
    createdAt: "2026-06-18T00:00:00.000Z",
  }), {
    code: "PDF_STRUCTURE_ERROR",
    message: "无法读取该 PDF 文档。",
    file_type: "pdf",
    page: "n/a",
    scale: "125%",
    engine: "unknown",
    action: "正在打开",
    performance_phase: "none",
    performance_duration_bucket: "n/a",
    performance_recent_events: "none",
    performance_recommendation: "insufficient_events",
    created_at: "2026-06-18T00:00:00.000Z",
  });
});

test("diagnostic summary falls back to current session when no open context exists", async () => {
  const { diagnosticSummaryFromState } = await loadDiagnosticSummaryState();

  assert.deepEqual(diagnosticSummaryFromState({
    renderError: { code: "  " },
    message: "渲染失败",
    pendingFileType: null,
    session: {
      fileType: "ofd",
      page: "2/4",
      engine: "ofdrw 1 protocol 1",
    },
    scale: "100%",
    action: "",
    performancePhase: "ofd_render",
    performanceDurationBucket: "1-3s",
    performanceRecentEvents: "ofd_open_inspect:250ms_1s | ofd_render_page:1s_3s",
    performanceRecommendation: "page_render_pipeline",
    createdAt: "2026-06-18T00:00:00.000Z",
  }), {
    code: "UNKNOWN",
    message: "渲染失败",
    file_type: "ofd",
    page: "2/4",
    scale: "100%",
    engine: "ofdrw 1 protocol 1",
    action: "unknown",
    performance_phase: "ofd_render",
    performance_duration_bucket: "1-3s",
    performance_recent_events: "ofd_open_inspect:250ms_1s | ofd_render_page:1s_3s",
    performance_recommendation: "page_render_pipeline",
    created_at: "2026-06-18T00:00:00.000Z",
  });
});

test("diagnostic summary redacts local paths from every copied field", async () => {
  const { diagnosticSummaryFromState } = await loadDiagnosticSummaryState();

  const summary = diagnosticSummaryFromState({
    renderError: { code: "LOCAL_ERROR" },
    message: "无法读取 C:\\Users\\tester\\Private Docs\\secret.pdf",
    pendingFileType: null,
    session: {
      fileType: "pdf",
      page: "1/2",
      engine: "pdfjs file:///C:/Users/tester/Private/engine.log",
    },
    scale: "100%",
    action: "打开 /home/tester/private/secret.pdf",
    performancePhase: "none",
    performanceDurationBucket: "n/a",
    performanceRecentEvents: "ofd_render_page:/Users/tester/private/sample.ofd",
    performanceRecommendation: "inspect /mnt/c/Users/tester/private/sample.ofd",
    createdAt: "2026-06-18T00:00:00.000Z",
  });

  assert.deepEqual(summary, {
    code: "LOCAL_ERROR",
    message: "无法读取 [local-path]",
    file_type: "pdf",
    page: "1/2",
    scale: "100%",
    engine: "pdfjs [local-path]",
    action: "打开 [local-path]",
    performance_phase: "none",
    performance_duration_bucket: "n/a",
    performance_recent_events: "ofd_render_page:[local-path]",
    performance_recommendation: "inspect [local-path]",
    created_at: "2026-06-18T00:00:00.000Z",
  });
});

test("diagnostic summary trims oversized values before copying", async () => {
  const { diagnosticSummaryFromState } = await loadDiagnosticSummaryState();
  const longMessage = `${"x".repeat(260)}tail`;

  const summary = diagnosticSummaryFromState({
    renderError: { code: "LONG_MESSAGE" },
    message: longMessage,
    pendingFileType: "pdf",
    session: null,
    scale: "100%",
    action: "正在打开",
    performancePhase: "none",
    performanceDurationBucket: "n/a",
    performanceRecentEvents: "none",
    performanceRecommendation: "insufficient_events",
    createdAt: "2026-06-18T00:00:00.000Z",
  });

  assert.equal(summary.message.length, 203);
  assert.match(summary.message, /\.\.\.$/);
  assert.doesNotMatch(summary.message, /tail$/);
});

test("diagnostic summary keeps readable context around redacted paths", async () => {
  const { diagnosticSummaryFromState } = await loadDiagnosticSummaryState();

  const summary = diagnosticSummaryFromState({
    renderError: { code: "LOCAL_ERROR" },
    message: "无法读取 C:\\Users\\tester\\Private Docs\\secret.pdf，请重新选择文件",
    pendingFileType: "pdf",
    session: null,
    scale: "100%",
    action: "open",
    performancePhase: "none",
    performanceDurationBucket: "n/a",
    performanceRecentEvents: "none",
    performanceRecommendation: "insufficient_events",
    createdAt: "2026-06-18T00:00:00.000Z",
  });

  assert.equal(summary.message, "无法读取 [local-path]，请重新选择文件");
});
