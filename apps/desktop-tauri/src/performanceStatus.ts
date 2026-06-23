export type PerformancePhase = "idle" | "ofd_open_inspect" | "ofd_render_wait" | "ofd_render_page" | "ofd_cache_hit";

export type DurationBucket = "unknown" | "lt_250ms" | "250ms_1s" | "1s_3s" | "3s_10s" | "gte_10s";

export type PerformanceStatus = {
  phase: PerformancePhase;
  duration_bucket: DurationBucket;
};

export type PerformanceTraceEvent = {
  phase: Exclude<PerformancePhase, "idle">;
  duration_bucket: DurationBucket;
};

export type OfdPerformanceRouteRecommendation =
  | "insufficient_events"
  | "inspect_or_renderer_lifecycle"
  | "frontend_wait_pipeline"
  | "page_render_pipeline"
  | "cache_pipeline"
  | "watch_continuous_interaction";

const slowDurationBuckets: readonly DurationBucket[] = ["1s_3s", "3s_10s", "gte_10s"];

export function durationBucket(durationMs: number | null | undefined): DurationBucket {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return "unknown";
  }
  if (durationMs < 250) {
    return "lt_250ms";
  }
  if (durationMs < 1000) {
    return "250ms_1s";
  }
  if (durationMs < 3000) {
    return "1s_3s";
  }
  if (durationMs < 10000) {
    return "3s_10s";
  }
  return "gte_10s";
}

export function performanceStatus(phase: PerformancePhase, durationMs?: number | null): PerformanceStatus {
  return {
    phase,
    duration_bucket: durationBucket(durationMs),
  };
}

export function appendPerformanceTraceEvent(
  events: readonly PerformanceTraceEvent[],
  status: PerformanceStatus,
  maxEvents = 6,
): PerformanceTraceEvent[] {
  if (status.phase === "idle") {
    return events.slice(-maxEvents);
  }

  return [
    ...events,
    {
      phase: status.phase,
      duration_bucket: status.duration_bucket,
    },
  ].slice(-maxEvents);
}

export function formatPerformanceTrace(events: readonly PerformanceTraceEvent[]) {
  if (events.length === 0) {
    return "none";
  }

  return events.map((event) => `${event.phase}:${event.duration_bucket}`).join(" | ");
}

export function recommendOfdPerformanceRoute(
  events: readonly PerformanceTraceEvent[],
): OfdPerformanceRouteRecommendation {
  if (events.length === 0) {
    return "insufficient_events";
  }

  const hasSlowPhase = (phase: PerformanceTraceEvent["phase"]) => events.some(
    (event) => event.phase === phase && slowDurationBuckets.includes(event.duration_bucket),
  );

  if (hasSlowPhase("ofd_open_inspect")) {
    return "inspect_or_renderer_lifecycle";
  }
  if (hasSlowPhase("ofd_render_page")) {
    return "page_render_pipeline";
  }
  if (hasSlowPhase("ofd_render_wait")) {
    return "frontend_wait_pipeline";
  }
  if (hasSlowPhase("ofd_cache_hit")) {
    return "cache_pipeline";
  }
  return "watch_continuous_interaction";
}

export function performancePhaseMessage(phase: PerformancePhase) {
  switch (phase) {
    case "ofd_open_inspect":
      return "正在解析 OFD";
    case "ofd_render_wait":
      return "";
    case "ofd_render_page":
      return "正在渲染 OFD 页面";
    case "ofd_cache_hit":
      return "正在加载缓存";
    case "idle":
      return "";
  }
}
