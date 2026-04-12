from dataclasses import dataclass
from typing import List


@dataclass
class Transition:
    source: str
    target: str
    condition: str
    action: str = ""


@dataclass
class Step:
    name: str
    actions: List[str]
    transitions: List[Transition]
    active: bool = False
    level: int = 0
