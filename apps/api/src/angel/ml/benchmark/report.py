"""Харьцуулалтын үр дүнг diplomын ажилд хуулж болох markdown ба LaTeX хүснэгт болгох."""

from typing import Any

from angel.ml.benchmark.retrieval import LEVELS

Report = dict[str, Any]

_LEVEL_NAMES = {"category": "category", "colour": "colour", "strict": "strict"}


def _metric(report: Report, model: str, level: str, name: str, k: int) -> float:
    return float(report["models"][model]["metrics"][level][str(k)][name])


def _baseline(report: Report, level: str, name: str, k: int) -> float:
    return float(report["random_baseline"][level][str(k)][name])


def _stars(report: Report, model: str, level: str) -> str:
    """Reference загвараас *статистик чухал* өөр бол тэмдэг: завсар 0-г агуулахгүй."""
    row = report.get("significance", {}).get(model, {}).get(level)
    if not row or row["n"] == 0:
        return ""
    return "*" if row["ci_low"] > 0 or row["ci_high"] < 0 else ""


def _latency(report: Report, model: str, batch: str = "32") -> float:
    return float(report["models"][model]["latency"][batch]["per_image_ms"])


def render_markdown(report: Report, k: int = 10) -> str:
    models = list(report["models"])
    reference = report["config"]["reference"]
    lines = [
        "| Model | Dim | Vision params (M) | ms/image (batch 32) | "
        + " | ".join(f"mAP@{k} {_LEVEL_NAMES[lv]}" for lv in LEVELS)
        + f" | P@{k} category | nDCG@{k} category |",
        "|" + "---|" * (6 + len(LEVELS)),
    ]
    for model in models:
        info = report["models"][model]
        cells = [
            f"{_metric(report, model, lv, 'mAP', k):.3f}{_stars(report, model, lv)}"
            for lv in LEVELS
        ]
        lines.append(
            f"| {model} | {info['dimension']} | {info['vision_params_m']:.1f} | "
            f"{_latency(report, model):.1f} | {' | '.join(cells)} | "
            f"{_metric(report, model, 'category', 'P', k):.3f} | "
            f"{_metric(report, model, 'category', 'nDCG', k):.3f} |"
        )
    random_cells = [f"{_baseline(report, lv, 'mAP', k):.3f}" for lv in LEVELS]
    lines.append(
        f"| random ranking | - | - | - | {' | '.join(random_cells)} | "
        f"{_baseline(report, 'category', 'P', k):.3f} | "
        f"{_baseline(report, 'category', 'nDCG', k):.3f} |"
    )
    lines.append("")
    lines.append(
        f"`*` = the 95% paired-bootstrap interval of the mAP@{k} difference to `{reference}` "
        f"excludes 0. {report['config']['queries']} queries over "
        f"{report['config']['catalogue_size']} products."
    )
    return "\n".join(lines) + "\n"


def render_latex(report: Report, k: int = 10) -> str:
    models = list(report["models"])
    columns = "l" + "r" * (2 + len(LEVELS) + 1)
    header = " & ".join(
        ["Model", "Dim", "ms/img"]
        + [f"mAP@{k} {_LEVEL_NAMES[lv]}" for lv in LEVELS]
        + [f"nDCG@{k}"]
    )
    rows = []
    for model in models:
        cells = [
            f"{_metric(report, model, lv, 'mAP', k):.3f}"
            + _stars(report, model, lv).replace("*", "$^{*}$")
            for lv in LEVELS
        ]
        rows.append(
            " & ".join(
                [
                    model.replace("_", r"\_"),
                    str(report["models"][model]["dimension"]),
                    f"{_latency(report, model):.1f}",
                    *cells,
                    f"{_metric(report, model, 'category', 'nDCG', k):.3f}",
                ]
            )
            + r" \\"
        )
    random_cells = [f"{_baseline(report, lv, 'mAP', k):.3f}" for lv in LEVELS]
    rows.append(
        " & ".join(
            ["random", "--", "--", *random_cells, f"{_baseline(report, 'category', 'nDCG', k):.3f}"]
        )
        + r" \\"
    )
    return "\n".join(
        [
            rf"\begin{{tabular}}{{{columns}}}",
            r"\toprule",
            header + r" \\",
            r"\midrule",
            *rows,
            r"\bottomrule",
            r"\end{tabular}",
            "",
        ]
    )
