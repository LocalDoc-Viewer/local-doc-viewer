import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { createIcons, icons } from "lucide";
import { displayNameFromPath, localDocumentDirectoryFromPath } from "./localDocumentPath";
import { parsePageJumpInput } from "./pageNavigation";
import {
  buildDocumentFindMatches,
  nextDocumentFindIndex,
  normalizeDocumentFindQuery,
  type DocumentFindMatch,
  type DocumentFindPageText,
} from "./documentFind";
import {
  appearanceThemeDataset,
  appearanceThemePreferenceFromStorage,
  defaultAppearanceThemePreference,
  type AppearanceThemePreference,
} from "./appearanceThemeState";
import {
  autoChapterNavigationItemsFromPage,
  MIN_AUTO_CHAPTER_COUNT,
  MAX_AUTO_CHAPTER_ITEMS,
} from "./autoChapterNavigation";
import {
  diagnosticSummaryFromState,
  type DiagnosticSummaryState,
} from "./diagnosticSummaryState";
import {
  imageFileTypeFromPath,
  isImageFileType,
  isOfficeFileType,
  localDocumentRoute,
  officeFileTypeFromPath,
  recentDocumentRoute,
  isTextFileType,
  textFileTypeFromPath,
} from "./documentTypes";
import {
  centeredBottomOverlayPosition,
  centeredTopOverlayPosition,
  clampOverlayPosition,
  overlayMaxWidth,
  type Point,
} from "./overlayPosition";
import { previousDocumentCacheCleanupTarget } from "./ofdCacheCleanupState";
import {
  clearAllOfdPageWork,
  clearOfdPageCacheExceptSession,
  clearOfdPageCacheForSession,
  deleteOfdPageCacheFromDataset,
} from "./ofdPageCacheController";
import { renderOfdPageThroughCache } from "./ofdPageRenderer";
import { createOfdPageRenderCache } from "./ofdPageRenderCache";
import { ofdPageImageDataset } from "./ofdPageImageState";
import { ofdContinuousRenderPlan } from "./ofdContinuousRenderState";
import {
  estimatedPdfContinuousPageIndex,
  pdfContinuousPageLayout,
  pdfContinuousPageSizeIndex,
  pdfContinuousPagesToRecycle,
  pdfContinuousRenderablePageIndexes,
  pdfContinuousRenderQueuePlan,
  pdfContinuousRenderWindowPlan,
  pdfContinuousRenderBlockedPageIndexes,
  type PdfContinuousPageLayout,
  type PdfContinuousPageSize,
  type PdfContinuousPageSizeIndex,
} from "./pdfContinuousVirtualState";
import {
  canUseOfdContinuousViewForPreset,
  defaultOfdPageLimitPresetId,
  ofdOpenPolicyForPageCount,
  ofdPageLimitPresets,
  type OfdPageLimitPresetId,
} from "./ofdDocumentPolicyState";
import {
  adjacentOfdPrefetchTargets,
  isCurrentOfdPrefetchBatch,
  nextOfdPrefetchBatchId,
  shouldRunOfdPrefetchTarget,
} from "./ofdPrefetchState";
import {
  createOfdScaleRenderState,
  ofdScalePreviewSize,
  ofdScaleRenderTargetFromSession,
  type OfdScaleRenderRequest,
} from "./ofdScaleRenderState";
import {
  activeDocumentOutlineIndex,
  canUsePageNavigationState,
  canUseReaderNavigationState,
  nextDocumentOutlinePreference,
} from "./readerNavigationState";
import {
  canCopyCurrentPageTextState,
  canRotateViewState,
  canScaleCurrentDocumentState,
  canSelectCurrentPageTextState,
  canUseDocumentFindState,
} from "./readerActionState";
import {
  clampDocumentCenterWidthState,
  clampReaderNavigationFontSizeState,
  clampReaderNavigationWidthState,
  collapsedDocumentCenterRailWidth,
  defaultDocumentCenterWidth,
  defaultReaderNavigationFontSize,
  defaultReaderNavigationWidth,
  minReaderNavigationFontSize,
  maxReaderNavigationFontSize,
} from "./readerLayoutState";
import { readerNavigationControlsState } from "./readerNavigationControlsState";
import { recentFileViewStates } from "./recentFileViewState";
import {
  readerViewModeAfterDocumentOpen,
  readerViewModeForRequest,
  type ReaderViewMode,
} from "./readerViewModeState";
import { readerOpenSnapshot, type ReaderOpenSnapshotState } from "./readerOpenState";
import { readerDocumentCenterState } from "./readerDocumentCenterState";
import { readerToolbarState } from "./readerToolbarState";
import {
  clampReaderScaleState,
  isSameReaderScaleState,
  roundedReaderScaleState,
} from "./readerScaleState";
import {
  appendPerformanceTraceEvent,
  formatPerformanceTrace,
  performancePhaseMessage,
  performanceStatus,
  recommendOfdPerformanceRoute,
  type PerformanceTraceEvent,
  type PerformanceStatus,
} from "./performanceStatus";
import {
  continuousPrintState,
  singlePagePrintState,
  type PrintBodyState,
} from "./printViewState";
import { lineIndexFromTextOffset, lineNumbersForText } from "./textPreviewState";
import {
  currentOfdPageTextFromView,
  documentFindPageTextsFromOfdView,
} from "./ofdTextBridge";
import { renderErrorFromPdfOpenFailure } from "./pdf/pdfErrorMapping";
import {
  openPdfDocumentFromBytes,
  type PdfDocumentHandle,
  type PdfOpenResult,
} from "./pdf/pdfjsAdapter";
import { nextViewRotation, rotatedViewSize, type ViewRotation } from "./viewRotation";
import "./styles.css";

type EngineInfo = {
  name: string;
  version: string;
  protocol_version: string;
  capabilities: string[];
};

type PageInfo = {
  index: number;
  width_pt: number;
  height_pt: number;
};

type DocumentSession = {
  id: string;
  file_type: string;
  page_count: number;
  page_sizes: PageInfo[];
  engine: EngineInfo;
  warnings: string[];
};

type PageBitmap = {
  session_id: string;
  page_index: number;
  scale: number;
  width_px: number;
  height_px: number;
  image_ref: string;
  duration_ms: number;
  warnings: string[];
};

type OfdTextView = {
  session_id: string;
  page_count: number;
  pages: Array<{
    index: number;
    width_pt: number;
    height_pt: number;
    text: string;
  }>;
  duration_ms: number;
  warnings: string[];
};

type RenderError = {
  code: string;
  message: string;
  recoverable: boolean;
  safe_to_show: boolean;
  detail_for_report: string;
};

type RecentFile = {
  id: string;
  display_name: string;
  file_type: string;
  opened_at: string;
  location_hint?: string | null;
};

type RecentFilesView = {
  enabled: boolean;
  entries: RecentFile[];
};

type OfficePdfOpenResult = {
  session_id: string;
  original_file_type: string;
  display_name: string;
  output_pdf_size_bytes: number;
  warnings: string[];
};

type OfficeConverterTestResult = {
  ok: boolean;
  message: string;
};

type TextDocumentView = {
  session_id: string;
  file_type: string;
  display_name: string;
  text: string;
  size_bytes: number;
  warnings: string[];
};

type ImageDocumentView = {
  session_id: string;
  file_type: string;
  display_name: string;
  source_path: string;
  width_px: number;
  height_px: number;
  size_bytes: number;
  warnings: string[];
};

type OfficePreviewLayout = "preserve" | "fit_width_preview";

type OfficePreviewContext = {
  source: "local" | "recent";
  path?: string;
  recentId?: string;
  displayName: string;
  fileType: string;
  layout: OfficePreviewLayout;
};

type ImagePrintFit = "contain" | "cover";

type PrintRequest = {
  pageIndexes: number[];
  imageFit: ImagePrintFit;
};

type CacheCleanupView = {
  removed_session_count: number;
  removed_file_count: number;
};

type DiagnosticSummary = DiagnosticSummaryState;

type PendingDiagnosticContext = {
  file_type: string;
};

type DocumentOutlineItem = {
  title: string;
  pageIndex: number;
  level: number;
};

type ReaderOpenSnapshot = ReaderOpenSnapshotState<
  DocumentSession | null,
  PdfDocumentHandle | null,
  OfficePreviewContext | null,
  ImageDocumentView | null,
  DocumentOutlineItem,
  ViewRotation,
  ReaderViewMode
>;

type DocumentLifecycleStatus =
  | "待命"
  | "正在打开"
  | "正在解析 OFD"
  | "正在渲染 OFD 页面"
  | "正在转换为 PDF 预览"
  | "正在加载缓存"
  | "已打开"
  | "操作失败";

let session: DocumentSession | null = null;
let currentPage = 0;
let scale = 1;
let currentDocumentName = "未打开文档";
let currentDocumentStatus = "待命";
let currentActivityFeedback = "";
let isBusy = false;
let activePdfDocument: PdfDocumentHandle | null = null;
let currentOfficePreview: OfficePreviewContext | null = null;
let readerViewMode: ReaderViewMode = "single";
let ofdPageLimitPresetId: OfdPageLimitPresetId = defaultOfdPageLimitPresetId;
let continuousRenderRequestId = 0;
let lastSuccessfulContinuousRenderKey = "";
const maxLocalOfdPageCacheEntries = 12;
const localOfdPageCache = createOfdPageRenderCache<PageBitmap>({
  maxEntries: maxLocalOfdPageCacheEntries,
});
let ofdPrefetchQueue: Promise<void> = Promise.resolve();
let ofdPrefetchBatchId = 0;
const wheelPageTurnThreshold = 24;
const wheelPageTurnCooldownMs = 240;
const keyboardScrollStep = 80;
type OfdRenderOptions = {
  updateVisibleStatus?: boolean;
  onRendered?: (bitmap: PageBitmap) => void;
};

const appShell = document.querySelector<HTMLElement>(".app-shell");
const railOpenLocalDocumentButton = document.querySelector<HTMLButtonElement>("#rail-open-local-document");
const railFocusReadingModeButton = document.querySelector<HTMLButtonElement>("#rail-focus-reading-mode");
const railOpenSettingsPanelButton = document.querySelector<HTMLButtonElement>("#rail-open-settings-panel");
const railOpenHelpPanelButton = document.querySelector<HTMLButtonElement>("#rail-open-help-panel");
const collapseDocumentCenterButton = document.querySelector<HTMLButtonElement>("#collapse-document-center");
const expandDocumentCenterButton = document.querySelector<HTMLButtonElement>("#expand-document-center");
const documentCenterResizer = document.querySelector<HTMLElement>("#document-center-resizer");
const openLocalDocumentButton = document.querySelector<HTMLButtonElement>("#open-local-document");
const previousButton = document.querySelector<HTMLButtonElement>("#previous-page");
const nextButton = document.querySelector<HTMLButtonElement>("#next-page");
const pageNumberInput = document.querySelector<HTMLInputElement>("#page-number-input");
const pageTotalLabel = document.querySelector<HTMLElement>("#page-total-label");
const jumpPageButton = document.querySelector<HTMLButtonElement>("#jump-page");
const zoomOutButton = document.querySelector<HTMLButtonElement>("#zoom-out");
const zoomInButton = document.querySelector<HTMLButtonElement>("#zoom-in");
const resetZoomButton = document.querySelector<HTMLButtonElement>("#reset-zoom");
const fitWidthButton = document.querySelector<HTMLButtonElement>("#fit-width");
const fitPageButton = document.querySelector<HTMLButtonElement>("#fit-page");
const singlePageViewButton = document.querySelector<HTMLButtonElement>("#single-page-view");
const continuousPageViewButton = document.querySelector<HTMLButtonElement>("#continuous-page-view");
const toggleReaderNavigationButton = document.querySelector<HTMLButtonElement>("#toggle-reader-navigation");
const closeReaderNavigationButton = document.querySelector<HTMLButtonElement>("#close-reader-navigation");
const decreaseReaderNavigationFontButton = document.querySelector<HTMLButtonElement>("#decrease-reader-navigation-font");
const increaseReaderNavigationFontButton = document.querySelector<HTMLButtonElement>("#increase-reader-navigation-font");
const moreReaderToolsButton = document.querySelector<HTMLButtonElement>("#more-reader-tools");
const closeReaderToolsMenuButton = document.querySelector<HTMLButtonElement>("#close-reader-tools-menu");
const readerToolsMenu = document.querySelector<HTMLElement>("#reader-tools-menu");
const openSettingsPanelButton = document.querySelector<HTMLButtonElement>("#open-settings-panel");
const closeSettingsPanelButton = document.querySelector<HTMLButtonElement>("#close-settings-panel");
const settingsPanel = document.querySelector<HTMLElement>("#settings-panel");
const openHelpPanelButton = document.querySelector<HTMLButtonElement>("#open-help-panel");
const closeHelpPanelButton = document.querySelector<HTMLButtonElement>("#close-help-panel");
const helpPanel = document.querySelector<HTMLElement>("#help-panel");
const appearanceThemeOptions = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='appearance-theme']"));
const appearanceThemeDescription = document.querySelector<HTMLElement>("#appearance-theme-description");
const appLanguageOptions = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='app-language']"));
const appLanguageDescription = document.querySelector<HTMLElement>("#app-language-description");
const checkUpdatesActionButton = document.querySelector<HTMLButtonElement>("#check-updates-action");
const updateCheckStatus = document.querySelector<HTMLElement>("#update-check-status");
const feedbackIssuesUrl = "https://github.com/LocalDoc-Viewer/local-doc-viewer/issues";
const openFeedbackIssuesButton = document.querySelector<HTMLButtonElement>("#open-feedback-issues");
const feedbackIssuesStatus = document.querySelector<HTMLElement>("#feedback-issues-status");
const officeConverterExeInput = document.querySelector<HTMLInputElement>("#office-converter-exe");
const testOfficeConverterExeButton = document.querySelector<HTMLButtonElement>("#test-office-converter-exe");
const officeConverterTestStatus = document.querySelector<HTMLElement>("#office-converter-test-status");
const officeLayoutPreviewButton = document.querySelector<HTMLButtonElement>("#office-layout-preview");
const rotateViewLeftButton = document.querySelector<HTMLButtonElement>("#rotate-view-left");
const rotateViewRightButton = document.querySelector<HTMLButtonElement>("#rotate-view-right");
const resetViewRotationButton = document.querySelector<HTMLButtonElement>("#reset-view-rotation");
const selectCurrentPageTextButton = document.querySelector<HTMLButtonElement>("#select-current-page-text");
const copyCurrentPageTextButton = document.querySelector<HTMLButtonElement>("#copy-current-page-text");
const ofdPageLimitOptions = Array.from(document.querySelectorAll<HTMLInputElement>("input[name='ofd-page-limit-preset']"));
const ofdPageLimitDescription = document.querySelector<HTMLElement>("#ofd-page-limit-description");
const focusReadingModeButton = document.querySelector<HTMLButtonElement>("#focus-reading-mode");
const settingsPanelButtons = [openSettingsPanelButton, railOpenSettingsPanelButton].filter(
  (button): button is HTMLButtonElement => Boolean(button),
);
const helpPanelButtons = [openHelpPanelButton, railOpenHelpPanelButton].filter(
  (button): button is HTMLButtonElement => Boolean(button),
);
const focusReadingModeButtons = [focusReadingModeButton, railFocusReadingModeButton].filter(
  (button): button is HTMLButtonElement => Boolean(button),
);
const findQueryInput = document.querySelector<HTMLInputElement>("#pdf-find-query");
const findPreviousButton = document.querySelector<HTMLButtonElement>("#find-previous");
const findNextButton = document.querySelector<HTMLButtonElement>("#find-next");
const clearFindButton = document.querySelector<HTMLButtonElement>("#clear-find");
const findStatus = document.querySelector<HTMLElement>("#pdf-find-status");
const printDocumentButton = document.querySelector<HTMLButtonElement>("#print-document");
const refreshRecentFilesButton = document.querySelector<HTMLButtonElement>("#refresh-recent-files");
const recentFilesList = document.querySelector<HTMLUListElement>("#recent-files-list");
const recentFilesEnabled = document.querySelector<HTMLInputElement>("#recent-files-enabled");
const clearRecentFilesButton = document.querySelector<HTMLButtonElement>("#clear-recent-files");
const clearRenderCacheButton = document.querySelector<HTMLButtonElement>("#clear-render-cache");
const documentName = document.querySelector<HTMLElement>("#document-name");
const documentStatus = document.querySelector<HTMLElement>("#document-status");
const activityFeedback = document.querySelector<HTMLElement>("#activity-feedback");
const pageCount = document.querySelector<HTMLElement>("#page-count");
const scaleValue = document.querySelector<HTMLElement>("#scale-value");
const pageNavigationSection = document.querySelector<HTMLElement>("#page-navigation-section");
const pageNavigationList = document.querySelector<HTMLUListElement>("#page-navigation-list");
const pageNavigationEmpty = document.querySelector<HTMLElement>("#page-navigation-empty");
const documentOutlineSection = document.querySelector<HTMLElement>("#document-outline-section");
const documentOutlineList = document.querySelector<HTMLUListElement>("#document-outline-list");
const documentOutlineEmpty = document.querySelector<HTMLElement>("#document-outline-empty");
const readerWorkspace = document.querySelector<HTMLElement>("#reader-workspace");
const readerNavigationPanel = document.querySelector<HTMLElement>("#reader-navigation-panel");
const readerNavigationResizer = document.querySelector<HTMLElement>("#reader-navigation-resizer");
const pageStage = document.querySelector<HTMLElement>("#page-stage");
const pageSurface = document.querySelector<HTMLElement>("#page-surface");
const printPagesContainer = document.querySelector<HTMLElement>("#print-pages");
const pagePlaceholder = document.querySelector<HTMLElement>("#page-placeholder");
const errorDiagnosticOverlay = document.querySelector<HTMLElement>("#error-diagnostic-overlay");
const closeErrorDiagnosticOverlayButton = document.querySelector<HTMLButtonElement>("#close-error-diagnostic-overlay");
const errorMessage = document.querySelector<HTMLElement>("#error-message");
const copyDiagnosticInfoButton = document.querySelector<HTMLButtonElement>("#copy-diagnostic-info");
let pageImage: HTMLImageElement | null = null;
let pageCanvas: HTMLCanvasElement | null = null;
let pageTextLayer: HTMLDivElement | null = null;
let textPreviewShell: HTMLDivElement | null = null;
let textLineNumbers: HTMLDivElement | null = null;
let textPreviewSurface: HTMLPreElement | null = null;
let continuousPagesContainer: HTMLDivElement | null = null;
let continuousPdfSlotObserver: IntersectionObserver | null = null;
let continuousOfdSlotObserver: IntersectionObserver | null = null;
let continuousPdfRenderQueueBatchId = 0;
let continuousPdfRenderQueueRunning = false;
let continuousPdfRenderQueue: number[] = [];
let continuousPdfRenderedPageIndexes = new Set<number>();
let continuousPdfLoadingPageIndexes = new Set<number>();
let continuousPdfPageSlots = new Map<number, HTMLElement>();
let pdfContinuousPageLayoutCache: {
  key: string;
  pageSizes: PdfContinuousPageSize[];
  pageSizeIndex: PdfContinuousPageSizeIndex;
  layout: PdfContinuousPageLayout;
} | null = null;
let continuousScrollSyncFrame: number | null = null;
let currentTextDocumentText = "";
let currentImageDocumentView: ImageDocumentView | null = null;
let recentFiles: RecentFilesView = { enabled: true, entries: [] };
const recentUnavailableIds = new Set<string>();
let lastErrorSummary: DiagnosticSummary | null = null;
let isErrorDiagnosticOverlayDismissed = false;
let pendingDiagnosticContext: PendingDiagnosticContext | null = null;
let documentFindQuery = "";
let documentFindMatches: DocumentFindMatch[] = [];
let documentFindActiveIndex = -1;
let documentOutlineItems: DocumentOutlineItem[] = [];
let preservedDocumentOutlineScrollTop: number | null = null;
let preferredDocumentOutlineIndex: number | null = null;
let preferredDocumentOutlinePageIndex: number | null = null;
let autoChapterNavigationRequestId = 0;
let activeAutoChapterNavigationRequestId: number | null = null;
const MAX_AUTO_CHAPTER_SCAN_PAGES = 1000;
let isFindingDocument = false;
let isReaderToolsMenuOpen = false;
let isDocumentCenterCollapsed = false;
let isDocumentCenterResizing = false;
let documentCenterWidth = defaultDocumentCenterWidth;
let isReaderNavigationOpen = false;
let hasReaderNavigationUserPreference = false;
let isReaderNavigationResizing = false;
let readerNavigationWidth = defaultReaderNavigationWidth;
let readerNavigationFontSize = defaultReaderNavigationFontSize;
let appearanceThemePreference: AppearanceThemePreference = defaultAppearanceThemePreference;
const appearanceThemeStorageKey = "local-doc-viewer.appearance-theme";
type AppLanguagePreference = "zh-CN" | "en-US";
const defaultAppLanguagePreference: AppLanguagePreference = "zh-CN";
let appLanguagePreference: AppLanguagePreference = defaultAppLanguagePreference;
const appLanguageStorageKey = "local-doc-viewer.app-language";
const officeConverterExeStorageKey = "local-doc-viewer.office-converter-exe";
const systemDarkThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
let isActivityFeedbackDragging = false;
let activityFeedbackUserPosition: Point | null = null;
let activityFeedbackDragOffset = { left: 0, top: 0 };
let isErrorDiagnosticOverlayDragging = false;
let errorDiagnosticOverlayUserPosition: Point | null = null;
let errorDiagnosticOverlayDragOffset = { left: 0, top: 0 };
let isFocusReadingMode = false;
let focusReadingSnapshot: {
  documentCenterCollapsed: boolean;
  readerNavigationOpen: boolean;
  readerNavigationUserPreference: boolean;
  activityFeedback: string;
  errorDiagnosticDismissed: boolean;
} | null = null;
let lastWheelPageTurnAt = 0;
let pdfViewRotation: ViewRotation = 0;
let lastLocalDocumentDirectory: string | null = null;
let currentPerformanceStatus: PerformanceStatus = performanceStatus("idle");
let performanceTraceEvents: PerformanceTraceEvent[] = [];
const ofdScaleRenderState = createOfdScaleRenderState();

function pageDisplaySize(bitmap: PageBitmap) {
  const pageInfo = session?.page_sizes.find((page) => page.index === bitmap.page_index);
  if (!pageInfo) {
    return {
      width: bitmap.width_px,
      height: bitmap.height_px,
    };
  }

  return {
    width: Math.round(pageInfo.width_pt * 2 * bitmap.scale),
    height: Math.round(pageInfo.height_pt * 2 * bitmap.scale),
  };
}

function clampScale(value: number) {
  return clampReaderScaleState(value);
}

function roundedScale(value: number) {
  return roundedReaderScaleState(value);
}

function isSameScale(left: number, right: number) {
  return isSameReaderScaleState(left, right);
}

function currentPageInfo() {
  return session?.page_sizes.find((page) => page.index === currentPage) ?? null;
}

function pageScaleBaseSize() {
  const pageInfo = currentPageInfo();
  if (!pageInfo) {
    return null;
  }

  const bitmapScaleBase = session?.file_type === "pdf" || isImageSession() ? 1 : 2;
  const size = {
    width: pageInfo.width_pt * bitmapScaleBase,
    height: pageInfo.height_pt * bitmapScaleBase,
  };
  return session?.file_type === "pdf" || isImageSession() ? rotatedViewSize(size, pdfViewRotation) : size;
}

function pdfContinuousPageSizesForCurrentView() {
  if (!session) {
    return [];
  }
  return session.page_sizes.map((page) => {
    const size = rotatedViewSize({ width: page.width_pt, height: page.height_pt }, pdfViewRotation);
    return {
      index: page.index,
      width_pt: size.width,
      height_pt: size.height,
    };
  });
}

function currentPdfContinuousPageLayout() {
  const key = continuousRenderKey();
  if (!session || session.file_type !== "pdf") {
    pdfContinuousPageLayoutCache = null;
    return null;
  }
  if (pdfContinuousPageLayoutCache?.key === key) {
    return pdfContinuousPageLayoutCache.layout;
  }
  const pageSizes = pdfContinuousPageSizesForCurrentView();
  const pageSizeIndex = pdfContinuousPageSizeIndex(pageSizes);
  const layout = pdfContinuousPageLayout({
    pageCount: session.page_count,
    scale,
    pageSizes,
    pageSizeIndex,
  });
  pdfContinuousPageLayoutCache = {
    key,
    pageSizes,
    pageSizeIndex,
    layout,
  };
  return layout;
}

function currentPdfContinuousPageSizes() {
  currentPdfContinuousPageLayout();
  return pdfContinuousPageLayoutCache?.pageSizes ?? pdfContinuousPageSizesForCurrentView();
}

function currentPdfContinuousPageSizeIndex() {
  currentPdfContinuousPageLayout();
  return pdfContinuousPageLayoutCache?.pageSizeIndex;
}

function setPageSurfacePrintSize(width: number, height: number) {
  if (!pageSurface) {
    return;
  }

  pageSurface.style.setProperty("--ldv-page-print-width", String(Math.max(1, Math.round(width))));
  pageSurface.style.setProperty("--ldv-page-print-height", String(Math.max(1, Math.round(height))));
  pageSurface.dataset.printOrientation = width >= height ? "landscape" : "portrait";
}

function stageContentSize() {
  if (!pageStage) {
    return null;
  }

  const style = window.getComputedStyle(pageStage);
  const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
  const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
  const width = pageStage.clientWidth - horizontalPadding;
  const height = pageStage.clientHeight - verticalPadding;
  if (width <= 0 || height <= 0) {
    return null;
  }

  return { width, height };
}

function scrollbarThickness() {
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.overflow = "scroll";
  probe.style.width = "100px";
  probe.style.height = "100px";
  document.body.append(probe);
  const thickness = probe.offsetWidth - probe.clientWidth;
  probe.remove();
  return thickness;
}

function formatOpenedAt(value: string) {
  const seconds = Number.parseInt(value, 10);
  if (/^\d+$/.test(value) && !Number.isNaN(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toLocaleString();
  }

  // Accept UTC RFC3339 timestamps if the Rust storage schema switches later.
  const parsedTimestamp = Date.parse(value);
  if (!Number.isNaN(parsedTimestamp)) {
    return new Date(parsedTimestamp).toLocaleString();
  }

  return value || "刚刚";
}

async function renderLocalOfdPage(
  sessionId: string,
  pageIndex: number,
  pageScale: number,
  options: OfdRenderOptions = {},
) {
  return renderOfdPageThroughCache({
    cache: localOfdPageCache,
    sessionId,
    pageIndex,
    pageScale,
    updateVisibleStatus: options.updateVisibleStatus !== false,
    currentSessionId: session?.id ?? null,
    onVisibleCacheHit: () => {
      const cacheHitStatus = performanceStatus("ofd_cache_hit");
      setPerformanceStatus(cacheHitStatus);
      performanceTraceEvents = appendPerformanceTraceEvent(performanceTraceEvents, cacheHitStatus);
    },
    renderPage: async () => {
      return invoke<PageBitmap>("render_local_ofd_page", {
        sessionId,
        pageIndex,
        scale: pageScale,
      });
    },
    onRendered: options.onRendered,
  });
}

async function prefetchLocalOfdPage(sessionId: string, pageIndex: number, pageScale: number) {
  try {
    await renderLocalOfdPage(sessionId, pageIndex, pageScale, { updateVisibleStatus: false });
  } catch {
    // Adjacent-page prefetch is best-effort and must not interrupt reading.
  }
}

function prefetchAdjacentOfdPages(sessionId: string, pageIndex: number, pageScale: number) {
  ofdPrefetchBatchId = nextOfdPrefetchBatchId(ofdPrefetchBatchId);
  const batchId = ofdPrefetchBatchId;
  const targets = adjacentOfdPrefetchTargets({
    currentSession: session,
    renderedSessionId: sessionId,
    renderedPageIndex: pageIndex,
    renderedScale: pageScale,
  });

  ofdPrefetchQueue = ofdPrefetchQueue.then(async () => {
    if (!isCurrentOfdPrefetchBatch({ batchId, currentBatchId: ofdPrefetchBatchId })) {
      return;
    }
    for (const target of targets) {
      if (!shouldRunOfdPrefetchTarget({
        currentSession: session,
        currentPageIndex: currentPage,
        currentScale: scale,
        target,
      })) {
        continue;
      }
      await prefetchLocalOfdPage(target.sessionId, target.pageIndex, target.scale);
    }
  }).catch(() => {
    // Adjacent-page prefetch is best-effort and must keep future queued prefetches alive.
  });
}

async function cleanupPreviousDocumentCache(
  previousSession: DocumentSession | null,
  nextSession: DocumentSession | null,
) {
  const cleanupSessionId = previousDocumentCacheCleanupTarget(previousSession, nextSession);
  if (!cleanupSessionId || !previousSession) {
    return;
  }

  clearPageCacheForSession(previousSession);
  try {
    await invoke<boolean>("cleanup_render_cache_session", {
      sessionId: cleanupSessionId,
    });
  } catch {
    // Cache cleanup is best-effort and must not interrupt viewing.
  }
}

function clearPageCacheForSession(targetSession: DocumentSession) {
  clearOfdPageCacheForSession(localOfdPageCache, targetSession);
}

function clearPageCacheExceptSession(currentSessionId: string | null) {
  clearOfdPageCacheExceptSession(localOfdPageCache, currentSessionId);
}

function clearAllLocalOfdPageWork() {
  clearAllOfdPageWork(localOfdPageCache);
}

async function disposeActivePdfDocument() {
  const documentToDispose = activePdfDocument;
  activePdfDocument = null;
  if (documentToDispose) {
    try {
      await documentToDispose.destroy();
    } catch {
      // PDF cleanup is best-effort and must not interrupt document switching.
    }
  }
}

function diagnosticSummaryFromError(renderError: Partial<RenderError> | null, message: string): DiagnosticSummary {
  const summarySession = pendingDiagnosticContext ? null : session;
  const diagnosticFileType = pendingDiagnosticContext?.file_type ?? summarySession?.file_type ?? "unknown";
  return diagnosticSummaryFromState({
    renderError,
    message,
    pendingFileType: pendingDiagnosticContext?.file_type ?? null,
    session: summarySession
      ? {
          fileType: summarySession.file_type,
          page: `${currentPage + 1}/${summarySession.page_count}`,
          engine: `${summarySession.engine.name} ${summarySession.engine.version} protocol ${summarySession.engine.protocol_version}`,
        }
      : null,
    scale: `${Math.round(scale * 100)}%`,
    action: currentDocumentStatus || "unknown",
    performancePhase: currentPerformanceStatus.phase,
    performanceDurationBucket: currentPerformanceStatus.duration_bucket,
    performanceRecentEvents: diagnosticFileType === "ofd" ? formatPerformanceTrace(performanceTraceEvents) : "none",
    performanceRecommendation: diagnosticFileType === "ofd" ? recommendOfdPerformanceRoute(performanceTraceEvents) : "insufficient_events",
    createdAt: new Date().toISOString(),
  });
}

const diagnosticSummaryFields = [
  "code",
  "message",
  "file_type",
  "page",
  "scale",
  "engine",
  "action",
  "performance_phase",
  "performance_duration_bucket",
  "performance_recent_events",
  "performance_recommendation",
  "created_at",
] as const;

function diagnosticSummaryText(summary: DiagnosticSummary) {
  return [
    "local-doc-viewer diagnostic summary",
    ...diagnosticSummaryFields.map((field) => `${field}: ${summary[field]}`),
  ].join("\n");
}

function isRenderError(error: unknown): error is RenderError {
  return typeof error === "object" && error !== null && "code" in error && "message" in error && "safe_to_show" in error;
}

function updateErrorDiagnosticOverlay() {
  if (!errorDiagnosticOverlay) {
    return;
  }
  const hasVisibleErrorDiagnosticOverlay = !!lastErrorSummary && !isErrorDiagnosticOverlayDismissed;
  errorDiagnosticOverlay.hidden = !hasVisibleErrorDiagnosticOverlay;
  syncErrorDiagnosticOverlayPosition();
}

function updateDiagnosticActions() {
  if (!copyDiagnosticInfoButton) {
    return;
  }

  copyDiagnosticInfoButton.hidden = !lastErrorSummary;
  copyDiagnosticInfoButton.disabled = isBusy || !lastErrorSummary;
}

function setDocumentStatus(status: DocumentLifecycleStatus) {
  currentDocumentStatus = status;
}

function setActivityFeedback(message: string) {
  currentActivityFeedback = message;
}

function clearActivityFeedback() {
  currentActivityFeedback = "";
}

function activityFeedbackDefaultPosition() {
  if (!activityFeedback || !pageStage) {
    return null;
  }
  const stageRect = pageStage.getBoundingClientRect();
  const feedbackRect = activityFeedback.getBoundingClientRect();
  return centeredTopOverlayPosition(stageRect, feedbackRect, 26);
}

function clampActivityFeedbackPosition(left: number, top: number) {
  if (!activityFeedback || !pageStage) {
    return { left, top };
  }
  const stageRect = pageStage.getBoundingClientRect();
  const feedbackRect = activityFeedback.getBoundingClientRect();
  return clampOverlayPosition({ left, top }, stageRect, feedbackRect, { margin: 8 });
}

function applyActivityFeedbackPosition(position: Point) {
  if (!activityFeedback) {
    return;
  }
  const viewerRect = activityFeedback.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  activityFeedback.style.setProperty("--activity-feedback-x", `${Math.round(position.left - viewerRect.left)}px`);
  activityFeedback.style.setProperty("--activity-feedback-y", `${Math.round(position.top - viewerRect.top)}px`);
  activityFeedback.style.setProperty("--activity-feedback-translate-x", "0");
}

function resetActivityFeedbackPosition() {
  activityFeedback?.style.removeProperty("--activity-feedback-x");
  activityFeedback?.style.removeProperty("--activity-feedback-y");
  activityFeedback?.style.removeProperty("--activity-feedback-translate-x");
}

function syncActivityFeedbackPosition() {
  if (!activityFeedback || activityFeedback.hidden) {
    return;
  }
  const preferredPosition = activityFeedbackUserPosition ?? activityFeedbackDefaultPosition();
  if (!preferredPosition) {
    resetActivityFeedbackPosition();
    return;
  }
  const clampedPosition = clampActivityFeedbackPosition(preferredPosition.left, preferredPosition.top);
  if (activityFeedbackUserPosition) {
    activityFeedbackUserPosition = clampedPosition;
  }
  applyActivityFeedbackPosition(clampedPosition);
}

function errorDiagnosticOverlayDefaultPosition() {
  if (!errorDiagnosticOverlay || !pageStage) {
    return null;
  }
  const stageRect = pageStage.getBoundingClientRect();
  const overlayRect = errorDiagnosticOverlay.getBoundingClientRect();
  return centeredBottomOverlayPosition(stageRect, overlayRect, 24);
}

function clampErrorDiagnosticOverlayPosition(left: number, top: number) {
  if (!errorDiagnosticOverlay || !pageStage) {
    return { left, top };
  }
  const stageRect = pageStage.getBoundingClientRect();
  const margin = 8;
  const maxOverlayWidth = overlayMaxWidth(stageRect, { margin, minWidth: 160 });
  errorDiagnosticOverlay.style.setProperty("--error-diagnostic-overlay-max-width", `${maxOverlayWidth}px`);
  const overlayRect = errorDiagnosticOverlay.getBoundingClientRect();
  return clampOverlayPosition({ left, top }, stageRect, overlayRect, {
    margin,
    maxElementWidth: maxOverlayWidth,
  });
}

function applyErrorDiagnosticOverlayPosition(position: Point) {
  if (!errorDiagnosticOverlay) {
    return;
  }
  const viewerRect = errorDiagnosticOverlay.offsetParent?.getBoundingClientRect() ?? { left: 0, top: 0 };
  errorDiagnosticOverlay.style.setProperty("--error-diagnostic-overlay-x", `${Math.round(position.left - viewerRect.left)}px`);
  errorDiagnosticOverlay.style.setProperty("--error-diagnostic-overlay-y", `${Math.round(position.top - viewerRect.top)}px`);
}

function resetErrorDiagnosticOverlayPosition() {
  errorDiagnosticOverlay?.style.removeProperty("--error-diagnostic-overlay-x");
  errorDiagnosticOverlay?.style.removeProperty("--error-diagnostic-overlay-y");
  errorDiagnosticOverlay?.style.removeProperty("--error-diagnostic-overlay-max-width");
}

function syncErrorDiagnosticOverlayPosition() {
  if (!errorDiagnosticOverlay || errorDiagnosticOverlay.hidden) {
    return;
  }
  const preferredPosition = errorDiagnosticOverlayUserPosition ?? errorDiagnosticOverlayDefaultPosition();
  if (!preferredPosition) {
    resetErrorDiagnosticOverlayPosition();
    return;
  }
  const clampedPosition = clampErrorDiagnosticOverlayPosition(preferredPosition.left, preferredPosition.top);
  if (errorDiagnosticOverlayUserPosition) {
    errorDiagnosticOverlayUserPosition = clampedPosition;
  }
  applyErrorDiagnosticOverlayPosition(clampedPosition);
}

function dragErrorDiagnosticOverlay(event: PointerEvent) {
  if (!isErrorDiagnosticOverlayDragging) {
    return;
  }
  const nextPosition = clampErrorDiagnosticOverlayPosition(
    event.clientX - errorDiagnosticOverlayDragOffset.left,
    event.clientY - errorDiagnosticOverlayDragOffset.top,
  );
  errorDiagnosticOverlayUserPosition = nextPosition;
  applyErrorDiagnosticOverlayPosition(nextPosition);
}

function stopErrorDiagnosticOverlayDrag() {
  if (!isErrorDiagnosticOverlayDragging) {
    return;
  }
  isErrorDiagnosticOverlayDragging = false;
  errorDiagnosticOverlay?.classList.remove("is-dragging");
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
  window.removeEventListener("pointermove", dragErrorDiagnosticOverlay);
  window.removeEventListener("pointerup", stopErrorDiagnosticOverlayDrag);
  if (errorDiagnosticOverlay?.dataset.pointerId) {
    errorDiagnosticOverlay.releasePointerCapture?.(Number(errorDiagnosticOverlay.dataset.pointerId));
    delete errorDiagnosticOverlay.dataset.pointerId;
  }
}

function startErrorDiagnosticOverlayDrag(event: PointerEvent) {
  if (
    !errorDiagnosticOverlay
    || errorDiagnosticOverlay.hidden
    || event.button !== 0
    || (event.target instanceof Element && !!event.target.closest("button"))
  ) {
    return;
  }
  event.preventDefault();
  const overlayRect = errorDiagnosticOverlay.getBoundingClientRect();
  errorDiagnosticOverlayDragOffset = {
    left: event.clientX - overlayRect.left,
    top: event.clientY - overlayRect.top,
  };
  errorDiagnosticOverlayUserPosition = clampErrorDiagnosticOverlayPosition(overlayRect.left, overlayRect.top);
  isErrorDiagnosticOverlayDragging = true;
  errorDiagnosticOverlay.classList.add("is-dragging");
  errorDiagnosticOverlay.setPointerCapture?.(event.pointerId);
  errorDiagnosticOverlay.dataset.pointerId = String(event.pointerId);
  document.body.style.cursor = "grabbing";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", dragErrorDiagnosticOverlay);
  window.addEventListener("pointerup", stopErrorDiagnosticOverlayDrag, { once: true });
}

function dragActivityFeedback(event: PointerEvent) {
  if (!isActivityFeedbackDragging) {
    return;
  }
  const nextPosition = clampActivityFeedbackPosition(
    event.clientX - activityFeedbackDragOffset.left,
    event.clientY - activityFeedbackDragOffset.top,
  );
  activityFeedbackUserPosition = nextPosition;
  applyActivityFeedbackPosition(nextPosition);
}

function stopActivityFeedbackDrag() {
  if (!isActivityFeedbackDragging) {
    return;
  }
  isActivityFeedbackDragging = false;
  activityFeedback?.classList.remove("is-dragging");
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
  window.removeEventListener("pointermove", dragActivityFeedback);
  window.removeEventListener("pointerup", stopActivityFeedbackDrag);
  if (activityFeedback?.dataset.pointerId) {
    activityFeedback.releasePointerCapture?.(Number(activityFeedback.dataset.pointerId));
    delete activityFeedback.dataset.pointerId;
  }
}

function startActivityFeedbackDrag(event: PointerEvent) {
  if (!activityFeedback || activityFeedback.hidden || event.button !== 0) {
    return;
  }
  event.preventDefault();
  const feedbackRect = activityFeedback.getBoundingClientRect();
  activityFeedbackDragOffset = {
    left: event.clientX - feedbackRect.left,
    top: event.clientY - feedbackRect.top,
  };
  activityFeedbackUserPosition = clampActivityFeedbackPosition(feedbackRect.left, feedbackRect.top);
  isActivityFeedbackDragging = true;
  activityFeedback.classList.add("is-dragging");
  activityFeedback.setPointerCapture?.(event.pointerId);
  activityFeedback.dataset.pointerId = String(event.pointerId);
  document.body.style.cursor = "grabbing";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", dragActivityFeedback);
  window.addEventListener("pointerup", stopActivityFeedbackDrag, { once: true });
}

function setPerformanceStatus(next: PerformanceStatus) {
  currentPerformanceStatus = next;
  const message = performancePhaseMessage(next.phase);
  if (message) {
    setDocumentStatus(message);
    updateMetadata();
  }
}

function recordPerformanceStatus(next: PerformanceStatus) {
  currentPerformanceStatus = next;
  performanceTraceEvents = appendPerformanceTraceEvent(performanceTraceEvents, next);
}

function recordOfdRenderPerformance(renderStartedAt: number, renderDurationMs: number) {
  recordPerformanceStatus(performanceStatus("ofd_render_wait", performance.now() - renderStartedAt));
  recordPerformanceStatus(performanceStatus("ofd_render_page", renderDurationMs));
}

function resetPerformanceTrace() {
  performanceTraceEvents = [];
}

function finishPerformanceStatus(fallbackStatus: DocumentLifecycleStatus) {
  currentPerformanceStatus = performanceStatus("idle");
  setDocumentStatus(fallbackStatus);
}

function showError(error: unknown) {
  const renderError = isRenderError(error) ? error : null;
  const safeMessage =
    renderError && renderError.safe_to_show !== false
      ? String(renderError.message ?? "").trim()
      : "";
  const message =
    safeMessage || "操作失败，请查看诊断信息。";
  if (errorMessage) {
    errorMessage.textContent = message;
  }
  setDocumentStatus("操作失败");
  clearActivityFeedback();
  lastErrorSummary = diagnosticSummaryFromError(renderError, message);
  isErrorDiagnosticOverlayDismissed = false;
  updateErrorDiagnosticOverlay();
  updateDiagnosticActions();
  updateMetadata();
}

function dismissErrorDiagnosticOverlay() {
  isErrorDiagnosticOverlayDismissed = true;
  updateErrorDiagnosticOverlay();
  updateMetadata();
}

function clearError() {
  if (errorMessage) {
    errorMessage.textContent = "";
  }
  lastErrorSummary = null;
  isErrorDiagnosticOverlayDismissed = false;
  updateErrorDiagnosticOverlay();
  updateDiagnosticActions();
}

function resetDocumentFindState() {
  documentFindQuery = "";
  documentFindMatches = [];
  documentFindActiveIndex = -1;
  isFindingDocument = false;
  if (findQueryInput) {
    findQueryInput.value = "";
  }
}

function cancelAutoChapterNavigation() {
  autoChapterNavigationRequestId += 1;
  activeAutoChapterNavigationRequestId = null;
}

function isCurrentPageTextCopyUnavailable() {
  return (
    !pageTextLayer
    || pageTextLayer.dataset.textLayerEmpty === "true"
    || pageTextLayer.dataset.textLayerUnavailable === "true"
  );
}

function isTextSession() {
  return !!session && isTextFileType(session.file_type);
}

function isImageSession() {
  return !!session && isImageFileType(session.file_type);
}

function canUseContinuousView() {
  return !!session && (
    session.file_type === "pdf"
    || (session.file_type === "ofd" && canUseOfdContinuousViewForPreset(ofdPageLimitPresetId))
    || !!currentOfficePreview
  );
}

function currentOfdPageLimitPreset() {
  return ofdPageLimitPresets.find((preset) => preset.id === ofdPageLimitPresetId)
    ?? ofdPageLimitPresets[0];
}

function syncOfdPageLimitControls() {
  const preset = currentOfdPageLimitPreset();
  for (const option of ofdPageLimitOptions) {
    option.checked = option.value === preset.id;
  }
  if (ofdPageLimitDescription) {
    ofdPageLimitDescription.textContent = preset.description;
  }
}

function isSystemDarkTheme() {
  return systemDarkThemeQuery.matches;
}

function syncAppearanceThemeControls() {
  const dataset = appearanceThemeDataset(appearanceThemePreference, isSystemDarkTheme());
  document.documentElement.dataset.appearanceThemePreference = dataset.preference;
  document.documentElement.dataset.theme = dataset.resolved;
  for (const option of appearanceThemeOptions) {
    option.checked = option.value === appearanceThemePreference;
  }
  if (appearanceThemeDescription) {
    appearanceThemeDescription.textContent = dataset.resolved === "dark-comfort"
      ? "当前使用暗黑护眼：灰黑低亮界面，PDF / OFD / 图片内容保持原始颜色。"
      : "默认跟随 Windows 深色模式；暗黑护眼使用低亮度灰黑界面，不反色 PDF / OFD / 图片内容。";
  }
}

function loadAppearanceThemePreference() {
  try {
    appearanceThemePreference = appearanceThemePreferenceFromStorage(
      window.localStorage.getItem(appearanceThemeStorageKey),
    );
  } catch {
    appearanceThemePreference = defaultAppearanceThemePreference;
  }
  syncAppearanceThemeControls();
}

function setAppearanceThemePreference(preference: AppearanceThemePreference) {
  appearanceThemePreference = appearanceThemePreferenceFromStorage(preference);
  try {
    window.localStorage.setItem(appearanceThemeStorageKey, appearanceThemePreference);
  } catch {
    // Theme preference persistence is best-effort.
  }
  syncAppearanceThemeControls();
}

function appLanguagePreferenceFromStorage(value: string | null): AppLanguagePreference {
  return value === "en-US" ? "en-US" : defaultAppLanguagePreference;
}

function syncAppLanguageControls() {
  const preference = appLanguagePreference;
  document.documentElement.lang = preference;
  for (const option of appLanguageOptions) {
    option.checked = option.value === preference;
  }
  if (appLanguageDescription) {
    appLanguageDescription.textContent = preference === "en-US"
      ? "English UI text is still incomplete; this preference is saved for later localization."
      : "当前阶段保存语言偏好，默认中文；完整英文界面将在后续版本逐步补齐。";
  }
}

function loadAppLanguagePreference() {
  try {
    appLanguagePreference = appLanguagePreferenceFromStorage(
      window.localStorage.getItem(appLanguageStorageKey),
    );
  } catch {
    appLanguagePreference = defaultAppLanguagePreference;
  }
  syncAppLanguageControls();
}

function setAppLanguagePreference(preference: AppLanguagePreference) {
  appLanguagePreference = appLanguagePreferenceFromStorage(preference);
  try {
    window.localStorage.setItem(appLanguageStorageKey, appLanguagePreference);
  } catch {
    // Language preference persistence is best-effort.
  }
  syncAppLanguageControls();
  setActivityFeedback(appLanguagePreference === "en-US" ? "Language preference saved" : "已保存语言偏好");
  updateMetadata();
}

function officeConverterExePreference() {
  return officeConverterExeInput?.value.trim() || null;
}

function desktopPlatformHint(navigatorLike: Pick<Navigator, "platform" | "userAgent"> = window.navigator) {
  const platformText = `${navigatorLike.platform} ${navigatorLike.userAgent}`.toLowerCase();
  if (platformText.includes("win")) {
    return "windows";
  }
  if (platformText.includes("linux")) {
    return "linux";
  }
  if (platformText.includes("mac")) {
    return "macos";
  }
  return "other";
}

function officeConverterPathHint(platform = desktopPlatformHint()) {
  if (platform === "windows") {
    return {
      placeholder: "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
      title: "填写本机 LibreOffice 程序路径，例如 C:\\Program Files\\LibreOffice\\program\\soffice.exe。Office / WPS 预览会在本机调用它转换为临时 PDF，不会上传文件。",
    };
  }
  if (platform === "linux") {
    return {
      placeholder: "/usr/bin/libreoffice 或 /usr/bin/soffice",
      title: "填写本机 LibreOffice 程序路径，例如 /usr/bin/libreoffice 或 /usr/bin/soffice。Office / WPS 预览会在本机调用它转换为临时 PDF，不会上传文件。",
    };
  }
  if (platform === "macos") {
    return {
      placeholder: "/Applications/LibreOffice.app/Contents/MacOS/soffice",
      title: "填写本机 LibreOffice 程序路径，例如 /Applications/LibreOffice.app/Contents/MacOS/soffice。Office / WPS 预览会在本机调用它转换为临时 PDF，不会上传文件。",
    };
  }
  return {
    placeholder: "LibreOffice / soffice 程序路径",
    title: "填写本机 LibreOffice 程序路径。Office / WPS 预览会在本机调用它转换为临时 PDF，不会上传文件。",
  };
}

function syncOfficeConverterPathHint() {
  if (!officeConverterExeInput) {
    return;
  }
  const hint = officeConverterPathHint();
  officeConverterExeInput.placeholder = hint.placeholder;
  officeConverterExeInput.closest("label")?.setAttribute("title", hint.title);
}

function loadOfficeConverterExePreference() {
  if (!officeConverterExeInput) {
    return;
  }
  try {
    officeConverterExeInput.value = window.localStorage.getItem(officeConverterExeStorageKey) ?? "";
  } catch {
    officeConverterExeInput.value = "";
  }
}

function saveOfficeConverterExePreference() {
  const value = officeConverterExePreference();
  try {
    if (value) {
      window.localStorage.setItem(officeConverterExeStorageKey, value);
    } else {
      window.localStorage.removeItem(officeConverterExeStorageKey);
    }
  } catch {
    // Office converter preference persistence is best-effort.
  }
}

function setOfficeConverterTestStatus(kind: "idle" | "ok" | "error", message = "") {
  if (!officeConverterTestStatus) {
    return;
  }
  officeConverterTestStatus.textContent = message;
  officeConverterTestStatus.classList.toggle("is-ok", kind === "ok");
  officeConverterTestStatus.classList.toggle("is-error", kind === "error");
}

async function testOfficeConverterExePreference() {
  if (!testOfficeConverterExeButton) {
    return;
  }
  saveOfficeConverterExePreference();
  testOfficeConverterExeButton.disabled = true;
  setOfficeConverterTestStatus("idle", "正在测试...");
  try {
    const result = await invoke<OfficeConverterTestResult>("test_office_converter_executable", {
      converterExecutablePath: officeConverterExePreference(),
    });
    setOfficeConverterTestStatus(result.ok ? "ok" : "error", result.message);
  } catch {
    setOfficeConverterTestStatus("error", "测试失败，请检查程序路径。");
  } finally {
    testOfficeConverterExeButton.disabled = false;
  }
}

function ofdPageLimitRenderError(message: string): RenderError {
  return {
    code: "OFD_PAGE_LIMIT_EXCEEDED",
    message,
    recoverable: true,
    safe_to_show: true,
    detail_for_report: "ofd page count exceeds configured product limit",
  };
}

function assertOfdOpenPolicy(documentSession: DocumentSession) {
  if (documentSession.file_type !== "ofd") {
    return;
  }
  const openPolicy = ofdOpenPolicyForPageCount({
    pageCount: documentSession.page_count,
    presetId: ofdPageLimitPresetId,
  });
  if (!openPolicy.allowed) {
    throw ofdPageLimitRenderError(openPolicy.message);
  }
}

function canUsePageNavigation() {
  return canUsePageNavigationState({
    hasSession: !!session,
    pageCount: session?.page_count ?? 0,
    isTextSession: isTextSession(),
    isImageSession: isImageSession(),
    outlineCount: documentOutlineItems.length,
  });
}

async function setReaderViewMode(mode: ReaderViewMode) {
  if (!session || isBusy) {
    return;
  }
  const nextMode = readerViewModeForRequest({
    requestedMode: mode,
    canUseContinuousView: canUseContinuousView(),
  });
  if (nextMode === readerViewMode) {
    return;
  }

  const previousMode = readerViewMode;
  readerViewMode = nextMode;
  await withBusy(async () => {
    try {
      await renderCurrentPage();
      setDocumentStatus("已打开");
    } catch (error) {
      readerViewMode = previousMode;
      if (previousMode === "single") {
        clearContinuousPages();
      }
      updateMetadata();
      showError(error);
    }
  });
}

function resetReaderViewModeForDocument() {
  readerViewMode = readerViewModeAfterDocumentOpen({
    currentMode: readerViewMode,
    canUseContinuousView: canUseContinuousView(),
  });
}

function snapshotReaderOpenState(): ReaderOpenSnapshot {
  return readerOpenSnapshot({
    session,
    currentPage,
    scale,
    pdfViewRotation,
    currentDocumentName,
    currentDocumentStatus,
    currentActivityFeedback,
    activePdfDocument,
    currentOfficePreview,
    currentImageDocumentView,
    documentOutlineItems,
    readerViewMode,
  });
}

function restoreReaderOpenSnapshot(snapshot: ReaderOpenSnapshot) {
  cancelAutoChapterNavigation();
  session = snapshot.session;
  currentPage = snapshot.currentPage;
  scale = snapshot.scale;
  pdfViewRotation = snapshot.pdfViewRotation;
  currentDocumentName = snapshot.currentDocumentName;
  currentDocumentStatus = snapshot.currentDocumentStatus;
  currentActivityFeedback = snapshot.currentActivityFeedback;
  activePdfDocument = snapshot.activePdfDocument;
  currentOfficePreview = snapshot.currentOfficePreview;
  currentImageDocumentView = snapshot.currentImageDocumentView;
  documentOutlineItems = snapshot.documentOutlineItems;
  readerViewMode = snapshot.readerViewMode;
  resumeContinuousRenderingAfterOpenCancel();
}

function isContinuousViewActive() {
  return readerViewMode === "continuous" && canUseContinuousView();
}

function continuousRenderKey() {
  if (!session) {
    return "";
  }
  return [
    session.id,
    session.page_count,
    scale.toFixed(2),
    pdfViewRotation,
  ].join(":");
}

function isContinuousRenderKeyForCurrentSession(renderKey: string) {
  return !!session && renderKey.startsWith(`${session.id}:`);
}

function continuousFallbackRenderKey(containerRenderKey: string | undefined) {
  if (containerRenderKey && isContinuousRenderKeyForCurrentSession(containerRenderKey)) {
    return containerRenderKey;
  }
  if (lastSuccessfulContinuousRenderKey && isContinuousRenderKeyForCurrentSession(lastSuccessfulContinuousRenderKey)) {
    return lastSuccessfulContinuousRenderKey;
  }
  return "";
}

function hasContinuousPagesForCurrentView() {
  return (
    !!session
    && !!continuousPagesContainer
    && continuousPagesContainer.dataset.renderKey === continuousRenderKey()
  );
}

function hasContinuousPdfWindowForPage(pageIndex: number) {
  if (!session || session.file_type !== "pdf" || !continuousPagesContainer) {
    return true;
  }
  const startPage = Number.parseInt(continuousPagesContainer.dataset.windowStartPage ?? "", 10);
  const endPage = Number.parseInt(continuousPagesContainer.dataset.windowEndPage ?? "", 10);
  return !Number.isNaN(startPage)
    && !Number.isNaN(endPage)
    && pageIndex >= startPage
    && pageIndex <= endPage;
}

function isContinuousPdfWindowNearEdge(pageIndex: number, edgeThreshold = 3) {
  if (!session || session.file_type !== "pdf" || !continuousPagesContainer) {
    return false;
  }
  const startPage = Number.parseInt(continuousPagesContainer.dataset.windowStartPage ?? "", 10);
  const endPage = Number.parseInt(continuousPagesContainer.dataset.windowEndPage ?? "", 10);
  if (Number.isNaN(startPage) || Number.isNaN(endPage)) {
    return false;
  }
  const threshold = Math.max(0, edgeThreshold);
  return (startPage > 0 && pageIndex - startPage <= threshold)
    || (endPage < session.page_count - 1 && endPage - pageIndex <= threshold);
}

function isContinuousRenderRequestCurrent(
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  return (
    renderRequestId === continuousRenderRequestId
    && session?.id === renderSessionId
    && continuousRenderKey() === renderKey
  );
}

function scrollContinuousPageIntoView(pageIndex: number) {
  const slot = continuousPagesContainer?.querySelector<HTMLElement>(`.continuous-page-slot[data-page-index="${pageIndex}"]`);
  if (slot) {
    slot.scrollIntoView({ block: "center", inline: "nearest" });
  }
}

async function renderContinuousOfdPageWindow(
  centerPageIndex: number,
  renderKey: string,
) {
  if (!session || session.file_type !== "ofd" || !continuousPagesContainer || continuousRenderKey() !== renderKey) {
    return;
  }

  for (const slotPlan of ofdContinuousRenderPlan({
    pageCount: session.page_count,
    currentPageIndex: centerPageIndex,
    scale,
    pageSizes: session.page_sizes,
  })) {
    if (!slotPlan.shouldRenderNow) {
      continue;
    }
    if (continuousRenderKey() !== renderKey) {
      return;
    }
    const slot = continuousPagesContainer.querySelector<HTMLElement>(
      `.continuous-page-slot[data-page-index="${slotPlan.pageIndex}"]`,
    );
    if (!slot) {
      continue;
    }
    sizeContinuousPageSlot(slot, slotPlan.width, slotPlan.height);
    await renderContinuousOfdPageSlot(slotPlan.pageIndex, slot, renderKey);
    if (continuousRenderKey() !== renderKey) {
      return;
    }
  }
}

async function navigateToPage(pageIndex: number) {
  if (!session) {
    return;
  }
  const targetPageIndex = Math.min(Math.max(pageIndex, 0), session.page_count - 1);
  if (isContinuousViewActive()) {
    currentPage = targetPageIndex;
    const targetRenderKey = continuousRenderKey();
    if (!hasContinuousPagesForCurrentView() || !hasContinuousPdfWindowForPage(targetPageIndex)) {
      const rendered = await renderContinuousPages();
      if (!rendered) {
        return;
      }
    }
    if (session.file_type === "pdf") {
      await renderContinuousPdfPageWindow(targetPageIndex, targetRenderKey);
    }
    await renderContinuousOfdPageWindow(targetPageIndex, targetRenderKey);
    if (continuousRenderKey() !== targetRenderKey) {
      return;
    }
    recycleFarContinuousPdfPages(targetPageIndex);
    scrollContinuousPageIntoView(targetPageIndex);
    setDocumentStatus("已打开");
    updateMetadata();
    return;
  }

  currentPage = targetPageIndex;
  await renderCurrentPage();
}

function hasTextPreviewContent() {
  return isTextSession() && !!textPreviewSurface && currentTextDocumentText.length > 0;
}

function canSelectCurrentPageText() {
  return canSelectCurrentPageTextState({
    isBusy,
    hasSession: !!session,
    fileType: session?.file_type ?? null,
    isTextSession: isTextSession(),
    hasTextPreviewContent: hasTextPreviewContent(),
    hasActivePdfDocument: !!activePdfDocument,
    isCurrentPageTextCopyUnavailable: isCurrentPageTextCopyUnavailable(),
  });
}

function canCopyCurrentPageText() {
  return canCopyCurrentPageTextState({
    isBusy,
    hasSession: !!session,
    fileType: session?.file_type ?? null,
    hasActivePdfDocument: !!activePdfDocument,
    isCurrentPageTextCopyUnavailable: isCurrentPageTextCopyUnavailable(),
    hasTextPreviewContent: hasTextPreviewContent(),
  });
}

function canUseDocumentFind() {
  return canUseDocumentFindState({
    isBusy,
    isFindingDocument,
    hasSession: !!session,
    fileType: session?.file_type ?? null,
    hasActivePdfDocument: !!activePdfDocument,
  });
}

function canRotatePdfView() {
  return canRotateViewState({
    isBusy,
    hasSession: !!session,
    fileType: session?.file_type ?? null,
    hasActivePdfDocument: !!activePdfDocument,
    isImageSession: isImageSession(),
    hasImageDocumentView: !!currentImageDocumentView,
  });
}

function canScaleCurrentDocument() {
  return canScaleCurrentDocumentState({
    hasSession: !!session,
    isTextSession: isTextSession(),
  });
}

function rotationActivityFeedback(rotation: ViewRotation) {
  return rotation === 0 ? "已回到原始方向" : `视图已旋转 ${rotation}°`;
}

function continuousPageIndexes(pageCount: number) {
  const indexes: number[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    indexes.push(pageIndex);
  }
  return indexes;
}

function ensureContinuousPagesContainer() {
  if (!pageStage) {
    return null;
  }
  if (!continuousPagesContainer) {
    continuousPagesContainer = document.createElement("div");
    continuousPagesContainer.className = "continuous-pages";
  }
  if (!continuousPagesContainer.isConnected) {
    pageStage.replaceChildren(continuousPagesContainer);
  }
  pageStage.setAttribute("data-view-mode", "continuous");
  return continuousPagesContainer;
}

function clearContinuousPages() {
  cancelContinuousScrollSync();
  continuousPdfSlotObserver?.disconnect();
  continuousPdfSlotObserver = null;
  continuousPdfRenderQueueBatchId += 1;
  continuousPdfRenderQueue = [];
  continuousPdfRenderQueueRunning = false;
  continuousPdfRenderedPageIndexes.clear();
  continuousPdfLoadingPageIndexes.clear();
  continuousPdfPageSlots.clear();
  continuousOfdSlotObserver?.disconnect();
  continuousOfdSlotObserver = null;
  continuousPagesContainer?.remove();
  continuousPagesContainer = null;
  pageStage?.removeAttribute("data-view-mode");
  if (pageStage && pageSurface && !pageSurface.isConnected) {
    pageStage.replaceChildren(pageSurface);
  }
}

function cancelContinuousScrollSync() {
  pageStage?.removeEventListener("scroll", syncCurrentPageFromContinuousScroll);
  if (continuousScrollSyncFrame !== null) {
    cancelAnimationFrame(continuousScrollSyncFrame);
    continuousScrollSyncFrame = null;
  }
}

function prepareDocumentOpenTransition() {
  continuousRenderRequestId += 1;
  cancelAutoChapterNavigation();
  cancelContinuousScrollSync();
  continuousPdfSlotObserver?.disconnect();
  continuousPdfSlotObserver = null;
  continuousPdfRenderQueueBatchId += 1;
  continuousPdfRenderQueue = [];
  continuousPdfRenderQueueRunning = false;
  continuousPdfRenderedPageIndexes.clear();
  continuousPdfLoadingPageIndexes.clear();
  continuousPdfPageSlots.clear();
  continuousOfdSlotObserver?.disconnect();
  continuousOfdSlotObserver = null;
  lastSuccessfulContinuousRenderKey = "";
}

function rebuildContinuousPdfSlotStateFromDom() {
  if (!continuousPagesContainer) {
    return;
  }

  continuousPdfPageSlots.clear();
  continuousPdfRenderedPageIndexes.clear();
  continuousPdfLoadingPageIndexes.clear();
  for (const slot of continuousPagesContainer.querySelectorAll<HTMLElement>(".continuous-page-slot[data-page-index]")) {
    const pageIndex = Number.parseInt(slot.dataset.pageIndex ?? "", 10);
    if (Number.isNaN(pageIndex)) {
      continue;
    }
    continuousPdfPageSlots.set(pageIndex, slot);
    if (slot.dataset.renderState === "rendered") {
      continuousPdfRenderedPageIndexes.add(pageIndex);
    } else if (slot.dataset.renderState === "loading" || slot.dataset.renderState === "stale") {
      resetContinuousPdfPageSlot(slot, pageIndex);
    }
  }
}

function resumeContinuousRenderingAfterOpenCancel() {
  if (!session || !isContinuousViewActive() || !continuousPagesContainer) {
    return;
  }
  continuousRenderRequestId += 1;
  const renderRequestId = continuousRenderRequestId;
  const renderKey = continuousRenderKey();
  if (pageStage) {
    pageStage.addEventListener("scroll", syncCurrentPageFromContinuousScroll);
  }
  if (session.file_type === "pdf") {
    rebuildContinuousPdfSlotStateFromDom();
    observeLazyContinuousPdfSlots(renderRequestId, session.id, renderKey);
    ensureContinuousPdfPageWindow(currentPage);
    return;
  }
  if (session.file_type === "ofd") {
    observeLazyContinuousOfdSlots(renderRequestId, session.id, renderKey);
  }
}

function createContinuousPageSlot(pageIndex: number) {
  const slot = document.createElement("section");
  slot.className = "continuous-page-slot";
  slot.dataset.pageIndex = String(pageIndex);
  slot.dataset.page = String(pageIndex + 1);
  slot.textContent = `正在加载第 ${pageIndex + 1} 页`;
  return slot;
}

function sizeContinuousPageSlot(slot: HTMLElement, width: number, height: number) {
  slot.style.width = `${width}px`;
  slot.style.height = `${height}px`;
}

function createContinuousPageSpacer(position: "before" | "after", height: number) {
  const spacer = document.createElement("div");
  spacer.className = "continuous-page-spacer";
  spacer.dataset.spacer = position;
  spacer.style.height = `${height}px`;
  return spacer;
}

function appendContinuousPageSpacer(fragment: DocumentFragment, position: "before" | "after", height: number) {
  if (height > 0) {
    fragment.append(createContinuousPageSpacer(position, height));
  }
}

async function renderContinuousPageSlot(pageIndex: number, slot: HTMLElement, renderKey: string) {
  if (!session) {
    return;
  }
  if (session.file_type === "pdf") {
    await renderContinuousPdfPageSlot(pageIndex, slot, continuousRenderRequestId, session.id, renderKey);
    return;
  }
  if (session.file_type === "ofd") {
    await renderContinuousOfdPageSlot(pageIndex, slot, renderKey);
  }
}

async function renderContinuousPdfPageSlot(
  pageIndex: number,
  slot: HTMLElement,
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
  renderedPageIndexes = continuousPdfRenderedPageIndexes,
) {
  if (!session || !activePdfDocument) {
    return;
  }
  if (slot.dataset.renderState === "rendered" || slot.dataset.renderState === "loading") {
    return;
  }
  slot.dataset.renderState = "loading";
  continuousPdfLoadingPageIndexes.add(pageIndex);
  const pageInfo = currentPdfContinuousPageSizeIndex()?.get(pageIndex);
  const displaySize = pageInfo
    ? {
        width: pageInfo.width_pt * scale,
        height: pageInfo.height_pt * scale,
      }
    : rotatedViewSize(
        {
          width: 612 * scale,
          height: 792 * scale,
        },
        pdfViewRotation,
      );
  slot.style.width = `${Math.round(displaySize.width)}px`;
  slot.style.height = `${Math.round(displaySize.height)}px`;
  if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
    continuousPdfLoadingPageIndexes.delete(pageIndex);
    slot.dataset.renderState = "stale";
    return;
  }
  slot.replaceChildren();

  const canvas = document.createElement("canvas");
  canvas.className = "page-canvas continuous-page-canvas";
  const textLayer = document.createElement("div");
  textLayer.className = "textLayer page-text-layer continuous-page-text-layer";
  slot.append(canvas, textLayer);

  try {
    await activePdfDocument.renderPageToCanvas(pageIndex, canvas, scale, pdfViewRotation);
  } catch (error) {
    continuousPdfLoadingPageIndexes.delete(pageIndex);
    throw error;
  }
  if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
    continuousPdfLoadingPageIndexes.delete(pageIndex);
    slot.dataset.renderState = "stale";
    return;
  }
  textLayer.removeAttribute("data-text-layer-unavailable");
  textLayer.removeAttribute("data-text-layer-empty");
  try {
    await activePdfDocument.renderPageTextLayer(pageIndex, textLayer, scale, pdfViewRotation);
  } catch {
    textLayer.replaceChildren();
    textLayer.dataset.textLayerUnavailable = "true";
  }
  if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
    continuousPdfLoadingPageIndexes.delete(pageIndex);
    slot.dataset.renderState = "stale";
    return;
  }
  slot.dataset.renderState = "rendered";
  continuousPdfLoadingPageIndexes.delete(pageIndex);
  renderedPageIndexes.add(pageIndex);
}

function resetContinuousPdfPageSlot(slot: HTMLElement, pageIndex: number) {
  slot.replaceChildren();
  slot.textContent = `正在加载第 ${pageIndex + 1} 页`;
  delete slot.dataset.renderState;
  continuousPdfRenderedPageIndexes.delete(pageIndex);
  continuousPdfLoadingPageIndexes.delete(pageIndex);
  continuousPdfSlotObserver?.observe(slot);
}

function continuousPageSlotForIndex(pageIndex: number) {
  return continuousPdfPageSlots.get(pageIndex)
    ?? continuousPagesContainer?.querySelector<HTMLElement>(`.continuous-page-slot[data-page-index="${pageIndex}"]`)
    ?? null;
}

function recycleFarContinuousPdfPages(centerPageIndex: number) {
  if (!session || session.file_type !== "pdf" || !continuousPagesContainer) {
    return;
  }
  for (const pageIndex of pdfContinuousPagesToRecycle({
    renderedPageIndexes: [...continuousPdfRenderedPageIndexes],
    currentPageIndex: centerPageIndex,
  })) {
    const slot = continuousPageSlotForIndex(pageIndex);
    if (slot?.dataset.renderState === "rendered") {
      resetContinuousPdfPageSlot(slot, pageIndex);
    }
  }
}

async function renderContinuousPdfPageWindow(
  centerPageIndex: number,
  renderKey: string,
  renderRequestId = continuousRenderRequestId,
  renderSessionId = session?.id ?? "",
) {
  if (
    !session
    || session.file_type !== "pdf"
    || !continuousPagesContainer
    || !isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)
  ) {
    return;
  }

  const targetPageIndexes = pdfContinuousRenderQueuePlan({
    candidatePageIndexes: [...continuousPdfPageSlots.keys()],
    currentPageIndex: centerPageIndex,
    blockedPageIndexes: blockedLazyContinuousPdfPageIndexes(),
    maxQueuedPages: 5,
  });
  for (const pageIndex of targetPageIndexes) {
    if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
      return;
    }
    const slot = continuousPageSlotForIndex(pageIndex);
    if (!slot || slot.dataset.renderState) {
      continue;
    }
    continuousPdfSlotObserver?.unobserve(slot);
    await renderContinuousPdfPageSlot(pageIndex, slot, renderRequestId, renderSessionId, renderKey);
  }
}

function ensureContinuousPdfPageWindow(centerPageIndex: number) {
  if (!session || session.file_type !== "pdf" || !isContinuousViewActive()) {
    return;
  }
  const renderKey = continuousRenderKey();
  void renderContinuousPdfPageWindow(centerPageIndex, renderKey).catch(() => undefined);
}

function blockedLazyContinuousPdfPageIndexes() {
  return pdfContinuousRenderBlockedPageIndexes({
    renderedPageIndexes: [...continuousPdfRenderedPageIndexes],
    loadingPageIndexes: [...continuousPdfLoadingPageIndexes],
  });
}

function queueLazyContinuousPdfPages(
  candidatePageIndexes: number[],
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  continuousPdfRenderQueue = pdfContinuousRenderQueuePlan({
    candidatePageIndexes,
    currentPageIndex: currentPage,
    blockedPageIndexes: blockedLazyContinuousPdfPageIndexes(),
  });
  continuousPdfRenderQueueBatchId += 1;
  void drainLazyContinuousPdfQueue(
    continuousPdfRenderQueueBatchId,
    renderRequestId,
    renderSessionId,
    renderKey,
  );
}

async function drainLazyContinuousPdfQueue(
  queueBatchId: number,
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  if (continuousPdfRenderQueueRunning) {
    return;
  }
  continuousPdfRenderQueueRunning = true;
  try {
    while (
      queueBatchId === continuousPdfRenderQueueBatchId &&
      continuousPdfRenderQueue.length > 0 &&
      isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)
    ) {
      const pageIndex = continuousPdfRenderQueue.shift();
      if (pageIndex === undefined) {
        break;
      }
      const slot = continuousPageSlotForIndex(pageIndex);
      if (!slot || slot.dataset.renderState) {
        continue;
      }
      continuousPdfSlotObserver?.unobserve(slot);
      try {
        await renderContinuousPdfPageSlot(pageIndex, slot, renderRequestId, renderSessionId, renderKey);
      } catch {
        if (isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
          slot.dataset.renderState = "error";
          slot.textContent = "PDF 页面加载失败。";
        }
      }
    }
  } finally {
    continuousPdfRenderQueueRunning = false;
    if (
      queueBatchId !== continuousPdfRenderQueueBatchId &&
      continuousPdfRenderQueue.length > 0 &&
      isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)
    ) {
      void drainLazyContinuousPdfQueue(
        continuousPdfRenderQueueBatchId,
        renderRequestId,
        renderSessionId,
        renderKey,
      );
    }
  }
}

function observeLazyContinuousPdfSlots(
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  continuousPdfSlotObserver?.disconnect();
  continuousPdfSlotObserver = null;
  if (!continuousPagesContainer || !pageStage) {
    return;
  }

  continuousPdfSlotObserver = new IntersectionObserver((entries) => {
    const candidatePageIndexes: number[] = [];
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }
      const slot = entry.target as HTMLElement;
      const pageIndex = Number.parseInt(slot.dataset.pageIndex ?? "", 10);
      if (Number.isNaN(pageIndex) || slot.dataset.renderState) {
        continuousPdfSlotObserver?.unobserve(slot);
        continue;
      }
      if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
        continuousPdfSlotObserver?.unobserve(slot);
        continue;
      }
      candidatePageIndexes.push(pageIndex);
    }
    if (candidatePageIndexes.length > 0) {
      queueLazyContinuousPdfPages(candidatePageIndexes, renderRequestId, renderSessionId, renderKey);
    }
  }, {
    root: pageStage,
    rootMargin: "900px 0px",
  });

  const observablePageIndexes = pdfContinuousRenderablePageIndexes({
    slotPageIndexes: [...continuousPdfPageSlots.keys()],
    blockedPageIndexes: blockedLazyContinuousPdfPageIndexes(),
  });
  for (const pageIndex of observablePageIndexes) {
    const slot = continuousPdfPageSlots.get(pageIndex);
    if (slot) {
      continuousPdfSlotObserver.observe(slot);
    }
  }
}

async function renderContinuousPdfPages(
  container: HTMLElement,
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  if (!session) {
    return false;
  }

  const nextRenderedPageIndexes = new Set<number>();
  const nextPageSlots = new Map<number, HTMLElement>();
  const eagerPageIndexes: number[] = [];
  const windowPlan = pdfContinuousRenderWindowPlan({
    pageCount: session.page_count,
    currentPageIndex: currentPage,
    scale,
    pageSizes: currentPdfContinuousPageSizes(),
    pageSizeIndex: currentPdfContinuousPageSizeIndex(),
    layout: currentPdfContinuousPageLayout() ?? undefined,
  });
  const fragment = document.createDocumentFragment();
  appendContinuousPageSpacer(fragment, "before", windowPlan.beforeHeight);
  for (const slotPlan of windowPlan.slots) {
    if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
      return false;
    }
    const slot = createContinuousPageSlot(slotPlan.pageIndex);
    sizeContinuousPageSlot(slot, slotPlan.width, slotPlan.height);
    nextPageSlots.set(slotPlan.pageIndex, slot);
    fragment.append(slot);
    if (slotPlan.shouldRenderNow) {
      eagerPageIndexes.push(slotPlan.pageIndex);
    }
  }
  appendContinuousPageSpacer(fragment, "after", windowPlan.afterHeight);

  if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
    return false;
  }
  container.dataset.windowStartPage = String(windowPlan.startPageIndex);
  container.dataset.windowEndPage = String(windowPlan.endPageIndex);
  continuousPdfRenderedPageIndexes = nextRenderedPageIndexes;
  continuousPdfLoadingPageIndexes.clear();
  continuousPdfPageSlots = nextPageSlots;
  container.replaceChildren(fragment);
  observeLazyContinuousPdfSlots(renderRequestId, renderSessionId, renderKey);
  if (eagerPageIndexes.length > 0) {
    void renderContinuousPdfPageWindow(currentPage, renderKey, renderRequestId, renderSessionId).catch(() => undefined);
  }
  return true;
}

async function renderContinuousOfdPageSlot(
  pageIndex: number,
  slot: HTMLElement,
  renderKey: string,
) {
  if (!session) {
    return;
  }
  if (slot.dataset.renderState === "rendered" || slot.dataset.renderState === "loading") {
    return;
  }
  slot.dataset.renderState = "loading";
  const renderStartedAt = performance.now();
  const bitmap = await renderLocalOfdPage(session.id, pageIndex, scale, {
    updateVisibleStatus: false,
    onRendered: (renderedBitmap) => {
      if (continuousRenderKey() === renderKey) {
        recordOfdRenderPerformance(renderStartedAt, renderedBitmap.duration_ms);
      }
    },
  });
  if (continuousRenderKey() !== renderKey) {
    slot.dataset.renderState = "stale";
    return;
  }
  const displaySize = pageDisplaySize(bitmap);
  sizeContinuousPageSlot(slot, displaySize.width, displaySize.height);
  if (continuousRenderKey() !== renderKey) {
    return;
  }
  slot.replaceChildren();

  if (bitmap.image_ref.startsWith("fake://")) {
    slot.textContent = `Fake page ${bitmap.page_index + 1}`;
    slot.dataset.renderState = "rendered";
    return;
  }

  const image = document.createElement("img");
  image.className = "page-image continuous-page-image";
  image.src = convertFileSrc(bitmap.image_ref);
  image.alt = `Page ${bitmap.page_index + 1}`;
  image.addEventListener("error", () => {
    deleteOfdPageCacheFromDataset(localOfdPageCache, image.dataset);
    slot.textContent = "页面图片加载失败。";
  });
  Object.assign(image.dataset, ofdPageImageDataset({
    sessionId: bitmap.session_id,
    pageIndex: bitmap.page_index,
    scale: bitmap.scale,
  }));
  slot.append(image);
  slot.dataset.renderState = "rendered";
}

function observeLazyContinuousOfdSlots(
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  continuousOfdSlotObserver?.disconnect();
  continuousOfdSlotObserver = null;
  if (!continuousPagesContainer || !pageStage) {
    return;
  }

  continuousOfdSlotObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }
      const slot = entry.target as HTMLElement;
      const pageIndex = Number.parseInt(slot.dataset.pageIndex ?? "", 10);
      if (Number.isNaN(pageIndex) || slot.dataset.renderState) {
        continuousOfdSlotObserver?.unobserve(slot);
        continue;
      }
      if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
        continuousOfdSlotObserver?.unobserve(slot);
        continue;
      }
      continuousOfdSlotObserver?.unobserve(slot);
      void renderContinuousOfdPageSlot(pageIndex, slot, renderKey).catch(() => {
        if (isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
          slot.dataset.renderState = "error";
          slot.textContent = "页面图片加载失败。";
        }
      });
    }
  }, {
    root: pageStage,
    rootMargin: "900px 0px",
  });

  for (const slot of continuousPagesContainer.querySelectorAll<HTMLElement>(".continuous-page-slot")) {
    if (!slot.dataset.renderState) {
      continuousOfdSlotObserver.observe(slot);
    }
  }
}

async function renderContinuousOfdPages(
  container: HTMLElement,
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  if (!session) {
    return false;
  }

  const fragment = document.createDocumentFragment();
  for (const slotPlan of ofdContinuousRenderPlan({
    pageCount: session.page_count,
    currentPageIndex: currentPage,
    scale,
    pageSizes: session.page_sizes,
  })) {
    if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
      return false;
    }
    const slot = createContinuousPageSlot(slotPlan.pageIndex);
    sizeContinuousPageSlot(slot, slotPlan.width, slotPlan.height);
    fragment.append(slot);
    if (slotPlan.shouldRenderNow) {
      await renderContinuousOfdPageSlot(slotPlan.pageIndex, slot, renderKey);
      if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
        return false;
      }
    }
  }

  if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
    return false;
  }
  container.replaceChildren(fragment);
  observeLazyContinuousOfdSlots(renderRequestId, renderSessionId, renderKey);
  return true;
}

async function renderContinuousPagedDocument(
  container: HTMLElement,
  renderRequestId: number,
  renderSessionId: string,
  renderKey: string,
) {
  if (!session) {
    return false;
  }
  if (session.file_type === "ofd") {
    return renderContinuousOfdPages(container, renderRequestId, renderSessionId, renderKey);
  }
  if (session.file_type === "pdf") {
    return renderContinuousPdfPages(container, renderRequestId, renderSessionId, renderKey);
  }

  const fragment = document.createDocumentFragment();
  for (const pageIndex of continuousPageIndexes(session.page_count)) {
    if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
      return false;
    }
    const slot = createContinuousPageSlot(pageIndex);
    fragment.append(slot);
    await renderContinuousPageSlot(pageIndex, slot, renderKey);
    if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
      return false;
    }
  }
  if (!isContinuousRenderRequestCurrent(renderRequestId, renderSessionId, renderKey)) {
    return false;
  }
  container.replaceChildren(fragment);
  return true;
}

async function renderContinuousPages() {
  if (!session) {
    return false;
  }
  const container = ensureContinuousPagesContainer();
  if (!container) {
    return false;
  }

  continuousRenderRequestId += 1;
  const renderRequestId = continuousRenderRequestId;
  const renderSessionId = session.id;
  const renderKey = continuousRenderKey();
  const previousRenderKey = continuousFallbackRenderKey(container.dataset.renderKey);
  pageStage?.removeEventListener("scroll", syncCurrentPageFromContinuousScroll);
  delete container.dataset.renderKey;
  try {
    if (!await renderContinuousPagedDocument(container, renderRequestId, renderSessionId, renderKey)) {
      return false;
    }
    container.dataset.renderKey = renderKey;
    lastSuccessfulContinuousRenderKey = renderKey;
    if (pageStage) {
      pageStage.addEventListener("scroll", syncCurrentPageFromContinuousScroll);
    }
    return true;
  } catch (error) {
    if (previousRenderKey && container.isConnected) {
      container.dataset.renderKey = previousRenderKey;
      pageStage?.addEventListener("scroll", syncCurrentPageFromContinuousScroll);
    }
    throw error;
  }
}

function syncCurrentPageFromContinuousScroll() {
  if (continuousScrollSyncFrame !== null) {
    return;
  }
  continuousScrollSyncFrame = requestAnimationFrame(() => {
    continuousScrollSyncFrame = null;
    runContinuousScrollSync();
  });
}

function visibleContinuousPageIndexFromPoint(stageRect: DOMRect) {
  const x = stageRect.left + stageRect.width / 2;
  const sampleYs = [
    stageRect.top + Math.min(96, stageRect.height / 3),
    stageRect.top + stageRect.height / 2,
    stageRect.top + Math.max(0, stageRect.height - 96),
  ];

  for (const y of sampleYs) {
    const element = document.elementFromPoint(x, y);
    const slot = element?.closest<HTMLElement>(".continuous-page-slot");
    const pageIndex = Number.parseInt(slot?.dataset.pageIndex ?? "", 10);
    if (!Number.isNaN(pageIndex)) {
      return pageIndex;
    }
  }
  return null;
}

function estimatedContinuousPageIndexFromScroll() {
  if (!session || session.file_type !== "pdf" || !pageStage) {
    return null;
  }
  return estimatedPdfContinuousPageIndex({
    scrollTop: pageStage.scrollTop,
    pageCount: session.page_count,
    scale,
    pageSizes: currentPdfContinuousPageSizes(),
    pageSizeIndex: currentPdfContinuousPageSizeIndex(),
    layout: currentPdfContinuousPageLayout() ?? undefined,
  });
}

function runContinuousScrollSync() {
  if (!pageStage || !continuousPagesContainer || !session || !isContinuousViewActive()) {
    return;
  }
  const stageRect = pageStage.getBoundingClientRect();
  const nextPage = visibleContinuousPageIndexFromPoint(stageRect) ?? estimatedContinuousPageIndexFromScroll();
  if (nextPage === null) {
    return;
  }
  const pdfWindowMissing = session.file_type === "pdf" && !hasContinuousPdfWindowForPage(nextPage);
  const pdfWindowNearEdge = session.file_type === "pdf" && isContinuousPdfWindowNearEdge(nextPage);
  if (nextPage !== currentPage || pdfWindowMissing || pdfWindowNearEdge) {
    currentPage = nextPage;
    if (pdfWindowMissing || pdfWindowNearEdge) {
      void renderContinuousPages().catch(() => undefined);
      updateMetadata();
      return;
    }
    ensureContinuousPdfPageWindow(nextPage);
    recycleFarContinuousPdfPages(nextPage);
    updateMetadata();
  }
}

function scrollTextMatchIntoView(match: DocumentFindMatch) {
  if (!textPreviewSurface || !textPreviewShell) {
    return;
  }

  const lineIndex = lineIndexFromTextOffset(currentTextDocumentText, match.startIndex);
  const style = window.getComputedStyle(textPreviewSurface);
  const lineHeight = Number.parseFloat(style.lineHeight);
  const fallbackLineHeight = Number.parseFloat(style.fontSize) * 1.65;
  textPreviewShell.scrollTop = Math.max(0, lineIndex * (Number.isFinite(lineHeight) ? lineHeight : fallbackLineHeight));
}

function clearTextPreview() {
  textPreviewShell?.remove();
  textPreviewShell = null;
  textLineNumbers = null;
  textPreviewSurface = null;
  currentTextDocumentText = "";
  if (pageSurface) {
    delete pageSurface.dataset.documentMode;
    delete pageSurface.dataset.printDocumentMode;
  }
}

function currentSelectionBelongsToPageTextLayer(selection: Selection) {
  return (
    !!pageTextLayer
    && selection.rangeCount > 0
    && !!selection.anchorNode
    && !!selection.focusNode
    && pageTextLayer.contains(selection.anchorNode)
    && pageTextLayer.contains(selection.focusNode)
  );
}

function clearCurrentPageTextSelection() {
  const selection = window.getSelection();
  if (
    selection
    && (
      currentSelectionBelongsToPageTextLayer(selection)
      || currentSelectionBelongsToTextPreview(selection)
    )
  ) {
    selection.removeAllRanges();
  }
}

function currentSelectionBelongsToTextPreview(selection: Selection) {
  return (
    !!textPreviewSurface
    && selection.rangeCount > 0
    && !!selection.anchorNode
    && !!selection.focusNode
    && textPreviewSurface.contains(selection.anchorNode)
    && textPreviewSurface.contains(selection.focusNode)
  );
}

function selectedPdfText() {
  const selection = window.getSelection();
  if (
    !selection
    || selection.rangeCount === 0
    || !pageTextLayer
    || !selection.anchorNode
    || !selection.focusNode
    || !pageTextLayer.contains(selection.anchorNode)
    || !pageTextLayer.contains(selection.focusNode)
  ) {
    return null;
  }

  return selection.toString().trim() || null;
}

function selectedTextPreviewText() {
  const selection = window.getSelection();
  if (!selection || !currentSelectionBelongsToTextPreview(selection)) {
    return null;
  }

  return selection.toString().trim() || null;
}

function selectCurrentPageText() {
  if (!canSelectCurrentPageText()) {
    return;
  }

  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  if (isTextSession() && textPreviewSurface) {
    range.selectNodeContents(textPreviewSurface);
  } else if (pageTextLayer) {
    range.selectNodeContents(pageTextLayer);
  } else {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
  setActivityFeedback("已全选当前页文字");
  updateMetadata();
}

function canToggleOfficePreviewLayout() {
  return !isBusy && canShowOfficePreviewLayout() && !!activePdfDocument;
}

function canShowOfficePreviewLayout() {
  return currentOfficePreview?.fileType.toLowerCase() === "xlsx";
}

function nextOfficePreviewLayout(layout: OfficePreviewLayout): OfficePreviewLayout {
  return layout === "preserve" ? "fit_width_preview" : "preserve";
}

function officePreviewLayoutLabel(layout: OfficePreviewLayout) {
  return layout === "preserve" ? "适宽预览" : "原版预览";
}

function updateDocumentFindStatus() {
  if (!findStatus) {
    return;
  }
  if (isFindingDocument) {
    findStatus.textContent = "...";
    return;
  }
  if (!documentFindQuery) {
    findStatus.textContent = "";
    return;
  }
  if (documentFindMatches.length === 0) {
    findStatus.textContent = "";
    return;
  }
  findStatus.textContent = `命中 ${documentFindActiveIndex + 1} / ${documentFindMatches.length}`;
}

function setReaderToolsMenuOpen(open: boolean) {
  isReaderToolsMenuOpen = open;
  if (readerToolsMenu) {
    if (isReaderToolsMenuOpen) {
      positionReaderToolsMenu();
    }
    readerToolsMenu.hidden = !isReaderToolsMenuOpen;
    readerToolsMenu.classList.toggle("is-open", isReaderToolsMenuOpen);
  }
  if (moreReaderToolsButton) {
    moreReaderToolsButton.setAttribute("aria-expanded", String(isReaderToolsMenuOpen));
  }
}

function positionReaderToolsMenu() {
  if (!readerToolsMenu || !moreReaderToolsButton) {
    return;
  }
  const buttonRect = moreReaderToolsButton.getBoundingClientRect();
  const top = Math.max(8, Math.round(buttonRect.bottom + 8));
  readerToolsMenu.style.setProperty("--reader-tools-menu-top", `${top}px`);
}

function toggleReaderToolsMenu() {
  setReaderToolsMenuOpen(!isReaderToolsMenuOpen);
  updateMetadata();
}

function closeReaderToolsMenu() {
  setReaderToolsMenuOpen(false);
  updateMetadata();
}

function openSettingsPanel() {
  closeReaderToolsMenu();
  if (helpPanel) {
    helpPanel.hidden = true;
  }
  if (settingsPanel) {
    settingsPanel.hidden = false;
  }
  setActivityFeedback("已打开设置");
  updateMetadata();
}

function toggleSettingsPanel() {
  if (settingsPanel && !settingsPanel.hidden) {
    closeSettingsPanel();
    return;
  }
  openSettingsPanel();
}

function closeSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.hidden = true;
  }
  updateMetadata();
}

function openHelpPanel() {
  closeReaderToolsMenu();
  if (settingsPanel) {
    settingsPanel.hidden = true;
  }
  if (helpPanel) {
    helpPanel.hidden = false;
  }
  setActivityFeedback("已打开帮助");
  updateMetadata();
}

function toggleHelpPanel() {
  if (helpPanel && !helpPanel.hidden) {
    closeHelpPanel();
    return;
  }
  openHelpPanel();
}

function closeHelpPanel() {
  if (helpPanel) {
    helpPanel.hidden = true;
  }
  updateMetadata();
}

function showUpdateCheckUnavailable() {
  const message = "当前版本暂未接入自动检查更新，请关注 GitHub Releases 获取更新动态。";
  if (updateCheckStatus) {
    updateCheckStatus.textContent = message;
    updateCheckStatus.classList.remove("is-ok");
    updateCheckStatus.classList.remove("is-error");
  }
  setActivityFeedback(message);
  updateMetadata();
}

async function openFeedbackIssues() {
  if (feedbackIssuesStatus) {
    feedbackIssuesStatus.textContent = "正在打开 GitHub Issues";
    feedbackIssuesStatus.classList.remove("is-error");
    feedbackIssuesStatus.classList.add("is-ok");
  }

  const feedbackTab = window.open(feedbackIssuesUrl, "_blank", "noopener,noreferrer");
  if (!feedbackTab && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(feedbackIssuesUrl);
    if (feedbackIssuesStatus) {
      feedbackIssuesStatus.textContent = "已复制反馈链接";
    }
    setActivityFeedback("已复制反馈链接");
    updateMetadata();
    return;
  }

  if (feedbackIssuesStatus) {
    feedbackIssuesStatus.textContent = "已打开反馈入口";
  }
  setActivityFeedback("已打开反馈入口");
  updateMetadata();
}

function setOfdPageLimitPreset(presetId: OfdPageLimitPresetId) {
  ofdPageLimitPresetId = presetId;
  if (session?.file_type === "ofd" && !canUseContinuousView() && readerViewMode === "continuous") {
    readerViewMode = "single";
    clearContinuousPages();
    void renderCurrentPage().catch(showError);
  }
  updateMetadata();
}

function syncFocusReadingModeState() {
  document.body.dataset.focusReadingMode = String(isFocusReadingMode);
}

function syncFocusReadingModeButtons() {
  for (const button of focusReadingModeButtons) {
    const label = isFocusReadingMode ? "退出专注" : "专注阅读";
    const title = isFocusReadingMode ? "退出专注阅读 (Ctrl+Shift+F)" : "专注阅读 (Ctrl+Shift+F)";
    button.disabled = isBusy || !session;
    button.setAttribute("aria-pressed", String(isFocusReadingMode));
    button.title = title;
    button.setAttribute("aria-label", isFocusReadingMode ? "退出专注阅读" : "专注阅读");
    button.dataset.focusReadingActive = String(isFocusReadingMode);
    const icon = button.querySelector<HTMLElement>("[data-lucide]");
    if (icon) {
      icon.dataset.lucide = "focus";
      icon.dataset.icon = "focus";
    }
    button.dataset.tooltip = label;
  }
}

function enterFocusReadingMode() {
  if (isFocusReadingMode) {
    return;
  }
  focusReadingSnapshot = {
    documentCenterCollapsed: isDocumentCenterCollapsed,
    readerNavigationOpen: isReaderNavigationOpen,
    readerNavigationUserPreference: hasReaderNavigationUserPreference,
    activityFeedback: currentActivityFeedback,
    errorDiagnosticDismissed: isErrorDiagnosticOverlayDismissed,
  };
  isFocusReadingMode = true;
  setDocumentCenterCollapsed(true);
  setReaderNavigationOpen(false);
  clearActivityFeedback();
  isErrorDiagnosticOverlayDismissed = true;
  setActivityFeedback("已进入专注阅读");
  syncFocusReadingModeState();
}

function exitFocusReadingMode() {
  if (!isFocusReadingMode) {
    return;
  }
  const snapshot = focusReadingSnapshot;
  isFocusReadingMode = false;
  if (snapshot) {
    setDocumentCenterCollapsed(snapshot.documentCenterCollapsed);
    hasReaderNavigationUserPreference = snapshot.readerNavigationUserPreference;
    setReaderNavigationOpen(snapshot.readerNavigationOpen);
    currentActivityFeedback = snapshot.activityFeedback;
    isErrorDiagnosticOverlayDismissed = snapshot.errorDiagnosticDismissed;
  }
  focusReadingSnapshot = null;
  setActivityFeedback("已退出专注阅读");
  syncFocusReadingModeState();
}

function toggleFocusReadingMode() {
  if (isFocusReadingMode) {
    exitFocusReadingMode();
  } else {
    enterFocusReadingMode();
  }
  closeReaderToolsMenu();
  updateMetadata();
}

function canUseReaderNavigation() {
  return canUseReaderNavigationState(canUsePageNavigation(), documentOutlineItems.length);
}

function setDocumentCenterWidth(width: number) {
  documentCenterWidth = clampDocumentCenterWidthState(width, window.innerWidth);
  appShell?.style.setProperty("--document-center-width", `${documentCenterWidth}px`);
}

function setDocumentCenterCollapsed(collapsed: boolean) {
  isDocumentCenterCollapsed = collapsed;
  appShell?.style.setProperty("--document-center-width", `${documentCenterWidth}px`);
  appShell?.style.setProperty("--document-center-rail-width", `${collapsedDocumentCenterRailWidth}px`);
  if (appShell) {
    appShell.dataset.documentCenterCollapsed = String(isDocumentCenterCollapsed);
  }
  if (collapseDocumentCenterButton) {
    collapseDocumentCenterButton.setAttribute("aria-expanded", String(!isDocumentCenterCollapsed));
  }
  if (expandDocumentCenterButton) {
    expandDocumentCenterButton.setAttribute("aria-expanded", String(!isDocumentCenterCollapsed));
  }
  if (documentCenterResizer) {
    documentCenterResizer.setAttribute("aria-disabled", String(isDocumentCenterCollapsed));
  }
}

function resizeDocumentCenter(event: PointerEvent) {
  if (!isDocumentCenterResizing || isDocumentCenterCollapsed) {
    return;
  }
  setDocumentCenterWidth(event.clientX);
}

function stopDocumentCenterResize() {
  if (!isDocumentCenterResizing) {
    return;
  }
  isDocumentCenterResizing = false;
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
  window.removeEventListener("pointermove", resizeDocumentCenter);
  window.removeEventListener("pointerup", stopDocumentCenterResize);
  if (documentCenterResizer?.dataset.pointerId) {
    documentCenterResizer.releasePointerCapture?.(Number(documentCenterResizer.dataset.pointerId));
    delete documentCenterResizer.dataset.pointerId;
  }
}

function startDocumentCenterResize(event: PointerEvent) {
  if (isDocumentCenterCollapsed || event.button !== 0) {
    return;
  }
  event.preventDefault();
  isDocumentCenterResizing = true;
  documentCenterResizer?.setPointerCapture?.(event.pointerId);
  if (documentCenterResizer) {
    documentCenterResizer.dataset.pointerId = String(event.pointerId);
  }
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeDocumentCenter);
  window.addEventListener("pointerup", stopDocumentCenterResize, { once: true });
}

function setReaderNavigationWidth(width: number) {
  const clampedWidth = clampReaderNavigationWidthState(width, window.innerWidth);
  readerNavigationWidth = clampedWidth;
  readerWorkspace?.style.setProperty("--reader-navigation-width", `${clampedWidth}px`);
  readerNavigationPanel?.style.setProperty("--reader-navigation-width", `${clampedWidth}px`);
}

function setReaderNavigationFontSize(size: number) {
  readerNavigationFontSize = clampReaderNavigationFontSizeState(size);
  readerWorkspace?.style.setProperty("--reader-navigation-item-font-size", `${readerNavigationFontSize}px`);
  readerNavigationPanel?.style.setProperty("--reader-navigation-item-font-size", `${readerNavigationFontSize}px`);
  if (decreaseReaderNavigationFontButton) {
    decreaseReaderNavigationFontButton.disabled = isBusy || !canUseReaderNavigation() || readerNavigationFontSize <= minReaderNavigationFontSize;
  }
  if (increaseReaderNavigationFontButton) {
    increaseReaderNavigationFontButton.disabled = isBusy || !canUseReaderNavigation() || readerNavigationFontSize >= maxReaderNavigationFontSize;
  }
}

function setReaderNavigationOpen(open: boolean) {
  isReaderNavigationOpen = open && canUseReaderNavigation();
  readerWorkspace?.classList.toggle("has-navigation", isReaderNavigationOpen);
  if (readerNavigationPanel) {
    readerNavigationPanel.hidden = !isReaderNavigationOpen;
  }
  if (toggleReaderNavigationButton) {
    toggleReaderNavigationButton.setAttribute("aria-expanded", String(isReaderNavigationOpen));
    toggleReaderNavigationButton.title = isReaderNavigationOpen ? "隐藏书签" : "显示书签";
    toggleReaderNavigationButton.setAttribute("aria-label", toggleReaderNavigationButton.title);
  }
  if (closeReaderNavigationButton) {
    closeReaderNavigationButton.disabled = !isReaderNavigationOpen;
  }
  setReaderNavigationFontSize(readerNavigationFontSize);
  syncActivityFeedbackPosition();
  syncErrorDiagnosticOverlayPosition();
}

function toggleReaderNavigation() {
  hasReaderNavigationUserPreference = true;
  setReaderNavigationOpen(!isReaderNavigationOpen);
  updateMetadata();
}

function closeReaderNavigation() {
  hasReaderNavigationUserPreference = true;
  setReaderNavigationOpen(false);
  updateMetadata();
}

function decreaseReaderNavigationFont() {
  setReaderNavigationFontSize(readerNavigationFontSize - 2);
  updateMetadata();
}

function increaseReaderNavigationFont() {
  setReaderNavigationFontSize(readerNavigationFontSize + 2);
  updateMetadata();
}

function resizeReaderNavigation(event: PointerEvent) {
  if (!isReaderNavigationResizing || !readerWorkspace) {
    return;
  }
  const workspaceRect = readerWorkspace.getBoundingClientRect();
  setReaderNavigationWidth(event.clientX - workspaceRect.left);
}

function stopReaderNavigationResize() {
  if (!isReaderNavigationResizing) {
    return;
  }
  isReaderNavigationResizing = false;
  document.body.style.removeProperty("cursor");
  document.body.style.removeProperty("user-select");
  window.removeEventListener("pointermove", resizeReaderNavigation);
  window.removeEventListener("pointerup", stopReaderNavigationResize);
  if (readerNavigationResizer?.dataset.pointerId) {
    readerNavigationResizer.releasePointerCapture?.(Number(readerNavigationResizer.dataset.pointerId));
    delete readerNavigationResizer.dataset.pointerId;
  }
}

function startReaderNavigationResize(event: PointerEvent) {
  if (!isReaderNavigationOpen || event.button !== 0) {
    return;
  }
  event.preventDefault();
  isReaderNavigationResizing = true;
  readerNavigationResizer?.setPointerCapture?.(event.pointerId);
  if (readerNavigationResizer) {
    readerNavigationResizer.dataset.pointerId = String(event.pointerId);
  }
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", resizeReaderNavigation);
  window.addEventListener("pointerup", stopReaderNavigationResize, { once: true });
}

function updateReaderNavigationPanel() {
  const hasNavigation = canUseReaderNavigation();
  if (!hasNavigation) {
    hasReaderNavigationUserPreference = false;
  }
  if (isFocusReadingMode) {
    setReaderNavigationOpen(false);
    return;
  }
  if (!hasReaderNavigationUserPreference && hasNavigation) {
    isReaderNavigationOpen = true;
  }
  setReaderNavigationOpen(hasNavigation && isReaderNavigationOpen);
}

function renderPageNavigation() {
  if (!pageNavigationSection || !pageNavigationList || !pageNavigationEmpty) {
    return;
  }

  pageNavigationList.replaceChildren();
  const showPageNavigation = canUsePageNavigation();
  pageNavigationSection.hidden = !showPageNavigation;
  pageNavigationSection.dataset.available = String(showPageNavigation);
  pageNavigationEmpty.hidden = showPageNavigation;
  pageNavigationList.hidden = !showPageNavigation;
  if (!showPageNavigation || !session) {
    return;
  }

  for (let pageIndex = 0; pageIndex < session.page_count; pageIndex += 1) {
    const item = document.createElement("li");
    item.className = "page-navigation-item";

    const button = document.createElement("button");
    button.className = "page-navigation-button";
    button.type = "button";
    button.textContent = `第 ${pageIndex + 1} 页`;
    button.title = button.textContent;
    button.dataset.pageIndex = String(pageIndex);
    button.addEventListener("click", () => {
      void navigateFromPageNavigation(pageIndex);
    });

    item.append(button);
    pageNavigationList.append(item);
  }
  syncPageNavigationCurrentPage();
}

function renderDocumentOutline() {
  if (!documentOutlineSection || !documentOutlineList || !documentOutlineEmpty) {
    return;
  }

  documentOutlineList.replaceChildren();
  const showDocumentOutline = documentOutlineItems.length > 0;
  documentOutlineSection.hidden = !showDocumentOutline;
  documentOutlineSection.dataset.available = String(showDocumentOutline);
  documentOutlineEmpty.hidden = showDocumentOutline;
  documentOutlineList.hidden = !showDocumentOutline;
  if (!showDocumentOutline) {
    return;
  }

  documentOutlineItems.forEach((item, outlineIndex) => {
    const listItem = document.createElement("li");
    listItem.className = "document-outline-item";

    const button = document.createElement("button");
    button.className = "document-outline-button";
    button.type = "button";
    button.textContent = item.title;
    button.title = item.title;
    button.dataset.pageIndex = String(item.pageIndex);
    button.dataset.outlineIndex = String(outlineIndex);
    button.style.setProperty("--outline-level", String(item.level));
    button.addEventListener("click", () => {
      void navigateFromDocumentOutline(item.pageIndex, outlineIndex);
    });

    listItem.append(button);
    documentOutlineList.append(listItem);
  });
  syncDocumentOutlineCurrentPage();
}

function syncPageNavigationCurrentPage() {
  if (!pageNavigationList) {
    return;
  }
  for (const button of pageNavigationList.querySelectorAll<HTMLButtonElement>(".page-navigation-button")) {
    const pageIndex = Number.parseInt(button.dataset.pageIndex ?? "", 10);
    const isCurrent = pageIndex === currentPage;
    button.setAttribute("aria-current", isCurrent ? "page" : "false");
    button.disabled = isBusy || !session || Number.isNaN(pageIndex);
    if (isCurrent) {
      button.scrollIntoView({ block: "nearest" });
    }
  }
}

function syncDocumentOutlineCurrentPage() {
  if (!documentOutlineList) {
    return;
  }
  const nextPreference = nextDocumentOutlinePreference({
    preferredIndex: preferredDocumentOutlineIndex,
    preferredPageIndex: preferredDocumentOutlinePageIndex,
    currentPage,
    preservedScrollTop: preservedDocumentOutlineScrollTop,
  });
  preferredDocumentOutlineIndex = nextPreference.preferredIndex;
  preferredDocumentOutlinePageIndex = nextPreference.preferredPageIndex;

  const buttons = Array.from(documentOutlineList.querySelectorAll<HTMLButtonElement>(".document-outline-button"));
  const activeIndex = activeDocumentOutlineIndex({
    items: buttons.map((button) => ({
      pageIndex: Number.parseInt(button.dataset.pageIndex ?? "", 10),
    })),
    currentPage,
    preferredIndex: preferredDocumentOutlineIndex,
  });
  let activeButton: HTMLButtonElement | null = activeIndex === null ? null : buttons[activeIndex] ?? null;
  for (const button of buttons) {
    const pageIndex = Number.parseInt(button.dataset.pageIndex ?? "", 10);
    button.setAttribute("aria-current", "false");
    button.disabled = isBusy || !session || Number.isNaN(pageIndex);
  }
  if (activeButton) {
    activeButton.setAttribute("aria-current", "page");
    if (preservedDocumentOutlineScrollTop === null) {
      activeButton.scrollIntoView({ block: "nearest" });
    } else {
      documentOutlineList.scrollTop = preservedDocumentOutlineScrollTop;
    }
  }
}

async function navigateFromPageNavigation(pageIndex: number) {
  if (!session || isBusy) {
    return;
  }
  await withBusy(async () => {
    try {
      await navigateToPage(pageIndex);
      setDocumentStatus("已打开");
    } catch (error) {
      showError(error);
    }
  });
}

async function navigateFromDocumentOutline(pageIndex: number, outlineIndex: number) {
  if (!session || isBusy) {
    return;
  }
  preservedDocumentOutlineScrollTop = documentOutlineList?.scrollTop ?? null;
  preferredDocumentOutlineIndex = outlineIndex;
  preferredDocumentOutlinePageIndex = pageIndex;
  try {
    await withBusy(async () => {
      try {
        await navigateToPage(pageIndex);
        setDocumentStatus("已打开");
      } catch (error) {
        showError(error);
      }
    });
  } finally {
    if (documentOutlineList && preservedDocumentOutlineScrollTop !== null) {
      documentOutlineList.scrollTop = preservedDocumentOutlineScrollTop;
    }
    preservedDocumentOutlineScrollTop = null;
  }
}

async function readPdfOutlineBestEffort(opened: PdfDocumentHandle): Promise<DocumentOutlineItem[]> {
  try {
    return await opened.getOutline();
  } catch {
    return [];
  }
}

function canUseConvertedPdfDocumentOutline(sourceFileType: string) {
  return sourceFileType === "pdf" || isOfficeFileType(sourceFileType);
}

function schedulePdfAutoChapterNavigation(opened: PdfDocumentHandle, sessionId: string) {
  const requestId = ++autoChapterNavigationRequestId;
  const scanPageCount = Math.min(opened.pageCount, MAX_AUTO_CHAPTER_SCAN_PAGES);

  void (async () => {
    const chapters: DocumentOutlineItem[] = [];
    const seen = new Set<string>();
    let hasPublished = false;

    for (let pageIndex = 0; pageIndex < scanPageCount; pageIndex += 1) {
      if (!canApplyPdfAutoChapterNavigation(requestId, sessionId, opened)) {
        return;
      }
      try {
        const pageItems = autoChapterNavigationItemsFromPage({
          pageIndex,
          text: await opened.getPageText(pageIndex),
        });
        for (const item of pageItems) {
          const key = `${item.pageIndex}:${item.title}`;
          if (!seen.has(key)) {
            seen.add(key);
            chapters.push(item);
          }
          if (chapters.length >= MAX_AUTO_CHAPTER_ITEMS) {
            break;
          }
        }
      } catch {
        return;
      }

      if (chapters.length >= MIN_AUTO_CHAPTER_COUNT) {
        hasPublished = publishPdfAutoChapterNavigation(requestId, sessionId, opened, chapters) || hasPublished;
      }
      if (chapters.length >= MAX_AUTO_CHAPTER_ITEMS) {
        return;
      }
    }

    if (!hasPublished && chapters.length >= MIN_AUTO_CHAPTER_COUNT) {
      publishPdfAutoChapterNavigation(requestId, sessionId, opened, chapters);
    } else if (!hasPublished && canApplyPdfAutoChapterNavigation(requestId, sessionId, opened)) {
      setActivityFeedback("未识别到章节导航");
    }
  })();
}

function canApplyPdfAutoChapterNavigation(
  requestId: number,
  sessionId: string,
  opened: PdfDocumentHandle,
) {
  const hasNoOutline = documentOutlineItems.length === 0;
  const isCurrentAutoOutline = activeAutoChapterNavigationRequestId === requestId;
  return (
    requestId === autoChapterNavigationRequestId
    && session?.id === sessionId
    && activePdfDocument === opened
    && (hasNoOutline || isCurrentAutoOutline)
  );
}

function publishPdfAutoChapterNavigation(
  requestId: number,
  sessionId: string,
  opened: PdfDocumentHandle,
  chapters: readonly DocumentOutlineItem[],
) {
  if (!canApplyPdfAutoChapterNavigation(requestId, sessionId, opened)) {
    return false;
  }

  activeAutoChapterNavigationRequestId = requestId;
  documentOutlineItems = chapters.slice(0, MAX_AUTO_CHAPTER_ITEMS);
  renderDocumentOutline();
  renderPageNavigation();
  updateReaderNavigationPanel();
  setActivityFeedback(`已本地识别 ${documentOutlineItems.length} 个章节导航，可能有少量误差`);
  return true;
}

function updateMetadata() {
  if (documentName) {
    documentName.textContent = currentDocumentName;
    documentName.title = currentDocumentName;
  }
  if (documentStatus) {
    documentStatus.textContent = isBusy && !currentDocumentStatus.startsWith("正在")
      ? "处理中..."
      : currentDocumentStatus;
  }
  if (activityFeedback) {
    activityFeedback.textContent = currentActivityFeedback;
    activityFeedback.hidden = currentActivityFeedback.trim().length === 0;
    syncActivityFeedbackPosition();
  }
  updateErrorDiagnosticOverlay();
  if (pageCount) {
    pageCount.textContent = session ? String(session.page_count) : "-";
  }
  if (scaleValue) {
    scaleValue.textContent = `${Math.round(scale * 100)}%`;
  }
  const canUseContinuous = canUseContinuousView();
  const toolbarState = readerToolbarState({
    isBusy,
    hasSession: Boolean(session),
    currentPage,
    pageCount: session?.page_count ?? 0,
    scale,
    canScaleCurrentDocument: canScaleCurrentDocument(),
    canUseContinuousView: canUseContinuous,
    readerViewMode,
  });
  const documentCenterState = readerDocumentCenterState({
    isBusy,
    recentFileCount: recentFiles.entries.length,
  });
  updateReaderNavigationPanel();
  const navigationControlsState = readerNavigationControlsState({
    isBusy,
    canUseReaderNavigation: canUseReaderNavigation(),
    isReaderNavigationOpen,
    readerNavigationFontSize,
    minReaderNavigationFontSize,
    maxReaderNavigationFontSize,
  });
  syncOfdPageLimitControls();
  if (pageNumberInput) {
    pageNumberInput.value = session ? String(currentPage + 1) : "";
    pageNumberInput.disabled = toolbarState.pageNumberInputDisabled;
  }
  if (pageTotalLabel) {
    pageTotalLabel.textContent = session ? `/ ${session.page_count}` : "/ -";
  }
  if (openLocalDocumentButton) {
    openLocalDocumentButton.disabled = documentCenterState.openLocalDocumentDisabled;
    openLocalDocumentButton.textContent = documentCenterState.openLocalDocumentLabel;
  }
  if (previousButton) {
    previousButton.disabled = toolbarState.previousPageDisabled;
  }
  if (nextButton) {
    nextButton.disabled = toolbarState.nextPageDisabled;
  }
  if (jumpPageButton) {
    jumpPageButton.disabled = toolbarState.jumpPageDisabled;
  }
  if (zoomOutButton) {
    zoomOutButton.disabled = toolbarState.zoomOutDisabled;
  }
  if (zoomInButton) {
    zoomInButton.disabled = toolbarState.zoomInDisabled;
  }
  if (resetZoomButton) {
    resetZoomButton.disabled = toolbarState.resetZoomDisabled;
  }
  if (fitWidthButton) {
    fitWidthButton.disabled = toolbarState.fitWidthDisabled;
  }
  if (fitPageButton) {
    fitPageButton.disabled = toolbarState.fitPageDisabled;
  }
  if (singlePageViewButton) {
    singlePageViewButton.disabled = toolbarState.singlePageViewDisabled;
    singlePageViewButton.setAttribute("aria-pressed", String(toolbarState.singlePageViewPressed));
  }
  if (continuousPageViewButton) {
    continuousPageViewButton.disabled = toolbarState.continuousPageViewDisabled;
    continuousPageViewButton.setAttribute("aria-pressed", String(toolbarState.continuousPageViewPressed));
  }
  if (toggleReaderNavigationButton) {
    toggleReaderNavigationButton.disabled = navigationControlsState.toggleReaderNavigationDisabled;
  }
  if (closeReaderNavigationButton) {
    closeReaderNavigationButton.disabled = navigationControlsState.closeReaderNavigationDisabled;
  }
  if (decreaseReaderNavigationFontButton) {
    decreaseReaderNavigationFontButton.disabled = navigationControlsState.decreaseReaderNavigationFontDisabled;
  }
  if (increaseReaderNavigationFontButton) {
    increaseReaderNavigationFontButton.disabled = navigationControlsState.increaseReaderNavigationFontDisabled;
  }
  if (moreReaderToolsButton) {
    moreReaderToolsButton.disabled = isBusy || !session;
  }
  if (officeLayoutPreviewButton) {
    officeLayoutPreviewButton.hidden = !canShowOfficePreviewLayout();
    officeLayoutPreviewButton.disabled = !canToggleOfficePreviewLayout();
    officeLayoutPreviewButton.textContent = currentOfficePreview
      ? officePreviewLayoutLabel(currentOfficePreview.layout)
      : "适宽预览";
  }
  if (rotateViewLeftButton) {
    rotateViewLeftButton.disabled = !canRotatePdfView();
  }
  if (rotateViewRightButton) {
    rotateViewRightButton.disabled = !canRotatePdfView();
  }
  if (resetViewRotationButton) {
    resetViewRotationButton.disabled = !canRotatePdfView() || pdfViewRotation === 0;
  }
  if (selectCurrentPageTextButton) {
    selectCurrentPageTextButton.disabled = !canSelectCurrentPageText();
  }
  if (copyCurrentPageTextButton) {
    copyCurrentPageTextButton.disabled = !canCopyCurrentPageText();
  }
  syncFocusReadingModeButtons();
  if (findQueryInput) {
    findQueryInput.disabled = isBusy || isFindingDocument || !canUseDocumentFind();
  }
  if (findPreviousButton) {
    findPreviousButton.disabled = !canUseDocumentFind() || !findQueryInput?.value.trim();
  }
  if (findNextButton) {
    findNextButton.disabled = !canUseDocumentFind() || !findQueryInput?.value.trim();
  }
  if (clearFindButton) {
    clearFindButton.disabled = isBusy || isFindingDocument || !findQueryInput?.value.trim();
  }
  updateDocumentFindStatus();
  if (printDocumentButton) {
    printDocumentButton.disabled = toolbarState.printDocumentDisabled;
  }
  if (refreshRecentFilesButton) {
    refreshRecentFilesButton.disabled = documentCenterState.refreshRecentFilesDisabled;
  }
  if (clearRecentFilesButton) {
    clearRecentFilesButton.disabled = documentCenterState.clearRecentFilesDisabled;
  }
  if (clearRenderCacheButton) {
    clearRenderCacheButton.disabled = documentCenterState.clearRenderCacheDisabled;
  }
  if (recentFilesEnabled) {
    recentFilesEnabled.disabled = documentCenterState.recentFilesEnabledDisabled;
  }
  syncDocumentOutlineCurrentPage();
  syncPageNavigationCurrentPage();
  updateDiagnosticActions();
}

async function withBusy(action: () => Promise<void>) {
  if (isBusy) {
    return;
  }

  isBusy = true;
  pageSurface?.classList.add("is-loading");
  pageSurface?.setAttribute("aria-busy", "true");
  updateMetadata();
  try {
    await action();
  } finally {
    isBusy = false;
    pageSurface?.classList.remove("is-loading");
    pageSurface?.removeAttribute("aria-busy");
    updateMetadata();
  }
}

function previewCurrentOfdScale() {
  if (!pageSurface) {
    return;
  }

  const previewSize = ofdScalePreviewSize({
    baseSize: pageScaleBaseSize(),
    scale,
  });
  if (!previewSize) {
    return;
  }

  pageSurface.style.width = `${previewSize.width}px`;
  pageSurface.style.height = `${previewSize.height}px`;
}

function currentOfdScaleRenderTarget() {
  return ofdScaleRenderTargetFromSession({
    session,
    pageIndex: currentPage,
    scale,
  });
}

function isCurrentOfdScaleRender(request: OfdScaleRenderRequest) {
  const target = currentOfdScaleRenderTarget();
  return target
    ? ofdScaleRenderState.isCurrent(request, target, { isSameScale })
    : false;
}

function scheduleOfdScaleRender() {
  const target = currentOfdScaleRenderTarget();
  if (!target) {
    return;
  }

  setActivityFeedback("正在调整缩放");
  previewCurrentOfdScale();
  updateMetadata();

  ofdScaleRenderState.schedule(target, (request) => {
    void (async () => {
      if (!isCurrentOfdScaleRender(request)) {
        return;
      }

      await withBusy(async () => {
        if (!isCurrentOfdScaleRender(request)) {
          return;
        }
        try {
          await renderCurrentPage();
        } catch (error) {
          if (isCurrentOfdScaleRender(request)) {
            showError(error);
          }
        }
      });
    })();
  });
}

async function renderCurrentPage() {
  if (!session || !pageSurface || !pagePlaceholder) {
    return;
  }

  if (readerViewMode === "continuous" && canUseContinuousView()) {
    clearCurrentPageTextSelection();
    clearError();
    const rendered = await renderContinuousPages();
    if (!rendered) {
      return;
    }
    scrollContinuousPageIntoView(currentPage);
    renderDocumentOutline();
    renderPageNavigation();
    updateMetadata();
    return;
  }

  clearContinuousPages();
  clearCurrentPageTextSelection();
  clearError();
  if (session.file_type === "pdf") {
    await renderPdfPage();
    renderDocumentOutline();
    renderPageNavigation();
    updateMetadata();
    return;
  }
  if (isImageSession() && currentImageDocumentView) {
    renderImageDocument(currentImageDocumentView);
    updateMetadata();
    return;
  }

  setPerformanceStatus(performanceStatus("ofd_render_page"));
  const renderStartedAt = performance.now();
  const bitmap = await renderLocalOfdPage(session.id, currentPage, scale);
  if (currentPerformanceStatus.phase === "ofd_render_page") {
    recordOfdRenderPerformance(renderStartedAt, bitmap.duration_ms);
  }

  const displaySize = pageDisplaySize(bitmap);
  pageSurface.style.width = `${displaySize.width}px`;
  pageSurface.style.height = `${displaySize.height}px`;
  setPageSurfacePrintSize(displaySize.width, displaySize.height);
  pageSurface.dataset.page = String(bitmap.page_index + 1);
  pageCanvas?.remove();
  pageCanvas = null;
  pageTextLayer?.remove();
  pageTextLayer = null;
  clearTextPreview();
  if (bitmap.image_ref.startsWith("fake://")) {
    pageImage?.remove();
    pageImage = null;
    pagePlaceholder.hidden = false;
    pagePlaceholder.textContent = `Fake page ${bitmap.page_index + 1}`;
  } else {
    pagePlaceholder.hidden = true;
    if (!pageImage) {
      pageImage = document.createElement("img");
      pageImage.className = "page-image";
      pageImage.addEventListener("error", () => {
        deleteOfdPageCacheFromDataset(localOfdPageCache, pageImage?.dataset ?? {});
        showError({
          code: "IMAGE_LOAD_FAILED",
          message: "页面图片加载失败。",
          recoverable: true,
          safe_to_show: true,
          detail_for_report: "page image element failed to load",
        });
      });
      pageSurface.append(pageImage);
    }
    Object.assign(pageImage.dataset, ofdPageImageDataset({
      sessionId: bitmap.session_id,
      pageIndex: bitmap.page_index,
      scale: bitmap.scale,
    }));
    pageImage.src = convertFileSrc(bitmap.image_ref);
    pageImage.alt = `Page ${bitmap.page_index + 1}`;
  }
  void prefetchAdjacentOfdPages(bitmap.session_id, bitmap.page_index, bitmap.scale);
  finishPerformanceStatus("已打开");
  renderDocumentOutline();
  renderPageNavigation();
  updateMetadata();
}

async function renderPdfPage() {
  if (!session || !pageSurface || !pagePlaceholder) {
    return;
  }

  const pageInfo = currentPageInfo();
  const displaySize = rotatedViewSize(
    {
      width: (pageInfo?.width_pt ?? 612) * scale,
      height: (pageInfo?.height_pt ?? 792) * scale,
    },
    pdfViewRotation,
  );
  const width = Math.round(displaySize.width);
  const height = Math.round(displaySize.height);
  pageSurface.style.width = `${width}px`;
  pageSurface.style.height = `${height}px`;
  setPageSurfacePrintSize(width, height);
  pageSurface.dataset.page = String(currentPage + 1);
  pageImage?.remove();
  pageImage = null;
  clearTextPreview();
  if (!pageCanvas) {
    pageCanvas = document.createElement("canvas");
    pageCanvas.className = "page-canvas";
  }
  if (!pageTextLayer) {
    pageTextLayer = document.createElement("div");
    pageTextLayer.className = "textLayer page-text-layer";
  }
  if (!pageCanvas.isConnected) {
    pageSurface.append(pageCanvas);
  }
  if (!pageTextLayer.isConnected) {
    pageSurface.append(pageTextLayer);
  }
  if (!activePdfDocument) {
    pagePlaceholder.hidden = false;
    pagePlaceholder.textContent = `PDF 第 ${currentPage + 1} 页 / 共 ${session.page_count} 页`;
    return;
  }

  pagePlaceholder.hidden = true;
  await activePdfDocument.renderPageToCanvas(currentPage, pageCanvas, scale, pdfViewRotation);
  pageTextLayer.removeAttribute("data-text-layer-unavailable");
  pageTextLayer.removeAttribute("data-text-layer-empty");
  try {
    await activePdfDocument.renderPageTextLayer(currentPage, pageTextLayer, scale, pdfViewRotation);
  } catch (error) {
    void error;
    pageTextLayer.replaceChildren();
    pageTextLayer.removeAttribute("data-text-layer-empty");
    pageTextLayer.dataset.textLayerUnavailable = "true";
  }
}

async function documentFindPageTexts(): Promise<DocumentFindPageText[]> {
  if (!session) {
    return [];
  }

  if (isTextSession()) {
    return [{ pageIndex: 0, text: currentTextDocumentText }];
  }

  if (session.file_type === "pdf" && activePdfDocument) {
    const pages: DocumentFindPageText[] = [];
    for (let pageIndex = 0; pageIndex < session.page_count; pageIndex += 1) {
      pages.push({
        pageIndex,
        text: await activePdfDocument.getPageText(pageIndex),
      });
    }
    return pages;
  }

  if (session.file_type === "ofd") {
    const text = await invoke<OfdTextView>("local_ofd_text", {
      sessionId: session.id,
      maxPages: 20,
    });
    return documentFindPageTextsFromOfdView(text);
  }

  return [];
}

async function rebuildDocumentFindMatches() {
  if (!findQueryInput) {
    documentFindMatches = [];
    documentFindActiveIndex = -1;
    return;
  }

  documentFindQuery = normalizeDocumentFindQuery(findQueryInput.value);
  const pages = await documentFindPageTexts();
  documentFindMatches = buildDocumentFindMatches(pages, documentFindQuery);
  documentFindActiveIndex = -1;
}

async function currentOfdPageText(): Promise<string> {
  if (!session || session.file_type !== "ofd") {
    return "";
  }

  const text = await invoke<OfdTextView>("local_ofd_text", {
    sessionId: session.id,
    maxPages: 1,
    pageIndex: currentPage,
  });
  return currentOfdPageTextFromView(text, currentPage);
}

async function openLocalOfdPath(path: string) {
  await withBusy(async () => {
    const openSnapshot = snapshotReaderOpenState();
    const previousSession = openSnapshot.session;
    try {
      clearError();
      clearActivityFeedback();
      pendingDiagnosticContext = {
        file_type: "ofd",
      };
      resetPerformanceTrace();
      currentDocumentName = displayNameFromPath(path);
      setDocumentStatus("正在打开");
      updateMetadata();
      const inspectStartedAt = performance.now();
      setPerformanceStatus(performanceStatus("ofd_open_inspect"));
      session = await invoke<DocumentSession>("open_local_ofd", {
        path,
      });
      recordPerformanceStatus(performanceStatus("ofd_open_inspect", performance.now() - inspectStartedAt));
      assertOfdOpenPolicy(session);
      currentOfficePreview = null;
      documentOutlineItems = [];
      clearAllLocalOfdPageWork();
      currentPage = 0;
      scale = 1;
      pdfViewRotation = 0;
      resetDocumentFindState();
      resetReaderViewModeForDocument();
      await renderCurrentPage();
      await disposeActivePdfDocument();
      currentImageDocumentView = null;
      clearActivityFeedback();
      setDocumentStatus("已打开");
      pendingDiagnosticContext = null;
      rememberLocalDocumentDirectory(path);
      await cleanupPreviousDocumentCache(previousSession, session);
      await loadRecentFiles();
    } catch (error) {
      restoreReaderOpenSnapshot(openSnapshot);
      updateMetadata();
      renderRecentFiles();
      showError(error);
      pendingDiagnosticContext = null;
    }
  });
}

function pdfSessionFromOpenResult(opened: PdfOpenResult): DocumentSession {
  return {
    id: `pdf-local-${Date.now()}`,
    file_type: opened.fileType,
    page_count: opened.pageCount,
    page_sizes: opened.pageSizes.map((page) => ({
      index: page.index,
      width_pt: page.widthPt,
      height_pt: page.heightPt,
    })),
    engine: {
      name: "pdfjs",
      version: opened.engineVersion,
      protocol_version: "local-adapter",
      capabilities: ["metadata"],
    },
    warnings: [],
  };
}

function textSessionFromView(view: TextDocumentView): DocumentSession {
  return {
    id: view.session_id,
    file_type: view.file_type,
    page_count: 1,
    page_sizes: [{ index: 0, width_pt: 612, height_pt: 792 }],
    engine: {
      name: "plain-text",
      version: "local",
      protocol_version: "local-adapter",
      capabilities: ["text"],
    },
    warnings: view.warnings,
  };
}

function imageSessionFromView(view: ImageDocumentView): DocumentSession {
  return {
    id: view.session_id,
    file_type: view.file_type,
    page_count: 1,
    page_sizes: [{ index: 0, width_pt: view.width_px, height_pt: view.height_px }],
    engine: {
      name: "local-image",
      version: "webview",
      protocol_version: "local-adapter",
      capabilities: ["image"],
    },
    warnings: view.warnings,
  };
}

function renderImageDocument(view: ImageDocumentView) {
  if (!pageSurface || !pagePlaceholder) {
    return;
  }
  currentImageDocumentView = view;
  clearTextPreview();
  pageCanvas?.remove();
  pageCanvas = null;
  pageTextLayer?.remove();
  pageTextLayer = null;
  pagePlaceholder.hidden = true;
  pageSurface.replaceChildren(pagePlaceholder);
  const displaySize = rotatedViewSize({
    width: view.width_px,
    height: view.height_px,
  }, pdfViewRotation);
  const width = Math.round(displaySize.width * scale);
  const height = Math.round(displaySize.height * scale);
  pageSurface.style.width = `${width}px`;
  pageSurface.style.height = `${height}px`;
  pageSurface.style.setProperty("--ldv-image-display-width", `${Math.round(view.width_px * scale)}px`);
  pageSurface.style.setProperty("--ldv-image-display-height", `${Math.round(view.height_px * scale)}px`);
  pageSurface.style.setProperty("--ldv-image-view-rotation", `${pdfViewRotation}deg`);
  pageSurface.style.setProperty("--ldv-image-print-aspect", `${Math.max(1, Math.round(view.width_px))} / ${Math.max(1, Math.round(view.height_px))}`);
  setPageSurfacePrintSize(view.width_px, view.height_px);
  pageSurface.dataset.page = "1";
  pageSurface.dataset.documentMode = "image";
  pageSurface.dataset.printDocumentMode = "page";
  pageSurface.dataset.viewRotation = String(pdfViewRotation);
  pageImage?.remove();
  pageImage = document.createElement("img");
  pageImage.className = "page-image";
  pageImage.src = convertFileSrc(view.source_path);
  pageImage.alt = view.display_name;
  pageImage.addEventListener("error", () => {
    showError({
      code: "IMAGE_LOAD_FAILED",
      message: "图片加载失败。",
      recoverable: true,
      safe_to_show: true,
      detail_for_report: "local image element failed to load",
    });
  });
  pageSurface.append(pageImage);
  documentOutlineItems = [];
  renderDocumentOutline();
  renderPageNavigation();
}

function renderTextDocument(view: TextDocumentView) {
  if (!pageSurface || !pagePlaceholder) {
    return;
  }
  currentImageDocumentView = null;
  clearTextPreview();
  pageImage?.remove();
  pageImage = null;
  pageCanvas?.remove();
  pageCanvas = null;
  pageTextLayer?.remove();
  pageTextLayer = null;
  pagePlaceholder.hidden = true;
  pageSurface.replaceChildren(pagePlaceholder);
  pageSurface.style.removeProperty("width");
  pageSurface.style.removeProperty("height");
  pageSurface.dataset.page = "1";
  pageSurface.dataset.documentMode = "text";
  pageSurface.dataset.printDocumentMode = "text";
  pageSurface.dataset.printOrientation = "portrait";
  pageSurface.style.removeProperty("--ldv-page-print-width");
  pageSurface.style.removeProperty("--ldv-page-print-height");
  currentTextDocumentText = view.text;
  textPreviewShell = document.createElement("div");
  textPreviewShell.className = "text-preview-shell";
  textLineNumbers = document.createElement("div");
  textLineNumbers.className = "text-line-numbers";
  textLineNumbers.setAttribute("aria-hidden", "true");
  textLineNumbers.textContent = lineNumbersForText(view.text);
  textPreviewSurface = document.createElement("pre");
  textPreviewSurface.className = "text-preview-surface";
  textPreviewSurface.textContent = view.text;
  textPreviewShell.append(textLineNumbers, textPreviewSurface);
  pageSurface.append(textPreviewShell);
  documentOutlineItems = [];
  renderDocumentOutline();
  renderPageNavigation();
}

async function openLocalImagePath(path: string) {
  await withBusy(async () => {
    const openSnapshot = snapshotReaderOpenState();
    const previousPdfDocument = openSnapshot.activePdfDocument;
    try {
      clearError();
      clearActivityFeedback();
      pendingDiagnosticContext = {
        file_type: imageFileTypeFromPath(path) ?? "image",
      };
      currentDocumentName = displayNameFromPath(path);
      setDocumentStatus("正在打开");
      updateMetadata();
      const view = await invoke<ImageDocumentView>("open_local_image_document", {
        path,
      });
      session = imageSessionFromView(view);
      resetPerformanceTrace();
      activePdfDocument = null;
      currentOfficePreview = null;
      clearAllLocalOfdPageWork();
      currentPage = 0;
      scale = 1;
      pdfViewRotation = 0;
      resetDocumentFindState();
      resetReaderViewModeForDocument();
      renderImageDocument(view);
      clearActivityFeedback();
      setDocumentStatus("已打开");
      pendingDiagnosticContext = null;
      rememberLocalDocumentDirectory(path);
      await loadRecentFiles();
      if (previousPdfDocument) {
        try {
          await previousPdfDocument.destroy();
        } catch {
          // Old PDF cleanup is best-effort after image is visible.
        }
      }
      await cleanupPreviousDocumentCache(openSnapshot.session, session);
    } catch (error) {
      restoreReaderOpenSnapshot(openSnapshot);
      updateMetadata();
      showError(error);
      pendingDiagnosticContext = null;
    }
  });
}

async function openLocalTextPath(path: string) {
  await withBusy(async () => {
    const openSnapshot = snapshotReaderOpenState();
    const previousPdfDocument = openSnapshot.activePdfDocument;
    try {
      clearError();
      clearActivityFeedback();
      pendingDiagnosticContext = {
        file_type: textFileTypeFromPath(path) ?? "text",
      };
      currentDocumentName = displayNameFromPath(path);
      setDocumentStatus("正在打开");
      updateMetadata();
      const view = await invoke<TextDocumentView>("read_local_text_document", {
        path,
      });
      session = textSessionFromView(view);
      resetPerformanceTrace();
      activePdfDocument = null;
      currentImageDocumentView = null;
      currentOfficePreview = null;
      clearAllLocalOfdPageWork();
      currentPage = 0;
      scale = 1;
      pdfViewRotation = 0;
      resetDocumentFindState();
      resetReaderViewModeForDocument();
      renderTextDocument(view);
      clearActivityFeedback();
      setDocumentStatus("已打开");
      pendingDiagnosticContext = null;
      rememberLocalDocumentDirectory(path);
      await loadRecentFiles();
      if (previousPdfDocument) {
        try {
          await previousPdfDocument.destroy();
        } catch {
          // Old PDF cleanup is best-effort after text is visible.
        }
      }
      await cleanupPreviousDocumentCache(openSnapshot.session, session);
    } catch (error) {
      restoreReaderOpenSnapshot(openSnapshot);
      updateMetadata();
      showError(error);
      pendingDiagnosticContext = null;
    }
  });
}

async function openLocalOfficePath(path: string) {
  await openOfficePreviewPdf({
    source: "local",
    path,
    displayName: displayNameFromPath(path),
    fileType: officeFileTypeFromPath(path) ?? "office",
    layout: "preserve",
  }, async () => {
    rememberLocalDocumentDirectory(path);
    await loadRecentFiles();
  });
}

async function openLocalPdfPath(path: string) {
  await withBusy(async () => {
    await openPdfFromByteSource(displayNameFromPath(path), async () => {
      return await invoke<number[]>("read_local_pdf_bytes", {
        path,
      });
    }, async () => {
      rememberLocalDocumentDirectory(path);
      try {
        recentFiles = await invoke<RecentFilesView>("record_opened_pdf", {
          path,
        });
        renderRecentFiles();
      } catch {
        await loadRecentFiles();
      }
    });
  });
}

async function openRecentOfficeFile(id: string, displayName: string, fileType: string) {
  await openOfficePreviewPdf({
    source: "recent",
    recentId: id,
    displayName,
    fileType,
    layout: "preserve",
  }, async () => {
    recentUnavailableIds.delete(id);
    await loadRecentFiles();
  }, () => {
    recentUnavailableIds.add(id);
    renderRecentFiles();
  });
}

async function openRecentImageFile(id: string, displayName: string, fileType: string) {
  await withBusy(async () => {
    const openSnapshot = snapshotReaderOpenState();
    const previousPdfDocument = openSnapshot.activePdfDocument;
    try {
      clearError();
      clearActivityFeedback();
      pendingDiagnosticContext = {
        file_type: fileType || "image",
      };
      currentDocumentName = displayName;
      setDocumentStatus("正在打开");
      updateMetadata();
      const view = await invoke<ImageDocumentView>("open_recent_image_document", {
        id,
      });
      session = imageSessionFromView(view);
      resetPerformanceTrace();
      activePdfDocument = null;
      currentOfficePreview = null;
      clearAllLocalOfdPageWork();
      currentPage = 0;
      scale = 1;
      pdfViewRotation = 0;
      resetDocumentFindState();
      resetReaderViewModeForDocument();
      renderImageDocument(view);
      clearActivityFeedback();
      setDocumentStatus("已打开");
      pendingDiagnosticContext = null;
      recentUnavailableIds.delete(id);
      await loadRecentFiles();
      if (previousPdfDocument) {
        try {
          await previousPdfDocument.destroy();
        } catch {
          // Old PDF cleanup is best-effort after image is visible.
        }
      }
      await cleanupPreviousDocumentCache(openSnapshot.session, session);
    } catch (error) {
      recentUnavailableIds.add(id);
      restoreReaderOpenSnapshot(openSnapshot);
      updateMetadata();
      renderRecentFiles();
      showError(error);
      pendingDiagnosticContext = null;
    }
  });
}

async function openRecentTextFile(id: string, displayName: string, fileType: string) {
  await withBusy(async () => {
    const openSnapshot = snapshotReaderOpenState();
    const previousPdfDocument = openSnapshot.activePdfDocument;
    try {
      clearError();
      clearActivityFeedback();
      pendingDiagnosticContext = {
        file_type: fileType || "text",
      };
      currentDocumentName = displayName;
      setDocumentStatus("正在打开");
      updateMetadata();
      const view = await invoke<TextDocumentView>("read_recent_text_document", {
        id,
      });
      session = textSessionFromView(view);
      resetPerformanceTrace();
      activePdfDocument = null;
      currentImageDocumentView = null;
      currentOfficePreview = null;
      clearAllLocalOfdPageWork();
      currentPage = 0;
      scale = 1;
      pdfViewRotation = 0;
      resetDocumentFindState();
      resetReaderViewModeForDocument();
      renderTextDocument(view);
      clearActivityFeedback();
      setDocumentStatus("已打开");
      pendingDiagnosticContext = null;
      recentUnavailableIds.delete(id);
      await loadRecentFiles();
      if (previousPdfDocument) {
        try {
          await previousPdfDocument.destroy();
        } catch {
          // Old PDF cleanup is best-effort after text is visible.
        }
      }
      await cleanupPreviousDocumentCache(openSnapshot.session, session);
    } catch (error) {
      recentUnavailableIds.add(id);
      restoreReaderOpenSnapshot(openSnapshot);
      updateMetadata();
      renderRecentFiles();
      showError(error);
      pendingDiagnosticContext = null;
    }
  });
}

async function openOfficePreviewPdf(
  context: OfficePreviewContext,
  afterOpen?: () => Promise<void>,
  afterError?: () => void,
) {
  await withBusy(async () => {
    setDocumentStatus("正在转换为 PDF 预览");
    updateMetadata();
    let opened: OfficePdfOpenResult | null = null;
    await openPdfFromByteSource(context.displayName, async () => {
      if (context.source === "local") {
        if (!context.path) {
          throw new Error("missing local Office preview path");
        }
        opened = await invoke<OfficePdfOpenResult>("open_local_office_as_pdf", {
          path: context.path,
          layout: context.layout,
          converterExecutablePath: officeConverterExePreference(),
        });
      } else {
        if (!context.recentId) {
          throw new Error("missing recent Office preview id");
        }
        opened = await invoke<OfficePdfOpenResult>("open_recent_office_as_pdf", {
          id: context.recentId,
          layout: context.layout,
          converterExecutablePath: officeConverterExePreference(),
        });
      }
      return await invoke<number[]>("read_converted_office_pdf_bytes", {
        sessionId: opened.session_id,
      });
    }, async () => {
      const openedFileType = opened?.original_file_type ?? context.fileType;
      const openedDisplayName = opened?.display_name ?? context.displayName;
      currentOfficePreview = {
        ...context,
        displayName: openedDisplayName,
        fileType: openedFileType,
      };
      updateMetadata();
      if (afterOpen) {
        await afterOpen();
      }
    }, afterError, context.fileType, "正在转换为 PDF 预览");
  });
}

async function openRecentPdfFile(id: string, displayName: string) {
  await withBusy(async () => {
    await openPdfFromByteSource(displayName, async () => {
      return await invoke<number[]>("read_recent_pdf_bytes", {
        id,
      });
    }, async () => {
      try {
        recentFiles = await invoke<RecentFilesView>("record_recent_pdf_opened", {
          id,
        });
        recentUnavailableIds.delete(id);
        renderRecentFiles();
      } catch {
        recentUnavailableIds.delete(id);
        await loadRecentFiles();
      }
    }, () => {
      recentUnavailableIds.add(id);
      renderRecentFiles();
    });
  });
}

async function openPdfFromByteSource(
  displayName: string,
  readBytes: () => Promise<number[]>,
  afterOpen?: () => Promise<void>,
  afterError?: () => void,
  sourceFileType = "pdf",
  loadingStatus: DocumentLifecycleStatus = "正在打开",
) {
  const openSnapshot = snapshotReaderOpenState();
  const previousSession = openSnapshot.session;
  const previousPdfDocument = openSnapshot.activePdfDocument;
  let opened: PdfDocumentHandle | null = null;
  try {
    clearError();
    clearActivityFeedback();
    pendingDiagnosticContext = {
      file_type: sourceFileType,
    };
    currentDocumentName = displayName;
    setDocumentStatus(loadingStatus);
    updateMetadata();
    const bytes = await readBytes();
    const pdfBytes = new Uint8Array(bytes);
    opened = await openPdfDocumentFromBytes(pdfBytes);
    activePdfDocument = opened;
    session = pdfSessionFromOpenResult(opened);
    resetPerformanceTrace();
    currentOfficePreview = null;
    currentImageDocumentView = null;
    cancelAutoChapterNavigation();
    documentOutlineItems = [];
    if (canUseConvertedPdfDocumentOutline(sourceFileType)) {
      documentOutlineItems = await readPdfOutlineBestEffort(opened);
    }
    clearAllLocalOfdPageWork();
    currentPage = 0;
    scale = 1;
    pdfViewRotation = 0;
    resetDocumentFindState();
    resetReaderViewModeForDocument();
    await renderCurrentPage();
    if (canUseConvertedPdfDocumentOutline(sourceFileType) && documentOutlineItems.length === 0) {
      schedulePdfAutoChapterNavigation(opened, session.id);
    }
    clearActivityFeedback();
    setDocumentStatus("已打开");
    pendingDiagnosticContext = null;
    if (afterOpen) {
      await afterOpen();
    }
    if (previousPdfDocument && previousPdfDocument !== opened) {
      try {
        await previousPdfDocument.destroy();
      } catch {
        // Old PDF cleanup is best-effort after the new PDF is visible.
      }
    }
    await cleanupPreviousDocumentCache(previousSession, session);
  } catch (error) {
    if (opened && opened !== previousPdfDocument) {
      try {
        await opened.destroy();
      } catch {
        // Preserve the original open/render error.
      }
    }
    restoreReaderOpenSnapshot(openSnapshot);
    updateMetadata();
    if (afterError) {
      afterError();
    }
    showError(renderErrorFromPdfOpenFailure(error));
    pendingDiagnosticContext = null;
  }
}

async function openRecentFile(id: string, displayName: string, fileType: string) {
  if (isBusy) {
    return;
  }
  prepareDocumentOpenTransition();
  const route = recentDocumentRoute(fileType);
  if (route === "pdf") {
    await openRecentPdfFile(id, displayName);
    return;
  }
  if (route === "office") {
    await openRecentOfficeFile(id, displayName, fileType);
    return;
  }
  if (route === "image") {
    await openRecentImageFile(id, displayName, fileType);
    return;
  }
  if (route === "text") {
    await openRecentTextFile(id, displayName, fileType);
    return;
  }

  await withBusy(async () => {
    const openSnapshot = snapshotReaderOpenState();
    try {
      clearError();
      clearActivityFeedback();
      pendingDiagnosticContext = {
        file_type: fileType || "unknown",
      };
      resetPerformanceTrace();
      currentDocumentName = displayName;
      setDocumentStatus("正在打开");
      updateMetadata();
      session = await invoke<DocumentSession>("open_recent_file", {
        id,
      });
      assertOfdOpenPolicy(session);
      currentOfficePreview = null;
      documentOutlineItems = [];
      clearAllLocalOfdPageWork();
      currentPage = 0;
      scale = 1;
      pdfViewRotation = 0;
      resetDocumentFindState();
      resetReaderViewModeForDocument();
      await renderCurrentPage();
      await disposeActivePdfDocument();
      currentImageDocumentView = null;
      clearActivityFeedback();
      setDocumentStatus("已打开");
      pendingDiagnosticContext = null;
      await cleanupPreviousDocumentCache(openSnapshot.session, session);
      recentUnavailableIds.delete(id);
      await loadRecentFiles();
    } catch (error) {
      recentUnavailableIds.add(id);
      restoreReaderOpenSnapshot(openSnapshot);
      updateMetadata();
      renderRecentFiles();
      showError(error);
      pendingDiagnosticContext = null;
    }
  });
}

async function openLocalDocument() {
  prepareDocumentOpenTransition();
  const selected = await open({
    multiple: false,
    defaultPath: lastLocalDocumentDirectory ?? undefined,
    filters: [{ name: "文档", extensions: ["ofd", "pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps", "txt", "log", "csv", "md", "png", "jpg", "jpeg", "webp"] }],
  });
  if (typeof selected === "string") {
    await openLocalDocumentPath(selected);
    return;
  }
  resumeContinuousRenderingAfterOpenCancel();
}

function rememberLocalDocumentDirectory(path: string) {
  lastLocalDocumentDirectory = localDocumentDirectoryFromPath(path) ?? lastLocalDocumentDirectory;
}

async function openLocalDocumentPath(path: string) {
  const route = localDocumentRoute(path);
  if (route === "pdf") {
    await openLocalPdfPath(path);
    return;
  }
  if (route === "office") {
    await openLocalOfficePath(path);
    return;
  }
  if (route === "text") {
    await openLocalTextPath(path);
    return;
  }
  if (route === "image") {
    await openLocalImagePath(path);
    return;
  }
  await openLocalOfdPath(path);
}

async function openStartupDocumentPath() {
  try {
    const path = await invoke<string | null>("startup_document_path");
    if (path) {
      await openLocalDocumentPath(path);
    }
  } catch (error) {
    showError(error);
  }
}

function renderRecentFiles() {
  if (!recentFilesList) {
    return;
  }

  recentFilesList.replaceChildren();
  if (recentFilesEnabled) {
    recentFilesEnabled.checked = recentFiles.enabled;
  }

  if (recentFiles.entries.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "recent-file-empty";
    emptyItem.textContent = "暂无记录";
    recentFilesList.append(emptyItem);
    updateMetadata();
    return;
  }

  const recentFileEntries = recentFileViewStates({
    entries: recentFiles.entries.map((entry) => ({
      id: entry.id,
      displayName: entry.display_name,
      fileType: entry.file_type,
      openedAt: entry.opened_at,
      locationHint: entry.location_hint,
    })),
    unavailableIds: recentUnavailableIds,
  });

  for (const entry of recentFileEntries) {
    const item = document.createElement("li");
    item.className = "recent-file-item";
    item.classList.toggle("is-unavailable", entry.isUnavailable);

    const openButton = document.createElement("button");
    openButton.className = "recent-file-open";
    openButton.type = "button";
    openButton.title = entry.title;
    openButton.addEventListener("click", () => openRecentFile(entry.id, entry.displayName, entry.fileType));

    const icon = document.createElement("span");
    icon.className = "recent-file-icon";
    icon.textContent = entry.iconLabel;

    const text = document.createElement("span");
    text.className = "recent-file-text";

    const name = document.createElement("span");
    name.className = "recent-file-name";
    name.textContent = entry.displayName;

    const time = document.createElement("span");
    time.className = "recent-file-time";
    time.textContent = formatOpenedAt(entry.openedAt);

    text.append(name, time);
    if (entry.shouldShowLocationHint) {
      const location = document.createElement("span");
      location.className = "recent-file-location";
      location.textContent = entry.locationHint;
      text.append(location);
    }
    if (entry.isUnavailable) {
      const availability = document.createElement("span");
      availability.className = "recent-file-availability";
      availability.textContent = "文件不可用";
      text.append(availability);
    }
    openButton.append(icon, text);

    const removeButton = document.createElement("button");
    removeButton.className = "recent-file-remove";
    removeButton.type = "button";
    removeButton.title = "从列表中移除";
    removeButton.textContent = "移除";
    removeButton.addEventListener("click", () => removeRecentFile(entry.id));

    item.append(openButton, removeButton);
    recentFilesList.append(item);
  }
  updateMetadata();
}

async function loadRecentFiles() {
  try {
    recentFiles = await invoke<RecentFilesView>("list_recent_files");
    recentUnavailableIds.clear();
    renderRecentFiles();
  } catch {
    recentFiles = { enabled: true, entries: [] };
    recentUnavailableIds.clear();
    renderRecentFiles();
  }
}

async function removeRecentFile(id: string) {
  if (isBusy) {
    return;
  }

  try {
    recentFiles = await invoke<RecentFilesView>("remove_recent_file", {
      id,
    });
    recentUnavailableIds.delete(id);
    renderRecentFiles();
  } catch (error) {
    showError(error);
  }
}

async function clearRecentFiles() {
  if (isBusy || recentFiles.entries.length === 0) {
    return;
  }

  try {
    recentFiles = await invoke<RecentFilesView>("clear_recent_files");
    recentUnavailableIds.clear();
    renderRecentFiles();
  } catch (error) {
    showError(error);
  }
}

async function clearRenderCache() {
  if (isBusy) {
    return;
  }

  try {
    await withBusy(async () => {
      const currentSessionId = session && session.file_type !== "fake" ? session.id : null;
      await invoke<CacheCleanupView>("clear_render_cache", {
        currentSessionId,
      });
      clearPageCacheExceptSession(currentSessionId);
      clearError();
      setActivityFeedback("缓存已清理");
      updateMetadata();
    });
  } catch (error) {
    showError(error);
  }
}

async function copyDiagnosticInfo() {
  if (isBusy || !lastErrorSummary) {
    return;
  }

  try {
    await navigator.clipboard.writeText(diagnosticSummaryText(lastErrorSummary));
    setActivityFeedback("诊断信息已复制");
  } catch {
    setActivityFeedback("无法复制诊断信息，请稍后重试。");
  }
  updateMetadata();
}

async function setRecentFilesEnabled(enabled: boolean) {
  if (isBusy) {
    return;
  }

  try {
    recentFiles = await invoke<RecentFilesView>("set_recent_files_enabled", {
      enabled,
    });
    renderRecentFiles();
  } catch (error) {
    if (recentFilesEnabled) {
      recentFilesEnabled.checked = recentFiles.enabled;
    }
    showError(error);
  }
}

async function movePage(delta: number) {
  if (!session || isBusy) {
    return;
  }
  await withBusy(async () => {
    try {
      await navigateToPage(Math.min(Math.max(currentPage + delta, 0), session!.page_count - 1));
    } catch (error) {
      showError(error);
    }
  });
}

function canTurnPageWithWheel() {
  return !!session && session.page_count > 1 && !isBusy && !isContinuousViewActive() && !isTextSession();
}

async function turnPageFromWheel(delta: 1 | -1) {
  const now = Date.now();
  if (now - lastWheelPageTurnAt < wheelPageTurnCooldownMs) {
    return;
  }
  lastWheelPageTurnAt = now;
  await movePage(delta);
}

function handlePageStageWheel(event: WheelEvent) {
  if (!canTurnPageWithWheel() || Math.abs(event.deltaY) < wheelPageTurnThreshold) {
    return;
  }
  event.preventDefault();
  void turnPageFromWheel(event.deltaY > 0 ? 1 : -1);
}

function shouldIgnoreReaderKeyboardEvent(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement
    || target.isContentEditable
  );
}

function handleReaderKeyboardNavigation(event: KeyboardEvent) {
  if (shouldIgnoreReaderKeyboardEvent(event) || !session || isBusy) {
    return;
  }

  let pageDelta = 0;
  let pageTarget: number | null = null;
  let scrollDelta = 0;
  let scrollTarget: number | null = null;
  switch (event.key) {
    case "PageDown":
    case "ArrowDown":
    case " ":
      pageDelta = 1;
      scrollDelta = event.key === "ArrowDown" ? keyboardScrollStep : Math.max(keyboardScrollStep, pageStage?.clientHeight ?? 0);
      break;
    case "PageUp":
    case "ArrowUp":
      pageDelta = -1;
      scrollDelta = event.key === "ArrowUp" ? -keyboardScrollStep : -Math.max(keyboardScrollStep, pageStage?.clientHeight ?? 0);
      break;
    case "Home":
      pageTarget = 0;
      scrollTarget = 0;
      break;
    case "End":
      pageTarget = session.page_count - 1;
      scrollTarget = pageStage?.scrollHeight ?? null;
      break;
    default:
      return;
  }

  event.preventDefault();
  if (isContinuousViewActive() || isTextSession() || isImageSession()) {
    if (scrollTarget !== null) {
      pageStage?.scrollTo({ top: scrollTarget, behavior: "smooth" });
      return;
    }
    pageStage?.scrollBy({ top: scrollDelta, behavior: "smooth" });
    return;
  }

  if (pageTarget !== null) {
    void navigateToPage(pageTarget);
    return;
  }
  if (pageDelta !== 0) {
    void movePage(pageDelta);
  }
}

function shouldIgnoreReaderCommandShortcut(event: KeyboardEvent) {
  if (event.metaKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLButtonElement
    || target.isContentEditable
  );
}

function handleReaderCommandShortcut(event: KeyboardEvent) {
  if (shouldIgnoreReaderCommandShortcut(event)) {
    return;
  }

  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "f") {
    event.preventDefault();
    toggleFocusReadingMode();
    return;
  }
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "b") {
    event.preventDefault();
    setDocumentCenterCollapsed(!isDocumentCenterCollapsed);
    return;
  }
  if (event.altKey && event.key.toLowerCase() === "f") {
    if (session && !isBusy && canScaleCurrentDocument()) {
      event.preventDefault();
      void fitPage("page");
    }
    return;
  }
  if (event.key === "[") {
    if (event.ctrlKey && session && !isBusy && canRotatePdfView()) {
      event.preventDefault();
      void rotatePdfView(-1);
    }
    return;
  }
  if (event.key === "]") {
    if (event.ctrlKey && session && !isBusy && canRotatePdfView()) {
      event.preventDefault();
      void rotatePdfView(1);
    }
    return;
  }
  if (event.key === "-") {
    if (event.ctrlKey && session && !isBusy && canScaleCurrentDocument()) {
      event.preventDefault();
      void changeScale(-0.25);
    }
    return;
  }
  if (event.key === "=" || event.key === "+") {
    if (event.ctrlKey && session && !isBusy && canScaleCurrentDocument()) {
      event.preventDefault();
      void changeScale(0.25);
    }
    return;
  }
  if (!event.ctrlKey || event.altKey || event.shiftKey) {
    return;
  }

  switch (event.key.toLowerCase()) {
    case "o":
      event.preventDefault();
      void openLocalDocument();
      break;
    case "p":
      if (session && !isBusy) {
        event.preventDefault();
        void printDocument();
      }
      break;
    case "b":
      if (session && !isBusy) {
        event.preventDefault();
        toggleReaderNavigation();
      }
      break;
    case "m":
      if (session && !isBusy && canUseContinuousView()) {
        event.preventDefault();
        void setReaderViewMode(readerViewMode === "single" ? "continuous" : "single");
      }
      break;
    case "a":
      if (canSelectCurrentPageText()) {
        event.preventDefault();
        selectCurrentPageText();
      }
      break;
    case "c": {
      const selectedText = window.getSelection()?.toString();
      if (!selectedText && canCopyCurrentPageText()) {
        event.preventDefault();
        void copyCurrentPageText();
      }
      break;
    }
    default:
      break;
  }
}

async function jumpToPageInput() {
  if (!session || isBusy || !pageNumberInput) {
    return;
  }

  const previousPage = currentPage;
  const parsed = parsePageJumpInput(pageNumberInput.value, session.page_count);
  if (!parsed.ok) {
    setActivityFeedback(parsed.message);
    updateMetadata();
    return;
  }

  if (parsed.pageIndex === currentPage) {
    updateMetadata();
    return;
  }

  await withBusy(async () => {
    try {
      await navigateToPage(parsed.pageIndex);
      setDocumentStatus("已打开");
    } catch (error) {
      currentPage = previousPage;
      showError(error);
    }
  });
}

function clearDocumentFind() {
  resetDocumentFindState();
  setActivityFeedback("已清除查找");
  updateMetadata();
}

async function moveDocumentFind(direction: 1 | -1) {
  if (!canUseDocumentFind() || !findQueryInput) {
    return;
  }

  const nextQuery = normalizeDocumentFindQuery(findQueryInput.value);
  if (!nextQuery) {
    clearDocumentFind();
    return;
  }

  isFindingDocument = true;
  updateMetadata();
  try {
    if (nextQuery !== documentFindQuery || documentFindMatches.length === 0) {
      await rebuildDocumentFindMatches();
    }

    if (documentFindMatches.length === 0) {
      setActivityFeedback("未找到匹配内容。");
      updateMetadata();
      return;
    }

    documentFindActiveIndex = nextDocumentFindIndex(documentFindActiveIndex, documentFindMatches.length, direction);
    const match = documentFindMatches[documentFindActiveIndex];
    if (!match) {
      setActivityFeedback("未找到匹配内容。");
      updateMetadata();
      return;
    }

    if (currentPage !== match.pageIndex) {
      await navigateToPage(match.pageIndex);
    }
    if (isTextSession()) {
      scrollTextMatchIntoView(match);
    }
    setActivityFeedback("已定位匹配内容");
  } catch {
    setActivityFeedback("查找失败，请稍后重试。");
    documentFindMatches = [];
    documentFindActiveIndex = -1;
  } finally {
    isFindingDocument = false;
    updateMetadata();
  }
}

async function rerenderAfterScaleChange() {
  if (isContinuousViewActive()) {
    const anchorPage = currentPage;
    await withBusy(async () => {
      const rendered = await renderContinuousPages();
      if (!rendered) {
        return;
      }
      scrollContinuousPageIntoView(anchorPage);
      setDocumentStatus("已打开");
    });
    return;
  }

  if (session?.file_type === "ofd") {
    scheduleOfdScaleRender();
    return;
  }

  await withBusy(async () => {
    try {
      await renderCurrentPage();
    } catch (error) {
      showError(error);
    }
  });
}

async function changeScale(delta: number) {
  if (!session || isBusy) {
    return;
  }

  const nextScale = clampScale(scale + delta);
  if (isSameScale(nextScale, scale)) {
    return;
  }
  scale = nextScale;
  await rerenderAfterScaleChange();
}

async function resetZoom() {
  if (!session || isBusy || isSameScale(scale, 1)) {
    return;
  }

  scale = 1;
  await rerenderAfterScaleChange();
}

async function fitPage(mode: "width" | "page") {
  if (!session || isBusy) {
    return;
  }

  const scaleBase = pageScaleBaseSize();
  const stageSize = stageContentSize();
  if (!scaleBase || !stageSize) {
    return;
  }

  const baseWidth = scaleBase.width;
  const baseHeight = scaleBase.height;
  let availableWidth = stageSize.width;
  let widthScale = availableWidth / baseWidth;
  if (mode === "width" && baseHeight * widthScale > stageSize.height) {
    availableWidth = Math.max(0, availableWidth - scrollbarThickness());
    widthScale = availableWidth / baseWidth;
  }
  const heightScale = stageSize.height / baseHeight;
  const nextScale = mode === "width" ? widthScale : Math.min(widthScale, heightScale, 1);
  const targetScale = roundedScale(nextScale);
  if (isSameScale(targetScale, scale)) {
    return;
  }

  scale = targetScale;
  await rerenderAfterScaleChange();
}

async function rotatePdfView(direction: 1 | -1) {
  if (!canRotatePdfView()) {
    return;
  }

  const previousRotation = pdfViewRotation;
  const nextRotation = nextViewRotation(pdfViewRotation, direction);
  pdfViewRotation = nextRotation;
  try {
    await rerenderAfterScaleChange();
    setActivityFeedback(rotationActivityFeedback(nextRotation));
    updateMetadata();
  } catch (error) {
    pdfViewRotation = previousRotation;
    showError(error);
  }
}

async function resetPdfViewRotation() {
  if (!canRotatePdfView() || pdfViewRotation === 0) {
    return;
  }

  const previousRotation = pdfViewRotation;
  pdfViewRotation = 0;
  try {
    await rerenderAfterScaleChange();
    setActivityFeedback("已重置视图旋转");
    updateMetadata();
  } catch (error) {
    pdfViewRotation = previousRotation;
    showError(error);
  }
}

async function printDocument(request: PrintRequest | null = null) {
  if (!session || isBusy) {
    return;
  }

  await withBusy(async () => {
    const resolvedRequest = request ?? defaultPrintRequest();
    const printPageReady = await preparePrintRequestPages(resolvedRequest);
    if (!printPageReady) {
      return;
    }
    preparePrintForCurrentView(resolvedRequest);
    setActivityFeedback("已发送打印请求");
    updateMetadata();
    preparePrintLayout(resolvedRequest);
    await showWebViewPrintDialog();
  });
}

async function showWebViewPrintDialog() {
  try {
    await invoke("show_webview_print_ui");
  } catch (error) {
    console.warn("Falling back to browser print dialog", error);
    window.print();
  }
}

function defaultPrintRequest(): PrintRequest {
  return {
    pageIndexes: defaultDomPrintPageIndexes(),
    imageFit: "contain",
  };
}

function defaultDomPrintPageIndexes() {
  if (!session || session.file_type !== "pdf" || session.page_count > 200) {
    return [currentPage];
  }
  return Array.from({ length: session.page_count }, (_, index) => index);
}

async function preparePrintRequestPages(request: PrintRequest) {
  if (!session || !isContinuousViewActive()) {
    if (await prepareSelectedPdfPrintPages(request)) {
      return true;
    }
    return true;
  }

  if (await prepareSelectedPdfPrintPages(request)) {
    return true;
  }

  if (session.file_type === "pdf") {
    const printRenderKey = continuousRenderKey();
    if (!hasContinuousPagesForCurrentView() || !hasContinuousPdfWindowForPage(currentPage)) {
      const rendered = await renderContinuousPages();
      if (!rendered) {
        return false;
      }
    }
    await renderContinuousPdfPageWindow(currentPage, printRenderKey);
    return continuousRenderKey() === printRenderKey;
  }

  return true;
}

async function prepareSelectedPdfPrintPages(request: PrintRequest) {
  if (!session || session.file_type !== "pdf" || !activePdfDocument || !printPagesContainer) {
    return false;
  }
  const printsOnlyCurrentPage = request.pageIndexes.length === 1 && request.pageIndexes[0] === currentPage;
  if (printsOnlyCurrentPage) {
    return false;
  }

  printPagesContainer.replaceChildren();
  for (const pageIndex of request.pageIndexes) {
    const pageInfo = session.page_sizes.find((page) => page.index === pageIndex);
    const displaySize = rotatedViewSize({
      width: pageInfo?.width_pt ?? 612,
      height: pageInfo?.height_pt ?? 792,
    }, pdfViewRotation);
    const printPage = document.createElement("section");
    printPage.className = "print-page";
    printPage.dataset.pageIndex = String(pageIndex);
    printPage.dataset.printOrientation = displaySize.width >= displaySize.height ? "landscape" : "portrait";

    const surface = document.createElement("div");
    surface.className = "print-page-surface";
    surface.style.setProperty("--ldv-page-print-width", String(Math.max(1, Math.round(displaySize.width))));
    surface.style.setProperty("--ldv-page-print-height", String(Math.max(1, Math.round(displaySize.height))));

    const canvas = document.createElement("canvas");
    canvas.className = "print-page-canvas";
    surface.append(canvas);
    printPage.append(surface);
    printPagesContainer.append(printPage);
    await activePdfDocument.renderPageToCanvas(pageIndex, canvas, 1, pdfViewRotation);
  }

  printPagesContainer.hidden = false;
  document.body.dataset.printSelectedPages = "true";
  return true;
}

function preparePrintForCurrentView(request: PrintRequest) {
  if (request.pageIndexes.length > 1) {
    setActivityFeedback(`将打印 ${request.pageIndexes.length} 页。`);
    return true;
  }
  if (isContinuousViewActive()) {
    setActivityFeedback("连续阅读模式下将打印当前页。");
    return true;
  }
  return false;
}

function preparePrintLayout(request: PrintRequest) {
  document.body.dataset.printImageFit = request.imageFit;
  if (document.body.dataset.printSelectedPages === "true") {
    return;
  }
  if (isContinuousViewActive()) {
    prepareContinuousPrintLayout();
    return;
  }

  applyPrintBodyState(singlePagePrintState({
    pageOrientation: pageSurface?.dataset.printOrientation,
    documentMode: pageSurface?.dataset.documentMode,
    viewRotation: pdfViewRotation,
  }));
}

function prepareContinuousPrintLayout() {
  for (const slot of continuousPagesContainer?.querySelectorAll<HTMLElement>(".continuous-page-slot") ?? []) {
    delete slot.dataset.currentPrintPage;
  }

  const slot = continuousPagesContainer?.querySelector<HTMLElement>(`.continuous-page-slot[data-page-index="${currentPage}"]`);
  const printSize = pageScaleBaseSize();
  if (slot && printSize) {
    slot.dataset.currentPrintPage = "true";
    slot.style.setProperty("--ldv-page-print-width", String(Math.max(1, Math.round(printSize.width))));
    slot.style.setProperty("--ldv-page-print-height", String(Math.max(1, Math.round(printSize.height))));
  }
  applyPrintBodyState(continuousPrintState({
    pageSize: printSize,
    viewRotation: pdfViewRotation,
  }));
}

function applyPrintBodyState(state: PrintBodyState) {
  document.body.dataset.printOrientation = state.printOrientation;
  document.body.dataset.printDocumentMode = state.printDocumentMode;
  if (state.printViewMode) {
    document.body.dataset.printViewMode = state.printViewMode;
  } else {
    delete document.body.dataset.printViewMode;
  }
  document.body.dataset.viewRotation = state.viewRotation;
}

function cleanupPrintLayout() {
  for (const slot of continuousPagesContainer?.querySelectorAll<HTMLElement>(".continuous-page-slot") ?? []) {
    delete slot.dataset.currentPrintPage;
  }
  printPagesContainer?.replaceChildren();
  if (printPagesContainer) {
    printPagesContainer.hidden = true;
  }
  delete document.body.dataset.printOrientation;
  delete document.body.dataset.printDocumentMode;
  delete document.body.dataset.printViewMode;
  delete document.body.dataset.printSelectedPages;
  delete document.body.dataset.printImageFit;
  delete document.body.dataset.viewRotation;
}

async function copyCurrentPageText() {
  if (!canCopyCurrentPageText() || !session) {
    return;
  }

  try {
    let text = "";
    if (session.file_type === "pdf") {
      const pdfDocument = activePdfDocument;
      if (!pdfDocument) {
        return;
      }
      const selectedText = selectedPdfText();
      text = selectedText ?? (await pdfDocument.getPageText(currentPage)).trim();
    } else if (session.file_type === "ofd") {
      text = await currentOfdPageText();
    } else if (isTextFileType(session.file_type)) {
      text = selectedTextPreviewText() ?? currentTextDocumentText;
    }

    if (!text) {
      setActivityFeedback("当前页没有可复制文本。");
      updateMetadata();
      return;
    }
    await navigator.clipboard.writeText(text);
    setActivityFeedback("本页文字已复制");
  } catch {
    setActivityFeedback("无法复制本页文字，请稍后重试。");
  }
  updateMetadata();
}

async function toggleOfficePreviewLayout() {
  if (!canToggleOfficePreviewLayout() || !currentOfficePreview) {
    return;
  }

  const nextLayout = nextOfficePreviewLayout(currentOfficePreview.layout);
  await openOfficePreviewPdf({
    ...currentOfficePreview,
    layout: nextLayout,
  }, async () => {
    if (nextLayout === "fit_width_preview") {
      setActivityFeedback("已切换为适宽预览");
    } else {
      setActivityFeedback("已切换为原版预览");
    }
    updateMetadata();
  });
}

function restorePrintStatus() {
  cleanupPrintLayout();
  if (!session || currentActivityFeedback !== "已发送打印请求") {
    return;
  }

  clearActivityFeedback();
  setDocumentStatus("已打开");
  updateMetadata();
}

openLocalDocumentButton?.addEventListener("click", openLocalDocument);
railOpenLocalDocumentButton?.addEventListener("click", openLocalDocument);
previousButton?.addEventListener("click", () => movePage(-1));
nextButton?.addEventListener("click", () => movePage(1));
pageNumberInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void jumpToPageInput();
  }
});
jumpPageButton?.addEventListener("click", jumpToPageInput);
pageStage?.addEventListener("wheel", handlePageStageWheel, { passive: false });
window.addEventListener("keydown", handleReaderCommandShortcut);
window.addEventListener("keydown", handleReaderKeyboardNavigation);
zoomOutButton?.addEventListener("click", () => changeScale(-0.25));
zoomInButton?.addEventListener("click", () => changeScale(0.25));
resetZoomButton?.addEventListener("click", resetZoom);
fitWidthButton?.addEventListener("click", () => fitPage("width"));
fitPageButton?.addEventListener("click", () => fitPage("page"));
singlePageViewButton?.addEventListener("click", () => {
  void setReaderViewMode("single");
});
continuousPageViewButton?.addEventListener("click", () => {
  void setReaderViewMode("continuous");
});
moreReaderToolsButton?.addEventListener("click", toggleReaderToolsMenu);
closeReaderToolsMenuButton?.addEventListener("click", closeReaderToolsMenu);
for (const button of settingsPanelButtons) {
  button.addEventListener("click", toggleSettingsPanel);
}
closeSettingsPanelButton?.addEventListener("click", closeSettingsPanel);
for (const button of helpPanelButtons) {
  button.addEventListener("click", toggleHelpPanel);
}
closeHelpPanelButton?.addEventListener("click", closeHelpPanel);
for (const option of ofdPageLimitOptions) {
  option.addEventListener("change", () => {
    if (option.checked) {
      setOfdPageLimitPreset(option.value as OfdPageLimitPresetId);
    }
  });
}
for (const option of appearanceThemeOptions) {
  option.addEventListener("change", () => {
    if (option.checked) {
      setAppearanceThemePreference(option.value as AppearanceThemePreference);
    }
  });
}
for (const option of appLanguageOptions) {
  option.addEventListener("change", () => {
    if (option.checked) {
      setAppLanguagePreference(option.value as AppLanguagePreference);
    }
  });
}
systemDarkThemeQuery.addEventListener("change", syncAppearanceThemeControls);
checkUpdatesActionButton?.addEventListener("click", showUpdateCheckUnavailable);
openFeedbackIssuesButton?.addEventListener("click", () => {
  void openFeedbackIssues().catch(() => {
    if (feedbackIssuesStatus) {
      feedbackIssuesStatus.textContent = "无法打开反馈入口";
      feedbackIssuesStatus.classList.remove("is-ok");
      feedbackIssuesStatus.classList.add("is-error");
    }
    setActivityFeedback("无法打开反馈入口");
    updateMetadata();
  });
});
officeConverterExeInput?.addEventListener("change", () => {
  saveOfficeConverterExePreference();
  setOfficeConverterTestStatus("idle");
});
testOfficeConverterExeButton?.addEventListener("click", () => {
  void testOfficeConverterExePreference();
});
officeLayoutPreviewButton?.addEventListener("click", toggleOfficePreviewLayout);
rotateViewLeftButton?.addEventListener("click", () => rotatePdfView(-1));
rotateViewRightButton?.addEventListener("click", () => rotatePdfView(1));
resetViewRotationButton?.addEventListener("click", resetPdfViewRotation);
selectCurrentPageTextButton?.addEventListener("click", selectCurrentPageText);
copyCurrentPageTextButton?.addEventListener("click", copyCurrentPageText);
focusReadingModeButton?.addEventListener("click", toggleFocusReadingMode);
railFocusReadingModeButton?.addEventListener("click", toggleFocusReadingMode);
findQueryInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void moveDocumentFind(event.shiftKey ? -1 : 1);
  }
});
findQueryInput?.addEventListener("input", () => {
  if (normalizeDocumentFindQuery(findQueryInput.value) !== documentFindQuery) {
    documentFindQuery = "";
    documentFindMatches = [];
    documentFindActiveIndex = -1;
  }
  updateMetadata();
});
findPreviousButton?.addEventListener("click", () => moveDocumentFind(-1));
findNextButton?.addEventListener("click", () => moveDocumentFind(1));
clearFindButton?.addEventListener("click", clearDocumentFind);
printDocumentButton?.addEventListener("click", () => {
  void printDocument();
});
window.addEventListener("afterprint", restorePrintStatus);
activityFeedback?.addEventListener("pointerdown", startActivityFeedbackDrag);
errorDiagnosticOverlay?.addEventListener("pointerdown", startErrorDiagnosticOverlayDrag);
collapseDocumentCenterButton?.addEventListener("click", () => setDocumentCenterCollapsed(true));
expandDocumentCenterButton?.addEventListener("click", () => setDocumentCenterCollapsed(false));
documentCenterResizer?.addEventListener("pointerdown", startDocumentCenterResize);
toggleReaderNavigationButton?.addEventListener("click", toggleReaderNavigation);
closeReaderNavigationButton?.addEventListener("click", closeReaderNavigation);
decreaseReaderNavigationFontButton?.addEventListener("click", decreaseReaderNavigationFont);
increaseReaderNavigationFontButton?.addEventListener("click", increaseReaderNavigationFont);
readerNavigationResizer?.addEventListener("pointerdown", startReaderNavigationResize);
window.addEventListener("resize", () => {
  setDocumentCenterWidth(documentCenterWidth);
  setDocumentCenterCollapsed(isDocumentCenterCollapsed);
  setReaderNavigationWidth(readerNavigationWidth);
  updateReaderNavigationPanel();
  syncActivityFeedbackPosition();
  syncErrorDiagnosticOverlayPosition();
});
refreshRecentFilesButton?.addEventListener("click", loadRecentFiles);
clearRecentFilesButton?.addEventListener("click", clearRecentFiles);
clearRenderCacheButton?.addEventListener("click", clearRenderCache);
copyDiagnosticInfoButton?.addEventListener("click", copyDiagnosticInfo);
closeErrorDiagnosticOverlayButton?.addEventListener("click", dismissErrorDiagnosticOverlay);
recentFilesEnabled?.addEventListener("change", () => setRecentFilesEnabled(recentFilesEnabled.checked));

async function initializeReader() {
  loadAppearanceThemePreference();
  loadAppLanguagePreference();
  syncOfficeConverterPathHint();
  loadOfficeConverterExePreference();
  createIcons({ icons });
  setDocumentCenterWidth(defaultDocumentCenterWidth);
  setDocumentCenterCollapsed(false);
  setReaderNavigationWidth(defaultReaderNavigationWidth);
  await loadRecentFiles();
  await openStartupDocumentPath();
}

updateMetadata();
renderRecentFiles();
void initializeReader();
