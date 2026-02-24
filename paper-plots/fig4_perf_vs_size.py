"""
Figure 4: Performance vs Model Size for Claude Models
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import matplotlib.font_manager as fm
import numpy as np
from pathlib import Path

FONT_STYLE = "monospace"

FONT_FALLBACKS = {
    "serif": ["CMU Serif", "Computer Modern", "Times New Roman", "DejaVu Serif", "serif"],
    "sans-serif": ["Manrope", "Inter", "Helvetica", "DejaVu Sans", "sans-serif"],
    "monospace": ["JetBrains Mono", "Fira Code", "Consolas", "DejaVu Sans Mono", "monospace"],
}

FONT_SIZES = {
    "axis_label": 12,
    "axis_title": 14,
    "tick_label": 11,
    "bar_label": 9,
}

BACKGROUND = "white"
FIGURE_SIZE = (7, 5)
OUTPUT_DPI = 300

COLORS = {
    "bg_sepia": "#faf8f3",
    "bg_white": "#ffffff",
    "text_primary": "#2d2a23",
    "text_secondary": "#6b655a",
    "accent_primary": "#a66b4f",
    "border_color": "#d9d4c8",
}

SCRIPT_DIR = Path(__file__).parent
DATA_PATH = SCRIPT_DIR / "data" / "fig4_perf_vs_size.csv"
OUTPUT_DIR = SCRIPT_DIR / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)


def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath)
    df.columns = df.columns.str.strip()
    df["agent"] = df["agent"].str.strip()
    return df


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
        "axes.titlesize": FONT_SIZES["axis_title"],
        "xtick.labelsize": FONT_SIZES["tick_label"],
        "ytick.labelsize": FONT_SIZES["tick_label"],
        "figure.dpi": 150,
        "savefig.dpi": OUTPUT_DPI,
        "savefig.bbox": "tight",
        "savefig.pad_inches": 0.15,
    })

    fig, ax = plt.subplots(figsize=FIGURE_SIZE)
    fig.patch.set_facecolor(bg_color)
    ax.set_facecolor(bg_color)

    x_pos = np.arange(len(df))

    bars = ax.bar(
        x_pos,
        df["score"],
        color=COLORS["accent_primary"],
        edgecolor=COLORS["accent_primary"],
        linewidth=1.5,
        width=0.6,
        zorder=3,
    )

    for bar in bars:
        bar.set_linewidth(0)
        x = bar.get_x()
        y = bar.get_y()
        w = bar.get_width()
        h = bar.get_height()
        radius = min(w * 0.15, 0.08)

        rounded_bar = mpatches.FancyBboxPatch(
            (x, y), w, h,
            boxstyle=f"round,pad=0,rounding_size={radius}",
            facecolor=bar.get_facecolor(),
            edgecolor=bar.get_facecolor(),
            linewidth=1.5,
            zorder=3,
        )
        ax.add_patch(rounded_bar)
        bar.set_visible(False)

    for x, score in zip(x_pos, df["score"]):
        ax.text(
            x, 1.0,
            f"{score:.1f}%",
            ha="center",
            va="bottom",
            fontsize=FONT_SIZES["bar_label"],
            color="#ffffff",
            fontweight="bold",
            zorder=5,
        )

    ax.set_xticks(x_pos)
    ax.set_xticklabels(df["agent"], color=COLORS["text_secondary"])

    ax.set_ylabel("Average Performance (%)", color=COLORS["text_primary"], fontweight="medium")
    ax.set_xlabel("Model Size", color=COLORS["text_primary"], fontweight="medium")

    max_val = df["score"].max()
    ax.set_ylim(0, max_val * 1.1)
    y_ticks = [t for t in range(0, int(max_val) + 5, 5)]
    ax.set_yticks(y_ticks)
    ax.set_yticklabels([f"{t}%" for t in y_ticks], color=COLORS["text_secondary"])

    ax.yaxis.grid(True, color=COLORS["border_color"], linestyle="-", linewidth=0.8, zorder=1)
    ax.xaxis.grid(False)
    ax.set_axisbelow(True)

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(COLORS["border_color"])
    ax.spines["bottom"].set_color(COLORS["border_color"])
    ax.spines["left"].set_linewidth(0.8)
    ax.spines["bottom"].set_linewidth(0.8)

    ax.tick_params(axis="x", colors=COLORS["text_secondary"], length=0)
    ax.tick_params(axis="y", colors=COLORS["text_secondary"], length=4, width=0.8)

    plt.tight_layout()

    for fmt in ["pdf", "png"]:
        output_path = save_path.with_suffix(f".{fmt}")
        fig.savefig(str(output_path), facecolor=bg_color, edgecolor="none")
        print(f"Saved: {output_path}")

    plt.close(fig)


def main():
    print(f"Loading data from: {DATA_PATH}")
    df = load_data(DATA_PATH)
    print(f"Loaded {len(df)} models")
    print(df.to_string(index=False))
    print(f"\nBackground style: {BACKGROUND}")
    print()

    output_path = OUTPUT_DIR / "fig4_perf_vs_size"
    create_figure(df, output_path, background=BACKGROUND)

    print("\nDone!")


if __name__ == "__main__":
    main()
