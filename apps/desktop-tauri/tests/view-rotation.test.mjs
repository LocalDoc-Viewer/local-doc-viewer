import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "viewRotation.ts");

async function loadViewRotation() {
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

test("view rotation normalizes to right-angle steps", async () => {
  const { normalizeViewRotation } = await loadViewRotation();

  assert.equal(normalizeViewRotation(0), 0);
  assert.equal(normalizeViewRotation(90), 90);
  assert.equal(normalizeViewRotation(360), 0);
  assert.equal(normalizeViewRotation(-90), 270);
  assert.equal(normalizeViewRotation(450), 90);
});

test("view rotation advances left and right with wraparound", async () => {
  const { nextViewRotation } = await loadViewRotation();

  assert.equal(nextViewRotation(0, 1), 90);
  assert.equal(nextViewRotation(270, 1), 0);
  assert.equal(nextViewRotation(0, -1), 270);
  assert.equal(nextViewRotation(90, -1), 0);
});

test("view rotation swaps display size for quarter turns", async () => {
  const { rotatedViewSize } = await loadViewRotation();

  assert.deepEqual(rotatedViewSize({ width: 612, height: 792 }, 0), { width: 612, height: 792 });
  assert.deepEqual(rotatedViewSize({ width: 612, height: 792 }, 90), { width: 792, height: 612 });
  assert.deepEqual(rotatedViewSize({ width: 612, height: 792 }, 180), { width: 612, height: 792 });
  assert.deepEqual(rotatedViewSize({ width: 612, height: 792 }, 270), { width: 792, height: 612 });
});

test("PDF page view size combines intrinsic page rotation with user view rotation", async () => {
  const { pdfPageViewSize } = await loadViewRotation();

  assert.deepEqual(
    pdfPageViewSize({ width: 612, height: 792 }, 0, 270),
    { width: 792, height: 612 },
  );
  assert.deepEqual(
    pdfPageViewSize({ width: 612, height: 792 }, 90, 270),
    { width: 612, height: 792 },
  );
});
