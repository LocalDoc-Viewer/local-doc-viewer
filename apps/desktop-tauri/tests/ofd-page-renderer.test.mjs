import assert from "node:assert/strict";
import { test } from "node:test";

import { renderOfdPageThroughCache } from "../src/ofdPageRenderer.ts";

function createRecordingCache({ cachedPage = null, hasCachedPage = Boolean(cachedPage) } = {}) {
  const calls = [];

  return {
    calls,
    has(sessionId, pageIndex, pageScale) {
      calls.push({ method: "has", sessionId, pageIndex, pageScale });
      return hasCachedPage;
    },
    async renderPage(sessionId, pageIndex, pageScale, render, options) {
      calls.push({ method: "renderPage", sessionId, pageIndex, pageScale, options });
      if (cachedPage) {
        return cachedPage;
      }
      return render();
    },
  };
}

test("OFD page renderer reports visible cache hits before rendering through cache", async () => {
  const cache = createRecordingCache({ hasCachedPage: true });
  const events = [];

  const page = await renderOfdPageThroughCache({
    cache,
    sessionId: "s1",
    pageIndex: 2,
    pageScale: 1.25,
    updateVisibleStatus: true,
    currentSessionId: "s1",
    onVisibleCacheHit() {
      events.push("cache-hit");
    },
    renderPage: async () => {
      events.push("render");
      return { session_id: "s1", page_index: 2, scale: 1.25 };
    },
  });

  assert.deepEqual(events, ["cache-hit", "render"]);
  assert.deepEqual(page, { session_id: "s1", page_index: 2, scale: 1.25 });
  assert.deepEqual(cache.calls, [
    { method: "has", sessionId: "s1", pageIndex: 2, pageScale: 1.25 },
    {
      method: "renderPage",
      sessionId: "s1",
      pageIndex: 2,
      pageScale: 1.25,
      options: { cacheResult: true },
    },
  ]);
});

test("OFD page renderer skips caching stale background renders", async () => {
  const cache = createRecordingCache();

  await renderOfdPageThroughCache({
    cache,
    sessionId: "old-s1",
    pageIndex: 0,
    pageScale: 1,
    updateVisibleStatus: false,
    currentSessionId: "s1",
    onVisibleCacheHit() {
      throw new Error("background render must not report visible cache hits");
    },
    renderPage: async () => ({ session_id: "old-s1", page_index: 0, scale: 1 }),
  });

  assert.deepEqual(cache.calls.at(-1).options, { cacheResult: false });
});

test("OFD page renderer can report completed uncached renders for diagnostics", async () => {
  const cache = createRecordingCache();
  const renderedPages = [];

  const page = await renderOfdPageThroughCache({
    cache,
    sessionId: "s1",
    pageIndex: 4,
    pageScale: 1.5,
    updateVisibleStatus: false,
    currentSessionId: "s1",
    onVisibleCacheHit() {
      throw new Error("uncached background render must not report visible cache hits");
    },
    onRendered(renderedPage) {
      renderedPages.push(renderedPage);
    },
    renderPage: async () => ({ session_id: "s1", page_index: 4, scale: 1.5, duration_ms: 420 }),
  });

  assert.deepEqual(page, { session_id: "s1", page_index: 4, scale: 1.5, duration_ms: 420 });
  assert.deepEqual(renderedPages, [page]);
});

test("OFD page renderer does not report cached pages as completed renders", async () => {
  const cachedPage = { session_id: "s1", page_index: 1, scale: 1 };
  const cache = createRecordingCache({ cachedPage });

  const renderedPages = [];
  const page = await renderOfdPageThroughCache({
    cache,
    sessionId: "s1",
    pageIndex: 1,
    pageScale: 1,
    updateVisibleStatus: false,
    currentSessionId: "s1",
    onVisibleCacheHit() {
      throw new Error("background cache hit must stay silent");
    },
    onRendered(renderedPage) {
      renderedPages.push(renderedPage);
    },
    renderPage: async () => {
      throw new Error("cached page must not call renderer");
    },
  });

  assert.equal(page, cachedPage);
  assert.deepEqual(renderedPages, []);
});
