"""User-Agent header-ээс browser-ийн богино, хүнд ойлгомжтой нэр: "Chrome on macOS"."""

# Дараалал чухал: Edge, Opera ч "Chrome" гэж бичдэг, Chrome ч "Safari" гэж бичдэг.
_BROWSERS = (
    ("Edg", "Edge"),
    ("OPR", "Opera"),
    ("Firefox", "Firefox"),
    ("CriOS", "Chrome"),
    ("FxiOS", "Firefox"),
    ("Chrome", "Chrome"),
    ("Safari", "Safari"),
)
# iPhone, iPad-ийн user agent "like Mac OS X" гэж бас бичдэг: тэдгээрийг түрүүлж шалга.
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
