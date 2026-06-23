export type OfdPageImageCacheTarget = {
  sessionId: string;
  pageIndex: number;
  scale: number;
};

export type OfdPageImageDataset = {
  cacheKey?: string;
  sessionId?: string;
  pageIndex?: string;
  pageScale?: string;
};

export function ofdPageImageDataset(target: OfdPageImageCacheTarget): Required<OfdPageImageDataset> {
  return {
    cacheKey: `local:${target.sessionId}:${target.pageIndex}:${target.scale.toFixed(2)}`,
    sessionId: target.sessionId,
    pageIndex: String(target.pageIndex),
    pageScale: String(target.scale),
  };
}

export function ofdPageImageCacheTargetFromDataset(
  dataset: OfdPageImageDataset,
): OfdPageImageCacheTarget | null {
  const sessionId = dataset.sessionId ?? "";
  const pageIndex = Number.parseInt(dataset.pageIndex ?? "", 10);
  const pageScale = Number.parseFloat(dataset.pageScale ?? "");

  if (!sessionId || !Number.isInteger(pageIndex) || String(pageIndex) !== dataset.pageIndex || !Number.isFinite(pageScale)) {
    return null;
  }

  return {
    sessionId,
    pageIndex,
    scale: pageScale,
  };
}
