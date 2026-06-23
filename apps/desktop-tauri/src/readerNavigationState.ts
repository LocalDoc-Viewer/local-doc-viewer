export type PageNavigationState = {
  hasSession: boolean;
  pageCount: number;
  isTextSession: boolean;
  isImageSession: boolean;
  outlineCount: number;
};

export type OutlineNavigationItemState = {
  pageIndex: number;
};

export type OutlinePreferenceState = {
  preferredIndex: number | null;
  preferredPageIndex: number | null;
  currentPage: number;
  preservedScrollTop: number | null;
};

export function canUsePageNavigationState(state: PageNavigationState): boolean {
  return state.hasSession
    && state.pageCount > 1
    && !state.isTextSession
    && !state.isImageSession
    && state.outlineCount === 0;
}

export function canUseReaderNavigationState(canUsePageNavigation: boolean, outlineCount: number): boolean {
  return outlineCount > 0 || canUsePageNavigation;
}

export function nextDocumentOutlinePreference(state: OutlinePreferenceState): {
  preferredIndex: number | null;
  preferredPageIndex: number | null;
} {
  if (
    state.preferredPageIndex !== null
    && state.preferredPageIndex !== state.currentPage
    && state.preservedScrollTop === null
  ) {
    return {
      preferredIndex: null,
      preferredPageIndex: null,
    };
  }

  return {
    preferredIndex: state.preferredIndex,
    preferredPageIndex: state.preferredPageIndex,
  };
}

export function activeDocumentOutlineIndex(state: {
  items: OutlineNavigationItemState[];
  currentPage: number;
  preferredIndex: number | null;
}): number | null {
  if (
    state.preferredIndex !== null
    && state.preferredIndex >= 0
    && state.preferredIndex < state.items.length
  ) {
    return state.preferredIndex;
  }

  let activeIndex: number | null = null;
  let activePageIndex = -1;
  state.items.forEach((item, index) => {
    const isEligible = item.pageIndex <= state.currentPage && item.pageIndex >= activePageIndex;
    if (isEligible) {
      activeIndex = index;
      activePageIndex = item.pageIndex;
    }
  });

  return activeIndex;
}
