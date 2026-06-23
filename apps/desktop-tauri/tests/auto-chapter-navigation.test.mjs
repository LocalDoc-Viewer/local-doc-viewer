import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const modulePath = resolve(desktopRoot, "src", "autoChapterNavigation.ts");

async function loadAutoChapterNavigation() {
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

test("auto chapter navigation detects Chinese chapter headings across pages", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "序\n这是一段正文。" },
    { pageIndex: 1, text: "第一章 风起青萍\n正文内容。" },
    { pageIndex: 8, text: "第十二回 旧事重来\n正文内容。" },
    { pageIndex: 15, text: "第三节 江湖夜雨\n正文内容。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第一章 风起青萍", pageIndex: 1, level: 1, source: "auto" },
    { title: "第十二回 旧事重来", pageIndex: 8, level: 1, source: "auto" },
    { title: "第三节 江湖夜雨", pageIndex: 15, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation requires enough confident headings", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第一章 偶然出现的字样\n正文。" },
    { pageIndex: 1, text: "普通正文\n没有目录。" },
  ]);

  assert.deepEqual(chapters, []);
});

test("auto chapter navigation deduplicates repeated headings on the same page", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第一章 风起\n第一章 风起\n正文。" },
    { pageIndex: 1, text: "第二章 云涌\n正文。" },
    { pageIndex: 2, text: "第三章 雨落\n正文。" },
  ]);

  assert.deepEqual(
    chapters.map((chapter) => chapter.title),
    ["第一章 风起", "第二章 云涌", "第三章 雨落"],
  );
});

test("auto chapter navigation keeps repeated headings on different pages", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第一章 风起\n正文。" },
    { pageIndex: 1, text: "第二章 云涌\n正文。" },
    { pageIndex: 2, text: "第二章 云涌\n正文里确实存在同名章节。" },
    { pageIndex: 3, text: "第三章 雨落\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第一章 风起", pageIndex: 0, level: 1, source: "auto" },
    { title: "第二章 云涌", pageIndex: 1, level: 1, source: "auto" },
    { title: "第二章 云涌", pageIndex: 2, level: 1, source: "auto" },
    { title: "第三章 雨落", pageIndex: 3, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation accepts PDF-extracted headings split by spaces", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 2, text: "第 一 章 风 起 青 萍\n正文。" },
    { pageIndex: 8, text: "第 十 二 回 旧 事 重 来\n正文。" },
    { pageIndex: 16, text: "第 五 十 章 敦 单 于 折 箭 六 军 辟 易\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第一章 风起青萍", pageIndex: 2, level: 1, source: "auto" },
    { title: "第十二回 旧事重来", pageIndex: 8, level: 1, source: "auto" },
    { title: "第五十章 敦单于折箭六军辟易", pageIndex: 16, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation accepts decorated PDF heading lines", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 2, text: "!!\n------------\n第 一 章 风 起 青 萍\n正文。" },
    { pageIndex: 8, text: "!! ------------ 第 十 二 回 旧 事 重 来\n正文。" },
    { pageIndex: 16, text: "---- 第 五 十 章 敦 单 于 折 箭 六 军 辟 易\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第一章 风起青萍", pageIndex: 2, level: 1, source: "auto" },
    { title: "第十二回 旧事重来", pageIndex: 8, level: 1, source: "auto" },
    { title: "第五十章 敦单于折箭六军辟易", pageIndex: 16, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation extracts decorated headings from long PDF text lines", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 2, text: "!! ------------ 第 一 章 风 起 青 萍 这是一段被 PDF 抽取粘在标题后的正文，长度会超过普通标题。\n正文。" },
    { pageIndex: 8, text: "!! ------------ 第 十 二 回 旧 事 重 来 这是一段被 PDF 抽取粘在标题后的正文，长度会超过普通标题。\n正文。" },
    { pageIndex: 16, text: "!! ------------ 第 三 十 三 章 东 天 草 地 晴 斗 转 星 移 片刻，便又重现。\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第一章", pageIndex: 2, level: 1, source: "auto" },
    { title: "第十二回", pageIndex: 8, level: 1, source: "auto" },
    { title: "第三十三章", pageIndex: 16, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation ignores chapter ending markers", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第一章 青衫磊落险峰行\n正文。" },
    { pageIndex: 20, text: "（第一回完）\n第二章 玉璧月华明\n正文。" },
    { pageIndex: 40, text: "(第二回 完)\n第三章 马疾香幽\n正文。" },
    { pageIndex: 60, text: "第四回 完\n第四章 崖高人远\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第一章 青衫磊落险峰行", pageIndex: 0, level: 1, source: "auto" },
    { title: "第二章 玉璧月华明", pageIndex: 20, level: 1, source: "auto" },
    { title: "第三章 马疾香幽", pageIndex: 40, level: 1, source: "auto" },
    { title: "第四章 崖高人远", pageIndex: 60, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation ignores bare part markers without a title", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第四十二章 老魔小丑岂堪一击\n正文。" },
    { pageIndex: 20, text: "第四十三章 王霸雄血海深仇\n正文。" },
    { pageIndex: 30, text: "第一部\n正文。" },
    { pageIndex: 40, text: "第四十四章 念枉求美眷良缘安在\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第四十二章 老魔小丑岂堪一击", pageIndex: 0, level: 1, source: "auto" },
    { title: "第四十三章 王霸雄血海深仇", pageIndex: 20, level: 1, source: "auto" },
    { title: "第四十四章 念枉求美眷良缘安在", pageIndex: 40, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation ignores prose fragments that look like parts", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第四十二章 老魔小丑岂堪一击\n正文。" },
    { pageIndex: 20, text: "第四十三章 王霸雄血海深仇\n正文。" },
    { pageIndex: 30, text: "慕容博心下骇然，自己初入藏经阁，第一部看到的武功秘籍，确然便是指花指法。\n正文。" },
    { pageIndex: 40, text: "第四十四章 念枉求美眷良缘安在\n正文。" },
  ]);

  assert.deepEqual(chapters, [
    { title: "第四十二章 老魔小丑岂堪一击", pageIndex: 0, level: 1, source: "auto" },
    { title: "第四十三章 王霸雄血海深仇", pageIndex: 20, level: 1, source: "auto" },
    { title: "第四十四章 念枉求美眷良缘安在", pageIndex: 40, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation ignores long paragraph-like lines", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const chapters = detectAutoChapterNavigation([
    { pageIndex: 0, text: "第一章 这是一个特别长的正文句子并不是章节标题只是段落开头所以不应该进入目录\n正文。" },
    { pageIndex: 1, text: "第二章 另一个特别长的正文句子并不是章节标题只是段落开头所以不应该进入目录\n正文。" },
    { pageIndex: 2, text: "第三章 还是一个特别长的正文句子并不是章节标题只是段落开头所以不应该进入目录\n正文。" },
  ]);

  assert.deepEqual(chapters, []);
});

test("auto chapter navigation can extract candidates page by page", async () => {
  const { autoChapterNavigationItemsFromPage } = await loadAutoChapterNavigation();

  assert.deepEqual(autoChapterNavigationItemsFromPage({
    pageIndex: 16,
    text: "---- 第 五 十 章 敦 单 于 折 箭 六 军 辟 易\n正文。",
  }), [
    { title: "第五十章 敦单于折箭六军辟易", pageIndex: 16, level: 1, source: "auto" },
  ]);
});

test("auto chapter navigation caps detected items", async () => {
  const { detectAutoChapterNavigation } = await loadAutoChapterNavigation();
  const pages = Array.from({ length: 320 }, (_, index) => ({
    pageIndex: index,
    text: `第${index + 1}章 标题${index + 1}\n正文。`,
  }));

  const chapters = detectAutoChapterNavigation(pages);

  assert.equal(chapters.length, 300);
  assert.equal(chapters.at(0)?.title, "第1章 标题1");
  assert.equal(chapters.at(-1)?.title, "第300章 标题300");
});
