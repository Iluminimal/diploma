"""A short, human label for a browser, from its User-Agent header: "Chrome on macOS"."""

# Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
_BROWSERS = (
    ("Edg", "Edge"),
    ("OPR", "Opera"),
    ("Firefox", "Firefox"),
    ("CriOS", "Chrome"),
    ("FxiOS", "Firefox"),
    ("Chrome", "Chrome"),
    ("Safari", "Safari"),
)
# iPhone and iPad user agents also say "like Mac OS X": test them first.
_SYSTEMS = (
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Windows", "Windows"),
    ("Mac OS X", "macOS"),
    ("CrOS", "ChromeOS"),
    ("Linux", "Linux"),
)


def describe_device(user_agent: str | None) -> str:
    if not user_agent:
        return "Unknown device"
    browser = next((name for token, name in _BROWSERS if token in user_agent), None)
    system = next((name for token, name in _SYSTEMS if token in user_agent), None)
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or "Unknown device"
