export type PdfContinuousPageSize = {
  index: number;
  width_pt: number;
  height_pt: number;
};

export const pdfContinuousDefaultEagerRadius = 2;
export const pdfContinuousDefaultWindowRadius = 8;

export type PdfContinuousRenderPlanInput = {
  pageCount: number;
  currentPageIndex: number;
  scale: number;
  pageSizes: PdfContinuousPageSize[];
  pageSizeIndex?: PdfContinuousPageSizeIndex;
  eagerRadius?: number;
};

export type PdfContinuousSlotPlan = {
  pageIndex: number;
  width: number;
  height: number;
  shouldRenderNow: boolean;
};

export type PdfContinuousRenderQueuePlanInput = {
  candidatePageIndexes: number[];
  currentPageIndex: number;
  blockedPageIndexes?: number[];
  maxQueuedPages?: number;
};

export type PdfContinuousRecyclePlanInput = {
  renderedPageIndexes: number[];
  currentPageIndex: number;
  keepRadius?: number;
};

export type PdfContinuousRenderBlockedPageIndexesInput = {
  renderedPageIndexes: number[];
  loadingPageIndexes?: number[];
};

export type PdfContinuousRenderablePageIndexesInput = {
  slotPageIndexes: number[];
  blockedPageIndexes?: number[];
};

export type PdfContinuousRenderWindowPlanInput = PdfContinuousRenderPlanInput & {
  windowRadius?: number;
  gapPx?: number;
  layout?: PdfContinuousPageLayout;
};

export type PdfContinuousPageLayoutInput = {
  pageCount: number;
  scale: number;
  pageSizes: PdfContinuousPageSize[];
  pageSizeIndex?: PdfContinuousPageSizeIndex;
  gapPx?: number;
};

export type PdfContinuousPageSizeIndex = Map<number, PdfContinuousPageSize>;

export type PdfContinuousPageLayout = {
  pageStarts: number[];
  pageEnds: number[];
  totalHeight: number;
};

export type PdfContinuousRenderWindowPlan = {
  slots: PdfContinuousSlotPlan[];
  startPageIndex: number;
  endPageIndex: number;
  beforeHeight: number;
  afterHeight: number;
};

export type EstimatedPdfContinuousPageInput = {
  scrollTop: number;
  pageCount: number;
  scale: number;
  pageSizes: PdfContinuousPageSize[];
  pageSizeIndex?: PdfContinuousPageSizeIndex;
  gapPx?: number;
  layout?: PdfContinuousPageLayout;
};

export function shouldRenderPdfContinuousSlotNow({
  pageIndex,
  currentPageIndex,
  eagerRadius = pdfContinuousDefaultEagerRadius,
}: {
  pageIndex: number;
  currentPageIndex: number;
  eagerRadius?: number;
}) {
  return Math.abs(pageIndex - currentPageIndex) <= Math.max(0, eagerRadius);
}

export function pdfContinuousPageSizeIndex(pageSizes: PdfContinuousPageSize[]): PdfContinuousPageSizeIndex {
  return new Map(pageSizes.map((page) => [page.index, page]));
}

export function pdfContinuousSlotSize({
  pageIndex,
  scale,
  pageSizes,
  pageSizeIndex,
}: {
  pageIndex: number;
  scale: number;
  pageSizes: PdfContinuousPageSize[];
  pageSizeIndex?: PdfContinuousPageSizeIndex;
}) {
  const pageInfo = pageSizeIndex?.get(pageIndex) ?? pageSizes.find((page) => page.index === pageIndex);
  if (!pageInfo) {
    return {
      width: Math.round(612 * scale),
      height: Math.round(792 * scale),
    };
  }

  return {
    width: Math.round(pageInfo.width_pt * scale),
    height: Math.round(pageInfo.height_pt * scale),
  };
}

export function pdfContinuousRenderPlan({
  pageCount,
  currentPageIndex,
  scale,
  pageSizes,
  pageSizeIndex,
  eagerRadius = pdfContinuousDefaultEagerRadius,
}: PdfContinuousRenderPlanInput): PdfContinuousSlotPlan[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, pageIndex) => ({
    pageIndex,
    ...pdfContinuousSlotSize({ pageIndex, scale, pageSizes, pageSizeIndex }),
    shouldRenderNow: shouldRenderPdfContinuousSlotNow({
      pageIndex,
      currentPageIndex,
      eagerRadius,
    }),
}));
}

export function pdfContinuousPageLayout({
  pageCount,
  scale,
  pageSizes,
  pageSizeIndex,
  gapPx = 18,
}: PdfContinuousPageLayoutInput): PdfContinuousPageLayout {
  const count = Math.max(0, pageCount);
  const gap = Math.max(0, gapPx);
  const pageStarts: number[] = [];
  const pageEnds: number[] = [];
  let offset = 0;
  for (let pageIndex = 0; pageIndex < count; pageIndex += 1) {
    const pageHeight = pdfContinuousSlotSize({ pageIndex, scale, pageSizes, pageSizeIndex }).height;
    pageStarts.push(offset);
    offset += pageHeight;
    pageEnds.push(offset);
    if (pageIndex < count - 1) {
      offset += gap;
    }
  }

  return {
    pageStarts,
    pageEnds,
    totalHeight: pageEnds.length > 0 ? pageEnds[pageEnds.length - 1] : 0,
  };
}

function pdfContinuousOmittedHeight({
  startPageIndex,
  endPageIndex,
  layout,
}: {
  startPageIndex: number;
  endPageIndex: number;
  layout: PdfContinuousPageLayout;
}) {
  if (endPageIndex < startPageIndex) {
    return 0;
  }
  const start = layout.pageStarts[startPageIndex];
  const end = layout.pageEnds[endPageIndex];
  if (start === undefined || end === undefined) {
    return 0;
  }
  return Math.max(0, end - start);
}

export function pdfContinuousRenderWindowPlan({
  pageCount,
  currentPageIndex,
  scale,
  pageSizes,
  pageSizeIndex,
  eagerRadius = pdfContinuousDefaultEagerRadius,
  windowRadius = pdfContinuousDefaultWindowRadius,
  gapPx = 18,
  layout,
}: PdfContinuousRenderWindowPlanInput): PdfContinuousRenderWindowPlan {
  const count = Math.max(0, pageCount);
  if (count === 0) {
    return {
      slots: [],
      startPageIndex: 0,
      endPageIndex: -1,
      beforeHeight: 0,
      afterHeight: 0,
    };
  }

  const center = Math.min(Math.max(currentPageIndex, 0), count - 1);
  const radius = Math.max(0, windowRadius);
  const startPageIndex = Math.max(0, center - radius);
  const endPageIndex = Math.min(count - 1, center + radius);
  const pageLayout = layout ?? pdfContinuousPageLayout({
    pageCount: count,
    scale,
    pageSizes,
    pageSizeIndex,
    gapPx,
  });
  const slots = Array.from({ length: endPageIndex - startPageIndex + 1 }, (_, offset) => {
    const pageIndex = startPageIndex + offset;
    return {
      pageIndex,
      ...pdfContinuousSlotSize({ pageIndex, scale, pageSizes, pageSizeIndex }),
      shouldRenderNow: shouldRenderPdfContinuousSlotNow({
        pageIndex,
        currentPageIndex: center,
        eagerRadius,
      }),
    };
  });

  return {
    slots,
    startPageIndex,
    endPageIndex,
    beforeHeight: pdfContinuousOmittedHeight({
      startPageIndex: 0,
      endPageIndex: startPageIndex - 1,
      layout: pageLayout,
    }),
    afterHeight: pdfContinuousOmittedHeight({
      startPageIndex: endPageIndex + 1,
      endPageIndex: count - 1,
      layout: pageLayout,
    }),
  };
}

export function estimatedPdfContinuousPageIndex({
  scrollTop,
  pageCount,
  scale,
  pageSizes,
  pageSizeIndex,
  gapPx = 18,
  layout,
}: EstimatedPdfContinuousPageInput) {
  const count = Math.max(0, pageCount);
  if (count === 0) {
    return 0;
  }

  const targetOffset = Math.max(0, scrollTop);
  const pageLayout = layout ?? pdfContinuousPageLayout({
    pageCount: count,
    scale,
    pageSizes,
    pageSizeIndex,
    gapPx,
  });
  let low = 0;
  let high = count - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const pageStart = pageLayout.pageStarts[middle] ?? 0;
    const pageEnd = pageLayout.pageEnds[middle] ?? pageStart;
    if (targetOffset < pageStart) {
      high = middle - 1;
    } else if (targetOffset >= pageEnd) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return Math.min(Math.max(low, 0), count - 1);
}

export function pdfContinuousRenderQueuePlan({
  candidatePageIndexes,
  currentPageIndex,
  blockedPageIndexes = [],
  maxQueuedPages = 6,
}: PdfContinuousRenderQueuePlanInput) {
  const blocked = new Set(blockedPageIndexes);
  const uniqueCandidates = [...new Set(candidatePageIndexes)]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0 && !blocked.has(pageIndex));

  return uniqueCandidates
    .sort((left, right) => {
      const distanceDelta = Math.abs(left - currentPageIndex) - Math.abs(right - currentPageIndex);
      return distanceDelta === 0 ? left - right : distanceDelta;
    })
    .slice(0, Math.max(0, maxQueuedPages));
}

export function pdfContinuousPagesToRecycle({
  renderedPageIndexes,
  currentPageIndex,
  keepRadius = 6,
}: PdfContinuousRecyclePlanInput) {
  const radius = Math.max(0, keepRadius);
  return [...new Set(renderedPageIndexes)]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0)
    .filter((pageIndex) => Math.abs(pageIndex - currentPageIndex) > radius)
    .sort((left, right) => left - right);
}

export function pdfContinuousRenderBlockedPageIndexes({
  renderedPageIndexes,
  loadingPageIndexes = [],
}: PdfContinuousRenderBlockedPageIndexesInput) {
  return [...new Set([...renderedPageIndexes, ...loadingPageIndexes])]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0)
    .sort((left, right) => left - right);
}

export function pdfContinuousRenderablePageIndexes({
  slotPageIndexes,
  blockedPageIndexes = [],
}: PdfContinuousRenderablePageIndexesInput) {
  const blocked = new Set(blockedPageIndexes);
  return [...new Set(slotPageIndexes)]
    .filter((pageIndex) => Number.isInteger(pageIndex) && pageIndex >= 0 && !blocked.has(pageIndex))
    .sort((left, right) => left - right);
}
