export type ReaderDocumentCenterStateInput = {
  isBusy: boolean;
  recentFileCount: number;
};

export type ReaderDocumentCenterState = {
  openLocalDocumentDisabled: boolean;
  openLocalDocumentLabel: string;
  refreshRecentFilesDisabled: boolean;
  clearRecentFilesDisabled: boolean;
  clearRenderCacheDisabled: boolean;
  recentFilesEnabledDisabled: boolean;
};

export function readerDocumentCenterState(
  input: ReaderDocumentCenterStateInput,
): ReaderDocumentCenterState {
  return {
    openLocalDocumentDisabled: input.isBusy,
    openLocalDocumentLabel: input.isBusy ? "处理中..." : "打开文档",
    refreshRecentFilesDisabled: input.isBusy,
    clearRecentFilesDisabled: input.isBusy || input.recentFileCount === 0,
    clearRenderCacheDisabled: input.isBusy,
    recentFilesEnabledDisabled: input.isBusy,
  };
}
