export type DiagnosticSummarySessionState = {
  fileType: string;
  page: string;
  engine: string;
};

export type DiagnosticSummaryState = {
  code: string;
  message: string;
  file_type: string;
  page: string;
  scale: string;
  engine: string;
  action: string;
  performance_phase: string;
  performance_duration_bucket: string;
  performance_recent_events: string;
  performance_recommendation: string;
  created_at: string;
};

const DIAGNOSTIC_SUMMARY_MAX_VALUE_LENGTH = 200;
const REDACTED_LOCAL_PATH = "[local-path]";

function sanitizeDiagnosticSummaryValue(value: unknown, fallback = "unknown") {
  const rawValue = String(value ?? "").trim() || fallback;
  const redactedValue = rawValue
    .replace(/\bfile:\/\/\/?[^\r\n,，;；)）]+/gi, REDACTED_LOCAL_PATH)
    .replace(/\b[A-Za-z]:[\\/][^\r\n,，;；)）]+/g, REDACTED_LOCAL_PATH)
    .replace(/(^|[\s(:=])\/(?:Users|home|mnt|Volumes|tmp|var)\/[^\r\n,，;；)）]+/g, `$1${REDACTED_LOCAL_PATH}`);

  if (redactedValue.length <= DIAGNOSTIC_SUMMARY_MAX_VALUE_LENGTH) {
    return redactedValue;
  }
  return `${redactedValue.slice(0, DIAGNOSTIC_SUMMARY_MAX_VALUE_LENGTH)}...`;
}

export function diagnosticSummaryFromState(input: {
  renderError: { code?: unknown } | null;
  message: string;
  pendingFileType?: string | null;
  session?: DiagnosticSummarySessionState | null;
  scale: string;
  action: string;
  performancePhase: string;
  performanceDurationBucket: string;
  performanceRecentEvents: string;
  performanceRecommendation: string;
  createdAt: string;
}): DiagnosticSummaryState {
  const summarySession = input.pendingFileType ? null : input.session;
  return {
    code: sanitizeDiagnosticSummaryValue(input.renderError?.code ?? "UNKNOWN", "UNKNOWN"),
    message: sanitizeDiagnosticSummaryValue(input.message),
    file_type: sanitizeDiagnosticSummaryValue(input.pendingFileType ?? summarySession?.fileType ?? "unknown"),
    page: sanitizeDiagnosticSummaryValue(summarySession?.page ?? "n/a"),
    scale: sanitizeDiagnosticSummaryValue(input.scale),
    engine: sanitizeDiagnosticSummaryValue(summarySession?.engine ?? "unknown"),
    action: sanitizeDiagnosticSummaryValue(input.action, "unknown"),
    performance_phase: sanitizeDiagnosticSummaryValue(input.performancePhase),
    performance_duration_bucket: sanitizeDiagnosticSummaryValue(input.performanceDurationBucket),
    performance_recent_events: sanitizeDiagnosticSummaryValue(input.performanceRecentEvents),
    performance_recommendation: sanitizeDiagnosticSummaryValue(input.performanceRecommendation),
    created_at: sanitizeDiagnosticSummaryValue(input.createdAt),
  };
}
