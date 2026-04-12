import { setupGrafcetCanvas } from "./canvas.js";
import { parseCnlText } from "./model.js";

const sampleCNL = "";

export function renderIDE(container) {
  container.innerHTML = `
    <header class="ide-header">
      <h1>IDE Inteligente de Automatización Industrial</h1>
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
                rows="8"
                class="editor-base"
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

  const grafcetCanvas = setupGrafcetCanvas("grafcet-canvas");
  const cnlEditor = document.getElementById("cnl-editor");
  const highlightLayer = container.querySelector(".cnl-highlight");
  const errorContainer = document.getElementById("editor-errors");

  function updateHighlight(value) {
    if (!highlightLayer) return;
    highlightLayer.innerHTML = value
      ? highlightCnlText(value)
      : "<span class=\"cnl-placeholder\">&nbsp;</span>";
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

  const scheduleParse = debounce((value) => {
    updateHighlight(value);
    applyParser(value);
  }, 150);

  function handleRealtimeInput(event) {
    const text = event.target?.value ?? "";
    scheduleParse(text);
  }

  cnlEditor?.addEventListener("input", handleRealtimeInput);
  cnlEditor?.addEventListener("scroll", () => {
    if (highlightLayer && cnlEditor) {
      highlightLayer.scrollTop = cnlEditor.scrollTop;
    }
  });
  const initialValue = cnlEditor?.value ?? "";
  updateHighlight(initialValue);
  applyParser(initialValue);
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
  { type: "keyword", regex: /\b(WHEN|THEN|AND|NOT)\b/gi },
  { type: "state", regex: /\bS\d+\b/gi },
  { type: "variable", regex: /\b(START|STOP|SENSOR|MOTOR|CYLINDER)\b/gi },
];

function highlightCnlText(value) {
  if (!value) {
    return "&nbsp;";
  }
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
