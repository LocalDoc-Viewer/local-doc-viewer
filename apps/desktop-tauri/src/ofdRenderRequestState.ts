export type OfdRenderRequestStateInput = {
  hasCachedPage: boolean;
  updateVisibleStatus: boolean;
  currentSessionId: string | null;
  requestedSessionId: string;
};

export function ofdRenderRequestState(input: OfdRenderRequestStateInput) {
  return {
    showCacheHitStatus: input.hasCachedPage && input.updateVisibleStatus,
    cacheResult: input.updateVisibleStatus || input.currentSessionId === input.requestedSessionId,
  };
}
