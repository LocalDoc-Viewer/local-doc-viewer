import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearAllOfdPageWork,
  clearOfdPageCacheExceptSession,
  clearOfdPageCacheForSession,
  deleteOfdPageCacheFromDataset,
} from "../src/ofdPageCacheController.ts";

function createRecordingCache() {
  const calls = [];

  return {
    calls,
    clearSession(sessionId) {
      calls.push({ method: "clearSession", sessionId });
    },
    clearExceptSession(sessionId) {
      calls.push({ method: "clearExceptSession", sessionId });
    },
    clearAll() {
      calls.push({ method: "clearAll" });
    },
    deletePage(sessionId, pageIndex, scale) {
      calls.push({ method: "deletePage", sessionId, pageIndex, scale });
    },
  };
}

test("OFD page cache controller wraps session cleanup commands", () => {
  const cache = createRecordingCache();

  clearOfdPageCacheForSession(cache, { id: "s1" });
  clearOfdPageCacheExceptSession(cache, "s2");
  clearAllOfdPageWork(cache);

  assert.deepEqual(cache.calls, [
    { method: "clearSession", sessionId: "s1" },
    { method: "clearExceptSession", sessionId: "s2" },
    { method: "clearAll" },
  ]);
});

test("OFD page cache controller deletes a page from valid image dataset values", () => {
  const cache = createRecordingCache();

  const deleted = deleteOfdPageCacheFromDataset(cache, {
    sessionId: "s1",
    pageIndex: "3",
    pageScale: "1.25",
  });

  assert.equal(deleted, true);
  assert.deepEqual(cache.calls, [
    { method: "deletePage", sessionId: "s1", pageIndex: 3, scale: 1.25 },
  ]);
});

test("OFD page cache controller ignores invalid image dataset values", () => {
  const cache = createRecordingCache();

  const deleted = deleteOfdPageCacheFromDataset(cache, {
    sessionId: "s1",
    pageIndex: "not-a-page",
    pageScale: "1",
  });

  assert.equal(deleted, false);
  assert.deepEqual(cache.calls, []);
});
