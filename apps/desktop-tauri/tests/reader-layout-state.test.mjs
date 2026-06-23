import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampDocumentCenterWidthState,
  clampReaderNavigationFontSizeState,
  clampReaderNavigationWidthState,
  defaultDocumentCenterWidth,
  defaultReaderNavigationFontSize,
  defaultReaderNavigationWidth,
} from "../src/readerLayoutState.ts";

test("document center width clamps to product min, max, and viewport budget", () => {
  assert.equal(clampDocumentCenterWidthState(120, 1200), 220);
  assert.equal(clampDocumentCenterWidthState(999, 1200), 340);
  assert.equal(clampDocumentCenterWidthState(999, 900), 288);
  assert.equal(clampDocumentCenterWidthState(999, 0), 340);
  assert.equal(clampDocumentCenterWidthState(defaultDocumentCenterWidth, 1200), 260);
});

test("reader navigation width clamps to product min, max, and viewport budget", () => {
  assert.equal(clampReaderNavigationWidthState(120, 1200), 200);
  assert.equal(clampReaderNavigationWidthState(999, 1200), 360);
  assert.equal(clampReaderNavigationWidthState(999, 900), 315);
  assert.equal(clampReaderNavigationWidthState(999, 0), 360);
  assert.equal(clampReaderNavigationWidthState(defaultReaderNavigationWidth, 1200), 260);
});

test("reader navigation font size clamps to the supported display range", () => {
  assert.equal(clampReaderNavigationFontSizeState(10), 13);
  assert.equal(clampReaderNavigationFontSizeState(defaultReaderNavigationFontSize), 15);
  assert.equal(clampReaderNavigationFontSizeState(99), 17);
});

test("reader layout clamps damaged numeric state back to product defaults", () => {
  assert.equal(clampDocumentCenterWidthState(Number.NaN, 1200), defaultDocumentCenterWidth);
  assert.equal(clampDocumentCenterWidthState(Number.POSITIVE_INFINITY, 1200), defaultDocumentCenterWidth);
  assert.equal(clampReaderNavigationWidthState(Number.NaN, 1200), defaultReaderNavigationWidth);
  assert.equal(clampReaderNavigationWidthState(Number.NEGATIVE_INFINITY, 1200), defaultReaderNavigationWidth);
  assert.equal(clampReaderNavigationFontSizeState(Number.NaN), defaultReaderNavigationFontSize);
  assert.equal(clampReaderNavigationFontSizeState(Number.POSITIVE_INFINITY), defaultReaderNavigationFontSize);
});
