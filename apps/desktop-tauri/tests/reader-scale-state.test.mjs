import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clampReaderScaleState,
  defaultReaderScale,
  isSameReaderScaleState,
  maxReaderScale,
  minReaderScale,
  roundedReaderScaleState,
} from "../src/readerScaleState.ts";

test("reader scale clamps to the supported zoom range", () => {
  assert.equal(clampReaderScaleState(0.1), minReaderScale);
  assert.equal(clampReaderScaleState(1.25), 1.25);
  assert.equal(clampReaderScaleState(9), maxReaderScale);
});

test("reader scale rounds after clamping to two decimal places", () => {
  assert.equal(roundedReaderScaleState(1.234), 1.23);
  assert.equal(roundedReaderScaleState(1.235), 1.24);
  assert.equal(roundedReaderScaleState(0.123), minReaderScale);
  assert.equal(roundedReaderScaleState(9.876), maxReaderScale);
});

test("reader scale clamps damaged numeric state back to the default zoom", () => {
  assert.equal(clampReaderScaleState(Number.NaN), defaultReaderScale);
  assert.equal(clampReaderScaleState(Number.POSITIVE_INFINITY), defaultReaderScale);
  assert.equal(roundedReaderScaleState(Number.NaN), defaultReaderScale);
  assert.equal(roundedReaderScaleState(Number.NEGATIVE_INFINITY), defaultReaderScale);
});

test("reader scale equality keeps the current tolerance boundary", () => {
  assert.equal(isSameReaderScaleState(1, 1.019), true);
  assert.equal(isSameReaderScaleState(1, 1.02), false);
});
