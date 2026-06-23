import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ofdPageImageCacheTargetFromDataset,
  ofdPageImageDataset,
} from "../src/ofdPageImageState.ts";

test("OFD page image dataset serializes page cache identity", () => {
  assert.deepEqual(
    ofdPageImageDataset({
      sessionId: "session-1",
      pageIndex: 3,
      scale: 1.25,
    }),
    {
      cacheKey: "local:session-1:3:1.25",
      sessionId: "session-1",
      pageIndex: "3",
      pageScale: "1.25",
    },
  );
});

test("OFD page image cache target parses valid image dataset values", () => {
  assert.deepEqual(
    ofdPageImageCacheTargetFromDataset({
      sessionId: "session-1",
      pageIndex: "3",
      pageScale: "1.25",
    }),
    {
      sessionId: "session-1",
      pageIndex: 3,
      scale: 1.25,
    },
  );
});

test("OFD page image cache target rejects incomplete or invalid dataset values", () => {
  assert.equal(
    ofdPageImageCacheTargetFromDataset({
      sessionId: "",
      pageIndex: "3",
      pageScale: "1.25",
    }),
    null,
  );
  assert.equal(
    ofdPageImageCacheTargetFromDataset({
      sessionId: "session-1",
      pageIndex: "3.2",
      pageScale: "1.25",
    }),
    null,
  );
  assert.equal(
    ofdPageImageCacheTargetFromDataset({
      sessionId: "session-1",
      pageIndex: "3",
      pageScale: "not-a-scale",
    }),
    null,
  );
  assert.equal(
    ofdPageImageCacheTargetFromDataset({
      sessionId: "session-1",
      pageIndex: "3",
      pageScale: "Infinity",
    }),
    null,
  );
});
