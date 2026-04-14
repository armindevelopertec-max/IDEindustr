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
const ACTIONS_PER_ROW = 2;
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
  const oldStepsMap = new Map(canvasState.steps.map((s) => [s.name, s]));

  canvasState.steps = steps.map((step) => {
    const normalized = normalizeStep(step);
    const oldStep = oldStepsMap.get(normalized.name);
    
    // 1. Prioridad: Datos que ya vienen en el objeto (del parser/archivo)
    // 2. Prioridad: Datos de la sesión actual (oldStep)
    if (step.position) {
      normalized.position = { ...step.position };
    } else if (oldStep?.position) {
      normalized.position = { ...oldStep.position };
    }
    
    // Lo mismo para transiciones manuales
    normalized.transitions = normalized.transitions.map(newTrans => {
      // Prioridad 1: Datos que vienen del archivo
      if (newTrans.manualX !== undefined && newTrans.manualX !== null) {
        return newTrans;
      }

      // Prioridad 2: Datos de la sesión actual
      if (oldStep) {
        const oldTrans = oldStep.transitions.find(
          ot => ot.target === newTrans.target && ot.condition === newTrans.condition
        );
        if (oldTrans) {
          return {
            ...newTrans,
            manualX: oldTrans.manualX,
            manualY: oldTrans.manualY
          };
        }
      }
      return newTrans;
    });

    return normalized;
  });

  canvasState.nextStepId = Math.max(
    2,
    ...canvasState.steps.map((s) => {
      const match = s.name.match(/\d+/);
      return match ? parseInt(match[0], 10) + 1 : 0;
    }),
    canvasState.steps.length + 1,
  );
  drawGrafcetSteps();
}

function normalizeStep(step) {
  return {
    name: step.name,
    actions: Array.isArray(step.actions) ? [...step.actions] : [],
    transitions: Array.isArray(step.transitions)
      ? step.transitions.map((transition) => ({
          ...transition,
          manualX: transition.manualX ?? null,
          manualY: transition.manualY ?? null,
        }))
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
    const isS0 = step.name === "S0";
    const stateWidth = Math.max(measureStateWidth(step.name ?? ""), NODE_WIDTH);
    const actions = !isS0 && Array.isArray(step.actions) ? step.actions : [];
    const actionRows = [];
    
    if (!isS0) {
      actions.forEach((action, idx) => {
        const rowIndex = Math.floor(idx / ACTIONS_PER_ROW);
        const textWidth = measureTextWidth(action, ACTION_FONT_SIZE);
        const badgeWidth = Math.max(
          textWidth + ACTION_BADGE_HORIZONTAL_PADDING * 2,
          ACTION_BADGE_MIN_WIDTH,
        );
        if (!actionRows[rowIndex]) {
          actionRows[rowIndex] = { items: [], rowWidth: 0 };
        }
        const row = actionRows[rowIndex];
        row.items.push({ text: action, width: badgeWidth });
        row.rowWidth += badgeWidth + (row.items.length > 1 ? ACTION_BADGE_SPACING : 0);
      });
    }

    const maxRowWidth = actionRows.reduce(
      (max, row) => Math.max(max, row.rowWidth),
      0,
    );
    const innerPanelWidth = Math.max(maxRowWidth, isS0 ? 0 : ACTION_PANEL_MIN_WIDTH);
    const actionPanelWidth = isS0 ? 0 : innerPanelWidth + ACTION_PANEL_PADDING * 2;
    const actionRowsHeight =
      actionRows.length * ACTION_BADGE_HEIGHT + Math.max(0, actionRows.length - 1) * ACTION_BADGE_SPACING;
    const panelContentHeight = actionRowsHeight || (isS0 ? 0 : ACTION_BADGE_HEIGHT);
    const panelHeightWithPadding = isS0 ? 0 : panelContentHeight + ACTION_PANEL_PADDING * 2;
    const nodeHeight = Math.max(NODE_BODY_HEIGHT, panelHeightWithPadding);
    
    nodeMetrics.set(step.name, {
      stateWidth,
      actionPanelWidth,
      actionPanelInnerWidth: innerPanelWidth,
      actionRows,
      panelContentHeight,
      height: nodeHeight,
      totalWidth: stateWidth + (isS0 ? 0 : ACTION_GAP + actionPanelWidth),
    });
  });

  canvasState.steps.forEach((step) => {
    (step.transitions ?? []).forEach((transition) => {
      adjacency.get(step.name)?.push(transition.target);
    });
  });

  const depthMap = new Map();
  const stepIndices = new Map(canvasState.steps.map((s, i) => [s.name, i]));
  
  canvasState.steps.forEach((step) => {
    depthMap.set(step.name, 0);
  });

  // Propagación de niveles respetando el orden del array para evitar ciclos
  // y asegurar que los pasos posteriores estén en niveles inferiores.
  for (let i = 0; i < canvasState.steps.length; i++) {
    let changed = false;
    canvasState.steps.forEach((step) => {
      const sourceDepth = depthMap.get(step.name);
      (step.transitions ?? []).forEach((t) => {
        const sourceIdx = stepIndices.get(step.name);
        const targetIdx = stepIndices.get(t.target);
        if (targetIdx > sourceIdx) {
          const currentTargetDepth = depthMap.get(t.target);
          if (currentTargetDepth < sourceDepth + 1) {
            depthMap.set(t.target, sourceDepth + 1);
            changed = true;
          }
        }
      });
    });
    if (!changed) break;
  }

  canvasState.steps.forEach((step) => {
    const depth = depthMap.get(step.name);
    if (!levelGroups.has(depth)) {
      levelGroups.set(depth, []);
    }
    levelGroups.get(depth).push(step);
  });

  const layoutGroups = [];
  const levelMetrics = new Map(); // Para guardar rowY y height por nivel
  let requiredWidth = NODE_TOTAL_WIDTH;
  let requiredHeight = 0;
  let levelCursor = 40;
  const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

  sortedLevels.forEach((level) => {
    const nodes = levelGroups.get(level) ?? [];
    if (!nodes.length) return;
    
    const levelHeight = nodes.reduce((maxHeight, step) => {
      const metrics = nodeMetrics.get(step.name);
      return Math.max(maxHeight, metrics?.height ?? NODE_BODY_HEIGHT);
    }, NODE_BODY_HEIGHT);

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

    levelMetrics.set(level, { rowY: levelCursor, height: levelHeight });
    
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
      
      // Respect manual position if it exists
      if (step.position) {
        positions[step.name] = {
          x: step.position.x,
          y: step.position.y,
          height: nodeHeight,
          stateWidth,
          totalWidth: nodeTotalWidth,
          isManual: true
        };
      } else {
        positions[step.name] = {
          x: currentX,
          y: rowY,
          height: nodeHeight,
          stateWidth,
          totalWidth: nodeTotalWidth,
        };
      }

      currentX += nodeTotalWidth;
      if (index < nodes.length - 1) {
        currentX += HORIZONTAL_GAP;
      }
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
    const isS0 = step.name === "S0";
    const actionPanelWidth = metrics?.actionPanelWidth ?? 0;
    const actionPanelInnerWidth = metrics?.actionPanelInnerWidth ?? 0;

    if (!isS0) {
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
      
      // LÍNEA DE UNIÓN ESTADO <-> ACCIÓN
      const connectingLine = new Konva.Line({
        points: [
          pos.x + stateWidth, pos.y + pos.height / 2, // Salida: Centro derecha del estado
          actionPanelX, pos.y + pos.height / 2       // Entrada: Centro izquierda del panel
        ],
        stroke: "#ffffff44",
        strokeWidth: 2,
      });

      layer.add(connectingLine, actionPanelRect);

      const actionRows = metrics?.actionRows ?? [];
      const actionRowsHeight = metrics?.panelContentHeight ?? ACTION_BADGE_HEIGHT;
      const actionListTop = pos.y + (pos.height - actionRowsHeight) / 2;
      
      actionRows.forEach((row, rowIndex) => {
        const rowY =
          actionListTop + rowIndex * (ACTION_BADGE_HEIGHT + ACTION_BADGE_SPACING);
        const rowStartX =
          actionPanelX + ACTION_PANEL_PADDING + Math.max((actionPanelInnerWidth - row.rowWidth) / 2, 0);
        let cursorX = rowStartX;
        row.items.forEach((item) => {
          const actionRect = new Konva.Rect({
            x: cursorX,
            y: rowY,
            width: item.width,
            height: ACTION_BADGE_HEIGHT,
            fill: ACTION_ITEM_FILL,
            stroke: ACTION_ITEM_STROKE,
            strokeWidth: 1,
            cornerRadius: 4,
          });
          const actionLabel = new Konva.Text({
            x: actionRect.x() + ACTION_BADGE_HORIZONTAL_PADDING,
            y: actionRect.y() + 4,
            text: item.text,
            fontSize: ACTION_FONT_SIZE,
            fill: ACTION_ITEM_TEXT,
            width: actionRect.width() - ACTION_BADGE_HORIZONTAL_PADDING * 2,
            align: "left",
          });
          layer.add(actionRect, actionLabel);
          cursorX += item.width + ACTION_BADGE_SPACING;
        });
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

    layer.add(stateRect, label);
  });

  const stepLookup = new Map(canvasState.steps.map((step) => [step.name, step]));
  const loopOffsetsBySource = new Map();
  const loopLabelBuckets = new Map();

  canvasState.steps.forEach((step) => {
    const sourceLevel = Number.isFinite(step.level) ? step.level : 0;
    const loops = [];
    (step.transitions ?? []).forEach((transition) => {
      const targetLevel = Number.isFinite(stepLookup.get(transition.target)?.level)
        ? stepLookup.get(transition.target)?.level
        : 0;
      if (targetLevel <= sourceLevel) {
        loops.push(transition);
      }
    });
    if (!loops.length) return;
    const spacing = 32;
    const verticalSpacing = 6;
    loops.forEach((transition, index) => {
      const offset = (index - (loops.length - 1) / 2) * spacing;
      const verticalOffset = (index - (loops.length - 1) / 2) * verticalSpacing;
      loopOffsetsBySource.set(transition, {
        offset,
        verticalOffset,
      });
    });
  });

  // Recopilar etiquetas para dibujarlas al final (siempre al frente)
  const normalLabels = [];

  canvasState.steps.forEach((step) => {
    step.transitions?.forEach((transition) => {
      const source = positions[transition.source];
      const target = positions[transition.target];
      if (!source || !target) return;

      const sourceStateWidth = source.stateWidth ?? NODE_WIDTH;
      const startX = source.x + sourceStateWidth / 2;
      const startY = source.y + source.height;
      const targetStateWidth = target.stateWidth ?? NODE_WIDTH;
      const targetCenterX = target.x + targetStateWidth / 2;
      const targetEntryY = target.y;
      const targetLevel = Number.isFinite(stepLookup.get(transition.target)?.level)
        ? stepLookup.get(transition.target)?.level
        : 0;
      const sourceLevel = Number.isFinite(step.level) ? step.level : 0;
      const shouldLoop = targetLevel <= sourceLevel;

      const isAscending = targetEntryY < startY;
      const loopBias = loopOffsetsBySource.get(transition) ?? {
        offset: 0,
        verticalOffset: 0,
      };

      // Cálculo de horizontalY: si es hacia adelante, usar el punto medio del espacio bajo el nivel actual
      const sourceLevelMetrics = levelMetrics.get(sourceLevel);
      const horizontalY = transition.manualY !== null 
        ? transition.manualY 
        : (shouldLoop 
            ? startY + Math.max(50, Math.abs(targetEntryY - startY) / 2) + loopBias.verticalOffset
            : (sourceLevelMetrics 
                ? sourceLevelMetrics.rowY + sourceLevelMetrics.height + LEVEL_VERTICAL_GAP / 2 + loopBias.verticalOffset
                : startY + 25));

      const nodeHeight = target.height ?? NODE_BODY_HEIGHT;
      const entryMargin = Math.min(8, Math.max(3, nodeHeight / 6));
      const finalTargetEntryY = targetEntryY - entryMargin;

      const loopDirection = Math.sign(targetCenterX - startX) || 1;
      const loopLeadingOffset = shouldLoop ? loopDirection * 6 : 0;
      const arrowStartX = startX + (shouldLoop ? loopBias.offset + loopLeadingOffset : 0);
      const arrowStartY = startY + (shouldLoop ? loopBias.verticalOffset : 0);

      const points = shouldLoop
        ? buildLoopPoints(arrowStartX, arrowStartY, targetCenterX, finalTargetEntryY, loopBias.offset, transition.manualX)
        : [
            arrowStartX, arrowStartY,
            arrowStartX, horizontalY,
            targetCenterX, horizontalY,
            targetCenterX, finalTargetEntryY,
          ];

      const arrowColor = getStateColor(transition.target);

      const arrow = new Konva.Arrow({
        points,
        pointerLength: 10,
        pointerWidth: 10,
        stroke: arrowColor,
        fill: arrowColor,
        strokeWidth: 2,
        tension: 0,
        opacity: 0.8,
      });

      // Handle para estirar la línea
      const handle = new Konva.Circle({
        radius: 5,
        fill: arrowColor,
        draggable: true,
        stroke: "white",
        strokeWidth: 1,
        opacity: 0.4,
      });

      if (shouldLoop) {
        const hClearance = 80;
        const mX = transition.manualX !== null 
          ? transition.manualX 
          : Math.max(arrowStartX, targetCenterX) + hClearance + loopBias.offset * 20;

        handle.position({ x: mX, y: (arrowStartY + finalTargetEntryY) / 2 });
        handle.on("dragmove", () => {
          transition.manualX = handle.x();
          arrow.points(buildLoopPoints(arrowStartX, arrowStartY, targetCenterX, finalTargetEntryY, loopBias.offset, transition.manualX));
        });
      } else {
        handle.position({ x: targetCenterX, y: horizontalY });
        handle.on("dragmove", () => {
          transition.manualY = handle.y();
          arrow.points([arrowStartX, arrowStartY, arrowStartX, transition.manualY, targetCenterX, transition.manualY, targetCenterX, finalTargetEntryY]);
        });
      }

      handle.on("dragend", () => drawGrafcetSteps());

      const labelValue = {
        targetId: transition.target,
        text: transition.condition ?? "AUTO",
        x: targetCenterX,
        y: finalTargetEntryY - 14,
        originalTransition: transition,
        color: arrowColor // Pasamos el color aquí
      };

      if (shouldLoop) {
        const bucket = loopLabelBuckets.get(transition.source) ?? [];
        bucket.push({ text: labelValue.text, color: arrowColor, width: Math.max(measureTextWidth(labelValue.text), 40) });
        loopLabelBuckets.set(transition.source, bucket);
      } else {
        normalLabels.push(labelValue);
      }

      layer.add(arrow, handle);
    });
  });

  // Dibujar etiquetas normales con gestión de convergencia
  const convergenceGroups = new Map();
  normalLabels.forEach(label => {
    if (!convergenceGroups.has(label.targetId)) convergenceGroups.set(label.targetId, []);
    convergenceGroups.get(label.targetId).push(label);
  });

  convergenceGroups.forEach((labels, targetId) => {
    const total = labels.length;
    const spacing = 60; // Espacio entre etiquetas convergentes
    labels.forEach((label, idx) => {
      const offset = (idx - (total - 1) / 2) * spacing;
      const textValue = label.text;
      const width = Math.max(measureTextWidth(textValue), 48);

      const labelBg = new Konva.Rect({
        x: label.x + offset - width / 2 - 4,
        y: label.y - 12,
        width: width + 8,
        height: 18,
        fill: "rgba(5, 12, 25, 0.95)",
        cornerRadius: 4,
        stroke: "#ffffff44",
        strokeWidth: 1.5,
      });

      const labelText = new Konva.Text({
        x: label.x + offset - width / 2,
        y: label.y - 10,
        text: textValue,
        fontSize: 11,
        fontStyle: "bold",
        fill: label.color ?? "#f5faff", // Usamos el color de la flecha
        width: width,
        align: "center",
      });

      labelText.on("dblclick", () => {
        const value = window.prompt("Condición", label.originalTransition.condition);
        if (value !== null) {
          label.originalTransition.condition = value;
          drawGrafcetSteps();
        }
      });

      layer.add(labelBg, labelText);
    });
  });

  loopLabelBuckets.forEach((labels, sourceId) => {    const parentPos = positions[sourceId];
    if (!parentPos) return;
    const baseX = parentPos.x + parentPos.stateWidth + 10;
    let currentY = parentPos.y + parentPos.height / 2;
    labels.forEach((entry) => {
      const rect = new Konva.Rect({
        x: baseX,
        y: currentY,
        width: entry.width + 8,
        height: 18,
        fill: "rgba(5, 12, 25, 0.95)",
        cornerRadius: 4,
        stroke: "#ffffff88",
        strokeWidth: 1,
      });
      const text = new Konva.Text({
        x: baseX + 4,
        y: currentY + 3,
        text: entry.text,
        fontSize: 11,
        fontStyle: "bold",
        fill: entry.color,
      });
      layer.add(rect, text);
      currentY += 22;
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


function buildLoopPoints(startX, startY, targetX, targetY, loopOffset = 0, manualX = null) {
  const horizontalClearance = 80;
  const marginX = manualX !== null ? manualX : Math.max(startX, targetX) + horizontalClearance + loopOffset * 20;
  
  return [
    startX,
    startY,
    startX,
    startY + 20,
    marginX,
    startY + 20,
    marginX,
    targetY - 20,
    targetX,
    targetY - 20,
    targetX,
    targetY,
  ];
}

const loopColorCache = new Map();
function getStateColor(stateId) {
  if (!stateId) return "#ffffff";
  if (loopColorCache.has(stateId)) {
    return loopColorCache.get(stateId);
  }
  const base = [...stateId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hue = (base * 43) % 360;
  const color = `hsl(${hue}, 70%, 60%)`;
  loopColorCache.set(stateId, color);
  return color;
}
