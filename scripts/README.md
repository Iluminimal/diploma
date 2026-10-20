# scripts

Командын мөрөөс ажиллуулах скриптүүд. Тэд нимгэн: жинхэнэ код нь `angel` багцад байх ба скрипт зөвхөн дуудна.
`make`-ээр эсвэл `apps/api` фолдероос `uv run python ../../scripts/<нэр>.py` гэж ажиллуулна.

| Скрипт | Make команд | Юу хийдэг вэ |
| --- | --- | --- |
| `ingest.py` | `make ingest` | Kaggle датасетийг ачаална: цэвэрлэх, thumbnail, embedding, үнэ, нөөц |
| `seed_demo.py` | `make seed-demo` (`seed-demo-clean`) | Админ самбарт зориулсан demo хэрэглэгч, бүх төлөвтэй захиалга, сэтгэгдэл (зөвхөн хөгжүүлэлтэд) |
| `seed_e2e.py` | `make seed-e2e` | End-to-end тестэд зориулсан 60 барааны хиймэл каталог (датасет, загвар хэрэггүй) |
| `e2e_clean.py` | `make e2e-clean` | End-to-end тестийн үлдээсэн өгөгдлийг dev өгөгдлийн сангаас цэвэрлэнэ |
| `check_recall.py` | | HNSW индексийг яг (exact) хайлттай харьцуулна (recall) |
| `evaluate_map.py` | | Хайлтын чанар: mAP@K, P@K, recall, hit rate, nDCG; санамсаргүй эрэмбэтэй харьцуулна (`docs/ml-pipeline.md`, үр дүн `docs/perf/map*.json`) |
| `measure_latency.py`, `measure_api_latency.py` | | Хайлтын query болон бүтэн endpoint-ийн хугацаа |
| `benchmark_ml.py` | | Зураг боловсруулалт болон embedding загварын хурд |
