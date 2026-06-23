export const defaultOfdScaleRenderDebounceMs = 180;

export type OfdScaleRenderTarget = {
  sessionId: string;
  pageIndex: number;
  scale: number;
};

export type OfdScaleRenderSessionState = {
  id: string;
  file_type: string;
};

export type OfdScalePreviewBaseSize = {
  width: number;
  height: number;
};

export type OfdScaleRenderRequest = OfdScaleRenderTarget & {
  requestId: number;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export type OfdScaleRenderStateOptions = {
  debounceMs?: number;
  setTimeout?: (callback: () => void, delay: number) => TimerHandle;
  clearTimeout?: (timer: TimerHandle) => void;
};

export type OfdScaleRenderCurrentOptions = {
  isSameScale?: (currentScale: number, targetScale: number) => boolean;
};

export function ofdScaleRenderTargetFromSession(input: {
  session: OfdScaleRenderSessionState | null;
  pageIndex: number;
  scale: number;
}) {
  if (!input.session || input.session.file_type !== "ofd") {
    return null;
  }

  return {
    sessionId: input.session.id,
    pageIndex: input.pageIndex,
    scale: input.scale,
  };
}

export function ofdScalePreviewSize(input: {
  baseSize: OfdScalePreviewBaseSize | null;
  scale: number;
}) {
  if (!input.baseSize) {
    return null;
  }

  return {
    width: Math.round(input.baseSize.width * input.scale),
    height: Math.round(input.baseSize.height * input.scale),
  };
}

export function createOfdScaleRenderState(options: OfdScaleRenderStateOptions = {}) {
  const debounceMs = options.debounceMs ?? defaultOfdScaleRenderDebounceMs;
  const scheduleTimer = options.setTimeout ?? setTimeout;
  const clearTimer = options.clearTimeout ?? clearTimeout;
  let timer: TimerHandle | null = null;
  let latestRequestId = 0;

  function schedule(
    target: OfdScaleRenderTarget,
    callback: (request: OfdScaleRenderRequest) => void,
  ) {
    if (timer) {
      clearTimer(timer);
    }

    latestRequestId += 1;
    const request = {
      requestId: latestRequestId,
      ...target,
    };

    timer = scheduleTimer(() => {
      timer = null;
      callback(request);
    }, debounceMs);

    return request;
  }

  function isCurrent(
    request: OfdScaleRenderRequest,
    current: OfdScaleRenderTarget,
    currentOptions: OfdScaleRenderCurrentOptions = {},
  ) {
    const isSameScale = currentOptions.isSameScale ?? Object.is;
    return request.requestId === latestRequestId
      && request.sessionId === current.sessionId
      && request.pageIndex === current.pageIndex
      && isSameScale(current.scale, request.scale);
  }

  function cancel() {
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    latestRequestId += 1;
  }

  return {
    schedule,
    isCurrent,
    cancel,
  };
}
