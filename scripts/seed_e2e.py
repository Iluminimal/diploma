"""Synthetic catalogue for the end-to-end tests (no dataset, no model). Run from apps/api:

cd apps/api && uv run python ../../scripts/seed_e2e.py --count 60
make seed-e2e
"""

from angel.ingestion.synthetic import main

if __name__ == "__main__":
    raise SystemExit(main())
