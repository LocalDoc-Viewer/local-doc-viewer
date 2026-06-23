import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "pdf", "pdfTextContent.ts");

async function loadPdfTextContent() {
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

test("PDF text content is normalized for current-page clipboard copy", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "Local" },
      { str: "  Doc" },
      { str: "Viewer", hasEOL: true },
      { str: "Page" },
      { str: "  2" },
      { str: "" },
      { str: "Footer", hasEOL: true },
      { str: 42 },
    ],
  });

  assert.equal(text, "Local Doc Viewer\nPage 2 Footer");
});

test("PDF text content ignores empty items when deciding line breaks", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "Before" },
      { str: "", hasEOL: true },
      { str: 123, hasEOL: true },
      { str: "After" },
    ],
  });

  assert.equal(text, "Before After");
});

test("PDF text content starts a new line when item y position changes", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "First", transform: [1, 0, 0, 1, 72, 720] },
      { str: "line", transform: [1, 0, 0, 1, 110, 720] },
      { str: "Second", transform: [1, 0, 0, 1, 72, 700] },
      { str: "line", transform: [1, 0, 0, 1, 125, 700] },
    ],
  });

  assert.equal(text, "First line\nSecond line");
});

test("PDF text content avoids duplicate line breaks after hasEOL", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "First", hasEOL: true, transform: [1, 0, 0, 1, 72, 720] },
      { str: "Second", transform: [1, 0, 0, 1, 72, 700] },
    ],
  });

  assert.equal(text, "First\nSecond");
});

test("PDF text content keeps small baseline shifts on one line", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "Value", transform: [1, 0, 0, 1, 72, 720] },
      { str: "2", transform: [1, 0, 0, 1, 110, 722] },
      { str: "continues", transform: [1, 0, 0, 1, 122, 720] },
    ],
  });

  assert.equal(text, "Value 2 continues");
});

test("PDF text content removes spaces before detached punctuation", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "Hello" },
      { str: "," },
      { str: "world" },
      { str: "." },
    ],
  });

  assert.equal(text, "Hello, world.");
});

test("PDF text content removes spaces inside detached parentheses", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "(" },
      { str: "Alpha" },
      { str: ")" },
    ],
  });

  assert.equal(text, "(Alpha)");
});

test("PDF text content joins adjacent fragments from the same word", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "Lo", width: 14, transform: [1, 0, 0, 1, 72, 720] },
      { str: "cal", width: 21, transform: [1, 0, 0, 1, 86, 720] },
      { str: "Doc", width: 22, transform: [1, 0, 0, 1, 120, 720] },
    ],
  });

  assert.equal(text, "Local Doc");
});

test("PDF text content preserves spaces between separated word fragments", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();

  const text = pdfTextContentToPlainText({
    items: [
      { str: "Local", width: 28, transform: [1, 0, 0, 1, 72, 720] },
      { str: "Doc", width: 22, transform: [1, 0, 0, 1, 112, 720] },
      { str: "Viewer", width: 44, transform: [1, 0, 0, 1, 145, 720] },
    ],
  });

  assert.equal(text, "Local Doc Viewer");
});
