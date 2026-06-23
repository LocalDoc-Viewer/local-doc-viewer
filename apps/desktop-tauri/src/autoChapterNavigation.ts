export type AutoChapterPageText = {
  readonly pageIndex: number;
  readonly text: string;
};

export type AutoChapterNavigationItem = {
  readonly title: string;
  readonly pageIndex: number;
  readonly level: number;
  readonly source: "auto";
};

export const MIN_AUTO_CHAPTER_COUNT = 3;
export const MAX_AUTO_CHAPTER_ITEMS = 300;

const CJK_NUMBER = "一二三四五六七八九十百千万零〇两";
const CHAPTER_HEADING_PATTERN = new RegExp(
  `^(第[${CJK_NUMBER}\\d]+[章节回][^\\n]{0,30})$`,
);
const CHAPTER_CANDIDATE_PATTERN = new RegExp(
  `(第[${CJK_NUMBER}\\d]+[章节回][^。！？!?\\n]{0,30})`,
);
const MAX_HEADING_LENGTH = 40;

export function detectAutoChapterNavigation(
  pages: readonly AutoChapterPageText[],
): AutoChapterNavigationItem[] {
  const items: AutoChapterNavigationItem[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    for (const item of autoChapterNavigationItemsFromPage(page)) {
      const key = `${item.pageIndex}:${item.title}`;
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
      if (items.length >= MAX_AUTO_CHAPTER_ITEMS) {
        return items.length >= MIN_AUTO_CHAPTER_COUNT ? items : [];
      }
    }
  }

  return items.length >= MIN_AUTO_CHAPTER_COUNT ? items : [];
}

export function autoChapterNavigationItemsFromPage(
  page: AutoChapterPageText,
): AutoChapterNavigationItem[] {
  const items: AutoChapterNavigationItem[] = [];
  const seen = new Set<string>();

  for (const line of page.text.split(/\r?\n/)) {
    const title = chapterTitleFromLine(line);
    if (!title || seen.has(title)) {
      continue;
    }
    seen.add(title);
    items.push({
      title,
      pageIndex: page.pageIndex,
      level: headingLevel(),
      source: "auto",
    });
  }

  return items;
}

function chapterTitleFromLine(line: string) {
  const normalized = normalizeTextLine(line);
  if (!normalized) {
    return "";
  }
  const compactTitle = normalizeTitleCandidate(normalized);
  if (compactTitle && CHAPTER_HEADING_PATTERN.test(compactTitle)) {
    if (isChapterEndingMarker(compactTitle) || isBareStructuralMarker(compactTitle)) {
      return "";
    }
    return compactTitle;
  }
  if (!hasDecoratedHeadingPrefix(normalized)) {
    return "";
  }
  const match = normalized.match(CHAPTER_CANDIDATE_PATTERN);
  const rawTitle = match?.[0]?.trim() ?? "";
  if (!rawTitle) {
    return "";
  }
  if (isChapterEndingMarker(rawTitle) || isBareStructuralMarker(rawTitle)) {
    return "";
  }
  if (/[，,。；;：:]/u.test(rawTitle)) {
    return chapterMarkerFromTitle(rawTitle);
  }
  if (normalized.length > MAX_HEADING_LENGTH && rawTitle.length >= 20) {
    return chapterMarkerFromTitle(rawTitle);
  }
  if (rawTitle.length >= MAX_HEADING_LENGTH) {
    return chapterMarkerFromTitle(rawTitle);
  }
  return normalizeTitleCandidate(rawTitle);
}

function normalizeTextLine(line: string) {
  return collapseInterCharacterSpaces(line)
    .replace(/\s+/g, " ")
    .replace(/([章节回卷部集])(?=[^\s])/u, "$1 ")
    .trim();
}

function normalizeTitleCandidate(title: string) {
  const normalized = title.trim();
  if (normalized.length < 2 || normalized.length > MAX_HEADING_LENGTH) {
    return "";
  }
  return normalized;
}

function hasDecoratedHeadingPrefix(line: string) {
  return /^[^第卷部]{1,20}(第|卷|部)/u.test(line);
}

function chapterMarkerFromTitle(title: string) {
  const match = title.match(new RegExp(`^(第[${CJK_NUMBER}\\d]+[章节回])`));
  return match?.[0] ?? "";
}

function isChapterEndingMarker(title: string) {
  const normalized = title
    .replace(/^[（(]\s*/u, "")
    .replace(/\s*[)）]$/u, "")
    .trim();
  return new RegExp(`^第[${CJK_NUMBER}\\d]+[章节回]\\s*完$`).test(normalized);
}

function isBareStructuralMarker(title: string) {
  return new RegExp(`^(第[${CJK_NUMBER}\\d]+[卷部集]|[卷部][${CJK_NUMBER}\\d]+)$`).test(title.trim());
}

function collapseInterCharacterSpaces(line: string) {
  let normalized = line;
  let previous = "";
  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized.replace(/([\p{Script=Han}\d])\s+([\p{Script=Han}\d])/gu, "$1$2");
  }
  return normalized;
}

function headingLevel() {
  return 1;
}
