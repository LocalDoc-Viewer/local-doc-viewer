export type DocumentFindPageText = {
  pageIndex: number;
  text: string;
};

export type DocumentFindMatch = {
  pageIndex: number;
  matchIndex: number;
  startIndex: number;
};

export const MAX_DOCUMENT_FIND_QUERY_LENGTH = 128;

export function normalizeDocumentFindText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function normalizeDocumentFindQuery(query: string) {
  return normalizeDocumentFindText(query).slice(0, MAX_DOCUMENT_FIND_QUERY_LENGTH);
}

export function buildDocumentFindMatches(pages: DocumentFindPageText[], query: string): DocumentFindMatch[] {
  const normalizedQuery = normalizeDocumentFindQuery(query);
  if (!normalizedQuery) {
    return [];
  }

  const matches: DocumentFindMatch[] = [];
  for (const page of pages) {
    const normalizedText = normalizeDocumentFindText(page.text);
    let startIndex = 0;
    while (startIndex < normalizedText.length) {
      const foundIndex = normalizedText.indexOf(normalizedQuery, startIndex);
      if (foundIndex < 0) {
        break;
      }
      matches.push({
        pageIndex: page.pageIndex,
        matchIndex: matches.length,
        startIndex: foundIndex,
      });
      startIndex = foundIndex + normalizedQuery.length;
    }
  }

  return matches;
}

export function nextDocumentFindIndex(currentIndex: number, total: number, direction: 1 | -1) {
  if (total <= 0) {
    return -1;
  }

  if (currentIndex < 0 || currentIndex >= total) {
    return direction > 0 ? 0 : total - 1;
  }

  return (currentIndex + direction + total) % total;
}
