import { ofdPageImageCacheTargetFromDataset } from "./ofdPageImageState.ts";

export type OfdPageCacheControllerLike = {
  clearSession(sessionId: string): void;
  clearExceptSession(sessionId: string | null): void;
  clearAll(): void;
  deletePage(sessionId: string, pageIndex: number, pageScale: number): void;
};

export type OfdPageCacheSessionLike = {
  id: string;
};

export function clearOfdPageCacheForSession(
  cache: OfdPageCacheControllerLike,
  targetSession: OfdPageCacheSessionLike,
) {
  cache.clearSession(targetSession.id);
}

export function clearOfdPageCacheExceptSession(
  cache: OfdPageCacheControllerLike,
  currentSessionId: string | null,
) {
  cache.clearExceptSession(currentSessionId);
}

export function clearAllOfdPageWork(cache: OfdPageCacheControllerLike) {
  cache.clearAll();
}

export function deleteOfdPageCacheFromDataset(
  cache: OfdPageCacheControllerLike,
  dataset: DOMStringMap | Record<string, string | undefined>,
) {
  const cacheTarget = ofdPageImageCacheTargetFromDataset(dataset);
  if (!cacheTarget) {
    return false;
  }

  cache.deletePage(cacheTarget.sessionId, cacheTarget.pageIndex, cacheTarget.scale);
  return true;
}
