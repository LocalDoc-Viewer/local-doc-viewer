import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createOfdScaleRenderState,
  defaultOfdScaleRenderDebounceMs,
  ofdScalePreviewSize,
  ofdScaleRenderTargetFromSession,
} from "../src/ofdScaleRenderState.ts";

function createManualTimers() {
  const timers = [];
  const cleared = new Set();

  return {
    timers,
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      cleared.add(timer);
    },
    isCleared(timer) {
      return cleared.has(timer);
    },
  };
}

test("OFD scale render state debounces clear rerenders and keeps the latest request current", () => {
  const timers = createManualTimers();
  const state = createOfdScaleRenderState({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });
  const fired = [];

  const first = state.schedule({ sessionId: "s1", pageIndex: 0, scale: 1.25 }, (request) => {
    fired.push(request.requestId);
  });
  const second = state.schedule({ sessionId: "s1", pageIndex: 0, scale: 1.5 }, (request) => {
    fired.push(request.requestId);
  });

  assert.equal(timers.timers.length, 2);
  assert.equal(timers.timers[0].delay, defaultOfdScaleRenderDebounceMs);
  assert.equal(timers.isCleared(timers.timers[0]), true);
  assert.equal(state.isCurrent(first, { sessionId: "s1", pageIndex: 0, scale: 1.25 }), false);
  assert.equal(state.isCurrent(second, { sessionId: "s1", pageIndex: 0, scale: 1.5 }), true);

  timers.timers[1].callback();

  assert.deepEqual(fired, [second.requestId]);
});

test("OFD scale render state rejects stale session page and scale targets", () => {
  const timers = createManualTimers();
  const state = createOfdScaleRenderState({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  const request = state.schedule({ sessionId: "s1", pageIndex: 2, scale: 1.5 }, () => {});

  assert.equal(state.isCurrent(request, { sessionId: "s2", pageIndex: 2, scale: 1.5 }), false);
  assert.equal(state.isCurrent(request, { sessionId: "s1", pageIndex: 3, scale: 1.5 }), false);
  assert.equal(state.isCurrent(request, { sessionId: "s1", pageIndex: 2, scale: 1.52 }), false);
  assert.equal(
    state.isCurrent(request, { sessionId: "s1", pageIndex: 2, scale: 1.519 }, { isSameScale: (a, b) => Math.abs(a - b) < 0.02 }),
    true,
  );
});

test("OFD scale render state can cancel pending work", () => {
  const timers = createManualTimers();
  const state = createOfdScaleRenderState({
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  });

  const request = state.schedule({ sessionId: "s1", pageIndex: 0, scale: 1 }, () => {});
  state.cancel();

  assert.equal(timers.isCleared(timers.timers[0]), true);
  assert.equal(state.isCurrent(request, { sessionId: "s1", pageIndex: 0, scale: 1 }), false);
});

test("OFD scale render target is available only for current OFD sessions", () => {
  assert.deepEqual(
    ofdScaleRenderTargetFromSession({
      session: { id: "ofd-session", file_type: "ofd" },
      pageIndex: 2,
      scale: 1.5,
    }),
    {
      sessionId: "ofd-session",
      pageIndex: 2,
      scale: 1.5,
    },
  );

  assert.equal(
    ofdScaleRenderTargetFromSession({
      session: null,
      pageIndex: 0,
      scale: 1,
    }),
    null,
  );
  assert.equal(
    ofdScaleRenderTargetFromSession({
      session: { id: "pdf-session", file_type: "pdf" },
      pageIndex: 0,
      scale: 1,
    }),
    null,
  );
});

test("OFD scale preview size rounds scaled page dimensions", () => {
  assert.deepEqual(
    ofdScalePreviewSize({
      baseSize: { width: 101, height: 201 },
      scale: 1.25,
    }),
    {
      width: 126,
      height: 251,
    },
  );
  assert.equal(ofdScalePreviewSize({ baseSize: null, scale: 1.5 }), null);
});
