"""Stage-3 charts: data/report/findings.png (one tall image, readable on a phone)."""
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from sleepwatch.features import binned, load_nights  # noqa: E402

BLUE, ORANGE = "#2a78d6", "#eb6834"
INK, MUTED, GRID, SURFACE = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"


def he(s: str) -> str:
    """matplotlib has no bidi support: reverse pure-Hebrew strings so they read right-to-left."""
    return s[::-1]


def style(ax, title):
    ax.set_facecolor(SURFACE)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(GRID)
    ax.tick_params(colors=MUTED, labelsize=10, length=0)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.set_title(title, loc="right", fontsize=14, color=INK, pad=12)


def main() -> None:
    df = load_nights(ROOT / "data" / "nights.csv")
    out = ROOT / "data" / "report"
    out.mkdir(parents=True, exist_ok=True)
    plt.rcParams["font.family"] = "Arial"
    fig, axes = plt.subplots(3, 1, figsize=(7, 13), facecolor=SURFACE)

    # 1. score by sleep duration
    edges = [0, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 10, 13]
    b = binned(df, "sleep_h", edges)
    labels = ["<5", "5-6", "6-6.5", "6.5-7", "7-7.5", "7.5-8", "8-8.5", "8.5-9", "9-10", "10+"]
    ax = axes[0]
    style(ax, he("ציון ממוצע לפי שעות שינה"))
    x = np.arange(len(b))
    ax.bar(x, b["mean"], width=0.7, color=BLUE)
    for xi, v in zip(x, b["mean"]):
        ax.text(xi, v + 1, f"{v:.0f}", ha="center", fontsize=9, color=INK)
    ax.set_xticks(x, labels, rotation=0, fontsize=9)
    ax.set_ylim(0, 100)
    ax.set_xlabel(he("שעות שינה"), color=MUTED)

    # 2. score by bedtime: all nights vs nights with 7-9h sleep
    edges = [18, 23.5, 24, 24.5, 25, 25.5, 26, 27, 30]
    labels = ["<23:30", "23:30", "00:00", "00:30", "01:00", "01:30", "02:00", "03:00+"]
    allb = binned(df, "onset_h", edges)
    okb = binned(df[(df.sleep_h >= 7) & (df.sleep_h <= 9)], "onset_h", edges)
    ax = axes[1]
    style(ax, he("ציון לפי שעת הירדמות"))
    x = np.arange(len(allb))
    ax.bar(x - 0.19, allb["mean"], width=0.36, color=BLUE, label=he("כל הלילות"))
    ax.bar(x + 0.19, okb["mean"], width=0.36, color=ORANGE, label=he("רק לילות עם שינה מספקת"))
    ax.set_xticks(x, labels, fontsize=9)
    ax.set_ylim(0, 112)
    ax.set_yticks(range(0, 101, 20))
    ax.legend(loc="upper right", bbox_to_anchor=(1, 1.02), ncol=2, frameon=False, fontsize=10,
              labelcolor=INK)
    ax.set_xlabel(he("שעת הירדמות"), color=MUTED)

    # 3. monthly average score
    m = df.resample("MS")["score"].mean()
    ax = axes[2]
    style(ax, he("ציון ממוצע לפי חודש"))
    ax.plot(m.index, m.values, color=BLUE, linewidth=2, marker="o", markersize=7,
            markeredgecolor=SURFACE, markeredgewidth=2)
    ax.set_ylim(60, 95)
    ax.xaxis.set_major_formatter(matplotlib.dates.DateFormatter("%m/%y"))
    ax.tick_params(axis="x", labelsize=9)

    fig.tight_layout(h_pad=3)
    path = out / "findings.png"
    fig.savefig(path, dpi=130, facecolor=SURFACE)
    print(path)


if __name__ == "__main__":
    main()
