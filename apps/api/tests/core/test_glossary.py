"""Монгол нэр томьёоны толь (docs/glossary-mn.md): API-ийн текстэд зөрсөн хэлбэр байхгүй."""

from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parents[2] / "src" / "angel"

RETIRED = {
    "Хүслийн жагсаалт": "wishlist = «Хадгалсан бараа»",
    "Харагдацаар": "visual search = «Зургаар хайх»",
    "Мөнгө буцаасан": "refunded = «Буцаагдсан»",
    "Нөөц хүрэлцэхгүй": "тоо хэмжээ = «үлдэгдэл»",
}


@pytest.mark.parametrize(("word", "why"), RETIRED.items())
def test_retired_terms_do_not_come_back(word: str, why: str) -> None:
    hits = [
        str(path.relative_to(SRC))
        for path in SRC.rglob("*.py")
        if word in path.read_text(encoding="utf-8")
    ]

    assert hits == [], why
