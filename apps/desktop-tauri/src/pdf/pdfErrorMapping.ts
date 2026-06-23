export type PdfRenderError = {
  code: string;
  message: string;
  recoverable: boolean;
  safe_to_show: boolean;
  detail_for_report: string;
};

type NamedMessageError = {
  name?: unknown;
  message?: unknown;
};

function errorName(error: unknown) {
  if (error instanceof Error) {
    return error.name;
  }
  if (typeof error === "object" && error !== null && "name" in error) {
    return String((error as NamedMessageError).name);
  }
  return "";
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as NamedMessageError).message);
  }
  return String(error);
}

function errorFingerprint(error: unknown) {
  return `${errorName(error)} ${errorMessage(error)}`.toLowerCase();
}

function safeDiagnosticDetail(error: unknown) {
  const rawDetail =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : String(error);
  return rawDetail
    .replace(/[A-Za-z]:[\\/][^\r\n"'<>]+/g, "<local-path>")
    .replace(/\/(?:[^/\r\n"'<>]+\/){2,}[^\r\n"'<>]+/g, "<local-path>")
    .slice(0, 400);
}

function isPdfRenderError(error: unknown): error is PdfRenderError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    "safe_to_show" in error &&
    "detail_for_report" in error
  );
}

export function isPdfPasswordOrEncryptedError(error: unknown) {
  const fingerprint = errorFingerprint(error);

  return errorName(error) === "PasswordException" || fingerprint.includes("password") || fingerprint.includes("encrypt");
}

export function isPdfInvalidStructureError(error: unknown) {
  const fingerprint = errorFingerprint(error);

  return (
    errorName(error) === "InvalidPDFException" ||
    errorName(error) === "MissingPDFException" ||
    fingerprint.includes("invalid pdf") ||
    fingerprint.includes("missing pdf") ||
    fingerprint.includes("xref") ||
    fingerprint.includes("trailer")
  );
}

function pdfUnsupportedFeatureError(error: unknown): PdfRenderError {
  return {
    code: "UNSUPPORTED_PDF_FEATURE",
    message: "该 PDF 受密码或权限保护，暂不支持打开。",
    recoverable: true,
    safe_to_show: true,
    detail_for_report: safeDiagnosticDetail(error),
  };
}

function pdfStructureError(error: unknown): PdfRenderError {
  return {
    code: "PDF_STRUCTURE_ERROR",
    message: "无法打开该 PDF 文件。",
    recoverable: false,
    safe_to_show: true,
    detail_for_report: safeDiagnosticDetail(error),
  };
}

function pdfRendererError(error: unknown): PdfRenderError {
  return {
    code: "PDF_RENDERER_ERROR",
    message: "无法打开该 PDF 文件。",
    recoverable: true,
    safe_to_show: true,
    detail_for_report: safeDiagnosticDetail(error),
  };
}

export function renderErrorFromPdfOpenFailure(error: unknown): PdfRenderError {
  if (isPdfRenderError(error)) {
    return error;
  }

  if (isPdfPasswordOrEncryptedError(error)) {
    return pdfUnsupportedFeatureError(error);
  }

  if (isPdfInvalidStructureError(error)) {
    return pdfStructureError(error);
  }

  return pdfRendererError(error);
}
