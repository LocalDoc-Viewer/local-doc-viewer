import assert from "node:assert/strict";
import { test } from "node:test";

import { previousDocumentCacheCleanupTarget } from "../src/ofdCacheCleanupState.ts";

test("previous document cache cleanup skips missing fake and PDF sessions", () => {
  assert.equal(previousDocumentCacheCleanupTarget(null, null), null);
  assert.equal(
    previousDocumentCacheCleanupTarget({ id: "fake-session", file_type: "fake" }, null),
    null,
  );
  assert.equal(
    previousDocumentCacheCleanupTarget({ id: "pdf-session", file_type: "pdf" }, null),
    null,
  );
});

test("previous document cache cleanup skips the same reused session", () => {
  assert.equal(
    previousDocumentCacheCleanupTarget(
      { id: "same-session", file_type: "ofd" },
      { id: "same-session", file_type: "ofd" },
    ),
    null,
  );
});

test("previous document cache cleanup returns the previous non-PDF session id", () => {
  assert.equal(
    previousDocumentCacheCleanupTarget(
      { id: "old-ofd-session", file_type: "ofd" },
      { id: "new-ofd-session", file_type: "ofd" },
    ),
    "old-ofd-session",
  );
  assert.equal(
    previousDocumentCacheCleanupTarget(
      { id: "old-image-session", file_type: "image" },
      null,
    ),
    "old-image-session",
  );
});
