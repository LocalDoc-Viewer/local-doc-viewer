const lineBreakYThreshold = 3;
const adjacentTextGapThreshold = 1;

type TextItemBounds = {
  x: number;
  y: number;
  width: number;
};

export function pdfTextContentToPlainText(textContent: { items: unknown[] }) {
  const chunks: string[] = [];
  let previousY: number | null = null;
  let previousBounds: TextItemBounds | null = null;

  for (const item of textContent.items) {
    const textItem = item as { str?: unknown; hasEOL?: unknown; transform?: unknown; width?: unknown };
    const text = typeof textItem.str === "string" ? textItem.str : "";
    if (!text.trim()) {
      continue;
    }
    const y = textItemY(textItem);
    if (
      previousY !== null
      && y !== null
      && Math.abs(y - previousY) > lineBreakYThreshold
      && chunks[chunks.length - 1] !== "\n"
    ) {
      chunks.push("\n");
    }
    const bounds = textItemBounds(textItem);
    if (isAdjacentTextFragment(previousBounds, bounds) && chunks[chunks.length - 1] === " ") {
      chunks.pop();
    }
    chunks.push(text);
    chunks.push(textItem.hasEOL ? "\n" : " ");
    previousY = y ?? previousY;
    previousBounds = bounds;
  }

  return chunks
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/([\[\(])[ \t]+/g, "$1")
    .replace(/[ \t]+([,.:;?!\]\)])/g, "$1")
    .trim();
}

function textItemY(textItem: { transform?: unknown }) {
  if (!Array.isArray(textItem.transform) || textItem.transform.length < 6) {
    return null;
  }

  const y = textItem.transform[5];
  return typeof y === "number" && Number.isFinite(y) ? y : null;
}

function textItemBounds(textItem: { transform?: unknown; width?: unknown }): TextItemBounds | null {
  if (!Array.isArray(textItem.transform) || textItem.transform.length < 6) {
    return null;
  }

  const x = textItem.transform[4];
  const y = textItem.transform[5];
  const width = textItem.width;
  if (
    typeof x !== "number"
    || typeof y !== "number"
    || typeof width !== "number"
    || !Number.isFinite(x)
    || !Number.isFinite(y)
    || !Number.isFinite(width)
  ) {
    return null;
  }

  return { x, y, width };
}

function isAdjacentTextFragment(previous: TextItemBounds | null, current: TextItemBounds | null) {
  if (!previous || !current || Math.abs(previous.y - current.y) > lineBreakYThreshold) {
    return false;
  }

  return Math.abs((previous.x + previous.width) - current.x) <= adjacentTextGapThreshold;
}
