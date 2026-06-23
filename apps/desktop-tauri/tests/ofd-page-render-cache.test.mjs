import assert from "node:assert/strict";
import { test } from "node:test";

import { createOfdPageRenderCache } from "../src/ofdPageRenderCache.ts";

function bitmap(sessionId, pageIndex, scale) {
  return {
    session_id: sessionId,
    page_index: pageIndex,
    scale,
    width_px: 100,
    height_px: 200,
    image_ref: `asset://${sessionId}/${pageIndex}/${scale}`,
    duration_ms: 12,
  };
}

test("OFD page render cache reuses cached and in-flight renders by session page and scale", async () => {
  const cache = createOfdPageRenderCache({ maxEntries: 4 });
  let renderCalls = 0;
  const render = async () => {
    renderCalls += 1;
    return bitmap("s1", 0, 1);
  };

  const [first, second] = await Promise.all([
    cache.renderPage("s1", 0, 1, render),
    cache.renderPage("s1", 0, 1, render),
  ]);
  const third = await cache.renderPage("s1", 0, 1, render);

  assert.equal(renderCalls, 1);
  assert.equal(first, second);
  assert.equal(second, third);
});

test("OFD page render cache keeps distinct scales separate and trims old entries", async () => {
  const cache = createOfdPageRenderCache({ maxEntries: 2 });

  await cache.renderPage("s1", 0, 1, async () => bitmap("s1", 0, 1));
  await cache.renderPage("s1", 1, 1, async () => bitmap("s1", 1, 1));
  await cache.renderPage("s1", 2, 1, async () => bitmap("s1", 2, 1));

  assert.equal(cache.has("s1", 0, 1), false);
  assert.equal(cache.has("s1", 1, 1), true);
  assert.equal(cache.has("s1", 2, 1), true);
  assert.equal(cache.has("s1", 2, 1.01), false);
});

test("OFD page render cache clears cached and pending work by session", async () => {
  const cache = createOfdPageRenderCache({ maxEntries: 4 });
  let resolvePending;
  const pending = cache.renderPage(
    "s1",
    0,
    1,
    () => new Promise((resolve) => {
      resolvePending = () => resolve(bitmap("s1", 0, 1));
    }),
  );

  assert.equal(cache.hasPending("s1", 0, 1), true);
  cache.clearSession("s1");
  assert.equal(cache.hasPending("s1", 0, 1), false);

  resolvePending();
  await pending;
  assert.equal(cache.has("s1", 0, 1), true);

  cache.clearExceptSession("s2");
  assert.equal(cache.has("s1", 0, 1), false);
});

test("OFD page render cache can skip caching stale background renders", async () => {
  const cache = createOfdPageRenderCache({ maxEntries: 4 });
  let renderCalls = 0;

  const first = await cache.renderPage(
    "s1",
    0,
    1,
    async () => {
      renderCalls += 1;
      return bitmap("s1", 0, 1);
    },
    { cacheResult: false },
  );
  const second = await cache.renderPage(
    "s1",
    0,
    1,
    async () => {
      renderCalls += 1;
      return bitmap("s1", 0, 1);
    },
  );

  assert.notEqual(first, second);
  assert.equal(renderCalls, 2);
  assert.equal(cache.has("s1", 0, 1), true);
});
