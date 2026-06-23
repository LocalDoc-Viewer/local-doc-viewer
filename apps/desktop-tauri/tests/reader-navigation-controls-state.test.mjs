import assert from "node:assert/strict";
import { test } from "node:test";

import { readerNavigationControlsState } from "../src/readerNavigationControlsState.ts";

test("reader navigation controls are disabled when navigation is unavailable", () => {
  const state = readerNavigationControlsState({
    isBusy: false,
    canUseReaderNavigation: false,
    isReaderNavigationOpen: false,
    readerNavigationFontSize: 15,
    minReaderNavigationFontSize: 12,
    maxReaderNavigationFontSize: 18,
  });

  assert.equal(state.toggleReaderNavigationDisabled, true);
  assert.equal(state.closeReaderNavigationDisabled, true);
  assert.equal(state.decreaseReaderNavigationFontDisabled, true);
  assert.equal(state.increaseReaderNavigationFontDisabled, true);
});

test("reader navigation controls follow open state and font size bounds", () => {
  const state = readerNavigationControlsState({
    isBusy: false,
    canUseReaderNavigation: true,
    isReaderNavigationOpen: true,
    readerNavigationFontSize: 15,
    minReaderNavigationFontSize: 12,
    maxReaderNavigationFontSize: 18,
  });

  assert.equal(state.toggleReaderNavigationDisabled, false);
  assert.equal(state.closeReaderNavigationDisabled, false);
  assert.equal(state.decreaseReaderNavigationFontDisabled, false);
  assert.equal(state.increaseReaderNavigationFontDisabled, false);
});

test("reader navigation controls respect busy and font boundary states", () => {
  const busyState = readerNavigationControlsState({
    isBusy: true,
    canUseReaderNavigation: true,
    isReaderNavigationOpen: true,
    readerNavigationFontSize: 15,
    minReaderNavigationFontSize: 12,
    maxReaderNavigationFontSize: 18,
  });

  assert.equal(busyState.toggleReaderNavigationDisabled, true);
  assert.equal(busyState.closeReaderNavigationDisabled, true);
  assert.equal(busyState.decreaseReaderNavigationFontDisabled, true);
  assert.equal(busyState.increaseReaderNavigationFontDisabled, true);

  const minState = readerNavigationControlsState({
    isBusy: false,
    canUseReaderNavigation: true,
    isReaderNavigationOpen: true,
    readerNavigationFontSize: 12,
    minReaderNavigationFontSize: 12,
    maxReaderNavigationFontSize: 18,
  });

  assert.equal(minState.decreaseReaderNavigationFontDisabled, true);
  assert.equal(minState.increaseReaderNavigationFontDisabled, false);

  const maxState = readerNavigationControlsState({
    isBusy: false,
    canUseReaderNavigation: true,
    isReaderNavigationOpen: true,
    readerNavigationFontSize: 18,
    minReaderNavigationFontSize: 12,
    maxReaderNavigationFontSize: 18,
  });

  assert.equal(maxState.decreaseReaderNavigationFontDisabled, false);
  assert.equal(maxState.increaseReaderNavigationFontDisabled, true);
});
