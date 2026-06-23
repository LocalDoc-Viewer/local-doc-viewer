export type ReaderNavigationControlsStateInput = {
  isBusy: boolean;
  canUseReaderNavigation: boolean;
  isReaderNavigationOpen: boolean;
  readerNavigationFontSize: number;
  minReaderNavigationFontSize: number;
  maxReaderNavigationFontSize: number;
};

export type ReaderNavigationControlsState = {
  toggleReaderNavigationDisabled: boolean;
  closeReaderNavigationDisabled: boolean;
  decreaseReaderNavigationFontDisabled: boolean;
  increaseReaderNavigationFontDisabled: boolean;
};

export function readerNavigationControlsState(
  input: ReaderNavigationControlsStateInput,
): ReaderNavigationControlsState {
  const unavailable = input.isBusy || !input.canUseReaderNavigation;

  return {
    toggleReaderNavigationDisabled: unavailable,
    closeReaderNavigationDisabled: input.isBusy || !input.isReaderNavigationOpen,
    decreaseReaderNavigationFontDisabled:
      unavailable || input.readerNavigationFontSize <= input.minReaderNavigationFontSize,
    increaseReaderNavigationFontDisabled:
      unavailable || input.readerNavigationFontSize >= input.maxReaderNavigationFontSize,
  };
}
