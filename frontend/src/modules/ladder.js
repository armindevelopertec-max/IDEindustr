import Konva from "konva";

/**
 * LADDER ENGINE - Nivel Industrial
 * Soporta lógica de auto-mantenimiento con bobinas normales para Estados.
 */

const GRID_H = 120; 
const GRID_W = 80;  
const RAIL_OFFSET = 40;
const CONTACT_SIZE = 40;
const COIL_SIZE = 40;

export const LadderEngine = {
  /**
   * Genera el modelo IR usando bobinas normales y auto-mantenimiento para los estados.
   */
  generateIR(steps) {
    const rungs = [];
    
    // 1. Ordenar pasos numéricamente
    const sortedSteps = [...steps].sort((a, b) => {
        const isA0 = a.name === 'S0' || a.name === '1.00';
        const isB0 = b.name === 'S0' || b.name === '1.00';
        if (isA0) return -1;
        if (isB0) return 1;
        return a.name.localeCompare(b.name, undefined, {numeric: true});
    });

    // ==========================================
    // BLOQUE 1: LÓGICA DE CONTROL DE ESTADOS
    // ==========================================
    
    // RUNG 0: Inicialización (P_First_Cycle -> SET S0)
    const firstStep = sortedSteps[0];
    if (firstStep && (firstStep.name === 'S0' || firstStep.name === '1.00')) {
        rungs.push({
            comment: "INICIALIZACIÓN: Activar Estado Inicial (S0) al arrancar",
            contacts: [{ type: 'NO', label: 'P_First_Cycle', addr: 'CF002' }],
            output: { type: 'COIL', mode: 'SET', label: firstStep.name }
        });
    }

    // Peldaños de Control (Transiciones S0 -> S1, S1 -> S2, etc.)
    sortedSteps.forEach((step) => {
      (step.transitions || []).forEach(trans => {
        const nextStepName = trans.target;
        const condContacts = trans.condition.split(/,|AND/i)
          .map(c => c.trim())
          .filter(c => c !== '1' && c !== '')
          .map(c => {
            const isNC = c.toUpperCase().startsWith('NOT ');
            return { type: isNC ? 'NC' : 'NO', label: isNC ? c.substring(4).trim() : c };
          });

        rungs.push({
          comment: `CONTROL: Activación de ${nextStepName} desde ${step.name}`,
          isStateLogic: true,
          specialLayout: 'LATCH',
          prevStep: step.name,
          currentStep: nextStepName,
          conditions: condContacts,
          nextSteps: this.findFollowingStates(nextStepName, steps),
          output: { type: 'COIL', mode: 'NORMAL', label: nextStepName }
        });
      });
    });

    // ==========================================
    // BLOQUE 2: LÓGICA DE SALIDAS (ACCIONES)
    // ==========================================
    
    sortedSteps.forEach((step) => {
      if (step.actions && step.actions.length > 0) {
        step.actions.forEach(action => {
          const mode = action.includes('+') ? 'SET' : (action.includes('-') ? 'RESET' : 'NORMAL');
          const cleanName = action.replace(/[+\-]/g, '').trim();
          
          rungs.push({
            comment: `SALIDA: ${cleanName} (Activa en ${step.name})`,
            contacts: [{ type: 'NO', label: step.name }],
            output: { type: 'COIL', mode, label: cleanName }
          });
        });
      }
    });

    return rungs;
  },

  findFollowingStates(targetStateName, steps) {
    const targetStep = steps.find(s => s.name === targetStateName);
    if (!targetStep || !targetStep.transitions) return [];
    return targetStep.transitions.map(t => t.target);
  },

  render(containerId, rungs, variableMapper) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    const width = container.clientWidth;
    const height = Math.max(container.clientHeight, rungs.length * GRID_H + 100);

    const stage = new Konva.Stage({ container: containerId, width, height });
    const layer = new Konva.Layer();
    stage.add(layer);

    // Rieles
    layer.add(new Konva.Line({ points: [RAIL_OFFSET, 0, RAIL_OFFSET, height], stroke: '#4df59f', strokeWidth: 4 }));
    layer.add(new Konva.Line({ points: [width - RAIL_OFFSET, 0, width - RAIL_OFFSET, height], stroke: '#4df59f', strokeWidth: 4 }));

    rungs.forEach((rung, index) => {
      const y = (index + 1) * GRID_H;
      this.drawRung(layer, rung, y, width, variableMapper);
    });

    layer.draw();
  },

  drawRung(layer, rung, y, fullWidth, mapper) {
    if (rung.comment) {
      layer.add(new Konva.Text({ x: RAIL_OFFSET + 10, y: y - 50, text: `// ${rung.comment}`, fontSize: 11, fill: '#9bb2d9', fontStyle: 'italic' }));
    }

    if (rung.specialLayout === 'LATCH') {
      this.drawLatchingRung(layer, rung, y, fullWidth, mapper);
    } else {
      // Rung normal (Serie)
      layer.add(new Konva.Line({ points: [RAIL_OFFSET, y, fullWidth - RAIL_OFFSET, y], stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }));
      let currentX = RAIL_OFFSET + 40;
      rung.contacts.forEach(c => {
        this.drawContact(layer, currentX, y, c, mapper);
        currentX += GRID_W;
      });
      this.drawCoil(layer, fullWidth - RAIL_OFFSET - 60, y, rung.output, mapper);
    }
  },

  drawLatchingRung(layer, rung, y, fullWidth, mapper) {
    const startX = RAIL_OFFSET;
    const latchY = y + 30;

    // Rama superior: S_prev AND Conditions
    layer.add(new Konva.Line({ points: [startX, y, startX + 20, y], stroke: '#fff', strokeWidth: 2 }));
    this.drawContact(layer, startX + 40, y, { type: 'NO', label: rung.prevStep }, mapper);
    
    let currentX = startX + 40 + GRID_W;
    rung.conditions.forEach(c => {
      this.drawContact(layer, currentX, y, c, mapper);
      currentX += GRID_W;
    });

    // Rama inferior: S_current (Auto-mantenimiento)
    layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, latchY, startX + 40, latchY], stroke: '#fff', strokeWidth: 2 }));
    this.drawContact(layer, startX + 40, latchY, { type: 'NO', label: rung.currentStep }, mapper);
    
    // Cerrar el paralelo
    const parallelEndX = Math.max(startX + 40 + GRID_W, currentX - GRID_W + 40);
    layer.add(new Konva.Line({ points: [startX + 40 + GRID_W - 20, latchY, parallelEndX + 20, latchY, parallelEndX + 20, y], stroke: '#fff', strokeWidth: 2 }));

    // Contactos de desactivación (Next Steps en NC)
    let nextX = parallelEndX + 40;
    rung.nextSteps.forEach(ns => {
      this.drawContact(layer, nextX, y, { type: 'NC', label: ns }, mapper);
      nextX += GRID_W;
    });

    // Línea hasta la bobina
    const coilX = fullWidth - RAIL_OFFSET - 60;
    layer.add(new Konva.Line({ points: [nextX - 20, y, coilX, y], stroke: 'rgba(255,255,255,0.2)', strokeWidth: 2 }));
    this.drawCoil(layer, coilX, y, rung.output, mapper);
  },

  drawContact(layer, x, y, contact, mapper) {
    const group = new Konva.Group({ x: x - 20, y: y - 20 });
    group.add(new Konva.Line({ points: [0, 20, 10, 20], stroke: '#fff', strokeWidth: 2 }));
    group.add(new Konva.Line({ points: [30, 20, 40, 20], stroke: '#fff', strokeWidth: 2 }));
    group.add(new Konva.Line({ points: [10, 10, 10, 30], stroke: '#fff', strokeWidth: 2 }));
    group.add(new Konva.Line({ points: [30, 10, 30, 30], stroke: '#fff', strokeWidth: 2 }));
    
    if (contact.type === 'NC') {
      group.add(new Konva.Line({ points: [12, 28, 28, 12], stroke: '#ff6b6b', strokeWidth: 2 }));
    }

    const addr = mapper ? mapper.translate(contact.label) : "";
    group.add(new Konva.Text({ x: -10, y: -18, width: 60, text: contact.label, fontSize: 10, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: -10, y: 32, width: 60, text: addr, fontSize: 9, fill: '#4df59f', align: 'center' }));
    layer.add(group);
  },

  drawCoil(layer, x, y, output, mapper) {
    const group = new Konva.Group({ x, y: y - 20 });
    group.add(new Konva.Arc({ x: 10, y: 20, innerRadius: 14, outerRadius: 15, angle: 120, rotation: 120, stroke: '#fff', strokeWidth: 2 }));
    group.add(new Konva.Arc({ x: 30, y: 20, innerRadius: 14, outerRadius: 15, angle: 120, rotation: -60, stroke: '#fff', strokeWidth: 2 }));
    group.add(new Konva.Line({ points: [-20, 20, 0, 20], stroke: '#fff', strokeWidth: 2 }));
    group.add(new Konva.Line({ points: [40, 20, 60, 20], stroke: '#fff', strokeWidth: 2 }));

    if (output.mode === 'SET' || output.mode === 'RESET') {
        group.add(new Konva.Text({ x: 15, y: 14, text: output.mode[0], fontSize: 12, fill: '#4df59f', fontStyle: 'bold' }));
    }

    const addr = mapper ? mapper.translate(output.label) : "";
    group.add(new Konva.Text({ x: -10, y: -18, width: 60, text: output.label, fontSize: 10, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: -10, y: 32, width: 60, text: addr, fontSize: 9, fill: '#4df59f', align: 'center' }));
    layer.add(group);
  }
};
