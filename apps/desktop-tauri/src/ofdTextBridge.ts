export type OfdTextPageView = {
  index: number;
  text: string;
};

export type OfdTextBridgeView = {
  pages: OfdTextPageView[];
};

export type OfdDocumentFindPageText = {
  pageIndex: number;
  text: string;
};

export function documentFindPageTextsFromOfdView(
  textView: OfdTextBridgeView,
): OfdDocumentFindPageText[] {
  return textView.pages.map((page) => ({
    pageIndex: page.index,
    text: page.text,
  }));
}

export function currentOfdPageTextFromView(textView: OfdTextBridgeView, currentPage: number) {
  return textView.pages.find((page) => page.index === currentPage)?.text.trim() ?? "";
}
