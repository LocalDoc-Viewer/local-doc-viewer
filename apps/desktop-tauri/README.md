# local-doc-viewer desktop shell

> 状态：MVP 0 最小桌面壳原型

This app is the first Tauri shell for local-doc-viewer.

## Scope

- Uses fake document data only.
- Does not open real files.
- Does not call Java, Maven, `ofdrw`, or the OFD renderer sidecar.
- UI talks to Rust commands through renderer-neutral model names.

## Commands

Install dependencies after user confirmation:

```powershell
npm install
```

Run development shell after dependencies are installed:

```powershell
npm run tauri dev
```

Build/check alternatives:

```powershell
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
