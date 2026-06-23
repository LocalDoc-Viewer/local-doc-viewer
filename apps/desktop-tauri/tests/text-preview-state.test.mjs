import assert from "node:assert/strict";
import { test } from "node:test";

import { lineIndexFromTextOffset, lineNumbersForText } from "../src/textPreviewState.ts";

test("text preview line numbers follow physical newline count", () => {
  assert.equal(lineNumbersForText(""), "1");
  assert.equal(lineNumbersForText("alpha"), "1");
  assert.equal(lineNumbersForText("alpha\nbeta\ngamma"), "1\n2\n3");
});

test("text preview line index clamps offsets to existing lines", () => {
  const text = "alpha\nbeta\ngamma";

  assert.equal(lineIndexFromTextOffset(text, -1), 0);
  assert.equal(lineIndexFromTextOffset(text, 0), 0);
  assert.equal(lineIndexFromTextOffset(text, 6), 1);
  assert.equal(lineIndexFromTextOffset(text, 1000), 2);
});
