from typing import Iterable, List

from app.models.grafcet import Step


def _step_sort_key(name: str) -> int:
    upper = name.upper()
    if upper.startswith("S") and upper[1:].isdigit():
        return int(upper[1:])
    return float("inf")


def serialize_prompt(steps: Iterable[Step]) -> str:
    ordered_steps: List[Step] = sorted(steps, key=lambda step: _step_sort_key(step.name))
    lines: List[str] = []

    for step in ordered_steps:
        for transition in step.transitions:
            condition = (transition.condition or "").strip() or "1"
            components = [f"{transition.source} WHEN {condition}"]

            action_candidates = []
            if transition.action:
                action_candidates.append(transition.action.strip())

            target_step = next((s for s in ordered_steps if s.name == transition.target), None)
            if target_step:
                action_candidates.extend([action.strip() for action in target_step.actions if action.strip()])

            unique_actions = []
            for action in action_candidates:
                if action and action not in unique_actions:
                    unique_actions.append(action)

            if unique_actions:
                components.append(f"THEN {', '.join(unique_actions)}")

            if transition.target:
                components.append(f"-> {transition.target}")

            lines.append(" ".join(components))

    return "\n".join(lines)
