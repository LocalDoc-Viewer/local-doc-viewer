# local-doc-viewer

Language: [中文](README.md) | English

A local-first desktop document viewer for OFD, PDF, locally converted Office/WPS previews, text files, and images.
It focuses on read-only preview, with no cloud upload and no Office-format editing.

## License

The project source is released under AGPL-3.0-only. See [LICENSE](LICENSE).

## Downloads

Release packages are primarily provided through GitHub Releases, with Gitee as a mirror:

- GitHub Releases: [Windows MSI, Linux amd64 deb, and Linux arm64 deb downloads](https://github.com/LocalDoc-Viewer/local-doc-viewer/releases)
- Gitee Releases: [Windows MSI, Linux amd64 deb, and Linux arm64 deb downloads](https://gitee.com/rita-33a/local-doc-viewer/releases)

If the mirror page does not have the latest installer assets yet, use GitHub Releases as the source of truth.

## Current Status

- Source code is provided for public review and development.
- Planned first public artifacts: Windows MSI, Linux amd64 deb, and Linux arm64 deb.
- The Windows MSI is unsigned for the first release and may show unknown publisher or SmartScreen warnings.
- The Linux arm64 deb is experimental and currently targets Ubuntu 24.04 / WebKitGTK 4.1 environments; compatibility with other distributions depends on available system dependencies.
- The first public release does not include automatic updates; users should check GitHub Releases manually. If the GitHub repository is temporarily unavailable or slow in your network environment, the Gitee mirror may also be used: https://github.com/LocalDoc-Viewer/local-doc-viewer/releases | https://gitee.com/rita-33a/local-doc-viewer/releases
- The application is local-first and does not upload user documents by default.
- The UI is currently mainly Chinese; full English UI is planned after the first release.

## Local Office/WPS Preview

Some Office/WPS previews require LibreOffice to be installed locally and configured in the app settings.
LibreOffice official download page: https://www.libreoffice.org/download/

Recommended configuration:

- Windows: use the default location from the official installer, then set the executable path to `C:\Program Files\LibreOffice\program\soffice.exe`.
- Linux: install LibreOffice through your distribution package manager, then usually set the executable path to `/usr/bin/libreoffice`; if that path is unavailable, use `which libreoffice` or `which soffice` to find the actual path.

Office/WPS conversion runs locally on the user's machine and does not upload documents.

## Build

Install Node.js, Rust, and the platform dependencies required by Tauri 2.
Then run:

```bash
npm --prefix apps/desktop-tauri install
npm --prefix apps/desktop-tauri run build
npm --prefix apps/desktop-tauri test
cargo test --manifest-path apps/desktop-tauri/src-tauri/Cargo.toml
```

Desktop packaging also requires the platform-specific Tauri prerequisites. Official release packages are provided through GitHub Releases.

## Feedback

Please report reproducible problems through GitHub Issues:

https://github.com/LocalDoc-Viewer/local-doc-viewer/issues

Do not upload private or sensitive documents, real invoices, contracts, official documents, personal files, credentials, certificates, tokens, or local paths that identify your machine.
If a problem only reproduces with a private file, describe the document type and symptoms, or create a synthetic sample that contains no private content.

## Privacy Boundary

Do not commit real user documents, invoices, contracts, official documents, credentials, tokens, certificates, or local private samples.
Public fixtures under testdata/public are synthetic and reviewed for public use.
