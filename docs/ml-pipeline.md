# Data and ML pipeline

How the Kaggle "Fashion Product Images" dataset becomes a searchable catalogue, and the
measurements behind each default. Numbers are from an Apple M1 (8 GB), PyTorch 2.14 / MPS,
Postgres 18 + pgvector 0.8.7, on the full 41,885-product catalogue.

## Running it

```bash
make infra && make migrate                  # Postgres + pgvector, tables and indexes
make ingest ARGS="--limit 500"              # smoke test, under a minute
make ingest                                 # everything (about 16-25 minutes on an M1)

cd apps/api
uv run python ../../scripts/check_recall.py --n 1000      # product image -> itself at rank 1
uv run python ../../scripts/measure_latency.py --device cpu   # p50/p95/p99 vs spec targets
uv run python ../../scripts/benchmark_ml.py               # fp16, batch size, crop vs pad, CPU
```

`DATASET_DIR` (in `.env`) points at the folder holding `styles.csv` and `images/`. Thumbnails
are written to `MEDIA_DIR` (default `data/media`, git-ignored) and served by the API at `/media`.

Ingestion is **idempotent and resumable**: the database is the only state. A product is done when
its row exists with the current `embedding_version` and both thumbnails exist. Ctrl-C at any
point and re-run; finished batches are kept, a finished run is a no-op (seconds).

| Flag | Meaning |
| --- | --- |
| `--limit N` | First N products by id. A later larger run is a superset of it. |
| `--batch-size`, `--workers`, `--device`, `--fp16` | Throughput knobs (defaults come from the benchmark). |
| `--reembed` | Recompute embeddings that already exist (price, stock, activity are kept). |
| `--regenerate-thumbnails` | Rewrite thumbnails even if present. |
| `--master-categories` | Default `Apparel,Footwear,Accessories` (Personal Care etc. are not clothing). |
| `--import-embeddings DIR` | Use embeddings computed elsewhere instead of running the model. |

### Computing embeddings on Colab/Kaggle

The embedding step needs only the CSV and the images, not a database. Install the package
(`pip install ./apps/api`) and run:

```bash
python scripts/ingest.py embed --dataset /content/fashion --out /content/embeddings --device cuda --fp16
# download /content/embeddings (parquet shards), then locally:
make ingest ARGS="--import-embeddings /path/to/embeddings"
```

Shards are written every ~2k products, so a dropped session resumes where it stopped. Every shard
records the model revision and preprocessing; import refuses a mismatch, NaNs, or vectors that are
not L2-normalized. The local run still produces the thumbnails and the database rows.

## Cleaning (`ingestion/cleaning.py`)

`styles.csv` has 44,446 records. Dropped: 22 malformed rows (unquoted commas), 5 rows whose image
is missing, and 2,534 rows outside Apparel/Footwear/Accessories (2,403 Personal Care, 105 Free
Items, 25 Sporting Goods, 1 Home). Result: **41,885 products**, 143 article types. Corrupt images
are skipped at ingest time and reported (none in this dataset).

## Decisions and the evidence for them

**Device and precision: fp32 on MPS.** fp16 was numerically fine (min cosine vs fp32 0.9999,
top-10 neighbour overlap 0.996, no NaN/inf) but only 1.19x faster (118 vs 99 img/s), below the 1.3x
gate, and image decoding is the bottleneck anyway. CPU and MPS fp32 agree to 1e-6 cosine.

**Batch size 64.** MPS throughput is flat from 32 to 128 (96-101 img/s); peak RSS 1.3 GB.

**Preprocessing: pad to square, not CLIP's center crop.** Retrieval quality is a wash (leave-one-out
kNN article-type consistency@10 0.774 pad vs 0.771 crop; zero-shot article type 71.2% vs 71.0%),
so we keep the whole garment instead of cutting the top/bottom off portrait photos. One shared
function (`ml/preprocess.py`) is used by ingestion and queries. Changing the mode changes what an
embedding means; `embedding_version` (`fashion-clip@<rev>/pad`) is stored per product so stale rows
are detected and re-embedded.

**Decoding uses JPEG draft mode** (decode at 1/2 scale when the target is smaller): 6.6 ms vs
10.6 ms per 1800x2400 image. A modest saving, bought at a small price: embeddings differ from
full-size decoding by cosine 0.99994 on average (worst 0.9977). It is applied identically to
catalogue images and queries (`min_side=800`), so a catalogue image searched as an upload matches
itself exactly. Remove `min_side` in `ml/preprocess.py` callers if bit-exactness ever matters more
than ~1 minute per full ingest.

**Throughput.** One worker does about 13 img/s end to end; the process pool saturates at 3-4
workers. The full run did **41,885 products in 16 min 10 s (about 43 img/s)** with the test suite
running alongside. WebP `method=2` instead of 4 halves encoding time for ~4% larger files.

**Storage.** 83,770 WebP files, 1.3 GB (400 px and 800 px longest side). Database: 247 MB total,
of which the HNSW index is 107 MB. Money is integer cents (`price_cents`, USD); prices and stock are
generated from `sha256(seed:source_id)` so they do not depend on row order or `--limit`.

## Search settings

**HNSW** `vector_cosine_ops`, `m=16`, `ef_construction=128`. Recall of the approximate index against
an exact scan (150 stored-embedding queries, k=10):

| `ef_search` | recall@10 | p50 |
| --- | --- | --- |
| 10-40 | 0.985-0.986 | 9-14 ms |
| 80 | 0.993 | 14 ms |
| **200 (default)** | **1.000** | 13 ms |
| 400 | exact | 91 ms |

At `ef_search=400` Postgres' cost estimate flips the plan to a **sequential scan** (confirmed with
`EXPLAIN`), which is exact but 7x slower. So the repository clamps `ef_search` to 300.

**Filtered search** uses pgvector 0.8 iterative scan (`hnsw.iterative_scan = relaxed_order`,
`hnsw.max_scan_tuples = 20000`) instead of over-fetching: if the filters discard most of the
index's candidates, the scan continues until the page is full. A regression test
(`test_selective_filters_still_return_a_full_page...`) shows 10/10 rows with it versus fewer
without when only ~5% of rows match; with common filters (gender + article type + in stock) both
modes were equally good, so it costs nothing to leave on. `relaxed_order` can return rows slightly
out of order, so results are re-sorted in Python. Per-query settings use `set_config(..., true)`
(transaction-local), so they never leak between pooled connections.

## Measured results

Latency, warm model, 200 real catalogue images sent as JPEG bytes (original 1800x2400, and a
phone-style 1280 px copy). The filtered query uses gender, article type, in stock and a price
range:

| | CPU p50 / p95 | MPS p50 / p95 | Target |
| --- | --- | --- | --- |
| Embed one image | 41 / 43 ms | 33 / 38 ms | |
| pgvector top-20 | 13 / 18 ms | | |
| pgvector top-20, 5 filters | 25 / 41 ms | | |
| **Image search, end to end** (original upload) | 68 / **78 ms** | 60 / **75 ms** | p95 < 400 ms |
| Image search, end to end (1280 px upload) | 64 / **71 ms** | 54 / **63 ms** | p95 < 400 ms |
| **Similar products** (stored embedding) | 9 / **13 ms** | 5 / **7 ms** | p95 < 50 ms |

Recall sanity (`check_recall.py`, 1000 random products, their own image sent through the real
pipeline, `ef_search=200`): self is rank 1 or tied for rank 1 in **1000/1000**; strictly rank 1 in
983/1000. The remaining ~1.7% are products whose catalogue image is a near-duplicate of another
product's (same photo listed twice, similarity within 1e-4), where either may legitimately win.
At the old `ef_search=80` one product was missed outright (an HNSW traversal miss; an exact scan
ranks it first), which is what motivated 200.
