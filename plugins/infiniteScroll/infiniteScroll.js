(function () {
  "use strict";

  const api = window.PluginApi;
  const React = api.React;
  const h = React.createElement;
  const { Button, Alert } = api.libraries.Bootstrap;
  const { useHistory, useLocation } = api.libraries.ReactRouterDOM;
  const ListContext = React.createContext(null);

  function supportsRoute(path, kind) {
    if (kind === "galleries") return /^\/galleries\/?$/.test(path);
    return /^\/images\/?$/.test(path) || /^\/galleries\/\d+\/?$/.test(path);
  }

  function manualSortKey(pathname) {
    return `infiniteScroll:manualSort:${pathname.replace(/\/$/, "")}`;
  }

  function RandomSortOnOpen({ filter, setFilter }) {
    const history = useHistory();
    const location = useLocation();
    const visit = React.useRef({ location, handled: false });

    React.useLayoutEffect(() => history.listen((next, action) => {
      // Native sorting, searching and filtering replace the current entry.
      if (action !== "REPLACE" && next.pathname === location.pathname) {
        visit.current = { location: next, handled: false };
      }
    }), [history, location.pathname]);

    React.useEffect(() => {
      if (visit.current.handled || !filter || !location.search) return;
      if (history.location.pathname !== location.pathname || history.location.search !== location.search) return;

      // Let Stash restore the URL and its saved defaults before applying a new sort.
      const requested = filter.empty();
      requested.configureFromQueryString(location.search);
      if (requested.makeQueryParameters() !== filter.makeQueryParameters()) return;

      visit.current.handled = true;
      const originalSort = new URLSearchParams(visit.current.location.search).get("sortby");
      const key = manualSortKey(location.pathname);
      if (originalSort && originalSort === window.sessionStorage.getItem(key) && originalSort === filter.sortBy) return;
      window.sessionStorage.removeItem(key);

      const next = filter.setSortBy("random").reshuffleRandomSort();
      const seedLimit = 100_000_000;
      let seed = Math.floor(Math.random() * seedLimit);
      if (seed === filter.randomSeed) seed = (seed + 1) % seedLimit;
      next.randomSeed = seed;
      setFilter(next);
      console.info("[自动加载] 已更新本次浏览的随机顺序", location.pathname);
    }, [filter, history, location, setFilter]);

    return null;
  }

  function prepareList(tree, bindings) {
    if (Array.isArray(tree)) return tree.map((child, index) => {
      const result = prepareList(child, bindings);
      return React.isValidElement(result) && result.key === null
        ? React.cloneElement(result, { key: `sis-layout-${index}` }) : result;
    });
    if (!React.isValidElement(tree)) return tree;
    const props = {};
    if (typeof tree.props.totalItems === "number" && tree.props.itemsPerPage) {
      bindings.totalCount = tree.props.totalItems;
    }
    if (typeof tree.type === "string" && /\bitem-list-container\b/.test(tree.props.className || "")) {
      props.className = tree.props.className + " sis-page";
    }
    const { filter, listSelect, setFilter } = tree.props;
    if (bindings.pathname && filter && listSelect && typeof setFilter === "function") {
      bindings.toolbar = { filter, setFilter };
      props.setFilter = (value) => {
        const next = typeof value === "function" ? value(filter) : value;
        if (next.sortBy !== filter.sortBy || next.sortDirection !== filter.sortDirection) {
          const key = manualSortKey(bindings.pathname);
          if (next.sortBy && next.sortBy !== "random") window.sessionStorage.setItem(key, next.sortBy);
          else window.sessionStorage.removeItem(key);
        }
        setFilter(next);
      };
    }
    if (tree.props.children !== undefined) {
      props.children = prepareList(tree.props.children, bindings);
    }
    // The independent mobile-toolbar plugin keeps the native list in its tree prop.
    if (React.isValidElement(tree.props.tree)) props.tree = prepareList(tree.props.tree, bindings);
    return React.cloneElement(tree, props);
  }

  function mergeItems(current, incoming) {
    const seen = new Set(current.map((item) => item.id));
    const merged = [...current];
    for (const item of incoming) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }

  function ImageResults({ tree, source, items, totalCount, requestPage, onViewerVisibility }) {
    const pageSize = source.filter.itemsPerPage;
    const basePage = source.filter.currentPage;
    const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));
    const [viewer, setViewer] = React.useState({ images: [] });
    const viewerPage = React.useRef(basePage);
    const viewerRequest = React.useRef(0);
    const alive = React.useRef(true);
    const [viewerError, setViewerError] = React.useState("");
    const failedPage = React.useRef(null);

    React.useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        viewerRequest.current += 1;
      };
    }, []);

    const closeViewer = React.useCallback(() => {
      viewerRequest.current += 1;
      if (failedPage.current === null) setViewerError("");
      onViewerVisibility(false);
    }, [onViewerVisibility]);

    const changeViewerPage = React.useCallback(async ({ direction, page }) => {
      let target = page ?? viewerPage.current + direction;
      if (target < 1) target = pageCount;
      if (target > pageCount) target = 1;
      const request = ++viewerRequest.current;
      failedPage.current = null;
      setViewerError("");
      try {
        const result = await requestPage(target);
        if (!alive.current || request !== viewerRequest.current) return;
        viewerPage.current = target;
        setViewer((current) => ({ ...current, images: result.items, page: target, totalCount: result.count }));
      } catch (error) {
        if (!alive.current || request !== viewerRequest.current) return;
        console.error("[自动加载] 图片查看器翻页失败", target, error);
        failedPage.current = target;
        setViewerError("图片查看器翻页失败，已返回列表。可重新点开图片重试，列表内容已保留。");
        // The native viewer closes on an empty image set, releasing its failed page-transition lock.
        setViewer((current) => ({ ...current, images: [] }));
      }
    }, [pageCount, requestPage]);

    const state = {
      ...viewer, showNavigation: false, pageSize, pages: pageCount,
      pageCallback: pageCount > 1 ? changeViewerPage : undefined,
      onClose: closeViewer,
    };
    const chapters = source.filter.sortBy === "path" && source.filter.sortDirection === "ASC" ? source.chapters : undefined;
    const showLightbox = api.hooks.useLightbox(state, chapters);

    function openImage(index, event) {
      event?.preventDefault();
      const offset = Math.floor(index / pageSize) * pageSize;
      const page = basePage + Math.floor(index / pageSize);
      const next = {
        images: items.slice(offset, offset + pageSize), page, totalCount,
        showNavigation: false, pageSize, pages: pageCount,
        pageCallback: pageCount > 1 ? changeViewerPage : undefined,
        onClose: closeViewer, slideshowEnabled: true, slideshowAutostart: false, isLoading: false,
      };
      viewerRequest.current += 1;
      viewerPage.current = page;
      failedPage.current = null;
      setViewerError("");
      setViewer(next);
      onViewerVisibility(true);
      showLightbox({ ...next, initialIndex: index - offset });
    }

    return h(React.Fragment, null,
      React.cloneElement(tree, { images: items, onPreview: openImage, handleImageOpen: openImage }),
      viewerError && h(Alert, { className: "sis-viewer-error", variant: "danger", role: "alert" },
        viewerError, " ", h(Button, { variant: "secondary", onClick: () => setViewerError("") }, "关闭提示")));
  }

  function InfiniteList({ source, tree, original, kind, effectiveFilter, totalCount }) {
    const field = kind === "images" ? "findImages" : "findGalleries";
    const document = kind === "images" ? api.GQL.FindImagesDocument : api.GQL.FindGalleriesDocument;
    const variables = React.useMemo(() => ({
      filter: effectiveFilter.makeFindFilter(),
      [kind === "images" ? "image_filter" : "gallery_filter"]: effectiveFilter.makeFilter(),
    }), [effectiveFilter, kind]);
    const items = source[kind];
    const pageSize = variables.filter.per_page;
    const basePage = variables.filter.page;
    const initialPage = basePage + Math.max(0, Math.ceil(items.length / pageSize) - 1);
    const [lastPage, setLastPage] = React.useState(initialPage);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [exhausted, setExhausted] = React.useState(false);
    const busy = React.useRef(false);
    const alive = React.useRef(true);
    const viewerOpen = React.useRef(false);
    const pendingPage = React.useRef(null);
    const footer = React.useRef(null);
    const lastLength = React.useRef(items.length);
    const selected = source.selectedIds?.size > 0;
    const done = exhausted || lastPage * pageSize >= totalCount;

    React.useEffect(() => {
      alive.current = true;
      return () => { alive.current = false; };
    }, []);
    React.useEffect(() => {
      if (items.length < lastLength.current) {
        setLastPage(basePage + Math.max(0, Math.ceil(items.length / pageSize) - 1));
        setExhausted(false);
      }
      lastLength.current = items.length;
    }, [items, basePage, pageSize]);

    const requestPage = React.useCallback(async (page) => {
      const result = await api.utils.StashService.getClient().query({
        query: document, variables: { ...variables, filter: { ...variables.filter, page } },
        // Write appended results explicitly so native selection receives every loaded item.
        fetchPolicy: "no-cache",
      });
      const data = result.data?.[field];
      if (result.errors?.length || !data || !Array.isArray(data[kind])) {
        throw new Error("Stash 返回了无效的分页结果。");
      }
      return { data, items: data[kind], count: data.count };
    }, [document, field, kind, variables]);

    const appendPage = React.useCallback((page, result) => {
      if (!alive.current) return;
      api.utils.StashService.getClient().cache.updateQuery({ query: document, variables }, (current) => {
        if (!current?.[field]) return current;
        return { ...current, [field]: { ...current[field], ...result.data, [kind]: mergeItems(current[field][kind], result.items) } };
      });
      setLastPage(page);
      setExhausted(result.items.length < pageSize);
      console.info("[自动加载] 已追加下一页", kind, page, result.items.length);
    }, [document, field, kind, pageSize, variables]);

    const onViewerVisibility = React.useCallback((open) => {
      viewerOpen.current = open;
      // A late list response must not replace the native viewer's active page.
      if (!open && pendingPage.current) {
        const pending = pendingPage.current;
        pendingPage.current = null;
        appendPage(pending.page, pending.result);
      }
    }, [appendPage]);

    const loadMore = React.useCallback(async () => {
      if (busy.current || done || selected || viewerOpen.current) return;
      busy.current = true;
      setLoading(true);
      setError("");
      const page = lastPage + 1;
      console.info("[自动加载] 开始加载", kind, page);
      try {
        const result = await requestPage(page);
        if (!alive.current) return;
        if (viewerOpen.current) pendingPage.current = { page, result };
        else appendPage(page, result);
      } catch (failure) {
        if (!alive.current) return;
        console.error("[自动加载] 下一页加载失败", kind, page, failure);
        setError("加载下一页失败，已加载内容会保留。");
      } finally {
        busy.current = false;
        if (alive.current) setLoading(false);
      }
    }, [appendPage, done, kind, lastPage, requestPage, selected]);

    React.useEffect(() => {
      if (loading || done || error || selected || !window.IntersectionObserver) return;
      const observer = new window.IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      }, { rootMargin: "500px 0px" });
      if (footer.current) observer.observe(footer.current);
      return () => observer.disconnect();
    }, [done, error, items.length, loadMore, loading, selected]);

    return h("div", { className: "sis-list" },
      kind === "images"
        ? h(ImageResults, { tree, source, items, totalCount, requestPage, onViewerVisibility })
        : h(original, { ...source, galleries: items }),
      h("div", { className: "sis-footer", ref: footer, "aria-busy": loading },
        h("span", { role: "status", "aria-live": "polite" },
          `已加载 ${items.length} 项，共 ${totalCount} 项`,
          loading ? " · 正在加载…" : done ? " · 已到底部" : selected ? " · 选择期间暂停加载" : ""),
        error && h(Alert, { variant: "danger", role: "alert" }, error),
        !done && h(Button, { variant: "secondary", disabled: loading || selected, onClick: loadMore }, error ? "重试" : "加载更多")));
  }

  function ListEntry({ source, tree, original, kind }) {
    const scope = React.useContext(ListContext);
    const location = useLocation();
    const effectiveFilter = React.useMemo(() => kind === "images" && scope?.filterHook
      ? scope.filterHook(source.filter.clone()) : source.filter,
    [kind, scope?.filterHook, source.filter]);
    if (!scope || !supportsRoute(location.pathname, kind)) return tree ?? h(original, source);
    if (kind === "images" && !React.isValidElement(tree)) return tree;
    if (effectiveFilter.itemsPerPage < 1) return tree ?? h(original, source);
    const key = JSON.stringify([location.pathname, effectiveFilter.makeFindFilter(), effectiveFilter.makeFilter()]);
    return h(InfiniteList, {
      key, source, tree, original, kind, effectiveFilter,
      totalCount: source.totalCount ?? scope.totalCount,
    });
  }

  for (const [name, kind] of [["FilteredImageList", "images"], ["FilteredGalleryList", "galleries"]]) {
    api.patch.after(name, (...args) => {
      const tree = args[args.length - 1];
      if (!supportsRoute(window.location.pathname, kind)) return tree;
      const scope = {
        filterHook: args[0].filterHook,
        pathname: args[0].alterQuery !== false ? window.location.pathname : undefined,
        totalCount: 0,
      };
      const content = prepareList(tree, scope);
      return h(ListContext.Provider, { value: scope },
        scope.pathname && h(RandomSortOnOpen, { key: scope.pathname, ...scope.toolbar }),
        content);
    });
  }
  api.patch.after("ImageList", (...args) => h(ListEntry, { source: args[0], tree: args[args.length - 1], kind: "images" }));
  api.patch.instead("GalleryList", (...args) => h(ListEntry, { source: args[0], original: args[args.length - 1], kind: "galleries" }));
})();
