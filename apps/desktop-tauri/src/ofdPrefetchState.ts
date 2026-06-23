export type OfdPrefetchSessionState = {
  id: string;
  file_type: string;
  page_count: number;
};

export type OfdPrefetchTarget = {
  sessionId: string;
  pageIndex: number;
  scale: number;
};

export type AdjacentOfdPrefetchInput = {
  currentSession: OfdPrefetchSessionState | null;
  renderedSessionId: string;
  renderedPageIndex: number;
  renderedScale: number;
};

export type OfdPrefetchTargetRunInput = {
  currentSession: OfdPrefetchSessionState | null;
  currentPageIndex: number;
  currentScale: number;
  target: OfdPrefetchTarget;
};

export type OfdPrefetchBatchInput = {
  batchId: number;
  currentBatchId: number;
};

const nearbyPrefetchRadius = 2;

export function adjacentOfdPrefetchTargets(input: AdjacentOfdPrefetchInput): OfdPrefetchTarget[] {
  const { currentSession, renderedSessionId, renderedPageIndex, renderedScale } = input;
  if (
    !currentSession
    || currentSession.id !== renderedSessionId
    || currentSession.file_type !== "ofd"
  ) {
    return [];
  }

  const nearbyPageIndexes: number[] = [];
  for (let distance = 1; distance <= nearbyPrefetchRadius; distance += 1) {
    nearbyPageIndexes.push(renderedPageIndex - distance, renderedPageIndex + distance);
  }

  return nearbyPageIndexes
    .filter((pageIndex) => pageIndex >= 0 && pageIndex < currentSession.page_count)
    .map((pageIndex) => ({
      sessionId: renderedSessionId,
      pageIndex,
      scale: renderedScale,
    }));
}

export function shouldRunOfdPrefetchTarget(input: OfdPrefetchTargetRunInput): boolean {
  const { currentSession, currentPageIndex, currentScale, target } = input;
  if (
    !currentSession
    || currentSession.id !== target.sessionId
    || currentSession.file_type !== "ofd"
    || currentScale !== target.scale
  ) {
    return false;
  }

  const distance = Math.abs(target.pageIndex - currentPageIndex);
  return distance >= 1
    && distance <= nearbyPrefetchRadius
    && target.pageIndex >= 0
    && target.pageIndex < currentSession.page_count;
}

export function nextOfdPrefetchBatchId(currentBatchId: number): number {
  return currentBatchId + 1;
}

export function isCurrentOfdPrefetchBatch(input: OfdPrefetchBatchInput): boolean {
  return input.batchId === input.currentBatchId;
}
