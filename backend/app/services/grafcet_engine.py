from typing import Dict, List

from app.models.grafcet import Step, Transition


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

        target_name = (
            parse_step_name(target_spec, next_index) if target_spec else f"S{next_index}"
        )

        source_level = steps_by_name[previous_step.name].level
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
            source=previous_step.name,
            target=target_name,
            condition=condition,
        )
        previous_step.transitions.append(transition)

        if not target_spec:
            previous_step = steps_by_name[target_name]
            next_index += 1

    return list(steps_by_name.values())
