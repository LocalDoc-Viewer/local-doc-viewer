export type OfdPageRenderCacheEntry = {
  session_id: string;
  page_index: number;
  scale: number;
};

type RenderPage<TPage extends OfdPageRenderCacheEntry> = () => Promise<TPage>;

export type OfdPageRenderCacheRenderOptions = {
  cacheResult?: boolean;
};

export type OfdPageRenderCacheOptions = {
  maxEntries: number;
};

export function ofdPageRenderCacheKey(sessionId: string, pageIndex: number, pageScale: number) {
  return `local:${sessionId}:${pageIndex}:${pageScale.toFixed(2)}`;
}

export function createOfdPageRenderCache<TPage extends OfdPageRenderCacheEntry>(
  options: OfdPageRenderCacheOptions,
) {
  const cache = new Map<string, TPage>();
  const requests = new Map<string, Promise<TPage>>();
  const maxEntries = Math.max(1, Math.floor(options.maxEntries));

  function trim() {
    while (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) {
        return;
      }
      cache.delete(oldestKey);
    }
  }

  function keyFor(sessionId: string, pageIndex: number, pageScale: number) {
    return ofdPageRenderCacheKey(sessionId, pageIndex, pageScale);
  }

  function has(sessionId: string, pageIndex: number, pageScale: number) {
    return cache.has(keyFor(sessionId, pageIndex, pageScale));
  }

  function hasPending(sessionId: string, pageIndex: number, pageScale: number) {
    return requests.has(keyFor(sessionId, pageIndex, pageScale));
  }

  async function renderPage(
    sessionId: string,
    pageIndex: number,
    pageScale: number,
    render: RenderPage<TPage>,
    renderOptions: OfdPageRenderCacheRenderOptions = {},
  ) {
    const key = keyFor(sessionId, pageIndex, pageScale);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const pending = requests.get(key);
    if (pending) {
      return pending;
    }

    const request = render().then((rendered) => {
      if (renderOptions.cacheResult !== false) {
        cache.set(key, rendered);
        trim();
      }
      return rendered;
    }).finally(() => {
      requests.delete(key);
    });
    requests.set(key, request);
    return request;
  }

  function deletePage(sessionId: string, pageIndex: number, pageScale: number) {
    cache.delete(keyFor(sessionId, pageIndex, pageScale));
  }

  function clearSession(sessionId: string) {
    const prefix = `local:${sessionId}:`;
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
    for (const key of requests.keys()) {
      if (key.startsWith(prefix)) {
        requests.delete(key);
      }
    }
  }

  function clearExceptSession(sessionId: string | null) {
    if (!sessionId) {
      clearAll();
      return;
    }

    const keepPrefix = `local:${sessionId}:`;
    for (const key of cache.keys()) {
      if (!key.startsWith(keepPrefix)) {
        cache.delete(key);
      }
    }
    for (const key of requests.keys()) {
      if (!key.startsWith(keepPrefix)) {
        requests.delete(key);
      }
    }
  }

  function clearAll() {
    cache.clear();
    requests.clear();
  }

  return {
    keyFor,
    has,
    hasPending,
    renderPage,
    deletePage,
    clearSession,
    clearExceptSession,
    clearAll,
  };
}
