"""
Figure 3: Time Budget Ablation Study for PostTrainBench
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
    "axis_label": 14,
    "axis_title": 15,
    "tick_label": 12,
    "legend": 13.5,
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
    "border_color": "#d9d4c8",
}

MODEL_STYLES = {
    "Claude Opus 4.5": {"color": "#a66b4f", "marker": "D"},
    "GPT-5.1 Codex Max": {"color": "#5a8f7a", "marker": "s"},
    "Gemini 3 Pro": {"color": "#4a7a9a", "marker": "^"},
}

SCRIPT_DIR = Path(__file__).parent
DATA_PATH = SCRIPT_DIR / "data" / "fig3_time_budget_ablation.csv"
OUTPUT_DIR = SCRIPT_DIR / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)


def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath)
    df["ScorePercent"] = df["Score"] * 100
    return df


def get_available_font(font_style: str) -> str:
    available_fonts = {f.name for f in fm.fontManager.ttflist}
    for font in FONT_FALLBACKS[font_style]:
        if font in available_fonts or font in ["serif", "sans-serif", "monospace"]:
            return font
    return font_style


def create_figure(df: pd.DataFrame, save_path: Path, background: str = "sepia") -> None:
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

    for model_name, style in MODEL_STYLES.items():
        model_data = df[df["Model"] == model_name].sort_values("TimeBudget")

        ax.plot(
            model_data["TimeBudget"],
            model_data["ScorePercent"],
            color=style["color"],
            marker=style["marker"],
            markersize=8,
            linewidth=2,
            label=model_name,
            zorder=3,
        )

    ax.set_xlabel("Time Budget (hours)", color=COLORS["text_primary"], fontweight="medium")
    ax.set_ylabel("Average Performance (%)", color=COLORS["text_primary"], fontweight="medium")

    ax.set_xticks([1, 2, 5, 10])
    ax.set_xticklabels(["1h", "2h", "5h", "10h"])

    y_min = df["ScorePercent"].min()
    y_max = df["ScorePercent"].max()
    y_padding = (y_max - y_min) * 0.1
    ax.set_ylim(y_min - y_padding, y_max + y_padding)

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

    legend = ax.legend(
        loc="lower right",
        frameon=True,
        fancybox=False,
        edgecolor=COLORS["border_color"],
        facecolor=bg_color,
        fontsize=FONT_SIZES["legend"],
    )
    legend.get_frame().set_linewidth(0.8)

    plt.tight_layout()

    for fmt in ["pdf", "png"]:
        output_path = save_path.with_suffix(f".{fmt}")
        fig.savefig(str(output_path), facecolor=bg_color, edgecolor="none")
        print(f"Saved: {output_path}")

    plt.close(fig)


def main():
    print(f"Loading data from: {DATA_PATH}")
    df = load_data(DATA_PATH)
    print(f"Loaded {len(df)} data points")
    print(df.to_string(index=False))
    print(f"\nBackground style: {BACKGROUND}")
    print()

    output_path = OUTPUT_DIR / "fig3_time_budget_ablation"
    create_figure(df, output_path, background=BACKGROUND)

    print("\nDone!")


if __name__ == "__main__":
    main()
