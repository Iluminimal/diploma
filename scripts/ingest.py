"""Dataset ingestion. Run from apps/api so the project environment is used:

cd apps/api && uv run python ../../scripts/ingest.py --limit 500
make ingest ARGS="--limit 500"
"""

from lookalike.ingestion.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
