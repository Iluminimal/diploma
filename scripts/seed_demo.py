"""Demo customers, orders and reviews for the admin dashboard (development only). Run from apps/api:

cd apps/api && uv run python ../../scripts/seed_demo.py
cd apps/api && uv run python ../../scripts/seed_demo.py --clean
make seed-demo / make seed-demo-clean
"""

from angel.demo import main

if __name__ == "__main__":
    raise SystemExit(main())
