import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "recentFileViewState.ts");

async function loadRecentFileViewState() {
  const source = readFileSync(modulePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: modulePath,
  });
  const encoded = encodeURIComponent(`${compiled.outputText}\n//# sourceURL=${pathToFileURL(modulePath).href}`);

  return import(`data:text/javascript;charset=utf-8,${encoded}`);
}

test("recent file view state shows location only for duplicate names", async () => {
  const { recentFileViewStates } = await loadRecentFileViewState();

  assert.deepEqual(recentFileViewStates({
    entries: [
      { id: "a", displayName: "same.pdf", fileType: "pdf", openedAt: "1", locationHint: "C:/one" },
      { id: "b", displayName: "same.pdf", fileType: "pdf", openedAt: "2", locationHint: "D:/two" },
      { id: "c", displayName: "solo.ofd", fileType: "ofd", openedAt: "3", locationHint: "E:/solo" },
    ],
    unavailableIds: new Set(),
  }).map((entry) => ({
    id: entry.id,
    title: entry.title,
    shouldShowLocationHint: entry.shouldShowLocationHint,
  })), [
    { id: "a", title: "same.pdf · C:/one", shouldShowLocationHint: true },
    { id: "b", title: "same.pdf · D:/two", shouldShowLocationHint: true },
    { id: "c", title: "solo.ofd", shouldShowLocationHint: false },
  ]);
});

test("recent file view state keeps hidden location hints out of hover titles", async () => {
  const { recentFileViewStates } = await loadRecentFileViewState();

  const [entry] = recentFileViewStates({
    entries: [
      { id: "solo", displayName: "solo.pdf", fileType: "pdf", openedAt: "1", locationHint: "C:/Users/tester/private" },
    ],
    unavailableIds: new Set(),
  });

  assert.equal(entry.shouldShowLocationHint, false);
  assert.equal(entry.locationHint, "C:/Users/tester/private");
  assert.equal(entry.title, "solo.pdf");
});

test("recent file view state marks unavailable entries without leaking more path text", async () => {
  const { recentFileViewStates } = await loadRecentFileViewState();

  assert.deepEqual(recentFileViewStates({
    entries: [
      { id: "a", displayName: "missing.pdf", fileType: "pdf", openedAt: "1", locationHint: "C:/hidden" },
      { id: "b", displayName: "plain.ofd", fileType: "ofd", openedAt: "2", locationHint: "" },
    ],
    unavailableIds: new Set(["a"]),
  }).map((entry) => ({
    id: entry.id,
    iconLabel: entry.iconLabel,
    isUnavailable: entry.isUnavailable,
    title: entry.title,
    locationHint: entry.locationHint,
  })), [
    {
      id: "a",
      iconLabel: "PDF",
      isUnavailable: true,
      title: "missing.pdf - 文件不可用",
      locationHint: "C:/hidden",
    },
    {
      id: "b",
      iconLabel: "OFD",
      isUnavailable: false,
      title: "plain.ofd",
      locationHint: "",
    },
  ]);
});

test("recent file view state keeps icon labels compact with damaged file types", async () => {
  const { recentFileViewStates } = await loadRecentFileViewState();

  assert.deepEqual(recentFileViewStates({
    entries: [
      { id: "pdf", displayName: "normal.pdf", fileType: "pdf", openedAt: "1", locationHint: "" },
      { id: "docx", displayName: "normal.docx", fileType: "docx", openedAt: "2", locationHint: "" },
      { id: "empty", displayName: "unknown", fileType: "   ", openedAt: "3", locationHint: "" },
      {
        id: "long",
        displayName: "damaged",
        fileType: "very-long-private-format",
        openedAt: "4",
        locationHint: "",
      },
    ],
    unavailableIds: new Set(),
  }).map((entry) => ({
    id: entry.id,
    iconLabel: entry.iconLabel,
  })), [
    { id: "pdf", iconLabel: "PDF" },
    { id: "docx", iconLabel: "DOCX" },
    { id: "empty", iconLabel: "DOC" },
    { id: "long", iconLabel: "VERY" },
  ]);
});
