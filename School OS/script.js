const tabButtons = document.querySelectorAll(".tab-btn");
const pages = document.querySelectorAll(".page");

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.tab;

    tabButtons.forEach((btn) => btn.classList.remove("active"));
    pages.forEach((page) => page.classList.remove("active"));

    button.classList.add("active");
    document.getElementById(targetId).classList.add("active");
  });
});

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
const drawCanvas = document.getElementById("drawCanvas");
const drawCtx = drawCanvas.getContext("2d");
const colorSwatchBtns = document.querySelectorAll(".color-swatch-btn");
const bgSwatchBtns = document.querySelectorAll(".bg-swatch-btn");
const brushSizeInput = document.getElementById("brushSize");
const eraserBtn = document.getElementById("eraserBtn");
const bucketBtn = document.getElementById("bucketBtn");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");
const undoDrawBtn = document.getElementById("undoDrawBtn");
const mindmapEmpty = document.getElementById("mindmapEmpty");
const groupSelector = document.getElementById("groupSelector");
const newGroupBtn = document.getElementById("newGroupBtn");
const newGroupForm = document.getElementById("newGroupForm");
const newGroupInput = document.getElementById("newGroupInput");
const newGroupSubject = document.getElementById("newGroupSubject");
const confirmNewGroupBtn = document.getElementById("confirmNewGroupBtn");
const groupDockList = document.getElementById("groupDockList");
const groupDockCatalog = document.getElementById("groupDockCatalog");
const groupDockSubjects = document.getElementById("groupDockSubjects");
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

let mindmapDocs = loadMindmapDocs();
let mindmapGroups = loadGroups();
let ungroupedCollapsed = loadUngroupedCollapsed();
let currentDocId = null;
let activeGroupId = null;
let currentColor = "#1a1a2e";
let eraserActive = false;
let isDrawingStroke = false;
let undoStack = [];
const UNDO_LIMIT = 20;

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

function renderGroupSelector() {
  groupSelector.innerHTML = "";

  const noneItem = document.createElement("li");
  noneItem.textContent = "Ingen grupp";
  if (activeGroupId === null) noneItem.classList.add("active");
  noneItem.addEventListener("click", () => {
    activeGroupId = null;
    renderGroupSelector();
  });
  groupSelector.appendChild(noneItem);

  mindmapGroups.forEach((group) => {
    const item = document.createElement("li");
    item.textContent = `🗂 ${group.name}`;
    if (group.id === activeGroupId) item.classList.add("active");
    item.addEventListener("click", () => {
      activeGroupId = group.id;
      renderGroupSelector();
    });
    groupSelector.appendChild(item);
  });
}

function createGroup(name, subject) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const group = { id: `grp-${Date.now()}`, name: trimmed, collapsed: false, subject: subject || "" };
  mindmapGroups.push(group);
  saveGroups();
  activeGroupId = group.id;
  renderGroupSelector();
  renderGroupDock();
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

  if (activeGroupId === id) activeGroupId = null;

  renderGroupSelector();
  renderDocList();
  renderGroupDock();
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
  const mindmapPage = document.getElementById("mindmap");
  tabButtons.forEach((btn) => btn.classList.remove("active"));
  pages.forEach((page) => page.classList.remove("active"));
  mindmapTabBtn.classList.add("active");
  mindmapPage.classList.add("active");
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

// Same subject-card renderer feeds both GroupDock's Ämnen section and
// the Ämnen panel under Schema, so document counts stay identical everywhere.
function renderGroupDockSubjects() {
  renderSubjectCardsInto(groupDockSubjects);
  renderSubjectCardsInto(scheduleSubjects);
}

function renderGroupDock() {
  groupDockList.innerHTML = "";
  groupDockCatalog.innerHTML = "";
  renderGroupDockSubjects();

  mindmapGroups.forEach((group) => {
    const docsInGroup = mindmapDocs.filter((d) => d.groupId === group.id);
    const box = buildGroupBox(
      group.name,
      group.id,
      docsInGroup,
      group.collapsed,
      () => {
        group.collapsed = !group.collapsed;
        saveGroups();
        renderGroupDock();
        renderDocList();
      },
      true,
      group.subject
    );
    groupDockList.appendChild(box);

    const catalogItem = document.createElement("li");
    catalogItem.textContent = group.name;
    catalogItem.addEventListener("click", () => {
      document.getElementById(`group-box-${group.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    groupDockCatalog.appendChild(catalogItem);
  });

  const ungrouped = mindmapDocs.filter((d) => !d.groupId);
  if (ungrouped.length > 0) {
    const box = buildGroupBox(
      "Ogrupperat",
      null,
      ungrouped,
      ungroupedCollapsed,
      () => {
        ungroupedCollapsed = !ungroupedCollapsed;
        saveUngroupedCollapsed();
        renderGroupDock();
        renderDocList();
      },
      false
    );
    groupDockList.appendChild(box);

    const catalogItem = document.createElement("li");
    catalogItem.textContent = "Ogrupperat";
    groupDockCatalog.appendChild(catalogItem);
  }

  if (mindmapGroups.length === 0 && ungrouped.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Inga grupper eller dokument än. Skapa en grupp i Mindmap för att komma igång.";
    groupDockList.appendChild(empty);
  }
}

function showEmptyState() {
  currentDocId = null;
  docToolbar.hidden = true;
  textEditor.hidden = true;
  textToolbar.hidden = true;
  drawArea.hidden = true;
  mindmapEmpty.hidden = false;
  deleteDocArm.disarm();
  clearCanvasArm.disarm();
  bucketArm.disarm();
  renderDocList();
}

function resizeDrawCanvas(doc) {
  const rect = drawCanvas.parentElement.getBoundingClientRect();
  drawCanvas.width = Math.max(1, Math.floor(rect.width));
  drawCanvas.height = Math.max(1, Math.floor(rect.height));

  drawCtx.fillStyle = doc.bgColor || "#ffffff";
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

  if (doc.content) {
    const img = new Image();
    img.onload = () => {
      drawCtx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
    };
    img.src = doc.content;
  }
}

function selectDoc(id) {
  const doc = mindmapDocs.find((d) => d.id === id);
  if (!doc) return;

  currentDocId = id;
  mindmapEmpty.hidden = true;
  docToolbar.hidden = false;
  docTitleInput.value = doc.title;
  deleteDocArm.disarm();
  clearCanvasArm.disarm();
  bucketArm.disarm();
  undoStack = [];
  updateUndoButtonState();

  if (doc.type === "text") {
    textEditor.hidden = false;
    textToolbar.hidden = false;
    drawArea.hidden = true;
    textEditor.innerHTML = doc.content || "";
    updateEditorPlaceholder();
  } else {
    textEditor.hidden = true;
    textToolbar.hidden = true;
    drawArea.hidden = false;
    resizeDrawCanvas(doc);
    updateBgSwatchUI(doc.bgColor || "#ffffff");
  }

  renderDocList();
}

function updateBgSwatchUI(bgColor) {
  bgSwatchBtns.forEach((btn) => btn.classList.toggle("active", btn.dataset.bg === bgColor));
}

function createDoc(type, title, subject) {
  const doc = {
    id: `doc-${Date.now()}`,
    title,
    type,
    content: "",
    bgColor: "#ffffff",
    groupId: activeGroupId,
    subject: subject || "",
    updatedAt: Date.now(),
  };
  mindmapDocs.unshift(doc);
  saveMindmapDocs();
  selectDoc(doc.id);
  renderGroupDock();
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

  renderGroupDock();
}

function deleteCurrentDoc() {
  if (!currentDocId) return;
  deleteDocById(currentDocId);
}

newDocBtn.addEventListener("click", () => {
  newDocForm.hidden = !newDocForm.hidden;
  if (!newDocForm.hidden) newDocInput.focus();
});

function submitNewDoc() {
  const title = newDocInput.value.trim();
  if (!title) return;

  const targetGroup = mindmapGroups.find((g) => g.id === activeGroupId);
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

  createDoc(newDocType.value, title, subject);
  newDocInput.value = "";
  newDocSubject.value = "";
  newDocType.value = "text";
  newDocForm.hidden = true;
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
  const isEmpty = textEditor.textContent.trim() === "" && !textEditor.querySelector("img");
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

textEditor.addEventListener("input", () => {
  saveTextDocContent();
  updateEditorPlaceholder();
});
textEditor.addEventListener("keyup", saveTextSelection);
textEditor.addEventListener("mouseup", saveTextSelection);
document.addEventListener("selectionchange", () => {
  if (document.activeElement === textEditor) saveTextSelection();
});

textToolBtns.forEach((btn) => {
  btn.addEventListener("mousedown", (event) => event.preventDefault());
  btn.addEventListener("click", () => {
    document.execCommand(btn.dataset.cmd, false, null);
    saveTextSelection();
    textEditor.focus();
    saveTextDocContent();
  });
});

textFormatSelect.addEventListener("change", () => {
  textEditor.focus();
  restoreTextSelection();
  document.execCommand("formatBlock", false, textFormatSelect.value);
  saveTextSelection();
  saveTextDocContent();
});

function applyFontSize(px) {
  textEditor.focus();
  restoreTextSelection();
  document.execCommand("fontSize", false, "7");
  textEditor.querySelectorAll('font[size="7"]').forEach((el) => {
    el.removeAttribute("size");
    el.style.fontSize = px + "px";
  });
  saveTextSelection();
  saveTextDocContent();
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
  const rect = drawCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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
    drawCtx.drawImage(img, 0, 0, drawCanvas.width, drawCanvas.height);
    saveCanvasToDoc();
  };
  img.src = snapshot;
  updateUndoButtonState();
}

undoDrawBtn.addEventListener("click", undoLastStroke);

drawCanvas.addEventListener("pointerdown", (event) => {
  isDrawingStroke = true;
  pushUndoSnapshot();
  drawCanvas.setPointerCapture(event.pointerId);
  const pos = getCanvasPos(event);
  drawCtx.beginPath();
  drawCtx.moveTo(pos.x, pos.y);
});

function currentBgColor() {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  return (doc && doc.bgColor) || "#ffffff";
}

drawCanvas.addEventListener("pointermove", (event) => {
  if (!isDrawingStroke) return;
  const pos = getCanvasPos(event);
  drawCtx.strokeStyle = eraserActive ? currentBgColor() : currentColor;
  drawCtx.lineWidth = Number(brushSizeInput.value);
  drawCtx.lineCap = "round";
  drawCtx.lineJoin = "round";
  drawCtx.lineTo(pos.x, pos.y);
  drawCtx.stroke();
});

drawCanvas.addEventListener("pointerup", () => {
  if (!isDrawingStroke) return;
  isDrawingStroke = false;
  saveCanvasToDoc();
});

colorSwatchBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    currentColor = btn.dataset.color;
    eraserActive = false;
    eraserBtn.classList.remove("active");
    colorSwatchBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    brushSizeInput.value = penSize;
  });
});

eraserBtn.addEventListener("click", () => {
  eraserActive = !eraserActive;
  eraserBtn.classList.toggle("active", eraserActive);
  brushSizeInput.value = eraserActive ? eraserSize : penSize;
});

brushSizeInput.addEventListener("input", () => {
  if (eraserActive) {
    eraserSize = Number(brushSizeInput.value);
    localStorage.setItem(ERASER_SIZE_KEY, String(eraserSize));
  } else {
    penSize = Number(brushSizeInput.value);
    localStorage.setItem(PEN_SIZE_KEY, String(penSize));
  }
});

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const value = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function fillCanvas(color) {
  pushUndoSnapshot();
  drawCtx.fillStyle = color;
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  saveCanvasToDoc();
}

const bucketArm = armConfirm(bucketBtn, "Säker? Klicka igen", () => fillCanvas(currentColor));

function setDrawingBackground(newColor) {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc || doc.type !== "draw") return;

  const oldColor = doc.bgColor || "#ffffff";
  if (newColor === oldColor) return;

  pushUndoSnapshot();

  const [nr, ng, nb] = hexToRgb(newColor);
  const [or_, og, ob] = hexToRgb(oldColor);
  const imageData = drawCtx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === or_ && data[i + 1] === og && data[i + 2] === ob) {
      data[i] = nr;
      data[i + 1] = ng;
      data[i + 2] = nb;
    }
  }
  drawCtx.putImageData(imageData, 0, 0);

  doc.bgColor = newColor;
  saveCanvasToDoc();
  updateBgSwatchUI(newColor);
}

bgSwatchBtns.forEach((btn) => {
  btn.addEventListener("click", () => setDrawingBackground(btn.dataset.bg));
});

function clearCanvas() {
  pushUndoSnapshot();
  drawCtx.fillStyle = currentBgColor();
  drawCtx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
  saveCanvasToDoc();
}

const clearCanvasArm = armConfirm(clearCanvasBtn, "Säker? Klicka igen", clearCanvas);

window.addEventListener("resize", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (doc && doc.type === "draw" && !drawArea.hidden) {
    resizeDrawCanvas(doc);
  }
});

const mindmapTabBtn = document.querySelector('.tab-btn[data-tab="mindmap"]');
mindmapTabBtn.addEventListener("click", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (doc && doc.type === "draw") {
    resizeDrawCanvas(doc);
  }
});

const groupDockTabBtn = document.querySelector('.tab-btn[data-tab="groupdock"]');
groupDockTabBtn.addEventListener("click", renderGroupDock);

newGroupBtn.addEventListener("click", () => {
  newGroupForm.hidden = !newGroupForm.hidden;
  if (!newGroupForm.hidden) newGroupInput.focus();
});

function submitNewGroup() {
  createGroup(newGroupInput.value, newGroupSubject.value);
  newGroupInput.value = "";
  newGroupSubject.value = "";
  newGroupForm.hidden = true;
}

confirmNewGroupBtn.addEventListener("click", submitNewGroup);
newGroupInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitNewGroup();
});

renderGroupSelector();
renderGroupDockSubjects();

if (mindmapDocs.length > 0) {
  selectDoc(mindmapDocs[0].id);
} else {
  showEmptyState();
}
