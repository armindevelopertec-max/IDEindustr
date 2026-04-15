import re
from typing import Dict, List


class GrafcetSyntaxError(ValueError):
    """Raised when a DSL line does not follow the official syntax."""


_SYNTAX_PATTERN = re.compile(
    r"^\s*(?P<source>S\d+)\s+(?:THEN\s+(?P<action>.+?)\s+)?NEXT\s+(?P<condition>.+?)\s*->\s*(?P<target>S\d+)\s*$",
    re.IGNORECASE,
)

_ACTION_ONLY_PATTERN = re.compile(
    r"^\s*(?P<source>S\d+)\s+THEN\s+(?P<action>.+?)\s*$",
    re.IGNORECASE,
)


def parse_cnl(text: str) -> List[Dict[str, str]]:
    """Parse the new Grafcet DSL: Sx [THEN acción] NEXT condición -> Sy o Sx THEN acción."""

    parsed: List[Dict[str, str]] = []
    errors: List[str] = []

    for index, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("//") or line.startswith("/*"):
            continue

        # Intentar match con transición completa
        match = _SYNTAX_PATTERN.match(line)
        if match:
            parsed.append({
                "source": match.group("source").upper(),
                "action": (match.group("action") or "").strip(),
                "condition": match.group("condition").strip(),
                "target": match.group("target").upper(),
            })
            continue

        # Intentar match con solo acción
        action_match = _ACTION_ONLY_PATTERN.match(line)
        if action_match:
            parsed.append({
                "source": action_match.group("source").upper(),
                "action": action_match.group("action").strip(),
                "condition": None, # Indica que no es una transición, solo añade acción
                "target": None,
            })
            continue

        errors.append(f"Línea {index} inválida: '{raw_line}'. Usa 'Sx [THEN acción] NEXT condición -> Sy' o 'Sx THEN acción'.")

    if errors:
        raise GrafcetSyntaxError("; ".join(errors))

    return parsed
