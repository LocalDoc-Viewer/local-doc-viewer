import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";

const modulePath = resolve(import.meta.dirname, "..", "src", "appearanceThemeState.ts");

async function loadAppearanceThemeState() {
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("appearance theme defaults to system and resolves dark comfort from system dark", async () => {
  const {
    defaultAppearanceThemePreference,
    resolvedAppearanceTheme,
  } = await loadAppearanceThemeState();

  assert.equal(defaultAppearanceThemePreference, "system");
  assert.equal(resolvedAppearanceTheme("system", true), "dark-comfort");
  assert.equal(resolvedAppearanceTheme("system", false), "light");
});

test("appearance theme sanitizes stored preferences", async () => {
  const { appearanceThemePreferenceFromStorage } = await loadAppearanceThemeState();

  assert.equal(appearanceThemePreferenceFromStorage("dark-comfort"), "dark-comfort");
  assert.equal(appearanceThemePreferenceFromStorage("light"), "light");
  assert.equal(appearanceThemePreferenceFromStorage("system"), "system");
  assert.equal(appearanceThemePreferenceFromStorage("dark"), "system");
  assert.equal(appearanceThemePreferenceFromStorage(null), "system");
});

test("appearance theme exposes stable DOM dataset values", async () => {
  const { appearanceThemeDataset } = await loadAppearanceThemeState();

  assert.deepEqual(appearanceThemeDataset("system", true), {
    preference: "system",
    resolved: "dark-comfort",
  });
  assert.deepEqual(appearanceThemeDataset("dark-comfort", false), {
    preference: "dark-comfort",
    resolved: "dark-comfort",
  });
  assert.deepEqual(appearanceThemeDataset("light", true), {
    preference: "light",
    resolved: "light",
  });
});
