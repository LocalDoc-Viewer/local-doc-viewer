import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function readStyles() {
  return readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
}

function cssRuleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*{([^}]*)}`, "s"));
  assert.ok(match, `${selector} rule should be found`);
  return match[1];
}

test("screen PDF and OFD pages can grow beyond the viewport at high zoom", () => {
  const css = readStyles();
  const pageSurface = cssRuleBody(css, ".page-surface");
  const continuousSlot = cssRuleBody(css, ".continuous-page-slot");

  assert.doesNotMatch(pageSurface, /max-width:\s*100%/);
  assert.match(pageSurface, /max-width:\s*none/);
  assert.doesNotMatch(continuousSlot, /max-width:\s*100%/);
  assert.match(continuousSlot, /max-width:\s*none/);
});

test("screen reader viewport keeps oversized zoom content scrollable from its origin", () => {
  const css = readStyles();
  const pageStage = cssRuleBody(css, ".page-stage");
  const continuousPages = cssRuleBody(css, ".continuous-pages");

  assert.match(pageStage, /overflow:\s*auto/);
  assert.match(pageStage, /place-items:\s*safe center/);
  assert.match(continuousPages, /width:\s*max-content/);
  assert.match(continuousPages, /min-width:\s*100%/);
});

test("continuous page slots do not keep a fixed portrait minimum height", () => {
  const css = readStyles();
  const continuousSlot = cssRuleBody(css, ".continuous-page-slot");

  assert.doesNotMatch(continuousSlot, /min-height:\s*594px/);
  assert.match(continuousSlot, /min-height:\s*0/);
});
