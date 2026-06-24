# local-doc-viewer

语言：中文 | [English](README.en.md)

local-doc-viewer 是一个本地优先的桌面文档阅读器，当前面向 OFD、PDF、本地转换后的 Office/WPS 文档、文本文件和图片预览。
它专注只读预览，不做云上传，也不做 Office 原格式编辑。

## 许可证

项目源码以 AGPL-3.0-only 发布，许可证正文见 [LICENSE](LICENSE)。

## 下载

发布包以 GitHub Releases 为主，Gitee 发行版作为镜像入口：

- GitHub Releases：[Windows MSI、Linux amd64 deb、Linux arm64 deb 下载页](https://github.com/LocalDoc-Viewer/local-doc-viewer/releases)
- Gitee 发行版：[Windows MSI、Linux amd64 deb、Linux arm64 deb 下载页](https://gitee.com/rita-33a/local-doc-viewer/releases)

如果镜像页暂时没有最新安装包，请以 GitHub Releases 为准。

## 当前状态

- 当前仓库提供公开源码，方便查看、构建和反馈问题。
- 首版计划提供 Windows MSI、Linux amd64 deb 和 Linux arm64 deb。
- Windows MSI 首版未签名，安装时可能出现 unknown publisher 或 SmartScreen 提示。
- Linux arm64 deb 为 experimental / 实验性包，当前面向 Ubuntu 24.04 / WebKitGTK 4.1 环境；其他发行版兼容性取决于系统依赖。
- 首版不包含自动更新功能，请手动关注 GitHub Releases；如 GitHub 主库因网络或环境原因一时无法访问、下载较慢，可查看 Gitee 镜像备库：https://github.com/LocalDoc-Viewer/local-doc-viewer/releases ｜ https://gitee.com/rita-33a/local-doc-viewer/releases
- 应用本地优先，默认不上传用户文档。
- 当前界面主要是中文，完整英文 UI 后续再做。

## Office/WPS 本地预览

部分 Office/WPS 文档预览需要本机安装 LibreOffice，并在应用设置中填写 LibreOffice 程序路径。
LibreOffice 官方下载页：https://www.libreoffice.org/download/

推荐配置：

- Windows：使用官方安装器默认位置，程序路径填写 `C:\Program Files\LibreOffice\program\soffice.exe`
- Linux：推荐使用发行版包管理器安装 LibreOffice，程序路径通常填写 `/usr/bin/libreoffice`；如不可用，可用 `which libreoffice` 或 `which soffice` 查询实际路径。

Office/WPS 转换在用户本机执行，不上传文档。

## 构建

需要先安装 Node.js、Rust 和 Tauri 2 所需的平台依赖。然后运行：

```bash
npm --prefix apps/desktop-tauri install
npm --prefix apps/desktop-tauri run build
npm --prefix apps/desktop-tauri test
cargo test --manifest-path apps/desktop-tauri/src-tauri/Cargo.toml
```

桌面打包还需要对应平台的 Tauri 前置依赖；正式发布包以 GitHub Releases 为准。

## 问题反馈

请通过 GitHub Issues 反馈可复现问题：

https://github.com/LocalDoc-Viewer/local-doc-viewer/issues

不要上传真实或敏感文档、真实发票、合同、公文、个人文件、凭据、证书、token，或能识别你电脑的本地路径。
如果问题只在私有文件上复现，请描述文档类型和现象，或者构造不含隐私内容的 synthetic sample。

## 隐私边界

不要提交真实用户文档、真实发票、合同、公文、凭据、token、证书或本地私有样本。
`testdata/public` 下的 fixture 是人工构造并经过公开使用检查的样本。
