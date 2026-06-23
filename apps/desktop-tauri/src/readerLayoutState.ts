export const minDocumentCenterWidth = 220;
export const defaultDocumentCenterWidth = 260;
export const maxDocumentCenterWidth = 340;
export const collapsedDocumentCenterRailWidth = 44;

export const minReaderNavigationWidth = 200;
export const defaultReaderNavigationWidth = 260;
export const maxReaderNavigationWidth = 360;
export const minReaderNavigationFontSize = 13;
export const defaultReaderNavigationFontSize = 15;
export const maxReaderNavigationFontSize = 17;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function effectiveMaxWidth(minWidth: number, maxWidth: number, viewportLimit: number) {
  return Math.max(minWidth, Math.min(maxWidth, viewportLimit || maxWidth));
}

export function clampDocumentCenterWidthState(width: number, viewportWidth: number) {
  if (!Number.isFinite(width)) {
    return defaultDocumentCenterWidth;
  }
  const viewportLimit = Math.floor(viewportWidth * 0.32);
  return clampNumber(width, minDocumentCenterWidth, effectiveMaxWidth(minDocumentCenterWidth, maxDocumentCenterWidth, viewportLimit));
}

export function clampReaderNavigationWidthState(width: number, viewportWidth: number) {
  if (!Number.isFinite(width)) {
    return defaultReaderNavigationWidth;
  }
  const viewportLimit = Math.floor(viewportWidth * 0.35);
  return clampNumber(width, minReaderNavigationWidth, effectiveMaxWidth(minReaderNavigationWidth, maxReaderNavigationWidth, viewportLimit));
}

export function clampReaderNavigationFontSizeState(size: number) {
  if (!Number.isFinite(size)) {
    return defaultReaderNavigationFontSize;
  }
  return clampNumber(size, minReaderNavigationFontSize, maxReaderNavigationFontSize);
}
