import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");

function readIndexHtml() {
  return readFileSync(resolve(desktopRoot, "index.html"), "utf8");
}

function readMainTs() {
  return readFileSync(resolve(desktopRoot, "src", "main.ts"), "utf8");
}

function readStylesCss() {
  return readFileSync(resolve(desktopRoot, "src", "styles.css"), "utf8");
}

function countId(html, id) {
  return html.match(new RegExp(`id="${id}"`, "g"))?.length ?? 0;
}

test("document center exposes icon-only settings and local help entries", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const sidebarTitleMatch = html.match(/<div class="document-center-title">[\s\S]*?<\/div>\s*<section id="document-open-section"/);
  const railMatch = html.match(/<nav id="document-center-rail"[\s\S]*?<\/nav>/);

  assert.ok(sidebarTitleMatch, "expanded document center title actions should exist");
  assert.ok(railMatch, "collapsed document center rail should exist");
  assert.match(html, /id="open-settings-panel"/);
  assert.match(html, /id="open-help-panel"/);
  assert.match(html, /id="rail-open-settings-panel"/);
  assert.match(html, /id="rail-open-help-panel"/);
  assert.match(html, /aria-controls="settings-panel"/);
  assert.match(html, /aria-controls="help-panel"/);
  assert.match(sidebarTitleMatch[0], /id="focus-reading-mode"[\s\S]*id="open-settings-panel"[\s\S]*id="open-help-panel"[\s\S]*id="collapse-document-center"/);
  assert.match(railMatch[0], /id="expand-document-center"[\s\S]*id="rail-open-local-document"[\s\S]*id="rail-focus-reading-mode"[\s\S]*id="rail-open-settings-panel"[\s\S]*id="rail-open-help-panel"/);
  assert.match(sidebarTitleMatch[0], /id="open-settings-panel"[^>]*class="icon-button document-center-settings"[\s\S]*data-icon="settings"/);
  assert.match(sidebarTitleMatch[0], /id="open-help-panel"[^>]*class="icon-button document-center-help"[\s\S]*data-icon="circle-help"/);
  assert.doesNotMatch(sidebarTitleMatch[0], />设置<|>帮助</);
  assert.doesNotMatch(html, /class="document-center-support-tools"/);

  assert.match(source, /const openSettingsPanelButton = document\.querySelector<HTMLButtonElement>\("#open-settings-panel"\)/);
  assert.match(source, /const railOpenSettingsPanelButton = document\.querySelector<HTMLButtonElement>\("#rail-open-settings-panel"\)/);
  assert.match(source, /const openHelpPanelButton = document\.querySelector<HTMLButtonElement>\("#open-help-panel"\)/);
  assert.match(source, /const railOpenHelpPanelButton = document\.querySelector<HTMLButtonElement>\("#rail-open-help-panel"\)/);
  assert.match(source, /const settingsPanelButtons = \[openSettingsPanelButton, railOpenSettingsPanelButton\]\.filter/);
  assert.match(source, /const helpPanelButtons = \[openHelpPanelButton, railOpenHelpPanelButton\]\.filter/);
  assert.match(source, /for \(const button of settingsPanelButtons\)/);
  assert.match(source, /for \(const button of helpPanelButtons\)/);
});

test("settings panel collects local controls and current boundaries", () => {
  const html = readIndexHtml();
  const source = readMainTs();
  const css = readStylesCss();

  assert.match(html, /id="settings-panel"[\s\S]*hidden/);
  assert.match(html, /id="close-settings-panel"/);
  assert.match(html, /id="settings-appearance-section"[\s\S]*外观[\s\S]*name="appearance-theme"[^>]*value="system"[^>]*checked/);
  assert.match(html, /name="appearance-theme"[^>]*value="light"/);
  assert.match(html, /name="appearance-theme"[^>]*value="dark-comfort"[\s\S]*暗黑护眼/);
  assert.match(html, /id="appearance-theme-description"/);
  assert.match(html, /id="settings-language-section"[\s\S]*语言[\s\S]*name="app-language"[^>]*value="zh-CN"[^>]*checked/);
  assert.match(html, /name="app-language"[^>]*value="en-US"/);
  assert.match(html, /id="app-language-description"/);
  assert.match(html, /id="settings-recent-section"[\s\S]*id="recent-files-enabled"[\s\S]*id="clear-recent-files"/);
  assert.match(html, /id="settings-cache-section"[\s\S]*id="clear-render-cache"/);
  assert.match(html, /id="settings-ofd-section"[\s\S]*<legend>OFD 性能设置<\/legend>/);
  assert.match(html, /name="ofd-page-limit-preset"[^>]*value="stable"[^>]*checked/);
  assert.match(html, /name="ofd-page-limit-preset"[^>]*value="extended"/);
  assert.match(html, /name="ofd-page-limit-preset"[^>]*value="long_experimental"/);
  assert.match(html, /id="ofd-page-limit-description"/);
  assert.match(html, /id="settings-office-section"[\s\S]*LibreOffice[\s\S]*不会自动探测/);
  assert.doesNotMatch(html, /id="office-converter-exe"[\s\S]*placeholder="C:\\Program Files\\LibreOffice\\program\\soffice\.exe"/);
  assert.match(html, /id="office-converter-exe"[\s\S]*placeholder="LibreOffice \/ soffice 程序路径"/);
  assert.match(html, /id="test-office-converter-exe"[\s\S]*测试/);
  assert.match(html, /id="office-converter-test-status"/);
  assert.match(html, /id="office-converter-exe-help"[\s\S]*Windows[\s\S]*Linux[\s\S]*本地转换[\s\S]*不会上传/);
  assert.match(html, /id="settings-privacy-section"[\s\S]*不上传文件[\s\S]*不默认联网[\s\S]*不采集文档内容/);

  assert.match(source, /const settingsPanel = document\.querySelector<HTMLElement>\("#settings-panel"\)/);
  assert.match(source, /function toggleSettingsPanel\(\)/);
  assert.match(source, /const appLanguageStorageKey = "local-doc-viewer\.app-language"/);
  assert.match(source, /function loadAppLanguagePreference\(\)/);
  assert.match(source, /function setAppLanguagePreference\(preference: AppLanguagePreference\)/);
  assert.match(source, /const appLanguageOptions = Array\.from\(document\.querySelectorAll<HTMLInputElement>\("input\[name='app-language'\]"\)\)/);
  assert.match(source, /document\.documentElement\.lang = preference/);
  assert.match(source, /const officeConverterExeInput = document\.querySelector<HTMLInputElement>\("#office-converter-exe"\)/);
  assert.match(source, /const officeConverterExeStorageKey = "local-doc-viewer\.office-converter-exe"/);
  assert.match(source, /function desktopPlatformHint\(/);
  assert.match(source, /function officeConverterPathHint\(/);
  assert.match(source, /function syncOfficeConverterPathHint\(\)/);
  assert.match(source, /officeConverterExeInput\.placeholder = hint\.placeholder/);
  assert.match(source, /officeConverterExeInput\.closest\("label"\)\?\.setAttribute\("title", hint\.title\)/);
  assert.match(source, /const testOfficeConverterExeButton = document\.querySelector<HTMLButtonElement>\("#test-office-converter-exe"\)/);
  assert.match(source, /const officeConverterTestStatus = document\.querySelector<HTMLElement>\("#office-converter-test-status"\)/);
  assert.match(source, /function loadOfficeConverterExePreference\(\)/);
  assert.match(source, /function saveOfficeConverterExePreference\(\)/);
  assert.match(source, /async function testOfficeConverterExePreference\(\)/);
  assert.match(source, /invoke<OfficeConverterTestResult>\("test_office_converter_executable"/);
  assert.match(source, /converterExecutablePath: officeConverterExePreference\(\)/);
  assert.match(source, /const appearanceThemeOptions = Array\.from\(document\.querySelectorAll<HTMLInputElement>\("input\[name='appearance-theme'\]"\)\)/);
  assert.match(source, /setAppearanceThemePreference\(option\.value as AppearanceThemePreference\)/);
  assert.match(source, /window\.matchMedia\("\(prefers-color-scheme: dark\)"\)/);
  assert.match(source, /function openSettingsPanel\(\)/);
  assert.match(source, /function closeSettingsPanel\(\)/);
  assert.match(source, /closeSettingsPanelButton\?\.addEventListener\("click", closeSettingsPanel\)/);

  assert.match(css, /\.settings-help-panel\s*{/);
  assert.match(css, /\.settings-help-backdrop\s*{/);
  assert.match(css, /\.settings-help-section\s*{/);
  assert.match(css, /\.settings-text-input\s*{/);
  assert.match(css, /\.settings-inline-action-row\s*{/);
  assert.match(css, /\.converter-test-status\.is-ok/);
  assert.match(css, /\.converter-test-status\.is-error/);
  assert.match(css, /:root\[data-theme="dark-comfort"\]\s*{/);
  assert.match(css, /color-scheme:\s*dark;/);
  assert.match(css, /@media print[\s\S]*:root\[data-theme="dark-comfort"\]/);
});

test("settings panel owns migrated local control ids exactly once", () => {
  const html = readIndexHtml();

  for (const id of [
    "recent-files-enabled",
    "clear-recent-files",
    "clear-render-cache",
    "office-converter-exe",
    "test-office-converter-exe",
    "office-converter-test-status",
    "office-converter-exe-help",
    "ofd-page-limit-description",
    "appearance-theme-description",
    "app-language-description",
  ]) {
    assert.equal(countId(html, id), 1, `${id} should be unique after moving into settings`);
  }
});

test("OFD page limit settings move out of reader more menu into settings", () => {
  const html = readIndexHtml();
  const readerMenuMatch = html.match(/<div id="reader-tools-menu"[\s\S]*?<\/div>/);
  const settingsMatch = html.match(/<section id="settings-ofd-section"[\s\S]*?<\/section>/);

  assert.ok(readerMenuMatch, "reader tools menu should exist");
  assert.ok(settingsMatch, "settings OFD section should exist");
  assert.doesNotMatch(readerMenuMatch[0], /OFD 性能设置|ofd-page-limit-description/);
  assert.match(settingsMatch[0], /OFD 性能设置/);
  assert.match(settingsMatch[0], /ofd-page-limit-description/);
});

test("help panel is offline and documents current public release boundaries", () => {
  const html = readIndexHtml();
  const source = readMainTs();

  assert.match(html, /id="help-panel"[\s\S]*hidden/);
  assert.match(html, /id="close-help-panel"/);
  assert.match(html, /id="help-supported-formats"[\s\S]*OFD[\s\S]*PDF[\s\S]*Office\/WPS[\s\S]*txt[\s\S]*图片/);
  assert.match(html, /id="help-office-boundary"[\s\S]*本地 LibreOffice[\s\S]*开源办公套件[\s\S]*不会联网或上传[\s\S]*不做原格式编辑/);
  assert.match(html, /id="help-print-boundary"[\s\S]*WebView2 原生[\s\S]*基础打印入口/);
  assert.match(html, /id="help-ofd-boundary"[\s\S]*稳定模式[\s\S]*长文档实验模式/);
  assert.match(html, /id="help-appearance-boundary"[\s\S]*暗黑护眼[\s\S]*不反色 PDF \/ OFD \/ 图片/);
  assert.match(html, /id="help-privacy-boundary"[\s\S]*最近文件[\s\S]*缓存[\s\S]*诊断/);
  assert.match(html, /id="help-feedback-boundary"[\s\S]*GitHub Issues[\s\S]*不要上传真实或敏感文档/);
  assert.match(html, /id="open-feedback-issues"[^>]*title="[^"]*联网[^"]*"[\s\S]*问题反馈/);
  assert.match(html, /id="feedback-issues-status"/);
  assert.match(html, /id="help-update-boundary"[\s\S]*id="check-updates-action"[^>]*title="[^"]*联网[^"]*"[\s\S]*检查更新/);
  assert.match(html, /id="help-update-boundary"[\s\S]*暂未接入自动更新[\s\S]*GitHub Releases[\s\S]*手动获取新版/);
  assert.match(html, /id="help-update-boundary"[\s\S]*https:\/\/github\.com\/LocalDoc-Viewer\/local-doc-viewer\/releases/);
  assert.match(html, /id="update-check-status"/);
  assert.match(html, /id="about-app-section"[\s\S]*local-doc-viewer[\s\S]*本地优先/);
  assert.doesNotMatch(html, /private MVP|当前 private|local-doc-viewer private/);
  assert.doesNotMatch(source, /private MVP|当前 private|local-doc-viewer private/);
  assert.doesNotMatch(html, /自动上传|在线转换|云同步|自动创建 issue|自动提交 issue/i);

  assert.match(source, /const helpPanel = document\.querySelector<HTMLElement>\("#help-panel"\)/);
  assert.match(source, /function toggleHelpPanel\(\)/);
  assert.match(source, /function openHelpPanel\(\)/);
  assert.match(source, /function closeHelpPanel\(\)/);
  assert.match(source, /const feedbackIssuesUrl = "https:\/\/github\.com\/LocalDoc-Viewer\/local-doc-viewer\/issues"/);
  assert.match(source, /const openFeedbackIssuesButton = document\.querySelector<HTMLButtonElement>\("#open-feedback-issues"\)/);
  assert.match(source, /const feedbackIssuesStatus = document\.querySelector<HTMLElement>\("#feedback-issues-status"\)/);
  assert.match(source, /async function openFeedbackIssues\(\)/);
  assert.match(source, /const checkUpdatesActionButton = document\.querySelector<HTMLButtonElement>\("#check-updates-action"\)/);
  assert.match(source, /const updateCheckStatus = document\.querySelector<HTMLElement>\("#update-check-status"\)/);
  assert.match(source, /function showUpdateCheckUnavailable\(\)/);
  assert.match(source, /当前版本暂未接入自动检查更新，请关注 GitHub Releases 获取更新动态。/);
  assert.match(source, /closeHelpPanelButton\?\.addEventListener\("click", closeHelpPanel\)/);
});
