(() => {
  "use strict";

  // ============================================================
  // CONFIG
  // ============================================================

  const DATA_URL = "../data/webview.json";

  const PAGE_SIZE = 10;

  const CRUD_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

  let nextId = 10000;

  // ============================================================
  // STATE
  // ============================================================

  const state = {
    webs: [],

    filtered: [],

    page: 1,

    search: "",

    crud: "all",

    tags: new Set(),

    segments: new Set(),

    selected: new Set(),

    activeRowId: null,

    sidebarCollapsed: false,
  };

  let sizeUnits = {};

  const API_BASE = "http://localhost:3000";

  // ============================================================
  // INIT
  // ============================================================

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    await loadData();

    wireToolbar();

    wireSidebar();

    wireSelection();

    wireSidebarTabs();

    wireModal();

    renderSidebar();

    applyFilters();
  }

  // ============================================================
  // DATA
  // ============================================================

  async function loadData() {
    try {
      if (!window.EdmsAPI) {
        console.warn("EdmsAPI not loaded yet");
        return;
      }

      const response = await window.EdmsAPI.listWebviews();

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = response.data;
      let list = [];
      if (data && Array.isArray(data.items)) {
        list = data.items;
      } else if (Array.isArray(data)) {
        list = data;
      }

      // Map the backend items to the structure expected by the frontend table
      state.webs = list.map((item, index) => {
        return {
          id: nextId + index, // Generate temporary ID since backend doesn't provide one
          name: item.name,
          annotation: item.annotation || "",
          dateCreated: item.created_at ? item.created_at.split(" ")[0] : "",
          dataSizeBytes: 0,
          eidCount: item.endpoint_count || 0,
          segments: 0,
          dataTags: [],
          tags: [], // Tags aren't attached to the list view in the backend yet
          qpCount: 0,
          indexLists: 0,
        };
      });

      if (state.webs.length === 0) {
        state.webs.push({
          id: nextId++,
          name: "demo webview",
          annotation: "just for referencing (dummy entry)",
          dateCreated: new Date().toISOString().split("T")[0],
          dataSizeBytes: 15 * 1024 * 1024,
          eidCount: 5,
          segments: 2,
          dataTags: ["eqp-demo"],
          tags: ["demo"],
          qpCount: 2,
          indexLists: 1,
          crud: { GET: 2, POST: 1, PUT: 0, PATCH: 0, DELETE: 1 },
        });
      }

      nextId += state.webs.length;

      state.webs.forEach((item) => {
        sizeUnits[item.id] = "MB";
      });
    } catch (error) {
      console.error("Failed to load Web View data:", error);

      state.webs = [];
    }
  }

  // ============================================================
  // FILTERING
  // ============================================================

  function applyFilters() {
    const term = state.search.trim().toLowerCase();

    state.filtered = state.webs.filter((web) => {
      const webTags = Array.isArray(web.tags) ? web.tags : [];
      const dataTags = Array.isArray(web.dataTags) ? web.dataTags : [];

      const matchesSearch =
        !term ||
        String(web.name || "")
          .toLowerCase()
          .includes(term) ||
        String(web.annotation || "")
          .toLowerCase()
          .includes(term) ||
        webTags.some((tag) => String(tag).toLowerCase().includes(term)) ||
        dataTags.some((tag) => String(tag).toLowerCase().includes(term));

      const matchesCrud =
        state.crud === "all" || Number(web.crud?.[state.crud] || 0) > 0;

      const matchesTags =
        state.tags.size === 0 ||
        [...state.tags].every((tag) => webTags.includes(tag));

      const webSegments = getWebSegments(web);

      const matchesSegments =
        state.segments.size === 0 ||
        [...state.segments].every((segment) => webSegments.includes(segment));

      return matchesSearch && matchesCrud && matchesTags && matchesSegments;
    });

    const totalPages = getTotalPages();

    if (state.page > totalPages) state.page = totalPages;

    render();
  }

  function getTotalPages() {
    return Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
  }

  function currentPageItems() {
    const start = (state.page - 1) * PAGE_SIZE;

    return state.filtered.slice(start, start + PAGE_SIZE);
  }

  // ============================================================
  // SEGMENTS
  //
  // Falls back gracefully depending on what a given web entry
  // actually provides:
  //   1) web.endpoints (full endpoint list)
  //   2) web.segments (array of segment strings)
  //   3) web.segmentCount (precomputed number, non-filterable)
  //   4) [] if none of the above exist
  // ============================================================

  function getEndpointSegments(endpointPath) {
    return String(endpointPath || "")
      .split("/")
      .filter(Boolean);
  }

  function getWebSegments(web) {
    if (Array.isArray(web.endpoints)) {
      const segments = new Set();

      web.endpoints.forEach((endpoint) => {
        getEndpointSegments(endpoint.endpoint).forEach((segment) =>
          segments.add(segment),
        );
      });

      return [...segments];
    }

    if (Array.isArray(web.segments)) {
      return web.segments;
    }

    return [];
  }

  function getWebSegmentCount(web) {
    const segments = getWebSegments(web);

    if (segments.length) return segments.length;

    if (typeof web.segmentCount === "number") return web.segmentCount;

    return 0;
  }

  // ============================================================
  // RENDER
  // ============================================================

  function render() {
    renderTable();

    renderPagination();

    renderSelectionUI();

    updateStats();

    syncSidebar();

    syncSidebar();

    renderActiveRowData();
  }

  // ============================================================
  // TABLE
  // ============================================================

  function renderTable() {
    const tbody = document.getElementById("webTableBody");

    if (!tbody) return;

    tbody.innerHTML = "";

    const items = currentPageItems();

    if (items.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="18" class="px-4 py-16 text-center">
                        <p class="text-sm font-medium text-slate-400">No web views found</p>
                        <p class="mt-1 text-xs text-slate-600">Try changing the current search or filters.</p>
                    </td>
                </tr>
            `;

      updateSelectAllState();

      return;
    }

    items.forEach((web) => {
      tbody.appendChild(createWebRow(web));
    });

    updateSelectAllState();
  }

  function createWebRow(web) {
    const row = document.createElement("tr");

    const id = Number(web.id);

    const isSelected = state.selected.has(id);
    const isActive = state.activeRowId === id;

    row.dataset.id = String(id);

    row.className = [
      "web-row",
      "border-b",
      "border-slate-800",
      "transition-colors",
      "duration-100",
      "cursor-pointer",
      "hover:bg-slate-800/60",
      isSelected ? "bg-cyan-500/[0.045]" : "",
      isActive ? "bg-slate-800/80 ring-1 ring-inset ring-cyan-500/50" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const dataTagsCount = (web.dataTags || []).length;
    const segmentCount = getWebSegmentCount(web);

    row.innerHTML = `

            <!-- Select -->
            <td class="px-2 py-2 align-middle">
                <input type="checkbox" class="web-select h-3.5 w-3.5 accent-cyan-400" ${isSelected ? "checked" : ""}>
            </td>

            <!-- Folder Name -->
            <td class="px-2 py-2 font-medium text-slate-200">
                <button
                    type="button"
                    class="web-name-btn truncate text-left hover:text-cyan-400"
                    title="${escapeAttr(web.name)}">
                    ${escapeHtml(web.name)}
                </button>
            </td>

            <!-- Annotation -->
            <td class="px-2 py-2">
                <button
                    type="button"
                    class="web-annotation-btn block max-w-xs truncate text-left text-[11px] text-slate-500 hover:text-cyan-400"
                    title="${escapeAttr(web.annotation || "")}">
                    ${escapeHtml(web.annotation || "—")}
                </button>
            </td>

            <!-- Tags -->
            <td class="px-2 py-2">
                <div class="flex flex-wrap gap-1">
                    ${renderWebTags(web)}
                </div>
            </td>

            <!-- Date Created -->
            <td class="px-2 py-2 text-slate-500 whitespace-nowrap">
                ${escapeHtml(web.dateCreated || "—")}
            </td>

            <!-- Size -->
            <td class="px-2 py-2">
                <button type="button" class="web-size-btn text-slate-300 hover:text-cyan-400">
                    ${formatSize(web.dataSizeBytes, sizeUnits[web.id])}
                </button>
            </td>

            <!-- GET -->
            <td class="px-1 py-2 text-center border-l border-slate-800">${crudCountBadge(web.crud?.GET, "text-emerald-400")}</td>
            <!-- POST -->
            <td class="px-1 py-2 text-center">${crudCountBadge(web.crud?.POST, "text-sky-400")}</td>
            <!-- PUT -->
            <td class="px-1 py-2 text-center">${crudCountBadge(web.crud?.PUT, "text-amber-400")}</td>
            <!-- PATCH -->
            <td class="px-1 py-2 text-center">${crudCountBadge(web.crud?.PATCH, "text-violet-400")}</td>
            <!-- DELETE -->
            <td class="px-1 py-2 text-center">${crudCountBadge(web.crud?.DELETE, "text-rose-400")}</td>

            <!-- EID Count -->
            <td class="px-2 py-2 text-slate-300">${web.eidCount ?? 0}</td>

            <!-- Segments -->
            <td class="px-2 py-2 text-slate-300">${segmentCount}</td>

            <!-- Data Tags -->
            <td class="px-2 py-2">
                <button
                    type="button"
                    class="web-datatags-btn rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-cyan-500/60 hover:text-cyan-400">
                    ${dataTagsCount} tag${dataTagsCount === 1 ? "" : "s"}
                </button>
            </td>

            <!-- QP Count -->
            <td class="px-2 py-2 text-slate-300">${web.qpCount ?? 0}</td>

            <!-- Index Lists -->
            <td class="px-2 py-2 text-slate-300">${web.indexLists ?? 0}</td>

            <!-- Preview -->
            <td class="px-2 py-2 text-center">
                <button
                    type="button"
                    class="web-action-preview-btn inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-400 transition hover:bg-cyan-500/20 hover:text-cyan-300"
                    title="Preview Webview"
                >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                    Preview
                </button>
            </td>

            <!-- Action -->
            <td class="px-2 py-2 text-center">
                <button
                    type="button"
                    class="web-action-edit-btn inline-flex items-center gap-1.5 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-400 transition hover:bg-cyan-500/20 hover:text-cyan-300"
                    title="Edit Webview"
                >
                    <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                    Edit
                </button>
            </td>

        `;

    // --------------------------------------------------------
    // Click row -> make active
    // --------------------------------------------------------

    row.addEventListener("click", (event) => {
      if (event.target.closest("button, input, select, a")) return;
      if (state.activeRowId === id) {
        state.activeRowId = null;
      } else {
        state.activeRowId = id;
      }
      renderTable();
      renderActiveRowData();
    });

    // --------------------------------------------------------
    // Checkbox
    // --------------------------------------------------------

    const checkbox = row.querySelector(".web-select");

    checkbox.addEventListener("click", (event) => event.stopPropagation());

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.selected.add(id);
      else state.selected.delete(id);

      renderSelectionUI();
      updateSelectAllState();
      renderTable();
    });

    // --------------------------------------------------------
    // Folder name -> edit modal
    // --------------------------------------------------------

    row.querySelector(".web-name-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      openEditWebModal(id);
    });

    // --------------------------------------------------------
    // Preview -> preview function (stub)
    // --------------------------------------------------------

    row
      .querySelector(".web-action-preview-btn")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        previewWebView(id);
      });

    // --------------------------------------------------------
    // Action -> edit modal
    // --------------------------------------------------------

    row
      .querySelector(".web-action-edit-btn")
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditWebFrontPageModal(id);
        // openEditWebModal(id);
      });

    // --------------------------------------------------------
    // Annotation -> annotation modal
    // --------------------------------------------------------

    row
      .querySelector(".web-annotation-btn")
      .addEventListener("click", (event) => {
        event.stopPropagation();
        openAnnotationModal(id);
      });

    // --------------------------------------------------------
    // Size -> cycle unit
    // --------------------------------------------------------

    row.querySelector(".web-size-btn").addEventListener("click", (event) => {
      event.stopPropagation();
      cycleSizeUnit(id);
    });

    // --------------------------------------------------------
    // Data tags -> popup list
    // --------------------------------------------------------

    row
      .querySelector(".web-datatags-btn")
      .addEventListener("click", (event) => {
        event.stopPropagation();
        openDataTagsModal(id);
      });

    // --------------------------------------------------------
    // Tags -> filter
    // --------------------------------------------------------

    row.querySelectorAll(".web-tag").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();

        const tag = button.dataset.tag;

        state.tags.clear();
        state.tags.add(tag);
        state.page = 1;

        applyFilters();
      });
    });

    return row;
  }

  function renderWebTags(web) {
    const tags = Array.isArray(web.tags) ? web.tags : [];

    if (!tags.length) {
      return `<span class="text-[10px] text-slate-600">—</span>`;
    }

    return tags
      .map(
        (tag) => `
            <button
                type="button"
                class="web-tag inline-flex rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-300 transition hover:bg-sky-500/20 hover:text-sky-200"
                data-tag="${escapeAttr(tag)}">
                ${escapeHtml(tag)}
            </button>
        `,
      )
      .join("");
  }

  function crudCountBadge(count, color) {
    const value = Number(count || 0);

    return `
            <span class="inline-flex min-w-6 items-center justify-center rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] ${value > 0 ? color : "text-slate-600"}">
                ${value}
            </span>
        `;
  }

  // ============================================================
  // DATA TAGS POPUP
  // ============================================================

  function openDataTagsModal(id) {
    const web = getWeb(id);

    if (!web) return;

    const tags = web.dataTags || [];

    openModal(`

            <h2 class="mb-4 text-sm font-semibold text-white">EQP Tags</h2>

            <div class="flex flex-wrap gap-2">
                ${
                  tags.length
                    ? tags
                        .map(
                          (tag) => `
                            <span class="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-300">
                                ${escapeHtml(tag)}
                            </span>
                        `,
                        )
                        .join("")
                    : '<span class="text-xs text-slate-600">No EQP Tags.</span>'
                }
            </div>

            <div class="mt-4 flex justify-end">
                <button type="button" data-modal-close class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
                    Close
                </button>
            </div>

        `);
  }

  // ============================================================
  // PAGINATION
  // ============================================================

  function renderPagination() {
    const total = state.filtered.length;

    const start = total ? (state.page - 1) * PAGE_SIZE + 1 : 0;

    const end = Math.min(state.page * PAGE_SIZE, total);

    document.getElementById("webRangeStart").textContent = start;
    document.getElementById("webRangeEnd").textContent = end;
    document.getElementById("webTotal").textContent = total;

    const totalPages = getTotalPages();

    const numbers = document.getElementById("webPagination");

    numbers.innerHTML = "";

    getPageRange(state.page, totalPages).forEach((page) => {
      if (page === "...") {
        const span = document.createElement("span");
        span.className = "px-1 text-slate-600";
        span.textContent = "…";
        numbers.appendChild(span);
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = page;

      button.className =
        page === state.page
          ? "min-w-7 rounded-md bg-cyan-500 px-2 py-1 text-[11px] text-white"
          : "min-w-7 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-400 transition hover:bg-slate-800 hover:text-white";

      button.addEventListener("click", () => {
        state.page = page;
        render();
      });

      numbers.appendChild(button);
    });

    document.getElementById("webPrev").disabled = state.page <= 1;
    document.getElementById("webNext").disabled = state.page >= totalPages;
  }

  function getPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = [1];

    if (current > 4) pages.push("...");

    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);

    for (let page = start; page <= end; page++) pages.push(page);

    if (current < total - 3) pages.push("...");

    pages.push(total);

    return pages;
  }

  // ============================================================
  // SIDEBAR
  // ============================================================

  function wireSidebar() {
    document
      .getElementById("sidebarToggle")
      ?.addEventListener("click", toggleSidebar);
  }

  function toggleSidebar() {
    const sidebar = document.getElementById("filterSidebar");
    const content = document.getElementById("sidebarContent");
    const title = document.getElementById("sidebarTitle");
    const icon = document.getElementById("sidebarToggleIcon");

    state.sidebarCollapsed = !state.sidebarCollapsed;

    if (state.sidebarCollapsed) {
      sidebar.classList.remove("w-64");
      sidebar.classList.add("w-10");
      content.classList.add("hidden");
      title.classList.add("hidden");
      icon.innerHTML = `<path d="m9 18 6-6-6-6"/>`;
    } else {
      sidebar.classList.remove("w-10");
      sidebar.classList.add("w-64");
      content.classList.remove("hidden");
      title.classList.remove("hidden");
      icon.innerHTML = `<path d="m15 18-6-6 6-6"/>`;
    }
  }

  function renderSidebar() {
    renderTags();
    renderSegments();
    updateStats();
  }

  function renderTags() {
    const container = document.getElementById("tagsContainer");

    if (!container) return;

    const counts = {};

    state.webs.forEach((web) => {
      (web.tags || []).forEach((tag) => {
        if (!tag) return;
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });

    container.innerHTML = "";

    Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([tag, count]) => {
        const wrapper = document.createElement("label");
        wrapper.className = "group flex cursor-pointer items-center gap-2";

        wrapper.innerHTML = `
                    <input type="checkbox" class="web-tag-checkbox h-3.5 w-3.5 accent-cyan-400" data-tag="${escapeAttr(tag)}">
                    <button type="button" class="web-tag-filter min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-[11px] text-slate-400 transition hover:bg-sky-500/10 hover:text-sky-300" data-tag="${escapeAttr(tag)}">
                        ${escapeHtml(tag)} <span class="text-slate-600">(${count})</span>
                    </button>
                `;

        const checkbox = wrapper.querySelector(".web-tag-checkbox");
        const button = wrapper.querySelector(".web-tag-filter");

        checkbox.addEventListener("change", () =>
          setTagFilter(tag, checkbox.checked),
        );

        button.addEventListener("click", (event) => {
          event.preventDefault();
          const enabled = !state.tags.has(tag);
          checkbox.checked = enabled;
          setTagFilter(tag, enabled);
        });

        container.appendChild(wrapper);
      });
  }

  function renderSegments() {
    const container = document.getElementById("segmentsContainer");

    if (!container) return;

    const counts = {};

    state.webs.forEach((web) => {
      getWebSegments(web).forEach((segment) => {
        counts[segment] = (counts[segment] || 0) + 1;
      });
    });

    container.innerHTML = "";

    if (Object.keys(counts).length === 0) {
      container.innerHTML = `<span class="text-[11px] text-slate-600">No segment data available.</span>`;
      return;
    }

    Object.entries(counts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([segment, count]) => {
        const wrapper = document.createElement("label");
        wrapper.className = "group flex cursor-pointer items-center gap-2";

        wrapper.innerHTML = `
                    <input type="checkbox" class="web-segment-checkbox h-3.5 w-3.5 accent-cyan-400" data-segment="${escapeAttr(segment)}">
                    <button type="button" class="web-segment-filter min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-[11px] text-slate-400 transition hover:bg-cyan-500/10 hover:text-cyan-300" data-segment="${escapeAttr(segment)}">
                        ${escapeHtml(segment)} <span class="text-slate-600">(${count})</span>
                    </button>
                `;

        const checkbox = wrapper.querySelector(".web-segment-checkbox");
        const button = wrapper.querySelector(".web-segment-filter");

        checkbox.addEventListener("change", () =>
          setSegmentFilter(segment, checkbox.checked),
        );

        button.addEventListener("click", (event) => {
          event.preventDefault();
          const enabled = !state.segments.has(segment);
          checkbox.checked = enabled;
          setSegmentFilter(segment, enabled);
        });

        container.appendChild(wrapper);
      });
  }

  function setTagFilter(tag, enabled) {
    if (enabled) state.tags.add(tag);
    else state.tags.delete(tag);

    state.page = 1;

    applyFilters();
  }

  function setSegmentFilter(segment, enabled) {
    if (enabled) state.segments.add(segment);
    else state.segments.delete(segment);

    state.page = 1;

    applyFilters();
  }

  function syncSidebar() {
    document.querySelectorAll(".web-tag-checkbox").forEach((checkbox) => {
      checkbox.checked = state.tags.has(checkbox.dataset.tag);
    });

    document.querySelectorAll(".web-segment-checkbox").forEach((checkbox) => {
      checkbox.checked = state.segments.has(checkbox.dataset.segment);
    });
  }

  let activeTab = "web";

  function wireSidebarTabs() {
    const tabRepo = document.getElementById("activeTabRepo");
    const tabEqp = document.getElementById("activeTabEqp");
    const contentRepo = document.getElementById("activeContentRepo");
    const contentEqp = document.getElementById("activeContentEqp");

    if (!tabRepo || !tabEqp) return;

    function updateTabs() {
      if (activeTab === "web") {
        tabRepo.className =
          "flex-1 rounded-sm px-2 py-1.5 text-[10px] font-medium bg-slate-700 text-white shadow-sm transition";
        tabEqp.className =
          "flex-1 rounded-sm px-2 py-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 transition";
        contentRepo.classList.remove("hidden");
        contentEqp.classList.add("hidden");
      } else {
        tabEqp.className =
          "flex-1 rounded-sm px-2 py-1.5 text-[10px] font-medium bg-slate-700 text-white shadow-sm transition";
        tabRepo.className =
          "flex-1 rounded-sm px-2 py-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 transition";
        contentEqp.classList.remove("hidden");
        contentRepo.classList.add("hidden");
      }
    }

    tabRepo.addEventListener("click", () => {
      activeTab = "web";
      updateTabs();
    });
    tabEqp.addEventListener("click", () => {
      activeTab = "eqp";
      updateTabs();
    });
  }

  function renderActiveRowData() {
    const section = document.getElementById("sidebarActiveSection");
    const contentRepo = document.getElementById("activeContentRepo");
    const contentEqp = document.getElementById("activeContentEqp");

    if (!section || !contentRepo || !contentEqp) return;

    if (!state.activeRowId) {
      section.classList.add("hidden");
      return;
    }

    const web = getWeb(state.activeRowId);

    if (!web) {
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");

    const tagsHtml = (web.tags || [])
      .map(
        (t) =>
          `<span class="rounded bg-sky-900/40 px-1.5 py-0.5 text-[10px] text-sky-300">${escapeHtml(t)}</span>`,
      )
      .join("");
    const eqpTagsHtml = (web.dataTags || [])
      .map(
        (t) =>
          `<span class="rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px] text-slate-300">${escapeHtml(t)}</span>`,
      )
      .join("");
    const segments = Array.isArray(web.segments) ? web.segments : [];
    const eqpSegmentsHtml = segments
      .map(
        (segment) => `
            <span class="rounded bg-slate-800 border border-slate-700 px-1.5 py-1 text-[11px] text-slate-300">
                ${escapeHtml(segment)}
            </span>
        `,
      )
      .join("");

    contentRepo.innerHTML = `
            <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tags</p>
                <div class="flex flex-wrap gap-1">${tagsHtml || '<span class="text-xs text-slate-600">—</span>'}</div>
            </div>
        `;

    contentEqp.innerHTML = `
            <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Tags</p>
                <div class="flex flex-wrap gap-1">${eqpTagsHtml || '<span class="text-xs text-slate-600">—</span>'}</div>
            </div>
            <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Segments</p>
                <div class="flex flex-wrap gap-1">${eqpSegmentsHtml || '<span class="text-xs text-slate-600">—</span>'}</div>
            </div>
        `;
  }

  // ============================================================
  // STATS
  // ============================================================

  function updateStats() {
    const webStat = document.getElementById("webStat");
    const tagStat = document.getElementById("tagStat");
    const segmentStat = document.getElementById("segmentStat");

    const tags = new Set();
    const segments = new Set();

    state.webs.forEach((web) => {
      (web.tags || []).forEach((tag) => tags.add(tag));

      getWebSegments(web).forEach((segment) => segments.add(segment));
    });

    if (webStat) webStat.textContent = state.webs.length;
    if (tagStat) tagStat.textContent = tags.size;
    if (segmentStat) segmentStat.textContent = segments.size;
  }

  // ============================================================
  // SELECTION
  // ============================================================

  function wireSelection() {
    document
      .getElementById("clearWebSelection")
      ?.addEventListener("click", clearSelection);

    document
      .getElementById("selectAllWebs")
      ?.addEventListener("change", (event) => {
        currentPageItems().forEach((web) => {
          if (event.target.checked) state.selected.add(Number(web.id));
          else state.selected.delete(Number(web.id));
        });

        render();
      });
  }

  function clearSelection() {
    state.selected.clear();

    render();
  }

  function renderSelectionUI() {
    const bar = document.getElementById("selectionBar");
    const count = document.getElementById("selectedWebCount");
    const list = document.getElementById("selectedWebList");

    const selected = getSelectedWebs();

    if (selected.length) {
      bar?.classList.remove("hidden");
      bar?.classList.add("flex");
    } else {
      bar?.classList.add("hidden");
      bar?.classList.remove("flex");
    }

    if (count) count.textContent = `${selected.length} selected`;

    if (list) {
      list.innerHTML = selected
        .map(
          (web) => `
                <span class="shrink-0 rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] text-cyan-300">
                    ${escapeHtml(web.name)}
                </span>
            `,
        )
        .join("");
    }
  }

  function updateSelectAllState() {
    const selectAll = document.getElementById("selectAllWebs");

    if (!selectAll) return;

    const items = currentPageItems();

    const selectedCount = items.filter((web) =>
      state.selected.has(Number(web.id)),
    ).length;

    selectAll.checked = items.length > 0 && selectedCount === items.length;

    selectAll.indeterminate = selectedCount > 0 && selectedCount < items.length;
  }

  function getSelectedWebs() {
    return state.webs.filter((web) => state.selected.has(Number(web.id)));
  }

  // ============================================================
  // TOOLBAR
  // ============================================================

  function wireToolbar() {
    document.getElementById("webSearch")?.addEventListener("input", (event) => {
      state.search = event.target.value;
      state.page = 1;
      applyFilters();
    });

    document
      .getElementById("crudFilter")
      ?.addEventListener("change", (event) => {
        state.crud = event.target.value;
        state.page = 1;
        applyFilters();
      });

    document
      .getElementById("resetFilters")
      ?.addEventListener("click", resetFilters);

    document
      .getElementById("createWebBtn")
      ?.addEventListener("click", openCreateModal);

    document.getElementById("webPrev")?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page--;
        render();
      }
    });

    document.getElementById("webNext")?.addEventListener("click", () => {
      const totalPages = getTotalPages();
      if (state.page < totalPages) {
        state.page++;
        render();
      }
    });
  }

  function resetFilters() {
    state.search = "";
    state.crud = "all";
    state.tags.clear();
    state.segments.clear();
    state.page = 1;

    const search = document.getElementById("webSearch");
    if (search) search.value = "";

    const crud = document.getElementById("crudFilter");
    if (crud) crud.value = "all";

    applyFilters();
  }

  // ============================================================
  // CREATE
  // ============================================================

  function openCreateModal() {
    openModal(`

            <h2 class="mb-4 text-sm font-semibold text-white">Create Web View</h2>

            <label class="mb-1 block text-[11px] text-slate-500">Folder Name</label>
            <input id="createName" class="mb-3 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-xs outline-none focus:border-cyan-500" placeholder="e.g. Production APIs">

            <label class="mb-1 block text-[11px] text-slate-500">Tags</label>
            <input id="createTags" class="mb-3 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-xs outline-none focus:border-cyan-500" placeholder="api, production, users">

            <label class="mb-1 block text-[11px] text-slate-500">Annotation</label>
            <textarea id="createAnnotation" class="mb-4 h-20 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs outline-none focus:border-cyan-500" placeholder="Websitory description..."></textarea>

            <div class="flex justify-end gap-2">
                <button type="button" data-modal-close class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button id="confirmCreate" type="button" class="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500">Create</button>
            </div>

        `);

    document
      .getElementById("confirmCreate")
      ?.addEventListener("click", createWeb);
  }

  async function createWeb() {
    const name = document.getElementById("createName").value.trim();

    if (!name) {
      showAlert("Folder name is required.");
      return;
    }

    if (
      state.webs.some((web) => web.name.toLowerCase() === name.toLowerCase())
    ) {
      showAlert("A Web View with this name already exists.");
      return;
    }

    try {
      const res = await window.EdmsAPI.createWebview(name);
      if (!res.ok) {
        showAlert("Failed to create Web View via API");
        return;
      }

      const tagsInput = document.getElementById("createTags").value;
      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      for (const t of tags) {
        await window.EdmsAPI.createWebviewTag(t);
      }

      await loadData();

      state.selected.clear();
      state.page = 1;

      closeModal();
      renderSidebar();
      applyFilters();
    } catch (error) {
      console.error(error);
      showAlert("Error creating web view");
    }
  }

  // ============================================================
  // DUPLICATE
  // ============================================================

  function duplicateWeb(id) {
    const source = getWeb(id);

    if (!source) return;

    let copyName = `${source.name} (copy)`;
    let counter = 2;

    while (
      state.webs.some(
        (web) => web.name.toLowerCase() === copyName.toLowerCase(),
      )
    ) {
      copyName = `${source.name} (copy ${counter})`;
      counter++;
    }

    const copy = structuredClone(source);

    copy.id = nextId++;
    copy.name = copyName;
    copy.dateCreated = new Date().toISOString().slice(0, 10);

    state.webs.unshift(copy);
    sizeUnits[copy.id] = "MB";
    state.selected.clear();
    state.page = 1;

    renderSidebar();
    applyFilters();
  }

  // ============================================================
  // DELETE
  // ============================================================

  function openDeleteModal(ids) {
    const webs = ids.map(getWeb).filter(Boolean);

    if (!webs.length) return;

    openModal(`

            <div class="flex items-start gap-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                <div class="mt-0.5 text-rose-400">${iconTrash()}</div>
                <div>
                    <h2 class="text-sm font-semibold text-rose-300">Delete ${webs.length > 1 ? "Web Views" : "Web View"}</h2>
                    <p class="mt-1 text-[11px] text-slate-500">This removes the selected web view(s) from the current prototype session.</p>
                </div>
            </div>

            <div class="my-4 max-h-48 overflow-y-auto rounded-lg border border-slate-800">
                ${webs
                  .map(
                    (web) => `
                    <div class="border-b border-slate-800 px-3 py-2 last:border-0">
                        <p class="font-mono text-xs text-slate-300">${escapeHtml(web.name)}</p>
                    </div>
                `,
                  )
                  .join("")}
            </div>

            <div class="flex justify-end gap-2">
                <button type="button" data-modal-close class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button id="confirmDelete" type="button" class="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500">Delete</button>
            </div>

        `);

    document.getElementById("confirmDelete")?.addEventListener("click", () => {
      deleteWebs(ids);
      closeModal();
    });
  }

  function deleteWebs(ids) {
    const normalizedIds = ids.map(Number);

    state.webs = state.webs.filter(
      (web) => !normalizedIds.includes(Number(web.id)),
    );

    normalizedIds.forEach((id) => state.selected.delete(id));

    renderSidebar();
    applyFilters();
  }

  // ============================================================
  // EDIT NAME / TAGS
  // ============================================================

  function openEditWebModal(id) {
    const web = getWeb(id);

    if (!web) return;

    openModal(`

            <h2 class="mb-4 text-sm font-semibold text-white">Edit Web View</h2>

            <label class="mb-1 block text-[11px] text-slate-500">Folder Name</label>
            <input id="editWebName" value="${escapeAttr(web.name)}" class="mb-3 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-xs outline-none focus:border-cyan-500">

            <label class="mb-1 block text-[11px] text-slate-500">Tags</label>
            <input id="editWebTags" value="${escapeAttr((web.tags || []).join(", "))}" class="mb-4 h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-xs outline-none focus:border-cyan-500">

            <div class="flex justify-end gap-2">
                <button type="button" data-modal-close class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button id="saveWebEdit" type="button" class="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500">Save</button>
            </div>

        `);

    document.getElementById("saveWebEdit")?.addEventListener("click", () => {
      const newName = document.getElementById("editWebName").value.trim();

      if (!newName) {
        showAlert("Folder name is required.");
        return;
      }

      const duplicate = state.webs.some(
        (item) =>
          Number(item.id) !== Number(web.id) &&
          item.name.toLowerCase() === newName.toLowerCase(),
      );

      if (duplicate) {
        showAlert("Folder name must be unique.");
        return;
      }

      web.name = newName;

      web.tags = document
        .getElementById("editWebTags")
        .value.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      closeModal();
      renderSidebar();
      applyFilters();
    });
  }

  // ============================================================
  // ANNOTATION
  // ============================================================

  function openAnnotationModal(id) {
    const web = getWeb(id);

    if (!web) return;

    openModal(`

            <h2 class="mb-4 text-sm font-semibold text-white">Annotation</h2>

            <p class="mb-2 text-[11px] text-slate-500">Markdown annotation</p>

            <textarea id="annotationEditor" class="h-64 w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-300 outline-none focus:border-cyan-500">${escapeHtml(web.annotation || "")}</textarea>

            <div class="mt-4 flex justify-end gap-2">
                <button type="button" data-modal-close class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
                <button id="saveAnnotation" type="button" class="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500">Save</button>
            </div>

        `);

    document.getElementById("saveAnnotation")?.addEventListener("click", () => {
      web.annotation = document.getElementById("annotationEditor").value;

      closeModal();
      render();
    });
  }

  // ============================================================
  // MODAL
  // ============================================================

  function wireModal() {
    const backdrop = document.getElementById("modalBackdrop");

    if (!backdrop) return;

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) closeModal();

      if (event.target.closest("[data-modal-close]")) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !backdrop.classList.contains("hidden")) {
        closeModal();
      }
    });
  }

  function openModal(html) {
    const backdrop = document.getElementById("modalBackdrop");
    const content = document.getElementById("modalContent");

    if (!backdrop || !content) return;

    content.innerHTML = html;

    backdrop.classList.remove("hidden");
    backdrop.classList.add("flex");
  }

  function closeModal() {
    const backdrop = document.getElementById("modalBackdrop");
    const content = document.getElementById("modalContent");

    backdrop?.classList.add("hidden");
    backdrop?.classList.remove("flex");

    if (content) content.innerHTML = "";
  }

  // ============================================================
  // SIZE
  // ============================================================

  function cycleSizeUnit(id) {
    const units = ["B", "KB", "MB", "GB"];

    const current = sizeUnits[id] || "MB";

    const index = units.indexOf(current);

    sizeUnits[id] = units[(index + 1) % units.length];

    renderTable();
  }

  function formatSize(bytes, unit) {
    const value = Number(bytes) || 0;

    switch (unit) {
      case "B":
        return `${value.toFixed(0)} B`;
      case "KB":
        return `${(value / 1024).toFixed(1)} KB`;
      case "GB":
        return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
      case "MB":
      default:
        return `${(value / 1024 / 1024).toFixed(1)} MB`;
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

function getWeb(id) {
    return state.webs.find((web) => Number(web.id) === Number(id));
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value ?? "");
    return div.innerHTML;
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function showAlert(message) {
    window.alert(message);
  }

  function iconTrash() {
    return `
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 7h16"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M6 7l1 13h10l1-13"/>
                <path d="M9 7V4h6v3"/>
            </svg>
        `;
  }

  // ============================================================
  // PREVIEW
  // ============================================================

  function previewWebView(id, options = {}) {
    if (typeof window.previewWebViewPage === "function") {
      const localWeb = getWeb(id);
      const defaultLoadWebView = async (webId) => {
        const targetWeb = getWeb(webId) || localWeb || {};
        const inMemoryContent =
          targetWeb.content ||
          targetWeb.frontpageContent ||
          targetWeb.frontPageContent;
        if (inMemoryContent && typeof inMemoryContent === "object") {
          return { ...targetWeb, content: inMemoryContent };
        }
        try {
          const endpoint = window.WEBVIEW_FRONT_PAGE_API_URL
            ? window.WEBVIEW_FRONT_PAGE_API_URL.replace(
                ":id",
                encodeURIComponent(String(webId))
              )
            : `/api/webviews/${encodeURIComponent(webId)}/frontpage`;
          const res = await fetch(endpoint, {
            headers: { Accept: "application/json" },
          });
          if (res.ok) {
            const payload = await res.json();
            const data = payload && payload.data ? payload.data : payload;
            const doc =
              data.content || data.frontpageContent || data.frontPageContent;
            if (doc && typeof doc === "object") {
              return {
                ...targetWeb,
                ...data,
                content: doc,
                name: targetWeb.name || data.name,
                annotation: targetWeb.annotation || data.annotation,
              };
            }
          }
        } catch (e) {
          console.warn("Could not fetch WebView frontpage content:", e);
        }

        if (targetWeb && targetWeb.name) {
          return {
            ...targetWeb,
            isMock: true,
            content: window.WEBVIEW_PREVIEW_MOCK_DATA?.content,
          };
        }
        throw new Error("No WebView content returned");
      };

      return window.previewWebViewPage(id, {
        loadWebView: options.loadWebView || defaultLoadWebView,
        ...options,
      });
    }

    const web = getWeb(id);
    return web;
  }

  // ============================================================
  // PUBLIC API (consumed by rmbrv.js)
  // ============================================================

  window.WebView = {
    getState: () => state,

    getWeb,

    duplicateWeb,

    openEditWebModal,

    openAnnotationModal,

    openDataTagsModal,

    openCreateModal,

    previewWebView,
  };

  // Expose globally for edit-webview-frontpage.js & preview
  window.getWeb = getWeb;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.showAlert = showAlert;
  window.previewWebView = previewWebView;
  window.openPreviewWebModal = previewWebView;
  window.state = state;
})();
