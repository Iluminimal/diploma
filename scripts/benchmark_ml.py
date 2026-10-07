"""Benchmark the ML pipeline on this machine and decide the defaults.

Measures: image decode/thumbnail throughput per worker count, fp16 vs fp32 numerical
agreement on MPS, throughput and memory per batch size, CPU throughput, whether JPEG draft
decoding changes embeddings, and CLIP center-crop vs pad-to-square preprocessing quality.

    cd apps/api && uv run python ../../scripts/benchmark_ml.py --n 2000
"""

from __future__ import annotations

import argparse
import resource
import tempfile
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from numpy.typing import NDArray

from lookalike.ingestion.images import ImageJob, process_image
from lookalike.ml.fashion_clip import FashionClipEmbedder, select_device
from lookalike.ml.preprocess import load_image, to_clip_array
from lookalike.storage import LocalStorage

SCOPE = ("Apparel", "Footwear", "Accessories")


def sample_products(dataset: Path, n: int, seed: int) -> pd.DataFrame:
    frame = pd.read_csv(dataset / "styles.csv", on_bad_lines="skip", dtype={"id": "string"})
    frame = frame[frame["masterCategory"].isin(SCOPE)].dropna(subset=["articleType", "subCategory"])
    frame = frame[frame["id"].map(lambda i: (dataset / "images" / f"{i}.jpg").is_file())]
    return frame.sample(n=n, random_state=seed).reset_index(drop=True)


def _decode_arrays(path: str) -> tuple[NDArray[np.uint8], NDArray[np.uint8], NDArray[np.uint8]]:
    draft = load_image(path, min_side=800)
    full = load_image(path)
    return (
        to_clip_array(draft, "pad"),
        to_clip_array(draft, "crop"),
        to_clip_array(full, "pad"),
    )


def _thumb_job(args: tuple[int, str, str]) -> bool:
    source_id, path, root = args
    storage = LocalStorage(Path(root), "/media")
    result = process_image(ImageJob(source_id, Path(path), "pad", True, True), storage)
    return result.error is None


def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6  # bytes on macOS


def embed_all(
    embedder: FashionClipEmbedder, arrays: NDArray[np.uint8], batch: int
) -> NDArray[np.float32]:
    out = [embedder.embed_arrays(arrays[i : i + batch]) for i in range(0, len(arrays), batch)]
    return np.concatenate(out)


def timed_embed(
    embedder: FashionClipEmbedder, arrays: NDArray[np.uint8], batch: int
) -> tuple[NDArray[np.float32], float]:
    embed_all(embedder, arrays[:batch], batch)  # warm-up (kernel compilation)
    start = time.perf_counter()
    vectors = embed_all(embedder, arrays, batch)
    return vectors, len(arrays) / (time.perf_counter() - start)


def neighbours(vectors: NDArray[np.float32], k: int) -> NDArray[np.int64]:
    sims = vectors @ vectors.T
    np.fill_diagonal(sims, -np.inf)
    return np.argsort(-sims, axis=1)[:, :k]


def consistency(vectors: NDArray[np.float32], labels: NDArray[np.str_], k: int = 10) -> float:
    idx = neighbours(vectors, k)
    return float((labels[idx] == labels[:, None]).mean())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=Path("~/Datasets/fashion").expanduser())
    parser.add_argument("--n", type=int, default=2000)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--thumb-n", type=int, default=240)
    parser.add_argument("--workdir", type=Path, default=None)
    args = parser.parse_args()

    products = sample_products(args.dataset, args.n, args.seed)
    paths = [str(args.dataset / "images" / f"{i}.jpg") for i in products["id"]]
    print(
        f"sampled {len(paths)} products; torch {torch.__version__}; device auto = "
        f"{select_device()}\n"
    )

    # 1. Decode + thumbnail throughput per worker count --------------------------------------
    print("== 1. decode + 2 WebP sizes + blur + 224px array, images/s (whole pipeline)")
    with tempfile.TemporaryDirectory(dir=args.workdir) as tmp:
        jobs = [(int(products["id"][i]), paths[i], tmp) for i in range(args.thumb_n)]
        for workers in (1, 2, 3, 4):
            start = time.perf_counter()
            with Pool(workers) as pool:
                ok = sum(pool.map(_thumb_job, jobs, chunksize=8))
            rate = len(jobs) / (time.perf_counter() - start)
            print(f"   workers={workers}: {rate:6.1f} img/s  ({ok}/{len(jobs)} ok)")
        sizes = [p.stat().st_size for p in Path(tmp).rglob("*.webp")]
        per_product = sum(sizes) / len(jobs)
        print(
            f"   avg bytes/product for both thumbnails: {per_product / 1e3:.1f} KB "
            f"-> {per_product * 41_900 / 1e9:.2f} GB for 41.9k products\n"
        )

    # 2. Arrays for embedding experiments ------------------------------------------------------
    print("== 2. preparing arrays (draft-pad, draft-crop, full-decode-pad)")
    start = time.perf_counter()
    with Pool(3) as pool:
        decoded = pool.map(_decode_arrays, paths, chunksize=8)
    pad, crop, pad_full = (np.stack([d[i] for d in decoded]) for i in range(3))
    print(f"   {time.perf_counter() - start:.0f}s\n")

    # 3. fp32 on MPS, batch sweep --------------------------------------------------------------
    device = select_device()
    print(f"== 3. fp32 on {device}: batch-size sweep (images/s, peak RSS)")
    fp32 = FashionClipEmbedder(device=device, fp16=False)
    fp32.load()
    reference = None
    for batch in (16, 32, 64, 128, 256):
        vectors, rate = timed_embed(fp32, pad[:512], batch)
        print(f"   batch={batch:3d}: {rate:6.1f} img/s   peak RSS {rss_mb():.0f} MB")
        reference = vectors if batch == 64 else reference
    vectors32, rate32 = timed_embed(fp32, pad, 64)
    print(f"   full {len(pad)} images at batch 64: {rate32:.1f} img/s")
    print(
        f"   norms: min {np.linalg.norm(vectors32, axis=1).min():.6f} "
        f"max {np.linalg.norm(vectors32, axis=1).max():.6f}\n"
    )
    assert reference is not None

    # 4. fp16 stability on MPS -----------------------------------------------------------------
    print("== 4. fp16 vs fp32 on MPS")
    fp16 = FashionClipEmbedder(device=device, fp16=True)
    fp16.load()
    vectors16, rate16 = timed_embed(fp16, pad, 64)
    cosines = (vectors16 * vectors32).sum(axis=1)
    nn32, nn16 = neighbours(vectors32, 10), neighbours(vectors16, 10)
    overlap = np.mean([len(set(a) & set(b)) / 10 for a, b in zip(nn32, nn16, strict=True)])
    top1 = float((nn32[:, 0] == nn16[:, 0]).mean())
    finite = bool(np.isfinite(vectors16).all())
    print(
        f"   fp16 {rate16:.1f} img/s vs fp32 {rate32:.1f} img/s -> speedup {rate16 / rate32:.2f}x"
    )
    print(f"   cosine(fp16, fp32): min {cosines.min():.5f} mean {cosines.mean():.5f}")
    print(
        f"   top-10 neighbour overlap {overlap:.3f}, top-1 agreement {top1:.3f}, "
        f"all finite: {finite}"
    )
    verdict = finite and cosines.min() >= 0.999 and rate16 / rate32 >= 1.3
    print(f"   GATE (finite, min cos >= 0.999, speedup >= 1.3x): {'PASS' if verdict else 'FAIL'}\n")
    for batch in (32, 128):
        _, rate = timed_embed(fp16, pad[:512], batch)
        print(f"   fp16 batch={batch}: {rate:.1f} img/s")
    del fp16

    # 5. draft decoding vs full decoding -------------------------------------------------------
    print("\n== 5. JPEG draft (1/2-scale) decode vs full decode")
    full_vectors = embed_all(fp32, pad_full, 64)
    cos_draft = (full_vectors * vectors32).sum(axis=1)
    print(f"   cosine(draft, full): min {cos_draft.min():.5f} mean {cos_draft.mean():.5f}\n")

    # 6. center-crop vs pad --------------------------------------------------------------------
    print("== 6. center-crop vs pad-to-square (leave-one-out kNN within the sample)")
    crop_vectors = embed_all(fp32, crop, 64)
    labels = {c: products[c].to_numpy() for c in ("articleType", "subCategory", "gender")}
    for name, vecs in (("pad ", vectors32), ("crop", crop_vectors)):
        scores = "  ".join(f"{c}@10 {consistency(vecs, labels[c]):.3f}" for c in labels)
        print(f"   {name}: {scores}")

    types = sorted(set(labels["articleType"]))
    text = fp32.embed_texts([f"a photo of a {t.lower()}" for t in types])
    for name, vecs in (("pad ", vectors32), ("crop", crop_vectors)):
        predicted = np.array(types)[(vecs @ text.T).argmax(axis=1)]
        print(
            f"   {name}: zero-shot articleType accuracy "
            f"{np.mean(predicted == labels['articleType']):.3f}"
            f" ({len(types)} classes)"
        )

    # 7. CPU -----------------------------------------------------------------------------------
    print("\n== 7. fp32 on CPU")
    del fp32
    cpu = FashionClipEmbedder(device=torch.device("cpu"), fp16=False)
    cpu.load()
    for batch in (1, 16, 32):
        _, rate = timed_embed(cpu, pad[:128], batch)
        print(f"   batch={batch:2d}: {rate:6.1f} img/s")
    cpu_vectors = embed_all(cpu, pad[:128], 32)
    print(f"   cosine(cpu, mps fp32): min {(cpu_vectors * vectors32[:128]).sum(axis=1).min():.6f}")


if __name__ == "__main__":
    main()
