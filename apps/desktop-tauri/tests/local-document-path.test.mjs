import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "localDocumentPath.ts");

async function loadLocalDocumentPath() {
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

test("local document directory is extracted from POSIX paths", async () => {
  const { localDocumentDirectoryFromPath } = await loadLocalDocumentPath();

  assert.equal(localDocumentDirectoryFromPath("/home/ldv/docs/simple-text.pdf"), "/home/ldv/docs");
});

test("local document directory is extracted from Windows paths", async () => {
  const { localDocumentDirectoryFromPath } = await loadLocalDocumentPath();

  assert.equal(
    localDocumentDirectoryFromPath("D:\\samples\\simple-text.pdf"),
    "D:\\samples",
  );
});

test("local document directory keeps root parents", async () => {
  const { localDocumentDirectoryFromPath } = await loadLocalDocumentPath();

  assert.equal(localDocumentDirectoryFromPath("/simple-text.pdf"), "/");
  assert.equal(localDocumentDirectoryFromPath("D:\\simple-text.pdf"), "D:\\");
});

test("local document directory ignores paths without a parent directory", async () => {
  const { localDocumentDirectoryFromPath } = await loadLocalDocumentPath();

  assert.equal(localDocumentDirectoryFromPath("simple-text.pdf"), null);
  assert.equal(localDocumentDirectoryFromPath(""), null);
});
