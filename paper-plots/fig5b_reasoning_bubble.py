"""
Figure 5b: Reasoning Effort - Bubble Plot
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
from pathlib import Path

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
    "annotation": 11,
    "legend": 10,
}

BACKGROUND = "white"
FIGURE_SIZE = (8, 6)
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

    fig, ax = plt.subplots(figsize=FIGURE_SIZE)
    fig.patch.set_facecolor(bg_color)
    ax.set_facecolor(bg_color)

    min_tokens = df["tokens"].min()
    max_tokens = df["tokens"].max()
    bubble_sizes = 200 + 600 * (df["tokens"] - min_tokens) / (max_tokens - min_tokens)

    ax.scatter(
        df["time_hours"],
        df["score"],
        s=bubble_sizes,
        c=COLORS["accent_primary"],
        alpha=0.7,
        edgecolors=COLORS["accent_primary"],
        linewidths=2,
        zorder=3,
    )

    ax.errorbar(
        df["time_hours"], df["score"],
        xerr=df["time_std_hours"],
        yerr=df["score_std"],
        fmt="none",
        ecolor=COLORS["text_secondary"],
        elinewidth=1.5,
        capsize=4,
        capthick=1.5,
        zorder=2,
    )

    offsets = {
        "Low": (0.08, -0.8),
        "Medium": (0.08, 0.8),
        "High": (0.08, 0.8),
    }
    for _, row in df.iterrows():
        offset = offsets.get(row["effort"], (0.08, 0.5))
        ha = "left" if offset[0] > 0 else "right"
        ax.annotate(
            f"{row['effort']}\n({row['tokens']/1e6:.1f}M tokens)",
            (row["time_hours"], row["score"]),
            xytext=(row["time_hours"] + offset[0], row["score"] + offset[1]),
            fontsize=FONT_SIZES["annotation"],
            color=COLORS["text_primary"],
            ha=ha,
            va="center",
        )

    ax.set_xlabel("Time (hours)", color=COLORS["text_primary"], fontweight="medium")
    ax.set_ylabel("Score (%)", color=COLORS["text_primary"], fontweight="medium")

    ax.set_xlim(3, 6.5)
    ax.set_ylim(12, 25)

    ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f"{x:.0f}h"))
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda y, p: f"{y:.0f}%"))

    ax.tick_params(axis="x", colors=COLORS["text_secondary"])
    ax.tick_params(axis="y", colors=COLORS["text_secondary"])

    ax.yaxis.grid(True, color=COLORS["border_color"], linestyle="-", linewidth=0.8, zorder=1)
    ax.xaxis.grid(True, color=COLORS["border_color"], linestyle="-", linewidth=0.8, zorder=1)
    ax.set_axisbelow(True)

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(COLORS["border_color"])
    ax.spines["bottom"].set_color(COLORS["border_color"])
    ax.spines["left"].set_linewidth(0.8)
    ax.spines["bottom"].set_linewidth(0.8)

    ax.text(
        0.98, 0.02,
        "Bubble size = tokens used",
        transform=ax.transAxes,
        fontsize=FONT_SIZES["legend"],
        color=COLORS["text_secondary"],
        ha="right",
        va="bottom",
        style="italic",
    )

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

    output_path = OUTPUT_DIR / "fig5b_reasoning_bubble"
    create_figure(df, output_path, background=BACKGROUND)

    print("\nDone!")


if __name__ == "__main__":
    main()
