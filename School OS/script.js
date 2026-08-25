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

// ---------- Mindmap (documents: text notes + drawings) ----------

const MINDMAP_STORAGE_KEY = "schoolos-mindmap-docs";
const DEFAULT_DOCS = [
  {
    id: "seed-1",
    title: "Idéer inför nationella prov",
    type: "text",
    content: "Saker att öva på:\n- Ekvationer med två okända\n- Källkritik i historia\n- Oregelbundna verb i engelska",
    updatedAt: Date.now(),
  },
];

const docList = document.getElementById("docList");
const newTextDocBtn = document.getElementById("newTextDoc");
const newDrawDocBtn = document.getElementById("newDrawDoc");
const docToolbar = document.getElementById("docToolbar");
const docTitleInput = document.getElementById("docTitleInput");
const deleteDocBtn = document.getElementById("deleteDocBtn");
const textEditor = document.getElementById("textEditor");
const drawArea = document.getElementById("drawArea");
const drawCanvas = document.getElementById("drawCanvas");
const drawCtx = drawCanvas.getContext("2d");
const colorSwatchBtns = document.querySelectorAll(".color-swatch-btn");
const brushSizeInput = document.getElementById("brushSize");
const eraserBtn = document.getElementById("eraserBtn");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");
const mindmapEmpty = document.getElementById("mindmapEmpty");

let mindmapDocs = loadMindmapDocs();
let currentDocId = null;
let currentColor = "#1a1a2e";
let eraserActive = false;
let isDrawingStroke = false;

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

function renderDocList() {
  docList.innerHTML = "";

  if (mindmapDocs.length === 0) {
    const empty = document.createElement("li");
    empty.className = "doc-list-empty";
    empty.textContent = "Inga dokument än.";
    docList.appendChild(empty);
    return;
  }

  mindmapDocs.forEach((doc) => {
    const item = document.createElement("li");
    item.textContent = `${doc.type === "draw" ? "🎨" : "📝"} ${doc.title}`;
    if (doc.id === currentDocId) item.classList.add("active");
    item.addEventListener("click", () => selectDoc(doc.id));
    docList.appendChild(item);
  });
}

function showEmptyState() {
  currentDocId = null;
  docToolbar.hidden = true;
  textEditor.hidden = true;
  drawArea.hidden = true;
  mindmapEmpty.hidden = false;
  deleteDocArm.disarm();
  clearCanvasArm.disarm();
  renderDocList();
}

function resizeDrawCanvas(doc) {
  const rect = drawCanvas.parentElement.getBoundingClientRect();
  drawCanvas.width = Math.max(1, Math.floor(rect.width));
  drawCanvas.height = Math.max(1, Math.floor(rect.height));

  drawCtx.fillStyle = "#ffffff";
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

  if (doc.type === "text") {
    textEditor.hidden = false;
    drawArea.hidden = true;
    textEditor.value = doc.content || "";
  } else {
    textEditor.hidden = true;
    drawArea.hidden = false;
    resizeDrawCanvas(doc);
  }

  renderDocList();
}

function createDoc(type) {
  const doc = {
    id: `doc-${Date.now()}`,
    title: type === "draw" ? "Namnlös ritning" : "Namnlöst dokument",
    type,
    content: "",
    updatedAt: Date.now(),
  };
  mindmapDocs.unshift(doc);
  saveMindmapDocs();
  selectDoc(doc.id);
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

function deleteCurrentDoc() {
  if (!currentDocId) return;

  mindmapDocs = mindmapDocs.filter((d) => d.id !== currentDocId);
  saveMindmapDocs();

  if (mindmapDocs.length > 0) {
    selectDoc(mindmapDocs[0].id);
  } else {
    showEmptyState();
  }
}

newTextDocBtn.addEventListener("click", () => createDoc("text"));
newDrawDocBtn.addEventListener("click", () => createDoc("draw"));
const deleteDocArm = armConfirm(deleteDocBtn, "Säker? Klicka igen", deleteCurrentDoc);

docTitleInput.addEventListener("input", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  doc.title = docTitleInput.value.trim() || (doc.type === "draw" ? "Namnlös ritning" : "Namnlöst dokument");
  doc.updatedAt = Date.now();
  saveMindmapDocs();
  renderDocList();
});

textEditor.addEventListener("input", () => {
  const doc = mindmapDocs.find((d) => d.id === currentDocId);
  if (!doc) return;
  doc.content = textEditor.value;
  doc.updatedAt = Date.now();
  saveMindmapDocs();
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

drawCanvas.addEventListener("pointerdown", (event) => {
  isDrawingStroke = true;
  drawCanvas.setPointerCapture(event.pointerId);
  const pos = getCanvasPos(event);
  drawCtx.beginPath();
  drawCtx.moveTo(pos.x, pos.y);
});

drawCanvas.addEventListener("pointermove", (event) => {
  if (!isDrawingStroke) return;
  const pos = getCanvasPos(event);
  drawCtx.strokeStyle = eraserActive ? "#ffffff" : currentColor;
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
  });
});

eraserBtn.addEventListener("click", () => {
  eraserActive = !eraserActive;
  eraserBtn.classList.toggle("active", eraserActive);
});

function clearCanvas() {
  drawCtx.fillStyle = "#ffffff";
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

if (mindmapDocs.length > 0) {
  selectDoc(mindmapDocs[0].id);
} else {
  showEmptyState();
}
