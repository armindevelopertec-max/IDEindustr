import { setupGrafcetCanvas } from "./canvas.js";
import { renderLadderPanel } from "./ladder.js";
import { renderVariables } from "./variables.js";

const sampleCNL = `WHEN START THEN MOTOR ON -> S1
WHEN SENSOR THEN CYLINDER ON -> S2
WHEN START AND SENSOR THEN VENTILADOR ON -> S3`;
const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

export function renderIDE(container) {
  container.innerHTML = `
    <header class="ide-header">
      <h1>IDE Inteligente de Automatización Industrial</h1>
      <p>Texto ↔ GRAFCET ↔ Ladder</p>
    </header>
    <section class="ide-main">
      <div class="ide-left-column">
        <article class="ide-card">
          <header>
            <h2>Editor texto CNL</h2>
          </header>
          <textarea id="cnl-editor" rows="8">${sampleCNL}</textarea>
          <button id="parse-btn">Generar GRAFCET</button>
        </article>

        <article class="ide-card canvas-card">
          <header>
            <h2>Canvas GRAFCET</h2>
          </header>
          <div id="grafcet-canvas" class="grafcet-canvas"></div>
          <div class="canvas-controls">
            <button id="add-step-btn" type="button">Agregar paso</button>
            <button id="add-empty-step-btn" type="button">Etapa vacía</button>
            <button id="add-level-btn" type="button">Agregar nivel</button>
            <span class="canvas-hint">
              Niveles numerados 0 → 1 → 2. Haz doble clic en la etapa, acción o transición para editar.
            </span>
          </div>
          <div class="grafcet-guidelines">
            <h3>Notas de representación</h3>
            <ul>
              <li><strong>Etapa vacía:</strong> solo contiene el cuadrado (o doble cuadrado si es nivel 0) y no ejecuta acciones.</li>
              <li><strong>Transición sin condición:</strong> puede dejarse en blanco, se dibuja como línea conectada y se interpreta como “=1”.</li>
              <li><strong>Acción vacía:</strong> sirve para etapas puramente secuenciales o sincronización.</li>
              <li><strong>Ramas sin contenido:</strong> conectan etapas cuando necesitas paralelismos o saltos.</li>
              <li><strong>Tiempo/condición implícita:</strong> puedes dejar pulsado el campo condicional y editarlo con el formulario claro.</li>
            </ul>
          </div>
        </article>
      </div>

      <aside class="ide-side-column">
        <article class="ide-card">
          <header>
            <h2>Panel Ladder</h2>
          </header>
          <ul id="ladder-list" class="ladder-list"></ul>
        </article>

        <article class="ide-card">
          <header>
            <h2>Panel Variables</h2>
          </header>
          <div id="variables-table"></div>
        </article>
      </aside>
    </section>
  `;

  const grafcetCanvas = setupGrafcetCanvas("grafcet-canvas");
  const ladderTargetId = "ladder-list";
  const variablesTargetId = "variables-table";

  renderLadderPanel(ladderTargetId);
  renderVariables(variablesTargetId);

  const parseButton = document.getElementById("parse-btn");
  const cnlEditor = document.getElementById("cnl-editor");

  async function handleParse() {
    if (!cnlEditor || !parseButton) return;

    const text = cnlEditor.value.trim();
    if (!text) return;

    parseButton.disabled = true;
    parseButton.textContent = "Generando...";

    try {
      const response = await fetch(`${API_BASE}/api/grafcet/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error("La API respondió con un error");
      }

      const payload = await response.json();

      grafcetCanvas?.renderSteps(payload.steps);
      renderLadderPanel(ladderTargetId, payload.ladder);
      renderVariables(variablesTargetId, payload.variables);
    } catch (error) {
      console.error(error);
      window.alert("No se pudo generar GRAFCET. Revisa la consola para más detalles.");
    } finally {
      parseButton.disabled = false;
      parseButton.textContent = "Generar GRAFCET";
    }
  }

  parseButton?.addEventListener("click", handleParse);
  setTimeout(handleParse, 0);

  const addStepButton = document.getElementById("add-step-btn");
  const addEmptyButton = document.getElementById("add-empty-step-btn");
  const addLevelButton = document.getElementById("add-level-btn");

  function handleAddStep() {
    if (!grafcetCanvas) return;

    const canvasInfo = grafcetCanvas.getState?.();
    const defaultName = `S${canvasInfo?.nextStepId ?? 1}`;
    const lastStep = canvasInfo?.steps?.[canvasInfo.steps.length - 1];
    const name = window.prompt("Nombre del paso", defaultName);
    if (name === null) return;

    const levelInput = window.prompt(
      "Nivel del nuevo paso",
      lastStep ? String(lastStep.level + 1) : "0",
    );
    if (levelInput === null) return;
    const parsedLevel = Number(levelInput);
    const level = Number.isNaN(parsedLevel) ? undefined : parsedLevel;

    const condition = window.prompt(
      `Condición de transición desde ${lastStep?.name ?? "S0"}`,
      "contacto",
    );
    if (condition === null) return;

    const actions = window.prompt("Acciones (separadas por coma)", "Nueva salida");
    grafcetCanvas.addStep({
      name,
      level,
      from: lastStep?.name,
      condition,
      action: actions ?? "",
    });
  }

  addStepButton?.addEventListener("click", handleAddStep);

  function handleAddEmptyStep() {
    const state = grafcetCanvas?.getState?.();
    const levels = state?.steps?.map((step) => Number.isFinite(step.level) ? step.level : 0) ?? [];
    const nextLevel = levels.length ? Math.max(...levels) + 1 : 0;
    grafcetCanvas?.addStep({
      level: nextLevel,
      action: "",
      condition: "",
    });
  }

  addEmptyButton?.addEventListener("click", handleAddEmptyStep);

  function handleAddLevel() {
    const levelPrompt = window.prompt("Número del nuevo nivel (0, 1, 2...)", "0");
    if (levelPrompt === null) return;
    const parsed = parseInt(levelPrompt, 10);
    if (Number.isNaN(parsed)) return;

    const namePrompt = window.prompt("Nombre opcional del paso", `Nivel ${parsed}`);
    grafcetCanvas?.addStep({
      level: parsed,
      name: namePrompt || undefined,
      condition: "",
      action: "",
    });
  }

  addLevelButton?.addEventListener("click", handleAddLevel);
}
