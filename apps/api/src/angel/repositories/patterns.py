"""Хэрэглэгчийн бичсэн текстийн LIKE pattern-ууд. `escape="\\"`-тай хамт хэрэглэ: ингэвэл
хэрэглэгчийн бичсэн `%`, `_` нь wildcard биш энгийн тэмдэгт болно."""


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def contains_pattern(text: str) -> str:
    return f"%{_escape(text)}%"


def prefix_pattern(text: str) -> str:
    return f"{_escape(text)}%"
