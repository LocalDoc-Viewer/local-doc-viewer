import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "..", "..", "..");
const desktopRoot = resolve(repoRoot, "apps", "desktop-tauri");
const fixtureRoot = resolve(repoRoot, "testdata", "public", "pdf");
const fixtureScriptPath = resolve(repoRoot, "scripts", "fixtures", "create-public-pdf-fixtures.mjs");
const chineseFixtureScriptPath = resolve(repoRoot, "scripts", "fixtures", "create-public-pdf-chinese-fixture.mjs");
const pdfTextContentModulePath = resolve(desktopRoot, "src", "pdf", "pdfTextContent.ts");
const standardFontDataUrl = `${resolve(
  desktopRoot,
  "node_modules",
  "pdfjs-dist",
  "standard_fonts",
).replaceAll("\\", "/")}/`;

function readFixture(name) {
  return readFileSync(resolve(fixtureRoot, name));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function openFixtureWithPdfJs(name, options = {}) {
  const pdfjs = await import(
    pathToFileURL(resolve(desktopRoot, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.mjs")).href
  );
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(readFixture(name)),
    disableWorker: true,
    disableRange: true,
    disableAutoFetch: true,
    disableStream: true,
    stopAtErrors: true,
    useWasm: false,
    useWorkerFetch: false,
    standardFontDataUrl,
    ...options,
  });

  const document = await loadingTask.promise;
  return { document, loadingTask };
}

async function loadPdfTextContent() {
  const source = readFileSync(pdfTextContentModulePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
      strict: true,
    },
    fileName: pdfTextContentModulePath,
  });
  const encoded = encodeURIComponent(`${compiled.outputText}\n//# sourceURL=${pathToFileURL(pdfTextContentModulePath).href}`);

  return import(`data:text/javascript;charset=utf-8,${encoded}`);
}

test("public PDF fixtures are generated and documented", () => {
  const manifest = readFileSync(resolve(fixtureRoot, "manifest.txt"), "utf8");
  const expectedNames = [
    "simple-text.pdf",
    "multi-page-text.pdf",
    "a4-text.pdf",
    "image-page.pdf",
    "image-only-page.pdf",
    "large-page.pdf",
    "rotated-page.pdf",
    "corrupt.pdf",
    "encrypted-password.pdf",
    "embedded-font-text.pdf",
  ];

  for (const name of expectedNames) {
    const bytes = readFixture(name);
    assert.match(bytes.subarray(0, 8).toString("ascii"), /^%PDF-1\./);
    assert.match(manifest, new RegExp(`\\| ${name} \\|`));
    assert.match(manifest, new RegExp(`\\| ${name} \\|[^\\n]*\\| ${sha256(bytes)} \\|`));
    assert.match(manifest, new RegExp(`\\| ${name} \\|[^\\n]*\\| no \\|`));
  }
});

test("public PDF fixture script avoids external inputs", () => {
  const source = readFileSync(fixtureScriptPath, "utf8");

  assert.match(source, /const outputDir = resolve\(repoRoot, "testdata", "public", "pdf"\)/);
  assert.doesNotMatch(source, /\breadFileSync\b/);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /local-samples/);
});

test("public Chinese PDF fixture script uses only approved local generation inputs", () => {
  const source = readFileSync(chineseFixtureScriptPath, "utf8");
  const packageJson = JSON.parse(readFileSync(resolve(desktopRoot, "package.json"), "utf8"));

  assert.equal(packageJson.devDependencies["pdf-lib"], "1.17.1");
  assert.equal(packageJson.devDependencies["@pdf-lib/fontkit"], "1.1.1");
  assert.match(source, /const outputPath = resolve\(outputDir, "embedded-font-text\.pdf"\)/);
  assert.match(source, /LDVPublicCJKSubset-Regular\.otf/);
  assert.match(source, /registerFontkit/);
  assert.match(source, /embedFont/);
  assert.doesNotMatch(source, /\bfetch\b/);
  assert.doesNotMatch(source, /https?:\/\//);
  assert.doesNotMatch(source, /local-samples/);
});

test("public PDF manifest documents special fixture purposes", () => {
  const manifest = readFileSync(resolve(fixtureRoot, "manifest.txt"), "utf8");

  assert.match(manifest, /\| image-page\.pdf \|[^\n]*image XObject smoke/);
  assert.match(manifest, /\| image-only-page\.pdf \|[^\n]*image-only smoke/);
  assert.match(manifest, /\| large-page\.pdf \|[^\n]*large page-size boundary smoke/);
  assert.match(manifest, /\| rotated-page\.pdf \|[^\n]*rotated page boundary smoke/);
  assert.match(manifest, /\| corrupt\.pdf \|[^\n]*negative smoke for safe PDF error handling/);
  assert.match(manifest, /\| encrypted-password\.pdf \|[^\n]*protected PDF safe failure regression/);
  assert.match(manifest, /\| encrypted-password\.pdf \|[^\n]*public-test-password/);
  assert.match(manifest, /\| encrypted-password\.pdf \|[^\n]*Standard Security Handler revision 2/);
  assert.match(manifest, /\| embedded-font-text\.pdf \|[^\n]*Chinese text extraction/);
  assert.match(manifest, /\| embedded-font-text\.pdf \|[^\n]*Noto CJK Sans2\.004/);
  assert.match(manifest, /\| embedded-font-text\.pdf \|[^\n]*LDVPublicCJKSubset-Regular\.otf/);
});

test("positive public PDF fixtures open with PDF.js", async () => {
  const expectedPageCounts = new Map([
    ["simple-text.pdf", 1],
    ["multi-page-text.pdf", 3],
    ["a4-text.pdf", 1],
    ["image-page.pdf", 1],
    ["image-only-page.pdf", 1],
    ["large-page.pdf", 1],
    ["rotated-page.pdf", 1],
  ]);

  for (const [name, pageCount] of expectedPageCounts) {
    const { document, loadingTask } = await openFixtureWithPdfJs(name);
    try {
      assert.equal(document.numPages, pageCount);
    } finally {
      await loadingTask.destroy();
    }
  }
});

test("A4 PDF fixture uses an A4 media box for print smoke", () => {
  const bytes = readFixture("a4-text.pdf");

  assert.match(bytes.toString("ascii"), /\/MediaBox \[0 0 595\.28 841\.89\]/);
});

test("image PDF fixture contains only generated image content", () => {
  const bytes = readFixture("image-page.pdf");
  const source = bytes.toString("ascii");

  assert.match(source, /\/Subtype \/Image/);
  assert.match(source, /\/ColorSpace \/DeviceRGB/);
  assert.match(source, /\/Width 2/);
  assert.match(source, /\/Height 2/);
  assert.match(source, /Public synthetic image fixture/);
});

test("image-only PDF fixture contains no selectable text content marker", () => {
  const bytes = readFixture("image-only-page.pdf");
  const source = bytes.toString("ascii");

  assert.match(source, /\/Subtype \/Image/);
  assert.doesNotMatch(source, /\bBT\b/);
  assert.doesNotMatch(source, /\bTj\b/);
});

test("PDF.js reads no text items from the image-only fixture", async () => {
  const { document, loadingTask } = await openFixtureWithPdfJs("image-only-page.pdf");
  try {
    const page = await document.getPage(1);
    const textContent = await page.getTextContent();

    assert.equal(textContent.items.length, 0);
    page.cleanup();
  } finally {
    await loadingTask.destroy();
  }
});

test("PDF.js extracts expected text from public text fixtures", async () => {
  const expectedPages = [
    {
      name: "simple-text.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture Simple one-page smoke document Public synthetic content only",
    },
    {
      name: "multi-page-text.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture Page 1 of 3 Public synthetic content only",
    },
    {
      name: "multi-page-text.pdf",
      pageNumber: 2,
      expected: "Local Doc Viewer PDF Fixture Page 2 of 3 Rectangle smoke marker: [====]",
    },
    {
      name: "multi-page-text.pdf",
      pageNumber: 3,
      expected: "Local Doc Viewer PDF Fixture Page 3 of 3 End of generated fixture",
    },
  ];

  for (const { name, pageNumber, expected } of expectedPages) {
    const { document, loadingTask } = await openFixtureWithPdfJs(name);
    try {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const actual = textContent.items
        .map((item) => item.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      assert.equal(actual, expected);
      page.cleanup();
    } finally {
      await loadingTask.destroy();
    }
  }
});

test("production copy text normalization matches public text fixtures", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();
  const expectedPages = [
    {
      name: "simple-text.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture\nSimple one-page smoke document\nPublic synthetic content only",
    },
    {
      name: "multi-page-text.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture\nPage 1 of 3\nPublic synthetic content only",
    },
    {
      name: "multi-page-text.pdf",
      pageNumber: 2,
      expected: "Local Doc Viewer PDF Fixture\nPage 2 of 3\nRectangle smoke marker: [====]",
    },
    {
      name: "multi-page-text.pdf",
      pageNumber: 3,
      expected: "Local Doc Viewer PDF Fixture\nPage 3 of 3\nEnd of generated fixture",
    },
    {
      name: "a4-text.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture\nA4 print smoke document\nPublic synthetic content only",
    },
    {
      name: "image-page.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture\nPublic synthetic image fixture",
    },
    {
      name: "image-only-page.pdf",
      pageNumber: 1,
      expected: "",
    },
    {
      name: "large-page.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture\nLarge page smoke document\nPublic synthetic content only",
    },
    {
      name: "rotated-page.pdf",
      pageNumber: 1,
      expected: "Local Doc Viewer PDF Fixture\nRotated page smoke document\nPublic synthetic content only",
    },
  ];

  for (const { name, pageNumber, expected } of expectedPages) {
    const { document, loadingTask } = await openFixtureWithPdfJs(name);
    try {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();

      assert.equal(pdfTextContentToPlainText(textContent), expected);
      page.cleanup();
    } finally {
      await loadingTask.destroy();
    }
  }
});

test("PDF.js extracts expected Chinese text from the embedded-font fixture", async () => {
  const { document, loadingTask } = await openFixtureWithPdfJs("embedded-font-text.pdf");
  try {
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    const textContent = await page.getTextContent();
    const actual = textContent.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    assert.equal(
      actual,
      "本文件是 local-doc-viewer PDF 中文渲染测试样本。 第二行用于验证中文文本提取、复制和基础换行。 Public synthetic content only.",
    );
    page.cleanup();
  } finally {
    await loadingTask.destroy();
  }
});

test("production copy text normalization matches the embedded-font Chinese fixture", async () => {
  const { pdfTextContentToPlainText } = await loadPdfTextContent();
  const { document, loadingTask } = await openFixtureWithPdfJs("embedded-font-text.pdf");
  try {
    const page = await document.getPage(1);
    const textContent = await page.getTextContent();

    assert.equal(
      pdfTextContentToPlainText(textContent),
      [
        "本文件是 local-doc-viewer PDF 中文渲染测试样本。",
        "第二行用于验证中文文本提取、复制和基础换行。",
        "Public synthetic content only.",
      ].join("\n"),
    );
    page.cleanup();
  } finally {
    await loadingTask.destroy();
  }
});

test("large-page PDF fixture uses an oversized media box", () => {
  const bytes = readFixture("large-page.pdf");

  assert.match(bytes.toString("ascii"), /\/MediaBox \[0 0 1440 2160\]/);
});

test("rotated-page PDF fixture declares page rotation", () => {
  const bytes = readFixture("rotated-page.pdf");

  assert.match(bytes.toString("ascii"), /\/Rotate 90/);
});

test("PDF.js reads expected page dimensions from public fixtures", async () => {
  const expectedSizes = new Map([
    ["a4-text.pdf", { width: 595.28, height: 841.89 }],
    ["large-page.pdf", { width: 1440, height: 2160 }],
    ["rotated-page.pdf", { width: 792, height: 612 }],
  ]);

  for (const [name, expected] of expectedSizes) {
    const { document, loadingTask } = await openFixtureWithPdfJs(name);
    try {
      const page = await document.getPage(1);
      const viewport = page.getViewport({ scale: 1 });

      assert.equal(viewport.width, expected.width);
      assert.equal(viewport.height, expected.height);
      page.cleanup();
    } finally {
      await loadingTask.destroy();
    }
  }
});

test("corrupt PDF fixture is intentionally truncated", () => {
  const simple = readFixture("simple-text.pdf");
  const corrupt = readFixture("corrupt.pdf");

  assert.ok(corrupt.length < simple.length);
  assert.doesNotMatch(corrupt.toString("latin1"), /%%EOF\s*$/);
});

test("encrypted PDF fixture requires the documented public test password", async () => {
  await assert.rejects(
    openFixtureWithPdfJs("encrypted-password.pdf"),
    (error) => {
      assert.equal(error.name, "PasswordException");
      assert.match(error.message, /password/i);
      return true;
    },
  );

  const { document, loadingTask } = await openFixtureWithPdfJs("encrypted-password.pdf", {
    password: "public-test-password",
  });
  try {
    assert.equal(document.numPages, 1);
    const page = await document.getPage(1);
    const textContent = await page.getTextContent();
    const actual = textContent.items
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    assert.equal(
      actual,
      "Local Doc Viewer encrypted PDF fixture. Public synthetic content only. Password is public-test-password.",
    );
    page.cleanup();
  } finally {
    await loadingTask.destroy();
  }
});
