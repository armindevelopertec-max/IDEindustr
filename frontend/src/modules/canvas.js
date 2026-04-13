import Konva from "konva";

const NODE_WIDTH = 160;
const NODE_HEADER_HEIGHT = 36;
const ACTION_SECTION_PADDING = 10;
const LEVEL_VERTICAL_GAP = 70;
const HORIZONTAL_GAP = 80;
const ACTION_GAP = 24;
const NODE_BODY_HEIGHT = NODE_HEADER_HEIGHT + ACTION_SECTION_PADDING * 2;
const ACTION_PANEL_PADDING = 12;
const ACTION_PANEL_FILL = "rgba(255, 255, 255, 0.05)";
const ACTION_PANEL_STROKE = "rgba(255, 255, 255, 0.2)";
const ACTION_ITEM_FILL = "#ffd166";
const ACTION_ITEM_STROKE = "rgba(0,0,0,0.1)";
const ACTION_ITEM_TEXT = "#2d1f0b";
const ACTION_BADGE_HEIGHT = 26;
const ACTION_BADGE_SPACING = 8;
const ACTION_BADGE_HORIZONTAL_PADDING = 10;
const ACTION_PANEL_MIN_WIDTH = 90;
const ACTION_BADGE_MIN_WIDTH = 60;
const ACTION_FONT_SIZE = 11;
const STATE_PADDING_HORIZONTAL = 14;
const STATE_MIN_WIDTH = 100;
const NODE_TOTAL_WIDTH = NODE_WIDTH + ACTION_PANEL_MIN_WIDTH + ACTION_GAP;

function measureTextWidth(text, fontSize = ACTION_FONT_SIZE, fontStyle = "normal") {
  const helper = new Konva.Text({
    text,
    fontSize,
    fontStyle,
  });
  return helper.getTextWidth();
}

function measureStateWidth(label) {
  const text = new Konva.Text({
    text: label,
    fontSize: 16,
    fontStyle: "bold",
  });
  const measured = text.getTextWidth();
  return Math.max(measured + STATE_PADDING_HORIZONTAL * 2, STATE_MIN_WIDTH);
}

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
  const adjacency = new Map();
  const levelGroups = new Map();
  const nodeMetrics = new Map();

  canvasState.steps.forEach((step) => {
    adjacency.set(step.name, []);
    const stateWidth = Math.max(measureStateWidth(step.name ?? ""), NODE_WIDTH);
    const actions = Array.isArray(step.actions) ? step.actions : [];
    const maxActionTextWidth = actions.reduce((max, action) => {
      const width = measureTextWidth(action, ACTION_FONT_SIZE);
      return Math.max(max, width);
    }, 0);
    const actionPanelWidth = Math.max(
      ACTION_PANEL_MIN_WIDTH,
      maxActionTextWidth + ACTION_PANEL_PADDING * 2,
    );
    nodeMetrics.set(step.name, {
      stateWidth,
      actionPanelWidth,
      totalWidth: stateWidth + ACTION_GAP + actionPanelWidth,
      height: NODE_BODY_HEIGHT,
    });
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

  const layoutGroups = [];
  let requiredWidth = NODE_TOTAL_WIDTH;
  let requiredHeight = 0;
  let levelCursor = 40;
  const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

  sortedLevels.forEach((level) => {
    const nodes = levelGroups.get(level) ?? [];
    if (!nodes.length) {
      return;
    }
    const levelHeight = NODE_BODY_HEIGHT;
    const levelWidth = nodes.reduce((acc, step, idx) => {
      const metrics = nodeMetrics.get(step.name);
      const nodeWidth = metrics?.totalWidth ?? NODE_TOTAL_WIDTH;
      const gap = idx < nodes.length - 1 ? HORIZONTAL_GAP : 0;
      return acc + nodeWidth + gap;
    }, 0);
    layoutGroups.push({
      level,
      nodes,
      rowY: levelCursor,
      levelHeight,
      levelWidth,
    });
    requiredWidth = Math.max(requiredWidth, levelWidth);
    requiredHeight = Math.max(requiredHeight, levelCursor + levelHeight);
    levelCursor += levelHeight + LEVEL_VERTICAL_GAP;
  });

  const containerWidth = containerElement?.clientWidth ?? 800;
  const layoutStageWidth = Math.max(containerWidth, requiredWidth + 160, 520);
  const stageCenterX = layoutStageWidth / 2;

  layoutGroups.forEach(({ nodes, rowY, levelWidth }) => {
    if (!nodes.length) return;
    const rowWidth = levelWidth || NODE_TOTAL_WIDTH;
    let currentX = stageCenterX - rowWidth / 2;
    nodes.forEach((step, index) => {
      const metrics = nodeMetrics.get(step.name);
      const nodeHeight = metrics?.height ?? NODE_BODY_HEIGHT;
      const stateWidth = metrics?.stateWidth ?? NODE_WIDTH;
      const nodeTotalWidth = metrics?.totalWidth ?? NODE_TOTAL_WIDTH;
      positions[step.name] = {
        x: currentX,
        y: rowY,
        height: nodeHeight,
        stateWidth,
        totalWidth: nodeTotalWidth,
      };
      currentX += nodeTotalWidth;
      if (index < nodes.length - 1) {
        currentX += HORIZONTAL_GAP;
      }
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

  const horizontalSpacing = NODE_TOTAL_WIDTH + 40;
  parentChildren.forEach((children, parent) => {
    if (children.length <= 1) return;
    const parentPos = positions[parent];
    if (!parentPos) return;
    const centerOffset = (children.length - 1) / 2;
    children.forEach((childName, index) => {
      const childPos = positions[childName];
      if (!childPos) return;
      childPos.x = parentPos.x + (index - centerOffset) * horizontalSpacing;
      const totalWidth = childPos.totalWidth ?? NODE_TOTAL_WIDTH;
      requiredWidth = Math.max(requiredWidth, childPos.x + totalWidth + 60);
    });
  });

  const finalRequiredWidth = Math.max(requiredWidth, NODE_WIDTH);
  const finalStageWidth = Math.max(containerWidth, finalRequiredWidth + 200, 520);
  const containerHeight = containerElement?.clientHeight ?? stage.height();
  const finalStageHeight = Math.max(containerHeight, requiredHeight + 80, 400);
  stage.width(finalStageWidth);
  stage.height(finalStageHeight);

  canvasState.steps.forEach((step) => {
    const pos = positions[step.name];
    if (!pos) return;

    const isError = Boolean(step.error);
    const stateWidth = pos.stateWidth ?? NODE_WIDTH;
    const actionPanelX = pos.x + stateWidth + ACTION_GAP;
    const stateRect = new Konva.Rect({
      x: pos.x,
      y: pos.y,
      width: stateWidth,
      height: pos.height,
      fill: isError ? "#ff6b6b" : step.active ? "#4df59f" : "#66b2ff",
      cornerRadius: 8,
      stroke: isError ? "#ffb0b0" : "#ffffff",
      strokeWidth: step.level === 0 ? 3 : 2,
      draggable: true,
    });

    if (step.level === 0) {
      const outer = new Konva.Rect({
        x: pos.x - 6,
        y: pos.y - 6,
        width: stateWidth + 12,
        height: pos.height + 12,
        cornerRadius: 10,
        stroke: "#bddbf7",
        strokeWidth: 2,
      });
      layer.add(outer);
    }

    const label = new Konva.Text({
      x: pos.x,
      y: pos.y,
      width: stateWidth,
      align: "center",
      text: `${step.name ?? ""}`,
      fill: "#041725",
      fontSize: 16,
      fontStyle: "bold",
    });
    const centeredY = pos.y + Math.max((pos.height - label.getHeight()) / 2, 0);
    label.y(centeredY);


    const metrics = nodeMetrics.get(step.name);
    const actionPanelWidth = metrics?.actionPanelWidth ?? ACTION_PANEL_MIN_WIDTH;
    const actionPanelRect = new Konva.Rect({
      x: actionPanelX,
      y: pos.y,
      width: actionPanelWidth,
      height: pos.height,
      fill: ACTION_PANEL_FILL,
      stroke: ACTION_PANEL_STROKE,
      strokeWidth: 1,
      cornerRadius: 8,
    });

    const actions = Array.isArray(step.actions) ? step.actions : [];
    const actionListStartY = pos.y + ACTION_PANEL_PADDING;
    actions.forEach((action, actionIdx) => {
      const actionY =
        actionListStartY + actionIdx * (ACTION_BADGE_HEIGHT + ACTION_BADGE_SPACING);
      const panelInnerWidth = Math.max(
        actionPanelWidth - ACTION_PANEL_PADDING * 2,
        ACTION_BADGE_MIN_WIDTH,
      );
      const targetTextWidth = Math.min(
        measureTextWidth(action, ACTION_FONT_SIZE),
        panelInnerWidth - ACTION_BADGE_HORIZONTAL_PADDING * 2,
      );
      const actionRectWidth = Math.max(
        Math.min(targetTextWidth + ACTION_BADGE_HORIZONTAL_PADDING * 2, panelInnerWidth),
        ACTION_BADGE_MIN_WIDTH,
      );
      const actionRect = new Konva.Rect({
        x: actionPanelX + ACTION_PANEL_PADDING,
        y: actionY,
        width: actionRectWidth,
        height: ACTION_BADGE_HEIGHT,
        fill: ACTION_ITEM_FILL,
        stroke: ACTION_ITEM_STROKE,
        strokeWidth: 1,
        cornerRadius: 4,
      });
      const actionLabel = new Konva.Text({
        x: actionRect.x() + ACTION_BADGE_HORIZONTAL_PADDING,
        y: actionRect.y() + 4,
        text: action,
        fontSize: ACTION_FONT_SIZE,
        fill: ACTION_ITEM_TEXT,
        width: actionRect.width() - ACTION_BADGE_HORIZONTAL_PADDING * 2,
        align: "left",
      });
      layer.add(actionRect, actionLabel);
    });

    let actionHint;
    if (!actions.length) {
      actionHint = new Konva.Text({
        x: actionPanelX + ACTION_PANEL_PADDING,
        y: actionListStartY,
        text: "doble clic → agregar acción",
        fontSize: 10,
        fill: "#9bb2d9",
      });
      actionHint.on("dblclick", () => {
        const raw = window.prompt("Nueva acción", "");
        if (raw === null) return;
        step.actions = [...(step.actions ?? []), raw].filter(Boolean);
        drawGrafcetSteps();
      });
    }

    stateRect.on("mouseover", () => {
      stage.container().style.cursor = "grab";
    });
    stateRect.on("mouseout", () => {
      stage.container().style.cursor = "default";
    });
    stateRect.on("dragend", () => {
      step.position = { x: stateRect.x(), y: stateRect.y() };
      drawGrafcetSteps();
    });
    stateRect.on("dblclick", () => {
      const input = window.prompt("Nivel del paso", String(step.level));
      if (input === null) return;
      const parsed = parseInt(input, 10);
      if (!Number.isNaN(parsed)) {
        step.level = parsed;
        drawGrafcetSteps();
      }
    });

    layer.add(stateRect, actionPanelRect, label);
    if (actionHint) {
      layer.add(actionHint);
    }
  });

  const transitionsPerSource = new Map();
  const stepLookup = new Map(canvasState.steps.map((step) => [step.name, step]));
  canvasState.steps.forEach((stepItem) => {
    const count = stepItem.transitions?.length ?? 0;
    if (count > 0) transitionsPerSource.set(stepItem.name, count);
  });
  const transitionCounter = {};
  const branchOffsetsBySource = new Map();

  canvasState.steps.forEach((step) => {
    step.transitions?.forEach((transition) => {
      const source = positions[transition.source];
      const target = positions[transition.target];
      if (!source || !target) return;

      const totalFromSource = transitionsPerSource.get(step.name) ?? 1;
      const idx = transitionCounter[step.name] ?? 0;
      transitionCounter[step.name] = idx + 1;
      const horizontalOffset = (idx - (totalFromSource - 1) / 2) * 18;

      const sourceStateWidth = source.stateWidth ?? NODE_WIDTH;
      const startX = source.x + sourceStateWidth / 2;
      const startY = source.y + source.height;
      const targetStateWidth = target.stateWidth ?? NODE_WIDTH;
      const targetCenterX = target.x + targetStateWidth / 2;
      const targetEntryY = target.y;
      if (!branchOffsetsBySource.has(step.name)) {
        branchOffsetsBySource.set(step.name, createBranchOffsets(totalFromSource));
      }
      const offsets = branchOffsetsBySource.get(step.name);
      const offsetY = offsets[idx] ?? 0;
      const horizontalY =
        startY + Math.max(50, Math.abs(targetEntryY - startY) / 2) + offsetY;
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
