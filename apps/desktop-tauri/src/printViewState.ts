export type PrintOrientation = "portrait" | "landscape";
export type PrintDocumentMode = "page" | "text" | "image";
export type PrintViewMode = "continuous";

export type PageSize = {
  width: number;
  height: number;
};

export type PrintBodyState = {
  printOrientation: PrintOrientation;
  printDocumentMode: PrintDocumentMode;
  printViewMode?: PrintViewMode;
  viewRotation: string;
};

export function singlePagePrintState(input: {
  pageOrientation?: string;
  documentMode?: string;
  viewRotation: number;
}): PrintBodyState {
  return {
    printOrientation: input.pageOrientation === "landscape" ? "landscape" : "portrait",
    printDocumentMode: printDocumentMode(input.documentMode),
    viewRotation: String(input.viewRotation),
  };
}

export function continuousPrintState(input: {
  pageSize: PageSize | null;
  viewRotation: number;
}): PrintBodyState {
  return {
    printOrientation: input.pageSize && input.pageSize.width >= input.pageSize.height ? "landscape" : "portrait",
    printDocumentMode: "page",
    printViewMode: "continuous",
    viewRotation: String(input.viewRotation),
  };
}

function printDocumentMode(value?: string): PrintDocumentMode {
  if (value === "text" || value === "image") {
    return value;
  }
  return "page";
}
