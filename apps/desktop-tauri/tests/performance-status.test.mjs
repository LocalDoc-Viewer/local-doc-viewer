import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");

function readPerformanceStatusTs() {
  return readFileSync(resolve(desktopRoot, "src", "performanceStatus.ts"), "utf8");
}

async function loadPerformanceStatus() {
  const modulePath = resolve(desktopRoot, "src", "performanceStatus.ts");
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

test("performance status uses coarse buckets instead of exact timings", () => {
  const source = readPerformanceStatusTs();

  assert.match(source, /export function durationBucket/);
  assert.match(source, /"lt_250ms"/);
  assert.match(source, /"250ms_1s"/);
  assert.match(source, /"1s_3s"/);
  assert.match(source, /"3s_10s"/);
  assert.match(source, /"gte_10s"/);
  assert.doesNotMatch(source, /absolute_path|document_text|content/);
});

test("performance status exposes explicit OFD phases", () => {
  const source = readPerformanceStatusTs();

  assert.match(source, /"ofd_open_inspect"/);
  assert.match(source, /"ofd_render_wait"/);
  assert.match(source, /"ofd_render_page"/);
  assert.match(source, /"ofd_cache_hit"/);
  assert.match(source, /正在解析 OFD/);
  assert.match(source, /正在渲染 OFD 页面/);
  assert.match(source, /正在加载缓存/);
});

test("performance trace records only coarse recent OFD phase buckets", async () => {
  const source = readPerformanceStatusTs();
  const traceMatch = source.match(/export function appendPerformanceTraceEvent[\s\S]*?export function formatPerformanceTrace[\s\S]*?\n\}/);
  const {
    appendPerformanceTraceEvent,
    formatPerformanceTrace,
    performanceStatus,
  } = await loadPerformanceStatus();

  assert.ok(traceMatch, "performance trace helpers should be found");
  assert.match(source, /status\.phase === "idle"/);
  assert.doesNotMatch(traceMatch[0], /path|absolute_path|document_text|content|duration_ms|exact/i);

  let events = appendPerformanceTraceEvent([], performanceStatus("ofd_open_inspect", 320));
  events = appendPerformanceTraceEvent(events, performanceStatus("idle"));
  events = appendPerformanceTraceEvent(events, performanceStatus("ofd_render_wait", 2300));
  events = appendPerformanceTraceEvent(events, performanceStatus("ofd_render_page", 2200));
  events = appendPerformanceTraceEvent(events, performanceStatus("ofd_cache_hit"), 2);
  events = appendPerformanceTraceEvent(events, performanceStatus("ofd_render_page", 12000), 2);

  assert.deepEqual(events, [
    { phase: "ofd_cache_hit", duration_bucket: "unknown" },
    { phase: "ofd_render_page", duration_bucket: "gte_10s" },
  ]);
  assert.equal(formatPerformanceTrace(events), "ofd_cache_hit:unknown | ofd_render_page:gte_10s");
  assert.equal(formatPerformanceTrace([]), "none");
});

test("performance trace recommends the next OFD performance route from coarse events", async () => {
  const source = readPerformanceStatusTs();
  const {
    recommendOfdPerformanceRoute,
  } = await loadPerformanceStatus();

  assert.match(source, /export function recommendOfdPerformanceRoute/);
  assert.doesNotMatch(source, /path|absolute_path|document_text|content|query|duration_ms|exact/i);
  assert.equal(recommendOfdPerformanceRoute([]), "insufficient_events");
  assert.equal(recommendOfdPerformanceRoute([
    { phase: "ofd_open_inspect", duration_bucket: "3s_10s" },
    { phase: "ofd_render_page", duration_bucket: "lt_250ms" },
  ]), "inspect_or_renderer_lifecycle");
  assert.equal(recommendOfdPerformanceRoute([
    { phase: "ofd_render_wait", duration_bucket: "3s_10s" },
    { phase: "ofd_render_page", duration_bucket: "lt_250ms" },
  ]), "frontend_wait_pipeline");
  assert.equal(recommendOfdPerformanceRoute([
    { phase: "ofd_render_wait", duration_bucket: "3s_10s" },
    { phase: "ofd_render_page", duration_bucket: "3s_10s" },
  ]), "page_render_pipeline");
  assert.equal(recommendOfdPerformanceRoute([
    { phase: "ofd_render_page", duration_bucket: "3s_10s" },
    { phase: "ofd_render_page", duration_bucket: "1s_3s" },
  ]), "page_render_pipeline");
  assert.equal(recommendOfdPerformanceRoute([
    { phase: "ofd_cache_hit", duration_bucket: "3s_10s" },
    { phase: "ofd_render_page", duration_bucket: "lt_250ms" },
  ]), "cache_pipeline");
  assert.equal(recommendOfdPerformanceRoute([
    { phase: "ofd_open_inspect", duration_bucket: "250ms_1s" },
    { phase: "ofd_render_page", duration_bucket: "lt_250ms" },
  ]), "watch_continuous_interaction");
});
