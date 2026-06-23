export type PdfOutlineItem = {
  readonly title: string;
  readonly pageIndex: number;
  readonly level: number;
};

type RawPdfOutlineItem = {
  readonly title?: unknown;
  readonly dest?: unknown;
  readonly items?: readonly RawPdfOutlineItem[];
};

type PdfOutlineNormalizerContext = {
  readonly pageCount: number;
  resolveNamedDestination(name: string): Promise<unknown>;
  resolvePageIndex(pageReference: unknown): Promise<number>;
};

export async function normalizePdfOutlineItems(
  outline: readonly RawPdfOutlineItem[] | null | undefined,
  context: PdfOutlineNormalizerContext,
): Promise<PdfOutlineItem[]> {
  if (!outline) {
    return [];
  }

  const results: PdfOutlineItem[] = [];

  async function appendItems(items: readonly RawPdfOutlineItem[], level: number) {
    for (const item of items) {
      const title = String(item.title ?? "").trim();
      const destination = await resolveDestination(item.dest, context);
      if (title && Array.isArray(destination) && destination[0]) {
        try {
          const pageIndex = await context.resolvePageIndex(destination[0]);
          if (Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < context.pageCount) {
            results.push({
              title,
              pageIndex,
              level,
            });
          }
        } catch {
          // Ignore outline entries that do not resolve to a local page.
        }
      }
      if (item.items?.length) {
        await appendItems(item.items, level + 1);
      }
    }
  }

  await appendItems(outline, 0);
  return results;
}

async function resolveDestination(dest: unknown, context: PdfOutlineNormalizerContext): Promise<unknown> {
  if (typeof dest === "string") {
    return context.resolveNamedDestination(dest);
  }
  return dest;
}
