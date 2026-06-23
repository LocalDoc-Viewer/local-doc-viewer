export type Point = {
  left: number;
  top: number;
};

export type RectLike = Point & {
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type SizeLike = {
  width: number;
  height: number;
};

export function centeredTopOverlayPosition(container: RectLike, overlay: SizeLike, topOffset: number): Point {
  return {
    left: container.left + (container.width - overlay.width) / 2,
    top: container.top + topOffset,
  };
}

export function centeredBottomOverlayPosition(container: RectLike, overlay: SizeLike, bottomOffset: number): Point {
  return {
    left: container.left + (container.width - overlay.width) / 2,
    top: container.bottom - overlay.height - bottomOffset,
  };
}

export function overlayMaxWidth(container: RectLike, options: { margin: number; minWidth: number }): number {
  return Math.max(options.minWidth, Math.floor(container.width - options.margin * 2));
}

export function clampOverlayPosition(
  position: Point,
  container: RectLike,
  overlay: SizeLike,
  options: { margin: number; maxElementWidth?: number },
): Point {
  const overlayWidth = typeof options.maxElementWidth === "number"
    ? Math.min(overlay.width, options.maxElementWidth)
    : overlay.width;
  const minLeft = container.left + options.margin;
  const maxLeft = container.right - overlayWidth - options.margin;
  const minTop = container.top + options.margin;
  const maxTop = container.bottom - overlay.height - options.margin;

  return {
    left: Math.min(Math.max(position.left, minLeft), Math.max(minLeft, maxLeft)),
    top: Math.min(Math.max(position.top, minTop), Math.max(minTop, maxTop)),
  };
}
