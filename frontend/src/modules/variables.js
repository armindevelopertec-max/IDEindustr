/**
 * Módulo de Variables y Mapeo (Nivel 2)
 * Se encarga de transformar nombres simbólicos en direcciones físicas (PLC)
 */

export const VariableMapper = {
    mappings: {
        states: new Map(),      // S0 -> 1.00
        conditions: new Map(),  // Si -> 0.00
        actions: new Map(),     // Motor -> 100.00 (base)
        actionVariants: new Set(), // ["MOTOR+", "MOTOR-"]
        counters: new Map(),
        timers: new Map()
    },

    reset() {
        this.mappings.states.clear();
        this.mappings.conditions.clear();
        this.mappings.actions.clear();
        this.mappings.actionVariants.clear();
        this.mappings.counters.clear();
        this.mappings.timers.clear();
    },

    normalizeConditionToken(token) {
        return (token || "")
            .replace(/\bNOT\b/gi, "")
            .replace(/[=<>!#].*/, "")
            .trim()
            .toUpperCase();
    },

    generateMappings(steps) {
        this.reset();
        
        // 1. Estados
        steps.forEach(step => {
            const nameUpper = step.name.toUpperCase();
            const match = nameUpper.match(/\d+/);
            const index = match ? parseInt(match[0], 10) : 0;
            const address = `1.${index.toString().padStart(2, '0')}`;
            this.mappings.states.set(nameUpper, address);
        });

        let conditionIdx = 0;
        let actionIdx = 0;

        steps.forEach(step => {
            // 2. Acciones
            const actions = (step.name.toUpperCase() === "S0" || step.name === "1.00") ? [] : (step.actions || []);
            
            actions.forEach(rawAction => {
                const actionUpper = rawAction.toUpperCase();
                const cleanAction = actionUpper.replace(/[+\-]/g, '').trim();
                
                if (this.isTimer(cleanAction)) {
                    this.registerTimer(cleanAction);
                } else if (this.isCounter(cleanAction)) {
                    this.registerCounter(cleanAction);
                } else {
                    // Guardamos la variante exacta para el diccionario
                    this.mappings.actionVariants.add(actionUpper);
                    
                    if (!this.mappings.actions.has(cleanAction)) {
                        const address = `100.${actionIdx.toString().padStart(2, '0')}`;
                        this.mappings.actions.set(cleanAction, address);
                        actionIdx++;
                    }
                }
            });

            // 3. Transiciones (Condiciones) -> 0.00, TIM0000, CNT0000
            (step.transitions || []).forEach(trans => {
                const condition = (trans.condition || "1").toUpperCase();
                const parts = condition.split(/[,]|AND/i).map(p => p.trim());
                
                parts.forEach(part => {
                    const cleanPart = this.normalizeConditionToken(part);
                    
                    if (cleanPart === "1" || cleanPart === "" || !isNaN(cleanPart)) return;

                    if (this.isTimer(cleanPart)) {
                        this.registerTimer(cleanPart);
                    } else if (this.isCounter(cleanPart)) {
                        this.registerCounter(cleanPart);
                    } else {
                        const isState = this.mappings.states.has(cleanPart);
                        const isAction = this.mappings.actions.has(cleanPart);
                        
                        if (!this.mappings.conditions.has(cleanPart) && !isState && !isAction) {
                            const address = `0.${conditionIdx.toString().padStart(2, '0')}`;
                            this.mappings.conditions.set(cleanPart, address);
                            conditionIdx++;
                        }
                    }
                });
            });
        });
    },

    isTimer(text) {
        return /^(T|TIM)\d*(=|\s*#|seg|$)/i.test(text);
    },

    isCounter(text) {
        return /^(CONT|CNT)\d*(=|\s*#|$)/i.test(text);
    },

    registerTimer(symbol) {
        const match = symbol.match(/(?:T|TIM)(\d+)/i);
        const index = match ? parseInt(match[1], 10) : 0;
        const baseName = `T${index}`;
        if (!this.mappings.timers.has(baseName)) {
            this.mappings.timers.set(baseName, `TIM${index.toString().padStart(4, '0')}`);
        }
    },

    registerCounter(symbol) {
        const match = symbol.match(/(?:CONT|CNT)(\d+)/i);
        const index = match ? parseInt(match[1], 10) : 0;
        const baseName = `CONT${index}`;
        if (!this.mappings.counters.has(baseName)) {
            this.mappings.counters.set(baseName, `CNT${index.toString().padStart(4, '0')}`);
        }
    },

    translate(symbol) {
        if (!symbol) return "";
        
        const symbolUpper = symbol.toUpperCase();
        
        // REGLA ESPECIAL: La condición literal "1" se mantiene como "1"
        if (symbolUpper === "1" || symbolUpper === "TRUE") return "1";

        const isNegated = /\bNOT\b/i.test(symbolUpper);
        let cleanSymbol = symbolUpper.replace(/\bNOT\b/gi, '').trim();
        const isTimerSymbol = /^(T|TIM)\d+$/i.test(cleanSymbol);
        const isCounterSymbol = /^(CONT|CNT)\d+$/i.test(cleanSymbol);

        // REGLA DE ORO: Si es un estado Sxx, siempre es 1.xx (Nivel 2)
        if (cleanSymbol.match(/^S\d+$/i)) {
            const indexStr = cleanSymbol.match(/\d+/)[0];
            return `1.${indexStr.padStart(2, '0')}`;
        }

        // Manejar Declaración de Temporizador: T0=3seg -> TIM0000#30
        if (this.isTimer(cleanSymbol) && cleanSymbol.includes('=')) {
            const [name, valStr] = cleanSymbol.split('=');
            const timerMatch = name.match(/\d+/);
            const index = timerMatch ? timerMatch[0].padStart(4, '0') : "0000";
            const value = parseInt(valStr.replace(/[^\d]/g, ''), 10) * 10;
            return `TIM${index}#${value}`;
        }

        // Manejar Declaración de Contador: CONT0=3 -> CNT0000#3
        if (this.isCounter(cleanSymbol) && cleanSymbol.includes('=')) {
            const [name, valStr] = cleanSymbol.split('=');
            const counterMatch = name.match(/\d+/);
            const index = counterMatch ? counterMatch[0].padStart(4, '0') : "0000";
            const value = parseInt(valStr.replace(/[^\d]/g, ''), 10);
            return `CNT${index}#${value}`;
        }

        // Manejar Uso (Bit/Estado)
        let baseSymbol = cleanSymbol.replace(/[+-]/g, '').trim();
        let result = baseSymbol;

        const counterKey = isCounterSymbol ? this.findKey(this.mappings.counters, baseSymbol) : null;
        const timerKey = isTimerSymbol ? this.findKey(this.mappings.timers, baseSymbol) : null;

        if (counterKey) {
            result = this.mappings.counters.get(counterKey);
        } else if (timerKey) {
            result = this.mappings.timers.get(timerKey);
        } else if (this.mappings.states.has(baseSymbol)) {
            result = this.mappings.states.get(baseSymbol);
        } else if (this.mappings.conditions.has(baseSymbol)) {
            result = this.mappings.conditions.get(baseSymbol);
        } else if (this.mappings.actions.has(baseSymbol)) {
            result = this.mappings.actions.get(baseSymbol);
        }

        if (symbol.includes('+')) result += '+';
        if (symbol.includes('-')) result += '-';

        return isNegated ? `NOT ${result}` : result;
    },

    findKey(map, symbol) {
        if (map.has(symbol)) return symbol;
        const numMatch = symbol.match(/\d+/);
        if (numMatch) {
            const num = numMatch[0];
            for (let key of map.keys()) {
                if (key.includes(num)) return key;
            }
        }
        return null;
    },

    translateList(listStr) {
        if (!listStr) return "";
        return listStr.split(',')
            .map(item => this.translate(item.trim()))
            .join(', ');
    },

    generateDictionaryHTML() {
        const createTable = (title, mapOrSet, headers, isVariantSet = false) => {
            const entries = isVariantSet ? Array.from(mapOrSet) : Array.from(mapOrSet.entries());
            if (entries.length === 0) return "";
            
            const sortedEntries = entries.sort((a, b) => {
                const getAddr = (entry) => {
                    if (isVariantSet) {
                        const clean = entry.replace(/[+\-]/g, '').trim();
                        const baseAddr = this.mappings.actions.get(clean) || "";
                        if (entry.includes('+')) return baseAddr + '+';
                        if (entry.includes('-')) return baseAddr + '-';
                        return baseAddr;
                    }
                    return Array.isArray(entry) ? entry[1] : entry;
                };

                const addrA = getAddr(a);
                const addrB = getAddr(b);

                const getAddrParts = (addr) => addr.split(/[\.#]/).map(p => parseInt(p, 10) || 0);
                const partsA = getAddrParts(addrA);
                const partsB = getAddrParts(addrB);

                for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                    const valA = partsA[i] || 0;
                    const valB = partsB[i] || 0;
                    if (valA !== valB) return valA - valB;
                }
                return addrA.localeCompare(addrB);
            });

            let html = `<div class="dict-section"><h3>${title}</h3><table class="variables-table"><thead><tr>`;
            headers.forEach(h => html += `<th>${h}</th>`);
            html += `</tr></thead><tbody>`;
            
            sortedEntries.forEach((entry) => {
                let symbol, address;
                if (isVariantSet) {
                    symbol = entry;
                    const clean = entry.replace(/[+\-]/g, '').trim();
                    const baseAddr = this.mappings.actions.get(clean) || "?.??";
                    address = baseAddr;
                    if (entry.includes('+')) address += '+';
                    if (entry.includes('-')) address += '-';
                } else {
                    [symbol, address] = entry;
                }
                html += `<tr><td>${symbol}</td><td><code>${address}</code></td></tr>`;
            });
            html += `</tbody></table></div>`;
            return html;
        };

        return `
            <div class="dictionary-container">
                <div class="dict-row">
                    ${createTable("Estados (1.xx)", this.mappings.states, ["Símbolo", "Dirección"])}
                    ${createTable("Entradas (0.xx)", this.mappings.conditions, ["Símbolo", "Dirección"])}
                    ${createTable("Salidas (100.xx)", this.mappings.actionVariants, ["Símbolo", "Dirección"], true)}
                </div>
                <div class="dict-row">
                    ${createTable("Temporizadores (TIM)", this.mappings.timers, ["Símbolo", "Dirección Base"])}
                    ${createTable("Contadores (CNT)", this.mappings.counters, ["Símbolo", "Dirección Base"])}
                </div>
            </div>
        `;
    }
};
