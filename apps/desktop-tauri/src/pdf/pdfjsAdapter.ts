import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { normalizeViewRotation, type ViewRotation } from "../viewRotation";
import { normalizePdfOutlineItems, type PdfOutlineItem } from "./pdfOutline";
import { pdfTextContentToPlainText } from "./pdfTextContent";

export type PdfOpenResult = {
  readonly fileType: "pdf";
  readonly pageCount: number;
  readonly pageSizes: {
    readonly index: number;
    readonly widthPt: number;
    readonly heightPt: number;
    readonly rotation: ViewRotation;
  }[];
  readonly engineVersion: string;
};

export type PdfDocumentHandle = PdfOpenResult & {
  renderPageToCanvas(pageIndex: number, canvas: HTMLCanvasElement, scale: number, viewRotation?: ViewRotation): Promise<void>;
  renderPageTextLayer(
    pageIndex: number,
    container: HTMLDivElement,
    scale: number,
    viewRotation?: ViewRotation,
  ): Promise<void>;
  getPageText(pageIndex: number): Promise<string>;
  getOutline(): Promise<PdfOutlineItem[]>;
  destroy(): Promise<void>;
};

export async function openPdfDocumentFromBytes(data: Uint8Array): Promise<PdfDocumentHandle> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
  const loadingTask = pdfjs.getDocument({
    data,
    disableRange: true,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: true,
    useWasm: false,
    useWorkerFetch: false,
  });
  const document = await loadingTask.promise;
  const pageSizes = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1, rotation: 0 });
    pageSizes.push({
      index: pageNumber - 1,
      widthPt: viewport.width,
      heightPt: viewport.height,
      rotation: normalizeViewRotation(page.rotate),
    });
    page.cleanup();
  }

  return {
    fileType: "pdf",
    pageCount: document.numPages,
    pageSizes,
    engineVersion: String(pdfjs.version ?? "unknown"),
    async renderPageToCanvas(pageIndex: number, canvas: HTMLCanvasElement, pageScale: number, viewRotation: ViewRotation = 0) {
      const page = await document.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: pageScale, rotation: normalizeViewRotation(page.rotate + viewRotation) });
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas 2D context unavailable");
      }

      const outputScale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${Math.round(viewport.width)}px`;
      canvas.style.height = `${Math.round(viewport.height)}px`;

      const renderTask = page.render({
        canvas,
        canvasContext: context,
        transform: [outputScale, 0, 0, outputScale, 0, 0],
        viewport,
      });
      try {
        await renderTask.promise;
      } finally {
        page.cleanup();
      }
    },
    async renderPageTextLayer(
      pageIndex: number,
      container: HTMLDivElement,
      pageScale: number,
      viewRotation: ViewRotation = 0,
    ) {
      const page = await document.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: pageScale, rotation: normalizeViewRotation(page.rotate + viewRotation) });
      container.replaceChildren();
      container.style.setProperty("--scale-factor", String(pageScale));
      container.style.setProperty("--total-scale-factor", String(pageScale));
      container.style.setProperty("--scale-round-x", "1px");
      container.style.setProperty("--scale-round-y", "1px");
      const textContent = await page.getTextContent();
      if (textContent.items.length === 0) {
        container.setAttribute("data-text-layer-empty", "true");
      } else {
        container.removeAttribute("data-text-layer-empty");
      }
      const textLayer = new pdfjs.TextLayer({
        textContentSource: textContent,
        container,
        viewport,
      });
      try {
        await textLayer.render();
      } finally {
        page.cleanup();
      }
    },
    async getPageText(pageIndex: number) {
      const page = await document.getPage(pageIndex + 1);
      try {
        const textContent = await page.getTextContent();
        return pdfTextContentToPlainText(textContent);
      } finally {
        page.cleanup();
      }
    },
    async getOutline() {
      const outline = await document.getOutline();
      return normalizePdfOutlineItems(outline, {
        pageCount: document.numPages,
        resolveNamedDestination: (name) => document.getDestination(name),
        resolvePageIndex: (pageReference) => document.getPageIndex(pageReference as Parameters<typeof document.getPageIndex>[0]),
      });
    },
    async destroy() {
      await loadingTask.destroy();
    },
  };
}
