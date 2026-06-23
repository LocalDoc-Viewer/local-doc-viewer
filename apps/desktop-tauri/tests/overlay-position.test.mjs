import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "overlayPosition.ts");

async function loadOverlayPosition() {
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

const stageRect = {
  left: 100,
  top: 50,
  right: 900,
  bottom: 650,
  width: 800,
  height: 600,
};

test("overlay default positions match the current reader surface placement", async () => {
  const { centeredTopOverlayPosition, centeredBottomOverlayPosition } = await loadOverlayPosition();

  assert.deepEqual(
    centeredTopOverlayPosition(stageRect, { width: 200, height: 40 }, 26),
    { left: 400, top: 76 },
  );
  assert.deepEqual(
    centeredBottomOverlayPosition(stageRect, { width: 300, height: 120 }, 24),
    { left: 350, top: 506 },
  );
});

test("overlay positions are clamped inside the reader content area", async () => {
  const { clampOverlayPosition } = await loadOverlayPosition();

  assert.deepEqual(
    clampOverlayPosition({ left: 0, top: 0 }, stageRect, { width: 200, height: 50 }, { margin: 8 }),
    { left: 108, top: 58 },
  );
  assert.deepEqual(
    clampOverlayPosition({ left: 1000, top: 900 }, stageRect, { width: 200, height: 50 }, { margin: 8 }),
    { left: 692, top: 592 },
  );
});

test("diagnostic overlay width is constrained before horizontal clamping", async () => {
  const { clampOverlayPosition, overlayMaxWidth } = await loadOverlayPosition();

  assert.equal(overlayMaxWidth(stageRect, { margin: 8, minWidth: 160 }), 784);
  assert.deepEqual(
    clampOverlayPosition({ left: 700, top: 120 }, stageRect, { width: 900, height: 80 }, {
      margin: 8,
      maxElementWidth: 784,
    }),
    { left: 108, top: 120 },
  );

  const narrowStage = { left: 100, top: 50, right: 220, bottom: 450, width: 120, height: 400 };
  assert.equal(overlayMaxWidth(narrowStage, { margin: 8, minWidth: 160 }), 160);
  assert.deepEqual(
    clampOverlayPosition({ left: 180, top: 440 }, narrowStage, { width: 220, height: 60 }, {
      margin: 8,
      maxElementWidth: 160,
    }),
    { left: 108, top: 382 },
  );
});
