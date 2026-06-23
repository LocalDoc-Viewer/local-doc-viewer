import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "pdf", "pdfOutline.ts");

async function loadPdfOutlineModule() {
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

test("PDF outline normalization keeps only resolvable local page destinations", async () => {
  const { normalizePdfOutlineItems } = await loadPdfOutlineModule();
  const destinationRefs = new Map([
    ["intro-ref", 0],
    ["child-ref", 2],
    ["deep-ref", 3],
    ["out-of-range-ref", 9],
  ]);
  const namedDestinations = new Map([["child-dest", ["child-ref", { name: "Fit" }]]]);

  const result = await normalizePdfOutlineItems(
    [
      { title: "  Intro  ", dest: ["intro-ref", { name: "Fit" }], url: "https://example.invalid" },
      { title: "External URL", url: "https://example.invalid" },
      { title: "Named child", dest: "child-dest", items: [{ title: "Deep child", dest: ["deep-ref"] }] },
      { title: "Missing named destination", dest: "missing-dest" },
      { title: "Broken ref", dest: ["broken-ref"] },
      { title: "Out of range", dest: ["out-of-range-ref"] },
      { title: "   ", dest: ["intro-ref"] },
      { title: "Action only", action: "GoBack" },
    ],
    {
      pageCount: 4,
      async resolveNamedDestination(name) {
        return namedDestinations.get(name) ?? null;
      },
      async resolvePageIndex(pageReference) {
        if (!destinationRefs.has(pageReference)) {
          throw new Error(`unknown page ref: ${String(pageReference)}`);
        }
        return destinationRefs.get(pageReference);
      },
    },
  );

  assert.deepEqual(result, [
    { title: "Intro", pageIndex: 0, level: 0 },
    { title: "Named child", pageIndex: 2, level: 0 },
    { title: "Deep child", pageIndex: 3, level: 1 },
  ]);
});
