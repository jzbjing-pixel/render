# Rill EPUB 阅读器 · 0.2.3

签名安装版本，通过 Rill 插件管理从 Git 安装 `jzbjing-pixel/render`，资源名 `rill-plugin.git.zip`，发布者公钥取 `publisher.json` 的 publicKey。

此版本把书籍侧栏改为宿主提供的 record-view 和 tags 模块：引用真实多维表视图，筛选、排序和分组同步到同一视图；标签可选择字段，点击后筛选当前结果。阅读器响应书籍点击，打开 EPUB 并保存阅读位置。

需要包含共享视图模块与 views.describe/update 的新版 Rill 宿主。侧栏暂不提供完整字段 Schema 或记录正文编辑，视图目录和命名筛选模块尚未接入。EPUB 2/3、安全过滤、目录、阅读进度、桌面/390px/320px 及签名校验通过；Android 真机尚待验证。

本仓库当前发布目录仅保留签名安装包、公钥、许可证和说明；开发源码、发布私钥留在本地。更新沿用原发布者签名。
