# stash-articles

[English](README.md) | 简体中文

为 [Stash](https://github.com/stashapp/stash) 提供 TXT 阅读、移动端操作优化和图片自动加载。各插件可独立安装，也可配合使用。

| 插件 | 功能 |
| --- | --- |
| [文章阅读](plugins/articles) | 在 Stash 中直接阅读指定目录及子目录中的 TXT 文件。 |
| [移动端操作](plugins/mobileFilters) | 优化手机筛选、排序、显示方式和媒体播放入口。 |
| [自动加载](plugins/infiniteScroll) | 滚动时自动追加下一页图片或图库。 |

## 环境要求

- Stash v0.32.0。
- 文章插件需要 Python 3，支持 Linux 和 macOS，不支持原生 Windows。
- 插件界面文字为中文。

使用插件无需构建前端或安装 npm 依赖。

## 安装

1. 下载本仓库，或执行：

   ```sh
   git clone https://github.com/xiapazhi/stash-articles.git
   ```

2. 将需要的插件目录复制到 Stash 配置目录：

   ```text
   <stash-config>/plugins/
   ├── articles/
   │   ├── articles.yml
   │   ├── articles.py
   │   ├── articles.js
   │   ├── articles.css
   │   └── reader.json
   └── mobileFilters/
       ├── mobileFilters.yml
       ├── mobileFilters.js
       └── mobileFilters.css
   ```

   保持目录名和清单文件名不变。各插件可分别启用、禁用。

3. 使用文章插件时，编辑 `articles/reader.json`，设置 TXT 根目录：

   ```json
   {
     "root": "/data/文本"
   }
   ```

   路径必须是 Stash 进程可访问的绝对路径。Docker 部署使用的是**容器内路径**，需要先将文章目录挂载进容器，建议使用只读挂载。文章无需加入 Stash 媒体库，也无需扫描。

4. 在 **设置 → 插件** 中重新加载插件，然后刷新浏览器。

## 文章阅读

通过 Stash 导航栏的“文章”入口访问 `/articles`。

- 递归浏览 TXT 文件，支持嵌套目录。
- 支持 UTF-8、GB18030、Big5 和带 BOM 的 UTF-16，必要时可手动选择编码。
- 手机端通过抽屉选择文章，桌面端使用侧边目录。
- 阅读时保留紧凑的标题和操作栏；桌面端目录与正文独立滚动，悬停标题可查看完整路径。
- 只读文件，不提供编辑、上传、重命名或删除功能。

单篇文件上限为 **20 MiB**，最多列出 **10000 篇文章**。插件拒绝目录越界、符号链接和特殊文件，不创建 Stash 媒体记录。

能访问 Stash 的用户可以读取配置根目录内的 TXT。插件沿用 Stash 的访问控制，不提供额外的文章权限。文件正文和修改时间保持不变；文件系统可能更新访问时间。

## 移动端操作

在视口宽度 **小于 768px** 时生效，覆盖短片、图片、图库、集合、演员、工作室、标签和标记的主列表。

- 搜索、筛选、排序和显示工具栏吸顶，按钮适合触摸操作。
- 筛选、排序、视图、卡片尺寸和每页数量集中在底部面板。
- 常用筛选即时生效，高级条件保留官方“应用／取消”流程。
- 重置只清除筛选条件，保留搜索词、排序和显示方式。
- 已选条件横向滚动，批量选择沿用原生工具栏。
- 图片网格点击缩略图直接放大查看，点击标题进入详情页。
- 短片网格点击缩略图弹出原生播放器，点击标题进入详情页。

桌面布局和详情页保留原生行为。移动端操作插件不改变文章阅读页布局。

## 自动加载

安装 `plugins/infiniteScroll` 后，`/images` 图片列表、`/galleries` 图库列表和图库内图片列表支持滚动追加下一页，手机和桌面均可使用。保留原生视图与图片查看器；批量选择期间暂停加载。加载失败可重试，已加载内容保留；筛选和排序沿用原生查询。

将 `infiniteScroll/` 放在其他插件目录旁，重新加载插件并刷新即可。禁用并刷新后恢复原生分页。详见[插件说明](plugins/infiniteScroll/README.md)。

## 开发

```sh
npm install
npm test
```

测试覆盖只读 TXT 后端和移动端 React 组件行为。插件依赖 Stash 实验性插件 API，升级 Stash 时请检查兼容性。

## 卸载

在 Stash 中禁用插件并刷新页面即可恢复。完全移除时，删除 `<stash-config>/plugins/` 中对应的插件目录并重新加载插件。保留自己的媒体和文章目录。
