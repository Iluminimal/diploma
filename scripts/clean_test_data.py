"""Хөгжүүлэлтийн database дахь бүх туршилтын өгөгдлийг устгана. apps/api-аас ажиллуул:

cd apps/api && uv run python ../../scripts/clean_test_data.py --keep-email you@example.com
cd apps/api && uv run python ../../scripts/clean_test_data.py --keep-email you@example.com --yes
make clean-test-data KEEP=you@example.com [ARGS=--yes]
"""

from angel.cli.clean_test_data import main

if __name__ == "__main__":
    raise SystemExit(main())
