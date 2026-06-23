import assert from "node:assert/strict";
import { test } from "node:test";

import {
  currentOfdPageTextFromView,
  documentFindPageTextsFromOfdView,
} from "../src/ofdTextBridge.ts";

const sampleTextView = {
  session_id: "s1",
  page_count: 3,
  pages: [
    { index: 0, width_pt: 210, height_pt: 297, text: "First page" },
    { index: 1, width_pt: 210, height_pt: 297, text: "  Current page text  \n" },
    { index: 2, width_pt: 210, height_pt: 297, text: "Last page" },
  ],
  duration_ms: 12,
  warnings: [],
};

test("OFD text bridge maps sidecar pages to document find page texts", () => {
  assert.deepEqual(documentFindPageTextsFromOfdView(sampleTextView), [
    { pageIndex: 0, text: "First page" },
    { pageIndex: 1, text: "  Current page text  \n" },
    { pageIndex: 2, text: "Last page" },
  ]);
});

test("OFD text bridge returns trimmed current page text", () => {
  assert.equal(currentOfdPageTextFromView(sampleTextView, 1), "Current page text");
  assert.equal(currentOfdPageTextFromView(sampleTextView, 99), "");
});
