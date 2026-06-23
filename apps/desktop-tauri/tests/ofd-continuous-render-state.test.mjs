import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ofdContinuousPageIndexes,
  ofdContinuousRenderPlan,
  shouldRenderOfdContinuousSlotNow,
} from "../src/ofdContinuousRenderState.ts";

const pageSizes = Array.from({ length: 8 }, (_, index) => ({
  index,
  width_pt: 210 + index,
  height_pt: 297 + index,
}));

test("OFD continuous render still creates a slot for every page", () => {
  assert.deepEqual(ofdContinuousPageIndexes(4), [0, 1, 2, 3]);
  assert.deepEqual(ofdContinuousPageIndexes(0), []);
});

test("OFD continuous render eagerly renders only pages near the current page", () => {
  assert.equal(
    shouldRenderOfdContinuousSlotNow({ pageIndex: 1, currentPageIndex: 3, eagerRadius: 2 }),
    true,
  );
  assert.equal(
    shouldRenderOfdContinuousSlotNow({ pageIndex: 6, currentPageIndex: 3, eagerRadius: 2 }),
    false,
  );
});

test("OFD continuous render plan preserves page sizes for lazy slots", () => {
  const plan = ofdContinuousRenderPlan({
    pageCount: 8,
    currentPageIndex: 3,
    scale: 1.5,
    pageSizes,
  });

  assert.equal(plan.length, 8);
  assert.deepEqual(
    plan.map((slot) => [slot.pageIndex, slot.shouldRenderNow]),
    [
      [0, false],
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, true],
      [6, false],
      [7, false],
    ],
  );
  assert.deepEqual(plan[6], {
    pageIndex: 6,
    width: Math.round((210 + 6) * 2 * 1.5),
    height: Math.round((297 + 6) * 2 * 1.5),
    shouldRenderNow: false,
  });
});
