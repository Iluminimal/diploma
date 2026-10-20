"""Admin dashboard-ын demo customer, захиалга, review (зөвхөн хөгжүүлэлт). apps/api-аас ажиллуул:

cd apps/api && uv run python ../../scripts/seed_demo.py
cd apps/api && uv run python ../../scripts/seed_demo.py --clean
make seed-demo / make seed-demo-clean
"""

from angel.cli.seed_demo import main

if __name__ == "__main__":
    raise SystemExit(main())
