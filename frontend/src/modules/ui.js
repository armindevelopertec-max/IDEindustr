import { setupGrafcetCanvas } from "./canvas.js";
import { parseCnlText } from "./model.js";

const sampleCNL = "";

let currentFileName = "Sin título.cnl";
let fileHandle = null;
let grafcetCanvas = null; // Definido globalmente en el módulo para acceso fácil

export function renderIDE(container) {
  container.innerHTML = `
    <header class="ide-header">
      <div class="header-top">
        <h1>IDE Inteligente de Automatización Industrial</h1>
        <div class="file-toolbar">
          <button id="btn-new" title="Nuevo (Ctrl+N)">Nuevo</button>
          <button id="btn-open" title="Abrir (Ctrl+O)">Abrir</button>
          <button id="btn-save" title="Guardar (Ctrl+S)">Guardar</button>
          <span id="current-filename" class="filename-display">${currentFileName}</span>
          <input type="file" id="file-input" style="display: none;" accept=".cnl,.txt">
        </div>
      </div>
      <p>Texto ↔ GRAFCET ↔ Ladder</p>
    </header>
    <section class="ide-main">
      <div class="ide-panel ide-panel-left">
        <article class="ide-card editor-card">
          <header>
            <h2>Editor texto CNL</h2>
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
      </div>

      <div class="ide-panel ide-panel-right">
        <article class="ide-card canvas-card">
          <header>
            <h2>Canvas GRAFCET</h2>
          </header>
          <div id="grafcet-canvas" class="grafcet-canvas"></div>
        </article>
      </div>
    </section>
  `;

  grafcetCanvas = setupGrafcetCanvas("grafcet-canvas");
  const cnlEditor = document.getElementById("cnl-editor");
  const highlightLayer = container.querySelector(".cnl-highlight");
  const errorContainer = document.getElementById("editor-errors");
  const fileInput = document.getElementById("file-input");
  const filenameDisplay = document.getElementById("current-filename");

  // Botones de archivos
  document.getElementById("btn-new").addEventListener("click", newFile);
  document.getElementById("btn-open").addEventListener("click", handleOpenRequest);
  document.getElementById("btn-save").addEventListener("click", saveFile);
  fileInput.addEventListener("change", openFileLegacy);

  // Atajos de teclado
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
    
    // Sincronización inmediata de UI y lógica
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
    
    // 1. PINTAR COLORES AL INSTANTE (SOLUCIONA TRANSPARENCIA)
    updateHighlight(text);

    // 2. Preparar metadatos para el auto-guardado
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
    
    // 3. PROCESAR LÓGICA (CON RETRASO)
    scheduleParseLogic(text + metadataBlock);
  }

  cnlEditor?.addEventListener("input", handleRealtimeInput);
  cnlEditor?.addEventListener("scroll", () => {
    if (highlightLayer && cnlEditor) {
      highlightLayer.scrollTop = cnlEditor.scrollTop;
    }
  });

  // Carga inicial
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
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

const HIGHLIGHT_PATTERNS = [
  { type: "state", regex: /\bS\d+\b/gi },
  { type: "keyword", regex: /\b(THEN|NEXT|AND|NOT)\b|->/gi },
  { type: "variable", regex: /\b(?![sS]\d+\b)[a-z_][a-z0-9_]*([+\-=][a-z0-9_]*)?|\b\d+\w*\b/gi },
];

function highlightCnlText(value) {
  if (!value) return "";
  return value
    .split("\n")
    .map((line) => highlightLine(line))
    .join("<br>");
}

function highlightLine(line) {
  const matches = [];
  HIGHLIGHT_PATTERNS.forEach(({ type, regex }) => {
    regex.lastIndex = 0;
    for (const match of line.matchAll(regex)) {
      const start = match.index ?? 0;
      matches.push({
        start,
        end: start + match[0].length,
        text: match[0],
        type,
      });
    }
  });

  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  let cursor = 0;
  let builder = "";
  matches.forEach((segment) => {
    if (segment.start < cursor) return;
    builder += escapeHtml(line.slice(cursor, segment.start));
    builder += `<span class="token ${segment.type}">${escapeHtml(
      segment.text,
    )}</span>`;
    cursor = segment.end;
  });

  builder += escapeHtml(line.slice(cursor));
  return builder || "&nbsp;";
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/ /g, "&nbsp;")
    .replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
}
