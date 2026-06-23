# local-doc-viewer

A local-first desktop document viewer for OFD, PDF, Office/WPS files converted locally, text files, and images.

This public repository is a clean source export from a private development repository.
It intentionally does not include private development notes, historical planning documents, real user samples, generated build output, bundled Java runtimes, installer artifacts, or Git history from the private repository.

## License

The project source is released under AGPL-3.0-only. See [LICENSE](LICENSE).
The AGPL-3.0 route is intentional for the first public release because the current OFD renderer dependency boundary includes AGPL-sensitive components.
License text source used by the export script: https://www.gnu.org/licenses/agpl-3.0.txt

## Current Status

- Source code is provided for public review and development.
- Official release artifacts are expected to be attached through GitHub Releases, not committed to this source repository.
- Planned first public artifacts: Windows MSI, Linux amd64 deb, and Linux arm64 deb.
- The Windows MSI is unsigned for the first release and may show unknown publisher or SmartScreen warnings.
- The Linux arm64 deb is experimental until it has been smoke-tested on real ARM hardware.
- The first public release does not include automatic updates; users should check GitHub Releases manually: https://github.com/LocalDoc-Viewer/local-doc-viewer/releases
- OFD rendering depends on a Java renderer resource that is not bundled in this source export.
- Office/WPS preview depends on a user-configured local LibreOffice executable.
- The application is local-first and does not upload user documents by default.
- The UI is currently mainly Chinese; full English UI is planned after the first release.

## Build

Install Node.js, Rust, and the platform dependencies required by Tauri 2.
Then run:

```bash
npm --prefix apps/desktop-tauri install
npm --prefix apps/desktop-tauri run build
npm --prefix apps/desktop-tauri test
cargo test --manifest-path apps/desktop-tauri/src-tauri/Cargo.toml
```

Desktop packaging requires platform-specific Tauri prerequisites and an OFD renderer resource prepared under apps/desktop-tauri/src-tauri/binaries/ofd-renderer/.

## Feedback

Please report reproducible problems through GitHub Issues:

https://github.com/LocalDoc-Viewer/local-doc-viewer/issues

Do not upload private or sensitive documents, real invoices, contracts, official documents, personal files, credentials, certificates, tokens, or local paths that identify your machine.
If a problem only reproduces with a private file, describe the document type and symptoms, or create a synthetic sample that contains no private content.

## Privacy Boundary

Do not commit real user documents, invoices, contracts, official documents, credentials, tokens, certificates, or local private samples.
Public fixtures under testdata/public are synthetic and reviewed for public use.
