export type ViewRotation = 0 | 90 | 180 | 270;

export function normalizeViewRotation(rotation: number): ViewRotation {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

export function nextViewRotation(current: ViewRotation, direction: 1 | -1): ViewRotation {
  return normalizeViewRotation(current + direction * 90);
}

export function rotatedViewSize(size: { width: number; height: number }, rotation: ViewRotation) {
  if (rotation === 90 || rotation === 270) {
    return {
      width: size.height,
      height: size.width,
    };
  }

  return size;
}
