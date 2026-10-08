"""LIKE patterns for user-typed text. Use them with `escape="\\\\"`, so a `%` or `_` the user
types is an ordinary character and not a wildcard."""


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def contains_pattern(text: str) -> str:
    return f"%{_escape(text)}%"


def prefix_pattern(text: str) -> str:
    return f"{_escape(text)}%"
