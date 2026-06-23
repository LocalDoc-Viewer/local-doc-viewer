import assert from "node:assert/strict";
import { test } from "node:test";

import { readerDocumentCenterState } from "../src/readerDocumentCenterState.ts";

test("reader document center state keeps document maintenance actions available when idle", () => {
  const state = readerDocumentCenterState({
    isBusy: false,
    recentFileCount: 2,
  });

  assert.equal(state.openLocalDocumentDisabled, false);
  assert.equal(state.openLocalDocumentLabel, "打开文档");
  assert.equal(state.refreshRecentFilesDisabled, false);
  assert.equal(state.clearRecentFilesDisabled, false);
  assert.equal(state.clearRenderCacheDisabled, false);
  assert.equal(state.recentFilesEnabledDisabled, false);
});

test("reader document center state disables maintenance actions while busy", () => {
  const state = readerDocumentCenterState({
    isBusy: true,
    recentFileCount: 2,
  });

  assert.equal(state.openLocalDocumentDisabled, true);
  assert.equal(state.openLocalDocumentLabel, "处理中...");
  assert.equal(state.refreshRecentFilesDisabled, true);
  assert.equal(state.clearRecentFilesDisabled, true);
  assert.equal(state.clearRenderCacheDisabled, true);
  assert.equal(state.recentFilesEnabledDisabled, true);
});

test("reader document center state disables clear recent files when the list is empty", () => {
  const state = readerDocumentCenterState({
    isBusy: false,
    recentFileCount: 0,
  });

  assert.equal(state.clearRecentFilesDisabled, true);
  assert.equal(state.refreshRecentFilesDisabled, false);
  assert.equal(state.clearRenderCacheDisabled, false);
});
