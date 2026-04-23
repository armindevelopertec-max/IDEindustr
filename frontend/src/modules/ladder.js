import Konva from "konva";

/**
 * LADDER ENGINE - Versión Optimizada
 * Sistema de renderizado persistente para alto rendimiento.
 */

const GRID_H = 150; 
const GRID_W = 80;  
const RAIL_OFFSET = 20;
const BRANCH_H = 70; 

const COLOR_OFF = "#fff";
const COLOR_ON = "#4df59f";
const COLOR_NC_OFF = "#ff6b6b";

export const LadderEngine = {
  stages: {}, 
  lastIRs: {},

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

  stages: {}, 
  lastIRs: {},

  render(containerId, rungs, variableMapper, liveState = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const width = container.clientWidth;
    // Si el ancho es muy pequeño o 0, el elemento está oculto o no renderizado.
    if (width < 50) return;

    const irHash = JSON.stringify(rungs);
    const isNewLogic = this.lastIRs[containerId] !== irHash;

    if (isNewLogic) {
        if (this.stages[containerId]) {
            this.stages[containerId].destroy();
        }
        container.innerHTML = "";
        
        let totalHeight = 150; 
        rungs.forEach(r => {
            if (r.specialLayout === 'LATCH_GROUP') totalHeight += (r.activationBranches.length + 1) * BRANCH_H + 70;
            else if (r.specialLayout === 'OR_STATES') totalHeight += (r.states.length) * BRANCH_H + 50;
            else if (r.specialLayout === 'COUNTER_BLOCK') totalHeight += Math.max(r.increments.length, r.resets.length, 2) * BRANCH_H + 70;
            else totalHeight += GRID_H;
        });

        const stageHeight = Math.max(800, totalHeight);
        const stage = new Konva.Stage({ container: containerId, width, height: stageHeight });
        this.stages[containerId] = stage;
        this.lastIRs[containerId] = irHash;
        
        const layer = new Konva.Layer();
        stage.add(layer);

        layer.add(new Konva.Line({ points: [RAIL_OFFSET, 0, RAIL_OFFSET, stageHeight], stroke: COLOR_ON, strokeWidth: 4 }));
        layer.add(new Konva.Line({ points: [width - RAIL_OFFSET, 0, width - RAIL_OFFSET, stageHeight], stroke: COLOR_ON, strokeWidth: 4 }));

        let currentY = 80;
        rungs.forEach((rung, idx) => {
            this.drawRung(layer, rung, currentY, width, variableMapper, liveState, idx);
            if (rung.specialLayout === 'LATCH_GROUP') currentY += (rung.activationBranches.length + 1) * BRANCH_H + 70;
            else if (rung.specialLayout === 'OR_STATES') currentY += (rung.states.length) * BRANCH_H + 50;
            else if (rung.specialLayout === 'COUNTER_BLOCK') currentY += Math.max(rung.increments.length, rung.resets.length, 2) * BRANCH_H + 70;
            else currentY += GRID_H;
        });
        layer.draw();
    } else if (liveState && this.stages[containerId]) {
        // ACTUALIZACIÓN RÁPIDA: Solo cambiar colores
        const layer = this.stages[containerId].getChildren()[0];
        if (!layer) return;
        rungs.forEach((rung, idx) => {
            this.updateRungColors(layer, rung, liveState, idx);
        });
        layer.batchDraw();
    }
  },

  isVarTrue(label, liveState) {
    if (!liveState) return false;
    const val = liveState[label];
    return val === true || val === 1 || val === "1";
  },

  // --- MÉTODOS DE DIBUJO ---

  drawRung(layer, rung, y, fullWidth, mapper, liveState, rungIdx) {
    if (rung.comment) {
      layer.add(new Konva.Text({ x: RAIL_OFFSET + 10, y: y - 55, text: `// ${rung.comment}`, fontSize: 11, fill: '#9bb2d9', fontStyle: 'italic' }));
    }

    const rightRailX = fullWidth - RAIL_OFFSET;
    const isFunctional = rung.output.type === 'TIMER' || rung.output.type === 'COUNTER';
    const outputWidth = isFunctional ? 160 : 80;
    const outputEntryX = rightRailX - outputWidth;

    if (rung.specialLayout === 'LATCH_GROUP') {
      this.drawLatchingGroupRung(layer, rung, y, fullWidth, mapper, outputEntryX, liveState, rungIdx);
    } else if (rung.specialLayout === 'OR_STATES') {
      this.drawOrStatesRung(layer, rung, y, fullWidth, mapper, outputEntryX, liveState, rungIdx);
    } else if (rung.specialLayout === 'COUNTER_BLOCK') {
      this.drawCounterBlockRung(layer, rung, y, fullWidth, mapper, liveState, rungIdx);
    } else {
      let lastX = RAIL_OFFSET;
      let currentX = RAIL_OFFSET + 40;

      (rung.contacts || []).forEach((c, cIdx) => {
        layer.add(new Konva.Line({ id: `wire-${rungIdx}-${cIdx}`, points: [lastX, y, currentX - 20, y], stroke: COLOR_OFF, strokeWidth: 3 }));
        this.drawContact(layer, currentX, y, c, mapper, liveState, `contact-${rungIdx}-${cIdx}`);
        lastX = currentX + 20;
        currentX += GRID_W;
      });

      layer.add(new Konva.Line({ id: `wire-final-${rungIdx}`, points: [lastX, y, outputEntryX, y], stroke: COLOR_OFF, strokeWidth: 3 }));
      
      const outputCenterX = outputEntryX + (outputWidth / 2);
      if (isFunctional) this.drawFunctionalBlock(layer, outputCenterX, y, rung.output, mapper, liveState, `output-${rungIdx}`);
      else this.drawCoil(layer, outputCenterX, y, rung.output, mapper, false, `output-${rungIdx}`);

      layer.add(new Konva.Line({ id: `wire-rail-${rungIdx}`, points: [outputEntryX + outputWidth, y, rightRailX, y], stroke: COLOR_OFF, strokeWidth: 3 }));
    }
  },

  // --- MÉTODOS DE ACTUALIZACIÓN ---

  updateRungColors(layer, rung, liveState, rungIdx) {
    if (rung.specialLayout === 'LATCH_GROUP') {
        const outputActive = this.isVarTrue(rung.targetStep, liveState);
        this.updateCoilColor(layer, `output-${rungIdx}`, outputActive);
        
        rung.activationBranches.forEach((branch, bIdx) => {
            const branchActive = this.isVarTrue(branch.prevStep, liveState);
            this.updateContactColor(layer, `contact-branch-${rungIdx}-${bIdx}`, branchActive);
            
            let runningActive = branchActive;
            (branch.conditions || []).forEach((c, cIdx) => {
                const cActive = c.type === 'NC' ? !this.isVarTrue(c.label, liveState) : this.isVarTrue(c.label, liveState);
                if (!cActive) runningActive = false;
                this.updateContactColor(layer, `contact-cond-${rungIdx}-${bIdx}-${cIdx}`, cActive);
                layer.findOne(`#wire-cond-${rungIdx}-${bIdx}-${cIdx}`)?.stroke(runningActive ? COLOR_ON : COLOR_OFF);
            });
        });
        
        const latchActive = this.isVarTrue(rung.targetStep, liveState);
        this.updateContactColor(layer, `contact-latch-${rungIdx}`, latchActive);
        
        let afterLatchActive = outputActive;
        (rung.breakStates || []).forEach((bs, bsIdx) => {
            const bsActive = !this.isVarTrue(bs, liveState);
            if (!bsActive) afterLatchActive = false;
            this.updateContactColor(layer, `contact-break-${rungIdx}-${bsIdx}`, bsActive);
            layer.findOne(`#wire-break-${rungIdx}-${bsIdx}`)?.stroke(afterLatchActive ? COLOR_ON : COLOR_OFF);
        });

    } else if (rung.specialLayout === 'OR_STATES') {
        const outputActive = this.isVarTrue(rung.output.label, liveState);
        this.updateCoilColor(layer, `output-${rungIdx}`, outputActive);
        rung.states.forEach((s, sIdx) => {
            this.updateContactColor(layer, `contact-or-${rungIdx}-${sIdx}`, this.isVarTrue(s, liveState));
        });
    } else if (rung.specialLayout === 'COUNTER_BLOCK') {
        const outputActive = this.isVarTrue(rung.output.name, liveState);
        const rect = layer.findOne(`#output-${rungIdx}`)?.findOne('Rect');
        if (rect) rect.stroke(outputActive ? COLOR_ON : COLOR_OFF);
    } else {
        let continuity = true;
        (rung.contacts || []).forEach((c, cIdx) => {
            const active = c.type === 'NC' ? !this.isVarTrue(c.label, liveState) : this.isVarTrue(c.label, liveState);
            layer.findOne(`#wire-${rungIdx}-${cIdx}`)?.stroke(continuity ? COLOR_ON : COLOR_OFF);
            this.updateContactColor(layer, `#contact-${rungIdx}-${cIdx}`, active);
            if (!active) continuity = false;
        });
        layer.findOne(`#wire-final-${rungIdx}`)?.stroke(continuity ? COLOR_ON : COLOR_OFF);
        const outputActive = continuity || this.isVarTrue(rung.output.label, liveState);
        this.updateCoilColor(layer, `output-${rungIdx}`, outputActive);
        layer.findOne(`#wire-rail-${rungIdx}`)?.stroke(outputActive ? COLOR_ON : COLOR_OFF);
    }
  },

  updateContactColor(layer, id, active) {
    const group = layer.findOne(id.startsWith('#') ? id : '#' + id);
    if (!group) return;
    const color = active ? COLOR_ON : COLOR_OFF;
    group.getChildren().filter(c => c.getClassName() === 'Line').forEach(l => {
        if (l.stroke() === COLOR_NC_OFF && !active) return;
        l.stroke(color);
    });
  },

  updateCoilColor(layer, id, active) {
    const group = layer.findOne(id.startsWith('#') ? id : '#' + id);
    if (!group) return;
    const color = active ? COLOR_ON : COLOR_OFF;
    group.getChildren().filter(c => c.getClassName() === 'Arc' || c.getClassName() === 'Line').forEach(s => s.stroke(color));
  },

  // --- AUXILIARES DE DIBUJO ---

  drawContact(layer, x, y, contact, mapper, liveState, id) {
    const group = new Konva.Group({ id: id, x: x - 20, y: y - 20 });
    group.add(new Konva.Line({ points: [0, 20, 8.5, 20], stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [31.5, 20, 40, 20], stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [10, 10, 10, 30], stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [30, 10, 30, 30], stroke: COLOR_OFF, strokeWidth: 3 }));
    if (contact.type === 'NC') group.add(new Konva.Line({ points: [12, 28, 28, 12], stroke: COLOR_NC_OFF, strokeWidth: 3 }));
    const addr = mapper ? mapper.translate(contact.label) : "";
    group.add(new Konva.Text({ x: -10, y: -18, width: 60, text: contact.label, fontSize: 10, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: -10, y: 32, width: 60, text: addr, fontSize: 9, fill: COLOR_ON, align: 'center' }));
    layer.add(group);
  },

  drawCoil(layer, x, y, output, mapper, isActive, id) {
    const group = new Konva.Group({ id: id, x: x - 40, y: y - 20 });
    group.add(new Konva.Arc({ x: 40, y: 20, innerRadius: 15, outerRadius: 18, angle: 120, rotation: 120, stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Arc({ x: 40, y: 20, innerRadius: 15, outerRadius: 18, angle: 120, rotation: -60, stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [0, 20, 22, 20], stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [58, 20, 80, 20], stroke: COLOR_OFF, strokeWidth: 3 }));
    if (output.mode === 'SET' || output.mode === 'RESET') group.add(new Konva.Text({ x: 34, y: 13, text: output.mode[0], fontSize: 13, fill: COLOR_ON, fontStyle: 'bold' }));
    const addr = mapper ? mapper.translate(output.label) : "";
    group.add(new Konva.Text({ x: 10, y: -20, width: 60, text: output.label, fontSize: 10, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: 10, y: 34, width: 60, text: addr, fontSize: 9, fill: COLOR_ON, align: 'center' }));
    layer.add(group);
  },

  drawLatchingGroupRung(layer, rung, y, fullWidth, mapper, outputEntryX, liveState, rungIdx) {
    const startX = RAIL_OFFSET;
    const rightRailX = fullWidth - RAIL_OFFSET;
    const isFunctional = rung.output.type === 'TIMER' || rung.output.type === 'COUNTER';
    let maxBranchX = startX + 60; 
    
    layer.add(new Konva.Line({ id: `wire-init-${rungIdx}`, points: [startX, y, startX + 20, y], stroke: COLOR_OFF, strokeWidth: 3 }));

    const branchEnds = [];
    rung.activationBranches.forEach((branch, bIdx) => {
        const branchY = y + (bIdx * BRANCH_H);
        if (bIdx > 0) layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, branchY], stroke: COLOR_OFF, strokeWidth: 3 }));
        layer.add(new Konva.Line({ points: [startX + 20, branchY, startX + 40 - 20, branchY], stroke: COLOR_OFF, strokeWidth: 3 }));
        this.drawContact(layer, startX + 40, branchY, { type: branch.prevType || 'NO', label: branch.prevStep }, mapper, liveState, `contact-branch-${rungIdx}-${bIdx}`);
        
        let curX = startX + 40 + GRID_W;
        let prevContactEndX = startX + 40 + 20;
        (branch.conditions || []).forEach((c, cIdx) => {
            layer.add(new Konva.Line({ id: `wire-cond-${rungIdx}-${bIdx}-${cIdx}`, points: [prevContactEndX, branchY, curX - 20, branchY], stroke: COLOR_OFF, strokeWidth: 3 }));
            this.drawContact(layer, curX, branchY, c, mapper, liveState, `contact-cond-${rungIdx}-${bIdx}-${cIdx}`);
            prevContactEndX = curX + 20;
            curX += GRID_W;
        });
        branchEnds.push({ x: prevContactEndX, y: branchY });
        maxBranchX = Math.max(maxBranchX, prevContactEndX);
    });

    const latchY = y + (rung.activationBranches.length * BRANCH_H);
    layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, latchY], stroke: COLOR_OFF, strokeWidth: 3 }));
    layer.add(new Konva.Line({ points: [startX + 20, latchY, startX + 40 - 20, latchY], stroke: COLOR_OFF, strokeWidth: 3 }));
    this.drawContact(layer, startX + 40, latchY, { type: 'NO', label: rung.targetStep }, mapper, liveState, `contact-latch-${rungIdx}`);
    branchEnds.push({ x: startX + 40 + 20, y: latchY });

    branchEnds.forEach(end => { layer.add(new Konva.Line({ points: [end.x, end.y, maxBranchX, end.y], stroke: COLOR_OFF, strokeWidth: 3 })); });
    layer.add(new Konva.Line({ points: [maxBranchX, y, maxBranchX, latchY], stroke: COLOR_OFF, strokeWidth: 3 }));

    let lastX = maxBranchX;
    let nextX = maxBranchX + 40;
    (rung.breakStates || []).forEach((bs, bsIdx) => {
        layer.add(new Konva.Line({ id: `wire-break-${rungIdx}-${bsIdx}`, points: [lastX, y, nextX - 20, y], stroke: COLOR_OFF, strokeWidth: 3 }));
        this.drawContact(layer, nextX, y, { type: 'NC', label: bs }, mapper, liveState, `contact-break-${rungIdx}-${bsIdx}`);
        lastX = nextX + 20;
        nextX += GRID_W;
    });

    layer.add(new Konva.Line({ id: `wire-final-${rungIdx}`, points: [lastX, y, outputEntryX, y], stroke: COLOR_OFF, strokeWidth: 3 }));
    this.drawCoil(layer, outputEntryX + (isFunctional ? 80 : 40), y, rung.output, mapper, false, `output-${rungIdx}`);
    layer.add(new Konva.Line({ points: [outputEntryX + (isFunctional ? 160 : 80), y, rightRailX, y], stroke: COLOR_OFF, strokeWidth: 3 }));
  },

  drawOrStatesRung(layer, rung, y, fullWidth, mapper, outputEntryX, liveState, rungIdx) {
    const startX = RAIL_OFFSET;
    rung.states.forEach((sName, idx) => {
        const branchY = y + (idx * BRANCH_H);
        if (idx > 0) layer.add(new Konva.Line({ points: [startX + 20, y, startX + 20, branchY], stroke: COLOR_OFF, strokeWidth: 3 }));
        layer.add(new Konva.Line({ points: [startX + 20, branchY, startX + 40 - 20, branchY], stroke: COLOR_OFF, strokeWidth: 3 }));
        this.drawContact(layer, startX + 40, branchY, { type: 'NO', label: sName }, mapper, liveState, `contact-or-${rungIdx}-${idx}`);
        layer.add(new Konva.Line({ points: [startX + 60, branchY, outputEntryX, branchY, outputEntryX, y], stroke: COLOR_OFF, strokeWidth: 3 }));
    });
    layer.add(new Konva.Line({ points: [startX, y, startX + 20, y], stroke: COLOR_OFF, strokeWidth: 3 }));
    this.drawCoil(layer, outputEntryX + 40, y, rung.output, mapper, false, `output-${rungIdx}`);
    layer.add(new Konva.Line({ points: [outputEntryX + 80, y, fullWidth - RAIL_OFFSET, y], stroke: COLOR_OFF, strokeWidth: 3 }));
  },

  drawCounterBlockRung(layer, rung, y, fullWidth, mapper, liveState, rungIdx) {
    const startX = RAIL_OFFSET;
    const rightRailX = fullWidth - RAIL_OFFSET;
    const blockWidth = 120;
    const blockX = rightRailX - 140; 
    rung.increments.forEach((sName, idx) => {
        const branchY = y + (idx * BRANCH_H);
        this.drawContact(layer, startX + 40, branchY, { type: 'NO', label: sName }, mapper, liveState, `contact-inc-${rungIdx}-${idx}`);
        layer.add(new Konva.Line({ points: [startX + 60, branchY, blockX, branchY], stroke: COLOR_OFF, strokeWidth: 3 }));
    });
    const resetStartY = y + Math.max(rung.increments.length, 1) * BRANCH_H;
    rung.resets.forEach((sName, idx) => {
        const branchY = resetStartY + (idx * BRANCH_H);
        this.drawContact(layer, startX + 40, branchY, { type: 'NO', label: sName }, mapper, liveState, `contact-res-${rungIdx}-${idx}`);
        layer.add(new Konva.Line({ points: [startX + 60, branchY, blockX, branchY], stroke: COLOR_NC_OFF, strokeWidth: 3 }));
    });
    const group = new Konva.Group({ id: `output-${rungIdx}`, x: blockX, y: y - 20 });
    group.add(new Konva.Rect({ width: blockWidth, height: Math.max(20, (resetStartY - y) + BRANCH_H), stroke: COLOR_OFF, strokeWidth: 3, fill: 'rgba(77, 245, 159, 0.05)', cornerRadius: 4 }));
    const translated = (mapper ? mapper.translate(rung.output.label) : rung.output.label);
    const [name, val] = translated.split('#');
    group.add(new Konva.Text({ x: 0, y: 10, width: blockWidth, text: 'COUNTER', fontSize: 10, fill: '#9bb2d9', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: 0, y: Math.max(20, ((resetStartY - y) + BRANCH_H)) / 2 - 10, width: blockWidth, text: mapper ? mapper.translate(rung.output.name) : rung.output.name, fontSize: 14, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    layer.add(group);
    layer.add(new Konva.Line({ points: [blockX + blockWidth, y, rightRailX, y], stroke: COLOR_OFF, strokeWidth: 3 }));
  },

  drawFunctionalBlock(layer, x, y, output, mapper, liveState, id) {
    const group = new Konva.Group({ id: id, x: x - 80, y: y - 25 });
    group.add(new Konva.Rect({ x: 20, y: 0, width: 120, height: 50, stroke: COLOR_OFF, strokeWidth: 3, fill: 'rgba(77, 245, 159, 0.05)', cornerRadius: 4 }));
    group.add(new Konva.Line({ points: [0, 25, 20, 25], stroke: COLOR_OFF, strokeWidth: 3 }));
    group.add(new Konva.Line({ points: [140, 25, 160, 25], stroke: COLOR_OFF, strokeWidth: 3 }));
    const translated = (mapper ? mapper.translate(output.label) : output.label);
    const [name, val] = translated.split('#');
    group.add(new Konva.Text({ x: 20, y: 10, width: 120, text: output.type, fontSize: 10, fill: '#9bb2d9', align: 'center', fontStyle: 'bold' }));
    group.add(new Konva.Text({ x: 20, y: 22, width: 120, text: name, fontSize: 12, fill: '#fff', align: 'center', fontStyle: 'bold' }));
    layer.add(group);
  }
};
