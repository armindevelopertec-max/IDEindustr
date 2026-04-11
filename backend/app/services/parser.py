from typing import Dict, List, Optional


def parse_cnl(text: str) -> List[Dict[str, str]]:
    """Extract WHEN/THEN rules with optional targets."""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    parsed = []

    for line in lines:
        if "WHEN" not in line or "THEN" not in line:
            continue

        pre_then, post_then = line.split("THEN", 1)
        condition = pre_then.split("WHEN", 1)[-1].strip()

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
                "condition": condition,
                "action": action,
                "target": target,
            }
        )

    return parsed
