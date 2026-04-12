from typing import Dict, List, Optional


def parse_cnl(text: str) -> List[Dict[str, str]]:
    """Extract WHEN/THEN rules with optional sources and targets."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    parsed = []

    for line in lines:
        if "WHEN" not in line or "THEN" not in line:
            continue

        pre_then, post_then = line.split("THEN", 1)
        when_parts = pre_then.split("WHEN", 1)
        before_when = when_parts[0].strip()
        condition = when_parts[1].strip() if len(when_parts) > 1 else ""
        source: Optional[str] = None
        if before_when.upper().startswith("S") and before_when[1:].isdigit():
            source = before_when.upper()

        action = post_then.strip()
        target: Optional[str] = None
        if "->" in action:
            action_part, target_part = action.split("->", 1)
            action = action_part.strip()
            target = target_part.strip()

        if not condition:
            continue

        parsed.append(
            {
                "source": source,
                "condition": condition,
                "action": action,
                "target": target,
            }
        )

    return parsed
