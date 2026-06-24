import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const desktopPackageJson = resolve(repoRoot, "apps", "desktop-tauri", "package.json");
const requireFromDesktop = createRequire(desktopPackageJson);
const fontkit = requireFromDesktop("@pdf-lib/fontkit");
const { PDFDocument, rgb } = requireFromDesktop("pdf-lib");
const outputDir = resolve(repoRoot, "testdata", "public", "pdf");
const outputPath = resolve(outputDir, "embedded-font-text.pdf");
const manifestPath = resolve(outputDir, "manifest.txt");
const fontPath = resolve(repoRoot, "tmp", "pdf-font-subsets", "LDVPublicCJKSubset-Regular.otf");
const generationCommand = "node scripts/fixtures/create-public-pdf-chinese-fixture.mjs";

const lines = [
  "本文件是 local-doc-viewer PDF 中文渲染测试样本。",
  "第二行用于验证中文文本提取、复制和基础换行。",
  "Public synthetic content only.",
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function updateManifest(record) {
  const manifest = readFileSync(manifestPath, "utf8");
  const row = [
    record.name,
    `\`${generationCommand}\``,
    record.sha256,
    "Noto CJK Sans2.004 original OTF subset; embedded renamed subset LDVPublicCJKSubset-Regular.otf",
    "SIL Open Font License 1.1; see testdata/public/licenses/OFL-1.1-Noto-CJK-Sans.txt",
    "no",
    "synthetic fixed PDF metadata only",
    "Chinese text extraction and copy normalization smoke for PDF.js",
  ].join(" | ");
  const formattedRow = `| ${row} |`;
  const escapedName = record.name.replaceAll(".", "\\.");
  const rowPattern = new RegExp(`^\\| ${escapedName} \\|.*$`, "m");
  const nextManifest = rowPattern.test(manifest)
    ? manifest.replace(rowPattern, formattedRow)
    : `${manifest.trimEnd()}\n${formattedRow}\n`;

  writeFileSync(manifestPath, nextManifest, "utf8");
}

async function createChineseFixture() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle("Local Doc Viewer Chinese PDF Fixture");
  pdfDoc.setSubject("Public synthetic fixture for Chinese PDF text extraction");
  pdfDoc.setCreator("local-doc-viewer fixture generator");
  pdfDoc.setProducer("pdf-lib 1.17.1");
  pdfDoc.setCreationDate(new Date("2026-06-13T00:00:00.000Z"));
  pdfDoc.setModificationDate(new Date("2026-06-13T00:00:00.000Z"));

  const font = await pdfDoc.embedFont(readFileSync(fontPath), { subset: false });
  const page = pdfDoc.addPage([612, 792]);
  let y = 720;

  for (const line of lines) {
    page.drawText(line, {
      x: 72,
      y,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 28;
  }

  return pdfDoc.save({ useObjectStreams: false });
}

mkdirSync(outputDir, { recursive: true });

const bytes = await createChineseFixture();
writeFileSync(outputPath, bytes);
const record = {
  name: "embedded-font-text.pdf",
  sha256: sha256(bytes),
  size: bytes.length,
};
updateManifest(record);

console.log(
  `created testdata/public/pdf/embedded-font-text.pdf ${record.size} bytes sha256=${record.sha256}`,
);
console.log("updated testdata/public/pdf/manifest.txt");
