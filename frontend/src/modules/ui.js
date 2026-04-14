import { setupGrafcetCanvas } from "./canvas.js";
import { parseCnlText } from "./model.js";
import { VariableMapper } from "./variables.js";
import { LadderEngine } from "./ladder.js";

const sampleCNL = "";

let currentFileName = "Sin título.cnl";
let fileHandle = null;
let grafcetCanvas = null; 
let activeTab = "tab-level1";

export function renderIDE(container) {
  container.innerHTML = `
    <nav class="ide-navbar">
      <div class="nav-left">
        <div class="nav-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"></path><path d="m6 8-4 4 4 4"></path><path d="m14.5 4-5 16"></path></svg>
          <h1>Compilador<span>Industrial</span></h1>
        </div>
      </div>
      
      <div class="nav-right">
        <div class="file-toolbar">
          <div class="filename-container">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            <span id="current-filename" class="filename-display">${currentFileName}</span>
          </div>
          <div class="button-group">
            <button id="btn-new" class="btn-icon" title="Nuevo (Ctrl+N)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
              Nuevo
            </button>
            <button id="btn-open" class="btn-icon" title="Abrir (Ctrl+O)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10v11c0 1.1.9 2 2 2h16a2 2 0 0 0 2-2V10"></path><path d="M2 10V4a2 2 0 0 1 2-2h7l2 3h7a2 2 0 0 1 2 2v3"></path></svg>
              Abrir
            </button>
            <button id="btn-save" class="btn-icon btn-primary" title="Guardar (Ctrl+S)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
              Guardar
            </button>
          </div>
          <input type="file" id="file-input" style="display: none;" accept=".cnl,.txt">
        </div>
      </div>
    </nav>
    <section class="ide-main">
      <!-- PANEL IZQUIERDO: EDITOR -->
      <aside class="ide-panel-left">
        <article class="ide-card editor-card">
          <header class="card-header">
            <div class="header-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
              <h2>Editor Lógica CNL</h2>
            </div>
          </header>
          <div class="editor-wrapper">
            <div class="editor-layers">
              <pre class="cnl-highlight editor-base" aria-hidden="true"></pre>
              <textarea
                id="cnl-editor"
                class="editor-base"
                spellcheck="false"
              >${sampleCNL}</textarea>
            </div>
            <div id="editor-errors" class="editor-errors" aria-live="polite"></div>
          </div>
        </article>
      </aside>

      <!-- PANEL DERECHO: TABS -->
      <main class="ide-panel-right">
        <article class="ide-card main-display-card">
          <header class="card-header with-tabs">
            <div class="nav-tabs">
              <button class="tab-link active" data-tab="tab-level1">GRAFCET Nivel 1</button>
              <button class="tab-link" data-tab="tab-vars">Diccionario</button>
              <button class="tab-link" data-tab="tab-level2">GRAFCET Nivel 2</button>
              <button class="tab-link" data-tab="tab-ladder">Escalera</button>
            </div>
          </header>
          
          <div class="tab-content-container">
            <div id="tab-level1" class="tab-content active">
              <div id="grafcet-canvas-1" class="grafcet-canvas"></div>
            </div>

            <div id="tab-vars" class="tab-content">
              <div id="variables-dictionary" class="dictionary-view"></div>
            </div>

            <div id="tab-level2" class="tab-content">
              <div id="grafcet-canvas-2" class="grafcet-canvas"></div>
            </div>

            <div id="tab-ladder" class="tab-content">
              <div id="ladder-canvas" class="ladder-canvas"></div>
            </div>
          </div>
        </article>
      </main>
    </section>
  `;

  const cnlEditor = document.getElementById("cnl-editor");
  const highlightLayer = container.querySelector(".cnl-highlight");
  const errorContainer = document.getElementById("editor-errors");
  const fileInput = document.getElementById("file-input");
  const filenameDisplay = document.getElementById("current-filename");

  const canvas1 = setupGrafcetCanvas("grafcet-canvas-1");
  const canvas2 = setupGrafcetCanvas("grafcet-canvas-2");
  
  grafcetCanvas = {
    renderSteps: (steps) => {
      VariableMapper.generateMappings(steps); 
      canvas1.renderSteps(steps);
      
      const translatedSteps = steps.map(step => ({
        ...step,
        name: VariableMapper.translate(step.name),
        actions: (step.actions || []).map(a => VariableMapper.translate(a)),
        transitions: (step.transitions || []).map(t => ({
          ...t,
          source: VariableMapper.translate(t.source),
          target: VariableMapper.translate(t.target),
          condition: VariableMapper.translateList(t.condition)
        }))
      }));
      canvas2.renderSteps(translatedSteps);
    },
    getState: () => canvas1.getState()
  };

  const tabs = container.querySelectorAll(".tab-link");
  const contents = container.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetId = tab.dataset.tab;
      activeTab = targetId;
      
      tabs.forEach(t => t.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      
      tab.classList.add("active");
      const targetContent = document.getElementById(targetId);
      targetContent.classList.add("active");

      // Redibujar el canvas correspondiente si es necesario
      if (targetId === "tab-level1") {
        canvas1.renderSteps(canvas1.getState().steps);
      } else if (targetId === "tab-level2") {
        canvas2.renderSteps(canvas2.getState().steps);
      } else if (targetId === "tab-ladder") {
        const parsed = parseCnlText(cnlEditor.value);
        const ir = LadderEngine.generateIR(parsed.steps);
        LadderEngine.render("ladder-canvas", ir, VariableMapper);
      } else if (targetId === "tab-vars") {
        const parsed = parseCnlText(cnlEditor.value);
        VariableMapper.generateMappings(parsed.steps);
        document.getElementById("variables-dictionary").innerHTML = VariableMapper.generateDictionaryHTML();
      }
    });
  });

  document.getElementById("btn-new").addEventListener("click", newFile);
  document.getElementById("btn-open").addEventListener("click", handleOpenRequest);
  document.getElementById("btn-save").addEventListener("click", saveFile);
  fileInput.addEventListener("change", openFileLegacy);

  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveFile();
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        handleOpenRequest();
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        newFile();
      }
    }
  });

  function newFile() {
    if (cnlEditor.value && !confirm("¿Nuevo archivo? Se perderán los cambios no guardados.")) {
      return;
    }
    cnlEditor.value = "";
    currentFileName = "Sin título.cnl";
    fileHandle = null;
    updateFilenameDisplay();
    updateHighlight("");
    applyParser("");
  }

  async function handleOpenRequest() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: "Archivos CNL", accept: { "text/plain": [".cnl", ".txt"] } }],
        });
        fileHandle = handle;
        const file = await handle.getFile();
        const text = await file.text();
        loadContentIntoEditor(text, file.name);
      } catch (err) {
        console.warn("Apertura cancelada o no soportada.");
      }
    } else {
      fileInput.click();
    }
  }

  function openFileLegacy(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      loadContentIntoEditor(e.target.result, file.name);
      fileHandle = null;
    };
    reader.readAsText(file);
  }

  function loadContentIntoEditor(fullText, fileName) {
    const cleanText = fullText.replace(/\/\* LAYOUT_DATA: .* \*\//, "").trim();
    cnlEditor.value = cleanText;
    currentFileName = fileName || currentFileName;
    updateFilenameDisplay();
    
    updateHighlight(cleanText);
    applyParser(fullText);
    autoSave(fullText);
  }

  async function saveFile() {
    const canvasStateData = grafcetCanvas.getState();
    const layoutMeta = {};
    canvasStateData.steps.forEach(s => {
      layoutMeta[s.name] = {
        position: s.position,
        transitions: s.transitions.map(t => ({
          target: t.target,
          condition: t.condition,
          manualX: t.manualX,
          manualY: t.manualY
        }))
      };
    });

    const metadataBlock = `\n/* LAYOUT_DATA: ${JSON.stringify(layoutMeta)} */`;
    const cleanText = cnlEditor.value.replace(/\/\* LAYOUT_DATA: .* \*\//, "").trim();
    const content = cleanText + metadataBlock;
    
    if (fileHandle && window.showSaveFilePicker) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
        showSaveVisualFeedback();
        localStorage.setItem("autosave_cnl", content);
        return;
      } catch (err) {
        console.error("Error al sobreescribir:", err);
      }
    }

    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: currentFileName,
          types: [{ description: "Archivo CNL", accept: { "text/plain": [".cnl"] } }],
        });
        fileHandle = handle;
        currentFileName = handle.name;
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        updateFilenameDisplay();
        showSaveVisualFeedback();
      } catch (err) {
        console.warn("Guardado cancelado.");
      }
    } else {
      const blob = new Blob([content], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = currentFileName;
      a.click();
      URL.revokeObjectURL(url);
    }
    
    localStorage.setItem("autosave_cnl", content);
  }

  function showSaveVisualFeedback() {
    const btn = document.getElementById("btn-save");
    const originalText = btn.textContent;
    btn.textContent = "¡Guardado!";
    btn.style.background = "#4df59f";
    btn.style.color = "#041725";
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.background = "";
      btn.style.color = "";
    }, 1500);
  }

  function updateFilenameDisplay() {
    if (filenameDisplay) {
      filenameDisplay.textContent = currentFileName;
    }
  }

  function autoSave(value) {
    localStorage.setItem("autosave_cnl", value);
    localStorage.setItem("autosave_filename", currentFileName);
  }

  function updateHighlight(value) {
    if (!highlightLayer) return;
    highlightLayer.innerHTML = value
      ? highlightCnlText(value)
      : "<span class=\"cnl-placeholder\">Escribe tu lógica aquí...</span>";
    if (cnlEditor) {
      highlightLayer.scrollTop = cnlEditor.scrollTop;
    }
  }

  function renderErrors(list = []) {
    if (!errorContainer) return;
    if (!list.length) {
      errorContainer.textContent = "";
      errorContainer.classList.remove("has-errors");
      return;
    }
    errorContainer.classList.add("has-errors");
    errorContainer.innerHTML = list
      .map((entry) => {
        const line = entry.line ? `Línea ${entry.line}: ` : "";
        return `<p>${line}${entry.message}</p>`;
      })
      .join("");
  }

  function applyParser(text) {
    const parsed = parseCnlText(text);
    grafcetCanvas?.renderSteps(parsed.steps);
    renderErrors(parsed.errors);
  }

  const scheduleParseLogic = debounce((value) => {
    applyParser(value);
  }, 150);

  function handleRealtimeInput(event) {
    const text = event.target?.value ?? "";
    updateHighlight(text);
    const canvasStateData = grafcetCanvas?.getState();
    let metadataBlock = "";
    if (canvasStateData) {
      const layoutMeta = {};
      canvasStateData.steps.forEach(s => {
        layoutMeta[s.name] = {
          position: s.position,
          transitions: s.transitions.map(t => ({
            target: t.target,
            condition: t.condition,
            manualX: t.manualX,
            manualY: t.manualY
          }))
        };
      });
      metadataBlock = `\n/* LAYOUT_DATA: ${JSON.stringify(layoutMeta)} */`;
    }
    autoSave(text + metadataBlock);
    scheduleParseLogic(text + metadataBlock);
  }

  cnlEditor?.addEventListener("input", handleRealtimeInput);
  cnlEditor?.addEventListener("scroll", () => {
    if (highlightLayer && cnlEditor) {
      highlightLayer.scrollTop = cnlEditor.scrollTop;
    }
  });

  const savedContent = localStorage.getItem("autosave_cnl");
  const savedName = localStorage.getItem("autosave_filename");
  if (savedContent && cnlEditor) {
    loadContentIntoEditor(savedContent, savedName);
  } else {
    updateHighlight("");
    applyParser("");
  }
}

function debounce(fn, delay) {
  let timerId;
  return (...args) => {
    if (timerId) clearTimeout(timerId);
    timerId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

const HIGHLIGHT_PATTERNS = [
  { type: "state", regex: /\bS\d+\b/gi },
  { type: "keyword", regex: /\b(THEN|NEXT|AND|NOT|1|TRUE)\b|->/gi },
  { type: "variable", regex: /\b(?![sS]\d+\b|1\b|TRUE\b)[a-z_][a-z0-9_]*([+\-][a-z0-9_]*)?|\b\d+\w*\b/gi },
];

function highlightCnlText(value) {
  if (!value) return "";
  return value.split("\n").map(l => highlightLine(l)).join("<br>");
}

function highlightLine(line) {
  const matches = [];
  HIGHLIGHT_PATTERNS.forEach(({ type, regex }) => {
    regex.lastIndex = 0;
    for (const match of line.matchAll(regex)) {
      const start = match.index ?? 0;
      matches.push({ start, end: start + match[0].length, text: match[0], type });
    }
  });
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let builder = "";
  matches.forEach((segment) => {
    if (segment.start < cursor) return;
    builder += escapeHtml(line.slice(cursor, segment.start));
    builder += `<span class="token ${segment.type}">${escapeHtml(segment.text)}</span>`;
    cursor = segment.end;
  });
  builder += escapeHtml(line.slice(cursor));
  return builder || "&nbsp;";
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
}
