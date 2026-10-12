import json
import sys
from pathlib import Path

from angel.main import create_app


def main(output: str) -> None:
    schema = create_app().openapi()
    Path(output).write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {output}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m angel.cli.openapi <output.json>")
    main(sys.argv[1])
