import { ofdRenderRequestState } from "./ofdRenderRequestState.ts";

export type OfdPageRenderCacheLike<TPage> = {
  has(sessionId: string, pageIndex: number, pageScale: number): boolean;
  renderPage(
    sessionId: string,
    pageIndex: number,
    pageScale: number,
    render: () => Promise<TPage>,
    options: { cacheResult: boolean },
  ): Promise<TPage>;
};

export type RenderOfdPageThroughCacheInput<TPage> = {
  cache: OfdPageRenderCacheLike<TPage>;
  sessionId: string;
  pageIndex: number;
  pageScale: number;
  updateVisibleStatus: boolean;
  currentSessionId: string | null;
  onVisibleCacheHit: () => void;
  onRendered?: (page: TPage) => void;
  renderPage: () => Promise<TPage>;
};

export function renderOfdPageThroughCache<TPage>(input: RenderOfdPageThroughCacheInput<TPage>) {
  const requestState = ofdRenderRequestState({
    hasCachedPage: input.cache.has(input.sessionId, input.pageIndex, input.pageScale),
    updateVisibleStatus: input.updateVisibleStatus,
    currentSessionId: input.currentSessionId,
    requestedSessionId: input.sessionId,
  });

  if (requestState.showCacheHitStatus) {
    input.onVisibleCacheHit();
  }

  return input.cache.renderPage(
    input.sessionId,
    input.pageIndex,
    input.pageScale,
    async () => {
      const page = await input.renderPage();
      input.onRendered?.(page);
      return page;
    },
    { cacheResult: requestState.cacheResult },
  );
}
