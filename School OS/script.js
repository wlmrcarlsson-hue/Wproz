const tabButtons = document.querySelectorAll(".tab-btn");
const pages = document.querySelectorAll(".page");
const tabsNav = document.querySelector(".tabs");
const contentEl = document.querySelector("main.content");
const splitContainer = document.getElementById("splitContainer");
const splitPaneHost = document.getElementById("splitPaneHost");
const splitPaneChild = document.getElementById("splitPaneChild");
const splitDivider = document.getElementById("splitDivider");

// ---------- Tab docking (drag one tab onto another to split the view) ----------

const DOCK_STORAGE_KEY = "schoolos-tab-dock";

function loadDockedPairs() {
  const raw = localStorage.getItem(DOCK_STORAGE_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return [];
}

function saveDockedPairs() {
  localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dockedPairs));
}

// Drops pairs naming a tab that no longer exists -- otherwise a stale
// entry left in storage (from the removed GroupDock tab, say) would keep
// hiding a tab button or showing a nested badge for a tab that's gone.
function pruneDockedPairs(pairs) {
  const known = new Set(Array.from(tabButtons).map((btn) => btn.dataset.tab));
  return pairs.filter((p) => known.has(p.host) && known.has(p.child));
}

let dockedPairs = pruneDockedPairs(loadDockedPairs());
let currentActiveTab = document.querySelector(".tab-btn.active")?.dataset.tab || "calendar";
let draggedTabId = null;

function findDockPairByHost(tabId) {
  return dockedPairs.find((p) => p.host === tabId);
}

function findDockPairByChild(tabId) {
  return dockedPairs.find((p) => p.child === tabId);
}

function tabLabelFor(tabId) {
  const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  return btn ? btn.querySelector(".tab-btn-label").textContent : tabId;
}

// Shows, on the host's own nav button, a small nested chip naming whichever
// tab is currently docked inside it -- so the tab bar itself communicates
// the parent/child relationship, not just the split view.
function updateNestedBadges() {
  tabButtons.forEach((btn) => {
    const nestedEl = btn.querySelector(".tab-btn-nested");
    const pair = findDockPairByHost(btn.dataset.tab);
    if (pair) {
      nestedEl.textContent = tabLabelFor(pair.child);
      nestedEl.hidden = false;
    } else {
      nestedEl.hidden = true;
      nestedEl.textContent = "";
    }
  });
}

// Per-tab side effects that used to run only on a direct click (fitting
// the draw canvas view) -- centralized here so they also fire when a tab
// becomes visible as one half of a split, not just on click.
function onTabShown(tabId) {
  // Only runs the deferred fit from selectDoc/fitDrawView finding a still-
  // hidden (zero-sized) wrapper -- once shown, the resize handler and pan/
  // zoom controls take over, so this never re-fits on a later show.
  if (tabId === "mindmap" && pendingDrawFit) {
    const doc = mindmapDocs.find((d) => d.id === currentDocId);
    if (doc && doc.type === "draw") fitDrawView();
  }
}

function renderTabButtonVisibility() {
  tabButtons.forEach((btn) => {
    btn.hidden = dockedPairs.some((p) => p.child === btn.dataset.tab);
  });
  updateNestedBadges();
}

function updateTabButtonActiveStates() {
  const hostPair = findDockPairByHost(currentActiveTab);
  tabButtons.forEach((btn) => {
    const tabId = btn.dataset.tab;
    btn.classList.toggle("active", tabId === currentActiveTab || (!!hostPair && hostPair.child === tabId));
  });
}

// A purely percentage-based clamp (e.g. 20%-80%) is fine on a wide window,
// but on a narrower one (or a small split container) that same percentage
// can squeeze a pane down to an unusably small pixel width -- which is what
// made a dragged-narrow child pane's catalog/cards get cramped and need to
// scroll. Clamping by an actual minimum pixel width scales with whatever
// space is really available, and forces an even 50/50 split when there
// simply isn't room for any asymmetry at all.
function clampSplitRatio(ratio, containerWidth) {
  const minPanePx = 260;
  const minRatio = containerWidth > 0 ? Math.min(0.5, minPanePx / containerWidth) : 0.2;
  const maxRatio = 1 - minRatio;
  return Math.min(maxRatio, Math.max(minRatio, ratio));
}

function returnSplitSectionsHome() {
  document.querySelectorAll(".split-pane .page").forEach((section) => {
    section.classList.remove("split-active");
    contentEl.insertBefore(section, splitContainer.nextSibling);
  });
  splitPaneHost.innerHTML = "";
  splitPaneChild.innerHTML = "";
}

function hideSplitView() {
  if (splitContainer.hidden) return;
  returnSplitSectionsHome();
  splitContainer.hidden = true;
}

function showSplitView(pair) {
  const hostSection = document.getElementById(pair.host);
  const childSection = document.getElementById(pair.child);
  if (!hostSection || !childSection) return;

  returnSplitSectionsHome();
  pages.forEach((page) => page.classList.remove("active"));
  hostSection.classList.add("active", "split-active");
  childSection.classList.add("active", "split-active");

  function buildPaneHandle(tabId) {
    const handle = document.createElement("div");
    handle.className = "split-pane-handle";
    handle.draggable = true;
    handle.title = "Dra till en flik för att byta plats, eller släpp var som helst utanför för att dela upp igen";
    handle.textContent = tabLabelFor(tabId);
    handle.addEventListener("dragstart", (event) => {
      draggedTabId = tabId;
      event.dataTransfer.setData("text/plain", tabId);
      event.dataTransfer.effectAllowed = "move";
    });
    // Dropped somewhere that never called preventDefault() on dragover (i.e.
    // not onto another tab button) -- the browser reports that as an
    // unaccepted drop via dropEffect "none". That's the detach gesture: drag
    // the handle away from the split entirely and let go anywhere else.
    handle.addEventListener("dragend", (event) => {
      if (event.dataTransfer.dropEffect === "none") {
        if (findDockPairByChild(tabId)) undockChild(tabId);
        else if (findDockPairByHost(tabId)) undockPair(tabId);
      }
      draggedTabId = null;
    });
    return handle;
  }

  splitPaneHost.appendChild(buildPaneHandle(pair.host));
  splitPaneHost.appendChild(hostSection);

  splitPaneChild.appendChild(buildPaneHandle(pair.child));
  splitPaneChild.appendChild(childSection);

  splitContainer.hidden = false;

  // Clamp against the container's *actual* current width (only knowable
  // once it's unhidden and laid out), so a ratio dragged to an extreme on a
  // wide screen -- or just stale from before this clamp existed -- can't
  // leave a pane too narrow for its own content on whatever screen it's
  // being shown on now.
  const ratio = clampSplitRatio(pair.ratio || 0.5, splitContainer.getBoundingClientRect().width);
  pair.ratio = ratio;
  splitPaneHost.style.flex = `${ratio} 1 0%`;
  splitPaneChild.style.flex = `${1 - ratio} 1 0%`;

  // Wait a frame so the browser has actually settled the new flex-based pane
  // widths before anything (like the draw canvas) measures its box -- doing
  // it synchronously here can read a not-quite-final size.
  requestAnimationFrame(() => {
    onTabShown(pair.host);
    onTabShown(pair.child);
  });
}

function activateTab(tabId) {
  currentActiveTab = tabId;
  updateTabButtonActiveStates();

  const pair = findDockPairByHost(tabId);
  if (pair) {
    showSplitView(pair);
    return;
  }

  hideSplitView();
  pages.forEach((page) => page.classList.remove("active"));
  const section = document.getElementById(tabId);
  if (section) section.classList.add("active");
  onTabShown(tabId);
}

function dockTabs(hostId, childId) {
  if (hostId === childId) return;
  // Keep it simple: a tab can only be in one dock relationship at a time.
  dockedPairs = dockedPairs.filter(
    (p) => p.host !== hostId && p.child !== hostId && p.host !== childId && p.child !== childId
  );
  dockedPairs.push({ host: hostId, child: childId, ratio: 0.5 });
  saveDockedPairs();
  renderTabButtonVisibility();
  activateTab(hostId);
}

function undockChild(childId) {
  const pair = findDockPairByChild(childId);
  if (!pair) return;
  dockedPairs = dockedPairs.filter((p) => p !== pair);
  saveDockedPairs();
  renderTabButtonVisibility();
  activateTab(childId);
}

// Dragging the host's own handle out dissolves the whole split -- both
// halves become independent top-level tabs again.
function undockPair(hostId) {
  const pair = findDockPairByHost(hostId);
  if (!pair) return;
  dockedPairs = dockedPairs.filter((p) => p !== pair);
  saveDockedPairs();
  renderTabButtonVisibility();
  activateTab(hostId);
}

// ---------- Tab bar reordering (drag one tab to a new position) ----------

const TAB_ORDER_KEY = "schoolos-tab-order";

function loadTabOrder() {
  const raw = localStorage.getItem(TAB_ORDER_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return null;
}

function saveTabOrder() {
  const order = Array.from(tabsNav.querySelectorAll(".tab-btn")).map((btn) => btn.dataset.tab);
  localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order));
}

function applyTabOrder(order) {
  if (!order) return;
  order.forEach((tabId) => {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    if (btn) tabsNav.appendChild(btn);
  });
}

function reorderTab(sourceTab, targetTab, insertAfter) {
  const sourceBtn = document.querySelector(`.tab-btn[data-tab="${sourceTab}"]`);
  const targetBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
  if (!sourceBtn || !targetBtn) return;
  if (insertAfter) targetBtn.after(sourceBtn);
  else targetBtn.before(sourceBtn);
  saveTabOrder();
}

function clearDragSlotClasses() {
  tabButtons.forEach((b) => b.classList.remove("drag-over", "drag-slot-before", "drag-slot-after"));
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));

  button.addEventListener("dragstart", (event) => {
    draggedTabId = button.dataset.tab;
    event.dataTransfer.setData("text/plain", button.dataset.tab);
    event.dataTransfer.effectAllowed = "move";
  });

  button.addEventListener("dragend", () => {
    draggedTabId = null;
    clearDragSlotClasses();
  });

  // The middle ~50% of a tab is a docking slot (drop to combine); the outer
  // ~25% on each side is a reordering slot (drop to insert there instead) --
  // it opens a visible gap so it reads as a slot, not just a highlight.
  button.addEventListener("dragover", (event) => {
    if (!draggedTabId || draggedTabId === button.dataset.tab) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const rect = button.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const edgeZone = rect.width * 0.25;

    button.classList.remove("drag-over", "drag-slot-before", "drag-slot-after");
    if (offsetX < edgeZone) {
      button.classList.add("drag-slot-before");
    } else if (offsetX > rect.width - edgeZone) {
      button.classList.add("drag-slot-after");
    } else {
      button.classList.add("drag-over");
    }
  });

  button.addEventListener("dragleave", () => {
    button.classList.remove("drag-over", "drag-slot-before", "drag-slot-after");
  });

  button.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();

    const wasSlotBefore = button.classList.contains("drag-slot-before");
    const wasSlotAfter = button.classList.contains("drag-slot-after");
    clearDragSlotClasses();

    const sourceTab = event.dataTransfer.getData("text/plain") || draggedTabId;
    const targetTab = button.dataset.tab;
    if (sourceTab && sourceTab !== targetTab) {
      if (wasSlotBefore || wasSlotAfter) reorderTab(sourceTab, targetTab, wasSlotAfter);
      else dockTabs(targetTab, sourceTab);
    }
    draggedTabId = null;
  });
});

applyTabOrder(loadTabOrder());

// Detaching a docked pane is handled entirely by its handle's own "dragend"
// (see buildPaneHandle): dropped on a tab button -> redocks there; dropped
// anywhere else on the page -> nothing calls preventDefault() on that spot,
// so the browser reports dropEffect "none" and the handle detaches itself.
// tabsNav deliberately has no drop handling of its own, so blank space in
// the tab bar counts as "anywhere else" too.

let resizingSplit = false;

splitDivider.addEventListener("pointerdown", (event) => {
  resizingSplit = true;
  splitDivider.classList.add("active");
  splitDivider.setPointerCapture(event.pointerId);
});

splitDivider.addEventListener("pointermove", (event) => {
  if (!resizingSplit) return;
  const pair = findDockPairByHost(currentActiveTab);
  if (!pair) return;
  const containerRect = splitContainer.getBoundingClientRect();
  let ratio = (event.clientX - containerRect.left) / containerRect.width;
  ratio = clampSplitRatio(ratio, containerRect.width);
  pair.ratio = ratio;
  splitPaneHost.style.flex = `${ratio} 1 0%`;
  splitPaneChild.style.flex = `${1 - ratio} 1 0%`;
});

splitDivider.addEventListener("pointerup", () => {
  if (!resizingSplit) return;
  resizingSplit = false;
  splitDivider.classList.remove("active");
  saveDockedPairs();
});

renderTabButtonVisibility();

// ---------- Uppgifter (assignments subject filter) ----------

const assignmentsCatalog = document.getElementById("assignmentsCatalog");
const assignmentsRows = document.querySelectorAll("#assignmentsBody tr");
const assignmentsEmpty = document.getElementById("assignmentsEmpty");

assignmentsCatalog.querySelectorAll("li").forEach((li) => {
  li.addEventListener("click", () => {
    assignmentsCatalog.querySelectorAll("li").forEach((el) => el.classList.remove("active"));
    li.classList.add("active");

    const subject = li.dataset.subject;
    let visibleCount = 0;
    assignmentsRows.forEach((tr) => {
      const matches = !subject || tr.dataset.subject === subject;
      tr.hidden = !matches;
      if (matches) visibleCount++;
    });
    assignmentsEmpty.hidden = visibleCount > 0;
  });
});

// ---------- Theme settings (color wheel) ----------

const THEME_STORAGE_KEY = "schoolos-theme";
const DEFAULT_THEME = { hue: 224, sat: 63 };

const settingsBtn = document.getElementById("settingsBtn");
const themePanel = document.getElementById("themePanel");
const closeThemeBtn = document.getElementById("closeTheme");
const resetThemeBtn = document.getElementById("resetTheme");
const wheel = document.getElementById("colorWheel");
const wheelCtx = wheel.getContext("2d");
const themeSwatch = document.getElementById("themeSwatch");
const themeLabel = document.getElementById("themeLabel");

const wheelSize = wheel.width;
const wheelRadius = wheelSize / 2;

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

function drawWheel() {
  const image = wheelCtx.createImageData(wheelSize, wheelSize);

  for (let y = 0; y < wheelSize; y++) {
    for (let x = 0; x < wheelSize; x++) {
      const dx = x - wheelRadius;
      const dy = y - wheelRadius;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const i = (y * wheelSize + x) * 4;

      if (dist <= wheelRadius) {
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle < 0) angle += 360;
        const sat = Math.min(dist / wheelRadius, 1) * 100;
        const [r, g, b] = hslToRgb(angle, sat, 55);
        image.data[i] = r;
        image.data[i + 1] = g;
        image.data[i + 2] = b;
        image.data[i + 3] = 255;
      } else {
        image.data[i + 3] = 0;
      }
    }
  }

  wheelCtx.putImageData(image, 0, 0);
}

function drawIndicator(hue, sat) {
  drawWheel();

  const angle = (hue * Math.PI) / 180;
  const dist = (sat / 100) * wheelRadius;
  const x = wheelRadius + Math.cos(angle) * dist;
  const y = wheelRadius + Math.sin(angle) * dist;

  wheelCtx.beginPath();
  wheelCtx.arc(x, y, 7, 0, Math.PI * 2);
  wheelCtx.strokeStyle = "#ffffff";
  wheelCtx.lineWidth = 2;
  wheelCtx.stroke();
}

function applyTheme(hue, sat) {
  document.documentElement.style.setProperty("--hue", hue);
  document.documentElement.style.setProperty("--sat", `${sat}%`);
  themeSwatch.style.background = `hsl(${Math.round(hue)}, ${Math.round(sat)}%, 55%)`;
  themeLabel.textContent = `hsl(${Math.round(hue)}, ${Math.round(sat)}%, 55%)`;
  drawIndicator(hue, sat);
}

function saveTheme(hue, sat) {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ hue, sat }));
}

function loadTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY));
    if (saved && Number.isFinite(saved.hue) && Number.isFinite(saved.sat)) {
      return saved;
    }
  } catch (e) {
    // ignore malformed storage, fall back to default
  }
  return DEFAULT_THEME;
}

function pickColorFromEvent(event) {
  const rect = wheel.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const dx = x - wheelRadius;
  const dy = y - wheelRadius;
  const dist = Math.min(Math.sqrt(dx * dx + dy * dy), wheelRadius);

  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  const sat = (dist / wheelRadius) * 100;

  applyTheme(angle, sat);
  saveTheme(angle, sat);
}

let isDragging = false;

wheel.addEventListener("pointerdown", (event) => {
  isDragging = true;
  wheel.setPointerCapture(event.pointerId);
  pickColorFromEvent(event);
});

wheel.addEventListener("pointermove", (event) => {
  if (isDragging) pickColorFromEvent(event);
});

wheel.addEventListener("pointerup", () => {
  isDragging = false;
});

settingsBtn.addEventListener("click", () => {
  themePanel.hidden = !themePanel.hidden;
});

closeThemeBtn.addEventListener("click", () => {
  themePanel.hidden = true;
});

resetThemeBtn.addEventListener("click", () => {
  applyTheme(DEFAULT_THEME.hue, DEFAULT_THEME.sat);
  localStorage.removeItem(THEME_STORAGE_KEY);
});

document.addEventListener("click", (event) => {
  const clickedInsidePanel = themePanel.contains(event.target);
  const clickedButton = settingsBtn.contains(event.target);
  if (!clickedInsidePanel && !clickedButton) {
    themePanel.hidden = true;
  }
});

const initialTheme = loadTheme();
applyTheme(initialTheme.hue, initialTheme.sat);

// ---------- Delete warnings (shared by groups/docs/drawings) ----------

const DELETE_WARNINGS_KEY = "schoolos-delete-warnings";
const DEFAULT_DELETE_WARNINGS = { groups: true, docs: true, drawings: true };

const warnGroupsCheckbox = document.getElementById("warnGroups");
const warnDocsCheckbox = document.getElementById("warnDocs");
const warnDrawingsCheckbox = document.getElementById("warnDrawings");

function loadDeleteWarnings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DELETE_WARNINGS_KEY));
    if (parsed && typeof parsed === "object") {
      return { ...DEFAULT_DELETE_WARNINGS, ...parsed };
    }
  } catch (e) {
    // ignore malformed storage
  }
  return { ...DEFAULT_DELETE_WARNINGS };
}

let deleteWarnings = loadDeleteWarnings();

function saveDeleteWarnings() {
  localStorage.setItem(DELETE_WARNINGS_KEY, JSON.stringify(deleteWarnings));
}

function syncDeleteWarningToggles() {
  warnGroupsCheckbox.checked = deleteWarnings.groups;
  warnDocsCheckbox.checked = deleteWarnings.docs;
  warnDrawingsCheckbox.checked = deleteWarnings.drawings;
}

function setDeleteWarning(category, value) {
  deleteWarnings[category] = value;
  saveDeleteWarnings();
  syncDeleteWarningToggles();
}

warnGroupsCheckbox.addEventListener("change", () => setDeleteWarning("groups", warnGroupsCheckbox.checked));
warnDocsCheckbox.addEventListener("change", () => setDeleteWarning("docs", warnDocsCheckbox.checked));
warnDrawingsCheckbox.addEventListener("change", () => setDeleteWarning("drawings", warnDrawingsCheckbox.checked));

syncDeleteWarningToggles();

// A small "X" that turns into an inline confirm (Radera / Fråga inte
// igen) instead of a native confirm() dialog -- same reasoning as
// armConfirm(): native dialogs are blocked in some sandboxed previews.
// "Fråga inte igen" both deletes now AND remembers the choice in
// Settings, so it stays in sync with the checkboxes there.
function createDeleteControl({ category, compact, onDelete }) {
  const wrap = document.createElement("span");
  wrap.className = compact ? "delete-control delete-control-compact" : "delete-control";
  let revertTimer = null;

  function renderIdle() {
    clearTimeout(revertTimer);
    wrap.innerHTML = "";
    const xBtn = document.createElement("button");
    xBtn.type = "button";
    xBtn.className = "delete-x-btn";
    xBtn.textContent = "✕";
    xBtn.title = "Ta bort";
    xBtn.setAttribute("aria-label", "Ta bort");
    xBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!deleteWarnings[category]) {
        onDelete();
        return;
      }
      renderConfirm();
    });
    wrap.appendChild(xBtn);
  }

  function renderConfirm() {
    clearTimeout(revertTimer);
    wrap.innerHTML = "";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "delete-confirm-btn";
    confirmBtn.textContent = compact ? "✓" : "Radera";
    confirmBtn.title = "Bekräfta radering";
    confirmBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      clearTimeout(revertTimer);
      onDelete();
    });

    const dontAskBtn = document.createElement("button");
    dontAskBtn.type = "button";
    dontAskBtn.className = "delete-dontask-btn";
    dontAskBtn.textContent = compact ? "🔕" : "Fråga inte igen";
    dontAskBtn.title = "Radera och fråga inte igen för den här typen";
    dontAskBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      clearTimeout(revertTimer);
      setDeleteWarning(category, false);
      onDelete();
    });

    wrap.appendChild(confirmBtn);
    wrap.appendChild(dontAskBtn);
    revertTimer = setTimeout(renderIdle, 4000);
  }

  renderIdle();
  return wrap;
}

// ---------- Mindmap (documents: text notes + drawings, in groups) ----------

const MINDMAP_STORAGE_KEY = "schoolos-mindmap-docs";
const GROUPS_STORAGE_KEY = "schoolos-mindmap-groups";
const UNGROUPED_COLLAPSED_KEY = "schoolos-ungrouped-collapsed";

const SUBJECTS = ["Matematik 2b", "Svenska 3", "Engelska 6", "Fysik 2", "Historia 1b", "Programmering 1"];

const DEFAULT_GROUPS = [{ id: "grp-math", name: "Matematik 2b", collapsed: false, subject: "Matematik 2b" }];
const DEFAULT_DOCS = [
  {
    id: "seed-1",
    title: "Idéer inför nationella prov",
    type: "text",
    content: "Saker att öva på:<br>- Ekvationer med två okända<br>- Källkritik i historia<br>- Oregelbundna verb i engelska",
    groupId: "grp-math",
    subject: "Matematik 2b",
    updatedAt: Date.now(),
  },
  {
    id: "seed-2",
    title: "Formelblad",
    type: "draw",
    content: "",
    groupId: "grp-math",
    subject: "Matematik 2b",
    updatedAt: Date.now(),
  },
];

const docList = document.getElementById("docList");
const newDocBtn = document.getElementById("newDocBtn");
const newDocForm = document.getElementById("newDocForm");
const newDocInput = document.getElementById("newDocInput");
const newDocSubject = document.getElementById("newDocSubject");
const newDocType = document.getElementById("newDocType");
const confirmNewDocBtn = document.getElementById("confirmNewDocBtn");
const docToolbar = document.getElementById("docToolbar");
const docTitleInput = document.getElementById("docTitleInput");
const deleteDocBtn = document.getElementById("deleteDocBtn");
const textEditor = document.getElementById("textEditor");
const textToolbar = document.getElementById("textToolbar");
const textFormatSelect = document.getElementById("textFormatSelect");
const textSizeSelect = document.getElementById("textSizeSelect");
const textColorInput = document.getElementById("textColorInput");
const textToolBtns = document.querySelectorAll(".text-tool-btn[data-cmd]");
const drawArea = document.getElementById("drawArea");
const drawCanvasWrap = document.getElementById("drawCanvasWrap");
const drawCanvas = document.getElementById("drawCanvas");
const drawCtx = drawCanvas.getContext("2d");

// The draw canvas bitmap is a fixed resolution sized to whatever this
// screen could ever show -- computed once, here, and only ever changed
// again by an explicit user action (loading a different doc, or that doc's
// own saved orientation -- see drawCanvasSizeFor/setDrawOrientation).
// Previously the bitmap was resized (and its content stretched into the
// new size) every time its wrapper changed size, which both distorted the
// drawing and drifted the cursor/stroke alignment a little further out of
// sync with every resize. Now the wrapper only ever clips a pan/zoomed
// *view* onto this fixed canvas (see applyDrawTransform), so resizing the
// window/tab/split just reveals more or less of the same canvas.
const CANVAS_NATIVE_WIDTH = Math.max(1600, Math.min(3200, Math.round(window.screen.width || 1920)));
const CANVAS_NATIVE_HEIGHT = Math.max(1000, Math.min(2000, Math.round(window.screen.height || 1080)));
drawCanvas.width = CANVAS_NATIVE_WIDTH;
drawCanvas.height = CANVAS_NATIVE_HEIGHT;

const penColorBtn = document.getElementById("penColorBtn");
const penColorSwatch = document.getElementById("penColorSwatch");
const bgColorBtn = document.getElementById("bgColorBtn");
const bgColorSwatch = document.getElementById("bgColorSwatch");
const colorPickerPopover = document.getElementById("colorPickerPopover");
const colorPickerInput = document.getElementById("colorPickerInput");
const eyedropperBtn = document.getElementById("eyedropperBtn");
const colorPickerRecent = document.getElementById("colorPickerRecent");
const colorPickerCancelBtn = document.getElementById("colorPickerCancelBtn");
const colorPickerApplyBtn = document.getElementById("colorPickerApplyBtn");
const brushSizeInput = document.getElementById("brushSize");
const eraserBtn = document.getElementById("eraserBtn");
const bucketBtn = document.getElementById("bucketBtn");
const panBtn = document.getElementById("panBtn");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");
const undoDrawBtn = document.getElementById("undoDrawBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const fitViewBtn = document.getElementById("fitViewBtn");
const orientationBtn = document.getElementById("orientationBtn");
const dragGuardOverlay = document.getElementById("dragGuardOverlay");
const brushCursor = document.getElementById("brushCursor");
const mindmapEmpty = document.getElementById("mindmapEmpty");
const groupList = document.getElementById("groupList");
const newGroupBtn = document.getElementById("newGroupBtn");
const newGroupForm = document.getElementById("newGroupForm");
const newGroupInput = document.getElementById("newGroupInput");
const newGroupSubject = document.getElementById("newGroupSubject");
const confirmNewGroupBtn = document.getElementById("confirmNewGroupBtn");
const newDocGroup = document.getElementById("newDocGroup");
const groupView = document.getElementById("groupView");
const groupViewIntro = document.getElementById("groupViewIntro");
const groupViewList = document.getElementById("groupViewList");
const scheduleSubjects = document.getElementById("scheduleSubjects");
const appModalOverlay = document.getElementById("appModalOverlay");
const appModalTitle = document.getElementById("appModalTitle");
const appModalMessage = document.getElementById("appModalMessage");
const appModalOkBtn = document.getElementById("appModalOkBtn");

function showAppModal(title, message) {
  appModalTitle.textContent = title;
  appModalMessage.textContent = message;
  appModalOverlay.hidden = false;
}

appModalOkBtn.addEventListener("click", () => {
  appModalOverlay.hidden = true;
});
appModalOverlay.addEventListener("click", (event) => {
  if (event.target === appModalOverlay) appModalOverlay.hidden = true;
});

// ---------- Teachers ----------

const TEACHERS = [
  { id: "t1", name: "Anna Berg", subject: "Matematik 2b", color: "#4361ee" },
  { id: "t2", name: "Erik Lindqvist", subject: "Fysik 2", color: "#e63946" },
  { id: "t3", name: "Maria Söderström", subject: "Svenska 3", color: "#2a9d8f" },
  { id: "t4", name: "Johan Ekström", subject: "Historia 1b", color: "#f4a261" },
  { id: "t5", name: "Sara Nilsson", subject: "Engelska 6", color: "#8b5cf6" },
  { id: "t6", name: "David Karlsson", subject: "Programmering 1", color: "#06b6d4" },
];

const CHAT_STORAGE_PREFIX = "schoolos-chat-";
const TEACHER_REPLIES = [
  "Tack för ditt meddelande! Jag återkommer så snart jag kan.",
  "Bra fråga, det tar vi upp på nästa lektion.",
  "Noterat, jag kollar på det innan imorgon.",
  "Låter bra, hör av dig om du undrar något mer!",
];

const teachersGrid = document.getElementById("teachersGrid");
const teachersListView = document.getElementById("teachersListView");
const teacherChatView = document.getElementById("teacherChatView");
const teachersBreadcrumb = document.getElementById("teachersBreadcrumb");
const chatTeacherAvatar = document.getElementById("chatTeacherAvatar");
const chatTeacherName = document.getElementById("chatTeacherName");
const chatTeacherSubject = document.getElementById("chatTeacherSubject");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const sendDocBtn = document.getElementById("sendDocBtn");
const sendDocPopover = document.getElementById("sendDocPopover");
const sendDocTeacherList = document.getElementById("sendDocTeacherList");
const sendDocCancelBtn = document.getElementById("sendDocCancelBtn");
const sendDocNote = document.getElementById("sendDocNote");
const sendDocStepTeacher = document.getElementById("sendDocStepTeacher");
const sendDocStepNote = document.getElementById("sendDocStepNote");
const sendDocRecipient = document.getElementById("sendDocRecipient");
const sendDocBackBtn = document.getElementById("sendDocBackBtn");
const sendDocConfirmBtn = document.getElementById("sendDocConfirmBtn");

// Which teacher the note step is composing for.
let pendingSendTeacherId = null;

let activeTeacherId = null;

function teacherInitials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0] ? parts[0][0] : "") + (parts[parts.length - 1] ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function loadChatMessages(teacherId) {
  const raw = localStorage.getItem(CHAT_STORAGE_PREFIX + teacherId);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return [];
}

function saveChatMessages(teacherId, messages) {
  localStorage.setItem(CHAT_STORAGE_PREFIX + teacherId, JSON.stringify(messages));
}

function renderTeachers() {
  teachersGrid.innerHTML = "";
  TEACHERS.forEach((teacher) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "teacher-card";

    const avatar = document.createElement("span");
    avatar.className = "teacher-avatar";
    avatar.style.background = teacher.color;
    avatar.textContent = teacherInitials(teacher.name);

    const body = document.createElement("span");
    body.className = "teacher-card-body";
    const nameEl = document.createElement("span");
    nameEl.className = "teacher-card-name";
    nameEl.textContent = teacher.name;
    const subjectEl = document.createElement("span");
    subjectEl.className = "teacher-card-subject muted";
    subjectEl.textContent = teacher.subject;
    body.appendChild(nameEl);
    body.appendChild(subjectEl);

    card.appendChild(avatar);
    card.appendChild(body);
    card.addEventListener("click", () => openTeacherChat(teacher.id));
    teachersGrid.appendChild(card);
  });
}

function docTypeLabel(type) {
  return type === "draw" ? "Ritning" : "Dokument";
}

// A shared document is stored in the chat as a reference to the document
// rather than a copy of its contents -- a drawing's PNG would bloat
// localStorage badly, and a reference means the teacher's card always
// opens the current version. The title is stored alongside it so the card
// still reads sensibly if the document is later deleted.
function buildDocMessageBubble(msg) {
  const doc = mindmapDocs.find((d) => d.id === msg.docId);

  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = `chat-message chat-message-doc ${
    msg.from === "user" ? "chat-message-user" : "chat-message-teacher"
  }`;

  const icon = document.createElement("span");
  icon.className = "chat-message-doc-icon";
  icon.textContent = msg.docType === "draw" ? "🎨" : "📝";

  const body = document.createElement("span");
  body.className = "chat-message-doc-body";

  const name = document.createElement("span");
  name.className = "chat-message-doc-name";
  name.textContent = doc ? doc.title : msg.docTitle;

  const meta = document.createElement("span");
  meta.className = "chat-message-doc-meta";
  meta.textContent = doc ? `${docTypeLabel(msg.docType)} · Öppna` : "Dokumentet finns inte längre";

  body.appendChild(name);
  body.appendChild(meta);
  bubble.appendChild(icon);
  bubble.appendChild(body);

  if (doc) {
    bubble.addEventListener("click", () => goToMindmapDoc(doc.id));
  } else {
    bubble.classList.add("is-missing");
    bubble.disabled = true;
  }

  return bubble;
}

function renderChatMessages(teacherId) {
  chatMessages.innerHTML = "";
  loadChatMessages(teacherId).forEach((msg) => {
    if (msg.kind === "doc") {
      chatMessages.appendChild(buildDocMessageBubble(msg));
      return;
    }
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${msg.from === "user" ? "chat-message-user" : "chat-message-teacher"}`;
    bubble.textContent = msg.text;
    chatMessages.appendChild(bubble);
  });
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderTeachersBreadcrumb() {
  teachersBreadcrumb.innerHTML = "";

  const listItem = document.createElement("li");
  listItem.textContent = "🗂 Lärare";
  listItem.className = activeTeacherId ? "" : "active";
  listItem.addEventListener("click", closeTeacherChat);
  teachersBreadcrumb.appendChild(listItem);

  if (activeTeacherId) {
    const teacher = TEACHERS.find((t) => t.id === activeTeacherId);
    if (teacher) {
      const chatItem = document.createElement("li");
      chatItem.textContent = teacher.name;
      chatItem.className = "active";
      teachersBreadcrumb.appendChild(chatItem);
    }
  }
}

function openTeacherChat(teacherId) {
  const teacher = TEACHERS.find((t) => t.id === teacherId);
  if (!teacher) return;

  activeTeacherId = teacherId;
  teachersListView.hidden = true;
  teacherChatView.hidden = false;

  chatTeacherAvatar.style.background = teacher.color;
  chatTeacherAvatar.textContent = teacherInitials(teacher.name);
  chatTeacherName.textContent = teacher.name;
  chatTeacherSubject.textContent = teacher.subject;

  renderChatMessages(teacherId);
  renderTeachersBreadcrumb();
  chatInput.value = "";
  chatInput.focus();
}

function closeTeacherChat() {
  activeTeacherId = null;
  teacherChatView.hidden = true;
  teachersListView.hidden = false;
  renderTeachersBreadcrumb();
}

function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text || !activeTeacherId) return;

  const messages = loadChatMessages(activeTeacherId);
  messages.push({ from: "user", text, at: Date.now() });
  saveChatMessages(activeTeacherId, messages);
  chatInput.value = "";
  renderChatMessages(activeTeacherId);

  const teacherId = activeTeacherId;
  setTimeout(() => {
    const reply = TEACHER_REPLIES[Math.floor(Math.random() * TEACHER_REPLIES.length)];
    const current = loadChatMessages(teacherId);
    current.push({ from: "teacher", text: reply, at: Date.now() });
    saveChatMessages(teacherId, current);
    if (activeTeacherId === teacherId) renderChatMessages(teacherId);
  }, 900);
}

chatSendBtn.addEventListener("click", sendChatMessage);
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendChatMessage();
});

// ---------- Sending a Mindmap document to a teacher ----------

const DOC_RECEIPT_REPLIES = [
  "Tack, jag har fått dokumentet! Jag tittar på det och återkommer.",
  "Mottaget! Jag läser igenom det och ger dig feedback.",
  "Tack för att du skickade in det, jag kikar på det snart.",
];

function closeSendDocPopover() {
  sendDocPopover.hidden = true;
}

function showSendDocTeacherStep() {
  pendingSendTeacherId = null;
  sendDocStepNote.hidden = true;
  sendDocStepTeacher.hidden = false;
}

// Second step: pick the recipient first, then write the note that goes
// with the document.
function showSendDocNoteStep(teacherId) {
  const teacher = TEACHERS.find((t) => t.id === teacherId);
  if (!teacher) return;

  pendingSendTeacherId = teacherId;
  sendDocRecipient.textContent = `Till ${teacher.name} · ${teacher.subject}`;
  sendDocStepTeacher.hidden = true;
  sendDocStepNote.hidden = false;
  sendDocNote.focus();
}

function openSendDocPopover() {
  sendDocTeacherList.innerHTML = "";
  sendDocNote.value = "";
  showSendDocTeacherStep();

  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc) return;

  // A document with a subject suggests its own teacher, so the one most
  // likely to be wanted is offered first -- the rest still follow.
  const ordered = [...TEACHERS].sort((a, b) => {
    const aMatch = doc.subject && a.subject === doc.subject ? 0 : 1;
    const bMatch = doc.subject && b.subject === doc.subject ? 0 : 1;
    return aMatch - bMatch;
  });

  ordered.forEach((teacher) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "send-doc-teacher";

    const avatar = document.createElement("span");
    avatar.className = "teacher-avatar";
    avatar.style.background = teacher.color;
    avatar.textContent = teacherInitials(teacher.name);

    const body = document.createElement("span");
    body.className = "send-doc-teacher-body";
    const name = document.createElement("span");
    name.className = "send-doc-teacher-name";
    name.textContent = teacher.name;
    const subject = document.createElement("span");
    subject.className = "send-doc-teacher-subject";
    subject.textContent = teacher.subject;
    body.appendChild(name);
    body.appendChild(subject);

    btn.appendChild(avatar);
    btn.appendChild(body);
    btn.addEventListener("click", () => showSendDocNoteStep(teacher.id));
    sendDocTeacherList.appendChild(btn);
  });

  sendDocPopover.hidden = false;
}

function sendDocToTeacher(teacherId) {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  const teacher = TEACHERS.find((t) => t.id === teacherId);
  if (!doc || !teacher) return;

  const note = sendDocNote.value.trim();
  const messages = loadChatMessages(teacherId);

  // The note goes in as an ordinary message just before the document, so
  // the chat reads the way it would if you had typed it and attached the
  // file: your words first, then the thing they refer to.
  if (note) messages.push({ from: "user", text: note, at: Date.now() });

  messages.push({
    from: "user",
    kind: "doc",
    docId: doc.id,
    docTitle: doc.title,
    docType: doc.type,
    at: Date.now(),
  });
  saveChatMessages(teacherId, messages);
  closeSendDocPopover();

  // Keep the chat live if it happens to be open in the other half of a
  // split view while the document is sent from Mindmap.
  if (activeTeacherId === teacherId) renderChatMessages(teacherId);

  setTimeout(() => {
    const reply = DOC_RECEIPT_REPLIES[Math.floor(Math.random() * DOC_RECEIPT_REPLIES.length)];
    const current = loadChatMessages(teacherId);
    current.push({ from: "teacher", text: reply, at: Date.now() });
    saveChatMessages(teacherId, current);
    if (activeTeacherId === teacherId) renderChatMessages(teacherId);
  }, 900);

  showAppModal(
    "Dokumentet är skickat",
    `"${doc.title}"${note ? " och ditt meddelande" : ""} har skickats till ${teacher.name}. Du hittar det i chatten under Lärare.`
  );
}

sendDocBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  if (sendDocPopover.hidden) {
    openSendDocPopover();
  } else {
    closeSendDocPopover();
  }
});

sendDocCancelBtn.addEventListener("click", closeSendDocPopover);
sendDocBackBtn.addEventListener("click", showSendDocTeacherStep);
sendDocConfirmBtn.addEventListener("click", () => {
  if (pendingSendTeacherId) sendDocToTeacher(pendingSendTeacherId);
});

// Enter alone makes a new line in the note, so ctrl/cmd+Enter sends --
// the usual shortcut for a multi-line compose box.
sendDocNote.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && pendingSendTeacherId) {
    event.preventDefault();
    sendDocToTeacher(pendingSendTeacherId);
  }
});

// Clicking anywhere outside dismisses the picker, the same way the
// pen/background color popover behaves.
document.addEventListener("click", (event) => {
  if (sendDocPopover.hidden) return;
  if (sendDocPopover.contains(event.target) || sendDocBtn.contains(event.target)) return;
  closeSendDocPopover();
});

// ---------- Subject library ----------

const SUBJECT_COLORS = ["#4361ee", "#e63946", "#2a9d8f", "#f4a261", "#8b5cf6", "#06b6d4"];

// Each book carries its own metadata and chapter outline so the library
// is something you can actually open and read through, not just a title
// and an author on a card.
const SUBJECT_LIBRARY = {
  "Matematik 2b": [
    {
      title: "Matematik 5000 Kurs 2b",
      author: "Lena Alfredsson m.fl.",
      publisher: "Natur & Kultur",
      year: 2012,
      pages: 344,
      isbn: "978-91-27-42596-3",
      description:
        "Kursboken som följer ämnesplanen för Matematik 2b, med genomgångar, lösta typexempel och nivåindelade uppgifter.",
      chapters: [
        {
          title: "Algebra och linjära modeller",
          summary:
            "Repetition av algebraisk förenkling och hur räta linjer används för att beskriva verkliga samband.",
          points: [
            "Förenkla uttryck och lösa linjära ekvationer",
            "Räta linjens ekvation y = kx + m",
            "Linjära ekvationssystem: substitution och addition",
          ],
        },
        {
          title: "Andragradsekvationer",
          summary:
            "Andragradsuttryck, nollställen och hur en parabel hänger ihop med sin ekvation.",
          points: [
            "Kvadratkomplettering steg för steg",
            "pq-formeln och när den kan användas",
            "Tolka diskriminanten: två, en eller inga reella rötter",
          ],
        },
        {
          title: "Geometri och trigonometri",
          summary:
            "Likformighet, Pythagoras sats och de trigonometriska förhållandena i rätvinkliga trianglar.",
          points: [
            "Likformiga trianglar och skala",
            "sin, cos och tan i rätvinklig triangel",
            "Bevis och geometriska resonemang",
          ],
        },
        {
          title: "Statistik",
          summary:
            "Att sammanfatta, beskriva och kritiskt granska datamaterial.",
          points: [
            "Lägesmått: medelvärde, median och typvärde",
            "Spridningsmått och standardavvikelse",
            "Vilseledande diagram och hur man upptäcker dem",
          ],
        },
        {
          title: "Repetition och provträning",
          summary:
            "Blandade uppgifter i nationell provform med bedömningsanvisningar.",
          points: [
            "Uppgifter utan digitala verktyg",
            "Längre resonemangsuppgifter",
            "Checklista inför provet",
          ],
        },
      ],
    },
    {
      title: "Origo Matematik 2b",
      author: "Sanoma Utbildning",
      publisher: "Sanoma Utbildning",
      year: 2019,
      pages: 312,
      isbn: "978-91-523-5471-0",
      description:
        "Läromedel med tydlig progression, digitala genomgångar och gott om verklighetsnära problem.",
      chapters: [
        {
          title: "Räta linjens ekvation",
          summary: "Från tabell och graf till formel, och tillbaka igen.",
          points: [
            "Tolka k och m grafiskt",
            "Parallella och vinkelräta linjer",
            "Linjär regression på riktiga mätdata",
          ],
        },
        {
          title: "Polynom och andragradsfunktioner",
          summary:
            "Hur andragradsfunktioner byggs upp och vad symmetrilinjen betyder.",
          points: [
            "Faktorisering och nollproduktmetoden",
            "Symmetrilinje och extrempunkt",
            "Optimeringsproblem i vardagen",
          ],
        },
        {
          title: "Klassisk geometri",
          summary:
            "Satser, bevis och det logiska språk som geometrin vilar på.",
          points: [
            "Randvinkelsatsen och Thales sats",
            "Kongruens och likformighet",
            "Att skriva ett fullständigt bevis",
          ],
        },
        {
          title: "Sannolikhet och statistik",
          summary:
            "Beräkna sannolikheter och tolka statistik med källkritisk blick.",
          points: [
            "Träddiagram och komplementhändelser",
            "Beroende och oberoende händelser",
            "Normalfördelningens form och användning",
          ],
        },
      ],
    },
  ],
  "Svenska 3": [
    {
      title: "Svenska Impulser 3",
      author: "Carl-Johan Markstedt & Sven Eriksson",
      publisher: "Sanoma Utbildning",
      year: 2013,
      pages: 400,
      isbn: "978-91-523-1057-0",
      description:
        "Bok för Svenska 3 med fokus på retorik, vetenskapligt skrivande och litteraturhistoria.",
      chapters: [
        {
          title: "Retorik och muntlig framställning",
          summary:
            "Den klassiska retorikens verktyg tillämpade på moderna tal och presentationer.",
          points: [
            "Retorikens partesmodell från idé till framförande",
            "Ethos, logos och pathos",
            "Disposition, röst och kroppsspråk",
          ],
        },
        {
          title: "Vetenskapligt skrivande",
          summary:
            "Hur en utredande text byggs upp och hur källor hanteras korrekt.",
          points: [
            "Syfte, frågeställning och avgränsning",
            "Referatteknik och citatregler",
            "Källförteckning och referenssystem",
          ],
        },
        {
          title: "Litteraturhistoria: antiken till romantiken",
          summary:
            "De epoker och verk som format den västerländska litteraturen.",
          points: [
            "Antikens epos och dramatik",
            "Renässansens människosyn",
            "Upplysning och romantik som motpoler",
          ],
        },
        {
          title: "Modernism och samtid",
          summary:
            "Brottet med traditionen och den samtida litteraturens former.",
          points: [
            "Modernismens formexperiment",
            "Efterkrigstidens svenska prosa",
            "Samtidslitteratur och autofiktion",
          ],
        },
        {
          title: "Språkhistoria och språkförändring",
          summary:
            "Svenskans utveckling och de krafter som förändrar ett språk.",
          points: [
            "Runsvenska, fornsvenska och nysvenska",
            "Lånord genom historien",
            "Språkvård och attityder till förändring",
          ],
        },
      ],
    },
    {
      title: "Litteraturens historia",
      author: "Bernt Olsson & Ingemar Algulin",
      publisher: "Studentlitteratur",
      year: 2015,
      pages: 288,
      isbn: "978-91-44-10832-7",
      description:
        "Översiktsverk över världslitteraturen, användbart som uppslagsbok vid fördjupningsarbeten.",
      chapters: [
        {
          title: "Antiken",
          summary: "Grekisk och romersk litteratur och dess efterverkningar.",
          points: ["Homeros och eposet", "Tragedin och katharsis", "Romersk retorik och poesi"],
        },
        {
          title: "Medeltid och renässans",
          summary: "Från religiös litteratur till renässansens individfokus.",
          points: ["Riddardikt och ballader", "Dante och Boccaccio", "Shakespeare och dramats guldålder"],
        },
        {
          title: "Upplysning och romantik",
          summary: "Förnuftets tidsålder och känslans motreaktion.",
          points: ["Satir och idéroman", "Naturen som romantiskt motiv", "Nationalromantiken i Norden"],
        },
        {
          title: "Realism och modernism",
          summary: "Skildringen av samhället och sedan uppbrottet från den.",
          points: ["Den realistiska romanen", "Naturalismens miljöskildring", "Modernismens brott med formen"],
        },
      ],
    },
    {
      title: "Svenska bok prototyp",
      author: "School OS",
      publisher: "Prototyputgåvan",
      year: 2026,
      pages: 96,
      isbn: "—",
      description:
        "Prototypbok om förberedda samtal: turtagning, kroppsspråk, hur man fördjupar sina resonemang och ett genomgånget samtalsexempel.",
      chapters: [
        {
          title: "Turtagning – så går det till",
          summary: "Grundbegreppen för hur ordet växlar mellan deltagarna i ett samtal.",
          points: ["Tur", "Talarbyte", "Paus"],
          prose: [
            "Ett samtal som fungerar bygger på att deltagarna turas om att tala utan att behöva förhandla om det varje gång. Mycket av den turordningen sköter vi omedvetet, men den blir lättare att styra i ett förberett samtal om man känner till begreppen bakom den.",
            {
              heading: "Tre begrepp att hålla isär",
              list: [
                "Tur: det en person säger innan ordet går vidare. En tur kan vara ett enda ord eller flera minuter lång.",
                "Talarbyte: ögonblicket när någon annan tar över ordet från den som talat.",
                "Paus: ett kort uppehåll mitt i en tur. Korta pauser betyder oftast att talaren tänker, inte att hen är klar.",
              ],
            },
            "Pauser fylls ofta med tvekljud som \u201deeh\u201d eller \u201dhmm\u201d. De signalerar att talaren fortfarande söker efter ord och vill behålla turen. Blir tystnaden längre än någon sekund tolkar de flesta det däremot som att turen är ledig, och då sker ett talarbyte.",
            "I ett förberett samtal är det vanligt att en samtalsledare fördelar ordet. Uppgiften går också att dela upp: en deltagare inleder och avslutar, en annan fördelar ordet och en tredje håller koll på tiden.",
          ],
        },
        {
          title: "Kroppsspråk och samtalsstöd",
          summary: "Blickar, gester och lyssnarresponser – det som sägs utan ord.",
          points: ["Ögonkontakt", "Lyssnarresponser", "Aktivt lyssnande"],
          prose: [
            "Vi kommunicerar hela tiden med mer än orden. Blickar, ansiktsuttryck och gester pågår parallellt med det som sägs, både när vi talar och när vi lyssnar.",
            "Har du ordet är ögonkontakten det viktigaste verktyget. Vänder du dig bara till den som råkar sitta närmast, eller till den du känner bäst, tappar de övriga lätt intresset – de uppfattar helt enkelt att du inte talar till dem. Sprid blicken över hela gruppen i stället.",
            "Ögonkontakt spelar lika stor roll åt andra hållet. För den som talar känns det snabbt obehagligt om lyssnaren tittar bort och tycks ha uppmärksamheten någon annanstans.",
            {
              heading: "Lyssnarresponser",
              text: "Det finns flera sätt att visa att du lyssnar aktivt: nicka, humma, le, och skjuta in småord som \u201dja\u201d, \u201djaså\u201d eller \u201dabsolut\u201d. Den här sortens återkoppling kallas lyssnarresponser, och den gör stor skillnad för hur lätt det är att tala.",
            },
            {
              heading: "Öva i par",
              list: [
                "Bestäm vem som är talare och vem som lyssnar.",
                "Talaren berättar i ungefär en minut om något som hänt den senaste veckan – gärna något helt vardagligt. Lyssnaren ger aktivt samtalsstöd.",
                "Diskutera efteråt hur det kändes att tala respektive lyssna.",
                "Gör om övningen med en ny händelse, men den här gången utan något samtalsstöd alls. Jämför känslan med första gången.",
              ],
            },
          ],
        },
        {
          title: "Att utveckla och fördjupa sina tankegångar",
          summary: "Tre sätt att ta ett resonemang längre än en framkastad åsikt.",
          points: ["Ge exempel", "Lyft fram flera perspektiv", "Jämför"],
          prose: [
            "Ett samtal som bara består av framkastade åsikter utan resonemang bakom blir snabbt platt. Det som gör det intressant är att deltagarna utvecklar och fördjupar det de säger. Här är tre sätt att göra det.",
            {
              heading: "Ge exempel",
              text: "Exempel belyser, tydliggör och styrker det du hävdar – men de måste ha en tydlig koppling till det ni faktiskt talar om. Samtalar ni om en skönlitterär text kan du sammanfatta ett avsnitt kort, hänvisa till hur en karaktär beter sig eller beskriva en miljö som är relevant. Tänk igenom eventuella citat i förväg, så du hittar dem snabbt.",
            },
            {
              heading: "Användbara fraser",
              list: [
                "\u201dett exempel är …\u201d, \u201dett annat exempel är …\u201d",
                "\u201ddet framgår av …\u201d, \u201ddet märks på …\u201d",
                "\u201ddet blir tydligt genom …\u201d",
              ],
            },
            {
              heading: "Lyft fram flera perspektiv",
              text: "Att belysa något ur flera perspektiv kallas att problematisera. Det kan handla om för- och nackdelar, om att växla mellan individnivå, samhällsnivå och global nivå, eller om att lägga ett historiskt, ekonomiskt eller genusperspektiv på frågan. Fraser som \u201då ena sidan … å andra sidan\u201d och \u201den annan viktig aspekt av detta är …\u201d hjälper dig att markera bytet.",
            },
            {
              heading: "Jämför",
              text: "Jämförelser fördjupar också. Ni kan jämföra karaktärer och miljöer, hur en karaktär är i början mot i slutet, eller texten mot en annan text, en film eller egna erfarenheter. Kravet är att det finns relevanta beröringspunkter. Använd fraser som \u201den likhet är …\u201d, \u201den skillnad är …\u201d och \u201djämfört med …\u201d.",
            },
          ],
        },
        {
          title: "Språket i det förberedda samtalet",
          summary: "Några enkla regler som håller samtalet begripligt och respektfullt.",
          points: ["Tydlighet", "Turtagning", "Ton"],
          prose: [
            "Ett förberett samtal ställer lite högre krav på språket än ett vardagligt. Några saker är värda att ha i bakhuvudet.",
            {
              heading: "Saker att tänka på",
              list: [
                "Tala så tydligt som möjligt, och inte alltför snabbt.",
                "Avbryt inte varandra – låt den som har ordet tala till punkt.",
                "Variera språket och undvik onödiga upprepningar.",
                "Undvik slang och svordomar.",
                "Personliga påhopp och nedlåtande kommentarer är aldrig acceptabla.",
              ],
            },
            {
              heading: "Diskutera",
              text: "Du använder förmodligen redan knepen ovan – ge exempel, lyft fram flera perspektiv, jämför – utan att tänka på det. Vilka av dem skulle du använda i följande situationer?",
            },
            {
              heading: "",
              list: [
                "Du ska köpa en ny telefon och diskuterar olika modeller med en kompis.",
                "Du berättar för en förälder om en dag som varit väldigt stressig.",
                "Du och en kompis diskuterar en film ni precis sett.",
              ],
            },
          ],
        },
        {
          title: "Ett exempel på ett förberett samtal",
          summary: "Ett litteratursamtal i årskurs 2, från inledning till turtagning.",
          points: ["Upplägget", "Inledningen", "Turtagningen"],
          prose: [
            "För att göra det konkret följer här ett samtal av det slag som beskrivits hittills. Exemplet är påhittat men följer ett vanligt upplägg.",
            "En grupp på fem elever i årskurs 2 samtalar om Goethes brevroman Den unge Werthers lidanden från 1774. Samtalet hålls när klassen läst ungefär halva boken. En av eleverna är samtalsledare och ansvarar för att fördela ordet, men deltar också med egna tankar. Alla får flika in kommentarer och ställa frågor under samtalets gång, så länge ingen avbryter någon annan. Gruppen sitter runt ett bord där alla ser varandra.",
            {
              heading: "Inledning",
              text: "När alla satt sig inleder samtalsledaren med att kort beskriva hur samtalet ska gå till, och ställer sedan den första frågan till en namngiven deltagare:",
            },
            {
              dialogue: [
                {
                  who: "Samtalsledaren",
                  says: "Då kör vi igång med Den unge Werthers lidanden. Vi börjar med huvudpersonen. Vilken bild får ni av Werther? Vill du börja, Hannah?",
                },
              ],
            },
            {
              heading: "Turtagning",
              text: "Att rikta frågan till en bestämd person är den huvudsakliga principen för hur ordet fördelas, även om det står deltagarna fritt att ta ordet när det blir ledigt. Samtalsledaren ger också återkoppling i form av följdfrågor, så att talaren får utveckla sitt svar:",
            },
            {
              dialogue: [
                {
                  who: "Samtalsledaren",
                  says: "Vad tänker du, Vincent? Är Werther kär i Lotte på riktigt, eller är det snarare tanken på kärlek han är besatt av?",
                },
                {
                  who: "Vincent",
                  says: "Till stor del tror jag att det handlar om själva känslan av att vara kär. Det är den som driver honom. Men också att han vill bli älskad tillbaka.",
                },
                { who: "Samtalsledaren", says: "Hur märks det i boken?" },
              ],
            },
            "Lägg märke till att samtalsledaren inte nöjer sig med det första svaret. Följdfrågan \u201dhur märks det i boken?\u201d tvingar fram just den återkoppling till texten som avsnittet om att ge exempel handlade om.",
          ],
        },
      ],
    },
  ],
  "Engelska 6": [
    {
      title: "Blueprint B",
      author: "Christer Lundfall m.fl.",
      publisher: "Natur & Kultur",
      year: 2014,
      pages: 336,
      isbn: "978-91-27-43512-2",
      description:
        "Allroundbok för Engelska 6 med texter, hörövningar och strukturerad grammatikträning.",
      chapters: [
        {
          title: "Reading strategies",
          summary: "Techniques for getting through longer and harder texts.",
          points: ["Skimming and scanning", "Guessing vocabulary from context", "Critical reading of sources"],
        },
        {
          title: "Writing formal texts",
          summary: "Structure and register in formal written English.",
          points: ["Essay structure and paragraphing", "Linking words and cohesion", "Formal vs. informal register"],
        },
        {
          title: "Grammar in context",
          summary: "The grammar points that matter most at this level.",
          points: ["Tenses and the perfect aspect", "Conditionals and hypothetical meaning", "Relative clauses"],
        },
        {
          title: "Literature and film",
          summary: "Reading and discussing fiction from the English-speaking world.",
          points: ["Short stories and narrative voice", "Themes and character analysis", "Comparing novel and adaptation"],
        },
        {
          title: "Speaking and presenting",
          summary: "Building fluency and confidence in spoken English.",
          points: ["Discussion phrases and turn-taking", "Structuring a presentation", "Pronunciation and stress"],
        },
      ],
    },
    {
      title: "Progress Gold B",
      author: "Eva Hedencrona m.fl.",
      publisher: "Studentlitteratur",
      year: 2016,
      pages: 320,
      isbn: "978-91-44-09411-8",
      description:
        "Läromedel med tydlig koppling till kunskapskraven och gott om examensförberedande övningar.",
      chapters: [
        {
          title: "Vocabulary building",
          summary: "Systematic ways to expand and retain vocabulary.",
          points: ["Word families and affixes", "Collocations", "Keeping a vocabulary log"],
        },
        {
          title: "Argumentative writing",
          summary: "Making and defending a case in writing.",
          points: ["Thesis statements", "Counterarguments and rebuttal", "Evidence and citation"],
        },
        {
          title: "The English-speaking world",
          summary: "Culture, history and varieties of English across the globe.",
          points: ["British and American English", "Postcolonial perspectives", "English as a global language"],
        },
        {
          title: "Exam practice",
          summary: "Full-length practice tasks in national test format.",
          points: ["Listening comprehension", "Reading comprehension", "Timed writing"],
        },
      ],
    },
  ],
  "Fysik 2": [
    {
      title: "Heureka! Fysik 2",
      author: "Rune Alphonce m.fl.",
      publisher: "Natur & Kultur",
      year: 2012,
      pages: 400,
      isbn: "978-91-27-42153-8",
      description:
        "Grundbok för Fysik 2 med utförliga härledningar, laborationer och lösta exempel.",
      chapters: [
        {
          title: "Rörelse i två dimensioner",
          summary:
            "Kaströrelse och cirkulär rörelse behandlade med vektorer.",
          points: [
            "Uppdelning i x- och y-komposanter",
            "Kastbanans form och räckvidd",
            "Centripetalacceleration",
          ],
        },
        {
          title: "Krafter och rotation",
          summary: "Moment, jämvikt och rotationsrörelsens grunder.",
          points: ["Kraftmoment och hävarm", "Jämviktsvillkor", "Rörelsemängdsmoment"],
        },
        {
          title: "Harmonisk svängning och vågor",
          summary:
            "Från fjäderpendel till vågutbredning och interferens.",
          points: ["Svängningstid och energi", "Vågekvationen", "Interferens och stående vågor"],
        },
        {
          title: "Elektriska och magnetiska fält",
          summary: "Fältbegreppet och laddade partiklars rörelse i fält.",
          points: ["Coulombs lag och fältstyrka", "Potential och spänning", "Induktion och Lenz lag"],
        },
        {
          title: "Atom- och kärnfysik",
          summary: "Atomens uppbyggnad, radioaktivitet och kärnreaktioner.",
          points: ["Bohrs atommodell", "Sönderfall och halveringstid", "Fission och fusion"],
        },
      ],
    },
    {
      title: "Fysik 2 Impuls",
      author: "Lars Fraenkel m.fl.",
      publisher: "Gleerups",
      year: 2018,
      pages: 368,
      isbn: "978-91-40-69451-2",
      description:
        "Modern lärobok med tydliga figurer och stegvis problemlösningsmetodik.",
      chapters: [
        {
          title: "Mekanik: arbete och energi",
          summary: "Energiprincipen som verktyg för att lösa mekanikproblem.",
          points: ["Arbete och effekt", "Energiomvandlingar", "Rörelsemängd och stötar"],
        },
        {
          title: "Vågrörelselära",
          summary: "Ljud, ljus och vågors gemensamma egenskaper.",
          points: ["Dopplereffekt", "Brytning och reflexion", "Diffraktion i gitter"],
        },
        {
          title: "Elektromagnetism",
          summary: "Sambandet mellan elektricitet och magnetism.",
          points: ["Magnetiskt flöde", "Generatorn och transformatorn", "Elektromagnetiska vågor"],
        },
        {
          title: "Modern fysik",
          summary: "Relativitetsteori och kvantfysikens grundidéer.",
          points: ["Tidsdilatation", "Fotoelektrisk effekt", "Partikel-vågdualism"],
        },
      ],
    },
  ],
  "Historia 1b": [
    {
      title: "Perspektiv på historien 1b",
      author: "Hans Nyström m.fl.",
      publisher: "Gleerups",
      year: 2011,
      pages: 352,
      isbn: "978-91-40-67421-7",
      description:
        "Lärobok som varvar kronologisk översikt med källövningar och historiebruk.",
      chapters: [
        {
          title: "Historiebruk och källkritik",
          summary:
            "Hur historia används i samhället och hur källor granskas.",
          points: [
            "Källkritiska kriterier: äkthet, tid, beroende, tendens",
            "Olika typer av historiebruk",
            "Historiesyn och perspektiv",
          ],
        },
        {
          title: "Från jordbruk till civilisation",
          summary: "Den neolitiska revolutionen och de första högkulturerna.",
          points: ["Jordbrukets spridning", "Skriftspråkets betydelse", "Antikens samhällen"],
        },
        {
          title: "Revolutioner och nationalstater",
          summary:
            "De politiska och industriella omvälvningarna kring 1800-talet.",
          points: ["Franska revolutionen", "Industrialiseringen", "Nationalismens framväxt"],
        },
        {
          title: "Världskrigens tid",
          summary: "Orsaker, förlopp och följder av de två världskrigen.",
          points: ["Första världskrigets orsaker", "Mellankrigstidens kriser", "Förintelsen"],
        },
        {
          title: "Efterkrigstid och globalisering",
          summary: "Kalla kriget och världen efter murens fall.",
          points: ["Blockpolitik", "Avkolonisering", "Globalisering och EU"],
        },
      ],
    },
    {
      title: "Epok 1b",
      author: "Robert Sandberg m.fl.",
      publisher: "Liber",
      year: 2013,
      pages: 304,
      isbn: "978-91-47-10545-1",
      description:
        "Kronologiskt upplagd lärobok med rikt bildmaterial och tidslinjer.",
      chapters: [
        {
          title: "Forntid och antik",
          summary: "De äldsta samhällena och antikens arv.",
          points: ["Mesopotamien och Egypten", "Grekisk demokrati", "Romarrikets uppgång och fall"],
        },
        {
          title: "Medeltid",
          summary: "Feodalsamhället, kyrkan och städernas framväxt.",
          points: ["Feodalismens struktur", "Korstågen", "Digerdöden och dess följder"],
        },
        {
          title: "Nya tiden",
          summary: "Upptäckter, reformation och de första globala imperierna.",
          points: ["De stora upptäcktsfärderna", "Reformationen", "Vetenskapliga revolutionen"],
        },
        {
          title: "1900-talet",
          summary: "Ett sekel av krig, ideologier och snabb förändring.",
          points: ["Ideologiernas kamp", "Välfärdsstatens uppbyggnad", "Sverige under 1900-talet"],
        },
      ],
    },
  ],
  "Programmering 1": [
    {
      title: "Programmering 1 med Python",
      author: "Krister Trangius",
      publisher: "Studentlitteratur",
      year: 2017,
      pages: 264,
      isbn: "978-91-44-11624-7",
      description:
        "Praktisk introduktion till programmering i Python, med övningar efter varje avsnitt.",
      chapters: [
        {
          title: "Variabler och datatyper",
          summary: "De byggstenar all kod vilar på.",
          points: [
            "int, float, str och bool",
            "Inmatning med input() och typomvandling",
            "Namngivning och läsbarhet",
          ],
        },
        {
          title: "Villkor och loopar",
          summary: "Att styra programmets flöde.",
          points: ["if, elif och else", "for- och while-loopar", "break och continue"],
        },
        {
          title: "Funktioner",
          summary: "Dela upp koden i återanvändbara delar.",
          points: ["Parametrar och returvärden", "Lokala och globala variabler", "Dokumentera med docstrings"],
        },
        {
          title: "Listor och dictionaries",
          summary: "Att lagra och bearbeta samlingar av data.",
          points: ["Indexering och slicing", "Iterera över en dictionary", "Sortering och filtrering"],
        },
        {
          title: "Filhantering och felsökning",
          summary: "Läsa och skriva filer samt hitta fel i koden.",
          points: ["open() och with-satsen", "try/except", "Systematisk felsökning"],
        },
      ],
    },
    {
      title: "Grundläggande programmering",
      author: "Skolverket",
      publisher: "Skolverket",
      year: 2019,
      pages: 180,
      isbn: "978-91-7559-412-3",
      description:
        "Språkoberoende introduktion till programmeringens grundbegrepp och arbetssätt.",
      chapters: [
        {
          title: "Vad är ett program?",
          summary: "Från källkod till körbart program.",
          points: ["Kompilering och tolkning", "Utvecklingsmiljöer", "Programmeringens historia"],
        },
        {
          title: "Algoritmer och pseudokod",
          summary: "Att beskriva en lösning innan den kodas.",
          points: ["Stegvis förfining", "Flödesscheman", "Sökning och sortering"],
        },
        {
          title: "Programmeringsparadigm",
          summary: "Olika sätt att strukturera ett program.",
          points: ["Imperativ programmering", "Objektorientering", "Funktionell programmering"],
        },
        {
          title: "Test och dokumentation",
          summary: "Att kvalitetssäkra och beskriva sin kod.",
          points: ["Testfall och gränsvärden", "Kodkommentarer", "Versionshantering"],
        },
      ],
    },
  ],
};

const subjectsGrid = document.getElementById("subjectsGrid");
const subjectsListView = document.getElementById("subjectsListView");
const subjectBooksView = document.getElementById("subjectBooksView");
const subjectBooksTitle = document.getElementById("subjectBooksTitle");
const subjectBooksGrid = document.getElementById("subjectBooksGrid");
const subjectBooksIntro = document.getElementById("subjectBooksIntro");
const subjectsBreadcrumb = document.getElementById("subjectsBreadcrumb");
const bookReaderView = document.getElementById("bookReaderView");
const bookReaderSpine = document.getElementById("bookReaderSpine");
const bookReaderTitle = document.getElementById("bookReaderTitle");
const bookReaderAuthor = document.getElementById("bookReaderAuthor");
const bookReaderMeta = document.getElementById("bookReaderMeta");
const bookReaderDescription = document.getElementById("bookReaderDescription");
const bookReaderChapters = document.getElementById("bookReaderChapters");
const bookReaderProgress = document.getElementById("bookReaderProgress");
const bookChapterTitle = document.getElementById("bookChapterTitle");
const bookChapterSummary = document.getElementById("bookChapterSummary");
const bookChapterPoints = document.getElementById("bookChapterPoints");
const prevChapterBtn = document.getElementById("prevChapterBtn");
const nextChapterBtn = document.getElementById("nextChapterBtn");
const openSpreadBtn = document.getElementById("openSpreadBtn");
const bookSpreadView = document.getElementById("bookSpreadView");
const bookSpreadTitle = document.getElementById("bookSpreadTitle");
const bookSpreadChapter = document.getElementById("bookSpreadChapter");
const bookSpread = document.getElementById("bookSpread");
const bookSpreadFlow = document.getElementById("bookSpreadFlow");
const bookSpreadViewport = bookSpreadFlow.parentElement;
const bookScrollTrack = document.getElementById("bookScrollTrack");
const bookScrollThumb = document.getElementById("bookScrollThumb");
const bookPageLeft = document.getElementById("bookPageLeft");
const bookPageRight = document.getElementById("bookPageRight");
const bookSpreadCounter = document.getElementById("bookSpreadCounter");
const prevSpreadBtn = document.getElementById("prevSpreadBtn");
const nextSpreadBtn = document.getElementById("nextSpreadBtn");
const closeSpreadBtn = document.getElementById("closeSpreadBtn");

let activeLibrarySubject = null;
let activeLibraryColor = null;
let activeBook = null;
let activeChapterIndex = 0;

// Remembers how far you got in each book so the library can offer to pick
// up where you left off instead of always starting from chapter one.
const BOOK_PROGRESS_KEY = "schoolos-book-progress";

function loadBookProgress() {
  const raw = localStorage.getItem(BOOK_PROGRESS_KEY);
  if (raw === null) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return {};
}

let bookProgress = loadBookProgress();

function bookKey(subject, book) {
  return `${subject}::${book.title}`;
}

function saveBookProgress(subject, book, chapterIndex) {
  bookProgress[bookKey(subject, book)] = chapterIndex;
  localStorage.setItem(BOOK_PROGRESS_KEY, JSON.stringify(bookProgress));
}

function readChapterIndex(subject, book) {
  const value = bookProgress[bookKey(subject, book)];
  if (typeof value !== "number") return null;
  // A stored index can outlive an edit to the book's chapter list.
  if (value < 0 || value >= book.chapters.length) return null;
  return value;
}

function teacherForSubject(subject) {
  return TEACHERS.find((t) => t.subject === subject) || null;
}

function renderSubjects() {
  subjectsGrid.innerHTML = "";
  SUBJECTS.forEach((subject, i) => {
    const books = SUBJECT_LIBRARY[subject] || [];

    const card = document.createElement("button");
    card.type = "button";
    card.className = "teacher-card";

    const icon = document.createElement("span");
    icon.className = "teacher-avatar";
    icon.style.background = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
    icon.textContent = "📚";

    const body = document.createElement("span");
    body.className = "teacher-card-body";
    const nameEl = document.createElement("span");
    nameEl.className = "teacher-card-name";
    nameEl.textContent = subject;
    const chapterCount = books.reduce((sum, b) => sum + b.chapters.length, 0);
    const noteCount = mindmapDocs.filter((d) => d.subject === subject).length;
    const teacher = teacherForSubject(subject);

    const countEl = document.createElement("span");
    countEl.className = "teacher-card-subject muted";
    countEl.textContent = `${books.length} ${books.length === 1 ? "bok" : "böcker"} · ${chapterCount} kapitel`;

    const extraEl = document.createElement("span");
    extraEl.className = "teacher-card-subject muted";
    extraEl.textContent = `${teacher ? teacher.name : "Ingen lärare"} · ${noteCount} ${
      noteCount === 1 ? "anteckning" : "anteckningar"
    }`;

    body.appendChild(nameEl);
    body.appendChild(countEl);
    body.appendChild(extraEl);

    card.appendChild(icon);
    card.appendChild(body);
    card.addEventListener("click", () => openSubjectBooks(subject, SUBJECT_COLORS[i % SUBJECT_COLORS.length]));
    subjectsGrid.appendChild(card);
  });
}

function renderSubjectBooks(subject, color) {
  subjectBooksGrid.innerHTML = "";
  const books = SUBJECT_LIBRARY[subject] || [];

  if (books.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Inga böcker registrerade för det här ämnet än.";
    subjectBooksGrid.appendChild(empty);
    return;
  }

  books.forEach((book) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card book-card";

    const spine = document.createElement("div");
    spine.className = "book-card-spine";
    spine.style.background = color;
    spine.textContent = "📘";

    const titleEl = document.createElement("h3");
    titleEl.textContent = book.title;
    const authorEl = document.createElement("p");
    authorEl.className = "muted";
    authorEl.textContent = book.author;

    const metaEl = document.createElement("p");
    metaEl.className = "muted book-card-meta";
    metaEl.textContent = `${book.publisher} · ${book.year} · ${book.pages} sidor`;

    const chaptersEl = document.createElement("p");
    chaptersEl.className = "book-card-chapters";
    const savedIndex = readChapterIndex(subject, book);
    chaptersEl.textContent =
      savedIndex === null
        ? `${book.chapters.length} kapitel · Öppna`
        : `${book.chapters.length} kapitel · Fortsätt: kap. ${savedIndex + 1}`;

    card.appendChild(spine);
    card.appendChild(titleEl);
    card.appendChild(authorEl);
    card.appendChild(metaEl);
    card.appendChild(chaptersEl);
    card.addEventListener("click", () => openBook(book));
    subjectBooksGrid.appendChild(card);
  });
}

// Three levels deep now: Ämnen -> a subject's books -> one open book.
// Every level above the current one stays clickable so you can step back
// out without needing a separate back button.
function renderSubjectsBreadcrumb() {
  subjectsBreadcrumb.innerHTML = "";

  const rootItem = document.createElement("li");
  rootItem.textContent = "🗂 Ämnen";
  rootItem.className = activeLibrarySubject ? "" : "active";
  rootItem.addEventListener("click", closeSubjectBooks);
  subjectsBreadcrumb.appendChild(rootItem);

  if (activeLibrarySubject) {
    const subjectItem = document.createElement("li");
    subjectItem.textContent = activeLibrarySubject;
    subjectItem.className = activeBook ? "" : "active";
    if (activeBook) subjectItem.addEventListener("click", closeBook);
    subjectsBreadcrumb.appendChild(subjectItem);
  }

  if (activeBook) {
    const bookItem = document.createElement("li");
    bookItem.textContent = `📘 ${activeBook.title}`;
    bookItem.className = "active";
    subjectsBreadcrumb.appendChild(bookItem);
  }
}

function openSubjectBooks(subject, color) {
  activeLibrarySubject = subject;
  activeLibraryColor = color;
  activeBook = null;
  subjectsListView.hidden = true;
  bookReaderView.hidden = true;
  bookSpreadView.hidden = true;
  subjectBooksView.hidden = false;
  subjectBooksTitle.textContent = subject;

  const books = SUBJECT_LIBRARY[subject] || [];
  const teacher = teacherForSubject(subject);
  subjectBooksIntro.textContent = `${books.length} ${
    books.length === 1 ? "bok" : "böcker"
  } i ämnet${teacher ? ` · Lärare: ${teacher.name}` : ""}. Tryck på en bok för att öppna den.`;

  renderSubjectBooks(subject, color);
  renderSubjectsBreadcrumb();
}

function closeSubjectBooks() {
  activeLibrarySubject = null;
  activeLibraryColor = null;
  activeBook = null;
  subjectBooksView.hidden = true;
  bookReaderView.hidden = true;
  bookSpreadView.hidden = true;
  subjectsListView.hidden = false;
  renderSubjects();
  renderSubjectsBreadcrumb();
}

// ---------- Book reader ----------

function renderBookChapterList() {
  bookReaderChapters.innerHTML = "";

  activeBook.chapters.forEach((chapter, index) => {
    const item = document.createElement("li");
    if (index === activeChapterIndex) item.classList.add("active");

    const number = document.createElement("span");
    number.className = "book-chapter-number";
    number.textContent = index + 1;

    const label = document.createElement("span");
    label.className = "doc-list-label";
    label.textContent = chapter.title;

    item.appendChild(number);
    item.appendChild(label);
    item.addEventListener("click", () => showChapter(index));
    bookReaderChapters.appendChild(item);
  });
}

function showChapter(index) {
  if (!activeBook) return;
  const total = activeBook.chapters.length;
  activeChapterIndex = Math.min(Math.max(index, 0), total - 1);
  const chapter = activeBook.chapters[activeChapterIndex];

  bookReaderProgress.textContent = `Kapitel ${activeChapterIndex + 1} av ${total}`;
  bookChapterTitle.textContent = chapter.title;
  bookChapterSummary.textContent = chapter.summary;

  bookChapterPoints.innerHTML = "";
  chapter.points.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    bookChapterPoints.appendChild(li);
  });

  prevChapterBtn.disabled = activeChapterIndex === 0;
  nextChapterBtn.disabled = activeChapterIndex === total - 1;

  saveBookProgress(activeLibrarySubject, activeBook, activeChapterIndex);
  renderBookChapterList();
}

function openBook(book) {
  activeBook = book;
  subjectBooksView.hidden = true;
  bookSpreadView.hidden = true;
  bookReaderView.hidden = false;

  bookReaderSpine.style.background = activeLibraryColor;
  bookReaderTitle.textContent = book.title;
  bookReaderAuthor.textContent = book.author;
  bookReaderMeta.textContent = `${book.publisher} · ${book.year} · ${book.pages} sidor · ISBN ${book.isbn}`;
  bookReaderDescription.textContent = book.description;

  // Reopening a book resumes where you left off rather than resetting.
  const saved = readChapterIndex(activeLibrarySubject, book);
  showChapter(saved === null ? 0 : saved);
  renderSubjectsBreadcrumb();
}

function closeBook() {
  if (!activeLibrarySubject) return;
  openSubjectBooks(activeLibrarySubject, activeLibraryColor);
}

prevChapterBtn.addEventListener("click", () => showChapter(activeChapterIndex - 1));
nextChapterBtn.addEventListener("click", () => showChapter(activeChapterIndex + 1));

// ---------- Open-book spread reader ----------

// The real textbooks these entries name are copyrighted, so the body text
// below is generated prototype prose built from each chapter's own summary
// and key points. It reads like a textbook section and gives the spread
// enough real text to paginate, without reproducing anyone's book.
const PROSE_BRIDGES = [
  "Innan vi går vidare är det värt att stanna upp vid själva begreppet. Det som vid första anblicken ser ut som en teknikalitet visar sig ofta bära hela resonemanget, och den som hoppar över det får svårare längre fram.",
  "I det här avsnittet återkommer vi flera gånger till samma grundidé, men i olika förklädnader. Att känna igen den under de olika ytorna är en stor del av det du ska träna på.",
  "Ett vanligt misstag är att lära sig framgångssättet utantill utan att förstå varför det fungerar. Då står man handfallen så snart uppgiften formuleras på ett nytt sätt.",
  "Räkna med att behöva läsa avsnittet mer än en gång. Först vid andra genomläsningen brukar sambanden mellan delarna framträda tydligt.",
];

const PROSE_CLOSERS = [
  "Sammanfattningsvis handlar avsnittet mindre om att memorera enskilda regler än om att se hur de hänger ihop. När helheten sitter blir detaljerna lättare att komma ihåg.",
  "Med det här på plats är du redo för nästa kapitel, där resonemanget byggs vidare och tillämpas på mer sammansatta problem.",
  "Öva på uppgifterna i slutet av avsnittet innan du går vidare. Det är i tillämpningen som förståelsen sätter sig.",
];

function proseForPoint(point, index) {
  const openings = [
    `${point} är den första av de trådar vi ska följa.`,
    `Vi vänder oss nu till ${point.charAt(0).toLowerCase() + point.slice(1)}.`,
    `Nästa moment gäller ${point.charAt(0).toLowerCase() + point.slice(1)}.`,
    `Därefter behandlas ${point.charAt(0).toLowerCase() + point.slice(1)}.`,
    `Slutligen tar vi upp ${point.charAt(0).toLowerCase() + point.slice(1)}.`,
  ];
  const bodies = [
    "Börja med att skaffa dig en överblick över vad som faktiskt efterfrågas, och skilj noga på det som är givet och det som ska bestämmas. Många fel uppstår redan här, långt innan några beräkningar har gjorts, helt enkelt för att förutsättningarna lästes slarvigt.",
    "Gå igenom exemplet rad för rad och kontrollera varje steg mot det föregående. Om ett steg känns självklart, försök att formulera i ord varför det är tillåtet — kan du inte det, har du hittat en lucka som är värd att fylla.",
    "Jämför med det du redan kan sedan tidigare kurser. Det nya är sällan helt nytt, utan oftast en generalisering av något bekant, och den kopplingen gör stoffet betydligt lättare att befästa.",
    "Pröva att variera förutsättningarna och se vad som händer med resultatet. Den som leker med gränsfallen får en känsla för var metoden fungerar och var den slutar gälla, vilket är precis den omdömesförmåga proven efterfrågar.",
  ];
  return `${openings[index % openings.length]} ${bodies[index % bodies.length]}`;
}

// Builds the running text for one chapter as an array of DOM nodes.
function buildChapterProse(chapter, chapterIndex) {
  const nodes = [];

  const heading = document.createElement("h4");
  if (chapterIndex > 0) heading.className = "book-chapter-heading-continued";
  const label = document.createElement("span");
  label.className = "book-chapter-label";
  label.textContent = `Kapitel ${chapterIndex + 1}`;
  heading.appendChild(label);
  heading.appendChild(document.createTextNode(chapter.title));
  nodes.push(heading);

  // A chapter that carries its own written text is rendered as-is; the
  // generated filler below is only for the placeholder entries that have
  // nothing but a summary and a list of points.
  if (Array.isArray(chapter.prose)) {
    chapter.prose.forEach((block, i) => {
      if (typeof block === "string") {
        const para = document.createElement("p");
        if (i === 0) para.className = "book-para-first";
        para.textContent = block;
        nodes.push(para);
        return;
      }

      if (block.heading) {
        const subheading = document.createElement("h5");
        subheading.className = "book-subheading";
        subheading.textContent = block.heading;
        nodes.push(subheading);
      }

      if (block.text) {
        const para = document.createElement("p");
        para.className = "book-para-first";
        para.textContent = block.text;
        nodes.push(para);
      }

      if (Array.isArray(block.list)) {
        const list = document.createElement("ul");
        list.className = "book-prose-list";
        block.list.forEach((item) => {
          const li = document.createElement("li");
          li.textContent = item;
          list.appendChild(li);
        });
        nodes.push(list);
      }

      if (Array.isArray(block.dialogue)) {
        block.dialogue.forEach((line) => {
          const para = document.createElement("p");
          para.className = "book-dialogue";
          const who = document.createElement("span");
          who.className = "book-dialogue-who";
          who.textContent = `${line.who}: `;
          para.appendChild(who);
          para.appendChild(document.createTextNode(line.says));
          nodes.push(para);
        });
      }
    });
    return nodes;
  }

  const intro = document.createElement("p");
  intro.className = "book-para-first";
  intro.textContent = `${chapter.summary} Avsnittet är upplagt så att varje delmoment bygger vidare på det föregående, och det lönar sig därför att läsa det i ordning snarare än att hoppa direkt till uppgifterna.`;
  nodes.push(intro);

  const bridge = document.createElement("p");
  bridge.textContent = PROSE_BRIDGES[chapterIndex % PROSE_BRIDGES.length];
  nodes.push(bridge);

  chapter.points.forEach((point, i) => {
    const para = document.createElement("p");
    para.textContent = proseForPoint(point, i);
    nodes.push(para);
  });

  const closer = document.createElement("p");
  closer.textContent = PROSE_CLOSERS[chapterIndex % PROSE_CLOSERS.length];
  nodes.push(closer);

  return nodes;
}

let spreadIndex = 0;
let spreadPageCount = 0;
let spreadColumnStep = 0;
let spreadColumnsPerView = 2;
// Narrower than two of these side by side and justified text starts
// breaking badly, so the spread folds down to a single page instead.
const MIN_PAGE_WIDTH = 320;
// Tracks which chapter the left page is showing, so re-typesetting (a
// resize, or a split pane being dragged) can put the reader back on the
// same chapter instead of on whatever now happens to have that page number.
let spreadCurrentChapter = 0;
let isSinglePage = false;
// Where in the flow each chapter starts, so opening the book from a
// chapter lands on the right spread instead of always at page one.
let spreadChapterStarts = [];

function renderSpreadContent(onlyChapterIndex) {
  bookSpreadFlow.innerHTML = "";
  spreadChapterStarts = [];

  // One-page mode renders a single chapter at a time; the two-page spread
  // renders the whole book so the text can flow across the fold.
  const chapters =
    onlyChapterIndex === undefined
      ? activeBook.chapters.map((chapter, index) => ({ chapter, index }))
      : [{ chapter: activeBook.chapters[onlyChapterIndex], index: onlyChapterIndex }];

  chapters.forEach(({ chapter, index }) => {
    const nodes = buildChapterProse(chapter, index);
    // The heading node is the anchor we later measure to find the chapter.
    spreadChapterStarts.push(nodes[0]);
    nodes.forEach((node) => bookSpreadFlow.appendChild(node));
  });
}

// Lays the book out for whichever mode the available width allows. Must
// run while the view is visible -- a hidden element measures zero and
// would produce a single empty page.
function paginateSpread() {
  // The flow element's own clientWidth is the text area itself. Measuring
  // the viewport instead would include its padding, leaving too little
  // room for two page-wide columns and collapsing the spread into one.
  // Measured on the container: the flow's own width is pinned by
  // layoutTwoPageSpread, so reading it back would just return the previous
  // pass's value and the layout could never grow again.
  const viewportWidth = bookSpreadViewport.clientWidth;
  if (viewportWidth <= 0) return;

  const gutter = parseFloat(getComputedStyle(bookSpread).getPropertyValue("--book-gutter")) || 0;

  // Deciding this from the measured text width (rather than a viewport
  // media query) is what makes one-page mode kick in for a book opened in
  // a split pane -- the window can still be wide while the pane is not.
  isSinglePage = viewportWidth < MIN_PAGE_WIDTH * 2 + gutter;
  bookSpread.classList.toggle("is-single-page", isSinglePage);

  const pageHeight = Math.max(320, Math.round(window.innerHeight * 0.56));

  if (isSinglePage) {
    layoutSingleChapter(pageHeight);
  } else {
    layoutTwoPageSpread(viewportWidth, gutter, pageHeight);
  }
}

// Two facing pages: the whole book flows through page-wide columns and
// paging is a horizontal translate.
function layoutTwoPageSpread(viewportWidth, gutter, pageHeight) {
  renderSpreadContent();

  spreadColumnsPerView = 2;

  // Both the column width and the flow's own width are pinned to whole
  // pixels that add up exactly. clientWidth is rounded to an integer while
  // the real content box is fractional, so deriving a column width from it
  // and leaving the flow to fill its container made two columns fail to fit
  // at some widths and zoom levels -- the text then reflowed into one wide
  // column straddling the fold. Giving the browser an exact integer total
  // removes the rounding entirely, and keeps the paging step integral too.
  const columnWidth = Math.floor((viewportWidth - gutter) / 2);

  bookSpreadViewport.style.maxHeight = "";
  bookSpreadFlow.style.height = `${pageHeight}px`;
  bookSpreadFlow.style.width = `${columnWidth * 2 + gutter}px`;
  bookSpreadFlow.style.columnWidth = `${columnWidth}px`;
  bookSpreadFlow.style.columnGap = `${gutter}px`;

  spreadColumnStep = columnWidth + gutter;
  spreadPageCount = Math.max(1, Math.round((bookSpreadFlow.scrollWidth + gutter) / spreadColumnStep));

  // Re-anchor on the chapter that was being read: after a reflow the old
  // spread index points at a different part of the book.
  goToChapterSpread(spreadCurrentChapter);
}

// One page: a single chapter, laid out as one continuous column that the
// paper scrolls vertically. Splitting the flow into fixed-height columns
// here would leave a page starting mid-sentence, which is exactly what
// makes a narrow pane awkward to read -- a chapter per page always starts
// at its own heading instead.
function layoutSingleChapter(pageHeight) {
  renderSpreadContent(spreadCurrentChapter);

  spreadColumnsPerView = 1;
  spreadColumnStep = 0;
  spreadPageCount = activeBook.chapters.length;

  bookSpreadFlow.style.transform = "none";
  bookSpreadFlow.style.height = "auto";
  bookSpreadFlow.style.width = "auto";
  bookSpreadFlow.style.columnWidth = "auto";
  bookSpreadFlow.style.columnGap = "0px";
  bookSpreadViewport.style.maxHeight = `${pageHeight}px`;

  showSingleChapter(spreadCurrentChapter);
}

// Moves the view to the spread where a given chapter begins.
function goToChapterSpread(chapterIndex) {
  const anchor = spreadChapterStarts[chapterIndex];
  if (!anchor || spreadColumnStep <= 0) {
    showSpread(spreadIndex);
    return;
  }
  const column = Math.round(anchor.offsetLeft / spreadColumnStep);
  showSpread(Math.floor(column / spreadColumnsPerView));
}

function showSingleChapter(chapterIndex) {
  const total = activeBook.chapters.length;
  const next = Math.min(Math.max(chapterIndex, 0), total - 1);

  // Only re-render when actually changing chapter, so a plain re-layout
  // doesn't throw away where the reader had scrolled to.
  if (next !== spreadCurrentChapter || bookSpreadFlow.children.length === 0) {
    spreadCurrentChapter = next;
    renderSpreadContent(next);
    bookSpreadViewport.scrollTop = 0;
  }

  const chapter = activeBook.chapters[next];
  bookPageLeft.textContent = "";
  bookPageRight.textContent = next + 1;
  bookSpreadCounter.textContent = `Kapitel ${next + 1} av ${total}`;
  bookSpreadChapter.textContent = `${chapter.title} · Kapitel ${next + 1} av ${total}`;

  prevSpreadBtn.disabled = next === 0;
  nextSpreadBtn.disabled = next === total - 1;

  updateBookScrollbar();
}

function showSpread(index) {
  const maxIndex = Math.max(0, Math.ceil(spreadPageCount / spreadColumnsPerView) - 1);
  spreadIndex = Math.min(Math.max(index, 0), maxIndex);

  bookSpreadFlow.style.transform = `translateX(-${spreadIndex * spreadColumnStep * spreadColumnsPerView}px)`;

  const leftPage = spreadIndex * spreadColumnsPerView + 1;
  const rightPage = leftPage + 1;

  bookPageLeft.textContent = leftPage <= spreadPageCount ? leftPage : "";
  bookPageRight.textContent = rightPage <= spreadPageCount ? rightPage : "";

  const shown = rightPage <= spreadPageCount ? `Sida ${leftPage}–${rightPage}` : `Sida ${leftPage}`;
  bookSpreadCounter.textContent = `${shown} av ${spreadPageCount}`;

  prevSpreadBtn.disabled = spreadIndex === 0;
  nextSpreadBtn.disabled = spreadIndex === maxIndex;

  // Report which chapter the left-hand page currently falls in.
  const viewportLeft = spreadIndex * spreadColumnStep * spreadColumnsPerView;
  let current = 0;
  spreadChapterStarts.forEach((node, i) => {
    if (node.offsetLeft <= viewportLeft + 2) current = i;
  });
  spreadCurrentChapter = current;
  bookSpreadChapter.textContent = `${activeBook.chapters[current].title} · Kapitel ${current + 1} av ${activeBook.chapters.length}`;

  updateBookScrollbar();
}

// The page draws its own scrollbar rather than relying on the native one,
// which renders as an invisible-until-scrolled overlay on several
// platforms. Scrolling stays native -- this only reflects and drives it.
function updateBookScrollbar() {
  if (!isSinglePage) {
    bookScrollTrack.hidden = true;
    return;
  }

  const { scrollHeight, clientHeight, scrollTop } = bookSpreadViewport;
  if (scrollHeight <= clientHeight + 1) {
    bookScrollTrack.hidden = true;
    return;
  }

  bookScrollTrack.hidden = false;
  const trackHeight = bookScrollTrack.clientHeight;
  const thumbHeight = Math.max(32, (clientHeight / scrollHeight) * trackHeight);
  const maxScroll = scrollHeight - clientHeight;
  const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;

  bookScrollThumb.style.height = `${thumbHeight}px`;
  bookScrollThumb.style.transform = `translateY(${progress * (trackHeight - thumbHeight)}px)`;
}

bookSpreadViewport.addEventListener("scroll", updateBookScrollbar);

// Dragging the thumb (or clicking anywhere on the track) scrolls the page.
function scrollToTrackPosition(clientY) {
  const trackRect = bookScrollTrack.getBoundingClientRect();
  const thumbHeight = bookScrollThumb.offsetHeight;
  const travel = trackRect.height - thumbHeight;
  if (travel <= 0) return;

  const offset = clientY - trackRect.top - thumbHeight / 2;
  const progress = Math.min(Math.max(offset / travel, 0), 1);
  bookSpreadViewport.scrollTop =
    progress * (bookSpreadViewport.scrollHeight - bookSpreadViewport.clientHeight);
}

bookScrollTrack.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  bookScrollTrack.setPointerCapture(event.pointerId);
  bookScrollTrack.classList.add("is-dragging");
  scrollToTrackPosition(event.clientY);
});

bookScrollTrack.addEventListener("pointermove", (event) => {
  if (!bookScrollTrack.classList.contains("is-dragging")) return;
  scrollToTrackPosition(event.clientY);
});

function endScrollbarDrag() {
  bookScrollTrack.classList.remove("is-dragging");
}

bookScrollTrack.addEventListener("pointerup", endScrollbarDrag);
bookScrollTrack.addEventListener("pointercancel", endScrollbarDrag);

// Paging means "next chapter" on one page and "next spread" on two, so
// the buttons and arrow keys go through here rather than calling either
// layout's own mover directly.
function stepSpread(delta) {
  if (isSinglePage) showSingleChapter(spreadCurrentChapter + delta);
  else showSpread(spreadIndex + delta);
}

function openSpread() {
  if (!activeBook) return;

  bookReaderView.hidden = true;
  bookSpreadView.hidden = false;
  bookSpreadTitle.textContent = activeBook.title;

  spreadIndex = 0;
  // Open on the chapter that was being read in the outline view.
  spreadCurrentChapter = activeChapterIndex;
  bookSpreadFlow.innerHTML = "";
  paginateSpread();

  renderSubjectsBreadcrumb();
}

function closeSpread() {
  bookSpreadView.hidden = true;
  bookReaderView.hidden = false;
  renderSubjectsBreadcrumb();
}

openSpreadBtn.addEventListener("click", openSpread);
closeSpreadBtn.addEventListener("click", closeSpread);
prevSpreadBtn.addEventListener("click", () => stepSpread(-1));
nextSpreadBtn.addEventListener("click", () => stepSpread(1));

document.addEventListener("keydown", (event) => {
  if (bookSpreadView.hidden) return;
  if (event.target.matches("input, textarea, select, [contenteditable='true']")) return;
  if (event.key === "ArrowLeft") stepSpread(-1);
  if (event.key === "ArrowRight") stepSpread(1);
  if (event.key === "Escape") closeSpread();
});

// Re-typeset whenever the text area's width changes -- the column width
// is derived from it, so a stale layout would put the text in the wrong
// place. A ResizeObserver catches what a window resize listener cannot:
// the book being docked into (or dragged narrower inside) a split pane,
// which changes the pane's width while the window's stays the same.
let lastSpreadWidth = 0;

const spreadResizeObserver = new ResizeObserver(() => {
  if (bookSpreadView.hidden) return;
  const width = bookSpreadViewport.clientWidth;
  // Only width matters here, and ignoring same-width callbacks keeps
  // paginateSpread's own height change from re-triggering this.
  if (width <= 0 || width === lastSpreadWidth) return;
  lastSpreadWidth = width;
  paginateSpread();
});

spreadResizeObserver.observe(bookSpread);

window.addEventListener("resize", () => {
  if (bookSpreadView.hidden) return;
  paginateSpread();
});

let mindmapDocs = loadMindmapDocs();
let mindmapGroups = loadGroups();
let ungroupedCollapsed = loadUngroupedCollapsed();
let currentDocId = null;
// Which group the main panel's group overview is showing, when it's open:
// a group id, ALL_GROUPS for the combined overview, or null when a
// document is open instead.
const ALL_GROUPS = "__all__";
let activeGroupViewId = null;
let currentColor = "#1a1a2e";
let eraserActive = false;
let isDrawingStroke = false;
let undoStack = [];
const UNDO_LIMIT = 20;

// ---------- Draw canvas pan/zoom view ----------

const DRAW_ZOOM_MIN = 0.15;
const DRAW_ZOOM_MAX = 4;
const DRAW_ZOOM_STEP = 1.25;
let drawZoom = 1;
let drawPanX = 0;
let drawPanY = 0;
let panActive = false;
let isPanningNow = false;
let panPointerStart = null;
// Set when a draw doc is selected while its wrapper is still hidden/zero-
// sized (e.g. it's the inactive half of a split, or a background tab) --
// the fit can't be computed yet, so it's deferred to onTabShown once the
// wrapper actually has a size.
let pendingDrawFit = false;

const PEN_SIZE_KEY = "schoolos-pen-size";
const ERASER_SIZE_KEY = "schoolos-eraser-size";
let penSize = Number(localStorage.getItem(PEN_SIZE_KEY)) || 3;
let eraserSize = Number(localStorage.getItem(ERASER_SIZE_KEY)) || 3;
brushSizeInput.value = penSize;

function loadMindmapDocs() {
  const raw = localStorage.getItem(MINDMAP_STORAGE_KEY);
  if (raw === null) return DEFAULT_DOCS.slice();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return [];
}

function saveMindmapDocs() {
  localStorage.setItem(MINDMAP_STORAGE_KEY, JSON.stringify(mindmapDocs));
}

function loadGroups() {
  const raw = localStorage.getItem(GROUPS_STORAGE_KEY);
  if (raw === null) return DEFAULT_GROUPS.slice();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return [];
}

function saveGroups() {
  localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(mindmapGroups));
}

function loadUngroupedCollapsed() {
  return localStorage.getItem(UNGROUPED_COLLAPSED_KEY) === "true";
}

function saveUngroupedCollapsed() {
  localStorage.setItem(UNGROUPED_COLLAPSED_KEY, String(ungroupedCollapsed));
}

// The "Grupper" section of the Mindmap catalog. Lists every group -- even
// empty ones, which the document list can't show since it only renders
// groups that have documents in them. Clicking one opens that group's
// overview in the main panel.
function renderGroupList() {
  groupList.innerHTML = "";

  const allItem = document.createElement("li");
  if (activeGroupViewId === ALL_GROUPS) allItem.classList.add("active");
  const allLabel = document.createElement("span");
  allLabel.className = "doc-list-label";
  allLabel.textContent = "🗂 Alla grupper";
  allItem.appendChild(allLabel);
  allItem.addEventListener("click", () => showGroupView(ALL_GROUPS));
  groupList.appendChild(allItem);

  if (mindmapGroups.length === 0) {
    const empty = document.createElement("li");
    empty.className = "doc-list-empty";
    empty.textContent = "Inga grupper än.";
    groupList.appendChild(empty);
    return;
  }

  mindmapGroups.forEach((group) => {
    const item = document.createElement("li");
    if (group.id === activeGroupViewId) item.classList.add("active");

    const label = document.createElement("span");
    label.className = "doc-list-label";
    const count = mindmapDocs.filter((d) => d.groupId === group.id).length;
    label.textContent = `🗂 ${group.name} (${count})`;
    item.appendChild(label);

    item.appendChild(
      createDeleteControl({
        category: "groups",
        compact: true,
        onDelete: () => deleteGroupById(group.id),
      })
    );

    item.addEventListener("click", () => showGroupView(group.id));
    groupList.appendChild(item);
  });
}

// Keeps the "Nytt dokument" form's group picker in sync -- this is how a
// document's group is chosen now that there's no separate "Aktiv grupp"
// list driving it.
function renderNewDocGroupOptions() {
  const previous = newDocGroup.value;
  newDocGroup.innerHTML = "";

  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "Ingen grupp";
  newDocGroup.appendChild(noneOption);

  mindmapGroups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = `🗂 ${group.name}`;
    newDocGroup.appendChild(option);
  });

  if (previous && mindmapGroups.some((g) => g.id === previous)) newDocGroup.value = previous;
}

function createGroup(name, subject) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const group = { id: `grp-${Date.now()}`, name: trimmed, collapsed: false, subject: subject || "" };
  mindmapGroups.push(group);
  saveGroups();
  renderGroupList();
  renderNewDocGroupOptions();
  // Newly created group becomes the default target for the next document,
  // which is what the old "Aktiv grupp" selection used to do implicitly.
  newDocGroup.value = group.id;
  renderGroupViewIfOpen();
}

// Deleting a group only removes the group itself -- its documents are
// ungrouped (groupId set to null), not deleted, same as removing a
// folder shouldn't destroy the files inside it.
function deleteGroupById(id) {
  mindmapDocs.forEach((doc) => {
    if (doc.groupId === id) doc.groupId = null;
  });
  saveMindmapDocs();

  mindmapGroups = mindmapGroups.filter((g) => g.id !== id);
  saveGroups();

  // The deleted group can't stay selected in either the group overview or
  // the new-document form -- fall back to the "all groups" overview and to
  // no group respectively.
  if (activeGroupViewId === id) activeGroupViewId = ALL_GROUPS;
  if (newDocGroup.value === id) newDocGroup.value = "";

  renderGroupList();
  renderNewDocGroupOptions();
  renderDocList();
  renderGroupViewIfOpen();
}

function renderDocList() {
  docList.innerHTML = "";

  if (mindmapDocs.length === 0) {
    const empty = document.createElement("li");
    empty.className = "doc-list-empty";
    empty.textContent = "Inga dokument än.";
    docList.appendChild(empty);
    return;
  }

  function appendDocItem(doc) {
    const item = document.createElement("li");
    if (doc.id === currentDocId) item.classList.add("active");
    item.addEventListener("click", () => selectDoc(doc.id));

    const label = document.createElement("span");
    label.className = "doc-list-label";
    label.textContent = `${doc.type === "draw" ? "🎨" : "📝"} ${doc.title}`;
    item.appendChild(label);

    item.appendChild(
      createDeleteControl({
        category: doc.type === "draw" ? "drawings" : "docs",
        compact: true,
        onDelete: () => deleteDocById(doc.id),
      })
    );

    docList.appendChild(item);
  }

  function appendUngroupedHeader() {
    const header = document.createElement("li");
    header.className = "doc-list-group-header";
    if (ungroupedCollapsed) header.classList.add("collapsed");

    const label = document.createElement("span");
    label.className = "doc-list-label";
    label.textContent = "Ingen grupp";
    header.appendChild(label);

    const toggle = document.createElement("span");
    toggle.className = "doc-list-group-toggle";
    toggle.textContent = "▾";
    header.appendChild(toggle);

    header.addEventListener("click", () => {
      ungroupedCollapsed = !ungroupedCollapsed;
      saveUngroupedCollapsed();
      renderDocList();
    });

    docList.appendChild(header);
  }

  function appendGroupHeader(group) {
    const header = document.createElement("li");
    header.className = "doc-list-group-header";
    if (group.collapsed) header.classList.add("collapsed");

    const label = document.createElement("span");
    label.className = "doc-list-label";
    label.textContent = `🗂 ${group.name}`;
    header.appendChild(label);

    const actions = document.createElement("span");
    actions.className = "doc-list-group-actions";

    actions.appendChild(
      createDeleteControl({
        category: "groups",
        compact: true,
        onDelete: () => deleteGroupById(group.id),
      })
    );

    const toggle = document.createElement("span");
    toggle.className = "doc-list-group-toggle";
    toggle.textContent = "▾";
    actions.appendChild(toggle);

    header.appendChild(actions);

    header.addEventListener("click", () => {
      group.collapsed = !group.collapsed;
      saveGroups();
      renderDocList();
      renderGroupViewIfOpen();
    });

    docList.appendChild(header);
  }

  const ungrouped = mindmapDocs.filter((d) => !d.groupId);
  const hasGroups = mindmapGroups.length > 0;

  if (hasGroups && ungrouped.length > 0) {
    appendUngroupedHeader();
    if (!ungroupedCollapsed) ungrouped.forEach(appendDocItem);
  } else {
    ungrouped.forEach(appendDocItem);
  }

  mindmapGroups.forEach((group) => {
    const docsInGroup = mindmapDocs.filter((d) => d.groupId === group.id);
    if (docsInGroup.length === 0) return;
    appendGroupHeader(group);
    if (!group.collapsed) docsInGroup.forEach(appendDocItem);
  });
}

function pluralizeDrawings(count) {
  return count === 1 ? "ritning" : "ritningar";
}

function groupMetaLabel(docsInGroup, subject) {
  const textCount = docsInGroup.filter((d) => d.type === "text").length;
  const drawCount = docsInGroup.filter((d) => d.type === "draw").length;
  const typeParts = [];
  if (textCount > 0) typeParts.push(`${textCount} dokument`);
  if (drawCount > 0) typeParts.push(`${drawCount} ${pluralizeDrawings(drawCount)}`);
  const typeLabel = typeParts.length > 0 ? typeParts.join(", ") : "inga projekt";
  const base = `${docsInGroup.length} projekt · ${typeLabel}`;
  return subject ? `${base} · ${subject}` : base;
}

function goToMindmapDoc(docId) {
  activateTab("mindmap");
  selectDoc(docId);
}

function buildGroupBox(name, groupId, docsInGroup, collapsed, onToggle, showDelete, subject) {
  const box = document.createElement("div");
  box.className = "group-box";
  if (collapsed) box.classList.add("collapsed");
  if (groupId) box.id = `group-box-${groupId}`;

  const header = document.createElement("div");
  header.className = "group-box-header";

  const heading = document.createElement("div");
  heading.className = "group-box-heading";
  const nameEl = document.createElement("span");
  nameEl.className = "group-box-name";
  nameEl.textContent = `🗂 ${name}`;
  const metaEl = document.createElement("span");
  metaEl.className = "group-box-meta";
  metaEl.textContent = groupMetaLabel(docsInGroup, subject);
  heading.appendChild(nameEl);
  heading.appendChild(metaEl);

  const toggle = document.createElement("button");
  toggle.className = "group-box-toggle";
  toggle.type = "button";
  toggle.textContent = "▾";
  toggle.setAttribute("aria-label", "Minimera grupp");

  header.appendChild(heading);

  if (showDelete) {
    header.appendChild(
      createDeleteControl({
        category: "groups",
        compact: false,
        onDelete: () => deleteGroupById(groupId),
      })
    );
  }

  header.appendChild(toggle);
  header.addEventListener("click", onToggle);

  const body = document.createElement("div");
  body.className = "group-box-body";

  if (docsInGroup.length === 0) {
    const empty = document.createElement("div");
    empty.className = "group-dock-item-empty";
    empty.textContent = "Inga projekt än.";
    body.appendChild(empty);
  } else {
    docsInGroup.forEach((doc) => {
      const item = document.createElement("div");
      item.className = "group-dock-item";
      item.textContent = `${doc.type === "draw" ? "🎨" : "📝"} ${doc.title}`;
      item.addEventListener("click", () => goToMindmapDoc(doc.id));
      body.appendChild(item);
    });
  }

  box.appendChild(header);
  box.appendChild(body);
  return box;
}

function renderSubjectCardsInto(container) {
  if (!container) return;
  container.innerHTML = "";

  SUBJECTS.forEach((subject) => {
    const noteCount = mindmapDocs.filter((d) => d.subject === subject).length;

    const card = document.createElement("div");
    card.className = "card";
    const nameEl = document.createElement("h3");
    nameEl.textContent = subject;
    const countEl = document.createElement("p");
    countEl.className = "muted";
    countEl.textContent = `${noteCount} ${noteCount === 1 ? "anteckning" : "anteckningar"}`;
    card.appendChild(nameEl);
    card.appendChild(countEl);
    container.appendChild(card);
  });
}

// Feeds the Ämnen panel under Schema. (It used to also feed GroupDock's
// own Ämnen section, before that tab was folded into Mindmap.)
function renderGroupDockSubjects() {
  renderSubjectCardsInto(scheduleSubjects);
}

// Renders the group overview into the Mindmap panel -- one group's
// projects, or every group at once when showing ALL_GROUPS. This is the
// old GroupDock view, now living inside Mindmap.
function renderGroupView() {
  groupViewList.innerHTML = "";
  renderGroupDockSubjects();

  const showAll = activeGroupViewId === ALL_GROUPS;
  const groupsToShow = showAll
    ? mindmapGroups
    : mindmapGroups.filter((g) => g.id === activeGroupViewId);

  groupViewIntro.textContent = showAll
    ? "Alla grupper. Klicka på ett projekt för att öppna det."
    : "Klicka på ett projekt för att öppna det.";

  groupsToShow.forEach((group) => {
    const docsInGroup = mindmapDocs.filter((d) => d.groupId === group.id);
    const box = buildGroupBox(
      group.name,
      group.id,
      docsInGroup,
      group.collapsed,
      () => {
        group.collapsed = !group.collapsed;
        saveGroups();
        renderGroupView();
        renderDocList();
      },
      true,
      group.subject
    );
    groupViewList.appendChild(box);
  });

  // Ungrouped documents only belong in the combined overview -- a single
  // group's view should show that group and nothing else.
  const ungrouped = mindmapDocs.filter((d) => !d.groupId);
  if (showAll && ungrouped.length > 0) {
    const box = buildGroupBox(
      "Ogrupperat",
      null,
      ungrouped,
      ungroupedCollapsed,
      () => {
        ungroupedCollapsed = !ungroupedCollapsed;
        saveUngroupedCollapsed();
        renderGroupView();
        renderDocList();
      },
      false
    );
    groupViewList.appendChild(box);
  }

  if (groupViewList.children.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = showAll
      ? "Inga grupper eller dokument än. Skapa en grupp för att komma igång."
      : "Den här gruppen finns inte längre.";
    groupViewList.appendChild(empty);
  }
}

// Re-renders the overview only when it's the thing currently on screen,
// so edits made while a document is open don't disturb the editor.
function renderGroupViewIfOpen() {
  renderGroupDockSubjects();
  if (activeGroupViewId !== null) renderGroupView();
}

// Opens the group overview in the main panel, replacing whichever editor
// was showing. Mirrors selectDoc, but for a group.
function showGroupView(groupId) {
  activeGroupViewId = groupId;
  currentDocId = null;
  closeSendDocPopover();

  docToolbar.hidden = true;
  textEditor.hidden = true;
  textToolbar.hidden = true;
  drawArea.hidden = true;
  mindmapEmpty.hidden = true;
  groupView.hidden = false;

  deleteDocArm.disarm();
  clearCanvasArm.disarm();
  closeColorPicker();

  renderGroupView();
  renderGroupList();
  renderDocList();
}

function showEmptyState() {
  currentDocId = null;
  activeGroupViewId = null;
  closeSendDocPopover();
  docToolbar.hidden = true;
  textEditor.hidden = true;
  textToolbar.hidden = true;
  drawArea.hidden = true;
  groupView.hidden = true;
  mindmapEmpty.hidden = false;
  deleteDocArm.disarm();
  clearCanvasArm.disarm();
  bucketActive = false;
  bucketBtn.classList.remove("active");
  closeColorPicker();
  renderDocList();
  renderGroupList();
}

// The two interchangeable bitmap shapes a draw doc can have -- landscape is
// CANVAS_NATIVE_WIDTH x CANVAS_NATIVE_HEIGHT, portrait is the same pair
// swapped. Kept as one helper so every place that needs "the size for this
// orientation" (loading a doc, toggling orientation) agrees on it.
function drawCanvasSizeFor(orientation) {
  const long = Math.max(CANVAS_NATIVE_WIDTH, CANVAS_NATIVE_HEIGHT);
  const short = Math.min(CANVAS_NATIVE_WIDTH, CANVAS_NATIVE_HEIGHT);
  return orientation === "portrait" ? { width: short, height: long } : { width: long, height: short };
}

function loadDrawDocIntoCanvas(doc) {
  // The bitmap is a fixed size per orientation (see drawCanvasSizeFor) --
  // only its content, orientation and the view onto it change per doc.
  // Assigning width/height resets it to fully transparent, which is
  // exactly what's needed here; the background is never part of the
  // raster, it's a CSS color behind it (see setDrawingBackground), so
  // there's no pixel recoloring left to introduce noise when it changes.
  const size = drawCanvasSizeFor(doc.orientation);
  drawCanvas.width = size.width;
  drawCanvas.height = size.height;
  drawCanvas.style.background = doc.bgColor || "#ffffff";

  if (doc.content) {
    const img = new Image();
    img.onload = () => {
      drawCtx.imageSmoothingEnabled = false;
      // Drawn at its natural size, unscaled -- a saved doc's image is
      // always exactly its own orientation's size already (that's what it
      // was saved from), so this is a plain 1:1 restore.
      drawCtx.drawImage(img, 0, 0);
    };
    img.src = doc.content;
  }
}

// Swaps a draw doc's canvas between landscape and portrait -- a deliberate,
// explicit reshape (like flipping a sheet of paper), unrelated to the
// resize-driven rescaling that's deliberately never done elsewhere. The
// existing drawing is kept, anchored top-left; anything beyond the new
// bounds is clipped rather than squeezed to fit, the same tradeoff a real
// sheet of paper has when you turn it sideways.
function setDrawOrientation(doc, orientation) {
  if ((doc.orientation || "landscape") === orientation) return;
  const snapshot = drawCanvas.toDataURL("image/png");
  doc.orientation = orientation;
  doc.updatedAt = Date.now();
  saveMindmapDocs();

  const size = drawCanvasSizeFor(orientation);
  drawCanvas.width = size.width;
  drawCanvas.height = size.height;
  drawCanvas.style.background = doc.bgColor || "#ffffff";
  const img = new Image();
  img.onload = () => {
    drawCtx.imageSmoothingEnabled = false;
    drawCtx.drawImage(img, 0, 0);
    saveCanvasToDoc();
  };
  img.src = snapshot;

  updateOrientationUI(doc);
  fitDrawView();
}

function updateOrientationUI(doc) {
  const isPortrait = (doc.orientation || "landscape") === "portrait";
  orientationBtn.classList.toggle("active", isPortrait);
  orientationBtn.textContent = isPortrait ? "↕ Stående" : "↔ Liggande";
  orientationBtn.title = isPortrait ? "Byt till liggande vy" : "Byt till stående vy";
}

function applyDrawTransform() {
  drawCanvas.style.transform = `translate(${drawPanX}px, ${drawPanY}px) scale(${drawZoom})`;
  zoomResetBtn.textContent = `${Math.round(drawZoom * 100)}%`;
}

function clampPanAxis(pan, viewSize, contentSize) {
  const minVisible = Math.min(80, contentSize, viewSize);
  const minPan = minVisible - contentSize;
  const maxPan = viewSize - minVisible;
  if (minPan > maxPan) return (viewSize - contentSize) / 2;
  return Math.min(Math.max(pan, minPan), maxPan);
}

// Keeps at least a sliver of the canvas visible no matter how far it's
// panned, so it's never possible to lose it off-screen entirely.
function clampDrawPan() {
  const wrapRect = drawCanvasWrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) return;
  const scaledW = drawCanvas.width * drawZoom;
  const scaledH = drawCanvas.height * drawZoom;
  drawPanX = clampPanAxis(drawPanX, wrapRect.width, scaledW);
  drawPanY = clampPanAxis(drawPanY, wrapRect.height, scaledH);
}

// Zooms so that the canvas point currently under (anchorClientX,
// anchorClientY) stays under it after the zoom -- defaults to the
// viewport's center for the toolbar +/- buttons, and the cursor position
// for ctrl+wheel zooming.
function setDrawZoom(newZoom, anchorClientX, anchorClientY) {
  const wrapRect = drawCanvasWrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) return;
  const clamped = Math.min(DRAW_ZOOM_MAX, Math.max(DRAW_ZOOM_MIN, newZoom));
  const ax = anchorClientX !== undefined ? anchorClientX - wrapRect.left : wrapRect.width / 2;
  const ay = anchorClientY !== undefined ? anchorClientY - wrapRect.top : wrapRect.height / 2;
  const canvasX = (ax - drawPanX) / drawZoom;
  const canvasY = (ay - drawPanY) / drawZoom;
  drawZoom = clamped;
  drawPanX = ax - canvasX * drawZoom;
  drawPanY = ay - canvasY * drawZoom;
  clampDrawPan();
  applyDrawTransform();
}

// Scales the whole (fixed-size) canvas down to fit inside whatever space
// is currently available, centered -- but never scales it up past 100%,
// so a small canvas in a big window isn't blown up and blurred. This only
// ever runs when a draw doc is first opened (or reoriented), never on a
// later resize -- resizing the window/tab/split should just reveal more
// or less of the canvas at the current zoom, not silently rescale it.
function fitDrawView() {
  const wrapRect = drawCanvasWrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) {
    pendingDrawFit = true;
    return;
  }
  drawZoom = Math.min(wrapRect.width / drawCanvas.width, wrapRect.height / drawCanvas.height, 1);
  drawPanX = (wrapRect.width - drawCanvas.width * drawZoom) / 2;
  drawPanY = (wrapRect.height - drawCanvas.height * drawZoom) / 2;
  pendingDrawFit = false;
  applyDrawTransform();
}

function selectDoc(id) {
  const doc = mindmapDocs.find((d) => d.id === id);
  if (!doc) return;

  currentDocId = id;
  activeGroupViewId = null;
  groupView.hidden = true;
  closeSendDocPopover();
  mindmapEmpty.hidden = true;
  docToolbar.hidden = false;
  docTitleInput.value = doc.title;
  deleteDocArm.disarm();
  clearCanvasArm.disarm();
  bucketActive = false;
  bucketBtn.classList.remove("active");
  panActive = false;
  panBtn.classList.remove("active");
  drawCanvasWrap.classList.remove("pan-mode");
  closeColorPicker();
  undoStack = [];
  updateUndoButtonState();

  if (doc.type === "text") {
    textEditor.hidden = false;
    textToolbar.hidden = false;
    drawArea.hidden = true;
    textEditor.innerHTML = doc.content || "";
    updateEditorPlaceholder();
    updateToolbarState();
  } else {
    textEditor.hidden = true;
    textToolbar.hidden = true;
    drawArea.hidden = false;
    loadDrawDocIntoCanvas(doc);
    updateBgColorUI(doc.bgColor || "#ffffff");
    updateOrientationUI(doc);
    fitDrawView();
  }

  renderDocList();
  renderGroupList();
}

function updateBgColorUI(bgColor) {
  bgColorSwatch.style.background = bgColor;
}

function createDoc(type, title, subject, groupId) {
  const doc = {
    id: `doc-${Date.now()}`,
    title,
    type,
    content: "",
    bgColor: "#ffffff",
    groupId: groupId || null,
    subject: subject || "",
    updatedAt: Date.now(),
  };
  mindmapDocs.unshift(doc);
  saveMindmapDocs();
  selectDoc(doc.id);
  renderGroupList();
  renderGroupViewIfOpen();
}

// Browser confirm()/alert() dialogs are blocked in some sandboxed
// preview environments, which would make destructive buttons appear
// to do nothing. Use a "click again to confirm" pattern instead --
// it needs no native dialog and works everywhere.
function armConfirm(button, confirmLabel, onConfirm) {
  const originalLabel = button.textContent;
  let armed = false;
  let timer = null;

  function disarm() {
    armed = false;
    clearTimeout(timer);
    button.textContent = originalLabel;
    button.classList.remove("confirm-armed");
  }

  button.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      button.textContent = confirmLabel;
      button.classList.add("confirm-armed");
      timer = setTimeout(disarm, 3000);
    } else {
      disarm();
      onConfirm();
    }
  });

  return { disarm };
}

function deleteDocById(id) {
  const wasCurrent = id === currentDocId;
  mindmapDocs = mindmapDocs.filter((d) => d.id !== id);
  saveMindmapDocs();

  if (wasCurrent) {
    if (mindmapDocs.length > 0) {
      selectDoc(mindmapDocs[0].id);
    } else {
      showEmptyState();
    }
  } else {
    renderDocList();
  }

  renderGroupList();
  renderGroupViewIfOpen();
}

function deleteCurrentDoc() {
  if (!currentDocId) return;
  deleteDocById(currentDocId);
}

newDocBtn.addEventListener("click", () => {
  newDocForm.hidden = !newDocForm.hidden;
  newDocBtn.classList.toggle("open", !newDocForm.hidden);
  if (!newDocForm.hidden) newDocInput.focus();
});

function submitNewDoc() {
  const title = newDocInput.value.trim();
  if (!title) return;

  const targetGroupId = newDocGroup.value || null;
  const targetGroup = mindmapGroups.find((g) => g.id === targetGroupId);
  let subject = newDocSubject.value;

  if (targetGroup && targetGroup.subject) {
    if (subject && subject !== targetGroup.subject) {
      showAppModal(
        "Kan inte lägga till dokumentet",
        `Gruppen "${targetGroup.name}" har ämnet "${targetGroup.subject}". En grupp kan bara innehålla ett ämne, så ett dokument med ett annat ämne kan inte läggas till. Välj samma ämne, eller lämna ämnesfältet på "Inget ämne" så sätts det automatiskt till gruppens ämne.`
      );
      return;
    }
    subject = targetGroup.subject;
  }

  createDoc(newDocType.value, title, subject, targetGroupId);
  newDocInput.value = "";
  newDocSubject.value = "";
  newDocType.value = "text";
  newDocForm.hidden = true;
  newDocBtn.classList.remove("open");
}

confirmNewDocBtn.addEventListener("click", submitNewDoc);
newDocInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitNewDoc();
});

const deleteDocArm = armConfirm(deleteDocBtn, "Säker? Klicka igen", deleteCurrentDoc);

docTitleInput.addEventListener("input", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  doc.title = docTitleInput.value.trim() || (doc.type === "draw" ? "Namnlös ritning" : "Namnlöst dokument");
  doc.updatedAt = Date.now();
  saveMindmapDocs();
  renderDocList();
});

function saveTextDocContent() {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  doc.content = textEditor.innerHTML;
  doc.updatedAt = Date.now();
  saveMindmapDocs();
}

function updateEditorPlaceholder() {
  const text = textEditor.textContent.replace(/​/g, "").trim();
  const isEmpty = text === "" && !textEditor.querySelector("img");
  textEditor.classList.toggle("is-empty", isEmpty);
}

let savedTextRange = null;

function saveTextSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0 && textEditor.contains(sel.anchorNode)) {
    savedTextRange = sel.getRangeAt(0);
  }
}

function restoreTextSelection() {
  if (!savedTextRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedTextRange);
}

const FONT_SIZE_OPTIONS = Array.from(textSizeSelect.options).map((opt) => Number(opt.value));

function getCurrentFontSizePx() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if (!node || !textEditor.contains(node)) return null;
  const px = parseFloat(window.getComputedStyle(node).fontSize);
  if (!px) return null;
  // Snap to the nearest option so the select always shows a concrete value
  // instead of blanking out on sizes that fall between our fixed steps.
  return FONT_SIZE_OPTIONS.reduce((closest, option) =>
    Math.abs(option - px) < Math.abs(closest - px) ? option : closest
  );
}

function updateToolbarState() {
  textToolBtns.forEach((btn) => {
    let isActive = false;
    try {
      isActive = document.queryCommandState(btn.dataset.cmd);
    } catch (e) {
      isActive = false;
    }
    btn.classList.toggle("active", isActive);
  });

  let blockFormat = "P";
  try {
    blockFormat = (document.queryCommandValue("formatBlock") || "P").toUpperCase();
  } catch (e) {
    blockFormat = "P";
  }
  textFormatSelect.value = ["H1", "H2", "H3"].includes(blockFormat) ? blockFormat : "P";

  const sizePx = getCurrentFontSizePx();
  if (sizePx) textSizeSelect.value = String(sizePx);
}

textEditor.addEventListener("input", () => {
  saveTextDocContent();
  updateEditorPlaceholder();
});
textEditor.addEventListener("keyup", () => {
  saveTextSelection();
  updateToolbarState();
});
textEditor.addEventListener("mouseup", () => {
  saveTextSelection();
  updateToolbarState();
});
document.addEventListener("selectionchange", () => {
  if (document.activeElement === textEditor) {
    saveTextSelection();
    updateToolbarState();
  }
});

textToolBtns.forEach((btn) => {
  btn.addEventListener("mousedown", (event) => event.preventDefault());
  btn.addEventListener("click", () => {
    document.execCommand(btn.dataset.cmd, false, null);
    saveTextSelection();
    textEditor.focus();
    saveTextDocContent();
    updateToolbarState();
  });
});

textFormatSelect.addEventListener("change", () => {
  textEditor.focus();
  restoreTextSelection();
  document.execCommand("formatBlock", false, textFormatSelect.value);
  saveTextSelection();
  saveTextDocContent();
  updateToolbarState();
});

// Selects the visual line the caret is on (like Word does when you change a
// line's size without highlighting text first), so you don't have to
// manually select the whole line every time you want to resize it.
const LINE_BLOCK_TAGS = new Set(["DIV", "P", "H1", "H2", "H3", "LI"]);

function getCurrentLineElement() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== textEditor) {
    if (LINE_BLOCK_TAGS.has(node.tagName)) return node;
    node = node.parentElement;
  }
  return null;
}

function selectCurrentLine() {
  const lineEl = getCurrentLineElement();
  if (!lineEl) return false;
  const range = document.createRange();
  range.selectNodeContents(lineEl);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

// On a genuinely empty line there's no text to select and wrap, so
// execCommand("fontSize") on a collapsed caret just registers a "typing
// style" that only turns into a real <font size="7"> once a character is
// typed -- by then our one-shot size-attribute-to-px conversion has already
// run and won't catch it, leaving typed text at the browser's default legacy
// size instead of the chosen px value. Planting an explicitly-sized empty
// span at the caret sidesteps that: typed text lands inside it directly.
function applyFontSizeToEmptyLine(container, px) {
  const span = document.createElement("span");
  span.style.fontSize = `${px}px`;
  const marker = document.createTextNode("​");
  span.appendChild(marker);

  container.innerHTML = "";
  container.appendChild(span);

  const range = document.createRange();
  range.setStart(marker, 1);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function applyFontSize(px) {
  textEditor.focus();
  restoreTextSelection();

  const sel = window.getSelection();
  const hasRealSelection = sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed;

  if (!hasRealSelection) {
    const lineEl = getCurrentLineElement();
    const emptyContainer = lineEl || (textEditor.textContent.trim() === "" ? textEditor : null);
    if (emptyContainer && emptyContainer.textContent.trim() === "") {
      applyFontSizeToEmptyLine(emptyContainer, px);
      saveTextSelection();
      saveTextDocContent();
      updateToolbarState();
      return;
    }
    selectCurrentLine();
  }

  document.execCommand("fontSize", false, "7");
  textEditor.querySelectorAll('font[size="7"]').forEach((el) => {
    el.removeAttribute("size");
    el.style.fontSize = px + "px";
  });
  saveTextSelection();
  saveTextDocContent();
  updateToolbarState();
}

textSizeSelect.addEventListener("change", () => {
  applyFontSize(Number(textSizeSelect.value));
});

textColorInput.addEventListener("input", () => {
  textEditor.focus();
  restoreTextSelection();
  document.execCommand("foreColor", false, textColorInput.value);
  saveTextSelection();
  saveTextDocContent();
});

function getCanvasPos(event) {
  // The canvas's rendered box already reflects the current pan/zoom
  // transform, so dividing by drawZoom here converts a screen position
  // back into a stable canvas-bitmap pixel coordinate regardless of how
  // far in/out the view currently is.
  const rect = drawCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / drawZoom, y: (event.clientY - rect.top) / drawZoom };
}

function saveCanvasToDoc() {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  doc.content = drawCanvas.toDataURL("image/png");
  doc.updatedAt = Date.now();
  saveMindmapDocs();
}

function updateUndoButtonState() {
  undoDrawBtn.disabled = undoStack.length === 0;
}

function pushUndoSnapshot() {
  undoStack.push(drawCanvas.toDataURL("image/png"));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  updateUndoButtonState();
}

function undoLastStroke() {
  if (undoStack.length === 0) return;
  const snapshot = undoStack.pop();
  const img = new Image();
  img.onload = () => {
    drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    drawCtx.drawImage(img, 0, 0);
    saveCanvasToDoc();
  };
  img.src = snapshot;
  updateUndoButtonState();
}

undoDrawBtn.addEventListener("click", undoLastStroke);

function currentBgColor() {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  return (doc && doc.bgColor) || "#ffffff";
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function sampleCanvasColorAt(x, y) {
  const px = Math.max(0, Math.min(drawCanvas.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(drawCanvas.height - 1, Math.round(y)));
  const pixel = drawCtx.getImageData(px, py, 1, 1).data;
  // Nothing drawn there -- what's actually visible is the CSS background.
  if (pixel[3] === 0) return currentBgColor();
  return rgbToHex(pixel[0], pixel[1], pixel[2]);
}

let eyedropperActive = false;

// A drag that starts outside the draw canvas (say, on the sidebar) and is
// then dragged onto it while still held was found to permanently break
// pointer-event dispatch to the whole page in Chromium, once the drag
// crosses through a few different elements on its way in (sidebar, then a
// toolbar button, for instance) -- every draw/pan attempt afterward, for
// the rest of the page's life, got cut short to a single pointermove and
// then nothing, even though the button was still genuinely held. A drag
// that only ever stays within one element on its way to the canvas never
// triggered it. Rather than chase that specific dispatch bug, this
// sidesteps it: the moment any press starts somewhere that isn't a control
// with its own click behavior, a full-page transparent overlay (see
// #dragGuardOverlay) is shown for the rest of that gesture, giving the
// browser exactly one element to keep dispatching to no matter how far the
// cursor wanders before it reaches the canvas.
// Crucially this only ever engages once the pointer has actually moved --
// showing it on pointerdown instead would make the release land on the
// overlay rather than on whatever was pressed, which suppresses the click
// entirely and leaves every non-excluded control in the app dead.
const DRAG_GUARD_THRESHOLD_PX = 6;
let pendingDragGuard = null;

// drawArea.hidden alone isn't enough: it stays false whenever a draw doc
// is the open document, even while a completely different tab is showing,
// so this has to check the element is genuinely rendered right now.
function drawAreaVisible() {
  return !drawArea.hidden && drawArea.getClientRects().length > 0;
}

document.addEventListener(
  "pointerdown",
  (event) => {
    if (!drawAreaVisible()) return;
    // Excludes anything with an already-working drag of its own -- native
    // HTML5 drag-and-drop (the tab bar's docking, [draggable="true"])
    // doesn't fire the pointerup/pointercancel this overlay relies on to
    // hide itself again, and the split divider / color wheel drags don't
    // need this protection in the first place.
    if (
      event.target.closest("input, textarea, [draggable='true'], #splitDivider, #colorWheel")
    ) {
      return;
    }
    pendingDragGuard = { x: event.clientX, y: event.clientY };
  },
  true
);

window.addEventListener("pointermove", (event) => {
  if (!pendingDragGuard) return;
  if (
    Math.abs(event.clientX - pendingDragGuard.x) < DRAG_GUARD_THRESHOLD_PX &&
    Math.abs(event.clientY - pendingDragGuard.y) < DRAG_GUARD_THRESHOLD_PX
  ) {
    return;
  }
  pendingDragGuard = null;
  dragGuardOverlay.hidden = false;
});

function hideDragGuardOverlay() {
  pendingDragGuard = null;
  dragGuardOverlay.hidden = true;
}

window.addEventListener("pointerup", hideDragGuardOverlay);
window.addEventListener("pointercancel", hideDragGuardOverlay);
// Belt-and-suspenders: also hide on a native drag starting (shouldn't
// happen given the [draggable] exclusion above, but would otherwise leave
// the overlay stuck since native drag doesn't fire pointerup) and if the
// window loses focus mid-gesture (the button was released outside the
// browser entirely).
window.addEventListener("dragstart", hideDragGuardOverlay);
window.addEventListener("blur", hideDragGuardOverlay);

// Stroke and pan dragging are tracked with window-level pointermove/up
// listeners added only while a gesture is active, rather than the more
// obvious drawCanvas.setPointerCapture() -- capture looks right for this
// (redirect events to the canvas even once the cursor wanders outside it
// mid-stroke) but isn't needed now that the overlay above already keeps
// every event targeted at one stable element, and window-level listeners
// are the simpler, more standard pattern for canvas painting anyway.
function beginStroke(event) {
  isDrawingStroke = true;
  pushUndoSnapshot();
  const pos = getCanvasPos(event);
  drawCtx.beginPath();
  drawCtx.moveTo(pos.x, pos.y);
  window.addEventListener("pointermove", onStrokeMove);
  window.addEventListener("pointerup", onStrokeEnd);
  window.addEventListener("pointercancel", onStrokeEnd);
}

function onStrokeMove(event) {
  if (!isDrawingStroke) return;
  // Belt-and-suspenders: if a move ever arrives showing no buttons held at
  // all, the pointerup itself was missed -- treat this as the end of the
  // stroke instead of leaving it stuck "in progress".
  if (event.buttons === 0) {
    onStrokeEnd();
    return;
  }
  updateBrushCursor(event.clientX, event.clientY);
  const pos = getCanvasPos(event);
  // Erasing removes ink (destination-out) instead of painting over it with
  // the background color -- the canvas never contains the background at
  // all, so this works correctly no matter what the background is set to.
  drawCtx.globalCompositeOperation = eraserActive ? "destination-out" : "source-over";
  drawCtx.strokeStyle = currentColor;
  drawCtx.lineWidth = Number(brushSizeInput.value);
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.lineTo(pos.x, pos.y);
  drawCtx.stroke();
}

function onStrokeEnd() {
  if (!isDrawingStroke) return;
  isDrawingStroke = false;
  drawCtx.globalCompositeOperation = "source-over";
  saveCanvasToDoc();
  window.removeEventListener("pointermove", onStrokeMove);
  window.removeEventListener("pointerup", onStrokeEnd);
  window.removeEventListener("pointercancel", onStrokeEnd);
}

function beginPan(event) {
  isPanningNow = true;
  panPointerStart = { x: event.clientX, y: event.clientY, panX: drawPanX, panY: drawPanY };
  drawCanvasWrap.classList.add("panning");
  window.addEventListener("pointermove", onPanMove);
  window.addEventListener("pointerup", onPanEnd);
  window.addEventListener("pointercancel", onPanEnd);
}

function onPanMove(event) {
  if (!isPanningNow) return;
  if (event.buttons === 0) {
    onPanEnd();
    return;
  }
  drawPanX = panPointerStart.panX + (event.clientX - panPointerStart.x);
  drawPanY = panPointerStart.panY + (event.clientY - panPointerStart.y);
  clampDrawPan();
  applyDrawTransform();
}

function onPanEnd() {
  if (!isPanningNow) return;
  isPanningNow = false;
  panPointerStart = null;
  drawCanvasWrap.classList.remove("panning");
  window.removeEventListener("pointermove", onPanMove);
  window.removeEventListener("pointerup", onPanEnd);
  window.removeEventListener("pointercancel", onPanEnd);
}

drawCanvas.addEventListener("pointerdown", (event) => {
  // The pan tool, or the middle mouse button regardless of active tool
  // (a common drawing-app convention), moves the view instead of drawing.
  if (panActive || event.button === 1) {
    event.preventDefault();
    beginPan(event);
    return;
  }

  if (eyedropperActive) {
    const pos = getCanvasPos(event);
    colorPickerInput.value = sampleCanvasColorAt(pos.x, pos.y);
    eyedropperActive = false;
    eyedropperBtn.classList.remove("active");
    return;
  }

  if (bucketActive) {
    const pos = getCanvasPos(event);
    floodFillAt(Math.round(pos.x), Math.round(pos.y), currentColor);
    return;
  }

  beginStroke(event);
});

let lastPointerClient = null;

function updateBrushCursor(clientX, clientY) {
  lastPointerClient = { x: clientX, y: clientY };
  if (panActive || isPanningNow) {
    brushCursor.hidden = true;
    return;
  }
  brushCursor.hidden = false;
  // Positioned relative to the wrap (brushCursor's actual containing
  // block), not the canvas -- the canvas itself is offset within the wrap
  // by the current pan, so using its rect here would double-count that
  // offset. The size is scaled by drawZoom so the preview matches where a
  // stroke will actually land on screen at the current zoom.
  const wrapRect = drawCanvasWrap.getBoundingClientRect();
  const size = Number(brushSizeInput.value) * drawZoom;
  brushCursor.style.width = `${size}px`;
  brushCursor.style.height = `${size}px`;
  brushCursor.style.left = `${clientX - wrapRect.left - size / 2}px`;
  brushCursor.style.top = `${clientY - wrapRect.top - size / 2}px`;
}

drawCanvas.addEventListener("pointerenter", (event) => {
  updateBrushCursor(event.clientX, event.clientY);
});

drawCanvas.addEventListener("pointerleave", () => {
  brushCursor.hidden = true;
  lastPointerClient = null;
});

// Just the hover preview here -- an active stroke or pan is tracked by its
// own window-level listeners (see beginStroke/beginPan above), so this
// only needs to handle the brush cursor while hovering with nothing held.
drawCanvas.addEventListener("pointermove", (event) => {
  if (isDrawingStroke || isPanningNow) return;
  updateBrushCursor(event.clientX, event.clientY);
});

function setPenColor(color) {
  currentColor = color;
  eraserActive = false;
  eraserBtn.classList.remove("active");
  brushSizeInput.value = penSize;
  penColorSwatch.style.background = color;
  if (lastPointerClient) updateBrushCursor(lastPointerClient.x, lastPointerClient.y);
}

eraserBtn.addEventListener("click", () => {
  eraserActive = !eraserActive;
  eraserBtn.classList.toggle("active", eraserActive);
  brushSizeInput.value = eraserActive ? eraserSize : penSize;
  if (lastPointerClient) updateBrushCursor(lastPointerClient.x, lastPointerClient.y);
});

brushSizeInput.addEventListener("input", () => {
  if (eraserActive) {
    eraserSize = Number(brushSizeInput.value);
    localStorage.setItem(ERASER_SIZE_KEY, String(eraserSize));
  } else {
    penSize = Number(brushSizeInput.value);
    localStorage.setItem(PEN_SIZE_KEY, String(penSize));
  }
  if (lastPointerClient) updateBrushCursor(lastPointerClient.x, lastPointerClient.y);
});

let bucketActive = false;

// A real paint-bucket: fills the connected region of similar color/alpha
// touching the clicked pixel, stopping at stroke boundaries -- not the
// whole canvas. Iterative (stack-based) to avoid recursion depth limits on
// large filled areas.
function floodFillAt(startX, startY, fillHex) {
  const width = drawCanvas.width;
  const height = drawCanvas.height;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return;

  const [fr, fg, fb] = hexToRgb(fillHex);
  const imageData = drawCtx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const startIndex = (startY * width + startX) * 4;
  const startR = data[startIndex];
  const startG = data[startIndex + 1];
  const startB = data[startIndex + 2];
  const startA = data[startIndex + 3];

  if (startR === fr && startG === fg && startB === fb && startA === 255) return;

  pushUndoSnapshot();

  // Same tolerance idea as the background recolor: absorbs anti-aliased
  // pixels along the enclosing stroke's edge instead of leaving a thin
  // unfilled rim right next to the boundary.
  const tolerance = 40;
  function matches(i) {
    const dr = data[i] - startR;
    const dg = data[i + 1] - startG;
    const db = data[i + 2] - startB;
    const da = data[i + 3] - startA;
    return Math.sqrt(dr * dr + dg * dg + db * db + da * da) <= tolerance;
  }

  const visited = new Uint8Array(width * height);
  const stack = [[startX, startY]];

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const pxIndex = y * width + x;
    if (visited[pxIndex]) continue;

    const i = pxIndex * 4;
    if (!matches(i)) continue;

    visited[pxIndex] = 1;
    data[i] = fr;
    data[i + 1] = fg;
    data[i + 2] = fb;
    data[i + 3] = 255;

    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  drawCtx.putImageData(imageData, 0, 0);
  saveCanvasToDoc();
}

bucketBtn.addEventListener("click", () => {
  bucketActive = !bucketActive;
  bucketBtn.classList.toggle("active", bucketActive);
  if (bucketActive) {
    eraserActive = false;
    eraserBtn.classList.remove("active");
    eyedropperActive = false;
    eyedropperBtn.classList.remove("active");
  }
});

panBtn.addEventListener("click", () => {
  panActive = !panActive;
  panBtn.classList.toggle("active", panActive);
  drawCanvasWrap.classList.toggle("pan-mode", panActive);
});

zoomInBtn.addEventListener("click", () => setDrawZoom(drawZoom * DRAW_ZOOM_STEP));
zoomOutBtn.addEventListener("click", () => setDrawZoom(drawZoom / DRAW_ZOOM_STEP));
zoomResetBtn.addEventListener("click", () => setDrawZoom(1));
fitViewBtn.addEventListener("click", fitDrawView);

orientationBtn.addEventListener("click", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc || doc.type !== "draw") return;
  setDrawOrientation(doc, (doc.orientation || "landscape") === "portrait" ? "landscape" : "portrait");
});

// Trackpad/mouse-wheel navigation of the canvas: plain scroll pans, and
// ctrl+scroll (also how browsers report a trackpad pinch gesture) zooms
// centered on the cursor -- the same convention as Figma/Google Maps.
drawCanvasWrap.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.ctrlKey) {
      const factor = Math.exp(-event.deltaY * 0.01);
      setDrawZoom(drawZoom * factor, event.clientX, event.clientY);
    } else {
      drawPanX -= event.deltaX;
      drawPanY -= event.deltaY;
      clampDrawPan();
      applyDrawTransform();
    }
  },
  { passive: false }
);

// The background is a CSS color behind the (otherwise transparent) canvas,
// never baked into the raster -- so changing it is just a metadata update,
// with no pixel processing that could introduce noise, and no limit on how
// many times it's applied.
function setDrawingBackground(newColor) {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc || doc.type !== "draw") return;
  if (doc.bgColor === newColor) return;

  doc.bgColor = newColor;
  doc.updatedAt = Date.now();
  saveMindmapDocs();
  drawCanvas.style.background = newColor;
  updateBgColorUI(newColor);
}

function clearCanvas() {
  pushUndoSnapshot();
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  saveCanvasToDoc();
}

const clearCanvasArm = armConfirm(clearCanvasBtn, "Säker? Klicka igen", clearCanvas);

// ---------- Shared pen/background color picker popover ----------

const RECENT_COLORS_KEY = "schoolos-recent-pen-colors";

function loadRecentColors() {
  const raw = localStorage.getItem(RECENT_COLORS_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {
    // ignore malformed storage
  }
  return [];
}

let recentColors = loadRecentColors();

function addRecentColor(color) {
  recentColors = [color, ...recentColors.filter((c) => c !== color)].slice(0, 3);
  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recentColors));
  renderRecentColors();
}

function renderRecentColors() {
  colorPickerRecent.innerHTML = "";
  if (recentColors.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted color-picker-recent-empty";
    empty.textContent = "Inga ännu.";
    colorPickerRecent.appendChild(empty);
    return;
  }
  recentColors.forEach((color) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "recent-color-btn";
    btn.style.background = color;
    btn.title = color;
    btn.addEventListener("click", () => {
      colorPickerInput.value = color;
    });
    colorPickerRecent.appendChild(btn);
  });
}

let colorPickerTarget = null;

function closeColorPicker() {
  colorPickerPopover.hidden = true;
  colorPickerTarget = null;
  eyedropperActive = false;
  eyedropperBtn.classList.remove("active");
}

function openColorPicker(target) {
  colorPickerTarget = target;
  colorPickerInput.value = target === "pen" ? currentColor : currentBgColor();
  renderRecentColors();
  colorPickerPopover.hidden = false;
}

function toggleColorPicker(target) {
  if (colorPickerTarget === target && !colorPickerPopover.hidden) {
    closeColorPicker();
  } else {
    openColorPicker(target);
  }
}

penColorBtn.addEventListener("click", () => toggleColorPicker("pen"));
bgColorBtn.addEventListener("click", () => toggleColorPicker("bg"));
colorPickerCancelBtn.addEventListener("click", closeColorPicker);

colorPickerApplyBtn.addEventListener("click", () => {
  const color = colorPickerInput.value;
  if (colorPickerTarget === "pen") {
    setPenColor(color);
    addRecentColor(color);
  } else if (colorPickerTarget === "bg") {
    setDrawingBackground(color);
    addRecentColor(color);
  }
  closeColorPicker();
});

eyedropperBtn.addEventListener("click", () => {
  eyedropperActive = !eyedropperActive;
  eyedropperBtn.classList.toggle("active", eyedropperActive);
});

// Deliberately does NOT rescale or re-fit the canvas on resize -- the
// bitmap and the current zoom are both fixed, so a bigger window just
// reveals more of the same canvas. Re-clamping the pan here only guards
// against a drastic shrink pushing the canvas fully out of view.
window.addEventListener("resize", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (doc && doc.type === "draw" && !drawArea.hidden) {
    clampDrawPan();
    applyDrawTransform();
  }
});

newGroupBtn.addEventListener("click", () => {
  newGroupForm.hidden = !newGroupForm.hidden;
  newGroupBtn.classList.toggle("open", !newGroupForm.hidden);
  if (!newGroupForm.hidden) newGroupInput.focus();
});

function submitNewGroup() {
  createGroup(newGroupInput.value, newGroupSubject.value);
  newGroupInput.value = "";
  newGroupSubject.value = "";
  newGroupForm.hidden = true;
  newGroupBtn.classList.remove("open");
}

confirmNewGroupBtn.addEventListener("click", submitNewGroup);
newGroupInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitNewGroup();
});

renderGroupList();
renderNewDocGroupOptions();
renderGroupDockSubjects();
renderTeachers();
renderTeachersBreadcrumb();
renderSubjects();
renderSubjectsBreadcrumb();

if (mindmapDocs.length > 0) {
  selectDoc(mindmapDocs[0].id);
} else {
  showEmptyState();
}

// Restore a split view left over from a previous session, now that every
// tab's own init (mindmapDocs, GroupDock, etc.) has actually run.
if (findDockPairByHost(currentActiveTab)) {
  activateTab(currentActiveTab);
}
