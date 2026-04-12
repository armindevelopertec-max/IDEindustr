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
let isPanning = false;
let panLastPointer = null;

const changeListeners = new Set();
let lastModelSignature = "";

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

  const stageContainer = stage.container();
  const shouldStartPan = (evt) =>
    Boolean(
      evt &&
        (evt.altKey ||
          evt.shiftKey ||
          evt.ctrlKey ||
          evt.button === 2 ||
          (evt.touches && evt.touches.length === 2)),
    );

  stage.on("mousedown touchstart", (event) => {
    const evt = event.evt;
    if (!shouldStartPan(evt)) return;
    isPanning = true;
    panLastPointer = stage.getPointerPosition();
    if (stageContainer) {
      stageContainer.style.cursor = "grabbing";
    }
  });

  stage.on("mouseup touchend", () => {
    isPanning = false;
    panLastPointer = null;
    if (stageContainer) {
      stageContainer.style.cursor = "default";
    }
  });

  stage.on("mousemove touchmove", (event) => {
    if (!isPanning) return;
    const pointer = stage.getPointerPosition();
    if (!pointer || !panLastPointer) return;
    const dx = pointer.x - panLastPointer.x;
    const dy = pointer.y - panLastPointer.y;
    stage.position({
      x: stage.x() + dx,
      y: stage.y() + dy,
    });
    panLastPointer = pointer;
    stage.batchDraw();
  });

  stage.on("wheel", (event) => {
    event.evt.preventDefault();
    const oldScale = stage.scaleX() || 1;
    const pointer = stage.getPointerPosition();
    const scaleBy = 1.08;
    const newScale =
      event.evt.deltaY > 0 ? oldScale / scaleBy : oldScale * scaleBy;
    const limitedScale = Math.min(3, Math.max(0.5, newScale));
    if (!pointer) return;
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: limitedScale, y: limitedScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * limitedScale,
      y: pointer.y - mousePointTo.y * limitedScale,
    };
    stage.position(newPos);
    stage.batchDraw();
  });

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
    subscribe: (listener) => {
      if (typeof listener !== "function") {
        return () => {};
      }

      changeListeners.add(listener);
      listener(cloneSteps(canvasState.steps));

      return () => changeListeners.delete(listener);
    },
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

  const positions = {};
  const levelGroups = new Map();
  const adjacency = new Map();
  canvasState.steps.forEach((step) => {
    adjacency.set(step.name, []);
  });
  canvasState.steps.forEach((step) => {
    (step.transitions ?? []).forEach((transition) => {
      adjacency.get(step.name)?.push(transition.target);
    });
  });

  const depthMap = new Map();
  canvasState.steps.forEach((step) => {
    depthMap.set(step.name, Number.POSITIVE_INFINITY);
  });
  const root = "S0";
  const queue = [];
  if (depthMap.has(root)) {
    depthMap.set(root, 0);
    queue.push(root);
  } else if (canvasState.steps.length) {
    depthMap.set(canvasState.steps[0].name, 0);
    queue.push(canvasState.steps[0].name);
  }

  while (queue.length) {
    const current = queue.shift();
    const currentDepth = depthMap.get(current) ?? 0;
    const neighbors = adjacency.get(current) ?? [];
    neighbors.forEach((neighbor) => {
      if (!depthMap.has(neighbor)) {
        depthMap.set(neighbor, currentDepth + 1);
      } else if ((depthMap.get(neighbor) ?? 0) > currentDepth + 1) {
        depthMap.set(neighbor, currentDepth + 1);
      }
      queue.push(neighbor);
    });
  }

  canvasState.steps.forEach((step) => {
    const depth = Number.isFinite(depthMap.get(step.name))
      ? depthMap.get(step.name)
      : 0;
    if (!levelGroups.has(depth)) {
      levelGroups.set(depth, []);
    }
    levelGroups.get(depth).push(step);
  });
  const orderedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

  let requiredWidth = 0;
  let requiredHeight = 0;
  const LEVEL_VERTICAL_STEP = NODE_HEIGHT + 90;
  const LEVEL_HORIZONTAL_SPACING = NODE_WIDTH + 60;
  const layoutGroups = [];

  orderedLevels.forEach((level) => {
    const nodes = levelGroups.get(level) ?? [];
    const rowY = 40 + level * LEVEL_VERTICAL_STEP;
    const levelWidth = nodes.length * LEVEL_HORIZONTAL_SPACING;
    requiredWidth = Math.max(requiredWidth, levelWidth);
    layoutGroups.push({ level, nodes, rowY, levelWidth });
  });

  const containerWidth = containerElement?.clientWidth ?? 800;
  const stageWidth = Math.max(containerWidth, requiredWidth + 160, 520);
  const stageCenterX = stageWidth / 2;

  layoutGroups.forEach(({ level, nodes, rowY, levelWidth }) => {
    nodes.forEach((step, index) => {
      const offsetX =
        -(levelWidth / 2) + index * LEVEL_HORIZONTAL_SPACING + LEVEL_HORIZONTAL_SPACING / 2;
      const x = stageCenterX + offsetX;
      const y = rowY;
      positions[step.name] = { x, y };
      requiredHeight = Math.max(requiredHeight, y + NODE_HEIGHT + 40);
    });
  });

  const parentChildren = new Map();
  canvasState.steps.forEach((step) => {
    step.transitions?.forEach((transition) => {
      if (!parentChildren.has(step.name)) {
        parentChildren.set(step.name, []);
      }
      parentChildren.get(step.name).push(transition.target);
    });
  });

  const horizontalSpacing = NODE_WIDTH + 40;
  parentChildren.forEach((children, parent) => {
    if (children.length <= 1) return;
    const parentPos = positions[parent];
    if (!parentPos) return;
    const centerOffset = (children.length - 1) / 2;
    children.forEach((childName, index) => {
      const childPos = positions[childName];
      if (!childPos) return;
      childPos.x = parentPos.x + (index - centerOffset) * horizontalSpacing;
      requiredWidth = Math.max(requiredWidth, childPos.x + NODE_WIDTH + ACTION_WIDTH + 60);
    });
  });

  const containerHeight = containerElement?.clientHeight ?? stage.height();
  const stageHeight = Math.max(containerHeight, requiredHeight + 80, 400);
  stage.width(stageWidth);
  stage.height(stageHeight);


  canvasState.steps.forEach((step) => {
    const pos = positions[step.name];
    if (!pos) return;

    const isError = Boolean(step.error);
    const rect = new Konva.Rect({
      x: pos.x,
      y: pos.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      fill: isError ? "#ff6b6b" : step.active ? "#4df59f" : "#66b2ff",
      cornerRadius: 6,
      stroke: isError ? "#ffb0b0" : "#ffffff",
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
      text: `${step.name ?? ""}`,
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

  const topNodeY =
    Object.values(positions).reduce((min, pos) => Math.min(min, pos.y), Infinity) ??
    40;
  const wrapStartY = Math.max(12, topNodeY - 24);

  const transitionsPerSource = new Map();
  const stepLookup = new Map(canvasState.steps.map((step) => [step.name, step]));
  canvasState.steps.forEach((stepItem) => {
    const count = stepItem.transitions?.length ?? 0;
    if (count > 0) transitionsPerSource.set(stepItem.name, count);
  });
  const transitionCounter = {};
  const branchOffsetsBySource = new Map();
  const branchHeightBySource = new Map();

  canvasState.steps.forEach((step) => {
    step.transitions?.forEach((transition) => {
      const source = positions[transition.source];
      const target = positions[transition.target];
      if (!source || !target) return;

      const totalFromSource = transitionsPerSource.get(step.name) ?? 1;
      const idx = transitionCounter[step.name] ?? 0;
      transitionCounter[step.name] = idx + 1;
      const horizontalOffset = (idx - (totalFromSource - 1) / 2) * 18;

      const startX = source.x + NODE_WIDTH / 2;
      const startY = source.y + NODE_HEIGHT;
      const targetCenterX = target.x + NODE_WIDTH / 2;
      const targetEntryY = target.y;
      if (!branchOffsetsBySource.has(step.name)) {
        branchOffsetsBySource.set(step.name, createBranchOffsets(totalFromSource));
      }
      const offsets = branchOffsetsBySource.get(step.name);
      const offsetY = offsets[idx] ?? 0;
      const horizontalY = startY + Math.max(50, Math.abs(targetEntryY - startY) / 2) + offsetY;
      const targetLevel = Number.isFinite(stepLookup.get(transition.target)?.level)
        ? stepLookup.get(transition.target)?.level
        : 0;
      const shouldLoop = targetLevel <= (Number.isFinite(step.level) ? step.level : 0);
      const finalTargetEntryY = targetEntryY + offsetY;

      const verticalMidY = shouldLoop
        ? (startY + finalTargetEntryY) / 2
        : (horizontalY + finalTargetEntryY) / 2;

      const points = shouldLoop
        ? buildLoopPoints(startX + horizontalOffset, startY, targetCenterX, finalTargetEntryY)
        : [
            startX + horizontalOffset,
            startY,
            startX + horizontalOffset,
            horizontalY,
            targetCenterX,
            horizontalY,
            targetCenterX,
            finalTargetEntryY,
          ];

      const arrow = new Konva.Arrow({
        points,
        pointerLength: 10,
        pointerWidth: 10,
        stroke: "#ffffff",
        fill: "#ffffff",
        strokeWidth: 2,
        tension: shouldLoop ? 0 : 0.5,
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
            labelY + 10,
            targetCenterX,
            labelY + 10,
          ],
          stroke: "#f5d76d",
          strokeWidth: 2,
        });
        const actuatorLabel = new Konva.Text({
          x: targetCenterX + 8,
          y: labelY - 8,
          text: actuatorMatch[0].toUpperCase(),
          fontSize: 10,
          fill: "#f5d76d",
        });
        layer.add(actuatorLine, actuatorLabel);
      }

      layer.add(arrow, label);
    });
  });

  layer.draw();
  notifyModelChange();
}

function notifyModelChange() {
  const signature = buildModelSignature(canvasState.steps);
  if (signature === lastModelSignature) {
    return;
  }
  lastModelSignature = signature;
  const snapshot = cloneSteps(canvasState.steps);
  changeListeners.forEach((listener) => listener(snapshot));
}

function buildModelSignature(steps) {
  return steps
    .map((step) => {
      const actionsPart =
        (step.actions ?? [])
          .filter((action) => Boolean(action))
          .join(",");
      const transitionsPart = (step.transitions ?? [])
        .map((transition) => {
          const source = transition.source ?? step.name ?? "";
          const target = transition.target ?? "";
          const condition = transition.condition ?? "";
          const action = transition.action ?? "";
          return `${source}->${target}:${condition}:${action}`;
        })
        .sort()
        .join("|");
      return `${step.name ?? ""}#${step.level ?? 0}:${actionsPart}:${transitionsPart}`;
    })
    .join("||");
}

function cloneSteps(steps) {
  return steps.map((step) => ({
    ...step,
    actions: Array.isArray(step.actions) ? [...step.actions] : [],
    transitions: Array.isArray(step.transitions)
      ? step.transitions.map((transition) => ({ ...transition }))
      : [],
  }));
}


function buildLoopPoints(startX, startY, targetX, targetY) {
  const marginX = stage ? stage.width() - 40 : startX + 150;
  const midY = Math.max(20, Math.min(targetY - 20, startY - 20));
  return [
    startX,
    startY,
    startX,
    startY + 30,
    marginX,
    startY + 30,
    marginX,
    midY,
    targetX,
    midY,
    targetX,
    targetY,
  ];
}

function createBranchOffsets(count) {
  if (count <= 1) {
    return [0];
  }
  const spacing = 24;
  const offsets = [];
  const center = (count - 1) / 2;
  for (let i = 0; i < count; i += 1) {
    offsets.push((i - center) * spacing);
  }
  return offsets;
}
