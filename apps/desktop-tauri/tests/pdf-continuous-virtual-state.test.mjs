import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pdfContinuousDefaultEagerRadius,
  pdfContinuousDefaultWindowRadius,
  estimatedPdfContinuousPageIndex,
  pdfContinuousPageLayout,
  pdfContinuousPageSizeIndex,
  pdfContinuousPagesToRecycle,
  pdfContinuousRenderablePageIndexes,
  pdfContinuousRenderQueuePlan,
  pdfContinuousRenderWindowPlan,
  pdfContinuousRenderPlan,
  pdfContinuousRenderBlockedPageIndexes,
  shouldRenderPdfContinuousSlotNow,
} from "../src/pdfContinuousVirtualState.ts";

const pageSizes = Array.from({ length: 8 }, (_, index) => ({
  index,
  width_pt: 612 + index,
  height_pt: 792 + index,
}));

test("PDF continuous render eagerly renders only pages near the current page", () => {
  assert.equal(
    shouldRenderPdfContinuousSlotNow({ pageIndex: 1, currentPageIndex: 3, eagerRadius: 2 }),
    true,
  );
  assert.equal(
    shouldRenderPdfContinuousSlotNow({ pageIndex: 6, currentPageIndex: 3, eagerRadius: 2 }),
    false,
  );
});

test("PDF continuous render plan keeps all slots but renders only a nearby window", () => {
  const plan = pdfContinuousRenderPlan({
    pageCount: 8,
    currentPageIndex: 3,
    scale: 1.25,
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
    width: Math.round((612 + 6) * 1.25),
    height: Math.round((792 + 6) * 1.25),
    shouldRenderNow: false,
  });
});

test("PDF continuous window plan keeps nearby slots and accounts for omitted spacer height", () => {
  const plan = pdfContinuousRenderWindowPlan({
    pageCount: 10,
    currentPageIndex: 5,
    scale: 1,
    pageSizes,
    windowRadius: 2,
    gapPx: 18,
  });

  assert.deepEqual(
    plan.slots.map((slot) => [slot.pageIndex, slot.shouldRenderNow]),
    [
      [3, true],
      [4, true],
      [5, true],
      [6, true],
      [7, true],
    ],
  );
  assert.equal(plan.startPageIndex, 3);
  assert.equal(plan.endPageIndex, 7);
  assert.equal(plan.beforeHeight, (792 + 0) + (792 + 1) + (792 + 2) + 18 * 2);
  assert.equal(plan.afterHeight, 792 + 792 + 18);
});

test("PDF continuous window plan keeps 990-page documents bounded", () => {
  const longPageSizes = Array.from({ length: 990 }, (_, index) => ({
    index,
    width_pt: 612,
    height_pt: 792,
  }));
  const plan = pdfContinuousRenderWindowPlan({
    pageCount: 990,
    currentPageIndex: 494,
    scale: 1,
    pageSizes: longPageSizes,
  });

  assert.equal(plan.slots.length, pdfContinuousDefaultWindowRadius * 2 + 1);
  assert.equal(plan.startPageIndex, 494 - pdfContinuousDefaultWindowRadius);
  assert.equal(plan.endPageIndex, 494 + pdfContinuousDefaultWindowRadius);
  assert.equal(
    plan.slots.filter((slot) => slot.shouldRenderNow).length,
    pdfContinuousDefaultEagerRadius * 2 + 1,
  );
  assert.ok(plan.beforeHeight > 0);
  assert.ok(plan.afterHeight > 0);
});

test("PDF continuous page estimate uses cumulative page heights", () => {
  assert.equal(
    estimatedPdfContinuousPageIndex({
      scrollTop: 500,
      pageCount: 3,
      scale: 1,
      pageSizes: [
        { index: 0, width_pt: 612, height_pt: 300 },
        { index: 1, width_pt: 612, height_pt: 900 },
        { index: 2, width_pt: 612, height_pt: 300 },
      ],
      gapPx: 18,
    }),
    1,
  );
  assert.equal(
    estimatedPdfContinuousPageIndex({
      scrollTop: 1240,
      pageCount: 3,
      scale: 1,
      pageSizes: [
        { index: 0, width_pt: 612, height_pt: 300 },
        { index: 1, width_pt: 612, height_pt: 900 },
        { index: 2, width_pt: 612, height_pt: 300 },
      ],
      gapPx: 18,
    }),
    2,
  );
});

test("PDF continuous page layout exposes offsets for binary page estimates", () => {
  const layout = pdfContinuousPageLayout({
    pageCount: 3,
    scale: 2,
    pageSizes: [
      { index: 0, width_pt: 612, height_pt: 100 },
      { index: 1, width_pt: 612, height_pt: 200 },
      { index: 2, width_pt: 612, height_pt: 300 },
    ],
    gapPx: 10,
  });

  assert.deepEqual(layout.pageStarts, [0, 210, 620]);
  assert.deepEqual(layout.pageEnds, [200, 610, 1220]);
  assert.equal(layout.totalHeight, 1220);
  assert.equal(
    estimatedPdfContinuousPageIndex({
      scrollTop: 621,
      pageCount: 3,
      scale: 2,
      pageSizes: [
        { index: 0, width_pt: 612, height_pt: 100 },
        { index: 1, width_pt: 612, height_pt: 200 },
        { index: 2, width_pt: 612, height_pt: 300 },
      ],
      gapPx: 10,
    }),
    2,
  );
});

test("PDF continuous page size index is reusable across window and layout plans", () => {
  const pageSizeIndex = pdfContinuousPageSizeIndex(pageSizes);
  const layout = pdfContinuousPageLayout({
    pageCount: 8,
    scale: 1,
    pageSizes,
    pageSizeIndex,
  });
  const plan = pdfContinuousRenderWindowPlan({
    pageCount: 8,
    currentPageIndex: 4,
    scale: 1,
    pageSizes,
    pageSizeIndex,
    layout,
    windowRadius: 1,
  });

  assert.equal(pageSizeIndex.get(6)?.height_pt, 798);
  assert.deepEqual(
    plan.slots.map((slot) => [slot.pageIndex, slot.width, slot.height]),
    [
      [3, 615, 795],
      [4, 616, 796],
      [5, 617, 797],
    ],
  );
});

test("PDF continuous render queue deduplicates and prioritizes pages near the current page", () => {
  assert.deepEqual(
    pdfContinuousRenderQueuePlan({
      candidatePageIndexes: [20, 18, 20, 22, 19, 120, 21],
      currentPageIndex: 20,
      blockedPageIndexes: [19],
      maxQueuedPages: 4,
    }),
    [20, 21, 18, 22],
  );
});

test("PDF continuous recycle plan unloads rendered pages outside the keep window", () => {
  assert.deepEqual(
    pdfContinuousPagesToRecycle({
      renderedPageIndexes: [1, 48, 50, 52, 80],
      currentPageIndex: 50,
      keepRadius: 3,
    }),
    [1, 80],
  );
});

test("PDF continuous blocked page indexes merge rendered and loading state without DOM scans", () => {
  assert.deepEqual(
    pdfContinuousRenderBlockedPageIndexes({
      renderedPageIndexes: [4, 2, 4, -1],
      loadingPageIndexes: [3, 2, Number.NaN],
    }),
    [2, 3, 4],
  );
});

test("PDF continuous renderable page indexes skip blocked slots from the slot index", () => {
  assert.deepEqual(
    pdfContinuousRenderablePageIndexes({
      slotPageIndexes: [8, 3, 5, 3, -2],
      blockedPageIndexes: [5],
    }),
    [3, 8],
  );
});
