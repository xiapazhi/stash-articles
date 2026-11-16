(function () {
  "use strict";

  const api = window.PluginApi;
  const React = api.React;
  const h = React.createElement;
  const { Button, Alert, Modal, Nav } = api.libraries.Bootstrap;
  const { NavLink } = api.libraries.ReactRouterDOM;
  const Icon = api.components.Icon;
  const { faFileAlt, faList, faSliders } = api.libraries.FontAwesomeSolid;
  const operationDocument = api.libraries.Apollo.gql`
    mutation ReadArticles($args: Map!) {
      runPluginOperation(plugin_id: "articles", args: $args)
    }
  `;

  async function runOperation(args) {
    const response = await api.utils.StashService.getClient().mutate({
      mutation: operationDocument,
      variables: { args },
    });
    const result = response.data?.runPluginOperation;
    if (!result) {
      throw new Error("插件未返回结果，请查看 Stash 插件日志。");
    }
    return result;
  }

  function ArticleList({ articles, selectedPath, onSelect }) {
    return h("nav", { className: "articles-list", "aria-label": "文章列表" },
      articles.map((article) => {
        const separator = article.path.lastIndexOf("/");
        const title = article.path.slice(separator + 1);
        const folder = separator < 0 ? "根目录" : article.path.slice(0, separator);
        return h("button", {
          key: article.path,
          type: "button",
          className: "articles-item" + (selectedPath === article.path ? " selected" : ""),
          "aria-current": selectedPath === article.path ? "page" : undefined,
          onClick: () => onSelect(article.path),
        },
        h("span", { className: "articles-item-title" }, title),
        h("span", { className: "articles-item-folder" }, folder));
      }));
  }

  function ReadingPane({ selectedPath, article, loading, error, encoding, onEncodingChange, onOpenDirectory, drawerOpen }) {
    return h("section", { className: "articles-reader", "aria-label": "文章正文", "aria-busy": loading },
      h("header", { className: "articles-reader-header" },
        h("div", { className: "articles-reader-title" },
          h("h2", null, selectedPath ? selectedPath.split("/").pop() : "选择一篇文章"),
          selectedPath && h("p", { className: "articles-path" }, selectedPath)),
        h(Button, {
          variant: "secondary", className: "articles-reader-directory",
          "aria-label": "选择文章", "aria-haspopup": "dialog", "aria-expanded": drawerOpen,
          title: "文章目录", onClick: onOpenDirectory,
        }, h(Icon, { icon: faList, "aria-hidden": true })),
        selectedPath && h("details", { className: "articles-reading-options" },
          h("summary", { "aria-label": "阅读设置", title: "阅读设置" },
            h(Icon, { icon: faSliders, "aria-hidden": true }), h("span", null, "阅读设置")),
          h("div", { className: "articles-reading-settings card" },
          h("label", { className: "articles-encoding" }, "文本编码",
            h("select", {
            className: "form-control text-input",
            value: encoding,
            onChange: (event) => onEncodingChange(event.target.value),
          },
          h("option", { value: "auto" }, "自动识别"),
          h("option", { value: "utf-8" }, "UTF-8"),
          h("option", { value: "gb18030" }, "GB18030 / GBK / GB2312"),
          h("option", { value: "big5" }, "Big5（繁体中文）"),
          h("option", { value: "utf-16" }, "UTF-16（含 BOM）"))),
          article && h("p", { className: "articles-detected" }, "读取编码：" + article.encoding)))),
      error && h(Alert, { variant: "danger", role: "alert" }, error),
      loading && h("p", { className: "articles-empty", role: "status" }, "正在读取文章…"),
      !loading && article && h(React.Fragment, null,
        h("div", { className: "articles-content", tabIndex: 0 },
          article.content || "（空文件）")),
      !selectedPath && h("p", { className: "articles-empty" }, "选择 TXT 文件后，正文会显示在这里。"));
  }

  function ArticleDrawer({ open, onClose, articles, selectedPath, onSelect, root, loading, error, onRefresh }) {
    return h(Modal, {
      show: open,
      onHide: onClose,
      className: "articles-drawer",
      "aria-labelledby": "articles-drawer-title",
    },
    h(Modal.Header, { closeButton: true, closeLabel: "关闭文章目录" },
      h(Modal.Title, { id: "articles-drawer-title" }, "文章目录")),
    h(Modal.Body, null,
      h("p", { className: "articles-drawer-count" }, `${articles.length} 篇文章`),
      root && h("p", { className: "articles-source", title: root }, root),
      error && h(Alert, { variant: "danger", role: "alert" }, error),
      loading && h("p", { role: "status" }, "正在加载文章…"),
      !loading && !error && articles.length === 0 && h("p", null, "此目录及子目录中没有 TXT 文件。"),
      h(ArticleList, { articles, selectedPath, onSelect })),
    h(Modal.Footer, null,
      h(Button, { variant: "secondary", disabled: loading, onClick: onRefresh },
        loading ? "正在加载…" : "刷新列表")));
  }

  function ArticlesPage() {
    const [articles, setArticles] = React.useState([]);
    const [root, setRoot] = React.useState("");
    const [selectedPath, setSelectedPath] = React.useState("");
    const [article, setArticle] = React.useState(null);
    const [encoding, setEncoding] = React.useState("auto");
    const [listLoading, setListLoading] = React.useState(true);
    const [readLoading, setReadLoading] = React.useState(false);
    const [listError, setListError] = React.useState("");
    const [readError, setReadError] = React.useState("");
    const [refresh, setRefresh] = React.useState(0);
    const [drawerOpen, setDrawerOpen] = React.useState(false);

    React.useEffect(() => {
      let cancelled = false;
      setListLoading(true);
      setListError("");
      runOperation({ operation: "list" })
        .then((result) => {
          if (cancelled) return;
          setArticles(result.articles);
          setRoot(result.root);
          setSelectedPath((current) => result.articles.some((item) => item.path === current) ? current : "");
        })
        .catch((error) => {
          if (cancelled) return;
          setArticles([]);
          setRoot("");
          setSelectedPath("");
          setListError(error.message);
        })
        .finally(() => {
          if (!cancelled) setListLoading(false);
        });
      return () => { cancelled = true; };
    }, [refresh]);

    React.useEffect(() => {
      let cancelled = false;
      setArticle(null);
      setReadError("");
      setReadLoading(Boolean(selectedPath));
      if (!selectedPath) return;
      runOperation({ operation: "read", path: selectedPath, encoding })
        .then((result) => {
          if (!cancelled) setArticle(result);
        })
        .catch((error) => {
          if (!cancelled) setReadError(error.message);
        })
        .finally(() => {
          if (!cancelled) setReadLoading(false);
        });
      // A slow response from the previous file must not replace the new selection.
      return () => { cancelled = true; };
    }, [selectedPath, encoding, refresh]);

    function selectArticle(path) {
      setEncoding("auto");
      setSelectedPath(path);
      setDrawerOpen(false);
    }

    function refreshArticles() {
      setRefresh((value) => value + 1);
    }

    return h("main", { className: "articles-page" },
      h("header", { className: "articles-header" },
        h("div", null,
          h("h1", null, "文章"),
          h("p", { className: "articles-summary" }, `${articles.length} 篇文章`)),
        h("div", { className: "articles-toolbar" },
          h(Button, {
            variant: "secondary",
            className: "articles-open-drawer",
            "aria-haspopup": "dialog",
            "aria-expanded": drawerOpen,
            onClick: () => setDrawerOpen(true),
          }, "选择文章"),
          h(Button, {
            variant: "secondary",
            className: "articles-refresh",
            disabled: listLoading,
            onClick: refreshArticles,
          }, listLoading ? "正在加载…" : "刷新列表"))),
      listError && h(Alert, { variant: "danger", role: "alert" }, listError),
      !listLoading && !listError && articles.length === 0 &&
        h("p", { className: "articles-empty", role: "status" }, "此目录及子目录中没有 TXT 文件。"),
      h("div", { className: "articles-layout" },
        h("aside", { className: "articles-sidebar", "aria-label": "文章目录" },
          root && h("p", { className: "articles-source", title: root }, root),
          h(ArticleList, { articles, selectedPath, onSelect: selectArticle })),
        h(ReadingPane, {
          selectedPath, article, loading: readLoading, error: readError,
          encoding, onEncodingChange: setEncoding,
          onOpenDirectory: () => setDrawerOpen(true), drawerOpen,
        })),
      h(ArticleDrawer, {
        open: drawerOpen,
        onClose: () => setDrawerOpen(false),
        articles, selectedPath, onSelect: selectArticle, root,
        loading: listLoading, error: listError, onRefresh: refreshArticles,
      }));
  }

  // Stash handles /plugin/* as asset URLs, so use a page URL that also survives reloads.
  api.register.route("/articles", ArticlesPage);
  api.patch.before("MainNavBar.MenuItems", (props) => [{
    ...props,
    children: h(React.Fragment, null, props.children,
      h(Nav.Link, {
        as: "div",
        eventKey: "/articles",
        className: "col-4 col-sm-3 col-md-2 col-lg-auto",
      }, h(Button, {
        as: NavLink,
        to: "/articles",
        exact: true,
        activeClassName: "active",
        className: "minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center",
      }, h(Icon, {
        icon: faFileAlt,
        className: "nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0",
        "aria-hidden": true,
      }), h("span", null, "文章")))),
  }]);
})();
