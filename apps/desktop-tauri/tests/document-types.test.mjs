import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "documentTypes.ts");

async function loadDocumentTypes() {
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

test("document type helpers keep the current supported format matrix", async () => {
  const { isOfficeFileType, isTextFileType, isImageFileType } = await loadDocumentTypes();

  for (const fileType of ["docx", "xlsx", "pptx", "doc", "xls", "ppt", "wps", "et", "dps"]) {
    assert.equal(isOfficeFileType(fileType), true, `${fileType} should be treated as office`);
    assert.equal(isOfficeFileType(fileType.toUpperCase()), true, `${fileType} should be case-insensitive`);
  }
  for (const fileType of ["txt", "log", "csv", "md"]) {
    assert.equal(isTextFileType(fileType), true, `${fileType} should be treated as text`);
    assert.equal(isTextFileType(fileType.toUpperCase()), true, `${fileType} should be case-insensitive`);
  }
  for (const fileType of ["png", "jpg", "jpeg", "webp"]) {
    assert.equal(isImageFileType(fileType), true, `${fileType} should be treated as image`);
    assert.equal(isImageFileType(fileType.toUpperCase()), true, `${fileType} should be case-insensitive`);
  }
  for (const fileType of ["pdf", "ofd", "rtf", "tiff"]) {
    assert.equal(isOfficeFileType(fileType), false, `${fileType} should not be treated as office`);
    assert.equal(isTextFileType(fileType), false, `${fileType} should not be treated as text`);
    assert.equal(isImageFileType(fileType), false, `${fileType} should not be treated as image`);
  }
});

test("document path helpers match supported extensions case-insensitively", async () => {
  const {
    isOfficePath,
    isTextPath,
    isImagePath,
    isPdfPath,
    isOfdPath,
    officeFileTypeFromPath,
    textFileTypeFromPath,
    imageFileTypeFromPath,
  } = await loadDocumentTypes();

  assert.equal(isOfficePath("C:\\Docs\\report.DOCX"), true);
  assert.equal(isOfficePath("/tmp/slide.dps"), true);
  assert.equal(officeFileTypeFromPath("C:\\Docs\\report.DOCX"), "docx");
  assert.equal(officeFileTypeFromPath("/tmp/slide.dps"), "dps");
  assert.equal(isTextPath("/tmp/notes.MD"), true);
  assert.equal(textFileTypeFromPath("/tmp/notes.MD"), "md");
  assert.equal(isImagePath("/tmp/photo.WebP"), true);
  assert.equal(imageFileTypeFromPath("/tmp/photo.WebP"), "webp");
  assert.equal(isPdfPath("/tmp/file.PDF"), true);
  assert.equal(isOfdPath("/tmp/file.OFD"), true);

  assert.equal(isOfficePath("/tmp/file.pdf"), false);
  assert.equal(isTextPath("/tmp/file.pdf"), false);
  assert.equal(isImagePath("/tmp/file.pdf"), false);
  assert.equal(isPdfPath("/tmp/file.pdf.bak"), false);
  assert.equal(isOfdPath("/tmp/file.ofd.bak"), false);
  assert.equal(officeFileTypeFromPath("/tmp/file.pdf"), null);
  assert.equal(officeFileTypeFromPath("/tmp/file.docx.bak"), null);
  assert.equal(textFileTypeFromPath("/tmp/file.pdf"), null);
  assert.equal(imageFileTypeFromPath("/tmp/file.png.bak"), null);
});

test("local document route keeps the current open priority and OFD fallback", async () => {
  const { localDocumentRoute } = await loadDocumentTypes();

  assert.equal(localDocumentRoute("C:/docs/a.PDF"), "pdf");
  assert.equal(localDocumentRoute("C:/docs/a.docx"), "office");
  assert.equal(localDocumentRoute("C:/docs/a.md"), "text");
  assert.equal(localDocumentRoute("C:/docs/a.webp"), "image");
  assert.equal(localDocumentRoute("C:/docs/a.ofd"), "ofd");
  assert.equal(localDocumentRoute("C:/docs/a.unknown"), "ofd");
});

test("recent document route keeps current recent-file type priority and OFD fallback", async () => {
  const { recentDocumentRoute } = await loadDocumentTypes();

  assert.equal(recentDocumentRoute("pdf"), "pdf");
  assert.equal(recentDocumentRoute("PDF"), "pdf");
  assert.equal(recentDocumentRoute(" pdf "), "pdf");
  assert.equal(recentDocumentRoute("docx"), "office");
  assert.equal(recentDocumentRoute("DPS"), "office");
  assert.equal(recentDocumentRoute(" dps "), "office");
  assert.equal(recentDocumentRoute("md"), "text");
  assert.equal(recentDocumentRoute(" md "), "text");
  assert.equal(recentDocumentRoute("WEBP"), "image");
  assert.equal(recentDocumentRoute(" webp "), "image");
  assert.equal(recentDocumentRoute("ofd"), "ofd");
  assert.equal(recentDocumentRoute(""), "ofd");
  assert.equal(recentDocumentRoute("   "), "ofd");
  assert.equal(recentDocumentRoute("unknown"), "ofd");
});
