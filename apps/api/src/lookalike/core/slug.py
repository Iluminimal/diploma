import re
import unicodedata

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def slugify(text: str, *, max_length: int = 150) -> str:
    """ASCII, lowercase, hyphen-separated. Returns "" when nothing usable remains."""
    folded = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    slug = _NON_ALNUM.sub("-", folded.lower()).strip("-")
    return slug[:max_length].strip("-")
