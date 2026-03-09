"""
Figure 5a: Reasoning Effort - Dual Axis Plot
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.font_manager as fm
import numpy as np
from pathlib import Path
from matplotlib.lines import Line2D

FONT_STYLE = "monospace"

FONT_FALLBACKS = {
    "serif": ["CMU Serif", "Computer Modern", "Times New Roman", "DejaVu Serif", "serif"],
    "sans-serif": ["Manrope", "Inter", "Helvetica", "DejaVu Sans", "sans-serif"],
    "monospace": ["JetBrains Mono", "Fira Code", "Consolas", "DejaVu Sans Mono", "monospace"],
}

FONT_SIZES = {
    "axis_label": 12,
    "axis_title": 13,
    "tick_label": 10,
    "bar_label": 9,
    "legend": 10,
}

BACKGROUND = "white"
FIGURE_SIZE = (8, 5)
OUTPUT_DPI = 300

COLORS = {
    "bg_sepia": "#faf8f3",
    "bg_white": "#ffffff",
    "text_primary": "#2d2a23",
    "text_secondary": "#6b655a",
    "accent_primary": "#a66b4f",
    "accent_secondary": "#3d3832",
    "border_color": "#d9d4c8",
}

SCRIPT_DIR = Path(__file__).parent
DATA_PATH = SCRIPT_DIR / "data" / "fig5_reasoning_effort.csv"
OUTPUT_DIR = SCRIPT_DIR / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)


def load_data(filepath: Path) -> pd.DataFrame:
    return pd.read_csv(filepath)


def get_available_font(font_style: str) -> str:
    available_fonts = {f.name for f in fm.fontManager.ttflist}
    for font in FONT_FALLBACKS[font_style]:
        if font in available_fonts or font in ["serif", "sans-serif", "monospace"]:
            return font
    return font_style


def create_figure(df: pd.DataFrame, save_path: Path, background: str = "white") -> None:
    bg_color = COLORS["bg_sepia"] if background == "sepia" else COLORS["bg_white"]

    font_name = get_available_font(FONT_STYLE)
    print(f"Using font: {font_name}")

    plt.rcParams.update({
        "font.family": font_name,
        "font.size": FONT_SIZES["axis_label"],
        "axes.labelsize": FONT_SIZES["axis_title"],
        "xtick.labelsize": FONT_SIZES["tick_label"],
        "ytick.labelsize": FONT_SIZES["tick_label"],
        "figure.dpi": 150,
        "savefig.dpi": OUTPUT_DPI,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.15,
    })

    fig, ax1 = plt.subplots(figsize=FIGURE_SIZE)
    fig.patch.set_facecolor(bg_color)
    ax1.set_facecolor(bg_color)

    x_pos = np.arange(len(df))
    bar_width = 0.5

    bars = ax1.bar(
        x_pos,
        df["score"],
        width=bar_width,
        color=COLORS["accent_primary"],
        edgecolor=COLORS["accent_primary"],
        linewidth=1.5,
        zorder=3,
        label="Score",
    )

    for bar in bars:
        bar.set_linewidth(0)
        x, y, w, h = bar.get_x(), bar.get_y(), bar.get_width(), bar.get_height()
        radius = min(w * 0.15, 0.08)
        rounded_bar = mpatches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle=f"round,pad=0,rounding_size={radius}",
            facecolor=bar.get_facecolor(),
            edgecolor=bar.get_facecolor(),
            linewidth=1.5,
            zorder=3,
        )
        ax1.add_patch(rounded_bar)
        bar.set_visible(False)

    ax1.errorbar(
        x_pos, df["score"], yerr=df["score_std"],
        fmt="none",
        ecolor="#704028",
        elinewidth=2,
        capsize=5,
        capthick=2,
        zorder=4,
    )

    for x, score in zip(x_pos, df["score"]):
        ax1.text(
            x, 1.5,
            f"{score:.1f}%",
            ha="center",
            va="bottom",
            fontsize=FONT_SIZES["bar_label"],
            color="#ffffff",
            fontweight="bold",
            zorder=5,
        )

    ax1.set_ylabel("Score (%)", color=COLORS["accent_primary"], fontweight="medium")
    ax1.tick_params(axis="y", labelcolor=COLORS["accent_primary"])
    ax1.set_ylim(0, 25)

    ax2 = ax1.twinx()
    ax2.set_facecolor("none")

    ax2.plot(
        x_pos,
        df["time_hours"],
        color=COLORS["accent_secondary"],
        marker="o",
        markersize=10,
        linewidth=2.5,
        zorder=6,
        label="Time",
    )

    ax2.errorbar(
        x_pos, df["time_hours"], yerr=df["time_std_hours"],
        fmt="none",
        ecolor="#7a756d",
        elinewidth=1.8,
        capsize=5,
        capthick=1.8,
        zorder=7,
    )

    ax2.set_ylabel("Time (hours)", color=COLORS["accent_secondary"], fontweight="medium")
    ax2.tick_params(axis="y", labelcolor=COLORS["accent_secondary"])
    ax2.set_ylim(0, 7)

    ax1.set_xticks(x_pos)
    ax1.set_xticklabels(df["effort"], color=COLORS["text_secondary"])
    ax1.set_xlabel("Reasoning Effort", color=COLORS["text_primary"], fontweight="medium")

    ax1.yaxis.grid(True, color=COLORS["border_color"], linestyle="-", linewidth=0.8, zorder=1)
    ax1.set_axisbelow(True)

    ax1.spines["top"].set_visible(False)
    ax1.spines["left"].set_color(COLORS["accent_primary"])
    ax1.spines["bottom"].set_color(COLORS["border_color"])
    ax1.spines["right"].set_color(COLORS["accent_secondary"])
    ax2.spines["top"].set_visible(False)
    ax2.spines["right"].set_color(COLORS["accent_secondary"])

    legend_elements = [
        mpatches.Patch(facecolor=COLORS["accent_primary"], label="Score (%)"),
        Line2D([0], [0], color=COLORS["accent_secondary"], marker="o", markersize=8, linewidth=2, label="Time (hours)"),
    ]
    ax1.legend(handles=legend_elements, loc="upper left", frameon=True,
               facecolor=bg_color, edgecolor=COLORS["border_color"],
               fontsize=FONT_SIZES["legend"])

    plt.tight_layout()

    for fmt in ["pdf", "png"]:
        output_path = save_path.with_suffix(f".{fmt}")
        fig.savefig(str(output_path), facecolor=bg_color, edgecolor="none")
        print(f"Saved: {output_path}")

    plt.close(fig)


def main():
    print(f"Loading data from: {DATA_PATH}")
    df = load_data(DATA_PATH)
    print(df.to_string(index=False))
    print(f"\nBackground style: {BACKGROUND}")
    print()

    output_path = OUTPUT_DIR / "fig5a_reasoning_dual_axis"
    create_figure(df, output_path, background=BACKGROUND)

    print("\nDone!")


if __name__ == "__main__":
    main()
