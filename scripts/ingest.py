"""Dataset ingestion. Төслийн environment ашиглахын тулд apps/api-аас ажиллуул:

cd apps/api && uv run python ../../scripts/ingest.py --limit 500
make ingest ARGS="--limit 500"
"""

from angel.ingestion.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
