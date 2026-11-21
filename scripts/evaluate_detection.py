"""YOLO detector хайлтыг сайжруулж байна уу: олон хувцастай синтетик зураг дээр хэмжинэ.

    cd apps/api && uv run python ../../scripts/evaluate_detection.py --collages 300 \\
        --out ../../docs/perf/detection.json

Каталогийн 2-3 бүтээгдэхүүний (цамц, өмд, гутал, цүнхээс) зургийг нэг эгнээнд наасан "collage"
үүсгэнэ. Бүтээгдэхүүн бүрийн байрлал мэдэгдэж байгаа тул (ground truth) юуг хэмжиж болно:

  detector   хувцас бүр илэрсэн үү (recall), ангилал нь зөв үү, илүү хайрцаг хэд вэ
  retrieval  collage-аас *тухайн бүтээгдэхүүнийг* хайхад ижил label-тай бүтээгдэхүүн олдох чанар:
             whole   бүтэн collage-г нэг vector болгоно (YOLO-гүй, өмнөх үйлдэл)
             yolo    тухайн бүтээгдэхүүнийг агуулсан detection-ийг embed хийнэ
             oracle  бүтээгдэхүүний өөрийн зураг (дээд хязгаар: ердийн каталогийн хайлт)

Хязгаарлалт: collage нь студийн цагаан дэвсгэртэй зургуудын нийлбэр, жинхэнэ гэрэл зураг биш
(хүн өмссөн, олон давхар хувцас, бүдэг гэрэл байхгүй). Тиймээс үр дүн нь detector-ийн *нөлөөг*
хэмжинэ, жинхэнэ ашиглалтын нарийвчлалыг биш.
"""

from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from angel.core.config import get_settings
from angel.ingestion.cleaning import CleanProduct, load_catalog
from angel.ml.benchmark.encoders import FashionClipEncoder
from angel.ml.benchmark.retrieval import build_codes, score
from angel.ml.benchmark.runner import embed_catalogue
from angel.ml.fashion_clip import select_device
from angel.ml.localizer import Box, Region
from angel.ml.preprocess import load_image
from angel.ml.yolo import YoloGarmentLocalizer

# Collage-д оруулах төрөл ("slot") ба detector-ийн тэдгээрт тохирох анги.
SLOTS: dict[str, tuple[tuple[str, ...], frozenset[str]]] = {
    "top": (
        ("Tshirts", "Shirts", "Tops", "Sweatshirts", "Sweaters", "Jackets"),
        frozenset(
            {
                "top, t-shirt, sweatshirt",
                "shirt, blouse",
                "sweater",
                "cardigan",
                "jacket",
                "coat",
                "vest",
                "dress",
            }
        ),
    ),
    "bottom": (
        ("Jeans", "Trousers", "Shorts", "Skirts", "Track Pants"),
        frozenset({"pants", "shorts", "skirt", "tights, stockings"}),
    ),
    "shoes": (
        ("Casual Shoes", "Sports Shoes", "Heels", "Flats", "Formal Shoes"),
        frozenset({"shoe", "sock"}),
    ),
    "bag": (("Handbags", "Backpacks"), frozenset({"bag, wallet"})),
}
CELL = (300, 400)  # collage дахь нэг бүтээгдэхүүний зургийн хэмжээ (өргөн, өндөр)
MIN_OVERLAP = 0.5  # detection-ийн талбайн хэдэн хувь нь нүдэнд байвал тэр нүдний гэж үзэх вэ


@dataclass(frozen=True)
class Item:
    row: int  # каталогийн мөр
    slot: str
    cell: Box  # collage дахь байрлал (normalized)


def slot_of(product: CleanProduct) -> str | None:
    return next((s for s, (types, _) in SLOTS.items() if product.article_type in types), None)


def make_collage(
    products: list[CleanProduct], rows: list[int], slots: list[str], rng: np.random.Generator
) -> tuple[Image.Image, list[Item]]:
    """Бүтээгдэхүүний зургуудыг санамсаргүй өнгийн цайвар дэвсгэр дээр нэг эгнээнд нааж, нүд бүрийн
    байрлалыг буцаана."""
    shade = int(rng.integers(215, 256))
    canvas = Image.new("RGB", (CELL[0] * len(rows), CELL[1]), (shade, shade, shade))
    items: list[Item] = []
    for index, (row, slot) in enumerate(zip(rows, slots, strict=True)):
        photo = load_image(products[row].image_path, min_side=800).resize(CELL)
        canvas.paste(photo, (CELL[0] * index, 0))
        items.append(Item(row, slot, Box(index / len(rows), 0.0, (index + 1) / len(rows), 1.0)))
    return canvas, items


def cell_of(region: Region, items: list[Item]) -> Item | None:
    """Detection-ийн талбайн ихэнх нь орсон нүд (хоёр нүдийг дамарсан хайрцаг хэнийх ч биш)."""
    box = region.box
    for item in items:
        width = max(0.0, min(box.x1, item.cell.x1) - max(box.x0, item.cell.x0))
        height = max(0.0, min(box.y1, item.cell.y1) - max(box.y0, item.cell.y0))
        if box.area > 0 and width * height / box.area >= MIN_OVERLAP:
            return item
    return None


def pick_region(regions: list[Region], item: Item, items: list[Item]) -> Region | None:
    """Нүдэнд хамаарах detection-үүдээс тухайн төрөлд тохирох хамгийн итгэлтэйг, байхгүй бол
    нүдний хамгийн итгэлтэйг."""
    inside = [r for r in regions if r.label and cell_of(r, items) == item]
    if not inside:
        return None
    wanted = SLOTS[item.slot][1]
    right = [r for r in inside if r.label in wanted]
    return max(right or inside, key=lambda r: r.score)


def neighbours(
    embeddings: NDArray[np.float32], vector: NDArray[np.float32], exclude: int, k: int
) -> NDArray[np.int64]:
    similarity = embeddings @ vector
    similarity[exclude] = -np.inf  # бүтээгдэхүүн өөрийгөө олохгүй
    top = np.argpartition(-similarity, k)[:k]
    return top[np.argsort(-similarity[top])].astype(np.int64)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--collages", type=int, default=300)
    parser.add_argument("--items", default="2,3", help="collage бүрт хэдэн бүтээгдэхүүн (сонголт)")
    parser.add_argument("--limit", type=int, default=0, help="каталогийн санамсаргүй дэд хэсэг")
    parser.add_argument("--ks", default="5,10,20")
    parser.add_argument("--device", default="auto", choices=["auto", "mps", "cpu", "cuda"])
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--dataset", type=Path, default=None)
    parser.add_argument("--cache", type=Path, default=Path("../../docs/perf/embeddings"))
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()
    ks = sorted({int(k) for k in args.ks.split(",")})
    sizes = [int(n) for n in args.items.split(",")]
    device = select_device(args.device)

    dataset = (args.dataset or get_settings().dataset_dir or Path()).expanduser()
    products, _ = load_catalog(dataset / "styles.csv", dataset / "images")
    rng = np.random.default_rng(args.seed)
    if args.limit and args.limit < len(products):
        keep = np.sort(rng.choice(len(products), args.limit, replace=False))
        products = [products[i] for i in keep]
    codes = build_codes(
        [p.article_type for p in products],
        [p.base_colour for p in products],
        [p.gender for p in products],
    )
    by_slot: dict[str, list[int]] = {slot: [] for slot in SLOTS}
    for row, product in enumerate(products):
        if (slot := slot_of(product)) is not None:
            by_slot[slot].append(row)

    encoder = FashionClipEncoder(device)
    encoder.load()
    embedder = encoder._embedder
    catalogue = embed_catalogue(
        encoder, [p.image_path for p in products], mode="pad", root=args.cache
    )
    yolo = YoloGarmentLocalizer(device=device)
    yolo.load()

    targets: list[int] = []
    ranked: dict[str, list[NDArray[np.int64]]] = {"whole": [], "yolo": [], "oracle": []}
    found = {"any": 0, "right_class": 0, "total": 0}
    detections = {"regions": 0, "unassigned": 0, "images": 0}
    detect_ms: list[float] = []
    missed_per_slot = {slot: [0, 0] for slot in SLOTS}  # [илэрсэн, нийт]
    k = max(ks)
    for n in range(args.collages):
        count = int(rng.choice(sizes))
        slots = [str(s) for s in rng.choice(list(SLOTS), size=count, replace=False)]
        rows = [int(rng.choice(by_slot[slot])) for slot in slots]
        collage, items = make_collage(products, rows, slots, rng)
        started = time.perf_counter()
        regions = yolo.locate(collage)
        detect_ms.append((time.perf_counter() - started) * 1000)
        detections["images"] += 1
        detections["regions"] += len([r for r in regions if r.label])
        detections["unassigned"] += len(
            [r for r in regions if r.label and cell_of(r, items) is None]
        )
        whole_vector = embedder.embed_images([collage])[0]
        for item in items:
            region = pick_region(regions, item, items)
            found["total"] += 1
            missed_per_slot[item.slot][1] += 1
            if region is not None:
                found["any"] += 1
                missed_per_slot[item.slot][0] += 1
                found["right_class"] += region.label in SLOTS[item.slot][1]
                crop_vector = embedder.embed_images([region.image])[0]
            else:
                crop_vector = whole_vector  # detector хоосон: бүтэн зураг руу буцна
            targets.append(item.row)
            ranked["whole"].append(neighbours(catalogue, whole_vector, item.row, k))
            ranked["yolo"].append(neighbours(catalogue, crop_vector, item.row, k))
            ranked["oracle"].append(neighbours(catalogue, catalogue[item.row], item.row, k))
        if (n + 1) % 25 == 0:
            print(f"  {n + 1}/{args.collages} collages", flush=True)

    queries = np.asarray(targets, dtype=np.int64)
    retrieval = {name: score(codes, queries, np.stack(rows), ks) for name, rows in ranked.items()}
    report: dict[str, Any] = {
        "config": {
            "collages": args.collages,
            "targets": len(targets),
            "items_per_collage": sizes,
            "catalogue_size": len(products),
            "seed": args.seed,
            "device": str(device),
            "yolo": {"confidence": 0.25, "max_regions": 5, "padding": 0.05},
            "note": "synthetic collages of studio photos, see the script docstring",
        },
        "detector": {
            "recall_any_class": found["any"] / found["total"],
            "recall_right_class": found["right_class"] / found["total"],
            "recall_by_slot": {
                s: hit / max(total, 1) for s, (hit, total) in missed_per_slot.items()
            },
            "regions_per_image": detections["regions"] / detections["images"],
            "regions_outside_any_item": detections["unassigned"] / detections["images"],
            "detect_ms_p50": float(np.percentile(detect_ms, 50)),
            "detect_ms_p95": float(np.percentile(detect_ms, 95)),
        },
        "retrieval": retrieval,
    }
    for name in ("whole", "yolo", "oracle"):
        top = retrieval[name]["category"]["10"]
        print(
            f"{name:7s} category mAP@10={top['mAP']:.3f}  "
            f"P@10={top['P']:.3f}  hit={top['hit_rate']:.3f}"
        )
    print(json.dumps(report["detector"], indent=2))
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(report, indent=2) + "\n")
        print(f"written {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
