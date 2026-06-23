import assert from "node:assert/strict";
import { test } from "node:test";

import { ofdRenderRequestState } from "../src/ofdRenderRequestState.ts";

test("OFD render request state shows cache hit only for visible cached renders", () => {
  assert.deepEqual(
    ofdRenderRequestState({
      hasCachedPage: true,
      updateVisibleStatus: true,
      currentSessionId: "s1",
      requestedSessionId: "s1",
    }),
    {
      showCacheHitStatus: true,
      cacheResult: true,
    },
  );

  assert.equal(
    ofdRenderRequestState({
      hasCachedPage: true,
      updateVisibleStatus: false,
      currentSessionId: "s1",
      requestedSessionId: "s1",
    }).showCacheHitStatus,
    false,
  );

  assert.equal(
    ofdRenderRequestState({
      hasCachedPage: false,
      updateVisibleStatus: true,
      currentSessionId: "s1",
      requestedSessionId: "s1",
    }).showCacheHitStatus,
    false,
  );
});

test("OFD render request state caches visible or still-current background renders", () => {
  assert.equal(
    ofdRenderRequestState({
      hasCachedPage: false,
      updateVisibleStatus: true,
      currentSessionId: "s1",
      requestedSessionId: "old-s1",
    }).cacheResult,
    true,
  );

  assert.equal(
    ofdRenderRequestState({
      hasCachedPage: false,
      updateVisibleStatus: false,
      currentSessionId: "s1",
      requestedSessionId: "s1",
    }).cacheResult,
    true,
  );

  assert.equal(
    ofdRenderRequestState({
      hasCachedPage: false,
      updateVisibleStatus: false,
      currentSessionId: "s2",
      requestedSessionId: "s1",
    }).cacheResult,
    false,
  );

  assert.equal(
    ofdRenderRequestState({
      hasCachedPage: false,
      updateVisibleStatus: false,
      currentSessionId: null,
      requestedSessionId: "s1",
    }).cacheResult,
    false,
  );
});
