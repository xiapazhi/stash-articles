# 图片与图库自动加载 / Infinite scroll

在 Stash v0.32.0 中为以下位置增加滚动追加加载，手机和桌面均适用：

- `/images`：图片列表，支持网格和墙视图。
- `/galleries`：图库列表，沿用原生网格、列表和墙视图。
- `/galleries/:id`：图库内图片列表，保留当前图库范围。

接近列表底部时自动请求下一页。已有内容保留在页面上，不修改 URL 页码或每页数量。搜索、排序、筛选和每页数量变化时切换到对应查询，旧请求不会混入新结果。失败时保留列表并提供重试；也可以手动点击“加载更多”。

三个页面默认随机排序。重新打开或刷新页面时重新洗牌。滚动加载、查看器翻页、关闭大图和从图片详情返回列表时，沿用本次顺序。通过排序工具栏手动选择其他排序后，在当前标签页刷新也会保留该选择。

追加结果写入原生查询缓存，原生批量选择、编辑和删除可以识别已加载项目；选择期间暂停自动加载。图片放大仍使用 Stash 查看器，按原有每页大小翻页，可继续浏览尚未加载到列表的图片。查看器翻页失败时返回列表并显示提示。

## 安装

将 `infiniteScroll/` 放入 Stash 配置目录的 `plugins/`，重新加载插件并刷新页面。仅使用 JavaScript/CSS，不需要后端程序或额外运行时依赖。可与 `articles`、`mobileFilters` 分别启停。

禁用并刷新后恢复原生分页。插件不修改媒体文件、扫描设置或后端接口。长时间滚动会保留更多卡片和缓存，占用内存会随已加载数量增加。

## Development

With the repository's development dependencies installed:

```sh
node plugins/infiniteScroll/test-infinite.cjs
```

Tests cover append/deduplication, retry, stale responses, gallery constraints, selection data, native viewer paging, and mobile-toolbar compatibility. These are component tests, not browser rendering tests.

For a local demo with small pages, use `/images?perPage=20`, `/galleries?perPage=5`, or `/galleries/1?perPage=3`.
