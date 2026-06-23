export type ReaderViewMode = "single" | "continuous";

export function readerViewModeForRequest(input: {
  requestedMode: ReaderViewMode;
  canUseContinuousView: boolean;
}): ReaderViewMode {
  if (input.requestedMode === "continuous" && !input.canUseContinuousView) {
    return "single";
  }
  return input.requestedMode;
}

export function readerViewModeAfterDocumentOpen(input: {
  currentMode: ReaderViewMode;
  canUseContinuousView: boolean;
}): ReaderViewMode {
  return readerViewModeForRequest({
    requestedMode: input.currentMode,
    canUseContinuousView: input.canUseContinuousView,
  });
}
