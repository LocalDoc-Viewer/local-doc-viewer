export type OfdContinuousPageSize = {
  index: number;
  width_pt: number;
  height_pt: number;
};

export type OfdContinuousRenderPlanInput = {
  pageCount: number;
  currentPageIndex: number;
  scale: number;
  pageSizes: OfdContinuousPageSize[];
  eagerRadius?: number;
};

export type OfdContinuousSlotPlan = {
  pageIndex: number;
  width: number;
  height: number;
  shouldRenderNow: boolean;
};

export function ofdContinuousPageIndexes(pageCount: number) {
  const indexes: number[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    indexes.push(pageIndex);
  }
  return indexes;
}

export function shouldRenderOfdContinuousSlotNow({
  pageIndex,
  currentPageIndex,
  eagerRadius = 2,
}: {
  pageIndex: number;
  currentPageIndex: number;
  eagerRadius?: number;
}) {
  return Math.abs(pageIndex - currentPageIndex) <= Math.max(0, eagerRadius);
}

export function ofdContinuousSlotSize({
  pageIndex,
  scale,
  pageSizes,
}: {
  pageIndex: number;
  scale: number;
  pageSizes: OfdContinuousPageSize[];
}) {
  const pageInfo = pageSizes.find((page) => page.index === pageIndex);
  if (!pageInfo) {
    return {
      width: Math.round(612 * 2 * scale),
      height: Math.round(792 * 2 * scale),
    };
  }

  return {
    width: Math.round(pageInfo.width_pt * 2 * scale),
    height: Math.round(pageInfo.height_pt * 2 * scale),
  };
}

export function ofdContinuousRenderPlan({
  pageCount,
  currentPageIndex,
  scale,
  pageSizes,
  eagerRadius = 2,
}: OfdContinuousRenderPlanInput): OfdContinuousSlotPlan[] {
  return ofdContinuousPageIndexes(pageCount).map((pageIndex) => ({
    pageIndex,
    ...ofdContinuousSlotSize({ pageIndex, scale, pageSizes }),
    shouldRenderNow: shouldRenderOfdContinuousSlotNow({
      pageIndex,
      currentPageIndex,
      eagerRadius,
    }),
  }));
}
