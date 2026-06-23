export type ReaderOpenSnapshotState<
  TSession = unknown,
  TPdfDocument = unknown,
  TOfficePreview = unknown,
  TImageDocumentView = unknown,
  TOutlineItem = unknown,
  TRotation = number,
  TReaderViewMode = string,
> = {
  session: TSession;
  currentPage: number;
  scale: number;
  pdfViewRotation: TRotation;
  currentDocumentName: string;
  currentDocumentStatus: string;
  currentActivityFeedback: string;
  activePdfDocument: TPdfDocument;
  currentOfficePreview: TOfficePreview;
  currentImageDocumentView: TImageDocumentView;
  documentOutlineItems: TOutlineItem[];
  readerViewMode: TReaderViewMode;
};

export function readerOpenSnapshot<TState extends ReaderOpenSnapshotState>(state: TState): TState {
  return {
    ...state,
  };
}
