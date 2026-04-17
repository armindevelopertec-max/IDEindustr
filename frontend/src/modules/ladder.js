import Konva from "konva";

/**
 * LADDER ENGINE - Nivel Industrial
 * Renderizado de alta visibilidad (3px) con conexión matemática estandarizada.
 */

const GRID_H = 150; 
const GRID_W = 80;  
const RAIL_OFFSET = 20;
const BRANCH_H = 70; 

export const LadderEngine = {
  generateIR(steps) {
    const rungs = [];
    const stateNames = steps.map(s => s.name);
    
    const sortedSteps = [...steps].sort((a, b) => {
        const isA0 = a.name === 'S0' || a.name === '1.00';
        const isB0 = b.name === 'S0' || b.name === '1.00';
        if (isA0) return -1;
        if (isB0) return 1;
        return a.name.localeCompare(b.name, undefined, {numeric: true});
    });

    const transitionsByTarget = {};
    steps.forEach(s => {
        (s.transitions || []).forEach(t => {
            if (!transitionsByTarget[t.target]) transitionsByTarget[t.target] = [];
            transitionsByTarget[t.target].push(t);
        });
    });

    sortedSteps.forEach((step) => {
      const isInitial = step.name === 'S0' || step.name === '1.00';
      const incoming = transitionsByTarget[step.name] || [];
      const nextStates = this.findFollowingStates(step.name, steps);
      
      const activationBranches = incoming.map(t => {
          const condContacts = t.condition.split(/,|AND/i)
              .map(c => c.trim())
              .filter(c => c !== '1' && c !== '')
              .map(c => {
                  const isNC = c.toUpperCase().startsWith('NOT ');
                  return { type: isNC ? 'NC' : 'NO', label: isNC ? c.substring(4).trim() : c };
              });
          return { prevStep: t.source, conditions: condContacts };
      });

      if (isInitial) {
          const initialClosedStates = [...stateNames]
              .filter((name) => {
                  const match = name.match(/^S(\d+)$/i);
                  return match ? Number(match[1]) >= 2 : false;
              })
              .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

          if (initialClosedStates.length > 0) {
              const [firstClosedState, ...remainingClosedStates] = initialClosedStates;
              activationBranches.push({
                  prevStep: firstClosedState,
                  prevType: 'NC',
                  conditions: remainingClosedStates.map(n => ({ type: 'NC', label: n }))
              });
          }
      }

      if (activationBranches.length > 0) {
        rungs.push({
          comment: `CONTROL: ${step.name}`,
          isStateLogic: true,
          specialLayout: 'LATCH_GROUP',
          targetStep: step.name,
          activationBranches: activationBranches,
          breakStates: nextStates,
          output: { type: 'COIL', mode: 'NORMAL', label: step.name }
        });
      }
    });

    const actionsMap = {}; 
    const setResetActions = [];
    const timers = []; 
    const counters = {}; 

    steps.forEach(step => {
        (step.actions || []).forEach(action => {
            const actionUpper = action.toUpperCase();
            const isTimer = /^(T|TIM)\d*(=|\s*#|seg|$)/i.test(actionUpper);
            const isCounter = /^(CONT|CNT)\d*(=|\s*#|$)/i.test(actionUpper);

            if (isTimer) {
                timers.push({ step: step.name, label: action });
            } else if (isCounter) {
                const cleanName = actionUpper.split('=')[0].trim();
                if (!counters[cleanName]) counters[cleanName] = { increments: [], resets: [], label: action };
                if (actionUpper.includes('=0') || actionUpper.includes('RES')) {
                    counters[cleanName].resets.push(step.name);
                } else {
                    counters[cleanName].increments.push(step.name);
                }
            } else {
                const mode = action.includes('+') ? 'SET' : (action.includes('-') ? 'RESET' : 'NORMAL');
                const cleanName = action.replace(/[+\-]/g, '').trim();
                if (mode === 'NORMAL') {
                    if (!actionsMap[cleanName]) actionsMap[cleanName] = [];
                    if (!actionsMap[cleanName].includes(step.name)) actionsMap[cleanName].push(step.name);
                } else {
                    setResetActions.push({ step: step.name, action: cleanName, mode });
                }
            }
        });
    });

    timers.forEach(t => {
        rungs.push({
            comment: `TIMER: ${t.label}`,
            contacts: [{ type: 'NO', label: t.step }],
            output: { type: 'TIMER', label: t.label }
        });
    });

    Object.keys(counters).forEach(cName => {
        rungs.push({
            comment: `COUNTER: ${cName}`,
            specialLayout: 'COUNTER_BLOCK',
            increments: counters[cName].increments,
            resets: counters[cName].resets,
            output: { type: 'COUNTER', label: counters[cName].label, name: cName }
        });
    });

    Object.keys(actionsMap).forEach(actionName => {
        rungs.push({
            comment: `SALIDA: ${actionName}`,
            specialLayout: 'OR_STATES',
            states: actionsMap[actionName],
            output: { type: 'COIL', mode: 'NORMAL', label: actionName }
        });
    });

    setResetActions.forEach(item => {
        rungs.push({
            comment: `SALIDA: ${item.mode} ${item.action}`,
            contacts: [{ type: 'NO', label: item.step }],
            output: { type: 'COIL', mode: item.mode, label: item.action }
        });
    });

    return rungs;
  },

  findFollowingStates(targetStateName, steps) {
    const targetStep = steps.find(s => s.name === targetStateName);
    if (!targetStep || !targetStep.transitions) return [];
    return targetStep.transitions.map(t => t.target).filter(t => t !== targetStateName);
  },

  render(containerId, rungs, variableMapper) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    const width = container.clientWidth;
    let totalHeight = 100;
    rungs.forEach(r => {
        if (r.specialLayout === 'LATCH_GROUP') totalHeight += (r.activationBranches.length + 1) * BRANCH_H + 70;
        else if (r.specialLayout === 'OR_STATES') totalHeight += (r.states.length) * BRANCH_H + 50;
        else if (r.specialLayout === 'COUNTER_BLOCK') totalHeight += Math.max(r.increments.length, r.resets.length, 2) * BRANCH_H + 70;
        else totalHeight += GRID_H;
    });

    const stage = new Konva.Stage({ container: containerId, width, height: Math.max(800, totalHeight) });
    const layer = new Konva.Layer();
    stage.add(layer);

    layer.add(new Konva.Line({ points: [RAIL_OFFSET, 0, RAIL_OFFSET, totalHeight], stroke: '#4df59f', strokeWidth: 4 }));
    layer.add(new Konva.Line({ points: [width - RAIL_OFFSET, 0, width - RAIL_OFFSET, totalHeight], stroke: '#4df59f', strokeWidth: 4 }));

    let currentY = 80;
    rungs.forEach((rung) => {
      this.drawRung(layer, rung, currentY, width, variableMapper);
      if (rung.specialLayout === 'LATCH_GROUP') currentY += (rung.activationBranches.length + 1) * BRANCH_H + 70;
      else if (rung.specialLayout === 'OR_STATES') currentY += (rung.states.length) * BRANCH_H + 50;
      else if (rung.specialLayout === 'COUNTER_BLOCK') currentY += Math.max(rung.increments.length, rung.resets.length, 2) * BRANCH_H + 70;
      else currentY += GRID_H;
    });
    layer.draw();
  },

  drawRung(layer, rung, y, fullWidth, mapper) {
    if (rung.comment) {
      layer.add(new Konva.Text({ x: RAIL_OFFSET + 10, y: y - 55, text: `// ${rung.comment}`, fontSize: 11, fill: '#9bb2d9', fontStyle: 'italic' }));
    }

    const rightRailX = fullWidth - RAIL_OFFSET;
    const isFunctional = rung.output.type === 'TIMER' || rung.output.type === 'COUNTER';
    const outputWidth = isFunctional ? 160 : 80;
    const outputEntryX = rightRailX - outputWidth;

    if (rung.specialLayout === 'LATCH_GROUP') {
      this.drawLatchingGroupRung(layer, rung, y, fullWidth, mapper, outputEntryX);
    } else if (rung.specialLayout === 'OR_STATES') {
      this.drawOrStatesRung(layer, rung, y, fullWidth, mapper, outputEntryX);
    } else if (rung.specialLayout === 'COUNTER_BLOCK') {
      this.drawCounterBlockRung(layer, rung, y, fullWidth, mapper);
    } else {
      let lastX = RAIL_OFFSET;
      let currentX = RAIL_OFFSET + 40;

      (rung.contacts || []).forEach(c => {
        layer.add(new Konva.Line({ points: [lastX, y, currentX - 20, y], stroke: '#fff', strokeWidth: 3 }));
        this.drawContact(layer, currentX, y, c, mapper);
        lastX = currentX + 20;
        currentX += GRID_W;
      });

      if (lastX < outputEntryX) {
        layer.add(new Konva.Line({ points: [lastX, y, outputEntryX, y], stroke: '#fff', strokeWidth: 3 }));
      }
      
      const outputCenterX = outputEntryX + (outputWidth / 2);
      if (isFunctional) this.drawFunctionalBlock(layer, outputCenterX, y, rung.output, mapper);
      else this.drawCoil(layer, outputCenterX, y, rung.output, mapper);

      layer.add(new Konva.Line({ points: [outputEntryX + outputWidth, y, rightRailX, y], stroke: '#fff', strokeWidth: 3 }));
    }
  },

  drawLatchingGroupRung(layer, rung, y, fullWidth, mapper, outputEntryX) {
    const startX = RAIL_OFFSET;
    const rightRailX = fullWidth - RAIL_OFFSET;
    let maxBranchX = startX + 60; 
    
    layer.add(new Konva.Line({ points: [startX, y, startX + 20, y], stroke: '#fff', strokeWidth: 3 }));

    const branchEnds = [];
    rung.activationBranches.forEach((branch, idx) => {
        const branchY = y + (idx * BRANCH_H);
        if (idx > 0) layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, branchY], stroke: '#fff', strokeWidth: 3 }));
        
        layer.add(new Konva.Line({ points: [startX + 20, branchY, startX + 40 - 20, branchY], stroke: '#fff', strokeWidth: 3 }));
        this.drawContact(layer, startX + 40, branchY, { type: branch.prevType || 'NO', label: branch.prevStep }, mapper);
        
        let curX = startX + 40 + GRID_W;
        let prevContactEndX = startX + 40 + 20;
        (branch.conditions || []).forEach(c => {
            layer.add(new Konva.Line({ points: [prevContactEndX, branchY, curX - 20, branchY], stroke: '#fff', strokeWidth: 3 }));
            this.drawContact(layer, curX, branchY, c, mapper);
            prevContactEndX = curX + 20;
            curX += GRID_W;
        });
        branchEnds.push({ x: prevContactEndX, y: branchY });
        maxBranchX = Math.max(maxBranchX, prevContactEndX);
    });

    const latchY = y + (rung.activationBranches.length * BRANCH_H);
    const latchEndX = startX + 40 + 20;
    layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, latchY], stroke: '#fff', strokeWidth: 3 }));
    layer.add(new Konva.Line({ points: [startX + 20, latchY, startX + 40 - 20, latchY], stroke: '#fff', strokeWidth: 3 }));
    this.drawContact(layer, startX + 40, latchY, { type: 'NO', label: rung.targetStep }, mapper);
    
    branchEnds.push({ x: latchEndX, y: latchY });
    maxBranchX = Math.max(maxBranchX, latchEndX);

    branchEnds.forEach(end => {
        layer.add(new Konva.Line({ points: [end.x, end.y, maxBranchX, end.y], stroke: '#fff', strokeWidth: 3 }));
    });
    layer.add(new Konva.Line({ points: [maxBranchX, y, maxBranchX, latchY], stroke: '#fff', strokeWidth: 3 }));

    let lastX = maxBranchX;
    let nextX = maxBranchX + 40;
    (rung.breakStates || []).forEach(bs => {
        layer.add(new Konva.Line({ points: [lastX, y, nextX - 20, y], stroke: '#fff', strokeWidth: 3 }));
        this.drawContact(layer, nextX, y, { type: 'NC', label: bs }, mapper);
        lastX = nextX + 20;
        nextX += GRID_W;
    });

    if (lastX < outputEntryX) {
        layer.add(new Konva.Line({ points: [lastX, y, outputEntryX, y], stroke: '#fff', strokeWidth: 3 }));
    }

    const isFunctional = rung.output.type === 'TIMER' || rung.output.type === 'COUNTER';
    const outputWidth = isFunctional ? 160 : 80;
    const outputCenterX = outputEntryX + (outputWidth / 2);
    
    if (isFunctional) this.drawFunctionalBlock(layer, outputCenterX, y, rung.output, mapper);
    else this.drawCoil(layer, outputCenterX, y, rung.output, mapper);

    layer.add(new Konva.Line({ points: [outputEntryX + outputWidth, y, rightRailX, y], stroke: '#fff', strokeWidth: 3 }));
  },

  drawCounterBlockRung(layer, rung, y, fullWidth, mapper) {
    const startX = RAIL_OFFSET;
    const rightRailX = fullWidth - RAIL_OFFSET;
    const blockWidth = 120;
    const blockX = rightRailX - 140; 
    
    rung.increments.forEach((sName, idx) => {
        const branchY = y + (idx * BRANCH_H);
        if (idx > 0) layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, branchY], stroke: '#fff', strokeWidth: 3 }));
        layer.add(new Konva.Line({ points: [startX + 20, branchY, startX + 40 - 20, branchY], stroke: '#fff', strokeWidth: 3 }));
        this.drawContact(layer, startX + 40, branchY, { type: 'NO', label: sName }, mapper);
        layer.add(new Konva.Line({ points: [startX + 60, branchY, blockX, branchY], stroke: '#fff', strokeWidth: 3 }));
    });
    layer.add(new Konva.Line({ points: [startX, y, startX + 20, y], stroke: '#fff', strokeWidth: 3 }));
    layer.add(new Konva.Text({ x: blockX - 25, y: y - 10, text: 'CP', fontSize: 10, fill: '#fff', fontStyle: 'bold' }));

    const resetStartY = y + Math.max(rung.increments.length, 1) * BRANCH_H;
    rung.resets.forEach((sName, idx) => {
        const branchY = resetStartY + (idx * BRANCH_H);
        if (idx > 0) layer.add(new Konva.Line({ points: [startX + 20, resetStartY, startX + 20, branchY], stroke: '#ff6b6b', strokeWidth: 3 }));
        layer.add(new Konva.Line({ points: [startX + 20, branchY, startX + 40 - 20, branchY], stroke: '#ff6b6b', strokeWidth: 3 }));
        this.drawContact(layer, startX + 40, branchY, { type: 'NO', label: sName }, mapper);
        layer.add(new Konva.Line({ points: [startX + 60, branchY, blockX, branchY], stroke: '#ff6b6b', strokeWidth: 3 }));
    });
    layer.add(new Konva.Line({ points: [startX, resetStartY, startX + 20, resetStartY], stroke: '#ff6b6b', strokeWidth: 3 }));
    layer.add(new Konva.Text({ x: blockX - 25, y: resetStartY - 10, text: 'R', fontSize: 10, fill: '#ff6b6b', fontStyle: 'bold' }));

    const blockHeight = (resetStartY - y) + BRANCH_H;
    const group = new Konva.Group({ x: blockX, y: y - 20 });
    group.add(new Konva.Rect({ width: blockWidth, height: blockHeight, stroke: '#4df59f', strokeWidth: 3, fill: 'rgba(77, 245, 159, 0.1)', cornerRadius: 4 }));
    
    const translated = mapper ? mapper.translate(rung.output.label) : rung.output.label;
    const [name, val] = translated.split('#');
    group.add(new Konva.Text({ x: 0, y: 10, width: blockWidth, text: 'COUNTER', fontSize: 10, fill: '#9bb2d9', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: 0, y: blockHeight / 2 - 10, width: blockWidth, text: mapper ? mapper.translate(rung.output.name) : rung.output.name, fontSize: 14, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    if (val) group.add(new Konva.Text({ x: 0, y: blockHeight - 20, width: blockWidth, text: `PV: #${val}`, fontSize: 10, fill: '#4df59f', align: 'center' }));
    layer.add(group);
    
    layer.add(new Konva.Line({ points: [blockX + blockWidth, y, rightRailX, y], stroke: '#fff', strokeWidth: 3 }));
  },

  drawOrStatesRung(layer, rung, y, fullWidth, mapper, outputEntryX) {
    const startX = RAIL_OFFSET;
    const rightRailX = fullWidth - RAIL_OFFSET;
    const outputWidth = 80;

    rung.states.forEach((sName, idx) => {
        const branchY = y + (idx * BRANCH_H);
        if (idx > 0) layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, branchY], stroke: '#fff', strokeWidth: 3 }));
        layer.add(new Konva.Line({ points: [startX + 20, branchY, startX + 40 - 20, branchY], stroke: '#fff', strokeWidth: 3 }));
        this.drawContact(layer, startX + 40, branchY, { type: 'NO', label: sName }, mapper);
        layer.add(new Konva.Line({ points: [startX + 60, branchY, outputEntryX, branchY, outputEntryX, y], stroke: '#fff', strokeWidth: 3 }));
    });
    layer.add(new Konva.Line({ points: [startX, y, startX + 20, y], stroke: '#fff', strokeWidth: 3 }));
    
    const outputCenterX = outputEntryX + (outputWidth / 2);
    this.drawCoil(layer, outputCenterX, y, rung.output, mapper);
    layer.add(new Konva.Line({ points: [outputEntryX + outputWidth, y, rightRailX, y], stroke: '#fff', strokeWidth: 3 }));
  },

  drawContact(layer, x, y, contact, mapper) {
    const group = new Konva.Group({ x: x - 20, y: y - 20 });
    
    group.add(new Konva.Line({ points: [0, 20, 8.5, 20], stroke: '#fff', strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [31.5, 20, 40, 20], stroke: '#fff', strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [10, 10, 10, 30], stroke: '#fff', strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [30, 10, 30, 30], stroke: '#fff', strokeWidth: 3 }));
    
    if (contact.type === 'NC') {
        group.add(new Konva.Line({ points: [12, 28, 28, 12], stroke: '#ff6b6b', strokeWidth: 3 }));
    }

    const addr = mapper ? mapper.translate(contact.label) : "";
    group.add(new Konva.Text({ x: -10, y: -18, width: 60, text: contact.label, fontSize: 10, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: -10, y: 32, width: 60, text: addr, fontSize: 9, fill: '#4df59f', align: 'center' }));
    layer.add(group);
  },

  drawCoil(layer, x, y, output, mapper) {
    const group = new Konva.Group({ x: x - 40, y: y - 20 });
    
    group.add(new Konva.Arc({ x: 40, y: 20, innerRadius: 15, outerRadius: 18, angle: 120, rotation: 120, stroke: '#fff', strokeWidth: 3 }));
    group.add(new Konva.Arc({ x: 40, y: 20, innerRadius: 15, outerRadius: 18, angle: 120, rotation: -60, stroke: '#fff', strokeWidth: 3 }));
    
    group.add(new Konva.Line({ points: [0, 20, 22, 20], stroke: '#fff', strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [58, 20, 80, 20], stroke: '#fff', strokeWidth: 3 }));
    
    if (output.mode === 'SET' || output.mode === 'RESET') {
        group.add(new Konva.Text({ x: 34, y: 13, text: output.mode[0], fontSize: 13, fill: '#4df59f', fontStyle: 'bold' }));
    }
    const addr = mapper ? mapper.translate(output.label) : "";
    group.add(new Konva.Text({ x: 10, y: -20, width: 60, text: output.label, fontSize: 10, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: 10, y: 34, width: 60, text: addr, fontSize: 9, fill: '#4df59f', align: 'center' }));
    layer.add(group);
  },

  drawFunctionalBlock(layer, x, y, output, mapper) {
    const group = new Konva.Group({ x: x - 80, y: y - 25 });
    
    group.add(new Konva.Rect({ x: 20, y: 0, width: 120, height: 50, stroke: '#4df59f', strokeWidth: 3, fill: 'rgba(77, 245, 159, 0.1)', cornerRadius: 4 }));
    
    group.add(new Konva.Line({ points: [0, 25, 20, 25], stroke: '#fff', strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [140, 25, 160, 25], stroke: '#fff', strokeWidth: 3 }));
    
    const translated = mapper ? mapper.translate(output.label) : output.label;
    const [name, val] = translated.split('#');
    group.add(new Konva.Text({ x: 20, y: 10, width: 120, text: output.type, fontSize: 10, fill: '#9bb2d9', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: 20, y: 22, width: 120, text: name, fontSize: 12, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    if (val) group.add(new Konva.Text({ x: 20, y: 36, width: 120, text: `#${val}`, fontSize: 10, fill: '#4df59f', align: 'center' }));
    layer.add(group);
  }
};
