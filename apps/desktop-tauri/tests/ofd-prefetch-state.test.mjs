import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adjacentOfdPrefetchTargets,
  isCurrentOfdPrefetchBatch,
  nextOfdPrefetchBatchId,
  shouldRunOfdPrefetchTarget,
} from "../src/ofdPrefetchState.ts";

const currentOfdSession = {
  id: "ofd-session",
  file_type: "ofd",
  page_count: 5,
};

test("OFD adjacent prefetch targets nearby pages for the current OFD session", () => {
  assert.deepEqual(
    adjacentOfdPrefetchTargets({
      currentSession: currentOfdSession,
      renderedSessionId: "ofd-session",
      renderedPageIndex: 2,
      renderedScale: 1.5,
    }),
    [
      { sessionId: "ofd-session", pageIndex: 1, scale: 1.5 },
      { sessionId: "ofd-session", pageIndex: 3, scale: 1.5 },
      { sessionId: "ofd-session", pageIndex: 0, scale: 1.5 },
      { sessionId: "ofd-session", pageIndex: 4, scale: 1.5 },
    ],
  );
});

test("OFD adjacent prefetch skips pages outside the document bounds", () => {
  assert.deepEqual(
    adjacentOfdPrefetchTargets({
      currentSession: currentOfdSession,
      renderedSessionId: "ofd-session",
      renderedPageIndex: 0,
      renderedScale: 1,
    }),
    [
      { sessionId: "ofd-session", pageIndex: 1, scale: 1 },
      { sessionId: "ofd-session", pageIndex: 2, scale: 1 },
    ],
  );

  assert.deepEqual(
    adjacentOfdPrefetchTargets({
      currentSession: currentOfdSession,
      renderedSessionId: "ofd-session",
      renderedPageIndex: 4,
      renderedScale: 1,
    }),
    [
      { sessionId: "ofd-session", pageIndex: 3, scale: 1 },
      { sessionId: "ofd-session", pageIndex: 2, scale: 1 },
    ],
  );
});

test("OFD adjacent prefetch skips stale or non-OFD sessions", () => {
  assert.deepEqual(
    adjacentOfdPrefetchTargets({
      currentSession: { id: "other", file_type: "ofd", page_count: 5 },
      renderedSessionId: "ofd-session",
      renderedPageIndex: 2,
      renderedScale: 1,
    }),
    [],
  );

  assert.deepEqual(
    adjacentOfdPrefetchTargets({
      currentSession: { id: "ofd-session", file_type: "pdf", page_count: 5 },
      renderedSessionId: "ofd-session",
      renderedPageIndex: 2,
      renderedScale: 1,
    }),
    [],
  );

  assert.deepEqual(
    adjacentOfdPrefetchTargets({
      currentSession: null,
      renderedSessionId: "ofd-session",
      renderedPageIndex: 2,
      renderedScale: 1,
    }),
    [],
  );
});

test("OFD queued prefetch skips targets no longer near the current page and scale", () => {
  assert.equal(
    shouldRunOfdPrefetchTarget({
      currentSession: currentOfdSession,
      currentPageIndex: 2,
      currentScale: 1.5,
      target: { sessionId: "ofd-session", pageIndex: 4, scale: 1.5 },
    }),
    true,
  );

  assert.equal(
    shouldRunOfdPrefetchTarget({
      currentSession: currentOfdSession,
      currentPageIndex: 0,
      currentScale: 1.5,
      target: { sessionId: "ofd-session", pageIndex: 4, scale: 1.5 },
    }),
    false,
  );

  assert.equal(
    shouldRunOfdPrefetchTarget({
      currentSession: currentOfdSession,
      currentPageIndex: 2,
      currentScale: 1.25,
      target: { sessionId: "ofd-session", pageIndex: 4, scale: 1.5 },
    }),
    false,
  );

  assert.equal(
    shouldRunOfdPrefetchTarget({
      currentSession: { id: "other", file_type: "ofd", page_count: 5 },
      currentPageIndex: 2,
      currentScale: 1.5,
      target: { sessionId: "ofd-session", pageIndex: 4, scale: 1.5 },
    }),
    false,
  );
});

test("OFD queued prefetch batches use latest-wins ids", () => {
  const firstBatchId = nextOfdPrefetchBatchId(0);
  const secondBatchId = nextOfdPrefetchBatchId(firstBatchId);

  assert.equal(firstBatchId, 1);
  assert.equal(secondBatchId, 2);
  assert.equal(isCurrentOfdPrefetchBatch({ batchId: firstBatchId, currentBatchId: secondBatchId }), false);
  assert.equal(isCurrentOfdPrefetchBatch({ batchId: secondBatchId, currentBatchId: secondBatchId }), true);
});
