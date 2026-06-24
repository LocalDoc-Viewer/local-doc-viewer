import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(testDir, "..");
const tauriRoot = resolve(desktopRoot, "src-tauri");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(path) {
  return readFileSync(path, "utf8");
}

function readCargoPackageName(cargoToml) {
  const packageSection = cargoToml.match(/^\[package\]\s*([\s\S]*?)(?:^\[|\z)/m);
  assert.ok(packageSection, "Cargo.toml must contain a [package] section");

  const name = packageSection[1].match(/^name\s*=\s*"([^"]+)"/m);
  assert.ok(name, "Cargo.toml [package] must contain a name");

  return name[1];
}

function readCargoPackageVersion(cargoToml) {
  const packageSection = cargoToml.match(/^\[package\]\s*([\s\S]*?)(?:^\[|\z)/m);
  assert.ok(packageSection, "Cargo.toml must contain a [package] section");

  const version = packageSection[1].match(/^version\s*=\s*"([^"]+)"/m);
  assert.ok(version, "Cargo.toml [package] must contain a version");

  return version[1];
}

test("Tauri packaged app identity uses product binary name", () => {
  const tauriConfig = readJson(resolve(tauriRoot, "tauri.conf.json"));
  const cargoToml = readFileSync(resolve(tauriRoot, "Cargo.toml"), "utf8");
  const cargoPackageName = readCargoPackageName(cargoToml);

  assert.equal(tauriConfig.productName, "local-doc-viewer");
  assert.equal(tauriConfig.mainBinaryName, tauriConfig.productName);
  assert.equal(tauriConfig.bundle.category, "Utility");
  assert.deepEqual(tauriConfig.bundle.fileAssociations, [
    {
      ext: ["ofd"],
      mimeType: "application/x-ofd",
      role: "Viewer",
    },
    {
      ext: ["pdf"],
      mimeType: "application/pdf",
      role: "Viewer",
    },
  ]);
  assert.notEqual(
    cargoPackageName,
    tauriConfig.productName,
    "This check should prove mainBinaryName intentionally overrides the scaffold cargo binary name",
  );
});

test("frontend, Tauri config, and Cargo package versions stay aligned", () => {
  const packageJson = readJson(resolve(desktopRoot, "package.json"));
  const tauriConfig = readJson(resolve(tauriRoot, "tauri.conf.json"));
  const cargoToml = readFileSync(resolve(tauriRoot, "Cargo.toml"), "utf8");

  assert.equal(tauriConfig.version, packageJson.version);
  assert.equal(readCargoPackageVersion(cargoToml), packageJson.version);
});

test("Linux deb registers OFD in the shared MIME database", () => {
  const linuxConfig = readJson(resolve(tauriRoot, "tauri.linux.conf.json"));
  const debConfig = linuxConfig.bundle.linux.deb;

  assert.equal(
    debConfig.files["/usr/share/mime/packages/local-doc-viewer-ofd.xml"],
    "linux/mime/local-doc-viewer-ofd.xml",
  );
  assert.equal(debConfig.postInstallScript, "linux/deb/postinst");
  assert.equal(debConfig.postRemoveScript, "linux/deb/postrm");

  const mimeXml = readText(resolve(tauriRoot, "linux/mime/local-doc-viewer-ofd.xml"));
  assert.match(mimeXml, /<mime-type type="application\/x-ofd">/);
  assert.match(mimeXml, /<glob pattern="\*\.ofd"\/>/);
  assert.match(mimeXml, /<glob pattern="\*\.OFD"\/>/);

  for (const scriptName of ["postinst", "postrm"]) {
    const script = readText(resolve(tauriRoot, "linux/deb", scriptName));
    assert.match(script, /^#!\/bin\/sh/);
    assert.match(script, /update-mime-database \/usr\/share\/mime/);
  }
});

test("Linux deb recommends CJK fonts for Chinese UI fallback", () => {
  const linuxConfig = readJson(resolve(tauriRoot, "tauri.linux.conf.json"));
  const debConfig = linuxConfig.bundle.linux.deb;

  assert.deepEqual(debConfig.recommends, ["fonts-noto-cjk"]);
});

test("Linux deb desktop entry forwards one document path to the app", () => {
  const linuxConfig = readJson(resolve(tauriRoot, "tauri.linux.conf.json"));
  const debConfig = linuxConfig.bundle.linux.deb;

  assert.equal(debConfig.desktopTemplate, "linux/desktop/local-doc-viewer.desktop");

  const desktopTemplate = readText(resolve(tauriRoot, "linux/desktop/local-doc-viewer.desktop"));
  assert.match(desktopTemplate, /^Exec=\{\{exec\}\} %f$/m);
  assert.match(desktopTemplate, /^MimeType=application\/x-ofd;application\/pdf;$/m);
});

test("packaged renderer resources are bundled as a directory on Windows and Linux", () => {
  const windowsConfig = readJson(resolve(tauriRoot, "tauri.windows.conf.json"));
  const linuxConfig = readJson(resolve(tauriRoot, "tauri.linux.conf.json"));

  for (const config of [windowsConfig, linuxConfig]) {
    assert.deepEqual(config.bundle.resources, {
      "binaries/ofd-renderer/": "ofd-renderer/",
    });
  }
});
