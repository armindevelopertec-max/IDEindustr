import re
from typing import Dict, List


class GrafcetSyntaxError(ValueError):
    """Raised when a DSL line does not follow the official syntax."""


_SYNTAX_PATTERN = re.compile(
    r"^\s*(?P<source>S\d+)\s+(?:THEN\s+(?P<action>.+?)\s+)?NEXT\s+(?P<condition>.+?)\s*->\s*(?P<target>S\d+)\s*$",
    re.IGNORECASE,
)


def parse_cnl(text: str) -> List[Dict[str, str]]:
    """Parse the new Grafcet DSL: Sx [THEN acción] NEXT condición -> Sy."""

    parsed: List[Dict[str, str]] = []
    errors: List[str] = []

    for index, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        match = _SYNTAX_PATTERN.match(line)
        if not match:
            errors.append(f"Línea {index} inválida: '{raw_line}'. Debe seguir 'Sx [THEN acción] NEXT condición -> Sy'.")
            continue

        condition = (match.group("condition") or "").strip()
        if not condition:
            errors.append(f"Línea {index}: la condición NEXT no puede estar vacía.")
            continue

        action = (match.group("action") or "").strip()

        parsed.append(
            {
                "source": match.group("source").upper(),
                "action": action,
                "condition": condition,
                "target": match.group("target").upper(),
            }
        )

    if errors:
        raise GrafcetSyntaxError("; ".join(errors))

    return parsed
