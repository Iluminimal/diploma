"""End-to-end тестийн synthetic каталог (dataset, model хэрэггүй). apps/api-аас ажиллуул:

cd apps/api && uv run python ../../scripts/seed_e2e.py --count 60
make seed-e2e
"""

from angel.ingestion.synthetic import main

if __name__ == "__main__":
    raise SystemExit(main())
