import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "documentFind.ts");

async function loadDocumentFind() {
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

test("document find returns no matches for blank queries", async () => {
  const { buildDocumentFindMatches } = await loadDocumentFind();

  assert.deepEqual(buildDocumentFindMatches([{ pageIndex: 0, text: "Fixture" }], ""), []);
  assert.deepEqual(buildDocumentFindMatches([{ pageIndex: 0, text: "Fixture" }], "   "), []);
});

test("document find matches text case-insensitively within a page", async () => {
  const { buildDocumentFindMatches } = await loadDocumentFind();

  assert.deepEqual(buildDocumentFindMatches([{ pageIndex: 0, text: "Fixture fixture" }], "fixture"), [
    { pageIndex: 0, matchIndex: 0, startIndex: 0 },
    { pageIndex: 0, matchIndex: 1, startIndex: 8 },
  ]);
});

test("document find matches text copied from a laid-out text layer", async () => {
  const { buildDocumentFindMatches, normalizeDocumentFindQuery } = await loadDocumentFind();

  assert.equal(normalizeDocumentFindQuery("  Local\u00a0Doc\r\nViewer \n Page 1  "), "local doc viewer page 1");
  assert.deepEqual(buildDocumentFindMatches([{ pageIndex: 0, text: "Local Doc Viewer\nPage 1" }], "Local\u00a0Doc\r\nViewer \n Page 1"), [
    { pageIndex: 0, matchIndex: 0, startIndex: 0 },
  ]);
});

test("document find preserves cross-page match order", async () => {
  const { buildDocumentFindMatches } = await loadDocumentFind();

  assert.deepEqual(
    buildDocumentFindMatches(
      [
        { pageIndex: 0, text: "Alpha" },
        { pageIndex: 1, text: "No match" },
        { pageIndex: 2, text: "alpha alpha" },
      ],
      "alpha",
    ),
    [
      { pageIndex: 0, matchIndex: 0, startIndex: 0 },
      { pageIndex: 2, matchIndex: 1, startIndex: 0 },
      { pageIndex: 2, matchIndex: 2, startIndex: 6 },
    ],
  );
});

test("document find next index wraps in both directions", async () => {
  const { nextDocumentFindIndex } = await loadDocumentFind();

  assert.equal(nextDocumentFindIndex(-1, 3, 1), 0);
  assert.equal(nextDocumentFindIndex(0, 3, 1), 1);
  assert.equal(nextDocumentFindIndex(2, 3, 1), 0);
  assert.equal(nextDocumentFindIndex(-1, 3, -1), 2);
  assert.equal(nextDocumentFindIndex(0, 3, -1), 2);
  assert.equal(nextDocumentFindIndex(0, 0, 1), -1);
});

test("document find normalizes and caps user queries", async () => {
  const { MAX_DOCUMENT_FIND_QUERY_LENGTH, normalizeDocumentFindQuery } = await loadDocumentFind();
  const longQuery = `  ${"a".repeat(MAX_DOCUMENT_FIND_QUERY_LENGTH + 20)}  `;

  assert.equal(normalizeDocumentFindQuery("  Fixture  "), "fixture");
  assert.equal(normalizeDocumentFindQuery(longQuery), "a".repeat(MAX_DOCUMENT_FIND_QUERY_LENGTH));
});
