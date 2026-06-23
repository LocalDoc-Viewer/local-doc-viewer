# local-doc-viewer

语言：中文 | [English](README.en.md)

local-doc-viewer 是一个本地优先的桌面文档阅读器，当前面向 OFD、PDF、本地转换后的 Office/WPS 文档、文本文件和图片预览。

这个公开仓库是从私有开发仓库导出的干净源码版本。它不包含私有开发记录、历史计划文档、真实用户样本、生成产物、打包用 Java runtime、安装包产物，也不继承私有仓库 Git 历史。

## 许可证

项目源码以 AGPL-3.0-only 发布，许可证正文见 [LICENSE](LICENSE)。
首版选择 AGPL-3.0 是有意为之：当前 OFD renderer 依赖边界包含 AGPL 敏感组件，这样发布最简单、最诚实。
导出脚本使用的许可证文本来源：https://www.gnu.org/licenses/agpl-3.0.txt

## 当前状态

- 当前仓库提供公开源码，方便查看、构建和反馈问题。
- 正式安装包会放在 GitHub Releases，不提交到源码仓库。
- 首版计划提供 Windows MSI、Linux amd64 deb 和 Linux arm64 deb。
- Windows MSI 首版未签名，安装时可能出现 unknown publisher 或 SmartScreen 提示。
- Linux arm64 deb 在真实 ARM 设备完成 GUI / desktop / 打印入口 smoke 前标记为 experimental / 实验性。
- 首版不包含自动更新功能，请手动关注 GitHub Releases：https://github.com/LocalDoc-Viewer/local-doc-viewer/releases
- OFD 渲染依赖 Java renderer resource，该 resource 不随本源码导出。
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

桌面打包还需要对应平台的 Tauri 前置依赖，并准备 `apps/desktop-tauri/src-tauri/binaries/ofd-renderer/` 下的 OFD renderer resource。

## 问题反馈

请通过 GitHub Issues 反馈可复现问题：

https://github.com/LocalDoc-Viewer/local-doc-viewer/issues

不要上传真实或敏感文档、真实发票、合同、公文、个人文件、凭据、证书、token，或能识别你电脑的本地路径。
如果问题只在私有文件上复现，请描述文档类型和现象，或者构造不含隐私内容的 synthetic sample。

## 隐私边界

不要提交真实用户文档、真实发票、合同、公文、凭据、token、证书或本地私有样本。
`testdata/public` 下的 fixture 是人工构造并经过公开使用检查的样本。
