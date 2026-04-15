/**
 * MOTOR DE EMULACIÓN INDUSTRIAL - Compilador Industrial
 * Optimizado para la sintaxis:
 * Acciones: VAR=VAL (Contador), t=3seg (Timer), VAR+, VAR- (Set/Reset)
 * Condiciones: t0, VAR, NOT VAR, S1.T > 5s, Comas (AND)
 */

export const GrafcetEmulator = {
    isActive: false,
    activeSteps: new Set(),
    lastActiveSteps: new Set(),
    stepTimers: {},   
    timers: {},       
    inputs: {},       
    variables: {},    
    targets: {},      
    outputs: {},      
    activeNormalActions: new Set(),
    usedVariables: new Set(),
    monitoredStepTimers: new Set(),
    intervalId: null,

    init(steps) {
        this.activeSteps.clear();
        this.lastActiveSteps.clear();
        this.stepTimers = {};
        this.timers = {};
        this.inputs = {};
        this.variables = {};
        this.targets = {};
        this.outputs = {}; 
        this.activeNormalActions.clear();
        this.usedVariables = new Set();
        this.monitoredStepTimers = new Set();
        
        const now = Date.now();
        const initialStep = steps.find(s => s.name.toUpperCase() === "S0");
        if (initialStep) {
            this.activeSteps.add(initialStep.name.toUpperCase());
            this.stepTimers[initialStep.name.toUpperCase()] = now;
        }

        const varNames = new Set();
        steps.forEach(step => {
            (step.transitions || []).forEach(t => {
                const cond = t.condition.toUpperCase();
                const m = cond.match(/(S\d+)\.T/g);
                if (m) m.forEach(match => this.monitoredStepTimers.add(match.split('.')[0]));
                if (/\d+(S|MS|SEG)/.test(cond)) this.monitoredStepTimers.add(step.name.toUpperCase());
            });

            (step.actions || []).forEach(action => {
                const match = action.toUpperCase().match(/^([A-Z0-9_]+)(\s*=\s*|\+|-)/);
                if (match) varNames.add(match[1]);
            });
        });

        steps.forEach(step => {
            (step.transitions || []).forEach(t => {
                this.extractVariablesFromCondition(t.condition, varNames);
            });
        });
    },

    extractVariablesFromCondition(conditionStr, varNames = new Set()) {
        if (!conditionStr || conditionStr === "1") return;
        const tokens = conditionStr.split(/[,]|AND|OR|[><=]+/i).map(p => p.trim());
        tokens.forEach(token => {
            const clean = token.replace(/\bNOT\b/gi, '').trim().toUpperCase();
            if (!clean || clean === "1" || !isNaN(clean)) return;
            if (/^T\d+$/i.test(clean)) return;
            if (varNames.has(clean)) return;
            this.inputs[clean] = false;
        });
    },

    setPlay(state, steps, onUpdateCallback) {
        this.isActive = state;
        if (state) {
            this.init(steps);
            this.intervalId = setInterval(() => {
                if (this.tick(steps)) {
                    if (onUpdateCallback) onUpdateCallback();
                }
                if (onUpdateCallback) onUpdateCallback();
            }, 100);
        } else {
            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = null;
        }
    },

    setInput(name, value) {
        if (!this.isActive) return;
        this.inputs[name.toUpperCase()] = value;
    },

    isCounterStep(stepName, steps) {
        const step = steps.find(s => s.name.toUpperCase() === stepName.toUpperCase());
        if (!step || !step.actions) return false;
        return step.actions.some(act => {
            const match = act.toUpperCase().match(/^([A-Z0-9_]+)\s*=\s*(\d+)$/);
            return match && parseInt(match[2]) > 0;
        });
    },

    tick(steps) {
        if (!this.isActive) return false;

        let changed = false;
        const now = Date.now();
        const newActiveSteps = new Set(this.activeSteps);

        this.processActions(steps);
        this.lastActiveSteps = new Set(this.activeSteps);

        steps.forEach(step => {
            const sName = step.name.toUpperCase();
            if (this.activeSteps.has(sName)) {
                (step.transitions || []).forEach(t => {
                    if (this.evaluateCondition(t.condition, sName, steps)) {
                        newActiveSteps.delete(sName);
                        newActiveSteps.add(t.target.toUpperCase());
                        this.stepTimers[t.target.toUpperCase()] = now;
                        changed = true;
                    }
                });
            }
        });

        if (changed) {
            this.activeSteps = newActiveSteps;
            Object.keys(this.stepTimers).forEach(sName => {
                if (!this.activeSteps.has(sName)) delete this.stepTimers[sName];
            });
        }
        return changed;
    },

    processActions(steps) {
        const now = Date.now();
        const currentNormalActions = new Set();
        Object.keys(this.timers).forEach(tKey => {
            this.timers[tKey].activeInStep = false;
        });

        this.activeSteps.forEach(stepName => {
            const step = steps.find(s => s.name.toUpperCase() === stepName);
            if (!step || !step.actions) return;
            const isNewStep = !this.lastActiveSteps.has(stepName);

            step.actions.forEach(action => {
                const act = action.trim().toUpperCase();
                const timerMatch = act.match(/^([A-Z0-9_]+)\s*=\s*(\d+)([A-Z]*)$/);
                if (timerMatch && timerMatch[3]) {
                    const [ , name, val, unit] = timerMatch;
                    const tKey = name.toLowerCase();
                    if (!this.timers[tKey]) this.timers[tKey] = {};
                    if (!this.timers[tKey].active) {
                        this.timers[tKey].start = now;
                        this.timers[tKey].limit = this.parseTimeToMs(val + unit);
                        this.timers[tKey].active = true;
                    }
                    this.timers[tKey].activeInStep = true;
                    this.usedVariables.add(name.toUpperCase());
                    return;
                }

                const assignMatch = act.match(/^([A-Z0-9_]+)\s*=\s*(\d+)$/);
                if (assignMatch) {
                    const [ , varName, valStr] = assignMatch;
                    const val = parseInt(valStr);
                    if (val === 0) {
                        this.variables[varName] = 0;
                        this.targets[varName] = 0;
                    } else if (isNewStep) {
                        this.variables[varName] = (this.variables[varName] || 0) + 1;
                        this.targets[varName] = val;
                    }
                    this.usedVariables.add(varName);
                    return;
                }

                if (act.endsWith("+")) {
                    const varName = act.slice(0, -1).trim();
                    this.outputs[varName] = true;
                    this.usedVariables.add(varName);
                    return;
                }
                if (act.endsWith("-")) {
                    const varName = act.slice(0, -1).trim();
                    this.outputs[varName] = false;
                    this.usedVariables.add(varName);
                    return;
                }

                currentNormalActions.add(act);
                if (!act.startsWith("NOT ")) this.usedVariables.add(act);
            });
        });

        this.activeNormalActions = currentNormalActions;
        Object.keys(this.timers).forEach(tKey => {
            if (!this.timers[tKey].activeInStep) {
                this.timers[tKey].active = false;
                this.timers[tKey].start = 0;
            }
        });
    },

    evaluateCondition(conditionStr, currentStepName, steps) {
        // RETARDO PARA CUALQUIER SALTO DESDE UN PASO CON CONTADOR
        if (this.isCounterStep(currentStepName, steps)) {
            const elapsed = Date.now() - this.stepTimers[currentStepName];
            if (elapsed < 2000) return false;
        }

        if (!conditionStr || conditionStr === "1") return true;
        const normalizedCond = conditionStr.replace(/,/g, " AND ");
        const parts = normalizedCond.split(/\bAND\b/i).map(p => p.trim());
        
        return parts.every(part => {
            const isNegated = /\bNOT\b/i.test(part);
            const clean = part.replace(/\bNOT\b/gi, '').trim().toUpperCase();
            const isInput = this.inputs[clean] !== undefined;
            const isVariable = this.usedVariables.has(clean);
            const isStepTimer = clean.includes(".T") || /\d+(S|MS|SEG)/.test(clean);
            const isIndustrialTimer = /^T\d+$/i.test(clean);

            if (isNegated && !isInput && !isVariable && !isStepTimer && !isIndustrialTimer) return false;

            if (this.targets[clean] !== undefined && this.targets[clean] > 0) {
                const reached = this.variables[clean] >= this.targets[clean];
                return isNegated ? !reached : reached;
            }

            if (isIndustrialTimer) {
                const tKey = clean.toLowerCase();
                const timer = this.timers[tKey];
                if (!timer || !timer.active) return isNegated;
                const done = (Date.now() - timer.start) >= timer.limit;
                return isNegated ? !done : done;
            }

            if (isStepTimer) return this.evalTimer(part, currentStepName);
            if (/[><=]+/.test(part)) return this.evalComparison(part);

            if (this.outputs[clean] !== undefined) {
                const val = this.outputs[clean];
                return isNegated ? !val : val;
            }
            if (this.activeNormalActions.has(clean)) return !isNegated;

            if (this.variables[clean] !== undefined) {
                const val = this.variables[clean] > 0;
                return isNegated ? !val : val;
            }

            const inputVal = this.inputs[clean] || false;
            return isNegated ? !inputVal : inputVal;
        });
    },

    evalTimer(str, currentStepName) {
        const now = Date.now();
        let targetStep = currentStepName;
        let timeStr = str;
        let operator = ">";
        const timerMatch = str.match(/(S\d+)\.T\s*([><=]+)\s*(\d+(s|ms|seg))/i);
        if (timerMatch) {
            targetStep = timerMatch[1].toUpperCase();
            operator = timerMatch[2];
            timeStr = timerMatch[3];
        } else {
            const simpleMatch = str.match(/(\d+)(s|ms|seg)/i);
            if (simpleMatch) timeStr = simpleMatch[0];
        }
        const startTime = this.stepTimers[targetStep];
        if (!startTime) return false;
        const elapsedMs = now - startTime;
        const limitMs = this.parseTimeToMs(timeStr);
        switch(operator) {
            case ">": return elapsedMs > limitMs;
            case "<": return elapsedMs < limitMs;
            case ">=": return elapsedMs >= limitMs;
            case "<=": return elapsedMs <= limitMs;
            case "==": return Math.abs(elapsedMs - limitMs) < 200;
            default: return elapsedMs > limitMs;
        }
    },

    evalComparison(part) {
        const match = part.match(/([A-Z0-9_]+)\s*([><=]+)\s*(\d+)/i);
        if (!match) return false;
        const [ , varName, operator, valueStr] = match;
        const varValue = this.variables[varName.toUpperCase()] || 0;
        const targetValue = parseInt(valueStr);
        switch(operator) {
            case ">": return varValue > targetValue;
            case "<": return varValue < targetValue;
            case ">=": return varValue >= targetValue;
            case "<=": return varValue <= targetValue;
            case "==": return varValue == targetValue;
            default: return false;
        }
    },

    parseTimeToMs(timeStr) {
        const val = parseInt(timeStr);
        if (/ms$/i.test(timeStr)) return val;
        if (/s(eg)?$/i.test(timeStr)) return val * 1000;
        return val;
    },

    getUpdateSteps(steps) {
        return steps.map(s => {
            const isActiveStep = this.activeSteps.has(s.name.toUpperCase());
            return {
                ...s,
                active: isActiveStep,
                activeActions: (s.actions || []).map(act => {
                    const cleanAct = act.trim().toUpperCase();
                    let lit = false;
                    if (cleanAct.endsWith("+")) {
                        lit = this.outputs[cleanAct.slice(0, -1).trim()] === true;
                    } else if (cleanAct.endsWith("-")) {
                        lit = this.outputs[cleanAct.slice(0, -1).trim()] === false;
                    } else {
                        const timerMatch = cleanAct.match(/^([A-Z0-9_]+)\s*=\s*(\d+)([A-Z]*)$/);
                        if (timerMatch && timerMatch[3]) {
                            lit = this.timers[timerMatch[1].toLowerCase()]?.active;
                        } else if (timerMatch) {
                            lit = (this.variables[timerMatch[1].toUpperCase()] || 0) > 0;
                        } else {
                            lit = isActiveStep && this.activeNormalActions.has(cleanAct);
                            if (lit && cleanAct.startsWith("NOT ")) {
                                const varName = cleanAct.slice(4).trim();
                                if (!this.usedVariables.has(varName) && this.inputs[varName] === undefined) lit = false;
                            }
                        }
                    }
                    return { text: act, lit };
                }),
                transitions: (s.transitions || []).map(t => ({
                    ...t,
                    met: this.evaluateCondition(t.condition, s.name.toUpperCase(), steps)
                }))
            };
        });
    },

    getLiveVariables() {
        const vars = {};
        if (this.usedVariables) {
            this.usedVariables.forEach(v => {
                // 1. Prioridad: Contadores (con objetivo)
                if (this.targets[v] > 0) {
                    vars[v] = `${this.variables[v]} / ${this.targets[v]}`;
                } 
                // 2. Prioridad: Salidas Set/Reset (1 / 0)
                else if (this.outputs[v] !== undefined) {
                    vars[v] = this.outputs[v] ? "1" : "0";
                }
                // 3. Prioridad: Acciones Normales Continuas (1 si está en paso activo)
                else if (this.activeNormalActions.has(v)) {
                    vars[v] = "1";
                }
                // 4. Fallback: Valor de variable o 0
                else {
                    vars[v] = (this.variables[v] !== undefined) ? String(this.variables[v]) : "0";
                }
            });
        }
        
        // Temporizadores industriales
        Object.entries(this.timers).forEach(([k, v]) => {
            if (v.active) {
                const elapsed = Math.min((Date.now() - v.start) / 1000, v.limit / 1000);
                vars[k.toUpperCase()] = elapsed.toFixed(1) + " / " + (v.limit / 1000) + "s";
            }
        });

        // Tiempos de pasos
        this.activeSteps.forEach(s => {
            if (this.stepTimers[s] && this.monitoredStepTimers.has(s)) {
                vars[`${s}.T`] = ((Date.now() - this.stepTimers[s]) / 1000).toFixed(1) + "s";
            }
        });
        return vars;
    }
};
