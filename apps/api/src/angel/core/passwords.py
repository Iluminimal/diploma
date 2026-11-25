"""Нууц үгийн сул байдлын шалгалт. Урт нь (>= 10) схемд шалгагддаг; энд хүмүүс түгээмэл сонгодог,
таамаглахад амархан нууц үгийг татгалзана. Гаднын breach API-г (HIBP г.м.) зориуд ашиглахгүй: нууц
үгийн хэсэг ч манай серверээс гадагш гарах ёсгүй. Дүрэм нь вэбийн `password-strength.ts`-тэй
ижил."""

import re
from functools import cache
from pathlib import Path
from typing import Literal

WeakReason = Literal["common", "repeated", "contains_identity"]

_LIST = Path(__file__).with_name("common_passwords.txt")
# Нууц үгийн "үндэс" (түгээмэл үг): дараа нь тоо, тэмдэгт залгасан бол сул, харин урт өгүүлбэрийн
# нэг хэсэг бол сул биш.
_ROOTS = (
    "password",
    "passw0rd",
    "qwerty",
    "welcome",
    "iloveyou",
    "letmein",
    "admin",
    "monkey",
    "dragon",
    "football",
    "baseball",
    "sunshine",
    "princess",
    "mongolia",
    "ulaanbaatar",
    "angel",
)
_TRAILING = re.compile(r"[\d!@#$%^&*._-]+$")
# Нэр, имэйлээс үг хайхад хамгийн богино утга (богино нь санамсаргүй таарна).
MIN_IDENTITY_PART = 4


@cache
def _common() -> frozenset[str]:
    lines = (line.strip().lower() for line in _LIST.read_text(encoding="utf-8").splitlines())
    return frozenset(line for line in lines if line and not line.startswith("#"))


def _parts(value: str | None) -> list[str]:
    return [
        p for p in re.split(r"[^a-z0-9]+", (value or "").lower()) if len(p) >= MIN_IDENTITY_PART
    ]


def weakness(
    password: str, *, email: str | None = None, full_name: str | None = None
) -> WeakReason | None:
    """Нууц үг сул бол шалтгааныг, үгүй бол None. Том жижиг үсгийг ялгахгүй."""
    lowered = password.lower()
    if lowered in _common():
        return "common"
    stripped = _TRAILING.sub("", lowered)
    for root in _ROOTS:
        # "password" + хэдхэн тэмдэгт: сул. "password-horse-battery-staple": сул биш.
        if stripped == root or (stripped.startswith(root) and len(lowered) <= len(root) + 5):
            return "common"
    if len(set(lowered)) <= 2:
        return "repeated"
    local = (email or "").split("@")[0]
    if any(part in lowered for part in [*_parts(local), *_parts(full_name)]):
        return "contains_identity"
    return None
