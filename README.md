# local-doc-viewer

语言：中文 | [English](README.en.md)

local-doc-viewer 是一个本地优先的桌面文档阅读器，当前面向 OFD、PDF、本地转换后的 Office/WPS 文档、文本文件和图片预览。
它专注只读预览，不做云上传，也不做 Office 原格式编辑。

## 许可证

项目源码以 AGPL-3.0-only 发布，许可证正文见 [LICENSE](LICENSE)。

## 下载

发布包会通过 GitHub Releases 提供：

- [Windows MSI、Linux amd64 deb、Linux arm64 deb 下载页](https://github.com/LocalDoc-Viewer/local-doc-viewer/releases)

如果页面暂时没有安装包，说明首个公开版本还未发布。

## 当前状态

- 当前仓库提供公开源码，方便查看、构建和反馈问题。
- 首版计划提供 Windows MSI、Linux amd64 deb 和 Linux arm64 deb。
- Windows MSI 首版未签名，安装时可能出现 unknown publisher 或 SmartScreen 提示。
- Linux arm64 deb 在真实 ARM 设备完成 GUI / desktop / 打印入口 smoke 前标记为 experimental / 实验性。
- 首版不包含自动更新功能，请手动关注 GitHub Releases：https://github.com/LocalDoc-Viewer/local-doc-viewer/releases
- 从源码构建完整桌面包时，需要额外准备 OFD 渲染组件；普通用户请优先使用 Releases 中的安装包。
- Office/WPS 预览依赖用户自行配置本机 LibreOffice 程序路径。
- 应用本地优先，默认不上传用户文档。
- 当前界面主要是中文，完整英文 UI 后续再做。

## 构建

需要先安装 Node.js、Rust 和 Tauri 2 所需的平台依赖。然后运行：

```bash
npm --prefix apps/desktop-tauri install
npm --prefix apps/desktop-tauri run build
npm --prefix apps/desktop-tauri test
cargo test --manifest-path apps/desktop-tauri/src-tauri/Cargo.toml
```

如需从源码打包完整 OFD 预览能力，还需要把项目的 OFD 渲染组件放到 `apps/desktop-tauri/src-tauri/binaries/ofd-renderer/`。

## 问题反馈

请通过 GitHub Issues 反馈可复现问题：

https://github.com/LocalDoc-Viewer/local-doc-viewer/issues

不要上传真实或敏感文档、真实发票、合同、公文、个人文件、凭据、证书、token，或能识别你电脑的本地路径。
如果问题只在私有文件上复现，请描述文档类型和现象，或者构造不含隐私内容的 synthetic sample。

## 隐私边界

不要提交真实用户文档、真实发票、合同、公文、凭据、token、证书或本地私有样本。
`testdata/public` 下的 fixture 是人工构造并经过公开使用检查的样本。
