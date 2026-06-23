import { isSameReaderScaleState, maxReaderScale, minReaderScale } from "./readerScaleState";
import type { ReaderViewMode } from "./readerViewModeState";

export type ReaderToolbarStateInput = {
  isBusy: boolean;
  hasSession: boolean;
  currentPage: number;
  pageCount: number;
  scale: number;
  canScaleCurrentDocument: boolean;
  canUseContinuousView: boolean;
  readerViewMode: ReaderViewMode;
};

export type ReaderToolbarState = {
  pageNumberInputDisabled: boolean;
  previousPageDisabled: boolean;
  nextPageDisabled: boolean;
  jumpPageDisabled: boolean;
  zoomOutDisabled: boolean;
  zoomInDisabled: boolean;
  resetZoomDisabled: boolean;
  fitWidthDisabled: boolean;
  fitPageDisabled: boolean;
  singlePageViewDisabled: boolean;
  singlePageViewPressed: boolean;
  continuousPageViewDisabled: boolean;
  continuousPageViewPressed: boolean;
  printDocumentDisabled: boolean;
};

export function readerToolbarState(input: ReaderToolbarStateInput): ReaderToolbarState {
  const documentUnavailable = input.isBusy || !input.hasSession;
  const scaleUnavailable = documentUnavailable || !input.canScaleCurrentDocument;

  return {
    pageNumberInputDisabled: documentUnavailable,
    previousPageDisabled: documentUnavailable || input.currentPage === 0,
    nextPageDisabled: documentUnavailable || input.currentPage >= (input.pageCount - 1),
    jumpPageDisabled: documentUnavailable,
    zoomOutDisabled: scaleUnavailable || input.scale <= minReaderScale,
    zoomInDisabled: scaleUnavailable || input.scale >= maxReaderScale,
    resetZoomDisabled: scaleUnavailable || isSameReaderScaleState(input.scale, 1),
    fitWidthDisabled: scaleUnavailable,
    fitPageDisabled: scaleUnavailable,
    singlePageViewDisabled: documentUnavailable,
    singlePageViewPressed: input.readerViewMode === "single",
    continuousPageViewDisabled: input.isBusy || !input.canUseContinuousView,
    continuousPageViewPressed: input.readerViewMode === "continuous",
    printDocumentDisabled: documentUnavailable,
  };
}
