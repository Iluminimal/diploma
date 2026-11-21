"""Каталогийг загвар бүрээр embed хийж, кэшлэх, encode-ийн хурдыг хэмжих.

Embedding-ийг `chunk-00000.npy` гэх мэт хэсгээр хадгална: удаан ажиллуулалт тасарвал үргэлжлүүлж
болно. Кэш нь `data/`-д биш `docs/perf/embeddings/`-д (gitignored: `*.npy`).
"""

import json
import time
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from tqdm import tqdm

from angel.ml.benchmark.encoders import ImageEncoder
from angel.ml.embeddings import Embeddings, ImageArrays
from angel.ml.preprocess import ResizeMode, load_image, to_clip_array

CHUNK = 2048  # кэшийн нэг файлд орох зураг


def cache_dir(root: Path, encoder: ImageEncoder, mode: ResizeMode, count: int) -> Path:
    """Загвар, revision, preprocessing, каталогийн хэмжээ бүрт тусдаа хавтас."""
    return root / f"{encoder.name}-{encoder.version.split('@')[-1]}-{mode}-{count}"


def load_array(path: Path, mode: ResizeMode) -> ImageArrays:
    """Каталогийн зургийг ingestion-тэй ижил аргаар 224x224 uint8 болгоно."""
    return to_clip_array(load_image(path, min_side=800), mode)


def _arrays(paths: Sequence[Path], mode: ResizeMode, pool: ThreadPoolExecutor) -> NDArray[np.uint8]:
    return np.stack(list(pool.map(lambda p: load_array(p, mode), paths)))


def embed_catalogue(
    encoder: ImageEncoder,
    paths: Sequence[Path],
    *,
    mode: ResizeMode,
    root: Path,
    batch_size: int = 64,
    workers: int = 4,
    progress: Callable[[int], None] | None = None,
) -> Embeddings:
    """`paths` бүрийн embedding (n, dimension), кэшээс үргэлжлүүлнэ."""
    directory = cache_dir(root, encoder, mode, len(paths))
    directory.mkdir(parents=True, exist_ok=True)
    chunks: list[Embeddings] = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        bar = tqdm(total=len(paths), desc=encoder.name, unit="img")
        for index, start in enumerate(range(0, len(paths), CHUNK)):
            file = directory / f"chunk-{index:05d}.npy"
            part = paths[start : start + CHUNK]
            if file.exists():
                chunks.append(np.load(file))
            else:
                vectors = [
                    encoder.encode(_arrays(part[i : i + batch_size], mode, pool))
                    for i in range(0, len(part), batch_size)
                ]
                chunk = np.concatenate(vectors).astype(np.float32, copy=False)
                np.save(file.with_suffix(".tmp.npy"), chunk)
                file.with_suffix(".tmp.npy").replace(file)
                chunks.append(chunk)
            bar.update(len(part))
            if progress:
                progress(start + len(part))
        bar.close()
    embeddings = np.concatenate(chunks)
    if embeddings.shape != (len(paths), encoder.dimension):
        raise RuntimeError(f"cache {directory} holds {embeddings.shape}, expected a re-run")
    (directory / "meta.json").write_text(
        json.dumps({"encoder": encoder.name, "version": encoder.version, "mode": mode}, indent=2)
    )
    return embeddings


def measure_latency(
    encoder: ImageEncoder,
    arrays: ImageArrays,
    *,
    batch_sizes: Sequence[int] = (1, 32),
    repeats: int = 30,
    warmup: int = 3,
) -> dict[str, dict[str, float]]:
    """Нэг зургийн encode хугацаа (ms): batch бүрийн p50, p95 ба нэг зурагт ногдох дундаж.

    `arrays` нь хамгийн том batch-аас багагүй. GPU-г `encode` дотор CPU руу буцаадаг тул (numpy)
    хугацаа бүрэн дуусах хүртэлх бодит хугацаа."""
    results: dict[str, dict[str, float]] = {}
    for size in batch_sizes:
        batch = arrays[:size]
        for _ in range(warmup):
            encoder.encode(batch)
        times: list[float] = []
        for _ in range(repeats):
            started = time.perf_counter()
            encoder.encode(batch)
            times.append((time.perf_counter() - started) * 1000)
        p50, p95 = np.percentile(times, [50, 95])
        results[str(size)] = {
            "batch_p50_ms": round(float(p50), 2),
            "batch_p95_ms": round(float(p95), 2),
            "per_image_ms": round(float(np.mean(times)) / size, 3),
        }
    return results
