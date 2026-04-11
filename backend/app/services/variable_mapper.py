from typing import Dict


def default_variable_map() -> Dict[str, str]:
    return {
        "START": "0.00",
        "STOP": "0.01",
        "SENSOR": "0.02",
        "MOTOR": "100.00",
        "CYLINDER": "100.01",
    }
