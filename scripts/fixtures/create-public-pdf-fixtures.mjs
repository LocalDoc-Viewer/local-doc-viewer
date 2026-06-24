import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const outputDir = resolve(repoRoot, "testdata", "public", "pdf");
const generationCommand = "node scripts/fixtures/create-public-pdf-fixtures.mjs";

function escapePdfText(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function createContentStream(lines, startY = 720) {
  const commands = ["BT", "/F1 18 Tf", `72 ${startY} Td`];

  lines.forEach((line, index) => {
    if (index > 0) {
      commands.push("0 -28 Td");
    }
    commands.push(`(${escapePdfText(line)}) Tj`);
  });

  commands.push("ET");
  return `${commands.join("\n")}\n`;
}

function createPdfDocument(pages) {
  const pageObjects = [];
  const contentObjects = [];
  let nextObjectId = 4;

  for (const page of pages) {
    const pageObjectId = nextObjectId;
    const contentObjectId = nextObjectId + 1;
    nextObjectId += 2;

    const content = createContentStream(page.lines, page.startY);
    const mediaBox = page.mediaBox ?? "0 0 612 792";
    const pageBody = [
      "<<",
      "/Type /Page",
      "/Parent 2 0 R",
      `/MediaBox [${mediaBox}]`,
      "/Resources << /Font << /F1 3 0 R >> >>",
      `/Contents ${contentObjectId} 0 R`,
    ];
    if (page.rotate !== undefined) {
      pageBody.push(`/Rotate ${page.rotate}`);
    }
    pageBody.push(">>");
    pageObjects.push({
      id: pageObjectId,
      body: pageBody.join("\n"),
    });
    contentObjects.push({
      id: contentObjectId,
      body: [`<< /Length ${Buffer.byteLength(content, "ascii")} >>`, "stream", content, "endstream"].join("\n"),
    });
  }

  const kids = pageObjects.map((page) => `${page.id} 0 R`).join(" ");
  const objects = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: `<< /Type /Pages /Kids [${kids}] /Count ${pageObjects.length} >>` },
    { id: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    ...pageObjects.flatMap((page, index) => [page, contentObjects[index]]),
  ].sort((left, right) => left.id - right.id);

  let output = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets[object.id] = Buffer.byteLength(output, "ascii");
    output += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f\n";

  for (let id = 1; id <= objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n\n`;
  }

  output += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  return Buffer.from(output, "ascii");
}

function createImagePdfDocument({ includeText = true } = {}) {
  const imageData = "FF000000FF000000FFFFFFFF>";
  const content = [
    ...(includeText
      ? [
          "BT",
          "/F1 18 Tf",
          "72 720 Td",
          "(Local Doc Viewer PDF Fixture) Tj",
          "0 -28 Td",
          "(Public synthetic image fixture) Tj",
          "ET",
        ]
      : []),
    "q",
    "160 0 0 160 72 470 cm",
    "/Im1 Do",
    "Q",
    "",
  ].join("\n");
  const objects = [
    { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" },
    { id: 2, body: "<< /Type /Pages /Kids [5 0 R] /Count 1 >>" },
    { id: 3, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" },
    {
      id: 4,
      body: [
        "<<",
        "/Type /XObject",
        "/Subtype /Image",
        "/Width 2",
        "/Height 2",
        "/ColorSpace /DeviceRGB",
        "/BitsPerComponent 8",
        "/Filter /ASCIIHexDecode",
        `/Length ${Buffer.byteLength(imageData, "ascii")}`,
        ">>",
        "stream",
        imageData,
        "endstream",
      ].join("\n"),
    },
    {
      id: 5,
      body: [
        "<<",
        "/Type /Page",
        "/Parent 2 0 R",
        "/MediaBox [0 0 612 792]",
        "/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 4 0 R >> >>",
        "/Contents 6 0 R",
        ">>",
      ].join("\n"),
    },
    {
      id: 6,
      body: [`<< /Length ${Buffer.byteLength(content, "ascii")} >>`, "stream", content, "endstream"].join("\n"),
    },
  ];

  let output = "%PDF-1.4\n";
  const offsets = [0];

  for (const object of objects) {
    offsets[object.id] = Buffer.byteLength(output, "ascii");
    output += `${object.id} 0 obj\n${object.body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f\n";

  for (let id = 1; id <= objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n\n`;
  }

  output += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  return Buffer.from(output, "ascii");
}

const pdfPasswordPadding = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41,
  0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function md5(...chunks) {
  const hash = createHash("md5");
  for (const chunk of chunks) {
    hash.update(chunk);
  }
  return hash.digest();
}

function rc4(key, input) {
  const state = new Uint8Array(256);
  for (let index = 0; index < state.length; index += 1) {
    state[index] = index;
  }

  let j = 0;
  for (let index = 0; index < state.length; index += 1) {
    j = (j + state[index] + key[index % key.length]) & 0xff;
    [state[index], state[j]] = [state[j], state[index]];
  }

  const output = Buffer.alloc(input.length);
  let i = 0;
  j = 0;
  for (let index = 0; index < input.length; index += 1) {
    i = (i + 1) & 0xff;
    j = (j + state[i]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
    const keyByte = state[(state[i] + state[j]) & 0xff];
    output[index] = input[index] ^ keyByte;
  }

  return output;
}

function padPassword(password) {
  const passwordBytes = Buffer.from(password, "latin1").subarray(0, 32);
  return Buffer.concat([passwordBytes, pdfPasswordPadding]).subarray(0, 32);
}

function littleEndianInt32(value) {
  const output = Buffer.alloc(4);
  output.writeInt32LE(value);
  return output;
}

function objectEncryptionKey(fileKey, objectId, generation = 0) {
  return md5(
    fileKey,
    Buffer.from([
      objectId & 0xff,
      (objectId >> 8) & 0xff,
      (objectId >> 16) & 0xff,
      generation & 0xff,
      (generation >> 8) & 0xff,
    ]),
  ).subarray(0, Math.min(fileKey.length + 5, 16));
}

function createStandardSecurityR2({ userPassword, ownerPassword, permissions, fileId }) {
  const userPad = padPassword(userPassword);
  const ownerPad = padPassword(ownerPassword);
  const ownerKey = md5(ownerPad).subarray(0, 5);
  const ownerEntry = rc4(ownerKey, userPad);
  const fileKey = md5(userPad, ownerEntry, littleEndianInt32(permissions), fileId).subarray(0, 5);
  const userEntry = rc4(fileKey, pdfPasswordPadding);

  return { fileKey, ownerEntry, userEntry };
}

function createEncryptedPdfDocument() {
  const userPassword = "public-test-password";
  const ownerPassword = "public-test-owner-password";
  const permissions = -4;
  const fileId = Buffer.from("00112233445566778899AABBCCDDEEFF", "hex");
  const security = createStandardSecurityR2({
    userPassword,
    ownerPassword,
    permissions,
    fileId,
  });
  const contentObjectId = 5;
  const content = createContentStream(
    [
      "Local Doc Viewer encrypted PDF fixture.",
      "Public synthetic content only.",
      "Password is public-test-password.",
    ],
    720,
  );
  const encryptedContent = rc4(objectEncryptionKey(security.fileKey, contentObjectId), Buffer.from(content, "ascii"));
  const objects = [
    { id: 1, body: Buffer.from("<< /Type /Catalog /Pages 2 0 R >>", "ascii") },
    { id: 2, body: Buffer.from("<< /Type /Pages /Kids [4 0 R] /Count 1 >>", "ascii") },
    { id: 3, body: Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", "ascii") },
    {
      id: 4,
      body: Buffer.from(
        [
          "<<",
          "/Type /Page",
          "/Parent 2 0 R",
          "/MediaBox [0 0 612 792]",
          "/Resources << /Font << /F1 3 0 R >> >>",
          "/Contents 5 0 R",
          ">>",
        ].join("\n"),
        "ascii",
      ),
    },
    {
      id: contentObjectId,
      body: Buffer.concat([
        Buffer.from(`<< /Length ${encryptedContent.length} >>\nstream\n`, "ascii"),
        encryptedContent,
        Buffer.from("\nendstream", "ascii"),
      ]),
    },
    {
      id: 6,
      body: Buffer.from(
        [
          "<<",
          "/Filter /Standard",
          "/V 1",
          "/R 2",
          "/Length 40",
          `/O <${security.ownerEntry.toString("hex").toUpperCase()}>`,
          `/U <${security.userEntry.toString("hex").toUpperCase()}>`,
          `/P ${permissions}`,
          ">>",
        ].join("\n"),
        "ascii",
      ),
    },
  ];

  const chunks = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];
  let byteLength = chunks[0].length;

  function append(chunk) {
    chunks.push(chunk);
    byteLength += chunk.length;
  }

  for (const object of objects) {
    offsets[object.id] = byteLength;
    append(Buffer.from(`${object.id} 0 obj\n`, "ascii"));
    append(object.body);
    append(Buffer.from("\nendobj\n", "ascii"));
  }

  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f\n";
  for (let id = 1; id <= objects.length; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n\n`;
  }
  xref += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R /Encrypt 6 0 R /ID [<${fileId.toString(
      "hex",
    ).toUpperCase()}><${fileId.toString("hex").toUpperCase()}>] >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");
  append(Buffer.from(xref, "ascii"));

  return Buffer.concat(chunks);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function writeFixture(name, bytes) {
  writeFileSync(resolve(outputDir, name), bytes);
  return {
    name,
    sha256: sha256(bytes),
    size: bytes.length,
  };
}

function createManifest(records) {
  const header = [
    "# MVP 1 Public PDF Fixtures",
    "",
    "> Status: CURRENT",
    "> Generated by: `node scripts/fixtures/create-public-pdf-fixtures.mjs`",
    "",
    "These files are generated fixtures for local PDF smoke tests. They contain no real user content and use only the PDF built-in Helvetica base font.",
    "",
    "| file name | generation command | SHA-256 | font source | license source | real user content | extra metadata | expected use |",
    "|---|---|---|---|---|---|---|---|",
  ];

  const rows = records.map((record) => {
    const expectedUses = new Map([
      ["image-page.pdf", "image XObject smoke for PDF open and page inspection"],
      ["image-only-page.pdf", "image-only smoke for PDF open and page inspection"],
      ["large-page.pdf", "large page-size boundary smoke for PDF open and page inspection"],
      ["rotated-page.pdf", "rotated page boundary smoke for PDF open and page inspection"],
      ["corrupt.pdf", "negative smoke for safe PDF error handling"],
      ["encrypted-password.pdf", "protected PDF safe failure regression"],
    ]);
    const metadata = new Map([
      [
        "encrypted-password.pdf",
        "Standard Security Handler revision 2; fixed public test password public-test-password; owner password is also synthetic public test data",
      ],
    ]);
    const licenseSources = new Map([
      [
        "encrypted-password.pdf",
        "Node.js built-in crypto; PDF Standard Security Handler algorithm; PDF base fonts; no embedded font file",
      ],
    ]);
    const expectedUse = expectedUses.get(record.name) ?? "positive smoke for PDF open and page inspection";
    return [
      record.name,
      `\`${generationCommand}\``,
      record.sha256,
      "PDF built-in Helvetica base font",
      licenseSources.get(record.name) ?? "PDF base fonts; no embedded font file",
      "no",
      metadata.get(record.name) ?? "no",
      expectedUse,
    ].join(" | ");
  });

  return `${header.join("\n")}\n| ${rows.join(" |\n| ")} |\n`;
}

mkdirSync(outputDir, { recursive: true });

const simplePdf = createPdfDocument([
  {
    lines: ["Local Doc Viewer PDF Fixture", "Simple one-page smoke document", "Public synthetic content only"],
  },
]);
const multiPagePdf = createPdfDocument([
  { lines: ["Local Doc Viewer PDF Fixture", "Page 1 of 3", "Public synthetic content only"] },
  { lines: ["Local Doc Viewer PDF Fixture", "Page 2 of 3", "Rectangle smoke marker: [====]"] },
  { lines: ["Local Doc Viewer PDF Fixture", "Page 3 of 3", "End of generated fixture"] },
]);
const a4Pdf = createPdfDocument([
  {
    mediaBox: "0 0 595.28 841.89",
    startY: 770,
    lines: ["Local Doc Viewer PDF Fixture", "A4 print smoke document", "Public synthetic content only"],
  },
]);
const imagePagePdf = createImagePdfDocument();
const imageOnlyPagePdf = createImagePdfDocument({ includeText: false });
const largePagePdf = createPdfDocument([
  {
    mediaBox: "0 0 1440 2160",
    startY: 2080,
    lines: ["Local Doc Viewer PDF Fixture", "Large page smoke document", "Public synthetic content only"],
  },
]);
const rotatedPagePdf = createPdfDocument([
  {
    rotate: 90,
    lines: ["Local Doc Viewer PDF Fixture", "Rotated page smoke document", "Public synthetic content only"],
  },
]);
const corruptPdf = simplePdf.subarray(0, Math.floor(simplePdf.length * 0.62));
const encryptedPasswordPdf = createEncryptedPdfDocument();

const records = [
  writeFixture("simple-text.pdf", simplePdf),
  writeFixture("multi-page-text.pdf", multiPagePdf),
  writeFixture("a4-text.pdf", a4Pdf),
  writeFixture("image-page.pdf", imagePagePdf),
  writeFixture("image-only-page.pdf", imageOnlyPagePdf),
  writeFixture("large-page.pdf", largePagePdf),
  writeFixture("rotated-page.pdf", rotatedPagePdf),
  writeFixture("corrupt.pdf", corruptPdf),
  writeFixture("encrypted-password.pdf", encryptedPasswordPdf),
];

writeFileSync(resolve(outputDir, "manifest.txt"), createManifest(records), "utf8");

for (const record of records) {
  console.log(`created testdata/public/pdf/${record.name} ${record.size} bytes sha256=${record.sha256}`);
}
console.log("created testdata/public/pdf/manifest.txt");
