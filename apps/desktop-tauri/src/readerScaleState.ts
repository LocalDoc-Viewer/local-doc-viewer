export const minReaderScale = 0.5;
export const maxReaderScale = 3;
export const defaultReaderScale = 1;

export function clampReaderScaleState(value: number) {
  if (!Number.isFinite(value)) {
    return defaultReaderScale;
  }
  return Math.min(Math.max(value, minReaderScale), maxReaderScale);
}

export function roundedReaderScaleState(value: number) {
  return Math.round(clampReaderScaleState(value) * 100) / 100;
}

export function isSameReaderScaleState(left: number, right: number) {
  return Math.abs(left - right) < 0.02;
}
