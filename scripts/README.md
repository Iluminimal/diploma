# scripts

Command-line entry points. They are thin: each imports the real code from the `angel` package, so run them through `make`
(or from `apps/api` with `uv run python ../../scripts/<name>.py`).

| Script | Make target | What it does |
| --- | --- | --- |
| `ingest.py` | `make ingest` | Load the Kaggle dataset: clean, thumbnails, embeddings, prices and stock |
| `seed_demo.py` | `make seed-demo` (`seed-demo-clean`) | Demo customers, orders in every state and reviews, for the admin dashboard (development only) |
| `seed_e2e.py` | `make seed-e2e` | A synthetic 60-product catalogue for the end-to-end tests (no dataset, no model) |
| `e2e_clean.py` | `make e2e-clean` | Remove what the end-to-end tests created in the dev database |
| `check_recall.py` | | Compare the HNSW index with exact search (recall) |
| `evaluate_map.py` | | Retrieval quality: mAP@K, P@K, recall, hit rate and nDCG against the dataset's labels, with a random baseline (`docs/ml-pipeline.md`, results in `docs/perf/map*.json`) |
| `measure_latency.py`, `measure_api_latency.py` | | Latency of the search query and of the whole endpoint |
| `benchmark_ml.py` | | Speed of image preprocessing and the embedding model |
