/**
 * MOTOR DE EMULACIÓN - Compilador Industrial
 * Gestiona la lógica de tokens y transición de estados.
 */

export const GrafcetEmulator = {
    isActive: false,
    activeSteps: new Set(),
    inputs: {}, // { "Sensor1": false, "Boton": false }
    
    init(steps) {
        this.activeSteps.clear();
        this.inputs = {};
        
        // El paso inicial es S0 o 1.00
        const initialStep = steps.find(s => s.name === "S0" || s.name === "1.00");
        if (initialStep) {
            this.activeSteps.add(initialStep.name);
        }

        // Extraer todas las entradas únicas de las transiciones
        steps.forEach(step => {
            (step.transitions || []).forEach(t => {
                const parts = (t.condition || "").split(/[,]|AND/i).map(p => p.trim());
                parts.forEach(p => {
                    const clean = p.replace(/\bNOT\b/gi, '').trim();
                    if (clean && clean !== "1" && isNaN(clean)) {
                        this.inputs[clean] = false;
                    }
                });
            });
        });
    },

    setPlay(state, steps) {
        this.isActive = state;
        if (state) {
            this.init(steps);
        }
    },

    setInput(name, value) {
        if (!this.isActive) return;
        this.inputs[name] = value;
    },

    // Evalúa si las transiciones se pueden disparar
    tick(steps) {
        if (!this.isActive) return false;

        let changed = false;
        const newActiveSteps = new Set(this.activeSteps);

        steps.forEach(step => {
            if (this.activeSteps.has(step.name)) {
                (step.transitions || []).forEach(t => {
                    if (this.evaluateCondition(t.condition)) {
                        newActiveSteps.delete(step.name);
                        newActiveSteps.add(t.target);
                        changed = true;
                    }
                });
            }
        });

        if (changed) {
            this.activeSteps = newActiveSteps;
        }
        return changed;
    },

    evaluateCondition(conditionStr) {
        if (!conditionStr || conditionStr === "1") return true;
        
        const parts = conditionStr.split(/[,]|AND/i).map(p => p.trim());
        return parts.every(part => {
            const isNegated = /\bNOT\b/i.test(part);
            const clean = part.replace(/\bNOT\b/gi, '').trim();
            
            if (clean === "1") return !isNegated;
            
            const val = this.inputs[clean] || false;
            return isNegated ? !val : val;
        });
    },

    getUpdateSteps(steps) {
        return steps.map(s => ({
            ...s,
            active: this.activeSteps.has(s.name),
            transitions: (s.transitions || []).map(t => ({
                ...t,
                met: this.evaluateCondition(t.condition)
            }))
        }));
    }
};
