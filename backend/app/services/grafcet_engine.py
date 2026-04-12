from collections import defaultdict, OrderedDict
from typing import Any, Dict, List
import re

from app.models.grafcet import Step, Transition


def _step_sort_key(name: str) -> int:
    upper = name.upper()
    if upper.startswith("S") and upper[1:].isdigit():
        return int(upper[1:])
    return float("inf")


def parse_step_name(name: str, fallback_index: int) -> str:
    if name.upper().startswith("S") and name[1:].isdigit():
        return name.upper()
    return f"S{fallback_index}"


def build_grafcet(pairs: List[Dict[str, str]]) -> List[Step]:
    steps_by_name: Dict[str, Step] = {
        "S0": Step(name="S0", actions=[], transitions=[], level=0)
    }
    previous_step = steps_by_name["S0"]
    next_index = 1

    for rule in pairs:
        condition = rule.get("condition", "").strip()
        action_text = rule.get("action", "").strip()
        target_spec = rule.get("target")
        source_spec = (rule.get("source") or "").strip() or None

        source_name = (
            parse_step_name(source_spec, next_index)
            if source_spec
            else previous_step.name
        )

        if source_name not in steps_by_name:
            steps_by_name[source_name] = Step(
                name=source_name,
                actions=[],
                transitions=[],
                level=0,
            )

        target_name = (
            parse_step_name(target_spec, next_index) if target_spec else f"S{next_index}"
        )

        source_level = steps_by_name[source_name].level
        candidate_level = source_level + 1

        if target_name not in steps_by_name:
            steps_by_name[target_name] = Step(
                name=target_name,
                actions=[action_text] if action_text else [],
                transitions=[],
                level=candidate_level,
            )
        else:
            step = steps_by_name[target_name]
            if action_text:
                step.actions = list(dict.fromkeys(step.actions + [action_text]))
            step.level = min(step.level, candidate_level)

        transition = Transition(
            source=source_name,
            target=target_name,
            condition=condition,
            action=action_text,
        )
        steps_by_name[source_name].transitions.append(transition)

        if not target_spec:
            previous_step = steps_by_name[target_name]
            next_index += 1
        else:
            previous_step = steps_by_name[target_name]

    ordered_names = sorted(steps_by_name.keys(), key=_step_sort_key)
    return [steps_by_name[name] for name in ordered_names]


def compile_grafcet(steps: List[Step]) -> Dict[str, Any]:
    ordered_state_names = sorted({step.name for step in steps}, key=_step_sort_key)
    definitions = [f"{', '.join(ordered_state_names)} : BOOL"]

    transition_blocks = []
    updates = []
    execution_order_names = []
    priority_notes = []
    state_prior_conditions: Dict[str, List[str]] = defaultdict(list)
    noted_states: set = set()
    t_counter = 0

    for step in steps:
        for transition in step.transitions:
            source = transition.source
            target = transition.target
            raw_condition = (transition.condition or "").strip()
            clean_condition = " ".join(raw_condition.upper().split())
            base_expression = source
            if clean_condition:
                base_expression += f" AND {clean_condition}"

            blocking_conditions = state_prior_conditions[source]
            if blocking_conditions:
                not_clauses = " AND ".join(f"NOT ({cond})" for cond in blocking_conditions)
                base_expression += f" AND {not_clauses}"
                if source not in noted_states:
                    noted_states.add(source)
                    priority_notes.append(
                        f"{source} prioriza transiciones anteriores bloqueando {', '.join(blocking_conditions)}."
                    )

            if clean_condition:
                blocking_conditions.append(clean_condition)

            transition_name = f"T{t_counter}"
            transition_blocks.append(f"{transition_name} := {base_expression};")
            execution_order_names.append(transition_name)

            updates.append(
                f"IF {transition_name} THEN\n"
                f"   {source} := 0;\n"
                f"   {target} := 1;\n"
                "END_IF;"
            )

            t_counter += 1

    variables: OrderedDict[str, List[str]] = OrderedDict()
    for step in steps:
        for action in step.actions:
            match = re.match(r"([A-Z0-9_]+)", action.strip().upper())
            if not match:
                continue
            variable = match.group(1)
            states = variables.setdefault(variable, [])
            if step.name not in states:
                states.append(step.name)

    action_lines = [
        f"{var} := {' OR '.join(states)};"
        for var, states in variables.items()
        if states
    ]

    execution_order = [
        f"1. Evaluar condiciones ({', '.join(execution_order_names)})",
        "2. Ejecutar transiciones (cambio de estados)",
        "3. Actualizar salidas (acciones)",
    ]
    analysis = priority_notes or ["No se detectaron conflictos OR simultáneos."]

    return {
        "definitions": definitions,
        "transitions": transition_blocks,
        "updates": updates,
        "actions": action_lines,
        "execution_order": execution_order,
        "analysis": analysis,
    }
