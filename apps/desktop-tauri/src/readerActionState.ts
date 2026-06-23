export type DocumentFindActionState = {
  isBusy: boolean;
  isFindingDocument: boolean;
  hasSession: boolean;
  fileType: string | null;
  hasActivePdfDocument: boolean;
};

export type ViewRotationActionState = {
  isBusy: boolean;
  hasSession: boolean;
  fileType: string | null;
  hasActivePdfDocument: boolean;
  isImageSession: boolean;
  hasImageDocumentView: boolean;
};

export type ScaleDocumentActionState = {
  hasSession: boolean;
  isTextSession: boolean;
};

export type CurrentPageTextSelectionActionState = {
  isBusy: boolean;
  hasSession: boolean;
  fileType: string | null;
  isTextSession: boolean;
  hasTextPreviewContent: boolean;
  hasActivePdfDocument: boolean;
  isCurrentPageTextCopyUnavailable: boolean;
};

export type CurrentPageTextCopyActionState = {
  isBusy: boolean;
  hasSession: boolean;
  fileType: string | null;
  hasActivePdfDocument: boolean;
  isCurrentPageTextCopyUnavailable: boolean;
  hasTextPreviewContent: boolean;
};

export function canUseDocumentFindState(state: DocumentFindActionState) {
  if (state.isBusy || state.isFindingDocument || !state.hasSession) {
    return false;
  }

  if (state.fileType === "pdf") {
    return state.hasActivePdfDocument;
  }

  return (
    state.fileType === "ofd"
    || state.fileType === "txt"
    || state.fileType === "log"
    || state.fileType === "csv"
    || state.fileType === "md"
  );
}

export function canRotateViewState(state: ViewRotationActionState) {
  if (state.isBusy || !state.hasSession) {
    return false;
  }

  return (
    (state.fileType === "pdf" && state.hasActivePdfDocument)
    || (state.isImageSession && state.hasImageDocumentView)
  );
}

export function canScaleCurrentDocumentState(state: ScaleDocumentActionState) {
  return state.hasSession && !state.isTextSession;
}

export function canSelectCurrentPageTextState(state: CurrentPageTextSelectionActionState) {
  if (state.isBusy || !state.hasSession) {
    return false;
  }

  if (state.isTextSession) {
    return state.hasTextPreviewContent;
  }

  return (
    state.fileType === "pdf"
    && state.hasActivePdfDocument
    && !state.isCurrentPageTextCopyUnavailable
  );
}

export function canCopyCurrentPageTextState(state: CurrentPageTextCopyActionState) {
  if (state.isBusy || !state.hasSession) {
    return false;
  }

  if (state.fileType === "pdf") {
    return state.hasActivePdfDocument && !state.isCurrentPageTextCopyUnavailable;
  }

  if (
    state.fileType === "txt"
    || state.fileType === "log"
    || state.fileType === "csv"
    || state.fileType === "md"
  ) {
    return state.hasTextPreviewContent;
  }

  return state.fileType === "ofd";
}
