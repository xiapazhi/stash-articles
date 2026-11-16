(function () {
  "use strict";

  const api = window.PluginApi;
  const React = api.React;
  const h = React.createElement;
  const { Button, Modal, Alert, Form } = api.libraries.Bootstrap;
  const { useIntl } = api.libraries.Intl;
  const { useLocation } = api.libraries.ReactRouterDOM;
  const Icon = api.components.Icon;
  const icons = api.libraries.FontAwesomeSolid;
  const routes = new Set(["/scenes", "/images", "/galleries", "/groups", "/performers", "/studios", "/tags", "/scenes/markers"]);
  const pageComponents = ["FilteredSceneList", "FilteredImageList", "FilteredGalleryList", "FilteredGroupList", "FilteredPerformerList", "FilteredStudioList", "FilteredTagList", "FilteredSceneMarkerList"];

  function elementsIn(tree) {
    const elements = [];
    function visit(node) {
      if (!React.isValidElement(node)) return;
      elements.push(node);
      React.Children.forEach(node.props.children, visit);
    }
    React.Children.forEach(tree, visit);
    return elements;
  }

  function findBindings(tree) {
    const elements = elementsIn(tree);
    const toolbar = elements.find(({ props }) => props.filter && props.setFilter && props.listSelect && props.showEditFilter);
    const sidebar = elements.find(({ props }) => props.filter && props.setFilter && props.onClose && "sidebarOpen" in props);
    const sidebarContainer = elements.find(({ props }) => "hide" in props && props.onHide && props.children === sidebar);
    const result = elements.find(({ props }) => typeof props.loading === "boolean" && "error" in props);
    const pagination = elements.find(({ props }) => typeof props.totalItems === "number" && props.itemsPerPage);
    if (!toolbar || !sidebar || !sidebarContainer || !result) return null;
    return { toolbar, sidebar, sidebarContainer, result, count: pagination?.props.totalItems };
  }

  function useMobile() {
    const [mobile, setMobile] = React.useState(() => window.matchMedia("(max-width: 767px)").matches);
    React.useEffect(() => {
      const media = window.matchMedia("(max-width: 767px)");
      const update = () => setMobile(media.matches);
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }, []);
    return mobile;
  }

  function VideoPlayback({ sceneId }) {
    const loadingPlayer = api.hooks.useLoadComponents([api.loadableComponents.ScenePlayer]);
    const { data, loading, error } = api.GQL.useFindSceneQuery({ variables: { id: sceneId } });
    if (error) {
      console.error("[手机播放] 加载视频失败", sceneId, error);
      return h(Alert, { variant: "danger" }, "视频加载失败，请关闭后重试，或点击标题进入详情页播放。");
    }
    if (loadingPlayer || loading) return h("p", { role: "status" }, "正在加载视频…");
    if (!data?.findScene) return h(Alert, { variant: "danger" }, "未找到视频。");
    return h(api.components.ScenePlayer, {
      scene: data.findScene, autoplay: true, hideScrubberOverride: true,
      initialTimestamp: 0, sendSetTimestamp: () => {}, onComplete: () => {},
    });
  }

  function MobileVideoCard({ original, tree }) {
    const mobile = useMobile();
    const location = useLocation();
    const [open, setOpen] = React.useState(false);
    React.useEffect(() => {
      if (!open) return;
      console.info("[手机播放] 打开视频", original.scene.id);
      return () => console.info("[手机播放] 关闭视频", original.scene.id);
    }, [open, original.scene.id]);
    React.useEffect(() => setOpen(false), [mobile, location.pathname]);
    if (!mobile || location.pathname.replace(/\/$/, "") !== "/scenes" || original.selecting || !original.scene.files.length) return tree;

    // Intercept only the thumbnail; native title links and selection controls stay intact.
    const image = h("div", {
      onClickCapture: (event) => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      },
    }, tree.props.image);
    return h(React.Fragment, null, React.cloneElement(tree, { image }),
      h(Modal, { show: open, onHide: () => setOpen(false), className: "smf-playback", size: "xl", centered: true, "aria-labelledby": `smf-video-${original.scene.id}` },
        h(Modal.Header, { closeButton: true, closeLabel: "关闭播放" },
          h(Modal.Title, { id: `smf-video-${original.scene.id}` }, original.scene.title || "视频播放")),
        h(Modal.Body, null, open && h(VideoPlayback, { sceneId: original.scene.id }))));
  }

  function formatSortLabel(filter, intl, sfw) {
    const option = filter.options.sortByOptions.find((item) => item.value === filter.sortBy);
    return option ? intl.formatMessage({ id: sfw ? option.sfwMessageID ?? option.messageID : option.messageID }) : "默认";
  }

  function SortingPanel({ filter, setFilter, close, sfw }) {
    const intl = useIntl();
    return h(React.Fragment, null,
      h("div", { className: "smf-direction", "aria-label": "排序方向" },
        ["ASC", "DESC"].map((direction) => h(Button, {
          key: direction, variant: "secondary", active: filter.sortDirection === direction,
          "aria-pressed": filter.sortDirection === direction,
          onClick: () => {
            if (filter.sortDirection !== direction) setFilter((current) => current.toggleSortDirection());
            close();
          },
        }, direction === "ASC" ? "升序 ↑" : "降序 ↓"))),
      h("div", { className: "smf-options", role: "group", "aria-label": "排序字段" },
        filter.options.sortByOptions.map((option) => h(Button, {
          key: option.value, variant: "secondary",
          className: "smf-option" + (filter.sortBy === option.value ? " selected" : ""),
          "aria-pressed": filter.sortBy === option.value,
          onClick: () => { setFilter((current) => current.setSortBy(option.value)); close(); },
        }, intl.formatMessage({ id: sfw ? option.sfwMessageID ?? option.messageID : option.messageID }),
        filter.sortBy === option.value && h(Icon, { icon: icons.faCheck, "aria-hidden": true })))),
      filter.sortBy === "random" && h(Button, {
        variant: "secondary", className: "smf-wide",
        onClick: () => { setFilter((current) => current.reshuffleRandomSort()); close(); },
      }, "重新随机排序"));
  }

  function DisplayPanel({ filter, setFilter, zoomable }) {
    const [customSize, setCustomSize] = React.useState("");
    const [customError, setCustomError] = React.useState("");
    const labels = ["网格", "列表", "墙视图", "标记器"];
    const sizes = [20, 40, 60, 120, 250, 500, 1000];
    if (!sizes.includes(filter.itemsPerPage)) sizes.push(filter.itemsPerPage);
    sizes.sort((a, b) => a - b);
    return h(React.Fragment, null,
      h("h3", null, "显示方式"),
      h("div", { className: "smf-display-options" },
        filter.options.displayModeOptions.map((mode) => h(Button, {
          key: mode, variant: "secondary", active: filter.displayMode === mode,
          "aria-pressed": filter.displayMode === mode,
          onClick: () => setFilter((current) => current.setDisplayMode(mode)),
        }, labels[mode]))),
      zoomable && [0, 2].includes(filter.displayMode) && h(Form.Group, null,
        h(Form.Label, { htmlFor: "smf-zoom" }, "卡片尺寸"),
        h(Form.Control, {
          id: "smf-zoom", type: "range", min: 0, max: 3, step: 1, value: filter.zoomIndex,
          onChange: (event) => setFilter((current) => current.setZoom(Number(event.target.value))),
        })),
      h(Form.Group, null,
        h(Form.Label, { htmlFor: "smf-page-size" }, "每页数量"),
        h(Form.Control, {
          as: "select", id: "smf-page-size", value: filter.itemsPerPage,
          onChange: (event) => {
            if (event.target.value === "custom") {
              setCustomSize(String(filter.itemsPerPage));
              return;
            }
            setFilter((current) => current.setPageSize(Number(event.target.value)));
          },
        }, sizes.map((size) => h("option", { key: size, value: size }, `${size} 项`)),
        h("option", { value: "custom" }, "自定义…"))),
      customSize !== "" && h(Form.Group, null,
        h(Form.Label, { htmlFor: "smf-custom-size" }, "自定义每页数量"),
        h(Form.Control, {
          id: "smf-custom-size", type: "number", min: 1, step: 1,
          value: customSize, onChange: (event) => setCustomSize(event.target.value),
        }),
        customError && h("p", { role: "alert" }, customError),
        h(Button, {
          variant: "secondary", className: "smf-wide",
          onClick: () => {
            const size = Number(customSize);
            if (!Number.isInteger(size) || size < 1 || size > 2147483647) {
              setCustomError("请输入有效的正整数。");
              return;
            }
            setFilter((current) => current.setPageSize(size));
            setCustomSize("");
            setCustomError("");
          },
        }, "设置每页数量")));
  }

  function NativeOperations({ element }) {
    if (!element) return null;
    const props = element.props;
    const operations = (props.operations ?? []).map((operation) => ({ ...operation, icon: undefined }));
    if (props.onPlay && props.items > 0) operations.unshift({ text: "播放", onClick: props.onPlay });
    return React.cloneElement(element, { operations, onPlay: undefined });
  }

  function MobileToolbar({ original, panel, open, sfw }) {
    const intl = useIntl();
    const { filter, listSelect } = original.props;
    if (listSelect.selectedIds.size > 0) return h("div", { className: "smf-selection" }, original);
    const sort = formatSortLabel(filter, intl, sfw);
    return h("div", { className: "smf-toolbar filtered-list-toolbar" },
      h("div", { className: "smf-search-row" },
        h("div", { className: "smf-native-toolbar" }, React.cloneElement(original, { operationComponent: h(React.Fragment) })),
        h(NativeOperations, { element: original.props.operationComponent })),
      h("div", { className: "smf-actions", "aria-label": "列表工具" },
        [
          { id: "filter", icon: icons.faSliders, title: `筛选${filter.criteria.length ? ` (${filter.criteria.length})` : ""}` },
          { id: "sort", icon: icons.faSort, title: `排序：${sort} ${filter.sortDirection === "ASC" ? "↑" : "↓"}` },
          { id: "display", icon: icons.faThLarge, title: "显示" },
        ].map((action) => h(Button, {
          key: action.id, variant: "secondary", className: "smf-action",
          "aria-haspopup": "dialog", "aria-expanded": panel === action.id,
          onClick: () => open(action.id), title: action.title,
        }, h(Icon, { icon: action.icon, "aria-hidden": true }), h("span", null, action.title)))));
  }

  function FilterSheet({ panel, close, afterClose, bindings, advanced, sfw }) {
    const { filter, setFilter, zoomable } = bindings.toolbar.props;
    const { loading, error } = bindings.result.props;
    const title = { filter: "筛选", sort: "排序", display: "显示" }[panel];
    return h(Modal, {
      show: panel !== null, onHide: close, onExited: afterClose,
      className: "smf-sheet", "aria-labelledby": "smf-sheet-title",
    },
    h(Modal.Header, { closeButton: true, closeLabel: "关闭面板" },
      h(Modal.Title, { id: "smf-sheet-title" }, title || "列表设置")),
    h(Modal.Body, null,
      panel === "filter" && h(React.Fragment, null,
        h("p", { className: "smf-caption" }, "常用条件选择后立即生效"),
        h(Button, { variant: "secondary", className: "smf-advanced", onClick: advanced }, "高级条件（应用后生效）"),
        h("div", { className: "sidebar smf-native-filter" },
          React.cloneElement(bindings.sidebar, { onClose: close, showEditFilter: advanced, sidebarOpen: false }))),
      panel === "sort" && h(SortingPanel, { filter, setFilter, close, sfw }),
      panel === "display" && h(DisplayPanel, { filter, setFilter, zoomable }),
      error && h(Alert, { variant: "danger", role: "alert" }, "结果更新失败。当前条件已保留，可调整条件重试。")),
    h(Modal.Footer, null,
      h("div", { className: "smf-result-state", role: "status", "aria-live": "polite" },
        loading ? "正在更新结果…" : error ? "暂时无法获取结果数量" : bindings.count === undefined ? "" : `${bindings.count} 项结果`),
      panel === "filter" && h(Button, {
        variant: "secondary", onClick: () => setFilter((current) => current.clearCriteria(false)),
      }, "重置条件"),
      h(Button, { variant: "primary", onClick: close },
        !loading && !error && bindings.count !== undefined ? `查看 ${bindings.count} 项结果` : "返回列表")));
  }

  function transformTree(tree, bindings, toolbar, sheet) {
    function transform(node) {
      if (!React.isValidElement(node)) return node;
      if (node === bindings.toolbar) return toolbar;
      if (node === bindings.sidebarContainer) return sheet;
      const props = {};
      if ("hideSidebar" in node.props) props.hideSidebar = true;
      if (node.props.criteria && node.props.onRemoveCriterion && node.props.onRemoveAll) props.truncateOnOverflow = false;
      if (node.props.children !== undefined) props.children = React.Children.map(node.props.children, transform);
      return React.cloneElement(node, props);
    }
    return transform(tree);
  }

  function MobileList({ tree }) {
    const mobile = useMobile();
    const location = useLocation();
    const [panel, setPanel] = React.useState(null);
    const pendingAdvanced = React.useRef(null);
    const sfw = api.utils.StashService.useConfiguration().data?.configuration?.interface?.sfwContentMode ?? false;
    const bindings = findBindings(tree);

    React.useEffect(() => {
      setPanel(null);
      pendingAdvanced.current = null;
    }, [mobile, location.pathname]);

    React.useEffect(() => {
      if (!panel) return;
      console.info("[手机筛选] 打开面板", panel);
      return () => console.info("[手机筛选] 关闭面板", panel);
    }, [panel]);

    if (!mobile || !routes.has(location.pathname.replace(/\/$/, ""))) return tree;
    if (!bindings) return tree;

    function close() { setPanel(null); }
    function advanced() {
      pendingAdvanced.current = bindings.toolbar.props.showEditFilter;
      close();
    }
    function afterClose() {
      const callback = pendingAdvanced.current;
      pendingAdvanced.current = null;
      callback?.();
    }

    const toolbar = h(MobileToolbar, { original: bindings.toolbar, panel, open: setPanel, sfw });
    const sheet = h(FilterSheet, { panel, close, afterClose, bindings, advanced, sfw });
    // Clone the returned React tree, not live DOM: original hooks, providers,
    // filter callbacks and query ownership remain with the native list page.
    const content = transformTree(tree, bindings, toolbar, sheet);
    // Some native pages return a Fragment, which cannot carry the CSS scope class.
    return h("div", { className: "smf-enabled" }, content);
  }

  // Stash appends the result after every original argument, including React's legacy context.
  pageComponents.forEach((name) => api.patch.after(name, (...args) => h(MobileList, { tree: args[args.length - 1] })));
  api.patch.after("SceneCard", (...args) => h(MobileVideoCard, { original: args[0], tree: args[args.length - 1] }));
})();
