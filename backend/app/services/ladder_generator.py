from typing import List

from app.models.grafcet import Step


def generate_ladder(steps: List[Step]) -> List[str]:
    ladder = []

    for step in steps:
        for transition in step.transitions:
            ladder.append(f"{transition.source} --({transition.condition})--> {transition.target}")

        for action in step.actions:
            ladder.append(f"{step.name} -> {action}")

    return ladder
