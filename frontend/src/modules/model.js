const STATE_PATTERN = /^S(\d+)$/i;
const LINE_PATTERN =
  /^\s*(S\d+)\s+(?:THEN\s+(.+?)\s+)?NEXT\s+(.+?)\s*->\s*(S\d+)\s*$/i;

function createState(id) {
  const match = STATE_PATTERN.exec(id.toUpperCase());
  const number = match ? Number(match[1]) : Number.NaN;
  return {
    id,
    number: Number.isFinite(number) ? number : null,
    actions: [],
    outgoing: [],
    incoming: new Set(),
    errorMessages: [],
  };
}

function pushStateError(state, message, errors, line = null) {
  if (state) {
    state.errorMessages.push(message);
  }
  const label = state ? `${state.id}: ${message}` : message;
  errors.push({ line, message: label });
}

function parseLine(line) {
  const match = LINE_PATTERN.exec(line);
  if (!match) {
    return null;
  }

  const [, source, action, condition, target] = match;
  return {
    source: source.toUpperCase(),
    target: target.toUpperCase(),
    condition: condition?.trim() ?? "",
    action: action?.trim() ?? "",
  };
}

function ensureState(map, id) {
  if (!map.has(id)) {
    map.set(id, createState(id));
  }
  return map.get(id);
}

export function parseCnlText(text = "") {
  // Extraer metadatos si existen
  let layoutData = null;
  const layoutMatch = text.match(/\/\* LAYOUT_DATA: (.*) \*\//);
  if (layoutMatch) {
    try {
      layoutData = JSON.parse(layoutMatch[1]);
    } catch (e) {
      console.warn("Error al parsear metadatos de diseño");
    }
  }

  const cleanText = text.replace(/\/\* LAYOUT_DATA: .* \*\//, "");
  const lines = cleanText.split(/\r?\n/);
  const stateMap = new Map();
  const transitions = [];
  const errors = [];
  const conditionMap = new Map();
  const definedLevelNumbers = new Set();

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const parsed = parseLine(trimmed);
    if (!parsed) {
      errors.push({
        line: index + 1,
        message:
          "Sintaxis inválida. Usa 'Sx [THEN acción] NEXT condición -> Sy' (THEN es opcional).",
      });
      return;
    }

    const { source, target, condition, action } = parsed;
    const sourceState = ensureState(stateMap, source);
    const targetState = ensureState(stateMap, target);
    if (Number.isFinite(sourceState.number)) {
      definedLevelNumbers.add(sourceState.number);
    }
    if (Number.isFinite(targetState.number)) {
      definedLevelNumbers.add(targetState.number);
    }

    const normalizedCondition = (condition ?? "").trim().toUpperCase();
    const conflictKey = `${source}:${normalizedCondition}`;
    if (conditionMap.has(conflictKey)) {
      pushStateError(
        sourceState,
        `Condición duplicada '${condition || "AUTO"}' desde ${source}.`,
        errors,
        index + 1,
      );
    } else {
      conditionMap.set(conflictKey, true);
    }

    if (!STATE_PATTERN.test(source)) {
      errors.push({
        line: index + 1,
        message: `Identificador de etapa origen inválido: ${source}.`,
      });
    }
    if (!STATE_PATTERN.test(target)) {
      errors.push({
        line: index + 1,
        message: `Identificador de etapa destino inválido: ${target}.`,
      });
    }

    const transition = {
      from: source,
      to: target,
      condition,
      action,
      line: index + 1,
    };
    transitions.push(transition);
    sourceState.outgoing.push(transition);
    targetState.incoming.add(transition);

    if (action) {
      const pieces = action
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      pieces.forEach((piece) => {
        if (!sourceState.actions.includes(piece)) {
          sourceState.actions.push(piece);
        }
      });
    }

    if (source !== "S0" && sourceState.number !== null && targetState.number !== null) {
      const diff = targetState.number - sourceState.number;
      if (diff > 1) {
        const missingLevels = [];
        for (let lvl = sourceState.number + 1; lvl < targetState.number; lvl += 1) {
          if (!definedLevelNumbers.has(lvl)) {
            missingLevels.push(lvl);
          }
        }
        if (missingLevels.length) {
          const message = `Salto inconsistente detectado entre ${source} y ${target}. Faltan estados en niveles ${missingLevels.join(", ")}.`;
          pushStateError(sourceState, message, errors, index + 1);
        }
      }
    }
  });

  if (!stateMap.has("S0")) {
    errors.push({
      line: null,
      message: "Falta la etapa inicial obligatoria S0.",
    });
  }

  const reachable = new Set();
  if (stateMap.has("S0")) {
    const queue = ["S0"];
    while (queue.length) {
      const current = queue.shift();
      if (!current || reachable.has(current)) continue;
      reachable.add(current);
      const state = stateMap.get(current);
      if (!state) continue;
      state.outgoing.forEach((transition) => {
        if (!reachable.has(transition.to)) {
          queue.push(transition.to);
        }
      });
    }
  }

  stateMap.forEach((state) => {
    if (state.id === "S0") return;
    if (!reachable.has(state.id)) {
      pushStateError(state, "No es alcanzable desde S0.", errors);
    }
    if (state.incoming.size === 0) {
      pushStateError(state, "No tiene transiciones de entrada.", errors);
    }
  });

  const sortedStateNumbers = [...new Set(
    [...stateMap.values()]
      .map((state) => (state.number !== null ? state.number : -1))
      .filter((num) => num >= 0),
  )].sort((a, b) => a - b);

  for (let i = 1; i < sortedStateNumbers.length; i += 1) {
    const diff = sortedStateNumbers[i] - sortedStateNumbers[i - 1];
    if (diff > 1) {
      errors.push({
        line: null,
        message: `Falta declarar etapas intermedias entre S${sortedStateNumbers[i - 1]} y S${sortedStateNumbers[i]}.`,
      });
    }
  }

  const steps = [...stateMap.values()]
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    .map((state) => {
      const step = {
        name: state.id,
        actions: [...state.actions],
        transitions: state.outgoing.map((transition) => ({
          source: transition.from,
          target: transition.to,
          condition: transition.condition,
        })),
        level: state.number ?? 0,
        active: state.id === "S0",
        error: state.errorMessages.length > 0,
      };

      // Aplicar metadatos guardados si existen para este paso
      if (layoutData && layoutData[state.id]) {
        const meta = layoutData[state.id];
        if (meta.position) step.position = meta.position;
        
        // Aplicar manualX/Y a las transiciones
        if (meta.transitions) {
          step.transitions = step.transitions.map(t => {
            const mTrans = meta.transitions.find(mt => mt.target === t.target && mt.condition === t.condition);
            if (mTrans) {
              return { ...t, manualX: mTrans.manualX, manualY: mTrans.manualY };
            }
            return t;
          });
        }
      }

      return step;
    });

  return {
    steps,
    transitions,
    errors,
    isValid: errors.length === 0,
  };
}
