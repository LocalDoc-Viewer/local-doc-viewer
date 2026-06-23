import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");

function readIndexHtml() {
  return readFileSync(resolve(desktopRoot, "index.html"), "utf8");
}

function readMainTs() {
  return readFileSync(resolve(desktopRoot, "src", "main.ts"), "utf8");
}

function readFile(path) {
  return readFileSync(resolve(desktopRoot, path), "utf8");
}

function readStylesCss() {
  return readFileSync(resolve(desktopRoot, "src", "styles.css"), "utf8");
}

function readDocumentTypesTs() {
  return readFileSync(resolve(desktopRoot, "src", "documentTypes.ts"), "utf8");
}

function readOverlayPositionTs() {
  return readFileSync(resolve(desktopRoot, "src", "overlayPosition.ts"), "utf8");
}

function readReaderNavigationStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerNavigationState.ts"), "utf8");
}

function readReaderActionStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerActionState.ts"), "utf8");
}

function readReaderDocumentCenterStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerDocumentCenterState.ts"), "utf8");
}

function readReaderNavigationControlsStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerNavigationControlsState.ts"), "utf8");
}

function readReaderLayoutStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerLayoutState.ts"), "utf8");
}

function readReaderScaleStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerScaleState.ts"), "utf8");
}

function readReaderToolbarStateTs() {
  return readFileSync(resolve(desktopRoot, "src", "readerToolbarState.ts"), "utf8");
}

function readDocumentCoreRs() {
  return readFileSync(resolve(desktopRoot, "src-tauri", "src", "document_core.rs"), "utf8");
}

function readPdfAdapterTs() {
  const adapterPath = resolve(desktopRoot, "src", "pdf", "pdfjsAdapter.ts");
  return existsSync(adapterPath) ? readFileSync(adapterPath, "utf8") : "";
}

function readPdfOutlineTs() {
  const outlinePath = resolve(desktopRoot, "src", "pdf", "pdfOutline.ts");
  return existsSync(outlinePath) ? readFileSync(outlinePath, "utf8") : "";
}

function readPdfErrorMappingTs() {
  const mappingPath = resolve(desktopRoot, "src", "pdf", "pdfErrorMapping.ts");
  return existsSync(mappingPath) ? readFileSync(mappingPath, "utf8") : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("reader surface keeps only product-facing document controls", () => {
  const html = readIndexHtml();

  assert.match(html, /id="open-local-document"/);
  assert.doesNotMatch(html, /id="open-local-ofd"/);
  assert.doesNotMatch(html, /id="open-document"/);
  assert.doesNotMatch(html, /id="open-public-sample"/);
  assert.doesNotMatch(html, />打开假文档</);
  assert.doesNotMatch(html, />打开公开样本</);
});

test("reader open entry is format-neutral for supported document formats", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, />打开文档</);
  assert.match(html, />文档阅读器</);
  assert.doesNotMatch(html, />OFD 阅读器</);
  assert.match(source, /async function openLocalDocument\(\)/);
  const filterMatch = source.match(/filters:\s*\[\{[\s\S]*?extensions:\s*\[([^\]]+)\]/);

  assert.ok(filterMatch, "open dialog filter should exist");
  for (const extension of ["ofd", "pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps", "txt", "log", "csv", "md"]) {
    assert.match(filterMatch[1], new RegExp(`"${extension}"`));
  }
  assert.doesNotMatch(source, /const openLocalOfdButton/);
});

test("reader toolbar exposes single and continuous view mode controls", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();

  assert.match(html, /id="single-page-view"/);
  assert.match(html, /id="continuous-page-view"/);
  assert.match(html, /id="single-page-view"[\s\S]*aria-pressed="true"/);
  assert.match(source, /type ReaderViewMode,\s*}\s*from "\.\/readerViewModeState"/);
  assert.match(source, /let readerViewMode: ReaderViewMode = "single"/);
  assert.match(source, /function setReaderViewMode\(mode: ReaderViewMode\)/);
  assert.match(css, /\.view-mode-toggle\s*{/);
});

test("continuous view is restricted to paged documents and resets for text and image", () => {
  const source = readMainTs();

  assert.match(source, /function canUseContinuousView\(\)/);
  assert.match(source, /session\.file_type === "pdf"/);
  assert.match(source, /session\.file_type === "ofd" && canUseOfdContinuousViewForPreset\(ofdPageLimitPresetId\)/);
  assert.match(source, /\|\| !!currentOfficePreview/);
  assert.match(source, /function resetReaderViewModeForDocument\(\)/);
  assert.match(source, /readerViewModeForRequest\(\{/);
  assert.match(source, /readerViewModeAfterDocumentOpen\(\{/);
  assert.doesNotMatch(source, /if \(!canUseContinuousView\(\)\) \{\s*readerViewMode = "single";\s*}/s);
  assert.match(source, /resetReaderViewModeForDocument\(\);\s*await renderCurrentPage\(\)/);
  assert.match(source, /resetReaderViewModeForDocument\(\);\s*renderTextDocument\(view\)/);
  assert.match(source, /resetReaderViewModeForDocument\(\);\s*renderImageDocument\(view\)/);
});

test("continuous view renders page slots for paged documents", () => {
  const source = readMainTs();
  const css = readStylesCss();

  assert.match(source, /function continuousPageIndexes\(pageCount: number\)/);
  assert.match(source, /for \(let pageIndex = 0; pageIndex < pageCount; pageIndex \+= 1\)/);
  assert.match(source, /async function renderContinuousPages\(\)/);
  assert.match(source, /className = "continuous-pages"/);
  assert.match(source, /className = "continuous-page-slot"/);
  assert.match(source, /renderContinuousPageSlot\(pageIndex, slot, renderKey\)/);
  assert.match(css, /\.page-stage\[data-view-mode="continuous"\]/);
  assert.match(css, /\.continuous-pages\s*{/);
  assert.match(css, /\.continuous-page-slot\s*{/);
});

test("continuous view renders each page slot only once per pass", () => {
  const source = readMainTs();
  const renderStart = source.indexOf("async function renderContinuousPagedDocument");
  const renderEnd = source.indexOf("function syncCurrentPageFromContinuousScroll", renderStart);

  assert.notEqual(renderStart, -1, "renderContinuousPagedDocument block should start");
  assert.notEqual(renderEnd, -1, "renderContinuousPages block should end before scroll sync");
  const renderBlock = source.slice(renderStart, renderEnd);
  const slotRenderCalls = renderBlock.match(/await renderContinuousPageSlot\(pageIndex, slot, renderKey\)/g) ?? [];
  assert.equal(slotRenderCalls.length, 1);
});

test("continuous page slots render PDF canvases and OFD images through existing adapters", () => {
  const source = readMainTs();

  assert.match(source, /async function renderContinuousPdfPageSlot\(\s*pageIndex: number,\s*slot: HTMLElement,\s*renderRequestId: number,\s*renderSessionId: string,\s*renderKey: string,/);
  assert.match(source, /activePdfDocument\.renderPageToCanvas\(pageIndex, canvas, scale, pdfViewRotation\)/);
  assert.match(source, /activePdfDocument\.renderPageTextLayer\(pageIndex, textLayer, scale, pdfViewRotation\)/);
  assert.match(source, /if \(!isContinuousRenderRequestCurrent\(renderRequestId, renderSessionId, renderKey\)\)/);
  assert.match(source, /slot\.dataset\.renderState = "rendered"/);
  assert.match(source, /async function renderContinuousOfdPageSlot\(\s*pageIndex: number,\s*slot: HTMLElement,\s*renderKey: string,\s*\)/);
  assert.match(source, /renderLocalOfdPage\(session\.id, pageIndex, scale/);
  assert.match(source, /image\.src = convertFileSrc\(bitmap\.image_ref\)/);
  assert.match(source, /if \(session\.file_type === "pdf"\)/);
  assert.match(source, /if \(session\.file_type === "ofd"\)/);
});

test("PDF continuous view renders a window of slots with spacer height", () => {
  const source = readMainTs();
  const pdfRenderStart = source.indexOf("async function renderContinuousPdfPages");
  const pdfRenderEnd = source.indexOf("async function renderContinuousOfdPageSlot", pdfRenderStart);
  const pdfRenderBlock = source.slice(pdfRenderStart, pdfRenderEnd);
  const pdfSlotStart = source.indexOf("async function renderContinuousPdfPageSlot");
  const pdfSlotEnd = source.indexOf("function resetContinuousPdfPageSlot", pdfSlotStart);
  const pdfSlotBlock = source.slice(pdfSlotStart, pdfSlotEnd);
  const estimateStart = source.indexOf("function estimatedContinuousPageIndexFromScroll");
  const estimateEnd = source.indexOf("function runContinuousScrollSync", estimateStart);
  const estimateBlock = source.slice(estimateStart, estimateEnd);

  assert.match(source, /pdfContinuousRenderWindowPlan/);
  assert.match(source, /pdfContinuousPageLayout/);
  assert.match(source, /pdfContinuousPageSizeIndex/);
  assert.match(source, /let pdfContinuousPageLayoutCache:/);
  assert.match(source, /function currentPdfContinuousPageLayout\(\)/);
  assert.match(source, /function pdfContinuousPageSizesForCurrentView\(\)/);
  assert.match(source, /rotatedViewSize\(\{ width: page\.width_pt, height: page\.height_pt \}, pdfViewRotation\)/);
  assert.match(source, /async function renderContinuousPdfPages\(/);
  assert.match(pdfRenderBlock, /layout: currentPdfContinuousPageLayout\(\)/);
  assert.match(pdfRenderBlock, /pageSizeIndex: currentPdfContinuousPageSizeIndex\(\)/);
  assert.match(pdfSlotBlock, /currentPdfContinuousPageSizeIndex\(\)\?\.get\(pageIndex\)/);
  assert.match(pdfSlotBlock, /const displaySize = pageInfo\s*\?\s*\{\s*width: pageInfo\.width_pt \* scale,\s*height: pageInfo\.height_pt \* scale,\s*}\s*:\s*rotatedViewSize\(/s);
  assert.doesNotMatch(pdfSlotBlock, /rotatedViewSize\(\s*\{\s*width:\s*\(pageInfo\?\.width_pt/s);
  assert.doesNotMatch(pdfSlotBlock, /session\.page_sizes\.find/);
  assert.match(estimateBlock, /layout: currentPdfContinuousPageLayout\(\)/);
  assert.match(estimateBlock, /pageSizeIndex: currentPdfContinuousPageSizeIndex\(\)/);
  assert.match(source, /className = "continuous-page-spacer"/);
  assert.match(source, /spacer\.style\.height = `\$\{height\}px`/);
  assert.match(source, /function appendContinuousPageSpacer\(/);
  assert.match(source, /container\.dataset\.windowStartPage = String\(windowPlan\.startPageIndex\)/);
  assert.match(source, /container\.dataset\.windowEndPage = String\(windowPlan\.endPageIndex\)/);
  assert.doesNotMatch(source, /continuousPagesContainer\.querySelectorAll\("\\.continuous-page-slot"\)\.length === session\.page_count/);
  assert.match(readStylesCss(), /\.continuous-page-spacer\s*{[^}]*flex:\s*0 0 auto;[^}]*pointer-events:\s*none;/s);
  assert.match(source, /observeLazyContinuousPdfSlots\(renderRequestId, renderSessionId, renderKey\)/);
  assert.match(source, /function observeLazyContinuousPdfSlots\(/);
  assert.match(source, /new IntersectionObserver\(\(entries\) => \{/);
  assert.match(source, /rootMargin: "900px 0px"/);
  assert.match(source, /queueLazyContinuousPdfPages\(/);
  assert.match(source, /pdfContinuousRenderQueuePlan\(/);
  assert.match(source, /async function drainLazyContinuousPdfQueue\(/);
  assert.doesNotMatch(source, /void renderContinuousPdfPageSlot\(pageIndex, slot, renderKey\)/);
});

test("PDF continuous view recycles far rendered slots and prioritizes far-page navigation", () => {
  const source = readMainTs();
  const navigateStart = source.indexOf("async function navigateToPage");
  const navigateEnd = source.indexOf("function hasTextPreviewContent", navigateStart);
  const scrollSyncStart = source.indexOf("function syncCurrentPageFromContinuousScroll");
  const scrollSyncEnd = source.indexOf("function scrollTextMatchIntoView", scrollSyncStart);
  const recycleStart = source.indexOf("function recycleFarContinuousPdfPages");
  const recycleEnd = source.indexOf("async function renderContinuousPdfPageWindow", recycleStart);
  const pdfWindowStart = source.indexOf("async function renderContinuousPdfPageWindow");
  const pdfWindowEnd = source.indexOf("function ensureContinuousPdfPageWindow", pdfWindowStart);
  const lazyQueueStart = source.indexOf("async function drainLazyContinuousPdfQueue");
  const lazyQueueEnd = source.indexOf("function observeLazyContinuousPdfSlots", lazyQueueStart);

  assert.notEqual(navigateStart, -1, "navigateToPage block should start");
  assert.notEqual(navigateEnd, -1, "navigateToPage block should end");
  assert.notEqual(scrollSyncStart, -1, "syncCurrentPageFromContinuousScroll block should start");
  assert.notEqual(scrollSyncEnd, -1, "syncCurrentPageFromContinuousScroll block should end");
  assert.notEqual(recycleStart, -1, "recycleFarContinuousPdfPages block should start");
  assert.notEqual(recycleEnd, -1, "recycleFarContinuousPdfPages block should end");
  assert.notEqual(pdfWindowStart, -1, "renderContinuousPdfPageWindow block should start");
  assert.notEqual(pdfWindowEnd, -1, "renderContinuousPdfPageWindow block should end");
  assert.notEqual(lazyQueueStart, -1, "drainLazyContinuousPdfQueue block should start");
  assert.notEqual(lazyQueueEnd, -1, "drainLazyContinuousPdfQueue block should end");
  const navigateBlock = source.slice(navigateStart, navigateEnd);
  const scrollSyncBlock = source.slice(scrollSyncStart, scrollSyncEnd);
  const recycleBlock = source.slice(recycleStart, recycleEnd);
  const pdfWindowBlock = source.slice(pdfWindowStart, pdfWindowEnd);
  const lazyQueueBlock = source.slice(lazyQueueStart, lazyQueueEnd);

  assert.match(source, /let continuousPdfRenderedPageIndexes = new Set<number>\(\)/);
  assert.match(source, /let continuousPdfPageSlots = new Map<number, HTMLElement>\(\)/);
  assert.match(source, /function continuousPageSlotForIndex\(pageIndex: number\)/);
  assert.match(source, /function recycleFarContinuousPdfPages\(/);
  assert.match(source, /function ensureContinuousPdfPageWindow\(/);
  assert.match(source, /async function renderContinuousPdfPageWindow\(/);
  assert.match(source, /pdfContinuousPagesToRecycle\(/);
  assert.match(source, /continuousPdfPageSlots = nextPageSlots/);
  assert.match(recycleBlock, /renderedPageIndexes: \[\.\.\.continuousPdfRenderedPageIndexes\]/);
  assert.match(recycleBlock, /continuousPageSlotForIndex\(pageIndex\)/);
  assert.doesNotMatch(recycleBlock, /querySelectorAll/);
  assert.doesNotMatch(recycleBlock, /querySelector<HTMLElement>/);
  assert.match(pdfWindowBlock, /continuousPageSlotForIndex\(pageIndex\)/);
  assert.doesNotMatch(pdfWindowBlock, /querySelector<HTMLElement>/);
  assert.match(lazyQueueBlock, /continuousPageSlotForIndex\(pageIndex\)/);
  assert.doesNotMatch(lazyQueueBlock, /querySelector<HTMLElement>/);
  assert.match(source, /void renderContinuousPdfPageWindow\(centerPageIndex, renderKey\)\.catch\(\(\) => undefined\)/);
  assert.match(navigateBlock, /await renderContinuousPdfPageWindow\(targetPageIndex, targetRenderKey\)/);
  assert.match(navigateBlock, /recycleFarContinuousPdfPages\(targetPageIndex\)/);
  assert.match(scrollSyncBlock, /ensureContinuousPdfPageWindow\(nextPage\)/);
  assert.match(scrollSyncBlock, /recycleFarContinuousPdfPages\(nextPage\)/);
});

test("OFD continuous view creates all slots but only renders nearby pages immediately", () => {
  const source = readMainTs();

  assert.match(source, /ofdContinuousRenderPlan/);
  assert.match(source, /function renderContinuousOfdPages/);
  assert.match(source, /for \(const slotPlan of ofdContinuousRenderPlan\(\{/);
  assert.match(source, /if \(slotPlan\.shouldRenderNow\) \{/);
  assert.match(source, /await renderContinuousOfdPageSlot\(slotPlan\.pageIndex, slot, renderKey\)/);
  assert.match(source, /observeLazyContinuousOfdSlots\(renderRequestId, renderSessionId, renderKey\)/);
  const ofdRenderStart = source.indexOf("async function renderContinuousOfdPages");
  const ofdRenderEnd = source.indexOf("async function renderContinuousPagedDocument", ofdRenderStart);
  assert.notEqual(ofdRenderStart, -1, "renderContinuousOfdPages block should start");
  assert.notEqual(ofdRenderEnd, -1, "renderContinuousOfdPages block should end");
  const ofdRenderBlock = source.slice(ofdRenderStart, ofdRenderEnd);
  assert.doesNotMatch(ofdRenderBlock, /continuousPageIndexes\(session\.page_count\)/);
  assert.doesNotMatch(ofdRenderBlock, /await renderContinuousPageSlot\(pageIndex, slot\)/);
  assert.match(source, /if \(!isContinuousRenderRequestCurrent\(renderRequestId, renderSessionId, renderKey\)\) \{/);
});

test("OFD continuous view renders the target page window before far-page navigation", () => {
  const source = readMainTs();
  const windowStart = source.indexOf("async function renderContinuousOfdPageWindow");
  const windowEnd = source.indexOf("async function navigateToPage", windowStart);
  const navigateStart = source.indexOf("async function navigateToPage");
  const navigateEnd = source.indexOf("function hasTextPreviewContent", navigateStart);

  assert.notEqual(windowStart, -1, "renderContinuousOfdPageWindow block should start");
  assert.notEqual(windowEnd, -1, "renderContinuousOfdPageWindow block should end");
  assert.notEqual(navigateStart, -1, "navigateToPage block should start");
  assert.notEqual(navigateEnd, -1, "navigateToPage block should end");
  const windowBlock = source.slice(windowStart, windowEnd);
  const navigateBlock = source.slice(navigateStart, navigateEnd);
  assert.match(source, /async function renderContinuousOfdPageWindow\(\s*centerPageIndex: number,\s*renderKey: string,\s*\)/);
  assert.match(windowBlock, /ofdContinuousRenderPlan\(\{[\s\S]*currentPageIndex: centerPageIndex/);
  assert.match(windowBlock, /if \(!session \|\| session\.file_type !== "ofd" \|\| !continuousPagesContainer \|\| continuousRenderKey\(\) !== renderKey\)/);
  assert.match(windowBlock, /if \(continuousRenderKey\(\) !== renderKey\) \{[\s\S]*return;[\s\S]*\}[\s\S]*await renderContinuousOfdPageSlot\(slotPlan\.pageIndex, slot, renderKey\)/);
  assert.match(navigateBlock, /currentPage = targetPageIndex/);
  assert.match(navigateBlock, /const targetRenderKey = continuousRenderKey\(\)/);
  assert.match(navigateBlock, /await renderContinuousOfdPageWindow\(targetPageIndex, targetRenderKey\)/);
  assert.match(navigateBlock, /if \(continuousRenderKey\(\) !== targetRenderKey\) \{[\s\S]*return;[\s\S]*\}[\s\S]*scrollContinuousPageIntoView\(targetPageIndex\)/);
});

test("OFD continuous page slot render does not write stale page images", () => {
  const source = readMainTs();
  const slotStart = source.indexOf("async function renderContinuousOfdPageSlot");
  const slotEnd = source.indexOf("function observeLazyContinuousOfdSlots", slotStart);

  assert.notEqual(slotStart, -1, "renderContinuousOfdPageSlot block should start");
  assert.notEqual(slotEnd, -1, "renderContinuousOfdPageSlot block should end");
  const slotBlock = source.slice(slotStart, slotEnd);
  assert.match(source, /async function renderContinuousOfdPageSlot\(\s*pageIndex: number,\s*slot: HTMLElement,\s*renderKey: string,\s*\)/);
  assert.match(slotBlock, /const renderStartedAt = performance\.now\(\)/);
  assert.match(slotBlock, /const bitmap = await renderLocalOfdPage\(session\.id, pageIndex, scale, \{[\s\S]*updateVisibleStatus: false,[\s\S]*onRendered: \(renderedBitmap\) => \{[\s\S]*if \(continuousRenderKey\(\) === renderKey\) \{[\s\S]*recordOfdRenderPerformance\(renderStartedAt, renderedBitmap\.duration_ms\);[\s\S]*\}[\s\S]*\},[\s\S]*\}\)/);
  assert.match(slotBlock, /if \(continuousRenderKey\(\) !== renderKey\) \{[\s\S]*slot\.dataset\.renderState = "stale";[\s\S]*return;[\s\S]*}/);
  assert.match(slotBlock, /if \(continuousRenderKey\(\) !== renderKey\) \{[\s\S]*return;[\s\S]*}[\s\S]*slot\.replaceChildren\(\)/);
  assert.match(source, /renderContinuousOfdPageSlot\(slotPlan\.pageIndex, slot, renderKey\)/);
  assert.match(source, /renderContinuousOfdPageSlot\(pageIndex, slot, renderKey\)/);
  assert.doesNotMatch(slotBlock, /renderContinuousOfdPageSlot\(pageIndex, slot, continuousRenderKey\(\)\)/);
});

test("continuous view page navigation scrolls to target pages", () => {
  const source = readMainTs();
  const navigateStart = source.indexOf("async function navigateToPage");
  const navigateEnd = source.indexOf("function hasTextPreviewContent", navigateStart);

  assert.notEqual(navigateStart, -1, "navigateToPage block should start");
  assert.notEqual(navigateEnd, -1, "navigateToPage block should end");
  const navigateBlock = source.slice(navigateStart, navigateEnd);
  assert.match(source, /function isContinuousViewActive\(\)/);
  assert.match(source, /async function navigateToPage\(pageIndex: number\)/);
  assert.match(source, /async function setReaderViewMode\(mode: ReaderViewMode\)/);
  assert.match(source, /await renderCurrentPage\(\)/);
  assert.match(source, /function continuousRenderKey\(\)/);
  assert.match(source, /function hasContinuousPagesForCurrentView\(\)/);
  assert.match(navigateBlock, /if \(isContinuousViewActive\(\)/);
  assert.match(navigateBlock, /currentPage = targetPageIndex/);
  assert.match(navigateBlock, /if \(!hasContinuousPagesForCurrentView\(\)/);
  assert.match(navigateBlock, /const rendered = await renderContinuousPages\(\)/);
  assert.match(navigateBlock, /await renderContinuousOfdPageWindow\(targetPageIndex, targetRenderKey\)/);
  assert.match(navigateBlock, /scrollContinuousPageIntoView\(targetPageIndex\)/);
  assert.match(source, /function scrollContinuousPageIntoView\(pageIndex: number\)/);
  assert.match(source, /slot\.scrollIntoView\(\{ block: "center", inline: "nearest" }\)/);
  assert.match(source, /await navigateToPage\(Math\.min\(Math\.max\(currentPage \+ delta, 0\), session!\.page_count - 1\)\)/);
  assert.match(source, /await navigateToPage\(parsed\.pageIndex\)/);
  assert.match(source, /await navigateToPage\(match\.pageIndex\)/);
});

test("continuous view updates current page from visible scroll position", () => {
  const source = readMainTs();
  const scrollSyncStart = source.indexOf("function syncCurrentPageFromContinuousScroll");
  const scrollSyncEnd = source.indexOf("function runContinuousScrollSync", scrollSyncStart);
  const scrollSyncBlock = source.slice(scrollSyncStart, scrollSyncEnd);
  const runSyncStart = source.indexOf("function runContinuousScrollSync");
  const runSyncEnd = source.indexOf("function scrollTextMatchIntoView", runSyncStart);
  const runSyncBlock = source.slice(runSyncStart, runSyncEnd);

  assert.match(source, /function syncCurrentPageFromContinuousScroll\(\)/);
  assert.match(source, /let continuousScrollSyncFrame: number \| null = null;/);
  assert.match(scrollSyncBlock, /requestAnimationFrame\(\(\) => \{/);
  assert.doesNotMatch(scrollSyncBlock, /querySelectorAll<HTMLElement>\("\.continuous-page-slot"\)/);
  assert.match(source, /function runContinuousScrollSync\(\)/);
  assert.match(source, /cancelAnimationFrame\(continuousScrollSyncFrame\)/);
  assert.match(source, /function visibleContinuousPageIndexFromPoint\(/);
  assert.match(runSyncBlock, /visibleContinuousPageIndexFromPoint\(/);
  assert.match(source, /document\.elementFromPoint\(/);
  assert.doesNotMatch(runSyncBlock, /querySelectorAll<HTMLElement>\("\.continuous-page-slot"\)/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /currentPage = nextPage/);
  assert.match(source, /pageStage\.addEventListener\("scroll", syncCurrentPageFromContinuousScroll\)/);
  assert.match(source, /pageStage\?\.removeEventListener\("scroll", syncCurrentPageFromContinuousScroll\)/);
});

test("PDF continuous scroll sync repairs a missing current-page window after scrollbar drags", () => {
  const source = readMainTs();
  const runSyncStart = source.indexOf("function runContinuousScrollSync");
  const runSyncEnd = source.indexOf("function scrollTextMatchIntoView", runSyncStart);
  const runSyncBlock = source.slice(runSyncStart, runSyncEnd);

  assert.notEqual(runSyncStart, -1, "runContinuousScrollSync block should start");
  assert.notEqual(runSyncEnd, -1, "runContinuousScrollSync block should end");
  assert.match(runSyncBlock, /const pdfWindowMissing = session\.file_type === "pdf" && !hasContinuousPdfWindowForPage\(nextPage\)/);
  assert.match(runSyncBlock, /if \(nextPage !== currentPage \|\| pdfWindowMissing \|\| pdfWindowNearEdge\)/);
  assert.match(runSyncBlock, /if \(pdfWindowMissing \|\| pdfWindowNearEdge\) \{/);
  assert.match(runSyncBlock, /void renderContinuousPages\(\)\.catch\(\(\) => undefined\)/);
});

test("PDF continuous scroll sync preloads the next window before reaching the edge", () => {
  const source = readMainTs();
  const helperStart = source.indexOf("function isContinuousPdfWindowNearEdge");
  const helperEnd = source.indexOf("function isContinuousRenderRequestCurrent", helperStart);
  const helperBlock = source.slice(helperStart, helperEnd);
  const runSyncStart = source.indexOf("function runContinuousScrollSync");
  const runSyncEnd = source.indexOf("function scrollTextMatchIntoView", runSyncStart);
  const runSyncBlock = source.slice(runSyncStart, runSyncEnd);

  assert.notEqual(helperStart, -1, "PDF window edge helper should start");
  assert.notEqual(helperEnd, -1, "PDF window edge helper should end");
  assert.match(helperBlock, /edgeThreshold = 3/);
  assert.match(helperBlock, /startPage > 0 && pageIndex - startPage <= threshold/);
  assert.match(helperBlock, /endPage < session\.page_count - 1 && endPage - pageIndex <= threshold/);
  assert.match(runSyncBlock, /const pdfWindowNearEdge = session\.file_type === "pdf" && isContinuousPdfWindowNearEdge\(nextPage\)/);
  assert.match(runSyncBlock, /if \(pdfWindowMissing \|\| pdfWindowNearEdge\) \{/);
  assert.match(runSyncBlock, /void renderContinuousPages\(\)\.catch\(\(\) => undefined\)/);
});

test("single-page mode keeps wheel input scoped to page navigation", () => {
  const source = readMainTs();
  const css = readStylesCss();

  assert.match(source, /const wheelPageTurnThreshold = 24/);
  assert.match(source, /function handlePageStageWheel\(event: WheelEvent\)/);
  assert.match(source, /!canTurnPageWithWheel\(\)/);
  assert.match(source, /Math\.abs\(event\.deltaY\) < wheelPageTurnThreshold/);
  assert.match(source, /event\.preventDefault\(\)/);
  assert.match(source, /void turnPageFromWheel\(event\.deltaY > 0 \? 1 : -1\)/);
  assert.match(source, /pageStage\?\.addEventListener\("wheel", handlePageStageWheel, \{ passive: false }\)/);
  assert.match(css, /body\s*{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.app-shell\s*{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.viewer\s*{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
});

test("reader stage supports keyboard navigation without stealing text input", () => {
  const source = readMainTs();
  const html = readIndexHtml();

  assert.match(source, /const keyboardScrollStep = 80/);
  assert.match(source, /function shouldIgnoreReaderKeyboardEvent\(event: KeyboardEvent\)/);
  assert.match(source, /target instanceof HTMLInputElement/);
  assert.match(source, /target instanceof HTMLTextAreaElement/);
  assert.match(source, /target instanceof HTMLButtonElement/);
  assert.match(source, /target\.isContentEditable/);
  assert.match(source, /function handleReaderKeyboardNavigation\(event: KeyboardEvent\)/);
  assert.match(source, /if \(shouldIgnoreReaderKeyboardEvent\(event\) \|\| !session \|\| isBusy\) \{/);
  assert.match(source, /case "PageDown":/);
  assert.match(source, /case "ArrowDown":/);
  assert.match(source, /case " ":/);
  assert.match(source, /case "PageUp":/);
  assert.match(source, /case "ArrowUp":/);
  assert.match(source, /case "Home":/);
  assert.match(source, /case "End":/);
  assert.match(source, /if \(isContinuousViewActive\(\) \|\| isTextSession\(\) \|\| isImageSession\(\)\) \{/);
  assert.match(source, /pageStage\?\.scrollBy\(\{ top: scrollDelta, behavior: "smooth" }\)/);
  assert.match(source, /pageStage\?\.scrollTo\(\{ top: scrollTarget, behavior: "smooth" }\)/);
  assert.match(source, /void movePage\(pageDelta\)/);
  assert.match(source, /void navigateToPage\(pageTarget\)/);
  assert.match(source, /window\.addEventListener\("keydown", handleReaderKeyboardNavigation\)/);
  assert.match(source, /function shouldIgnoreReaderCommandShortcut\(event: KeyboardEvent\)/);
  assert.match(source, /function handleReaderCommandShortcut\(event: KeyboardEvent\)/);
  assert.match(source, /window\.addEventListener\("keydown", handleReaderCommandShortcut\)/);
  assert.match(source, /case "o":[\s\S]*openLocalDocument\(\)/);
  assert.match(source, /case "p":[\s\S]*printDocument\(\)/);
  assert.match(source, /event\.key === "-"[\s\S]*changeScale\(-0\.25\)/);
  assert.match(source, /\(event\.key === "=" \|\| event\.key === "\+"\)[\s\S]*changeScale\(0\.25\)/);
  assert.match(source, /event\.altKey && event\.key\.toLowerCase\(\) === "f"[\s\S]*fitPage\("page"\)/);
  assert.match(source, /case "b":[\s\S]*toggleReaderNavigation\(\)/);
  assert.match(source, /case "m":[\s\S]*setReaderViewMode\(readerViewMode === "single" \? "continuous" : "single"\)/);
  assert.match(source, /event\.key === "\["[\s\S]*rotatePdfView\(-1\)/);
  assert.match(source, /event\.key === "\]"[\s\S]*rotatePdfView\(1\)/);
  assert.match(source, /case "a":[\s\S]*selectCurrentPageText\(\)/);
  assert.match(source, /case "c":[\s\S]*window\.getSelection\(\)\?\.toString\(\)[\s\S]*copyCurrentPageText\(\)/);
  assert.match(source, /event\.ctrlKey && event\.shiftKey && event\.key\.toLowerCase\(\) === "f"[\s\S]*toggleFocusReadingMode\(\)/);
  assert.match(source, /event\.ctrlKey && event\.shiftKey && event\.key\.toLowerCase\(\) === "b"[\s\S]*setDocumentCenterCollapsed\(!isDocumentCenterCollapsed\)/);
  assert.match(html, /id="open-local-document"[^>]*title="打开文档 \(Ctrl\+O\)"/);
  assert.match(html, /id="previous-page"[^>]*title="上一页 \(PageUp \/ ↑\)"/);
  assert.match(html, /id="next-page"[^>]*title="下一页 \(PageDown \/ ↓ \/ Space\)"/);
  assert.match(html, /id="zoom-out"[^>]*title="缩小 \(Ctrl\+-\)"/);
  assert.match(html, /id="zoom-in"[^>]*title="放大 \(Ctrl\+\+ \/ Ctrl\+=\)"/);
  assert.match(html, /id="fit-page"[^>]*title="整页适配窗口 \(Alt\+F\)"/);
  assert.match(html, /id="fit-width"[^>]*title="按页面宽度适配窗口"/);
  assert.doesNotMatch(html, /id="fit-width"[^>]*title="[^"]*\(/);
  assert.match(html, /id="toggle-reader-navigation"[^>]*title="显示书签 \(Ctrl\+B\)"/);
  assert.match(html, /id="single-page-view"[^>]*title="单页阅读 \(Ctrl\+M\)"/);
  assert.match(html, /id="continuous-page-view"[^>]*title="连续阅读 \(Ctrl\+M\)"/);
  assert.match(html, /id="print-document"[^>]*title="打印 \(Ctrl\+P\)"/);
  assert.match(html, /id="rotate-view-left"[^>]*title="向左旋转视图 \(Ctrl\+\[\)"/);
  assert.match(html, /id="rotate-view-right"[^>]*title="向右旋转视图 \(Ctrl\+\]\)"/);
  assert.match(html, /id="select-current-page-text"[^>]*title="全选当前页文字 \(Ctrl\+A\)"/);
  assert.match(html, /id="copy-current-page-text"[^>]*title="复制当前页文字 \(Ctrl\+C\)"/);
});

test("continuous view zoom and fit rerender around the current page anchor", () => {
  const source = readMainTs();

  assert.match(source, /async function rerenderAfterScaleChange\(\)/);
  assert.match(source, /if \(isContinuousViewActive\(\)\) \{\s*const anchorPage = currentPage;\s*await withBusy\(async \(\) => \{\s*const rendered = await renderContinuousPages\(\);\s*if \(!rendered\) \{\s*return;\s*}\s*scrollContinuousPageIntoView\(anchorPage\);/s);
  assert.match(source, /await rerenderAfterScaleChange\(\)/);
  assert.doesNotMatch(source, /if \(session\.file_type === "ofd"\) \{\s*scheduleOfdScaleRender\(\);\s*return;\s*}/s);
});

test("PDF print bypasses Blob iframe popup paths and keeps DOM fallback local", () => {
  const source = readMainTs();
  const rustPrint = readFile("src-tauri/src/webview_print.rs");
  const css = readStylesCss();

  assert.match(source, /async function printDocument\(request: PrintRequest \| null = null\)/);
  assert.match(source, /await invoke\("show_webview_print_ui"\)/);
  assert.match(source, /showWebViewPrintDialog\(\)/);
  assert.match(rustPrint, /COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM/);
  assert.doesNotMatch(rustPrint, /COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER/);
  assert.doesNotMatch(source, /printActivePdfDocumentBlob/);
  assert.doesNotMatch(source, /printActivePdfDocumentNative/);
  assert.match(source, /async function preparePrintRequestPages\(request: PrintRequest\)/);
  assert.match(source, /const resolvedRequest = request \?\? defaultPrintRequest\(\);[\s\S]*const printPageReady = await preparePrintRequestPages\(resolvedRequest\);[\s\S]*if \(!printPageReady\) \{[\s\S]*return;[\s\S]*}[\s\S]*preparePrintLayout\(resolvedRequest\);[\s\S]*await showWebViewPrintDialog\(\);/);
  assert.match(source, /if \(!hasContinuousPagesForCurrentView\(\) \|\| !hasContinuousPdfWindowForPage\(currentPage\)\) \{[\s\S]*const rendered = await renderContinuousPages\(\);[\s\S]*if \(!rendered\) \{[\s\S]*return false;[\s\S]*}/);
  assert.match(source, /await renderContinuousPdfPageWindow\(currentPage, printRenderKey\)/);
  assert.match(source, /function preparePrintForCurrentView\(request: PrintRequest\)/);
  assert.match(source, /if \(isContinuousViewActive\(\)\) \{/);
  assert.match(source, /setActivityFeedback\("连续阅读模式下将打印当前页。"\)/);
  assert.match(source, /function prepareContinuousPrintLayout\(\)/);
  assert.match(source, /continuousPrintState\(\{/);
  assert.match(source, /applyPrintBodyState\(continuousPrintState/);
  assert.match(source, /slot\.dataset\.currentPrintPage = "true"/);
  assert.match(source, /delete document\.body\.dataset\.printViewMode/);
  assert.match(source, /delete document\.body\.dataset\.printSelectedPages/);
  assert.match(source, /delete slot\.dataset\.currentPrintPage/);
  assert.match(css, /body\[data-print-view-mode="continuous"\]\s+\.continuous-page-slot:not\(\[data-current-print-page="true"\]\)\s*{[^}]*display:\s*none;/s);
  assert.match(css, /body\[data-print-view-mode="continuous"\]\s+\.continuous-page-spacer\s*{[^}]*display:\s*none;/s);
  assert.match(css, /body\[data-print-view-mode="continuous"\]\s+\.continuous-page-slot\[data-current-print-page="true"\]\s*{[^}]*aspect-ratio:\s*var\(--ldv-page-print-width\) \/ var\(--ldv-page-print-height\);/s);
  assert.doesNotMatch(source, /window\.print\(\);\s*\/\/ print continuous document/s);
});

test("reader open entry includes the current Office and WPS support matrix", () => {
  const source = readMainTs();
  const documentTypes = readDocumentTypesTs();

  const filterMatch = source.match(/filters:\s*\[\{[\s\S]*?extensions:\s*\[([^\]]+)\]/);

  assert.ok(filterMatch, "open dialog filter should exist");
  for (const extension of ["ofd", "pdf", "docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps"]) {
    assert.match(filterMatch[1], new RegExp(`"${extension}"`));
  }
  assert.match(source, /from "\.\/documentTypes"/);
  assert.match(documentTypes, /export function isOfficePath\(path: string\)/);
  assert.match(documentTypes, /export function isOfficeFileType\(fileType: string\)/);
  assert.match(source, /async function openLocalOfficePath\(path: string\)/);
});

test("reader open entry includes text preview formats", () => {
  const source = readMainTs();
  const documentTypes = readDocumentTypesTs();
  const filterMatch = source.match(/extensions:\s*\[([^\]]+)\]/);

  assert.ok(filterMatch, "open dialog extension filter should exist");
  for (const extension of ["txt", "log", "csv", "md"]) {
    assert.match(filterMatch[1], new RegExp(`"${extension}"`));
  }
  assert.match(documentTypes, /export function isTextPath\(path: string\)/);
  assert.match(documentTypes, /export function isTextFileType\(fileType: string\)/);
  assert.match(source, /async function openLocalTextPath\(path: string\)/);
});

test("reader open entry includes image preview formats", () => {
  const source = readMainTs();
  const documentTypes = readDocumentTypesTs();
  const filterMatch = source.match(/extensions:\s*\[([^\]]+)\]/);

  assert.ok(filterMatch, "open dialog extension filter should exist");
  for (const extension of ["png", "jpg", "jpeg", "webp"]) {
    assert.match(filterMatch[1], new RegExp(`"${extension}"`));
  }
  assert.match(documentTypes, /export const imageFileTypes = \[/);
  assert.match(documentTypes, /export function isImagePath\(path: string\)/);
  assert.match(documentTypes, /export function isImageFileType\(fileType: string\)/);
  assert.match(source, /async function openLocalImagePath\(path: string\)/);
});

test("text preview route stays separate from OFD fallback and Office conversion", () => {
  const source = readMainTs();
  const routeMatch = source.match(/async function openLocalDocumentPath\(path: string\) \{([\s\S]*?)\n\}/);
  const textStart = source.indexOf("async function openLocalTextPath(path: string) {");
  const textEnd = source.indexOf("async function openLocalOfficePath(path: string)");
  const textBlock = textStart >= 0 && textEnd > textStart ? source.slice(textStart, textEnd) : "";

  assert.ok(routeMatch, "openLocalDocumentPath block should be found");
  assert.ok(textBlock, "openLocalTextPath block should be found");
  assert.match(routeMatch[1], /const route = localDocumentRoute\(path\)/);
  assert.match(routeMatch[1], /if \(route === "text"\) \{\s*await openLocalTextPath\(path\);\s*return;\s*\}/);
  assert.match(textBlock, /file_type:\s*textFileTypeFromPath\(path\) \?\? "text"/);
  assert.doesNotMatch(textBlock, /path\.replace\(/);
  assert.match(textBlock, /"read_local_text_document"/);
  assert.match(textBlock, /renderTextDocument/);
  assert.doesNotMatch(textBlock, /open_local_office_as_pdf|open_local_ofd|read_local_pdf_bytes/);
});

test("recent text files reopen through the text read command", () => {
  const source = readMainTs();
  const recentMatch = source.match(/async function openRecentFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\n\}/);
  const textRecentMatch = source.match(/async function openRecentTextFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\nasync function openRecentPdfFile/);

  assert.ok(recentMatch, "openRecentFile block should be found");
  assert.ok(textRecentMatch, "openRecentTextFile block should be found");
  assert.match(recentMatch[1], /recentDocumentRoute\(fileType\)/);
  assert.match(recentMatch[1], /if \(route === "text"\)/);
  assert.match(recentMatch[1], /await openRecentTextFile\(id, displayName, fileType\)/);
  assert.match(textRecentMatch[1], /"read_recent_text_document"/);
  assert.match(textRecentMatch[1], /renderTextDocument/);
});

test("CSV and Markdown stay on the plain text reader path", () => {
  const source = readMainTs();
  const documentTypes = readDocumentTypesTs();
  const textTypesMatch = documentTypes.match(/export const textFileTypes = \[([^\]]+)\]/);
  const textPathMatch = documentTypes.match(/export function isTextPath\(path: string\) \{([\s\S]*?)\n\}/);
  const textTypeMatch = documentTypes.match(/export function isTextFileType\(fileType: string\) \{([\s\S]*?)\n\}/);
  const textBlockStart = source.indexOf("async function openLocalTextPath(path: string) {");
  const textBlockEnd = source.indexOf("function openLocalDocumentPath", textBlockStart);
  const textBlock = textBlockStart >= 0 && textBlockEnd > textBlockStart ? source.slice(textBlockStart, textBlockEnd) : "";

  assert.ok(textTypesMatch, "textFileTypes constant should be found");
  assert.ok(textPathMatch, "isTextPath block should be found");
  assert.ok(textTypeMatch, "isTextFileType block should be found");
  assert.ok(textBlock, "openLocalTextPath block should be found");
  for (const extension of ["csv", "md"]) {
    assert.match(textTypesMatch[1], new RegExp(`"${extension}"`));
  }
  assert.match(textPathMatch[1], /pathHasExtension\(path, textFileTypes\)/);
  assert.match(textTypeMatch[1], /textFileTypes\.includes\(normalizedFileType\(fileType\)/);
  assert.match(textBlock, /"read_local_text_document"/);
  assert.match(textBlock, /renderTextDocument/);
  assert.doesNotMatch(source, /markdown|marked|sanitizeHtml|innerHTML\s*=|dangerouslySetInnerHTML/i);
  assert.doesNotMatch(textBlock, /webview|openUrl|navigate|iframe|srcdoc/i);
});

test("image preview route stays local and single-page", () => {
  const source = readMainTs();
  const routeMatch = source.match(/async function openLocalDocumentPath\(path: string\) \{([\s\S]*?)\n\}/);
  const imageBlockStart = source.indexOf("async function openLocalImagePath(path: string) {");
  const imageBlockEnd = source.indexOf("async function openLocalTextPath(path: string)", imageBlockStart);
  const imageBlock = imageBlockStart >= 0 && imageBlockEnd > imageBlockStart ? source.slice(imageBlockStart, imageBlockEnd) : "";

  assert.ok(routeMatch, "openLocalDocumentPath block should be found");
  assert.ok(imageBlock, "openLocalImagePath block should be found");
  assert.match(routeMatch[1], /const route = localDocumentRoute\(path\)/);
  assert.match(routeMatch[1], /if \(route === "image"\) \{\s*await openLocalImagePath\(path\);\s*return;\s*\}/);
  assert.match(imageBlock, /file_type:\s*imageFileTypeFromPath\(path\) \?\? "image"/);
  assert.doesNotMatch(imageBlock, /path\.replace\(/);
  assert.match(imageBlock, /"open_local_image_document"/);
  assert.match(imageBlock, /renderImageDocument/);
  assert.match(imageBlock, /rememberLocalDocumentDirectory\(path\)/);
  assert.doesNotMatch(imageBlock, /open_local_office_as_pdf|open_local_ofd|read_local_pdf_bytes|read_local_text_document/);
});

test("recent image files reopen through the image read command", () => {
  const source = readMainTs();
  const recentMatch = source.match(/async function openRecentFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\n\}/);
  const imageRecentMatch = source.match(/async function openRecentImageFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\nasync function openRecentTextFile/);

  assert.ok(recentMatch, "openRecentFile block should be found");
  assert.ok(imageRecentMatch, "openRecentImageFile block should be found");
  assert.match(recentMatch[1], /recentDocumentRoute\(fileType\)/);
  assert.match(recentMatch[1], /if \(route === "image"\)/);
  assert.match(recentMatch[1], /await openRecentImageFile\(id, displayName, fileType\)/);
  assert.match(imageRecentMatch[1], /"open_recent_image_document"/);
  assert.match(imageRecentMatch[1], /renderImageDocument/);
});

test("text preview uses a dedicated selectable plain-text surface", () => {
  const source = readMainTs();
  const css = readStylesCss();
  const renderMatch = source.match(/function renderTextDocument\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderTextDocument block should be found");
  assert.match(renderMatch[1], /document\.createElement\("pre"\)/);
  assert.match(renderMatch[1], /className = "text-preview-surface"/);
  assert.match(renderMatch[1], /\.textContent = view\.text/);
  assert.match(css, /\.text-line-numbers,\s*\.text-preview-surface\s*{[^}]*white-space:\s*pre-wrap;/s);
  assert.match(css, /\.text-preview-surface\s*{[^}]*user-select:\s*text;/s);
});

test("text preview anchors at the top-left with a compact gutter", () => {
  const css = readStylesCss();

  assert.match(css, /\.page-surface\[data-document-mode="text"\]\s*{[^}]*place-items:\s*start stretch;/s);
  assert.match(css, /\.text-preview-shell\s*{[^}]*width:\s*100%;[^}]*min-height:\s*100%;/s);
  assert.match(css, /\.text-line-numbers\s*{[^}]*min-width:\s*40px;/s);
  assert.match(css, /\.text-preview-surface\s*{[^}]*padding-left:\s*16px;/s);
});

test("text preview keeps document paper colors in dark comfort theme", () => {
  const css = readStylesCss();
  const darkThemeMatch = css.match(/:root\[data-theme="dark-comfort"\]\s*{([^}]*)}/s);

  assert.ok(darkThemeMatch, "dark comfort theme block should be found");
  assert.doesNotMatch(darkThemeMatch[1], /--ldv-text-page-bg\s*:/);
  assert.doesNotMatch(darkThemeMatch[1], /--ldv-text-page-line-bg\s*:/);
  assert.match(css, /--ldv-text-page-text:\s*#[0-9a-fA-F]{6};/);
  assert.match(css, /\.text-preview-surface\s*{[^}]*color:\s*var\(--ldv-text-page-text\);/s);
});

test("text preview renders logical line numbers outside the selectable text body", () => {
  const source = readMainTs();
  const css = readStylesCss();
  const renderMatch = source.match(/function renderTextDocument\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderTextDocument block should be found");
  assert.match(renderMatch[1], /textPreviewShell = document\.createElement\("div"\)/);
  assert.match(renderMatch[1], /textLineNumbers = document\.createElement\("div"\)/);
  assert.match(renderMatch[1], /textLineNumbers\.className = "text-line-numbers"/);
  assert.match(renderMatch[1], /textLineNumbers\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(renderMatch[1], /lineNumbersForText\(view\.text\)/);
  assert.match(renderMatch[1], /textPreviewSurface\.textContent = view\.text/);
  assert.match(renderMatch[1], /textPreviewShell\.append\(textLineNumbers, textPreviewSurface\)/);
  assert.match(css, /\.text-line-numbers\s*{[^}]*user-select:\s*none;/s);
});

test("text preview pure line state stays outside the reader surface", () => {
  const source = readMainTs();

  assert.match(source, /from "\.\/textPreviewState"/);
  assert.doesNotMatch(source, /function lineNumbersForText\(text: string\)/);
  assert.doesNotMatch(source, /function lineIndexFromTextOffset\(text: string, offset: number\)/);
});

test("reader layout clamp state stays outside the reader surface", () => {
  const source = readMainTs();

  assert.match(source, /from "\.\/readerLayoutState"/);
  assert.doesNotMatch(source, /function clampDocumentCenterWidth\(width: number\)/);
  assert.doesNotMatch(source, /function clampReaderNavigationWidth\(width: number\)/);
});

test("reader scale clamp state stays outside the reader surface", () => {
  const source = readMainTs();
  const scaleState = readReaderScaleStateTs();

  assert.match(source, /from "\.\/readerScaleState"/);
  assert.match(scaleState, /export const minReaderScale = 0\.5/);
  assert.match(scaleState, /export const maxReaderScale = 3/);
  assert.doesNotMatch(source, /const minScale = 0\.5/);
  assert.doesNotMatch(source, /const maxScale = 3/);
  assert.match(source, /clampReaderScaleState\(value\)/);
  assert.match(source, /roundedReaderScaleState\(value\)/);
  assert.match(source, /isSameReaderScaleState\(left, right\)/);
});

test("reader toolbar primary state stays outside the reader surface", () => {
  const source = readMainTs();
  const toolbarState = readReaderToolbarStateTs();
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);

  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.match(source, /import \{ readerToolbarState \} from "\.\/readerToolbarState"/);
  assert.match(metadataMatch[1], /const toolbarState = readerToolbarState\(\{/);
  assert.match(metadataMatch[1], /canScaleCurrentDocument: canScaleCurrentDocument\(\)/);
  assert.match(metadataMatch[1], /canUseContinuousView: canUseContinuous/);
  assert.match(metadataMatch[1], /readerViewMode/);
  assert.match(metadataMatch[1], /previousButton\.disabled = toolbarState\.previousPageDisabled/);
  assert.match(metadataMatch[1], /nextButton\.disabled = toolbarState\.nextPageDisabled/);
  assert.match(metadataMatch[1], /printDocumentButton\.disabled = toolbarState\.printDocumentDisabled/);
  assert.match(toolbarState, /export function readerToolbarState/);
  assert.match(toolbarState, /zoomOutDisabled: scaleUnavailable \|\| input\.scale <= minReaderScale/);
  assert.match(toolbarState, /fitWidthDisabled: scaleUnavailable/);
  assert.match(toolbarState, /printDocumentDisabled: documentUnavailable/);
});

test("reader document center action state stays outside the reader surface", () => {
  const source = readMainTs();
  const documentCenterState = readReaderDocumentCenterStateTs();
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);

  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.match(source, /import \{ readerDocumentCenterState \} from "\.\/readerDocumentCenterState"/);
  assert.match(metadataMatch[1], /const documentCenterState = readerDocumentCenterState\(\{/);
  assert.match(metadataMatch[1], /recentFileCount: recentFiles\.entries\.length/);
  assert.match(metadataMatch[1], /openLocalDocumentButton\.disabled = documentCenterState\.openLocalDocumentDisabled/);
  assert.match(metadataMatch[1], /openLocalDocumentButton\.textContent = documentCenterState\.openLocalDocumentLabel/);
  assert.match(metadataMatch[1], /refreshRecentFilesButton\.disabled = documentCenterState\.refreshRecentFilesDisabled/);
  assert.match(metadataMatch[1], /clearRecentFilesButton\.disabled = documentCenterState\.clearRecentFilesDisabled/);
  assert.match(metadataMatch[1], /clearRenderCacheButton\.disabled = documentCenterState\.clearRenderCacheDisabled/);
  assert.match(metadataMatch[1], /recentFilesEnabled\.disabled = documentCenterState\.recentFilesEnabledDisabled/);
  assert.match(documentCenterState, /openLocalDocumentLabel: input\.isBusy \? "处理中\.\.\." : "打开文档"/);
  assert.match(documentCenterState, /clearRecentFilesDisabled: input\.isBusy \|\| input\.recentFileCount === 0/);
});

test("reader navigation control state stays outside the reader surface", () => {
  const source = readMainTs();
  const navigationControlsState = readReaderNavigationControlsStateTs();
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);

  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.match(source, /import \{ readerNavigationControlsState \} from "\.\/readerNavigationControlsState"/);
  assert.match(metadataMatch[1], /const navigationControlsState = readerNavigationControlsState\(\{/);
  assert.match(metadataMatch[1], /canUseReaderNavigation: canUseReaderNavigation\(\)/);
  assert.match(metadataMatch[1], /toggleReaderNavigationButton\.disabled = navigationControlsState\.toggleReaderNavigationDisabled/);
  assert.match(metadataMatch[1], /closeReaderNavigationButton\.disabled = navigationControlsState\.closeReaderNavigationDisabled/);
  assert.match(metadataMatch[1], /decreaseReaderNavigationFontButton\.disabled = navigationControlsState\.decreaseReaderNavigationFontDisabled/);
  assert.match(metadataMatch[1], /increaseReaderNavigationFontButton\.disabled = navigationControlsState\.increaseReaderNavigationFontDisabled/);
  assert.match(navigationControlsState, /toggleReaderNavigationDisabled: unavailable/);
  assert.match(navigationControlsState, /closeReaderNavigationDisabled: input\.isBusy \|\| !input\.isReaderNavigationOpen/);
});

test("image preview uses a plain image surface without text tools", () => {
  const source = readMainTs();
  const css = readStylesCss();
  const renderMatch = source.match(/function renderImageDocument\([^)]*\) \{([\s\S]*?)\n\}/);
  const findMatch = source.match(/function canUseDocumentFind\(\) \{([\s\S]*?)\n\}/);
  const selectMatch = source.match(/function canSelectCurrentPageText\(\) \{([\s\S]*?)\n\}/);
  const copyMatch = source.match(/function canCopyCurrentPageText\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderImageDocument block should be found");
  assert.ok(findMatch, "canUseDocumentFind block should be found");
  assert.ok(selectMatch, "canSelectCurrentPageText block should be found");
  assert.ok(copyMatch, "canCopyCurrentPageText block should be found");
  assert.match(renderMatch[1], /document\.createElement\("img"\)/);
  assert.match(renderMatch[1], /className = "page-image"/);
  assert.match(renderMatch[1], /convertFileSrc\(view\.source_path\)/);
  assert.match(renderMatch[1], /dataset\.documentMode = "image"/);
  assert.match(renderMatch[1], /dataset\.viewRotation = String\(pdfViewRotation\)/);
  assert.match(renderMatch[1], /--ldv-image-display-width/);
  assert.match(renderMatch[1], /--ldv-image-display-height/);
  assert.match(renderMatch[1], /setPageSurfacePrintSize\(view\.width_px, view\.height_px\)/);
  assert.match(css, /\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*--ldv-image-display-width/s);
  assert.match(css, /\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*position:\s*absolute;/s);
  assert.match(css, /\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*top:\s*50%;[^}]*left:\s*50%;/s);
  assert.match(css, /\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*transform-origin:\s*center;/s);
  assert.doesNotMatch(findMatch[1], /isImageFileType/);
  assert.doesNotMatch(selectMatch[1], /isImageFileType/);
  assert.doesNotMatch(copyMatch[1], /isImageFileType/);
});

test("image preview supports temporary rotation with the shared view rotation controls", () => {
  const source = readMainTs();
  const renderMatch = source.match(/function renderImageDocument\([^)]*\) \{([\s\S]*?)\n\}/);
  const rotateMatch = source.match(/function canRotatePdfView\(\) \{([\s\S]*?)\n\}/);
  const scaleBaseMatch = source.match(/function pageScaleBaseSize\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderImageDocument block should be found");
  assert.ok(rotateMatch, "canRotatePdfView block should be found");
  assert.ok(scaleBaseMatch, "pageScaleBaseSize block should be found");
  assert.match(rotateMatch[1], /isImageSession\(\)/);
  assert.match(rotateMatch[1], /currentImageDocumentView/);
  assert.match(renderMatch[1], /rotatedViewSize\(\{[\s\S]*view\.width_px[\s\S]*view\.height_px[\s\S]*\}, pdfViewRotation\)/);
  assert.match(renderMatch[1], /--ldv-image-view-rotation/);
  assert.doesNotMatch(renderMatch[1], /pageImage\.style\.transform = `rotate/);
  assert.match(readStylesCss(), /transform:\s*translate\(-50%, -50%\) rotate\(var\(--ldv-image-view-rotation\)\);/);
  assert.match(scaleBaseMatch[1], /isImageSession\(\)/);
  assert.match(scaleBaseMatch[1], /rotatedViewSize\(size, pdfViewRotation\)/);
});

test("image print ignores screen rotation and fills the page", () => {
  const css = readStylesCss();

  assert.match(css, /@media print/);
  assert.match(css, /\.page-surface\[data-document-mode="image"\]\s*{[^}]*max-width:\s*none;/s);
  assert.match(
    css,
    /body\[data-print-document-mode="image"\]\s+\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*width:\s*100% !important;[^}]*height:\s*100% !important;[^}]*object-fit:\s*contain( !important)?;[^}]*transform:\s*none !important;/s,
  );
  assert.match(
    css,
    /body\[data-print-document-mode="image"\]\s+\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*position:\s*static !important;/s,
  );
  assert.match(
    css,
    /body\[data-print-document-mode="image"\]\s+\.page-surface\[data-document-mode="image"\]\s*{[^}]*aspect-ratio:\s*var\(--ldv-image-print-aspect\) !important;/s,
  );
  assert.doesNotMatch(
    css,
    /body\[data-print-document-mode="image"\]\[data-view-rotation="90"\]\s+\.page-surface\[data-document-mode="image"\]\s+\.page-image\s*{[^}]*transform:\s*rotate\(90deg\);/s,
  );
});

test("image print uses the unrotated page size and aspect ratio", () => {
  const source = readMainTs();
  const renderMatch = source.match(/function renderImageDocument\([^)]*\) \{([\s\S]*?)\n\}/);
  assert.ok(renderMatch, "renderImageDocument block should be found");
  const body = renderMatch[1];
  assert.ok(body.includes('setProperty("--ldv-image-print-aspect"'), "renderImageDocument should write --ldv-image-print-aspect");
  assert.ok(body.includes("view.width_px"), "aspect ratio should use the unrotated view width");
  assert.ok(body.includes("view.height_px"), "aspect ratio should use the unrotated view height");
  assert.match(body, /setPageSurfacePrintSize\(view\.width_px, view\.height_px\)/);
  assert.doesNotMatch(body, /setPageSurfacePrintSize\(displaySize\.width, displaySize\.height\)/);
});


test("image preview state is restored after failed opens and cleared after other formats succeed", () => {
  const source = readMainTs();
  const ofdMatch = source.match(/async function openLocalOfdPath\(path: string\) \{([\s\S]*?)\nfunction pdfSessionFromOpenResult/);
  const imageMatch = source.match(/async function openLocalImagePath\(path: string\) \{([\s\S]*?)\nasync function openLocalTextPath/);
  const textMatch = source.match(/async function openLocalTextPath\(path: string\) \{([\s\S]*?)\nasync function openLocalOfficePath/);
  const recentImageMatch = source.match(/async function openRecentImageFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\nasync function openRecentTextFile/);
  const openPdfStart = source.indexOf("async function openPdfFromByteSource(");
  const openPdfEnd = source.indexOf("async function openRecentFile(");
  const pdfBlock = openPdfStart >= 0 && openPdfEnd > openPdfStart ? source.slice(openPdfStart, openPdfEnd) : "";

  assert.ok(ofdMatch, "openLocalOfdPath block should be found");
  assert.ok(imageMatch, "openLocalImagePath block should be found");
  assert.ok(textMatch, "openLocalTextPath block should be found");
  assert.ok(recentImageMatch, "openRecentImageFile block should be found");
  assert.ok(pdfBlock, "openPdfFromByteSource block should be found");
  for (const block of [ofdMatch[1], pdfBlock, imageMatch[1], textMatch[1], recentImageMatch[1]]) {
    assert.match(block, /const openSnapshot = snapshotReaderOpenState\(\);/);
    assert.match(block, /restoreReaderOpenSnapshot\(openSnapshot\);/);
  }
  assert.match(ofdMatch[1], /currentImageDocumentView = null;/);
  assert.match(textMatch[1], /currentImageDocumentView = null;/);
  assert.match(pdfBlock, /currentImageDocumentView = null;/);
});

test("text print hides the page chrome including the page number marker", () => {
  const css = readStylesCss();
  const textPrintStageMatch = css.match(/body\[data-print-document-mode="text"\]\s+\.page-stage\s*{([^}]*)}/s);
  const textPrintMarkerMatch = css.match(/body\[data-print-document-mode="text"\]\s+\.page-surface::before\s*{([^}]*)}/s);

  assert.ok(textPrintStageMatch, "text print page-stage block should be found");
  assert.ok(textPrintMarkerMatch, "text print page marker block should be found");
  assert.match(textPrintStageMatch[1], /display:\s*block;/);
  assert.match(textPrintStageMatch[1], /padding:\s*0;/);
  assert.match(textPrintMarkerMatch[1], /display:\s*none;/);
});

test("reader open entry includes WPS proprietary formats after local LibreOffice feasibility gate", () => {
  const source = readMainTs();
  const documentTypes = readDocumentTypesTs();
  const filterMatch = source.match(/extensions:\s*\[([^\]]+)\]/);
  const officeTypesMatch = documentTypes.match(/export const officeFileTypes = \[([^\]]+)\]/);
  const officePathMatch = documentTypes.match(/export function isOfficePath\(path: string\) \{([\s\S]*?)\n\}/);
  const officeTypeMatch = documentTypes.match(/export function isOfficeFileType\(fileType: string\) \{([\s\S]*?)\n\}/);

  assert.ok(filterMatch, "open dialog extension filter should exist");
  assert.ok(officeTypesMatch, "officeFileTypes should exist");
  assert.ok(officePathMatch, "isOfficePath should exist");
  assert.ok(officeTypeMatch, "isOfficeFileType should exist");

  for (const extension of ["doc", "xls", "ppt", "wps", "et", "dps"]) {
    assert.match(filterMatch[1], new RegExp(`"${extension}"`));
    assert.match(officeTypesMatch[1], new RegExp(`"${extension}"`));
  }
  assert.match(officePathMatch[1], /officeFileTypes/);
  assert.match(officeTypeMatch[1], /officeFileTypes\.includes\(normalizedFileType\(fileType\)/);
});

test("open document dialog remembers only the last successful local directory for this session", () => {
  const source = readMainTs();
  const openMatch = source.match(/async function openLocalDocument\(\) \{([\s\S]*?)\n\}/);
  const ofdMatch = source.match(/async function openLocalOfdPath\(path: string\) \{([\s\S]*?)\n\}/);
  const pdfMatch = source.match(/async function openLocalPdfPath\(path: string\) \{([\s\S]*?)\nasync function openRecentPdfFile/);
  const recentPdfMatch = source.match(/async function openRecentPdfFile\(id: string, displayName: string\) \{([\s\S]*?)\nasync function openPdfFromByteSource/);

  assert.ok(openMatch, "openLocalDocument block should be found");
  assert.ok(ofdMatch, "openLocalOfdPath block should be found");
  assert.ok(pdfMatch, "openLocalPdfPath block should be found");
  assert.ok(recentPdfMatch, "openRecentPdfFile block should be found");
  assert.match(source, /import \{ displayNameFromPath, localDocumentDirectoryFromPath \} from "\.\/localDocumentPath"/);
  assert.match(source, /let lastLocalDocumentDirectory: string \| null = null;/);
  assert.match(openMatch[1], /defaultPath:\s*lastLocalDocumentDirectory \?\? undefined/);
  assert.match(ofdMatch[1], /rememberLocalDocumentDirectory\(path\);/);
  assert.match(pdfMatch[1], /rememberLocalDocumentDirectory\(path\);/);
  assert.doesNotMatch(recentPdfMatch[1], /rememberLocalDocumentDirectory/);
});

test("open document dialog cancels stale continuous rendering before showing the picker", () => {
  const source = readMainTs();
  const openStart = source.indexOf("async function openLocalDocument()");
  const openEnd = source.indexOf("function rememberLocalDocumentDirectory", openStart);
  const openBlock = openStart >= 0 && openEnd > openStart ? source.slice(openStart, openEnd) : "";
  const cancelScrollMatch = source.match(/function cancelContinuousScrollSync\(\) \{([\s\S]*?)\n\}/);
  const cancelMatch = source.match(/function prepareDocumentOpenTransition\(\) \{([\s\S]*?)\n\}/);

  assert.ok(openBlock, "openLocalDocument block should be found");
  assert.ok(cancelScrollMatch, "cancelContinuousScrollSync block should be found");
  assert.ok(cancelMatch, "prepareDocumentOpenTransition block should be found");
  assert.match(openBlock, /prepareDocumentOpenTransition\(\);[\s\S]*const selected = await open\(/);
  assert.match(cancelScrollMatch[1], /pageStage\?\.removeEventListener\("scroll", syncCurrentPageFromContinuousScroll\);/);
  assert.match(cancelScrollMatch[1], /if \(continuousScrollSyncFrame !== null\) \{[\s\S]*cancelAnimationFrame\(continuousScrollSyncFrame\);[\s\S]*continuousScrollSyncFrame = null;[\s\S]*}/);
  assert.match(cancelMatch[1], /continuousRenderRequestId \+= 1;/);
  assert.match(cancelMatch[1], /cancelAutoChapterNavigation\(\);/);
  assert.match(cancelMatch[1], /cancelContinuousScrollSync\(\);/);
  assert.match(cancelMatch[1], /continuousPdfSlotObserver\?\.disconnect\(\);/);
  assert.match(cancelMatch[1], /continuousOfdSlotObserver\?\.disconnect\(\);/);
  assert.match(cancelMatch[1], /lastSuccessfulContinuousRenderKey = "";/);
});

test("open document dialog restores continuous reading state when picker is cancelled", () => {
  const source = readMainTs();
  const openStart = source.indexOf("async function openLocalDocument()");
  const openEnd = source.indexOf("function rememberLocalDocumentDirectory", openStart);
  const openBlock = openStart >= 0 && openEnd > openStart ? source.slice(openStart, openEnd) : "";
  const resumeMatch = source.match(/function resumeContinuousRenderingAfterOpenCancel\(\) \{([\s\S]*?)\n\}/);

  assert.ok(openBlock, "openLocalDocument block should be found");
  assert.ok(resumeMatch, "resumeContinuousRenderingAfterOpenCancel block should be found");
  assert.match(openBlock, /if \(typeof selected === "string"\) \{[\s\S]*await openLocalDocumentPath\(selected\);[\s\S]*return;[\s\S]*}/);
  assert.match(openBlock, /resumeContinuousRenderingAfterOpenCancel\(\);/);
  assert.match(resumeMatch[1], /if \(!session \|\| !isContinuousViewActive\(\) \|\| !continuousPagesContainer\) \{/);
  assert.match(resumeMatch[1], /continuousRenderRequestId \+= 1;/);
  assert.match(resumeMatch[1], /pageStage\.addEventListener\("scroll", syncCurrentPageFromContinuousScroll\);/);
  assert.match(resumeMatch[1], /observeLazyContinuousPdfSlots\(renderRequestId, session\.id, renderKey\);/);
  assert.match(resumeMatch[1], /observeLazyContinuousOfdSlots\(renderRequestId, session\.id, renderKey\);/);
});

test("recent file opens cancel stale continuous rendering before routing", () => {
  const source = readMainTs();
  const openRecentStart = source.indexOf("async function openRecentFile(");
  const openRecentEnd = source.indexOf("async function openLocalDocument()", openRecentStart);
  const openRecentBlock = openRecentStart >= 0 && openRecentEnd > openRecentStart
    ? source.slice(openRecentStart, openRecentEnd)
    : "";

  assert.ok(openRecentBlock, "openRecentFile block should be found");
  assert.match(openRecentBlock, /prepareDocumentOpenTransition\(\);[\s\S]*const route = recentDocumentRoute\(fileType\);/);
});

test("failed document opens restore continuous rendering after snapshot rollback", () => {
  const source = readMainTs();
  const restoreMatch = source.match(/function restoreReaderOpenSnapshot\(snapshot: ReaderOpenSnapshot\) \{([\s\S]*?)\n\}/);

  assert.ok(restoreMatch, "restoreReaderOpenSnapshot block should be found");
  assert.match(restoreMatch[1], /resumeContinuousRenderingAfterOpenCancel\(\);/);
});

test("continuous PDF resume rebuilds the slot index after cancellation", () => {
  const source = readMainTs();
  const resumeMatch = source.match(/function resumeContinuousRenderingAfterOpenCancel\(\) \{([\s\S]*?)\n\}/);
  const rebuildMatch = source.match(/function rebuildContinuousPdfSlotStateFromDom\(\) \{([\s\S]*?)\n\}/);

  assert.ok(resumeMatch, "resumeContinuousRenderingAfterOpenCancel block should be found");
  assert.ok(rebuildMatch, "rebuildContinuousPdfSlotStateFromDom block should be found");
  assert.match(resumeMatch[1], /rebuildContinuousPdfSlotStateFromDom\(\);[\s\S]*observeLazyContinuousPdfSlots/);
  assert.match(rebuildMatch[1], /continuousPagesContainer\.querySelectorAll<HTMLElement>\("\.continuous-page-slot\[data-page-index\]"\)/);
  assert.match(rebuildMatch[1], /continuousPdfPageSlots\.set\(pageIndex, slot\);/);
  assert.match(rebuildMatch[1], /continuousPdfRenderedPageIndexes\.add\(pageIndex\);/);
  assert.match(rebuildMatch[1], /resetContinuousPdfPageSlot\(slot, pageIndex\);/);
});

test("Office local open reuses PDF byte source without exposing converted path", () => {
  const source = readMainTs();
  const match = source.match(/async function openLocalOfficePath\(path: string\) \{([\s\S]*?)\nasync function openLocalPdfPath/);
  const helperMatch = source.match(/async function openOfficePreviewPdf\([^)]*\)[^{]*\{([\s\S]*?)\nasync function openRecentPdfFile/);
  const pdfSourceMatch = source.match(/async function openPdfFromByteSource\(([\s\S]*?)\) \{([\s\S]*?)\nasync function openRecentFile/);
  const lifecycleMatch = source.match(/type DocumentLifecycleStatus =([\s\S]*?);/);

  assert.ok(match, "openLocalOfficePath block should be found");
  assert.ok(helperMatch, "openOfficePreviewPdf block should be found");
  assert.ok(pdfSourceMatch, "openPdfFromByteSource block should be found");
  assert.ok(lifecycleMatch, "DocumentLifecycleStatus should be declared");
  assert.match(match[1], /openOfficePreviewPdf/);
  assert.match(match[1], /fileType:\s*officeFileTypeFromPath\(path\) \?\? "office"/);
  assert.doesNotMatch(match[1], /fileType:\s*"office"/);
  assert.match(match[1], /layout:\s*"preserve"/);
  assert.match(lifecycleMatch[1], /"正在转换为 PDF 预览"/);
  assert.match(pdfSourceMatch[1], /loadingStatus: DocumentLifecycleStatus = "正在打开"/);
  assert.match(pdfSourceMatch[2], /setDocumentStatus\(loadingStatus\)/);
  assert.match(helperMatch[1], /context\.fileType,\s*"正在转换为 PDF 预览"/);
  assert.match(helperMatch[1], /"open_local_office_as_pdf"/);
  assert.match(helperMatch[1], /layout:\s*context\.layout/);
  assert.match(helperMatch[1], /"read_converted_office_pdf_bytes"/);
  assert.match(helperMatch[1], /openPdfFromByteSource/);
  assert.match(helperMatch[1], /sessionId:\s*opened\.session_id/);
  assert.doesNotMatch(helperMatch[1], /output_pdf_path|converted_pdf_path|absolute_path/);
});

test("Office converted previews expose a controlled layout preview toggle", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, /id="office-layout-preview"/);
  assert.match(html, />适宽预览</);
  assert.match(source, /type OfficePreviewLayout = "preserve" \| "fit_width_preview"/);
  assert.match(source, /let currentOfficePreview: OfficePreviewContext \| null = null;/);
  assert.match(source, /function canShowOfficePreviewLayout\(\)/);
  assert.match(source, /currentOfficePreview\?\.fileType\.toLowerCase\(\) === "xlsx"/);
  assert.match(source, /function canToggleOfficePreviewLayout\(\)/);
  assert.match(source, /officeLayoutPreviewButton\.hidden = !canShowOfficePreviewLayout\(\)/);
  assert.match(source, /officeLayoutPreviewButton\.disabled = !canToggleOfficePreviewLayout\(\)/);
  assert.match(source, /currentOfficePreview = \{[\s\S]*fileType: openedFileType,[\s\S]*\};\s+updateMetadata\(\);/);
  assert.match(source, /async function toggleOfficePreviewLayout\(\)/);
  assert.match(source, /layout:\s*nextLayout/);
  assert.match(source, /officeLayoutPreviewButton\?\.addEventListener\("click", toggleOfficePreviewLayout\)/);
  assert.doesNotMatch(source, /SinglePageSheets/);
});

test("recent Office files reopen through Office conversion path", () => {
  const source = readMainTs();
  const match = source.match(/async function openRecentFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\n\}/);

  assert.ok(match, "openRecentFile block should be found");
  assert.match(match[1], /recentDocumentRoute\(fileType\)/);
  assert.match(match[1], /if \(route === "office"\)/);
  assert.match(match[1], /await openRecentOfficeFile\(id, displayName, fileType\)/);
});

test("PDF.js details stay isolated in the PDF adapter", () => {
  const source = readMainTs();
  const adapter = readPdfAdapterTs();

  assert.doesNotMatch(source, /pdfjs-dist/);
  assert.doesNotMatch(source, /GlobalWorkerOptions/);
  assert.match(adapter, /pdfjs-dist/);
  assert.match(adapter, /openPdfDocumentFromBytes/);
  assert.match(adapter, /GlobalWorkerOptions\.workerSrc/);
  assert.match(adapter, /pdf\.worker\.mjs/);
});

test("PDF.js adapter keeps local-only loading guardrails", () => {
  const adapter = readPdfAdapterTs();

  assert.match(adapter, /disableRange:\s*true/);
  assert.match(adapter, /disableAutoFetch:\s*true/);
  assert.match(adapter, /disableStream:\s*true/);
  assert.match(adapter, /stopAtErrors:\s*true/);
  assert.match(adapter, /useWasm:\s*false/);
  assert.match(adapter, /useWorkerFetch:\s*false/);
});

test("PDF open smoke uses controlled bytes and safe status text", () => {
  const source = readMainTs();

  assert.match(source, /openPdfDocumentFromBytes/);
  assert.match(source, /async function openLocalPdfPath\(path: string\)/);
  assert.match(source, /"read_local_pdf_bytes"/);
  assert.match(source, /new Uint8Array\(bytes\)/);
  assert.match(source, /setDocumentStatus\("已打开"\)/);
  assert.doesNotMatch(source, /PDF 已打开，共 \$\{opened\.pageCount\} 页。/);
  assert.doesNotMatch(source, /PDF_NOT_IMPLEMENTED/);
});

test("PDF open resets long-document reader state before first render", () => {
  const source = readMainTs();
  const openPdfStart = source.indexOf("async function openPdfFromByteSource(");
  const openPdfEnd = source.indexOf("async function openRecentFile(");
  const openPdfBlock = openPdfStart >= 0 && openPdfEnd > openPdfStart ? source.slice(openPdfStart, openPdfEnd) : "";

  assert.ok(openPdfBlock, "openPdfFromByteSource block should be found");

  const stateResetOrder = [
    "activePdfDocument = opened;",
    "session = pdfSessionFromOpenResult(opened);",
    "clearAllLocalOfdPageWork();",
    "currentPage = 0;",
    "scale = 1;",
    "pdfViewRotation = 0;",
    "resetDocumentFindState();",
    "resetReaderViewModeForDocument();",
    "await renderCurrentPage();",
  ];
  let previousIndex = -1;
  for (const marker of stateResetOrder) {
    const markerIndex = openPdfBlock.indexOf(marker);
    assert.ok(markerIndex > previousIndex, `${marker} should appear after the previous PDF open reset step`);
    previousIndex = markerIndex;
  }
});

test("PDF page rendering stays behind the PDF adapter boundary", () => {
  const source = readMainTs();
  const adapter = readPdfAdapterTs();
  const css = readStylesCss();

  assert.match(source, /PdfDocumentHandle/);
  assert.match(source, /let activePdfDocument: PdfDocumentHandle \| null = null;/);
  assert.match(source, /document\.createElement\("canvas"\)/);
  assert.match(source, /activePdfDocument\.renderPageToCanvas\(currentPage, pageCanvas, scale, pdfViewRotation\)/);
  assert.doesNotMatch(source, /\.render\(\{/);
  assert.match(adapter, /renderPageToCanvas/);
  assert.match(adapter, /page\.render\(\{/);
  assert.match(adapter, /const outputScale = Math\.min\(3, Math\.max\(2, window\.devicePixelRatio \|\| 1\)\);/);
  assert.match(adapter, /transform:\s*\[outputScale, 0, 0, outputScale, 0, 0\]/);
  assert.match(css, /\.page-canvas/);
});

test("PDF text selection stays behind the PDF adapter boundary", () => {
  const source = readMainTs();
  const adapter = readPdfAdapterTs();
  const css = readStylesCss();

  assert.match(source, /let pageTextLayer: HTMLDivElement \| null = null;/);
  assert.match(source, /document\.createElement\("div"\)/);
  assert.match(source, /pageTextLayer\.className = "textLayer page-text-layer"/);
  assert.match(source, /activePdfDocument\.renderPageTextLayer\(currentPage, pageTextLayer, scale, pdfViewRotation\)/);
  assert.doesNotMatch(source, /getTextContent/);
  assert.match(adapter, /renderPageTextLayer/);
  assert.match(adapter, /new pdfjs\.TextLayer/);
  assert.match(adapter, /getTextContent\(\)/);
  assert.match(adapter, /textContent\.items\.length === 0/);
  assert.match(adapter, /data-text-layer-empty/);
  assert.match(adapter, /--scale-factor/);
  assert.match(adapter, /--total-scale-factor/);
  assert.match(css, /\.page-text-layer/);
  assert.match(css, /\.page-text-layer span/);
  assert.match(css, /--text-scale-factor:\s*calc\(var\(--total-scale-factor\) \* var\(--min-font-size\)\)/);
  assert.match(css, /scale\(var\(--min-font-size-inv\)\)/);
  assert.match(css, /\.page-text-layer\[data-main-rotation="90"\]\s*{[^}]*transform:\s*rotate\(90deg\) translateY\(-100%\);/s);
  assert.match(css, /\.page-text-layer\[data-main-rotation="180"\]\s*{[^}]*transform:\s*rotate\(180deg\) translate\(-100%, -100%\);/s);
  assert.match(css, /\.page-text-layer\[data-main-rotation="270"\]\s*{[^}]*transform:\s*rotate\(270deg\) translateX\(-100%\);/s);
  assert.match(css, /user-select:\s*text/);
  assert.match(css, /\.page-text-layer ::selection\s*{[^}]*background:/s);
  assert.match(css, /\.page-text-layer\[data-text-layer-empty="true"\]/);
  assert.match(css, /\.page-text-layer\[data-text-layer-unavailable="true"\]/);
  assert.match(css, /pointer-events:\s*none/);
});

test("PDF text layer failure does not block page canvas rendering", () => {
  const source = readMainTs();
  const renderPdfMatch = source.match(/async function renderPdfPage\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderPdfMatch, "renderPdfPage block should be found");
  assert.match(renderPdfMatch[1], /await activePdfDocument\.renderPageToCanvas\(currentPage, pageCanvas, scale, pdfViewRotation\);/);
  assert.match(renderPdfMatch[1], /pageTextLayer\.removeAttribute\("data-text-layer-empty"\)/);
  assert.match(renderPdfMatch[1], /try \{\s*await activePdfDocument\.renderPageTextLayer\(currentPage, pageTextLayer, scale, pdfViewRotation\);/);
  assert.match(renderPdfMatch[1], /catch \(error\)/);
  assert.match(renderPdfMatch[1], /pageTextLayer\.replaceChildren\(\)/);
  assert.match(renderPdfMatch[1], /pageTextLayer\.removeAttribute\("data-text-layer-empty"\)/);
  assert.match(renderPdfMatch[1], /pageTextLayer\.dataset\.textLayerUnavailable = "true"/);
});

test("PDF text layer does not intercept pointer input while the page is loading", () => {
  const css = readStylesCss();

  assert.match(css, /\.page-surface\.is-loading\s+\.page-text-layer\s*{[^}]*pointer-events:\s*none;[^}]*user-select:\s*none;/s);
});

test("loading state does not dim the page surface content", () => {
  const css = readStylesCss();
  const loadingSurfaceMatch = css.match(/\.page-surface\.is-loading\s*{([^}]*)}/);

  assert.doesNotMatch(css, /\.page-surface\.is-loading\s*{[^}]*opacity\s*:/s);
  if (loadingSurfaceMatch) {
    assert.doesNotMatch(loadingSurfaceMatch[1], /opacity\s*:/);
  }
});

test("PDF fit controls use PDF page points instead of OFD bitmap scale base", () => {
  const source = readMainTs();

  assert.match(source, /function pageScaleBaseSize\(\)/);
  assert.match(source, /session\.file_type === "pdf"/);
  assert.match(source, /baseWidth = scaleBase\.width/);
  assert.match(source, /baseHeight = scaleBase\.height/);
});

test("PDF renderer errors are mapped to a safe PDF diagnostic code", () => {
  const source = readMainTs();
  const mapping = readPdfErrorMappingTs();
  const openPdfStart = source.indexOf("async function openPdfFromByteSource(");
  const openPdfEnd = source.indexOf("async function openRecentFile(");
  const openPdfBlock = openPdfStart >= 0 && openPdfEnd > openPdfStart ? source.slice(openPdfStart, openPdfEnd) : "";

  assert.ok(openPdfBlock, "openPdfFromByteSource block should be found");
  assert.match(source, /from "\.\/pdf\/pdfErrorMapping"/);
  assert.match(mapping, /function pdfRendererError\(error: unknown\): PdfRenderError/);
  assert.match(mapping, /function renderErrorFromPdfOpenFailure\(error: unknown\): PdfRenderError/);
  assert.match(mapping, /code: "PDF_RENDERER_ERROR"/);
  assert.match(mapping, /message: "无法打开该 PDF 文件。"/);
  assert.match(openPdfBlock, /showError\(renderErrorFromPdfOpenFailure\(error\)\)/);
  assert.doesNotMatch(openPdfBlock, /showError\(error\);/);
});

test("PDF password or encrypted failures are mapped to an unsupported feature message", () => {
  const source = readPdfErrorMappingTs();

  assert.match(source, /function isPdfPasswordOrEncryptedError\(error: unknown\)/);
  assert.match(source, /PasswordException/);
  assert.match(source, /code: "UNSUPPORTED_PDF_FEATURE"/);
  assert.match(source, /message: "该 PDF 受密码或权限保护，暂不支持打开。"/);
  assert.match(source, /if \(isPdfPasswordOrEncryptedError\(error\)\)/);
});

test("PDF invalid structure failures are mapped to a PDF structure diagnostic code", () => {
  const source = readPdfErrorMappingTs();

  assert.match(source, /function isPdfInvalidStructureError\(error: unknown\)/);
  assert.match(source, /InvalidPDFException/);
  assert.match(source, /code: "PDF_STRUCTURE_ERROR"/);
  assert.match(source, /if \(isPdfInvalidStructureError\(error\)\)/);
});

test("reader surface describes the opened document without engine diagnostics", () => {
  const html = readIndexHtml();

  assert.match(html, /id="document-name"/);
  assert.match(html, /id="document-status"/);
  assert.doesNotMatch(html, />MVP 0</);
  assert.doesNotMatch(html, />Engine</);
});

test("MVP3 document center sidebar exposes grouped reader sections without changing core ids", () => {
  const html = readIndexHtml();

  assert.match(html, /class="sidebar document-center"/);
  assert.match(html, /id="document-center-title"/);
  assert.match(html, /id="document-open-section"/);
  assert.match(html, /id="recent-files-section"/);
  assert.match(html, /id="current-document-section"/);
  assert.match(html, /id="local-management-section"/);
  assert.match(html, /id="open-local-document"/);
  assert.match(html, /id="document-name"/);
  assert.match(html, /id="document-status"/);
  assert.match(html, /id="page-count"/);
  assert.match(html, /id="scale-value"/);
  assert.match(html, /id="clear-render-cache"/);
});

test("document center sidebar can collapse to a left rail without conflicting with reader bookmarks", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const layoutState = readReaderLayoutStateTs();
  const css = readStylesCss();

  assert.match(html, /<main class="app-shell"[^>]*data-document-center-collapsed="false"/);
  assert.match(html, /id="collapse-document-center"[^>]*aria-label="隐藏侧栏"[^>]*aria-controls="document-center-sidebar"[^>]*aria-expanded="true"/);
  assert.match(html, /id="collapse-document-center"[^>]*title="隐藏侧栏[^"]*"/);
  assert.match(html, /id="expand-document-center"[^>]*aria-label="展开侧栏"[^>]*aria-controls="document-center-sidebar"[^>]*aria-expanded="false"/);
  assert.match(html, /id="expand-document-center"[^>]*title="展开侧栏[^"]*"/);
  assert.match(html, /id="rail-open-local-document"[^>]*aria-label="打开文档"/);
  assert.match(html, /id="rail-open-local-document"[^>]*title="打开文档[^"]*"/);
  assert.match(html, /id="rail-focus-reading-mode"[^>]*aria-label="专注阅读"/);
  assert.match(html, /id="rail-focus-reading-mode"[^>]*title="专注阅读[^"]*"/);
  assert.match(html, /id="document-center-resizer"[^>]*role="separator"[^>]*aria-orientation="vertical"/);
  assert.match(html, /id="document-center-rail"/);
  const railMatch = html.match(/<nav id="document-center-rail"[\s\S]*?<\/nav>/);
  assert.ok(railMatch, "collapsed document center rail should exist");
  assert.match(railMatch[0], /id="expand-document-center"[\s\S]*id="rail-open-local-document"[\s\S]*id="rail-focus-reading-mode"/);
  assert.match(railMatch[0], /id="rail-open-local-document"[\s\S]*data-icon="folder-open"/);
  assert.match(railMatch[0], /id="expand-document-center"[\s\S]*data-icon="panel-left-open"/);
  assert.match(railMatch[0], /id="rail-focus-reading-mode"[\s\S]*data-icon="focus"/);
  assert.doesNotMatch(railMatch[0], /<span class="button-label">(?:打开文档|展开侧栏|专注阅读|退出专注)<\/span>/);
  assert.doesNotMatch(html, /<span class="button-label">隐藏侧栏<\/span>/);
  assert.match(html, /<aside id="document-center-sidebar" class="sidebar document-center"/);
  assert.match(html, /id="toggle-reader-navigation"[\s\S]*aria-controls="reader-navigation-panel"/);

  assert.match(source, /const appShell = document\.querySelector<HTMLElement>\(".app-shell"\)/);
  assert.match(source, /const railOpenLocalDocumentButton = document\.querySelector<HTMLButtonElement>\("#rail-open-local-document"\)/);
  assert.match(source, /const railFocusReadingModeButton = document\.querySelector<HTMLButtonElement>\("#rail-focus-reading-mode"\)/);
  assert.match(source, /const collapseDocumentCenterButton = document\.querySelector<HTMLButtonElement>\("#collapse-document-center"\)/);
  assert.match(source, /const expandDocumentCenterButton = document\.querySelector<HTMLButtonElement>\("#expand-document-center"\)/);
  assert.match(source, /const documentCenterResizer = document\.querySelector<HTMLElement>\("#document-center-resizer"\)/);
  assert.match(source, /from "\.\/readerLayoutState"/);
  assert.match(layoutState, /export const minDocumentCenterWidth = 220/);
  assert.match(layoutState, /export const defaultDocumentCenterWidth = 260/);
  assert.match(layoutState, /export const maxDocumentCenterWidth = 340/);
  assert.match(layoutState, /export const collapsedDocumentCenterRailWidth = 44/);
  assert.match(source, /let isDocumentCenterCollapsed = false/);
  assert.match(source, /clampDocumentCenterWidthState\(width, window\.innerWidth\)/);
  assert.match(source, /function setDocumentCenterWidth\(width: number\)/);
  assert.match(source, /function setDocumentCenterCollapsed\(collapsed: boolean\)/);
  assert.match(source, /appShell\?\.style\.setProperty\("--document-center-width", `\$\{documentCenterWidth\}px`\)/);
  assert.match(source, /appShell\.dataset\.documentCenterCollapsed = String\(isDocumentCenterCollapsed\)/);
  assert.match(source, /railOpenLocalDocumentButton\?\.addEventListener\("click", openLocalDocument\)/);
  assert.match(source, /collapseDocumentCenterButton\?\.addEventListener\("click", \(\) => setDocumentCenterCollapsed\(true\)\)/);
  assert.match(source, /expandDocumentCenterButton\?\.addEventListener\("click", \(\) => setDocumentCenterCollapsed\(false\)\)/);
  assert.match(source, /documentCenterResizer\?\.addEventListener\("pointerdown", startDocumentCenterResize\)/);
  assert.match(source, /window\.addEventListener\("pointermove", resizeDocumentCenter\)/);
  assert.match(source, /window\.addEventListener\("pointerup", stopDocumentCenterResize/);

  assert.match(css, /\.app-shell\s*{[^}]*grid-template-columns:\s*var\(--document-center-width, 260px\) 6px minmax\(0, 1fr\);/s);
  assert.match(css, /\.app-shell\[data-document-center-collapsed="true"\]\s*{[^}]*grid-template-columns:\s*var\(--document-center-rail-width, 44px\) minmax\(0, 1fr\);/s);
  assert.match(css, /\.document-center-rail\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.document-center-rail\s*{[^}]*justify-content:\s*flex-start;/s);
  assert.match(css, /\.document-center-rail\s*{[^}]*padding:\s*28px 4px 14px;/s);
  assert.match(css, /\.document-center-rail\s*{[^}]*gap:\s*8px;/s);
  assert.match(css, /\.app-shell\[data-document-center-collapsed="true"\] \.document-center-rail\s*{[^}]*display:\s*flex;/s);
  assert.match(css, /\.app-shell\[data-document-center-collapsed="true"\] \.document-center,\s*\.app-shell\[data-document-center-collapsed="true"\] \.document-center-resizer\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.document-center-resizer\s*{[^}]*cursor:\s*col-resize;/s);
  assert.match(css, /\.document-center-rail-button:hover:not\(:disabled\)/);
});

test("reader content area exposes resizable page navigation for paged documents without bookmarks", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const layoutState = readReaderLayoutStateTs();
  const css = readStylesCss();
  const sidebarMatch = html.match(/<aside[^>]*class="sidebar document-center"[^>]*>[\s\S]*?<\/aside>/);

  assert.ok(sidebarMatch, "document center sidebar should exist");
  assert.doesNotMatch(sidebarMatch[0], /id="page-navigation-section"/);
  assert.match(html, /id="toggle-reader-navigation"[^>]*title="显示书签[^"]*"[^>]*aria-label="显示书签"[^>]*aria-controls="reader-navigation-panel"[^>]*aria-expanded="false"[\s\S]*<span class="button-label">书签<\/span>/);
  assert.match(html, /id="reader-workspace"[\s\S]*id="reader-navigation-panel"[\s\S]*id="page-navigation-panel-title"[\s\S]*书签[\s\S]*id="decrease-reader-navigation-font"[\s\S]*id="increase-reader-navigation-font"[\s\S]*id="close-reader-navigation"[\s\S]*id="page-navigation-section"[\s\S]*id="page-stage"/);
  assert.doesNotMatch(html, /id="close-reader-navigation"[\s\S]*<span class="button-label">关闭<\/span>[\s\S]*<\/button>/);
  assert.doesNotMatch(html, /id="open-reader-navigation"/);
  assert.match(html, /id="reader-navigation-panel"[^>]*hidden/);
  assert.match(html, /id="reader-navigation-resizer"[^>]*role="separator"[^>]*aria-orientation="vertical"/);

  assert.match(html, /id="page-navigation-section"/);
  assert.match(html, /id="page-navigation-title"[\s\S]*页面导航/);
  assert.match(html, /id="page-navigation-list"/);
  assert.match(html, /id="page-navigation-empty"[\s\S]*打开分页文档后显示页码/);
  assert.doesNotMatch(html, /用户书签|收藏夹|bookmark/i);

  assert.match(source, /const pageNavigationSection = document\.querySelector<HTMLElement>\("#page-navigation-section"\)/);
  assert.match(source, /const pageNavigationList = document\.querySelector<HTMLUListElement>\("#page-navigation-list"\)/);
  assert.match(source, /const pageNavigationEmpty = document\.querySelector<HTMLElement>\("#page-navigation-empty"\)/);
  assert.match(source, /const readerNavigationPanel = document\.querySelector<HTMLElement>\("#reader-navigation-panel"\)/);
  assert.match(source, /const toggleReaderNavigationButton = document\.querySelector<HTMLButtonElement>\("#toggle-reader-navigation"\)/);
  assert.doesNotMatch(source, /openReaderNavigationButton/);
  assert.match(source, /const closeReaderNavigationButton = document\.querySelector<HTMLButtonElement>\("#close-reader-navigation"\)/);
  assert.match(source, /const decreaseReaderNavigationFontButton = document\.querySelector<HTMLButtonElement>\("#decrease-reader-navigation-font"\)/);
  assert.match(source, /const increaseReaderNavigationFontButton = document\.querySelector<HTMLButtonElement>\("#increase-reader-navigation-font"\)/);
  assert.match(source, /const readerNavigationResizer = document\.querySelector<HTMLElement>\("#reader-navigation-resizer"\)/);
  assert.match(source, /let isReaderNavigationOpen = false/);
  assert.match(source, /from "\.\/readerLayoutState"/);
  assert.match(layoutState, /export const minReaderNavigationWidth = 200/);
  assert.match(layoutState, /export const defaultReaderNavigationWidth = 260/);
  assert.match(layoutState, /export const maxReaderNavigationWidth = 360/);
  assert.match(source, /clampReaderNavigationWidthState\(width, window\.innerWidth\)/);
  assert.match(source, /function setReaderNavigationOpen\(open: boolean\)/);
  assert.match(source, /readerWorkspace\?\.style\.setProperty\("--reader-navigation-item-font-size", `\$\{readerNavigationFontSize\}px`\)/);
  assert.match(source, /decreaseReaderNavigationFontButton\?\.addEventListener\("click", decreaseReaderNavigationFont\)/);
  assert.match(source, /increaseReaderNavigationFontButton\?\.addEventListener\("click", increaseReaderNavigationFont\)/);
  assert.match(source, /closeReaderNavigationButton\?\.addEventListener\("click", closeReaderNavigation\)/);
  assert.match(source, /function startReaderNavigationResize\(event: PointerEvent\)/);
  assert.match(source, /window\.addEventListener\("pointermove", resizeReaderNavigation\)/);
  assert.match(source, /window\.addEventListener\("pointerup", stopReaderNavigationResize/);
  assert.match(source, /function canUsePageNavigation\(\)/);
  assert.match(source, /function renderPageNavigation\(\)/);
  assert.match(source, /for \(let pageIndex = 0; pageIndex < session\.page_count; pageIndex \+= 1\)/);
  assert.match(source, /button\.textContent = `第 \$\{pageIndex \+ 1\} 页`/);
  assert.match(source, /button\.title = button\.textContent/);
  assert.match(source, /button\.addEventListener\("click", \(\) => \{/);
  assert.match(source, /void navigateFromPageNavigation\(pageIndex\)/);
  assert.match(source, /function syncPageNavigationCurrentPage\(\)/);
  assert.match(source, /button\.setAttribute\("aria-current", isCurrent \? "page" : "false"\)/);
  assert.match(source, /button\.scrollIntoView\(\{ block: "nearest" \}\)/);
  assert.match(source, /renderPageNavigation\(\);\s+updateMetadata\(\);/);
  assert.match(source, /syncPageNavigationCurrentPage\(\);\s+updateDiagnosticActions\(\);/);

  assert.match(css, /\.reader-workspace\s*{/);
  assert.doesNotMatch(css, /\.reader-navigation-opener\s*{/);
  assert.match(css, /\.reader-navigation-header\s*{/);
  assert.match(css, /\.reader-navigation-close\s*{/);
  assert.match(css, /\.reader-navigation-font-button\s*{/);
  assert.match(css, /\.reader-navigation-header\s*{[^}]*align-items:\s*center;/s);
  assert.match(css, /\.reader-navigation-close\s*{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(css, /\.reader-workspace\.has-navigation\s*{[^}]*grid-template-columns:\s*var\(--reader-navigation-width, 260px\) minmax\(0, 1fr\);/s);
  assert.match(css, /\.reader-navigation-panel\s*{[^}]*width:\s*var\(--reader-navigation-width, 260px\);[^}]*max-width:\s*min\(360px, 35vw\);/s);
  assert.match(css, /\.reader-navigation-resizer\s*{[^}]*cursor:\s*col-resize;/s);
  assert.match(css, /\.page-navigation\s*{/);
  assert.match(css, /\.page-navigation-list\s*{[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.page-navigation-button\s*{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /\.page-navigation-button\s*{[^}]*font-size:\s*var\(--reader-navigation-item-font-size, 15px\);/s);
  assert.match(css, /\.page-navigation-button\[aria-current="page"\]/);
});

test("reader content area exposes PDF document outline navigation without user bookmarks", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();
  const adapter = readPdfAdapterTs();
  const outline = readPdfOutlineTs();
  const navigationState = readReaderNavigationStateTs();
  const sidebarMatch = html.match(/<aside[^>]*class="sidebar document-center"[^>]*>[\s\S]*?<\/aside>/);

  assert.ok(sidebarMatch, "document center sidebar should exist");
  assert.doesNotMatch(sidebarMatch[0], /id="document-outline-section"/);
  assert.match(html, /id="reader-navigation-panel"[\s\S]*id="document-outline-section"[\s\S]*id="page-stage"/);

  assert.match(html, /id="document-outline-section"/);
  assert.match(html, /id="document-outline-title"[\s\S]*文档目录/);
  assert.match(html, /id="document-outline-list"/);
  assert.match(html, /id="document-outline-empty"[\s\S]*当前文档没有可跳转目录/);
  assert.doesNotMatch(html, /收藏夹|用户书签|bookmark/i);

  assert.match(adapter, /getOutline\(\): Promise<PdfOutlineItem\[\]>/);
  assert.match(adapter, /const outline = await document\.getOutline\(\)/);
  assert.match(adapter, /normalizePdfOutlineItems\(outline, \{/);
  assert.match(adapter, /resolveNamedDestination: \(name\) => document\.getDestination\(name\)/);
  assert.match(adapter, /resolvePageIndex: \(pageReference\) => document\.getPageIndex\(pageReference as Parameters<typeof document\.getPageIndex>\[0\]\)/);
  assert.match(outline, /export type PdfOutlineItem = \{/);
  assert.match(outline, /export async function normalizePdfOutlineItems/);
  assert.match(outline, /typeof dest === "string"/);
  assert.match(outline, /context\.resolveNamedDestination\(dest\)/);
  assert.match(outline, /context\.resolvePageIndex\(destination\[0\]\)/);
  assert.match(outline, /pageIndex >= 0 && pageIndex < context\.pageCount/);
  assert.doesNotMatch(`${adapter}\n${outline}`, /window\.open|openUrl|external|javascript/i);

  assert.match(source, /type DocumentOutlineItem = \{/);
  assert.match(source, /let documentOutlineItems: DocumentOutlineItem\[\] = \[\]/);
  assert.match(source, /let preservedDocumentOutlineScrollTop: number \| null = null/);
  assert.match(source, /let preferredDocumentOutlineIndex: number \| null = null/);
  assert.match(source, /let preferredDocumentOutlinePageIndex: number \| null = null/);
  assert.match(source, /const documentOutlineSection = document\.querySelector<HTMLElement>\("#document-outline-section"\)/);
  assert.match(source, /function renderDocumentOutline\(\)/);
  assert.match(source, /function syncDocumentOutlineCurrentPage\(\)/);
  assert.match(source, /button\.textContent = item\.title/);
  assert.match(source, /button\.title = item\.title/);
  assert.match(source, /button\.dataset\.outlineIndex = String\(outlineIndex\)/);
  assert.match(source, /button\.style\.setProperty\("--outline-level", String\(item\.level\)\)/);
  assert.match(source, /void navigateFromDocumentOutline\(item\.pageIndex, outlineIndex\)/);
  assert.match(source, /from "\.\/readerNavigationState"/);
  assert.match(source, /const nextPreference = nextDocumentOutlinePreference\(\{/);
  assert.match(source, /const activeIndex = activeDocumentOutlineIndex\(\{/);
  assert.match(navigationState, /export function nextDocumentOutlinePreference/);
  assert.match(navigationState, /export function activeDocumentOutlineIndex/);
  assert.match(source, /if \(preservedDocumentOutlineScrollTop === null\) \{\s+activeButton\.scrollIntoView\(\{ block: "nearest" \}\);\s+\} else \{\s+documentOutlineList\.scrollTop = preservedDocumentOutlineScrollTop;\s+\}/);
  assert.match(source, /preservedDocumentOutlineScrollTop = documentOutlineList\?\.scrollTop \?\? null/);
  assert.match(source, /preferredDocumentOutlineIndex = outlineIndex/);
  assert.match(source, /preferredDocumentOutlinePageIndex = pageIndex/);
  assert.match(source, /finally \{[\s\S]*preservedDocumentOutlineScrollTop = null;[\s\S]*\}/);
  assert.doesNotMatch(source, /async function navigateFromPageNavigation[\s\S]*?keepDocumentOutlineScrollPosition = true/);
  assert.match(source, /async function readPdfOutlineBestEffort\(opened: PdfDocumentHandle\): Promise<DocumentOutlineItem\[\]>/);
  assert.match(source, /return await opened\.getOutline\(\)/);
  assert.match(source, /autoChapterNavigationItemsFromPage/);
  assert.match(source, /MIN_AUTO_CHAPTER_COUNT/);
  assert.match(source, /text: await opened\.getPageText\(pageIndex\)/);
  assert.match(source, /let autoChapterNavigationRequestId = 0/);
  assert.match(source, /let activeAutoChapterNavigationRequestId: number \| null = null/);
  assert.match(source, /function schedulePdfAutoChapterNavigation\(opened: PdfDocumentHandle, sessionId: string\)/);
  assert.match(source, /const requestId = \+\+autoChapterNavigationRequestId/);
  assert.match(source, /const MAX_AUTO_CHAPTER_SCAN_PAGES = 1000/);
  assert.match(source, /const scanPageCount = Math\.min\(opened\.pageCount, MAX_AUTO_CHAPTER_SCAN_PAGES\)/);
  assert.match(source, /for \(let pageIndex = 0; pageIndex < scanPageCount; pageIndex \+= 1\)/);
  assert.doesNotMatch(source, /for \(let pageIndex = 0; pageIndex < opened\.pageCount; pageIndex \+= 1\)/);
  assert.match(source, /const pageItems = autoChapterNavigationItemsFromPage\(\{/);
  assert.match(source, /if \(chapters\.length >= MIN_AUTO_CHAPTER_COUNT\) \{\s+hasPublished = publishPdfAutoChapterNavigation/);
  assert.match(source, /function canApplyPdfAutoChapterNavigation/);
  assert.match(source, /activeAutoChapterNavigationRequestId === requestId/);
  assert.match(source, /function publishPdfAutoChapterNavigation/);
  assert.match(source, /activeAutoChapterNavigationRequestId = requestId/);
  assert.match(source, /documentOutlineItems = chapters\.slice\(0, MAX_AUTO_CHAPTER_ITEMS\);\s+renderDocumentOutline\(\);\s+renderPageNavigation\(\);\s+updateReaderNavigationPanel\(\);/);
  assert.match(source, /setActivityFeedback\(`已本地识别 \$\{documentOutlineItems\.length\} 个章节导航，可能有少量误差`\)/);
  assert.match(source, /function canUseConvertedPdfDocumentOutline\(sourceFileType: string\)/);
  assert.match(source, /return sourceFileType === "pdf" \|\| isOfficeFileType\(sourceFileType\)/);
  assert.match(source, /if \(canUseConvertedPdfDocumentOutline\(sourceFileType\)\) \{\s+documentOutlineItems = await readPdfOutlineBestEffort\(opened\);\s+\}/);
  assert.match(source, /if \(canUseConvertedPdfDocumentOutline\(sourceFileType\) && documentOutlineItems\.length === 0\) \{\s+schedulePdfAutoChapterNavigation\(opened, session\.id\);\s+\}/);
  assert.match(source, /documentOutlineItems = \[\]/);
  assert.match(source, /renderDocumentOutline\(\);\s+renderPageNavigation\(\);/);
  assert.match(source, /syncDocumentOutlineCurrentPage\(\);\s+syncPageNavigationCurrentPage\(\);/);

  assert.match(css, /\.document-outline\s*{/);
  assert.match(css, /\.document-outline-list\s*{[^}]*overflow:\s*auto;/s);
  assert.match(css, /\.document-outline-button\[aria-current="page"\]/);
  assert.match(css, /padding-left:\s*calc\(24px \+ var\(--outline-level, 0\) \* 16px\);/);
});

test("MVP3 reader toolbar keeps existing controls inside semantic groups", () => {
  const html = readIndexHtml();

  for (const group of [
    "toolbar-group navigation-tools",
    "toolbar-group zoom-tools",
    "toolbar-group view-text-tools",
    "toolbar-group find-tools",
    "toolbar-group output-tools",
  ]) {
    assert.match(html, new RegExp(`class="${group}"`));
  }

  for (const id of [
    "previous-page",
    "page-number-input",
    "jump-page",
    "next-page",
    "zoom-out",
    "zoom-in",
    "reset-zoom",
    "fit-width",
    "fit-page",
    "more-reader-tools",
    "reader-tools-menu",
    "office-layout-preview",
    "rotate-view-left",
    "rotate-view-right",
    "reset-view-rotation",
    "select-current-page-text",
    "copy-current-page-text",
    "pdf-find-query",
    "find-previous",
    "find-next",
    "clear-find",
    "pdf-find-status",
    "print-document",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("MVP3 reader toolbar uses a compact product-style single row", () => {
  const html = readIndexHtml();
  const css = readStylesCss();

  assert.match(html, /class="toolbar-row toolbar-row-primary"/);
  assert.match(html, /class="toolbar-group find-tools"[\s\S]*class="find-controls"/);
  assert.doesNotMatch(html, /class="toolbar-row toolbar-row-secondary"/);
  assert.match(css, /\.toolbar\s*{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.toolbar-primary\s*{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(css, /\.icon-button\s*{[^}]*width:\s*36px;[^}]*padding:\s*0;/s);
  assert.match(css, /\.toolbar .button-label\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.find-tools\s*{[^}]*flex:\s*0 1 300px;[^}]*min-width:\s*260px;/s);
  assert.match(css, /\.find-controls\s*{[^}]*flex:\s*1;[^}]*min-width:\s*0;/s);
  assert.match(css, /#pdf-find-query\s*{[^}]*width:\s*132px;[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(css, /\.find-status\s*{[^}]*flex:\s*0 0 78px;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(css, /\.find-tools:focus-within\s*{[^}]*flex-basis:/s);
  assert.doesNotMatch(css, /#pdf-find-query:focus\s*{[^}]*width:/s);
});

test("product toolbar renders lucide icons with accessible labels and tooltips", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(source, /from "lucide"/);
  assert.match(source, /createIcons\(\{/);
  for (const icon of [
    "chevron-left",
    "chevron-right",
    "minus",
    "plus",
    "printer",
    "search",
    "arrow-up",
    "arrow-down",
    "x",
    "rotate-ccw",
    "rotate-cw",
    "copy",
    "ellipsis",
  ]) {
    assert.match(html, new RegExp(`data-icon="${icon}"`));
  }
  for (const id of ["previous-page", "next-page", "zoom-out", "zoom-in", "fit-width", "fit-page", "print-document", "find-previous", "find-next", "clear-find", "more-reader-tools"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*(?:title|aria-label)="`));
  }
});

test("low-frequency reader tools move behind the more menu", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();
  const readerToolsMenuMatch = html.match(/<div id="reader-tools-menu"[\s\S]*?<\/div>/);

  assert.match(html, /id="more-reader-tools"[^>]*aria-controls="reader-tools-menu"/);
  assert.match(html, /id="reader-tools-menu"[^>]*hidden[\s\S]*id="close-reader-tools-menu"[\s\S]*id="office-layout-preview"[\s\S]*id="select-current-page-text"[\s\S]*id="copy-current-page-text"/);
  assert.ok(readerToolsMenuMatch, "reader tools menu should exist");
  assert.doesNotMatch(readerToolsMenuMatch[0], /ofd-page-limit-description|OFD 性能设置/);
  assert.match(source, /const moreReaderToolsButton = document\.querySelector<HTMLButtonElement>\("#more-reader-tools"\)/);
  assert.match(source, /const closeReaderToolsMenuButton = document\.querySelector<HTMLButtonElement>\("#close-reader-tools-menu"\)/);
  assert.match(source, /const readerToolsMenu = document\.querySelector<HTMLElement>\("#reader-tools-menu"\)/);
  assert.match(source, /let isReaderToolsMenuOpen = false;/);
  assert.match(source, /function setReaderToolsMenuOpen\(open: boolean\)/);
  assert.match(source, /readerToolsMenu\.hidden = !isReaderToolsMenuOpen/);
  assert.match(source, /readerToolsMenu\.classList\.toggle\("is-open", isReaderToolsMenuOpen\)/);
  assert.match(source, /moreReaderToolsButton\?\.addEventListener\("click", toggleReaderToolsMenu\)/);
  assert.match(source, /closeReaderToolsMenuButton\?\.addEventListener\("click", closeReaderToolsMenu\)/);
  assert.doesNotMatch(source, /moreReaderToolsButton\.disabled && isReaderToolsMenuOpen[\s\S]*setReaderToolsMenuOpen\(false\)/);
  assert.match(source, /function positionReaderToolsMenu\(\)/);
  assert.match(source, /moreReaderToolsButton\.getBoundingClientRect\(\)/);
  assert.match(source, /readerToolsMenu\.style\.setProperty\("--reader-tools-menu-top"/);
  assert.match(css, /\.reader-tools-menu\s*{[^}]*padding:\s*38px 12px 8px;/s);
  assert.match(css, /\.reader-tools-menu\s*{[^}]*position:\s*fixed;[^}]*top:\s*var\(--reader-tools-menu-top, 72px\);[^}]*right:\s*16px;/s);
  assert.match(css, /\.reader-tools-menu\s*{[^}]*max-width:\s*calc\(100vw - 32px\);/s);
  assert.match(css, /\.reader-tools-menu-close\s*{[^}]*position:\s*absolute;[^}]*top:\s*6px;[^}]*right:\s*6px;/s);
  assert.match(css, /\.reader-tools-menu-close\s*{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
});

test("OFD page limit presets are exposed in settings", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();

  assert.match(html, /id="settings-panel"[\s\S]*id="settings-ofd-section"[\s\S]*<fieldset class="ofd-page-limit-settings"[\s\S]*<legend>OFD 性能设置<\/legend>/);
  assert.match(html, /name="ofd-page-limit-preset"[^>]*value="stable"[^>]*checked/);
  assert.match(html, /稳定模式（最多 20 页）/);
  assert.match(html, /name="ofd-page-limit-preset"[^>]*value="extended"/);
  assert.match(html, /扩展模式（最多 50 页）/);
  assert.match(html, /name="ofd-page-limit-preset"[^>]*value="long_experimental"/);
  assert.match(html, /长文档实验模式（最多 200 页）/);
  assert.match(html, /id="ofd-page-limit-description"/);

  assert.match(source, /from "\.\/ofdDocumentPolicyState"/);
  assert.match(source, /const ofdPageLimitOptions = Array\.from\(document\.querySelectorAll<HTMLInputElement>\("input\[name='ofd-page-limit-preset'\]"\)\)/);
  assert.match(source, /option\.addEventListener\("change", \(\) => \{[\s\S]*setOfdPageLimitPreset\(option\.value as OfdPageLimitPresetId\)/);
  assert.match(source, /session\.file_type === "ofd" && canUseOfdContinuousViewForPreset\(ofdPageLimitPresetId\)/);
  assert.match(source, /function assertOfdOpenPolicy\(documentSession: DocumentSession\)/);
  assert.match(source, /ofdOpenPolicyForPageCount\(\{[\s\S]*pageCount: documentSession\.page_count,[\s\S]*presetId: ofdPageLimitPresetId,[\s\S]*\}\)/);
  assert.match(source, /async function openLocalOfdPath[\s\S]*assertOfdOpenPolicy\(session\)/);
  assert.match(source, /async function openRecentFile[\s\S]*assertOfdOpenPolicy\(session\)/);

  assert.match(css, /\.ofd-page-limit-settings\s*{[^}]*grid-column:\s*1 \/ -1;/s);
  assert.match(css, /\.ofd-page-limit-description\s*{[^}]*font-size:\s*12px;/s);
});

test("MVP3 reader sidebar keeps current document name readable while short metadata stays compact", () => {
  const html = readIndexHtml();
  const css = readStylesCss();

  assert.match(html, /class="metadata-document-name"[\s\S]*id="document-name"/);
  assert.match(css, /\.metadata\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s);
  assert.match(css, /\.metadata-document-name\s*{[^}]*grid-column:\s*1 \/ -1;/s);
  assert.match(css, /\.current-document-section\s*{[^}]*gap:\s*8px;/s);
  assert.match(css, /\.metadata dt\s*{[^}]*font-size:\s*11px;/s);
});

test("MVP3 reader separates document lifecycle status from short action feedback", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();
  const overlayPosition = readOverlayPositionTs();

  assert.match(html, /id="document-status"/);
  assert.match(html, /id="activity-feedback"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /id="activity-feedback" class="activity-feedback" aria-live="polite" hidden/);
  assert.match(html, /<\/header>\s*<p id="activity-feedback"[\s\S]*?<\/p>\s*<div id="reader-workspace"/);
  assert.match(css, /\.viewer\s*{[^}]*position:\s*relative;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*position:\s*absolute;/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*top:\s*var\(--activity-feedback-y, 68px\);/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*left:\s*var\(--activity-feedback-x, 50%\);/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*transform:\s*translateX\(var\(--activity-feedback-translate-x, -50%\)\);/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*cursor:\s*grab;/s);
  assert.match(css, /\.activity-feedback\[hidden\]\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*text-align:\s*center;/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*white-space:\s*nowrap;/s);
  assert.match(css, /\.activity-feedback\s*{[^}]*text-overflow:\s*ellipsis;/s);
  assert.match(html, /id="error-diagnostic-overlay" class="error-diagnostic-overlay" hidden[\s\S]*id="close-error-diagnostic-overlay"[\s\S]*id="error-message"[\s\S]*id="copy-diagnostic-info"/);
  assert.match(css, /\.error-diagnostic-overlay\s*{[^}]*position:\s*absolute;[^}]*top:\s*var\(--error-diagnostic-overlay-y, 50%\);[^}]*left:\s*var\(--error-diagnostic-overlay-x, 50%\);/s);
  assert.match(css, /\.error-diagnostic-overlay\s*{[^}]*max-width:\s*var\(--error-diagnostic-overlay-max-width, min\(520px, calc\(100% - 48px\)\)\);/s);
  assert.match(css, /\.error-diagnostic-overlay\s*{[^}]*cursor:\s*grab;/s);
  assert.match(css, /\.error-diagnostic-overlay\s*{[^}]*touch-action:\s*none;/s);
  assert.match(css, /\.error-diagnostic-overlay\.is-dragging\s*{[^}]*cursor:\s*grabbing;/s);
  assert.doesNotMatch(css, /\.error-diagnostic-overlay\s*{[^}]*right:\s*18px;/s);
  assert.doesNotMatch(css, /\.error-diagnostic-overlay\s*{[^}]*bottom:\s*12px;/s);
  assert.match(css, /\.error-diagnostic-overlay\s*{[^}]*background:\s*var\(--ldv-danger-bg\);/s);
  assert.match(css, /\.error-diagnostic-overlay\[hidden\]\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.error-diagnostic-close\s*{[^}]*position:\s*absolute;[^}]*top:\s*6px;[^}]*right:\s*6px;/s);
  assert.match(source, /let currentDocumentStatus = "待命";/);
  assert.match(source, /let currentActivityFeedback = "";/);
  assert.match(source, /let isErrorDiagnosticOverlayDismissed = false;/);
  assert.match(source, /from "\.\/overlayPosition"/);
  assert.match(source, /let activityFeedbackUserPosition: Point \| null = null;/);
  assert.match(source, /const errorDiagnosticOverlay = document\.querySelector<HTMLElement>\("#error-diagnostic-overlay"\)/);
  assert.match(source, /const closeErrorDiagnosticOverlayButton = document\.querySelector<HTMLButtonElement>\("#close-error-diagnostic-overlay"\)/);
  assert.match(source, /function setDocumentStatus\(status: DocumentLifecycleStatus\)/);
  assert.match(source, /function setActivityFeedback\(message: string\)/);
  assert.match(source, /function dismissErrorDiagnosticOverlay\(\)/);
  assert.match(source, /function updateErrorDiagnosticOverlay\(\)/);
  assert.match(source, /function clampActivityFeedbackPosition\(left: number, top: number\)/);
  assert.match(source, /function syncActivityFeedbackPosition\(\)/);
  assert.match(source, /function startActivityFeedbackDrag\(event: PointerEvent\)/);
  assert.match(source, /let errorDiagnosticOverlayUserPosition: Point \| null = null;/);
  assert.match(source, /function clampErrorDiagnosticOverlayPosition\(left: number, top: number\)/);
  assert.match(source, /function syncErrorDiagnosticOverlayPosition\(\)/);
  assert.match(source, /function startErrorDiagnosticOverlayDrag\(event: PointerEvent\)/);
  assert.match(overlayPosition, /export function centeredTopOverlayPosition/);
  assert.match(overlayPosition, /export function centeredBottomOverlayPosition/);
  assert.match(overlayPosition, /export function clampOverlayPosition/);
  assert.match(overlayPosition, /export function overlayMaxWidth/);
  assert.match(source, /activityFeedback\.textContent = currentActivityFeedback/);
  assert.match(source, /activityFeedback\.hidden = currentActivityFeedback\.trim\(\)\.length === 0/);
  assert.match(source, /activityFeedback\?\.addEventListener\("pointerdown", startActivityFeedbackDrag\)/);
  assert.match(source, /errorDiagnosticOverlay\?\.addEventListener\("pointerdown", startErrorDiagnosticOverlayDrag\)/);
  assert.match(source, /closeErrorDiagnosticOverlayButton\?\.addEventListener\("click", dismissErrorDiagnosticOverlay\)/);
  assert.match(source, /syncActivityFeedbackPosition\(\)/);
  assert.match(source, /syncErrorDiagnosticOverlayPosition\(\)/);
});

test("document lifecycle status no longer carries short action messages", () => {
  const source = readMainTs();
  const lifecycleMatch = source.match(/type DocumentLifecycleStatus =([\s\S]*?);/);

  assert.ok(lifecycleMatch, "DocumentLifecycleStatus should be declared");
  for (const status of [
    "待命",
    "正在打开",
    "正在解析 OFD",
    "正在渲染 OFD 页面",
    "正在加载缓存",
    "已打开",
    "操作失败",
  ]) {
    assert.match(lifecycleMatch[1], new RegExp(`"${status}"`));
  }
  for (const shortAction of [
    "本页文字已复制",
    "未找到匹配内容。",
    "已发送打印请求",
    "缓存已清理",
    "诊断信息已复制",
  ]) {
    assert.doesNotMatch(lifecycleMatch[1], new RegExp(escapeRegExp(shortAction)));
  }
});

test("short reader actions update activity feedback instead of document status", () => {
  const source = readMainTs();

  for (const message of [
    "已全选当前页文字",
    "缓存已清理",
    "诊断信息已复制",
    "已清除查找",
    "未找到匹配内容。",
    "已定位匹配内容",
    "已发送打印请求",
    "当前页没有可复制文本。",
    "本页文字已复制",
  ]) {
    assert.match(source, new RegExp(`setActivityFeedback\\("${escapeRegExp(message)}"\\)`));
    assert.doesNotMatch(source, new RegExp(`currentDocumentStatus = "${escapeRegExp(message)}"`));
  }
});

test("office preview layout toggle reports the selected layout in short feedback", () => {
  const source = readMainTs();

  assert.match(source, /setActivityFeedback\("已切换为适宽预览"\)/);
  assert.match(source, /setActivityFeedback\("已切换为原版预览"\)/);
});

test("reader exposes a reversible focus reading mode without hiding the toolbar", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();
  const sidebarTitleMatch = html.match(/<div class="document-center-title">[\s\S]*?<\/div>\s*<section id="document-open-section"/);
  const railMatch = html.match(/<nav id="document-center-rail"[\s\S]*?<\/nav>/);
  const readerToolsMenuMatch = html.match(/<div id="reader-tools-menu"[\s\S]*?<\/div>/);

  assert.ok(sidebarTitleMatch, "document center title should contain header actions");
  assert.match(sidebarTitleMatch[0], /id="focus-reading-mode"[\s\S]*id="open-settings-panel"[\s\S]*id="open-help-panel"[\s\S]*id="collapse-document-center"/);
  assert.match(sidebarTitleMatch[0], /id="focus-reading-mode"[^>]*class="icon-button document-center-focus"/);
  assert.match(sidebarTitleMatch[0], /id="focus-reading-mode"[^>]*title="专注阅读 \(Ctrl\+Shift\+F\)"/);
  assert.match(sidebarTitleMatch[0], /id="focus-reading-mode"[^>]*aria-pressed="false"/);
  assert.match(sidebarTitleMatch[0], /id="focus-reading-mode"[\s\S]*data-icon="focus"/);
  assert.doesNotMatch(sidebarTitleMatch[0], />专注阅读<|>退出专注</);
  assert.ok(railMatch, "collapsed document center rail should exist");
  assert.match(railMatch[0], /id="expand-document-center"[\s\S]*id="rail-open-local-document"[\s\S]*id="rail-focus-reading-mode"[\s\S]*id="rail-open-settings-panel"[\s\S]*id="rail-open-help-panel"/);
  assert.match(railMatch[0], /id="expand-document-center"[^>]*title="展开侧栏 \(Ctrl\+Shift\+B\)"/);
  assert.match(railMatch[0], /id="rail-focus-reading-mode"[^>]*class="icon-button document-center-rail-button"/);
  assert.match(railMatch[0], /id="rail-focus-reading-mode"[^>]*title="专注阅读 \(Ctrl\+Shift\+F\)"/);
  assert.match(railMatch[0], /id="rail-focus-reading-mode"[^>]*aria-pressed="false"/);
  assert.match(railMatch[0], /id="rail-focus-reading-mode"[\s\S]*data-icon="focus"/);
  assert.ok(readerToolsMenuMatch, "reader tools menu should exist");
  assert.doesNotMatch(readerToolsMenuMatch[0], /id="focus-reading-mode"|id="rail-focus-reading-mode"/);
  assert.match(css, /body\[data-focus-reading-mode="true"\]\s+\.activity-feedback\s*{[^}]*display:\s*none;/s);
  assert.match(css, /body\[data-focus-reading-mode="true"\]\s+\.error-diagnostic-overlay\s*{[^}]*display:\s*none;/s);
  assert.doesNotMatch(css, /body\[data-focus-reading-mode="true"\]\s+\.toolbar\s*{[^}]*display:\s*none;/s);
  assert.match(source, /let isFocusReadingMode = false;/);
  assert.match(source, /let focusReadingSnapshot: \{\s*documentCenterCollapsed: boolean;\s*readerNavigationOpen: boolean;\s*readerNavigationUserPreference: boolean;\s*activityFeedback: string;\s*errorDiagnosticDismissed: boolean;\s*\} \| null = null;/s);
  assert.match(source, /function enterFocusReadingMode\(\)/);
  assert.match(source, /function exitFocusReadingMode\(\)/);
  assert.match(source, /function toggleFocusReadingMode\(\)/);
  assert.match(source, /const focusReadingModeButton = document\.querySelector<HTMLButtonElement>\("#focus-reading-mode"\)/);
  assert.match(source, /const railFocusReadingModeButton = document\.querySelector<HTMLButtonElement>\("#rail-focus-reading-mode"\)/);
  assert.match(source, /focusReadingSnapshot = \{[\s\S]*documentCenterCollapsed: isDocumentCenterCollapsed,[\s\S]*readerNavigationOpen: isReaderNavigationOpen,[\s\S]*readerNavigationUserPreference: hasReaderNavigationUserPreference,[\s\S]*activityFeedback: currentActivityFeedback,[\s\S]*errorDiagnosticDismissed: isErrorDiagnosticOverlayDismissed,[\s\S]*\}/);
  assert.match(source, /hasReaderNavigationUserPreference = snapshot\.readerNavigationUserPreference;[\s\S]*setReaderNavigationOpen\(snapshot\.readerNavigationOpen\);/);
  assert.match(source, /setDocumentCenterCollapsed\(true\)/);
  assert.match(source, /setReaderNavigationOpen\(false\)/);
  assert.match(source, /if \(isFocusReadingMode\) \{[\s\S]*setReaderNavigationOpen\(false\);[\s\S]*return;[\s\S]*\}/);
  assert.match(source, /document\.body\.dataset\.focusReadingMode = String\(isFocusReadingMode\)/);
  assert.match(source, /focusReadingModeButton\?\.addEventListener\("click", toggleFocusReadingMode\)/);
  assert.match(source, /railFocusReadingModeButton\?\.addEventListener\("click", toggleFocusReadingMode\)/);
  assert.match(source, /for \(const button of focusReadingModeButtons\)/);
  assert.match(source, /button\.setAttribute\("aria-pressed", String\(isFocusReadingMode\)\)/);
  assert.doesNotMatch(source, /focusReadingModeButton\.textContent = isFocusReadingMode \? "退出专注" : "专注阅读"/);
  assert.match(source, /setActivityFeedback\("已进入专注阅读"\)/);
  assert.match(source, /setActivityFeedback\("已退出专注阅读"\)/);
});

test("reader metadata syncs bookmark panel state before updating bookmark controls", () => {
  const source = readMainTs();
  const updateMetadataMatch = source.match(/function updateMetadata\(\) \{[\s\S]*?\n\}/);

  assert.ok(updateMetadataMatch, "updateMetadata should exist");
  assert.match(
    updateMetadataMatch[0],
    /updateReaderNavigationPanel\(\);[\s\S]*const navigationControlsState = readerNavigationControlsState\(\{/,
  );
});

test("more reader tools button toggles its menu open and closed", () => {
  const source = readMainTs();

  assert.match(source, /function toggleReaderToolsMenu\(\)/);
  assert.match(source, /setReaderToolsMenuOpen\(!isReaderToolsMenuOpen\)/);
  assert.match(source, /moreReaderToolsButton\?\.addEventListener\("click", toggleReaderToolsMenu\)/);
  assert.doesNotMatch(source, /moreReaderToolsButton\?\.addEventListener\("click", openReaderToolsMenu\)/);
});

test("reader toolbar exposes fit controls for common reading layouts", () => {
  const html = readIndexHtml();

  assert.match(html, /id="reset-zoom"/);
  assert.match(html, /id="fit-width"/);
  assert.match(html, /id="fit-page"/);
  assert.match(html, />100%</);
  assert.match(html, />适宽</);
  assert.match(html, />整页</);
});

test("reader toolbar exposes PDF view rotation controls without flip controls", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const adapter = readPdfAdapterTs();

  assert.match(html, /id="rotate-view-left"/);
  assert.match(html, /aria-label="向左旋转视图"/);
  assert.match(html, /id="rotate-view-right"/);
  assert.match(html, /aria-label="向右旋转视图"/);
  assert.match(html, /id="reset-view-rotation"/);
  assert.match(html, /aria-label="重置视图旋转"/);
  assert.doesNotMatch(html, /flip|mirror|翻转|镜像/i);
  assert.match(source, /let pdfViewRotation: ViewRotation = 0/);
  assert.match(source, /function canRotatePdfView\(\)/);
  assert.match(source, /async function rotatePdfView\(direction: 1 \| -1\)/);
  assert.match(source, /async function resetPdfViewRotation\(\)/);
  assert.match(source, /const previousRotation = pdfViewRotation;\s*const nextRotation = nextViewRotation\(pdfViewRotation, direction\);\s*pdfViewRotation = nextRotation;/s);
  assert.match(source, /setActivityFeedback\(rotationActivityFeedback\(nextRotation\)\)/);
  assert.match(source, /function rotationActivityFeedback\(rotation: ViewRotation\) \{[\s\S]*return rotation === 0 \? "已回到原始方向" : `视图已旋转 \$\{rotation\}°`;/);
  assert.doesNotMatch(source, /setActivityFeedback\(`视图已旋转 \$\{nextRotation\}°`\)/);
  assert.match(source, /catch \(error\) \{\s*pdfViewRotation = previousRotation;\s*showError\(error\);/s);
  assert.match(source, /const previousRotation = pdfViewRotation;\s*pdfViewRotation = 0;/s);
  assert.match(source, /catch \(error\) \{\s*pdfViewRotation = previousRotation;\s*showError\(error\);/s);
  assert.match(source, /rotatedViewSize\(size, pdfViewRotation\)/);
  assert.match(source, /pdfViewRotation = 0/);
  assert.match(source, /activePdfDocument\.renderPageToCanvas\(currentPage, pageCanvas, scale, pdfViewRotation\)/);
  assert.match(source, /activePdfDocument\.renderPageTextLayer\(currentPage, pageTextLayer, scale, pdfViewRotation\)/);
  assert.match(adapter, /viewRotation/);
  assert.match(adapter, /page\.rotate \+ viewRotation/);
});

test("reader toolbar exposes direct page jump controls", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, /id="page-number-input"/);
  assert.match(html, /inputmode="numeric"/);
  assert.match(html, /aria-label="当前页码"/);
  assert.match(html, /id="page-total-label"/);
  assert.match(html, /id="jump-page"/);
  assert.match(html, />跳转</);
  assert.match(source, /from "\.\/pageNavigation"/);
  assert.match(source, /pageNumberInput/);
  assert.match(source, /jumpPageButton/);
  assert.match(source, /parsePageJumpInput/);
  assert.match(source, /async function jumpToPageInput\(\)/);
  assert.match(source, /pageNumberInput\?\.addEventListener\("keydown"/);
  assert.match(source, /jumpPageButton\?\.addEventListener\("click", jumpToPageInput\)/);
});

test("direct page jump restores reading status after a successful render", () => {
  const source = readMainTs();
  const match = source.match(/async function jumpToPageInput\(\) \{([\s\S]*?)\n\}/);

  assert.ok(match, "jumpToPageInput block should be found");
  assert.match(match[1], /setActivityFeedback\(parsed\.message\)/);
  assert.match(match[1], /await navigateToPage\(parsed\.pageIndex\);\s+setDocumentStatus\("已打开"\);/);
});

test("reader toolbar exposes a basic print entry", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, /id="print-document"/);
  assert.match(html, /title="打印[^"]*"/);
  assert.match(html, /aria-label="打印"/);
  assert.match(html, />打印</);
  assert.match(source, /printDocumentButton/);
  assert.match(source, /window\.print\(\)/);
  assert.match(source, /printDocumentButton\.disabled = toolbarState\.printDocumentDisabled/);
});

test("reader print entry dispatches one-click print without an app-side settings step", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.doesNotMatch(html, /id="print-settings-panel"/);
  assert.doesNotMatch(source, /function openPrintSettings\(\)/);
  assert.doesNotMatch(source, /async function runPrintFromSettings\(\)/);
  assert.match(source, /printDocumentButton\?\.addEventListener\("click", \(\) => \{\s+void printDocument\(\);\s+\}\)/);
});

test("PDF print does not auto-launch Blob iframe popup or external PDF apps", () => {
  const source = readMainTs();

  assert.doesNotMatch(source, /type PdfPrintTarget =/);
  assert.doesNotMatch(source, /currentPdfPrintTarget/);
  assert.doesNotMatch(source, /open_pdf_with_system_viewer/);
  assert.doesNotMatch(source, /ShellExecute|xdg-open/i);
  assert.doesNotMatch(source, /new Blob\(\[currentPdfPrintBytes\.slice\(\)\], \{ type: "application\/pdf" \}\)/);
  assert.doesNotMatch(source, /document\.createElement\("iframe"\)/);
  assert.doesNotMatch(source, /URL\.createObjectURL/);
  assert.doesNotMatch(source, /printWindow\.print\(\)/);
});

test("reader toolbar exposes current-page text copy for PDF and OFD", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const adapter = readPdfAdapterTs();

  assert.match(html, /id="copy-current-page-text"/);
  assert.match(html, /title="复制当前页文字[^"]*"/);
  assert.match(html, /aria-label="复制当前页文字"/);
  assert.match(html, />复制文字</);
  assert.match(source, /copyCurrentPageTextButton/);
  assert.match(source, /copyCurrentPageTextButton\.disabled =/);
  assert.match(source, /function canCopyCurrentPageText\(\)/);
  assert.match(source, /session\.file_type === "pdf"/);
  assert.match(source, /session\.file_type === "ofd"/);
  assert.match(source, /pageTextLayer\.dataset\.textLayerEmpty === "true"/);
  assert.match(source, /pageTextLayer\.dataset\.textLayerUnavailable === "true"/);
  assert.match(source, /async function copyCurrentPageText\(\)/);
  assert.match(source, /async function currentOfdPageText\(\)/);
  assert.match(source, /pdfDocument\.getPageText\(currentPage\)/);
  assert.match(source, /invoke<OfdTextView>\("local_ofd_text"/);
  assert.match(source, /maxPages:\s*1/);
  assert.match(source, /pageIndex:\s*currentPage/);
  assert.match(source, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(source, /setActivityFeedback\("本页文字已复制"\)/);
  assert.match(source, /setActivityFeedback\("当前页没有可复制文本。"\)/);
  assert.match(source, /setActivityFeedback\("无法复制本页文字，请稍后重试。"\)/);
  assert.match(source, /copyCurrentPageTextButton\?\.addEventListener\("click", copyCurrentPageText\)/);
  assert.doesNotMatch(source, /getTextContent/);
  assert.match(adapter, /getPageText/);
  assert.match(adapter, /getTextContent\(\)/);
});

test("reader toolbar exposes PDF current-page text selection", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, /id="select-current-page-text"/);
  assert.match(html, /title="全选当前页文字[^"]*"/);
  assert.match(html, /aria-label="全选当前页文字"/);
  assert.match(html, />全选文字</);
  assert.doesNotMatch(html, />全选全文</);
  assert.match(source, /selectCurrentPageTextButton/);
  assert.match(source, /function canSelectCurrentPageText\(\)/);
  assert.match(source, /function selectCurrentPageText\(\)/);
  assert.match(source, /selectCurrentPageTextButton\?\.addEventListener\("click", selectCurrentPageText\)/);
});

test("reader toolbar exposes document find controls", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, /id="pdf-find-query"/);
  assert.match(html, /placeholder="查找"/);
  assert.match(html, /aria-label="查找"/);
  assert.match(html, /maxlength="128"/);
  assert.match(html, /id="find-previous"/);
  assert.match(html, /aria-label="向前查找"/);
  assert.match(html, /id="find-next"/);
  assert.match(html, /aria-label="向后查找"/);
  assert.match(html, /id="clear-find"/);
  assert.match(html, /id="pdf-find-status"/);
  assert.match(source, /from "\.\/documentFind"/);
  assert.match(source, /findQueryInput/);
  assert.match(source, /findPreviousButton/);
  assert.match(source, /findNextButton/);
  assert.match(source, /clearFindButton/);
});

test("find input disables browser-managed history and suggestions", () => {
  const html = readIndexHtml();

  assert.match(html, /id="pdf-find-query"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /autocapitalize="off"/);
  assert.match(html, /autocorrect="off"/);
  assert.match(html, /spellcheck="false"/);
});

test("document find status is unambiguous and avoids risky query sinks", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const statusMatch = source.match(/function updateDocumentFindStatus\(\) \{([\s\S]*?)\n\}/);

  assert.ok(statusMatch, "updateDocumentFindStatus block should be found");
  assert.match(statusMatch[1], /命中 \$\{documentFindActiveIndex \+ 1\} \/ \$\{documentFindMatches\.length\}/);
  assert.doesNotMatch(statusMatch[1], /无结果/);
  assert.doesNotMatch(`${html}\n${source}`, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/);
});

test("document find uses PDF adapter or OFD text command and keeps query out of diagnostics", () => {
  const source = readMainTs();
  const ofdTextBridgeSource = readFileSync(resolve(desktopRoot, "src", "ofdTextBridge.ts"), "utf8");
  const findMatch = source.match(/async function rebuildDocumentFindMatches\(\) \{([\s\S]*?)\n\}/);
  const pageTextMatch = source.match(/async function documentFindPageTexts\(\)[^{]*\{([\s\S]*?)\n\}/);
  const summaryMatch = source.match(/function diagnosticSummaryText\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.ok(findMatch, "rebuildDocumentFindMatches block should be found");
  assert.ok(pageTextMatch, "documentFindPageTexts block should be found");
  assert.ok(summaryMatch, "diagnosticSummaryText block should be found");
  assert.match(source, /buildDocumentFindMatches/);
  assert.match(source, /nextDocumentFindIndex/);
  assert.match(pageTextMatch[1], /activePdfDocument\.getPageText\(pageIndex\)/);
  assert.match(pageTextMatch[1], /invoke<OfdTextView>\("local_ofd_text"/);
  assert.match(pageTextMatch[1], /sessionId:\s*session\.id/);
  assert.match(pageTextMatch[1], /maxPages:\s*20/);
  assert.match(pageTextMatch[1], /documentFindPageTextsFromOfdView\(text\)/);
  assert.match(ofdTextBridgeSource, /pageIndex: page\.index/);
  assert.match(ofdTextBridgeSource, /text: page\.text/);
  assert.doesNotMatch(source, /getTextContent/);
  assert.doesNotMatch(summaryMatch[1], /documentFindQuery/);
  assert.doesNotMatch(summaryMatch[1], /findQueryInput/);
  assert.doesNotMatch(summaryMatch[1], /OfdTextView|local_ofd_text|pageTextLayer|clipboard|selection/i);
});

test("document find wires keyboard and button navigation", () => {
  const source = readMainTs();

  assert.match(source, /async function moveDocumentFind\(direction: 1 \| -1\)/);
  assert.match(source, /findQueryInput\?\.addEventListener\("keydown"/);
  assert.match(source, /findQueryInput\?\.addEventListener\("input"/);
  assert.match(source, /event\.key === "Enter"/);
  assert.match(source, /event\.shiftKey \? -1 : 1/);
  assert.match(source, /findPreviousButton\?\.addEventListener\("click", \(\) => moveDocumentFind\(-1\)\)/);
  assert.match(source, /findNextButton\?\.addEventListener\("click", \(\) => moveDocumentFind\(1\)\)/);
  assert.match(source, /clearFindButton\?\.addEventListener\("click", clearDocumentFind\)/);
});

test("document find reuses existing matches when stepping through results", () => {
  const source = readMainTs();
  const moveFindMatch = source.match(/async function moveDocumentFind\(direction: 1 \| -1\) \{([\s\S]*?)\n\}/);

  assert.ok(moveFindMatch, "moveDocumentFind block should be found");
  assert.match(moveFindMatch[1], /const nextQuery = normalizeDocumentFindQuery\(findQueryInput\.value\)/);
  assert.match(moveFindMatch[1], /if \(nextQuery !== documentFindQuery \|\| documentFindMatches\.length === 0\) \{\s*await rebuildDocumentFindMatches\(\);\s*}/);
  assert.match(moveFindMatch[1], /documentFindActiveIndex = nextDocumentFindIndex\(documentFindActiveIndex, documentFindMatches\.length, direction\)/);
  assert.doesNotMatch(moveFindMatch[1], /await rebuildDocumentFindMatches\(\);[\s\S]*await rebuildDocumentFindMatches\(\);/);
});

test("document find is enabled for PDF OFD and text sessions", () => {
  const source = readMainTs();
  const readerActionState = readReaderActionStateTs();
  const helperMatch = source.match(/function canUseDocumentFind\(\) \{([\s\S]*?)\n\}/);
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);

  assert.ok(helperMatch, "canUseDocumentFind block should be found");
  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.match(helperMatch[1], /canUseDocumentFindState\(\{/);
  assert.match(helperMatch[1], /fileType: session\?\.file_type \?\? null/);
  assert.match(helperMatch[1], /hasActivePdfDocument: !!activePdfDocument/);
  assert.match(readerActionState, /state\.fileType === "pdf"[\s\S]*state\.hasActivePdfDocument/);
  assert.match(readerActionState, /state\.fileType === "ofd"/);
  assert.match(metadataMatch[1], /findQueryInput\.disabled = isBusy \|\| isFindingDocument \|\| !canUseDocumentFind\(\)/);
});

test("text preview enables find select copy and print while keeping zoom and rotation disabled", () => {
  const source = readMainTs();
  const readerActionState = readReaderActionStateTs();
  const helperMatch = source.match(/function canUseDocumentFind\(\) \{([\s\S]*?)\n\}/);
  const copyMatch = source.match(/function canCopyCurrentPageText\(\) \{([\s\S]*?)\n\}/);
  const selectMatch = source.match(/function canSelectCurrentPageText\(\) \{([\s\S]*?)\n\}/);
  const scaleMatch = source.match(/function canScaleCurrentDocument\(\) \{([\s\S]*?)\n\}/);
  const rotateMatch = source.match(/function canRotatePdfView\(\) \{([\s\S]*?)\n\}/);
  const printMatch = source.match(/async function printDocument\([^)]*\) \{([\s\S]*?)\n\}/);
  const preparePrintMatch = source.match(/function preparePrintLayout\(request: PrintRequest\) \{([\s\S]*?)\n\}/);
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);

  assert.ok(helperMatch, "canUseDocumentFind block should be found");
  assert.ok(copyMatch, "canCopyCurrentPageText block should be found");
  assert.ok(selectMatch, "canSelectCurrentPageText block should be found");
  assert.ok(scaleMatch, "canScaleCurrentDocument block should be found");
  assert.ok(rotateMatch, "canRotatePdfView block should be found");
  assert.ok(printMatch, "printDocument block should be found");
  assert.ok(preparePrintMatch, "preparePrintLayout block should be found");
  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.match(source, /function isTextSession\(\) \{[\s\S]*isTextFileType\(session\.file_type\)[\s\S]*\}/);
  assert.match(source, /function hasTextPreviewContent\(\) \{[\s\S]*isTextSession\(\)[\s\S]*currentTextDocumentText\.length > 0[\s\S]*\}/);
  assert.match(helperMatch[1], /canUseDocumentFindState\(\{/);
  for (const fileType of ["txt", "log", "csv", "md"]) {
    assert.match(readerActionState, new RegExp(`state\\.fileType === "${fileType}"`));
  }
  assert.match(copyMatch[1], /canCopyCurrentPageTextState\(\{/);
  assert.match(copyMatch[1], /hasTextPreviewContent: hasTextPreviewContent\(\)/);
  assert.match(selectMatch[1], /canSelectCurrentPageTextState\(\{/);
  assert.match(selectMatch[1], /isTextSession: isTextSession\(\)/);
  assert.match(selectMatch[1], /hasTextPreviewContent: hasTextPreviewContent\(\)/);
  assert.match(scaleMatch[1], /canScaleCurrentDocumentState\(\{/);
  assert.match(scaleMatch[1], /isTextSession: isTextSession\(\)/);
  assert.match(rotateMatch[1], /canRotateViewState\(\{/);
  assert.match(rotateMatch[1], /hasActivePdfDocument: !!activePdfDocument/);
  assert.match(source, /preparePrintLayout\(resolvedRequest\)/);
  assert.match(preparePrintMatch[1], /singlePagePrintState/);
  assert.match(source, /function applyPrintBodyState\(state: PrintBodyState\)/);
  assert.match(source, /document\.body\.dataset\.printDocumentMode = state\.printDocumentMode/);
  assert.match(metadataMatch[1], /zoomOutButton\.disabled = toolbarState\.zoomOutDisabled/);
  assert.match(metadataMatch[1], /fitWidthButton\.disabled = toolbarState\.fitWidthDisabled/);
});

test("PDF current-page text selection uses browser Selection within the text layer", () => {
  const source = readMainTs();
  const selectMatch = source.match(/function selectCurrentPageText\(\) \{([\s\S]*?)\n\}/);
  const selectedMatch = source.match(/function selectedPdfText\(\) \{([\s\S]*?)\n\}/);

  assert.ok(selectMatch, "selectCurrentPageText block should be found");
  assert.ok(selectedMatch, "selectedPdfText block should be found");
  assert.match(selectMatch[1], /document\.createRange\(\)/);
  assert.match(selectMatch[1], /range\.selectNodeContents\(pageTextLayer\)/);
  assert.match(selectMatch[1], /window\.getSelection\(\)/);
  assert.match(selectMatch[1], /selection\.removeAllRanges\(\)/);
  assert.match(selectMatch[1], /selection\.addRange\(range\)/);
  assert.match(selectedMatch[1], /window\.getSelection\(\)/);
  assert.match(selectedMatch[1], /pageTextLayer\.contains\(selection\.anchorNode\)/);
  assert.match(selectedMatch[1], /pageTextLayer\.contains\(selection\.focusNode\)/);
  assert.match(selectedMatch[1], /selection\.toString\(\)\.trim\(\)/);
});

test("PDF copy action prefers a current text-layer selection before full-page text", () => {
  const source = readMainTs();
  const copyMatch = source.match(/async function copyCurrentPageText\(\) \{([\s\S]*?)\n\}/);

  assert.ok(copyMatch, "copyCurrentPageText block should be found");
  assert.match(copyMatch[1], /const selectedText = selectedPdfText\(\);/);
  assert.match(copyMatch[1], /selectedText \?\? \(await pdfDocument\.getPageText\(currentPage\)\)\.trim\(\)/);
});

test("OFD copy action writes current sidecar page text without requiring a text layer", () => {
  const source = readMainTs();
  const ofdTextBridgeSource = readFileSync(resolve(desktopRoot, "src", "ofdTextBridge.ts"), "utf8");
  const helperMatch = source.match(/async function currentOfdPageText\(\)[:\s\w<>]*\{([\s\S]*?)\n\}/);
  const copyMatch = source.match(/async function copyCurrentPageText\(\) \{([\s\S]*?)\n\}/);

  assert.ok(helperMatch, "currentOfdPageText block should be found");
  assert.ok(copyMatch, "copyCurrentPageText block should be found");
  assert.match(helperMatch[1], /session\.file_type !== "ofd"/);
  assert.match(helperMatch[1], /invoke<OfdTextView>\("local_ofd_text"/);
  assert.match(helperMatch[1], /sessionId:\s*session\.id/);
  assert.match(helperMatch[1], /maxPages:\s*1/);
  assert.match(helperMatch[1], /pageIndex:\s*currentPage/);
  assert.match(helperMatch[1], /currentOfdPageTextFromView\(text, currentPage\)/);
  assert.match(ofdTextBridgeSource, /page\.index === currentPage/);
  assert.match(ofdTextBridgeSource, /\.text\.trim\(\)/);
  assert.match(copyMatch[1], /session\.file_type === "ofd"/);
  assert.match(copyMatch[1], /await currentOfdPageText\(\)/);
  assert.match(copyMatch[1], /navigator\.clipboard\.writeText\(text\)/);
});

test("PDF copy action uses the same text layer availability guard as toolbar state", () => {
  const source = readMainTs();
  const readerActionState = readReaderActionStateTs();
  const helperMatch = source.match(/function canCopyCurrentPageText\(\) \{([\s\S]*?)\n\}/);
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);
  const copyMatch = source.match(/async function copyCurrentPageText\(\) \{([\s\S]*?)\n\}/);

  assert.ok(helperMatch, "canCopyCurrentPageText block should be found");
  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.ok(copyMatch, "copyCurrentPageText block should be found");
  assert.match(source, /function isCurrentPageTextCopyUnavailable\(\)/);
  assert.match(source, /function canSelectCurrentPageText\(\)/);
  assert.match(helperMatch[1], /canCopyCurrentPageTextState\(\{/);
  assert.match(helperMatch[1], /isCurrentPageTextCopyUnavailable: isCurrentPageTextCopyUnavailable\(\)/);
  assert.match(readerActionState, /state\.fileType === "pdf"/);
  assert.match(readerActionState, /state\.hasActivePdfDocument && !state\.isCurrentPageTextCopyUnavailable/);
  assert.match(metadataMatch[1], /canCopyCurrentPageText\(\)/);
  assert.match(metadataMatch[1], /selectCurrentPageTextButton\.disabled = !canSelectCurrentPageText\(\)/);
  assert.match(copyMatch[1], /canCopyCurrentPageText\(\)/);
});

test("PDF current-page copy availability is centralized for the status matrix", () => {
  const source = readMainTs();
  const readerActionState = readReaderActionStateTs();
  const helperMatch = source.match(/function canCopyCurrentPageText\(\) \{([\s\S]*?)\n\}/);
  const metadataMatch = source.match(/function updateMetadata\(\) \{([\s\S]*?)\nasync function withBusy/);
  const copyMatch = source.match(/async function copyCurrentPageText\(\) \{([\s\S]*?)\n\}/);

  assert.ok(helperMatch, "canCopyCurrentPageText block should be found");
  assert.ok(metadataMatch, "updateMetadata block should be found");
  assert.ok(copyMatch, "copyCurrentPageText block should be found");

  const helperBlock = helperMatch[1];
  assert.match(helperBlock, /canCopyCurrentPageTextState\(\{/);
  assert.match(helperBlock, /isBusy,/);
  assert.match(helperBlock, /hasSession: !!session/);
  assert.match(helperBlock, /fileType: session\?\.file_type \?\? null/);
  assert.match(helperBlock, /hasActivePdfDocument: !!activePdfDocument/);
  assert.match(helperBlock, /isCurrentPageTextCopyUnavailable: isCurrentPageTextCopyUnavailable\(\)/);
  assert.match(readerActionState, /if \(state\.isBusy \|\| !state\.hasSession\)/);
  assert.match(readerActionState, /state\.fileType === "pdf"/);
  assert.match(readerActionState, /state\.fileType === "ofd"/);
  assert.match(metadataMatch[1], /copyCurrentPageTextButton\.disabled = !canCopyCurrentPageText\(\)/);
  assert.match(copyMatch[1], /if \(!canCopyCurrentPageText\(\) \|\| !session\) \{/);
});

test("PDF adapter normalizes copied text and cleans page resources", () => {
  const adapter = readPdfAdapterTs();
  const match = adapter.match(/async getPageText\(pageIndex: number\) \{([\s\S]*?)\n    \},/);

  assert.ok(match, "getPageText block should be found");
  assert.match(match[1], /const page = await document\.getPage\(pageIndex \+ 1\);/);
  assert.match(match[1], /const textContent = await page\.getTextContent\(\);/);
  assert.match(match[1], /return pdfTextContentToPlainText\(textContent\);/);
  assert.match(match[1], /finally \{/);
  assert.match(match[1], /page\.cleanup\(\);/);
});

test("print entry updates visible document status after dispatching print", () => {
  const source = readMainTs();
  const match = source.match(/async function printDocument\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.ok(match, "printDocument block should be found");
  assert.match(match[1], /await showWebViewPrintDialog\(\)/);
  assert.match(source, /async function showWebViewPrintDialog\(\) \{[\s\S]*await invoke\("show_webview_print_ui"\);[\s\S]*window\.print\(\);[\s\S]*\}/);
  assert.match(match[1], /setActivityFeedback\("已发送打印请求"\)/);
  assert.match(match[1], /updateMetadata\(\)/);
});

test("print entry restores reading status after print dialog closes", () => {
  const source = readMainTs();

  assert.match(source, /function restorePrintStatus\(\)/);
  assert.match(source, /currentActivityFeedback [!=]=[=]? "已发送打印请求"/);
  assert.match(source, /setDocumentStatus\("已打开"\)/);
  assert.match(source, /cleanupPrintLayout\(\)/);
  assert.match(source, /window\.addEventListener\("afterprint", restorePrintStatus\)/);
});

test("print stylesheet fits the current page into one print viewport", () => {
  const css = readStylesCss();

  assert.match(css, /@media print/);
  assert.match(css, /@page\s*{[^}]*margin:\s*0;/s);
  assert.match(css, /@page\s+ldv-landscape\s*{[^}]*size:\s*landscape;[^}]*margin:\s*0;/s);
  assert.match(css, /@page\s+ldv-portrait\s*{[^}]*size:\s*portrait;[^}]*margin:\s*0;/s);
  assert.match(css, /body\[data-print-orientation="landscape"\]\s+\.page-stage\s*{[^}]*page:\s*ldv-landscape;/s);
  assert.match(css, /body\[data-print-orientation="portrait"\]\s+\.page-stage\s*{[^}]*page:\s*ldv-portrait;/s);
  assert.match(css, /\.diagnostic-actions\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.reader-navigation-panel,\s*\.reader-navigation-resizer\s*{[^}]*display:\s*none;/s);
  assert.match(css, /\.reader-workspace\s*{[^}]*display:\s*block;[^}]*grid-template-columns:\s*none;/s);
  assert.match(css, /\.page-stage\s*{[^}]*height:\s*100vh;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.page-surface\s*{[^}]*aspect-ratio:\s*var\(--ldv-page-print-width\)\s*\/\s*var\(--ldv-page-print-height\);[^}]*break-inside:\s*avoid;/s);
  assert.match(css, /\.page-image,\s*\.page-canvas\s*{[^}]*object-fit:\s*contain;/s);
  assert.match(css, /\.page-image,\s*\.page-canvas\s*{[^}]*width:\s*100% !important;[^}]*height:\s*100% !important;/s);
});

test("text print uses natural text flow and hides screen line numbers", () => {
  const css = readStylesCss();
  const source = readMainTs();

  assert.match(source, /singlePagePrintState\(\{[\s\S]*documentMode: pageSurface\?\.dataset\.documentMode/);
  assert.match(source, /delete document\.body\.dataset\.printDocumentMode/);
  assert.match(css, /body\[data-print-document-mode="text"\]\s+\.page-stage\s*{[^}]*display:\s*block;[^}]*height:\s*auto;[^}]*overflow:\s*visible;/s);
  assert.match(css, /body\[data-print-document-mode="text"\]\s+\.page-surface\s*{[^}]*aspect-ratio:\s*auto;[^}]*width:\s*auto !important;[^}]*height:\s*auto !important;/s);
  assert.match(css, /body\[data-print-document-mode="text"\]\s+\.text-line-numbers\s*{[^}]*display:\s*none;/s);
  assert.match(css, /body\[data-print-document-mode="text"\]\s+\.text-preview-surface\s*{[^}]*overflow:\s*visible;[^}]*white-space:\s*pre-wrap;/s);
});

test("print entry prepares page orientation from the rendered page", () => {
  const source = readMainTs();

  assert.match(source, /function setPageSurfacePrintSize\(width: number, height: number\)/);
  assert.match(source, /pageSurface\.style\.setProperty\("--ldv-page-print-width", String\(Math\.max\(1, Math\.round\(width\)\)\)\)/);
  assert.match(source, /pageSurface\.dataset\.printOrientation = width >= height \? "landscape" : "portrait"/);
  assert.match(source, /function preparePrintLayout\(request: PrintRequest\)/);
  assert.match(source, /singlePagePrintState\(\{[\s\S]*pageOrientation: pageSurface\?\.dataset\.printOrientation/);
  assert.match(source, /document\.body\.dataset\.printOrientation = state\.printOrientation/);
  assert.match(source, /function cleanupPrintLayout\(\)/);
  assert.match(source, /delete document\.body\.dataset\.printOrientation/);
  assert.match(source, /preparePrintLayout\(resolvedRequest\);\s+await showWebViewPrintDialog\(\)/);
});

test("reader sidebar exposes privacy-safe recent file controls", () => {
  const html = readIndexHtml();

  assert.match(html, /id="recent-files-section"/);
  assert.match(html, /id="refresh-recent-files"/);
  assert.match(html, /id="recent-files-list"/);
  assert.match(html, /id="recent-files-enabled"/);
  assert.match(html, /id="clear-recent-files"/);
  assert.doesNotMatch(html, /absolute_path/);
});

test("reader sidebar exposes cache cleanup without path-facing UI", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const match = source.match(/async function clearRenderCache\(\) \{([\s\S]*?)\nasync function setRecentFilesEnabled/);

  assert.match(html, /id="clear-render-cache"/);
  assert.match(html, />清理缓存</);
  assert.match(source, /clearRenderCacheButton/);
  assert.match(source, /"clear_render_cache"/);
  assert.match(source, /currentSessionId/);
  assert.match(source, /缓存已清理/);
  assert.ok(match, "clearRenderCache block should be found");
  assert.doesNotMatch(html, /缓存路径/);
  assert.doesNotMatch(match[1], /detail_for_report/);
});

test("recent files expose a short location hint for same-name disambiguation", () => {
  const source = readMainTs();
  const css = readStylesCss();
  const core = readDocumentCoreRs();

  assert.match(core, /location_hint/);
  assert.match(source, /location_hint/);
  assert.match(source, /recent-file-location/);
  assert.match(source, /recentFileViewStates\(\{/);
  assert.match(source, /openButton\.title = entry\.title/);
  assert.match(source, /if \(entry\.shouldShowLocationHint\)/);
  assert.doesNotMatch(source, /displayNameCounts/);
  assert.match(css, /\.recent-file-location/);
});

test("reader surface wires recent file commands without path-facing UI", () => {
  const source = readMainTs();

  assert.match(source, /"list_recent_files"/);
  assert.match(source, /"open_recent_file"/);
  assert.match(source, /"read_recent_pdf_bytes"/);
  assert.match(source, /"open_local_office_as_pdf"/);
  assert.match(source, /"open_recent_office_as_pdf"/);
  assert.match(source, /"read_converted_office_pdf_bytes"/);
  assert.match(source, /"record_opened_pdf"/);
  assert.match(source, /"record_recent_pdf_opened"/);
  assert.match(source, /"remove_recent_file"/);
  assert.match(source, /"clear_recent_files"/);
  assert.match(source, /"set_recent_files_enabled"/);
  assert.doesNotMatch(source, /absolute_path/);
});

test("recent file icons reflect the recorded document type", () => {
  const source = readMainTs();

  assert.match(source, /icon\.textContent = entry\.iconLabel/);
  assert.doesNotMatch(source, /icon\.textContent = "OFD"/);
});

test("recent file unavailable state is explicit without strike-through styling", () => {
  const source = readMainTs();
  const css = readStylesCss();

  assert.match(source, /recentUnavailableIds/);
  assert.match(source, /文件不可用/);
  assert.match(css, /\.recent-file-availability/);
  assert.match(css, /\.recent-file-item\.is-unavailable/);
  assert.doesNotMatch(css, /line-through/);
});

test("reader chrome prevents accidental text selection while preserving error copy", () => {
  const css = readStylesCss();

  assert.match(css, /\.sidebar\s*{[^}]*user-select:\s*none;/s);
  assert.match(css, /\.toolbar\s*{[^}]*user-select:\s*none;/s);
  assert.match(css, /\.error-message\s*{[^}]*user-select:\s*text;/s);
});

test("error diagnostic overlay can be dismissed without losing diagnostic state", () => {
  const source = readMainTs();
  const showErrorMatch = source.match(/function showError\(error: unknown\) \{([\s\S]*?)\nfunction clearError/);
  const dismissMatch = source.match(/function dismissErrorDiagnosticOverlay\(\) \{([\s\S]*?)\nfunction clearError/);
  const updateMatch = source.match(/function updateErrorDiagnosticOverlay\(\) \{([\s\S]*?)\nfunction updateDiagnosticActions/);

  assert.ok(showErrorMatch, "showError block should be found");
  assert.ok(dismissMatch, "dismissErrorDiagnosticOverlay block should be found");
  assert.ok(updateMatch, "updateErrorDiagnosticOverlay block should be found");
  assert.match(showErrorMatch[1], /isErrorDiagnosticOverlayDismissed = false;/);
  assert.match(dismissMatch[1], /isErrorDiagnosticOverlayDismissed = true;/);
  assert.doesNotMatch(dismissMatch[1], /lastErrorSummary = null/);
  assert.match(updateMatch[1], /errorDiagnosticOverlay\.hidden = !hasVisibleErrorDiagnosticOverlay;/);
  assert.match(updateMatch[1], /lastErrorSummary/);
  assert.match(updateMatch[1], /isErrorDiagnosticOverlayDismissed/);
});

test("recent file opened time display accepts unix seconds and RFC3339 strings", () => {
  const source = readMainTs();

  assert.match(source, /Number\.parseInt/);
  assert.match(source, /Date\.parse/);
  assert.match(source, /UTC RFC3339/);
});

test("recent file remove command returns a refreshed recent files view", () => {
  const source = readDocumentCoreRs();

  assert.match(source, /fn remove_recent_file\([^)]*\) -> Result<RecentFilesView, RenderError>/s);
});

test("recent file list stays bounded with native scrolling", () => {
  const css = readStylesCss();

  assert.match(css, /\.recent-files-list\s*{[^}]*max-height:\s*248px;/s);
  assert.match(css, /\.recent-files-list\s*{[^}]*overflow:\s*auto;/s);
  assert.doesNotMatch(css, /pagination/);
});

test("startup initialization loads recent files before opening startup document", () => {
  const source = readMainTs();

  assert.match(source, /async function initializeReader\(\)/);
  assert.match(source, /async function openStartupDocumentPath\(\)/);
  assert.match(source, /"startup_document_path"/);
  assert.match(source, /await loadRecentFiles\(\);\s+await openStartupDocumentPath\(\);/s);
  assert.doesNotMatch(source, /startup_ofd_path/);
  assert.doesNotMatch(source, /openStartupOfdPath/);
  assert.doesNotMatch(source, /void loadRecentFiles\(\);\s+void openStartupDocumentPath\(\);/s);
});

test("reader error surface does not display diagnostic details", () => {
  const source = readMainTs();
  const match = source.match(/function showError\(error: unknown\) \{([\s\S]*?)\nfunction clearError/);

  assert.ok(match, "showError block should be found");
  const showErrorBlock = match[1];
  assert.match(showErrorBlock, /safe_to_show/);
  assert.match(showErrorBlock, /String\(renderError\.message \?\? ""\)\.trim\(\)/);
  assert.match(showErrorBlock, /操作失败，请查看诊断信息。/);
  assert.doesNotMatch(showErrorBlock, /detail_for_report/);
});

test("reader error surface falls back for blank safe messages", () => {
  const source = readMainTs();
  const match = source.match(/function showError\(error: unknown\) \{([\s\S]*?)\nfunction clearError/);

  assert.ok(match, "showError block should be found");
  const showErrorBlock = match[1];
  assert.match(showErrorBlock, /String\(renderError\.message \?\? ""\)\.trim\(\)/);
  assert.match(showErrorBlock, /safeMessage \|\| "操作失败，请查看诊断信息。"/);
});

test("reader exposes manual diagnostic copy without raw details", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const summaryMatch = source.match(/function diagnosticSummaryText\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.match(html, /id="copy-diagnostic-info"/);
  assert.match(html, />复制诊断信息</);
  assert.match(source, /lastErrorSummary/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /诊断信息已复制/);
  assert.match(source, /无法复制诊断信息，请稍后重试。/);
  assert.ok(summaryMatch, "diagnosticSummaryText block should be found");
  assert.match(source, /setDocumentStatus\("操作失败"\);[\s\S]*lastErrorSummary = diagnosticSummaryFromError/);
  assert.doesNotMatch(summaryMatch[1], /detail_for_report/);
  assert.doesNotMatch(summaryMatch[1], /absolute_path/);
});

test("reader diagnostic summary is built from an explicit privacy allowlist", () => {
  const source = readMainTs();
  const allowlistMatch = source.match(/const diagnosticSummaryFields = \[([\s\S]*?)\] as const;/);
  const summaryMatch = source.match(/function diagnosticSummaryText\([^)]*\) \{([\s\S]*?)\n\}/);

  assert.ok(allowlistMatch, "diagnostic summary field allowlist should be found");
  assert.ok(summaryMatch, "diagnosticSummaryText block should be found");
  assert.match(allowlistMatch[1], /"code"/);
  assert.match(allowlistMatch[1], /"message"/);
  assert.match(allowlistMatch[1], /"file_type"/);
  assert.match(allowlistMatch[1], /"page"/);
  assert.match(allowlistMatch[1], /"scale"/);
  assert.match(allowlistMatch[1], /"engine"/);
  assert.match(allowlistMatch[1], /"action"/);
  assert.match(allowlistMatch[1], /"performance_phase"/);
  assert.match(allowlistMatch[1], /"performance_duration_bucket"/);
  assert.match(allowlistMatch[1], /"performance_recent_events"/);
  assert.match(allowlistMatch[1], /"performance_recommendation"/);
  assert.match(allowlistMatch[1], /"created_at"/);
  assert.match(summaryMatch[1], /diagnosticSummaryFields\.map/);
  assert.doesNotMatch(`${allowlistMatch[1]}\n${summaryMatch[1]}`, /documentFindQuery|findQueryInput|OfdTextView|local_ofd_text|currentOfdPageText|copyCurrentPageText|selectedPdfText|pageTextLayer|clipboard|selection/i);
});

test("reader diagnostic summary uses attempted OFD context after open failures", () => {
  const source = readMainTs();
  const openLocalMatch = source.match(/async function openLocalOfdPath\([^)]*\) \{([\s\S]*?)\n\}/);
  const summaryMatch = source.match(/function diagnosticSummaryFromError\([^)]*\)[:\s\w]*\{([\s\S]*?)\n\}/);

  assert.ok(openLocalMatch, "openLocalOfdPath block should be found");
  assert.ok(summaryMatch, "diagnosticSummaryFromError block should be found");
  assert.match(source, /type PendingDiagnosticContext = \{/);
  assert.match(source, /let pendingDiagnosticContext: PendingDiagnosticContext \| null = null;/);
  assert.match(openLocalMatch[1], /pendingDiagnosticContext = \{\s*file_type: "ofd"/);
  assert.match(summaryMatch[1], /const summarySession = pendingDiagnosticContext \? null : session;/);
  assert.match(summaryMatch[1], /diagnosticSummaryFromState\(\{/);
  assert.match(summaryMatch[1], /pendingFileType: pendingDiagnosticContext\?\.file_type \?\? null/);
  assert.match(summaryMatch[1], /fileType: summarySession\.file_type/);
  assert.match(summaryMatch[1], /page: `\$\{currentPage \+ 1\}\/\$\{summarySession\.page_count\}`/);
  assert.match(openLocalMatch[1], /showError\(error\);[\s\S]*pendingDiagnosticContext = null;/);
});

test("OFD open and render expose explicit non-sensitive performance phases", () => {
  const source = readMainTs();

  assert.match(source, /performancePhaseMessage/);
  assert.match(source, /setPerformanceStatus\(performanceStatus\("ofd_open_inspect"/);
  assert.match(source, /setPerformanceStatus\(performanceStatus\("ofd_render_page"/);
  assert.match(source, /const renderStartedAt = performance\.now\(\)/);
  assert.match(source, /recordOfdRenderPerformance\(renderStartedAt, bitmap\.duration_ms\)/);
  assert.match(source, /recordPerformanceStatus\(performanceStatus\("ofd_render_wait", performance\.now\(\) - renderStartedAt\)\)/);
  assert.match(source, /recordPerformanceStatus\(performanceStatus\("ofd_render_page", renderDurationMs\)\)/);
  assert.match(source, /const cacheHitStatus = performanceStatus\("ofd_cache_hit"\)/);
  assert.match(source, /setPerformanceStatus\(cacheHitStatus\)/);
  assert.match(source, /appendPerformanceTraceEvent\(performanceTraceEvents, cacheHitStatus\)/);
  assert.match(source, /performance_phase/);
  assert.match(source, /performance_duration_bucket/);
  assert.match(source, /performance_recent_events/);
  assert.match(source, /recommendOfdPerformanceRoute\(performanceTraceEvents\)/);
  assert.doesNotMatch(source, /detail_for_report.*performance/);
});

test("OFD render completion restores a stable reader status", () => {
  const source = readMainTs();
  const renderMatch = source.match(/async function renderCurrentPage\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderCurrentPage block should be found");
  assert.match(source, /function finishPerformanceStatus\(fallbackStatus: DocumentLifecycleStatus\)/);
  assert.match(renderMatch[1], /finishPerformanceStatus\("已打开"\)/);
  assert.match(source, /currentPerformanceStatus = performanceStatus\("idle"\)/);
});

test("OFD adjacent page prefetch does not drive visible status", () => {
  const source = readMainTs();

  assert.match(source, /adjacentOfdPrefetchTargets,[\s\S]*isCurrentOfdPrefetchBatch,[\s\S]*nextOfdPrefetchBatchId,[\s\S]*shouldRunOfdPrefetchTarget,[\s\S]*from "\.\/ofdPrefetchState"/);
  assert.match(source, /function prefetchAdjacentOfdPages/);
  assert.match(source, /void prefetchAdjacentOfdPages\(bitmap\.session_id, bitmap\.page_index, bitmap\.scale\)/);
  assert.match(source, /let ofdPrefetchBatchId = 0;/);
  assert.match(source, /ofdPrefetchBatchId = nextOfdPrefetchBatchId\(ofdPrefetchBatchId\)/);
  assert.match(source, /const batchId = ofdPrefetchBatchId/);
  assert.match(source, /adjacentOfdPrefetchTargets\(\{/);
  assert.match(source, /let ofdPrefetchQueue: Promise<void> = Promise\.resolve\(\);/);
  assert.match(source, /ofdPrefetchQueue = ofdPrefetchQueue\.then/);
  assert.match(source, /ofdPrefetchQueue = ofdPrefetchQueue\.then\([\s\S]*\)\.catch\(\(\) => \{\s*\/\/ Adjacent-page prefetch is best-effort and must keep future queued prefetches alive\.\s*\}\);/);
  assert.match(source, /isCurrentOfdPrefetchBatch\(\{ batchId, currentBatchId: ofdPrefetchBatchId \}\)/);
  assert.match(source, /shouldRunOfdPrefetchTarget\(\{/);
  assert.match(source, /currentPageIndex: currentPage/);
  assert.match(source, /currentScale: scale/);
  assert.doesNotMatch(source, /for \(const target of targets\) \{\s*void prefetchLocalOfdPage/s);
  assert.match(source, /prefetchLocalOfdPage/);
  assert.match(source, /updateVisibleStatus:\s*false/);
});

test("OFD render requests reuse in-flight work for the same page cache key", () => {
  const source = readMainTs();
  const ofdPageRendererSource = readFileSync(resolve(desktopRoot, "src", "ofdPageRenderer.ts"), "utf8");
  const renderLocalMatch = source.match(/async function renderLocalOfdPage\([\s\S]*?\n\}/);

  assert.ok(renderLocalMatch, "renderLocalOfdPage block should be found");
  assert.match(source, /import \{ createOfdPageRenderCache \} from "\.\/ofdPageRenderCache"/);
  assert.match(source, /import \{ renderOfdPageThroughCache \} from "\.\/ofdPageRenderer"/);
  assert.match(ofdPageRendererSource, /import \{ ofdRenderRequestState \} from "\.\/ofdRenderRequestState\.ts"/);
  assert.match(source, /const localOfdPageCache = createOfdPageRenderCache<PageBitmap>\(\{/);
  assert.match(renderLocalMatch[0], /renderOfdPageThroughCache\(\{/);
  assert.match(renderLocalMatch[0], /cache: localOfdPageCache/);
  assert.match(renderLocalMatch[0], /updateVisibleStatus: options\.updateVisibleStatus !== false/);
  assert.match(renderLocalMatch[0], /currentSessionId: session\?\.id \?\? null/);
  assert.match(renderLocalMatch[0], /onVisibleCacheHit/);
  assert.match(renderLocalMatch[0], /performanceStatus\("ofd_cache_hit"\)/);
  assert.match(renderLocalMatch[0], /invoke<PageBitmap>\("render_local_ofd_page"/);
  assert.match(ofdPageRendererSource, /input\.cache\.has\(input\.sessionId, input\.pageIndex, input\.pageScale\)/);
  assert.match(ofdPageRendererSource, /input\.cache\.renderPage\(/);
  assert.match(ofdPageRendererSource, /cacheResult: requestState\.cacheResult/);
});

test("OFD in-flight render requests are cleared with page cache entries", () => {
  const source = readMainTs();
  const pageCacheControllerSource = readFileSync(resolve(desktopRoot, "src", "ofdPageCacheController.ts"), "utf8");
  const clearSessionMatch = source.match(/function clearPageCacheForSession\(targetSession: DocumentSession\) \{([\s\S]*?)\n\}/);
  const clearExceptMatch = source.match(/function clearPageCacheExceptSession\(currentSessionId: string \| null\) \{([\s\S]*?)\n\}/);
  const clearAllMatch = source.match(/function clearAllLocalOfdPageWork\(\) \{([\s\S]*?)\n\}/);

  assert.ok(clearSessionMatch, "clearPageCacheForSession block should be found");
  assert.ok(clearExceptMatch, "clearPageCacheExceptSession block should be found");
  assert.ok(clearAllMatch, "clearAllLocalOfdPageWork block should be found");
  assert.match(source, /deleteOfdPageCacheFromDataset,[\s\S]*from "\.\/ofdPageCacheController"/);
  assert.match(pageCacheControllerSource, /ofdPageImageCacheTargetFromDataset\(dataset\)/);
  assert.match(source, /import \{ ofdPageImageDataset \} from "\.\/ofdPageImageState"/);
  assert.match(source, /deleteOfdPageCacheFromDataset\(localOfdPageCache, image\.dataset\)/);
  assert.match(source, /deleteOfdPageCacheFromDataset\(localOfdPageCache, pageImage\?\.dataset \?\? \{\}\)/);
  assert.match(source, /Object\.assign\(image\.dataset, ofdPageImageDataset\(/);
  assert.match(source, /Object\.assign\(pageImage\.dataset, ofdPageImageDataset\(/);
  assert.doesNotMatch(source, /dataset\.cacheKey =/);
  assert.match(clearSessionMatch[1], /clearOfdPageCacheForSession\(localOfdPageCache, targetSession\)/);
  assert.match(clearExceptMatch[1], /clearOfdPageCacheExceptSession\(localOfdPageCache, currentSessionId\)/);
  assert.match(clearAllMatch[1], /clearAllOfdPageWork\(localOfdPageCache\)/);
  assert.doesNotMatch(source, /localOfdPageCache\.deletePage\(/);
});

test("previous document cache cleanup decision stays outside the reader surface", () => {
  const source = readMainTs();
  const cleanupMatch = source.match(/async function cleanupPreviousDocumentCache\([\s\S]*?\n\}/);

  assert.ok(cleanupMatch, "cleanupPreviousDocumentCache block should be found");
  assert.match(source, /import \{ previousDocumentCacheCleanupTarget \} from "\.\/ofdCacheCleanupState"/);
  assert.match(cleanupMatch[0], /previousDocumentCacheCleanupTarget\(previousSession, nextSession\)/);
  assert.match(cleanupMatch[0], /sessionId: cleanupSessionId/);
  assert.match(cleanupMatch[0], /cleanup_render_cache_session/);
  assert.doesNotMatch(cleanupMatch[0], /previousSession\.file_type === "fake"/);
  assert.doesNotMatch(cleanupMatch[0], /previousSession\.file_type === "pdf"/);
});

test("OFD scale changes debounce render work and keep the last requested scale", () => {
  const source = readMainTs();
  const changeScaleMatch = source.match(/async function changeScale\(delta: number\) \{([\s\S]*?)\n\}/);
  const resetZoomMatch = source.match(/async function resetZoom\(\) \{([\s\S]*?)\n\}/);
  const fitPageMatch = source.match(/async function fitPage\(mode: "width" \| "page"\) \{([\s\S]*?)\n\}/);
  const rerenderMatch = source.match(/async function rerenderAfterScaleChange\(\) \{([\s\S]*?)\n\}/);
  const previewMatch = source.match(/function previewCurrentOfdScale\(\) \{([\s\S]*?)\n\}/);

  assert.ok(changeScaleMatch, "changeScale block should be found");
  assert.ok(resetZoomMatch, "resetZoom block should be found");
  assert.ok(fitPageMatch, "fitPage block should be found");
  assert.ok(rerenderMatch, "rerenderAfterScaleChange block should be found");
  assert.ok(previewMatch, "previewCurrentOfdScale block should be found");
  assert.match(source, /createOfdScaleRenderState/);
  assert.match(source, /ofdScalePreviewSize/);
  assert.match(source, /ofdScaleRenderTargetFromSession/);
  assert.match(source, /const ofdScaleRenderState = createOfdScaleRenderState\(\)/);
  assert.match(source, /function scheduleOfdScaleRender/);
  assert.match(source, /function currentOfdScaleRenderTarget/);
  assert.match(source, /function isCurrentOfdScaleRender/);
  assert.match(source, /previewCurrentOfdScale\(\)/);
  assert.match(source, /ofdScaleRenderState\.schedule\(target/);
  assert.match(source, /ofdScaleRenderState\.isCurrent\(request, target, \{ isSameScale \}\)/);
  assert.doesNotMatch(source, /ofdScaleRenderTimer/);
  assert.doesNotMatch(source, /ofdScaleRenderRequestId/);
  assert.match(previewMatch[1], /pageScaleBaseSize\(\)/);
  assert.match(previewMatch[1], /ofdScalePreviewSize\(\{/);
  assert.match(previewMatch[1], /pageSurface\.style\.width = `\$\{previewSize\.width\}px`/);
  assert.match(previewMatch[1], /pageSurface\.style\.height = `\$\{previewSize\.height\}px`/);
  assert.match(source, /return ofdScaleRenderTargetFromSession\(\{/);
  assert.match(rerenderMatch[1], /session\?\.file_type === "ofd"/);
  assert.match(rerenderMatch[1], /scheduleOfdScaleRender\(\)/);
  assert.match(changeScaleMatch[1], /rerenderAfterScaleChange\(\)/);
  assert.match(resetZoomMatch[1], /rerenderAfterScaleChange\(\)/);
  assert.match(fitPageMatch[1], /rerenderAfterScaleChange\(\)/);
});

test("continuous page rerenders replace the page stack atomically", () => {
  const source = readMainTs();

  assert.match(
    source,
    /async function rerenderAfterScaleChange\(\) \{[\s\S]*if \(isContinuousViewActive\(\)\) \{[\s\S]*await withBusy\(async \(\) => \{[\s\S]*const rendered = await renderContinuousPages\(\);[\s\S]*if \(!rendered\) \{[\s\S]*return;[\s\S]*}[\s\S]*scrollContinuousPageIntoView\(anchorPage\);[\s\S]*setDocumentStatus\("已打开"\);[\s\S]*\}\);[\s\S]*return;/,
  );

  const renderMatch = source.match(/async function renderContinuousPages\(\) \{([\s\S]*?)\n\}/);
  const pagedRenderMatch = source.match(/async function renderContinuousPagedDocument\([\s\S]*?\) \{([\s\S]*?)\n\}/);
  assert.ok(renderMatch, "renderContinuousPages block should be found");
  assert.ok(pagedRenderMatch, "renderContinuousPagedDocument block should be found");
  assert.match(renderMatch[1], /renderContinuousPagedDocument\(container, renderRequestId, renderSessionId, renderKey\)/);
  assert.match(source, /const fragment = document\.createDocumentFragment\(\)/);
  assert.match(source, /fragment\.append\(slot\)/);
  assert.match(source, /container\.replaceChildren\(fragment\)/);
  assert.doesNotMatch(source, /container\.replaceChildren\(\);\s*for/s);
  assert.doesNotMatch(pagedRenderMatch[1], /container\.append\(slot\)/);
});

test("PDF continuous window rerenders show lightweight slots before canvas work", () => {
  const source = readMainTs();
  const pdfRenderStart = source.indexOf("async function renderContinuousPdfPages");
  const pdfRenderEnd = source.indexOf("async function renderContinuousOfdPageSlot", pdfRenderStart);
  const pdfRenderBlock = source.slice(pdfRenderStart, pdfRenderEnd);

  assert.notEqual(pdfRenderStart, -1, "renderContinuousPdfPages block should start");
  assert.notEqual(pdfRenderEnd, -1, "renderContinuousPdfPages block should end");
  assert.match(pdfRenderBlock, /const eagerPageIndexes: number\[\] = \[\]/);
  assert.match(pdfRenderBlock, /eagerPageIndexes\.push\(slotPlan\.pageIndex\)/);
  assert.match(pdfRenderBlock, /container\.replaceChildren\(fragment\)/);
  assert.match(pdfRenderBlock, /void renderContinuousPdfPageWindow\(currentPage, renderKey, renderRequestId, renderSessionId\)\.catch\(\(\) => undefined\)/);
  assert.doesNotMatch(pdfRenderBlock, /await renderContinuousPdfPageSlot\(slotPlan\.pageIndex, slot, renderKey, nextRenderedPageIndexes\)/);
});

test("continuous render resets the viewport to the current page after replacing slots", () => {
  const source = readMainTs();
  const renderMatch = source.match(/async function renderCurrentPage\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderCurrentPage block should be found");
  assert.match(
    renderMatch[1],
    /const rendered = await renderContinuousPages\(\);[\s\S]*if \(!rendered\) \{[\s\S]*return;[\s\S]*}[\s\S]*scrollContinuousPageIntoView\(currentPage\);[\s\S]*renderDocumentOutline\(\);/,
  );
});

test("continuous page rerenders ignore stale render work", () => {
  const source = readMainTs();
  const renderMatch = source.match(/async function renderContinuousPages\(\) \{([\s\S]*?)\n\}/);
  const pagedRenderMatch = source.match(/async function renderContinuousPagedDocument\([\s\S]*?\) \{([\s\S]*?)\n\}/);
  const pdfSlotMatch = source.match(/async function renderContinuousPdfPageSlot\([\s\S]*?\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderContinuousPages block should be found");
  assert.ok(pagedRenderMatch, "renderContinuousPagedDocument block should be found");
  assert.ok(pdfSlotMatch, "renderContinuousPdfPageSlot block should be found");
  assert.match(source, /let continuousRenderRequestId = 0;/);
  assert.match(source, /function isContinuousRenderRequestCurrent/);
  assert.match(renderMatch[1], /continuousRenderRequestId \+= 1/);
  assert.match(renderMatch[1], /const renderRequestId = continuousRenderRequestId/);
  assert.match(renderMatch[1], /const renderSessionId = session\.id/);
  assert.match(source, /renderRequestId === continuousRenderRequestId/);
  assert.match(source, /session\?\.id === renderSessionId/);
  assert.match(source, /continuousRenderKey\(\) === renderKey/);
  assert.match(renderMatch[1], /return false/);
  assert.match(
    pagedRenderMatch[1],
    /if \(!isContinuousRenderRequestCurrent\(renderRequestId, renderSessionId, renderKey\)\) \{[\s\S]*return false;[\s\S]*\}[\s\S]*container\.replaceChildren\(fragment\)/,
  );
  assert.match(pdfSlotMatch[0], /renderRequestId: number/);
  assert.match(pdfSlotMatch[0], /renderSessionId: string/);
  assert.match(
    pdfSlotMatch[1],
    /if \(!isContinuousRenderRequestCurrent\(renderRequestId, renderSessionId, renderKey\)\) \{[\s\S]*continuousPdfLoadingPageIndexes\.delete\(pageIndex\);[\s\S]*slot\.dataset\.renderState = "stale";[\s\S]*return;[\s\S]*}/,
  );
});

test("continuous stale render results are not treated as completed navigation", () => {
  const source = readMainTs();
  const renderCurrentMatch = source.match(/async function renderCurrentPage\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderCurrentMatch, "renderCurrentPage block should be found");
  assert.match(renderCurrentMatch[1], /const rendered = await renderContinuousPages\(\)/);
  assert.match(renderCurrentMatch[1], /if \(!rendered\) \{[\s\S]*return;[\s\S]*\}/);
  assert.doesNotMatch(renderCurrentMatch[1], /await renderContinuousPages\(\);\s*renderDocumentOutline\(\);/);
});

test("continuous render failures preserve the previous page stack scroll sync", () => {
  const source = readMainTs();
  const renderMatch = source.match(/async function renderContinuousPages\(\) \{([\s\S]*?)\n\}/);

  assert.ok(renderMatch, "renderContinuousPages block should be found");
  assert.match(source, /let lastSuccessfulContinuousRenderKey = "";/);
  assert.match(source, /function isContinuousRenderKeyForCurrentSession\(renderKey: string\)/);
  assert.match(renderMatch[1], /const previousRenderKey = continuousFallbackRenderKey\(container\.dataset\.renderKey\)/);
  assert.match(renderMatch[1], /lastSuccessfulContinuousRenderKey = renderKey/);
  assert.match(renderMatch[1], /try \{[\s\S]*renderContinuousPagedDocument\(container, renderRequestId, renderSessionId, renderKey\)/);
  assert.match(
    renderMatch[1],
    /catch \(error\) \{[\s\S]*if \(previousRenderKey && container\.isConnected\) \{[\s\S]*container\.dataset\.renderKey = previousRenderKey;[\s\S]*pageStage\?\.addEventListener\("scroll", syncCurrentPageFromContinuousScroll\);[\s\S]*}[\s\S]*throw error;[\s\S]*}/,
  );
});

test("view mode switch failures restore the previous single-page surface", () => {
  const source = readMainTs();
  const modeMatch = source.match(/async function setReaderViewMode\(mode: ReaderViewMode\) \{([\s\S]*?)\n\}/);

  assert.ok(modeMatch, "setReaderViewMode block should be found");
  assert.match(
    modeMatch[1],
    /catch \(error\) \{[\s\S]*readerViewMode = previousMode;[\s\S]*if \(previousMode === "single"\) \{[\s\S]*clearContinuousPages\(\);[\s\S]*}[\s\S]*updateMetadata\(\);[\s\S]*showError\(error\);/,
  );
});

test("failed document opens preserve the previous reader view mode", () => {
  const source = readMainTs();
  const functionBlock = (name, nextName) => {
    const start = source.indexOf(`async function ${name}(`);
    const end = nextName ? source.indexOf(`async function ${nextName}(`, start) : -1;
    return start >= 0 && end > start ? source.slice(start, end) : "";
  };
  const functions = [
    ["openLocalOfdPath", "openLocalPdfPath", "snapshot"],
    ["openLocalImagePath", "openLocalTextPath", "snapshot"],
    ["openLocalTextPath", "openLocalOfficePath", "snapshot"],
    ["openRecentImageFile", "openRecentTextFile", "snapshot"],
    ["openRecentTextFile", "openRecentFile", "snapshot"],
    ["openPdfFromByteSource", "openRecentFile", "snapshot"],
    ["openRecentFile", "openLocalDocument", "snapshot"],
  ];

  for (const [name, nextName, restoreStyle] of functions) {
    const block = functionBlock(name, nextName);
    assert.ok(block, `${name} block should be found`);
    if (restoreStyle === "snapshot") {
      assert.match(block, /const openSnapshot = snapshotReaderOpenState\(\);/);
      assert.match(block, /catch \(error\) \{[\s\S]*restoreReaderOpenSnapshot\(openSnapshot\);/);
    } else {
      assert.match(block, /const previousReaderViewMode = readerViewMode/);
      assert.match(block, /catch \(error\) \{[\s\S]*readerViewMode = previousReaderViewMode;/);
    }
  }
});

test("OFD open keeps the previous PDF document alive until the new page renders", () => {
  const source = readMainTs();
  const start = source.indexOf("async function openLocalOfdPath(");
  const end = source.indexOf("function pdfSessionFromOpenResult", start);
  const block = start >= 0 && end > start ? source.slice(start, end) : "";

  assert.ok(block, "openLocalOfdPath block should be found");
  const renderIndex = block.indexOf("await renderCurrentPage()");
  const disposeIndex = block.indexOf("await disposeActivePdfDocument()");
  assert.notEqual(renderIndex, -1, "OFD open should render the new page");
  assert.notEqual(disposeIndex, -1, "OFD open should dispose the previous PDF after success");
  assert.ok(
    disposeIndex > renderIndex,
    "previous PDF must remain alive for failed OFD render rollback",
  );
});

test("recent OFD open disposes the previous PDF only after the recent page renders", () => {
  const source = readMainTs();
  const start = source.indexOf("await withBusy(async () => {", source.indexOf("async function openRecentFile("));
  const end = source.indexOf("async function openLocalDocument()", start);
  const block = start >= 0 && end > start ? source.slice(start, end) : "";

  assert.ok(block, "recent OFD fallback block should be found");
  const renderIndex = block.indexOf("await renderCurrentPage()");
  const disposeIndex = block.indexOf("await disposeActivePdfDocument()");
  assert.notEqual(renderIndex, -1, "recent OFD open should render the recent page");
  assert.notEqual(disposeIndex, -1, "recent OFD open should dispose the previous PDF after success");
  assert.match(block, /resetPerformanceTrace\(\);/);
  assert.match(block, /currentOfficePreview = null;/);
  assert.match(block, /pdfViewRotation = 0;/);
  assert.match(block, /resetDocumentFindState\(\);/);
  assert.match(block, /currentImageDocumentView = null;/);
  assert.ok(
    disposeIndex > renderIndex,
    "previous PDF must remain alive for failed recent OFD render rollback",
  );
});

test("reader diagnostic summary uses attempted PDF context after open failures", () => {
  const source = readMainTs();
  const openPdfMatch = source.match(
    /async function openPdfFromByteSource\([^)]*\)[^{]*\{([\s\S]*?)\n\}/,
  );
  const summaryMatch = source.match(/function diagnosticSummaryFromError\([^)]*\)[:\s\w]*\{([\s\S]*?)\n\}/);

  assert.ok(openPdfMatch, "openPdfFromByteSource block should be found");
  assert.ok(summaryMatch, "diagnosticSummaryFromError block should be found");
  assert.match(source, /sourceFileType = "pdf"/);
  assert.match(openPdfMatch[1], /pendingDiagnosticContext = \{\s*file_type: sourceFileType/);
  assert.match(openPdfMatch[1], /showError\(renderErrorFromPdfOpenFailure\(error\)\);[\s\S]*pendingDiagnosticContext = null;/);
  assert.match(summaryMatch[1], /diagnosticSummaryFromState\(\{/);
  assert.match(summaryMatch[1], /pendingFileType: pendingDiagnosticContext\?\.file_type \?\? null/);
});

test("reader diagnostic summary uses recent file context after recent open failures", () => {
  const source = readMainTs();
  const openRecentMatch = source.match(
    /async function openRecentFile\(id: string, displayName: string, fileType: string\) \{([\s\S]*?)\n\}/,
  );

  assert.ok(openRecentMatch, "openRecentFile should accept the attempted file type");
  assert.match(source, /openRecentFile\(entry\.id, entry\.displayName, entry\.fileType\)/);
  assert.match(openRecentMatch[1], /pendingDiagnosticContext = \{\s*file_type: fileType \|\| "unknown"/);
  assert.match(openRecentMatch[1], /showError\(error\);[\s\S]*pendingDiagnosticContext = null;/);
});
