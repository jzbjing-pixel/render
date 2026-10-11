# Rill EPUB 阅读器 · 第一版

插件 ID：`rill.reader`，版本：`0.1.0`。独立外部插件，源码与签名发布包都在本仓库。

支持 EPUB 2 / EPUB 3、中文正文、目录及书内链接、滚动和上一页／下一页、键盘翻页、书名搜索、14–30px 字号、白纸／暖纸／夜读，以及阅读位置恢复。书库选择 Rill 多维表或视图，只显示当前筛选范围内的 EPUB。

## 安装

当前 Rill 0.1.5 旧安装包还没有外部插件运行接口。先使用已补齐接口的宿主；源码补丁见 `host-integration.patch`。

1. Rill → 插件管理 → 添加仓库。
2. 用户填 `jzbjing-pixel`，仓库填 `render`，公钥复制 `publisher.json` 的 `publicKey`。
3. 勾选「从 Git 仓库安装」。安装读取当前 Git 提交的 `dist/rill-plugin.git.zip`，使用已绑定的 P-256 公钥验证签名、文件大小和 SHA-256，验证成功后才登记版本。
4. 左上角切换到「EPUB 阅读器」；书库设置选择已有多维表／视图。EPUB 文件夹在多维表中连接和管理。

源码安装宿主补丁：在 Rill 源码目录运行 `git apply --check ../render/host-integration.patch`，检查成功后运行 `git apply ../render/host-integration.patch`，再构建 Rill。补丁基于本次开发前的 Rill 0.1.5 源码；若宿主已包含补丁，不要重复应用。

原生安装工具：`cargo run -p rill-core --example install_reader -- <Rill数据目录> <本仓库/publisher.json>`。它直接从 Git 仓库下载包，走与应用相同的签名校验和登记流程。

## 数据与边界

EPUB 原文件只读。阅读进度及设置保存在宿主管理的「阅读器 · 阅读进度」多维表，记录文件位于数据空间的 `table-records/rill-reader-state/`；插件不自行管理业务数据库。文件被外部修改后，旧进度不再强行应用。保存失败会显示错误，未保存时阻止切换宿主页面。

插件界面运行在 `sandbox="allow-scripts"` 的独立 iframe，通过 MessageChannel 调用固定阅读器端口。宿主每次打开或保存进度都检查已安装版本、发布者信任、能力、插件开关、当前表／视图筛选及来源状态。电子书脚本、事件属性、表单、嵌入网页和外部资源不运行。

第一版支持最多 **8 MiB** 的 EPUB；展开后总量最多 64 MiB、4096 个条目、单个条目最多 8 MiB。不支持 DRM、原书自定义 CSS／字体、固定版式精确还原、注释、划线、全文搜索及跨设备同步。图片支持 PNG/JPEG/GIF/WebP/AVIF，SVG 暂不显示。页码随屏幕和字号变化，进度以章节和章节内滚动比例记录。

## 构建与验证

安装 Node.js 后：`npm install`，`npm run build`。插件依赖 JSZip 3.10.1；字体与正文排版使用浏览器。

发布密钥默认保存在本地 `.private/publisher.pem`，从不提交。正式更新须保留相同发布私钥，并提升版本；可用 `RILL_SIGNING_KEY` 指定密钥。公钥、签名和校验值可公开。

`npm test` 需要相邻 `../rill` 源码中的浏览器测试工具和 Chromium。可用 `RILL_HOST_SOURCE` 指定宿主源码；`RILL_DEPENDENCIES`、`RILL_ZIP_DEPENDENCIES` 仅用于复用本机已安装依赖。

已验证签名及 hash、EPUB 2/3、非法 ZIP／路径／展开超限、活动内容过滤、目录跳转、保存后重开恢复进度、1280px／390px／320px 布局。宿主核心回归和表／视图范围校验通过。Android 真机运行尚未验证；旧 APK 需要重新构建后才能安装并运行此插件。

本机 Windows Rill 已通过 Git 下载、签名校验及实际安装；原生 WebView 验证了阅读器入口、书库设置和宿主消息端口。`tools/native-smoke.mjs` 可复查。26 个原生核心测试及 7 个模块／目录测试通过；既有工作区测试中的 6 个用例仍等待已被新版工作台替换的 `.data-workspace`，与阅读器验收分开记录。
