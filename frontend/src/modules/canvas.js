import Konva from "konva";

const NODE_WIDTH = 70;
const NODE_HEIGHT = 38;
const ACTION_WIDTH = 120;
const ACTION_HEIGHT = 26;
const LEVEL_VERTICAL_GAP = NODE_HEIGHT + 70;
const ACTION_SPACING = ACTION_HEIGHT + 6;
const HORIZONTAL_SPACING = NODE_WIDTH + ACTION_WIDTH + 90;

let stage = null;
let layer = null;
let containerElement = null;

const canvasState = {
  steps: [],
  nextStepId: 1,
};

export function setupGrafcetCanvas(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;

  containerElement = container;
  container.innerHTML = "";

  stage = new Konva.Stage({
    container: containerId,
    width: container.clientWidth,
    height: 420,
    listening: true,
  });

  layer = new Konva.Layer();
  stage.add(layer);

  window.addEventListener("resize", () => {
    if (!stage || !containerElement) return;
    stage.width(containerElement.clientWidth);
    drawGrafcetSteps();
  });

  return {
    renderSteps: (steps = []) => renderGrafcetSteps(steps),
    addStep: (options = {}) => addEditableStep(options),
    getState: () => ({
      steps: canvasState.steps.map((step) => ({ ...step })),
      nextStepId: canvasState.nextStepId,
    }),
  };
}

function renderGrafcetSteps(steps = []) {
  canvasState.steps = steps.map((step) => normalizeStep(step));
  canvasState.nextStepId = Math.max(2, canvasState.steps.length + 1);
  drawGrafcetSteps();
}

function normalizeStep(step) {
  return {
    name: step.name,
    actions: Array.isArray(step.actions) ? [...step.actions] : [],
    transitions: Array.isArray(step.transitions)
      ? step.transitions.map((transition) => ({ ...transition }))
      : [],
    active: Boolean(step.active),
    level: typeof step.level === "number" ? step.level : 0,
    position: step.position ? { ...step.position } : undefined,
  };
}

function addEditableStep({ name, level, from, condition, action } = {}) {
  const lastStep = canvasState.steps.at(-1);
  const resolvedLevel =
    typeof level === "number" && !Number.isNaN(level)
      ? level
      : Math.max(lastStep?.level ?? 0, 0) + 1;
  const stepName = name || `S${canvasState.nextStepId}`;
  const actionItems = action
    ? action
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  const newStep = {
    name: stepName,
    actions: actionItems,
    transitions: [],
    active: false,
    level: resolvedLevel,
  };

  const parentStep = from
    ? canvasState.steps.find((step) => step.name === from)
    : lastStep;

    if (parentStep) {
      const transitionCondition = (condition ?? "").trim() || "";
    parentStep.transitions = [
      ...(parentStep.transitions ?? []),
      {
        source: parentStep.name,
        target: newStep.name,
        condition: transitionCondition,
      },
    ];
  }

  canvasState.steps.push(newStep);
  canvasState.nextStepId += 1;
  drawGrafcetSteps();
  return newStep;
}

function drawGrafcetSteps() {
  if (!stage || !layer) return;
  layer.destroyChildren();

  if (!canvasState.steps.length) {
    const helper = new Konva.Text({
      x: 20,
      y: 40,
      text: "Genera un GRAFCET para comenzar.",
      fontSize: 14,
      fill: "#9bb2d9",
    });
    layer.add(helper);
    layer.draw();
    return;
  }

  const levelsMap = new Map();
  canvasState.steps.forEach((step) => {
    const level = step.level;
    if (!levelsMap.has(level)) {
      levelsMap.set(level, []);
    }
    levelsMap.get(level).push(step);
  });

  const orderedLevels = Array.from(levelsMap.keys()).sort((a, b) => a - b);

  const positions = {};
  let requiredWidth = 0;

  orderedLevels.forEach((level, levelIdx) => {
    const y = 40 + levelIdx * LEVEL_VERTICAL_GAP;
    const stepsInLevel = levelsMap.get(level) ?? [];
    stepsInLevel.forEach((step, index) => {
      const x = 50 + index * HORIZONTAL_SPACING;
      positions[step.name] = { x, y };
      requiredWidth = Math.max(requiredWidth, x + NODE_WIDTH + ACTION_WIDTH + 80);
    });
  });

  // Center parent steps horizontally over their children
  const hierarchy = new Map();
  canvasState.steps.forEach((step) => {
    step.transitions?.forEach((transition) => {
      if (!hierarchy.has(transition.source)) {
        hierarchy.set(transition.source, []);
      }
      hierarchy.get(transition.source).push(transition.target);
    });
  });

  const sortedByLevel = [...canvasState.steps].sort((a, b) => a.level - b.level);
  sortedByLevel.forEach((step) => {
    const children = hierarchy.get(step.name) ?? [];
    const childPositions = children
      .map((childName) => positions[childName])
      .filter(Boolean);

    if (childPositions.length && positions[step.name]) {
      const avgX =
        childPositions.reduce((sum, child) => sum + child.x, 0) / childPositions.length;
      positions[step.name].x = avgX;
    }
  });

  const stageWidth = Math.max(stage.width(), requiredWidth, 520);
  stage.width(stageWidth);
  const totalHeight = Math.max(
    stage.height(),
    40 + orderedLevels.length * LEVEL_VERTICAL_GAP + 120,
  );
  stage.height(totalHeight);

  orderedLevels.forEach((level, levelIdx) => {
    const y = 40 + levelIdx * LEVEL_VERTICAL_GAP;
    const band = new Konva.Rect({
      x: 20,
      y: y - 25,
      width: stage.width() - 40,
      height: NODE_HEIGHT + 70,
      fill: level % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)",
    });
    layer.add(band);
  });

  canvasState.steps.forEach((step) => {
    const pos = positions[step.name];
    if (!pos) return;

    const rect = new Konva.Rect({
      x: pos.x,
      y: pos.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      fill: "#66b2ff",
      cornerRadius: 6,
      stroke: "#ffffff",
      strokeWidth: step.level === 0 ? 3 : 2,
      draggable: true,
    });

    if (step.level === 0) {
      const outer = new Konva.Rect({
        x: pos.x - 4,
        y: pos.y - 4,
        width: NODE_WIDTH + 8,
        height: NODE_HEIGHT + 8,
        cornerRadius: 8,
        stroke: "#bddbf7",
        strokeWidth: 2,
      });
      layer.add(outer);
    }

    const label = new Konva.Text({
      x: pos.x,
      y: pos.y + (NODE_HEIGHT - 20) / 2,
      width: NODE_WIDTH,
      align: "center",
      text: `${typeof step.level === "number" ? step.level : ""}`,
      fill: "#041725",
      fontSize: 16,
      fontStyle: "bold",
    });

    {
      const actions = Array.isArray(step.actions) ? step.actions : [];
      actions.forEach((action, actionIdx) => {
        const actionY = pos.y + (NODE_HEIGHT - ACTION_HEIGHT) / 2 + actionIdx * ACTION_SPACING;
        const actionRect = new Konva.Rect({
          x: pos.x + NODE_WIDTH + 70,
          y: actionY,
          width: ACTION_WIDTH,
          height: ACTION_HEIGHT,
          cornerRadius: 6,
          fill: "rgba(255,255,255,0.08)",
          stroke: "rgba(255,255,255,0.35)",
          strokeWidth: 1.5,
        });

        const actionLabel = new Konva.Text({
          x: actionRect.x() + 8,
          y: actionRect.y() + 6,
          text: action,
          fontSize: 12,
          fill: "#d4e1ff",
        });

        const connector = new Konva.Line({
          points: [
            pos.x + NODE_WIDTH,
            actionRect.y() + ACTION_HEIGHT / 2,
            actionRect.x(),
            actionRect.y() + ACTION_HEIGHT / 2,
          ],
          stroke: "#ffffff",
          strokeWidth: 1.5,
        });

        layer.add(actionRect, actionLabel, connector);
      });
    }

    const actionHint = new Konva.Text({
      x: pos.x + NODE_WIDTH + 30,
      y: pos.y + NODE_HEIGHT + 8,
      text: (step.actions?.length ?? 0) ? "" : "doble clic → agregar acción",
      fontSize: 10,
      fill: "#9bb2d9",
    });

    actionHint.on("dblclick", () => {
      const raw = window.prompt("Nueva acción", "");
      if (raw === null) return;
      step.actions = [...(step.actions ?? []), raw].filter(Boolean);
      drawGrafcetSteps();
    });

    rect.on("mouseover", () => {
      stage.container().style.cursor = "grab";
    });
    rect.on("mouseout", () => {
      stage.container().style.cursor = "default";
    });
    rect.on("dragend", () => {
      step.position = { x: rect.x(), y: rect.y() };
      drawGrafcetSteps();
    });
    rect.on("dblclick", () => {
      const input = window.prompt("Nivel del paso", String(step.level));
      if (input === null) return;
      const parsed = parseInt(input, 10);
      if (!Number.isNaN(parsed)) {
        step.level = parsed;
        drawGrafcetSteps();
      }
    });

    layer.add(rect, label, actionHint);
  });

  const transitionsPerSource = new Map();
  canvasState.steps.forEach((stepItem) => {
    const count = stepItem.transitions?.length ?? 0;
    if (count > 0) transitionsPerSource.set(stepItem.name, count);
  });
  const transitionCounter = {};

  canvasState.steps.forEach((step) => {
    step.transitions?.forEach((transition) => {
      const source = positions[transition.source];
      const target = positions[transition.target];
      if (!source || !target) return;

      const totalFromSource = transitionsPerSource.get(source.name) ?? 1;
      const idx = transitionCounter[source.name] ?? 0;
      transitionCounter[source.name] = idx + 1;
      const horizontalOffset = (idx - (totalFromSource - 1) / 2) * 18;
      const verticalStartY = source.y + NODE_HEIGHT;
      const midY = verticalStartY + 16;
      const targetEntryY = target.y - 10;
      const startX = source.x + NODE_WIDTH / 2;
      const horizontalBreakX = startX + horizontalOffset;
      const targetCenterX = target.x + NODE_WIDTH / 2;
      const verticalMidY =
        midY + (targetEntryY - midY) * 0.55;

      const arrow = new Konva.Arrow({
        points: [
          startX,
          verticalStartY,
          startX,
          midY,
          horizontalBreakX,
          midY,
          targetCenterX,
          midY,
          targetCenterX,
          targetEntryY,
        ],
        pointerLength: 10,
        pointerWidth: 10,
        stroke: "#ffffff",
        fill: "#ffffff",
        strokeWidth: 2,
      });

      const labelX = targetCenterX - 24;
      const labelY = verticalMidY - 8;
      const actuatorMatch = (transition.condition ?? "").match(
        /\b(start|stop|sensor|entrada|entrada1|entrada2)\b/i,
      );
      const label = new Konva.Text({
        x: labelX,
        y: labelY,
        text: actuatorMatch ? "" : transition.condition,
        fontSize: 12,
        fill: "#f5faff",
      });

      label.on("dblclick", () => {
        const value = window.prompt("Condición", transition.condition);
        if (value === null) return;
        transition.condition = value;
        drawGrafcetSteps();
      });

      if (actuatorMatch) {
        const actuatorLineLength = 18;
        const actuatorLine = new Konva.Line({
          points: [
            targetCenterX - actuatorLineLength,
            verticalMidY,
            targetCenterX,
            verticalMidY,
          ],
          stroke: "#f5d76d",
          strokeWidth: 2,
        });
        const actuatorLabel = new Konva.Text({
          x: targetCenterX + 8,
          y: verticalMidY - 18,
          text: actuatorMatch[0].toUpperCase(),
          fontSize: 10,
          fill: "#f5d76d",
        });
        layer.add(actuatorLine, actuatorLabel);
      }

      layer.add(arrow, label);
    });
  });

  const lastSteps = levelsMap.get(Math.max(...orderedLevels)) ?? [];
  if (lastSteps.length) {
    const startStep = canvasState.steps.find((s) => s.level === 0);
    const lastStep = lastSteps.at(-1);
    if (startStep && lastStep) {
      const lastPos = positions[lastStep.name];
      const startPos = positions[startStep.name];
      const safeX = stage.width() - 60;
      const loopLine = new Konva.Arrow({
        points: [
          lastPos.x + NODE_WIDTH / 2,
          lastPos.y + NODE_HEIGHT,
          lastPos.x + NODE_WIDTH / 2,
          lastPos.y + NODE_HEIGHT + 18,
          safeX,
          lastPos.y + NODE_HEIGHT + 18,
          safeX,
          startPos.y - 18,
          startPos.x + NODE_WIDTH / 2,
          startPos.y - 18,
          startPos.x + NODE_WIDTH / 2,
          startPos.y - 10,
        ],
        pointerLength: 10,
        pointerWidth: 8,
        stroke: "#4df59f",
        fill: "#4df59f",
        strokeWidth: 2,
      });
      const loopLabel = new Konva.Text({
        x: lastPos.x + NODE_WIDTH / 2 + 20,
        y: lastPos.y + NODE_HEIGHT + 18,
        text: "=1 → retorno inicio",
        fontSize: 11,
        fill: "#4df59f",
      });
      layer.add(loopLine, loopLabel);
    }
  }

  layer.draw();
}
