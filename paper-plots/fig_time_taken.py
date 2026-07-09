"""
Figure: Time Taken by Agents (horizontal bar plot)

Same visual style / colors as fig1_leaderboard.py. Shows the wall-clock time
each CLI agent spent, sorted longest -> shortest. Reprompted runs are hatched
and marked with a dagger. Uses the same set of agents as the main leaderboard
(fig1); agents without time data are omitted.
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
    "axis_label": 11,
    "axis_title": 12,
    "tick_label": 11,
    "bar_label": 12,
    "name_label": 12,
    "scaffold_label": 9.5,
    "footnote": 10,
}

BACKGROUND = "cream"  # Options: "white", "sepia", "cream"
FIGURE_SIZE = (18, 7)
OUTPUT_DPI = 300

COLORS = {
    "bg_sepia": "#faf8f3",
    "bg_white": "#ffffff",
    "bg_cream": "#f6f0e5",
    "text_primary": "#2d2a23",
    "text_secondary": "#6b655a",
    "accent_primary": "#a66b4f",
    "border_color": "#d9d4c8",
    "baseline_color": "#9a9590",
}

SCRIPT_DIR = Path(__file__).parent
DATA_PATH = SCRIPT_DIR / "data" / "fig_time_taken.csv"
OUTPUT_DIR = SCRIPT_DIR / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)


def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath)
    df["Hours"] = pd.to_numeric(df["Hours"], errors="coerce")
    df["StdHours"] = pd.to_numeric(df.get("StdHours"), errors="coerce")
    df["Reprompted"] = df["Reprompted"].fillna(0).astype(int)
    return df


def get_available_font(font_style: str) -> str:
    available_fonts = {f.name for f in fm.fontManager.ttflist}
    for font in FONT_FALLBACKS[font_style]:
        if font in available_fonts or font in ["serif", "sans-serif", "monospace"]:
            return font
    return font_style


def create_figure(df: pd.DataFrame, save_path: Path, background: str = "cream") -> None:
    bg_color = {
        "sepia": COLORS["bg_sepia"],
        "cream": COLORS["bg_cream"],
        "white": COLORS["bg_white"],
    }.get(background, COLORS["bg_white"])

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
        "savefig.pad_inches": 0.2,
    })

    fig, ax = plt.subplots(figsize=FIGURE_SIZE)
    fig.patch.set_facecolor(bg_color)
    ax.set_facecolor(bg_color)

    # Sort longest -> shortest. barh puts index 0 at the bottom, so plot the
    # sorted-ascending frame and the longest bar lands on top.
    df_plot = df.sort_values("Hours", ascending=True).reset_index(drop=True)
    y_pos = np.arange(len(df_plot))

    max_val = df_plot["Hours"].max()
    x_right = int(np.ceil(max_val / 2) * 2)  # round up to even number of hours
    ax.set_xlim(0, x_right + 0.5)
    ax.set_ylim(-0.7, len(df_plot) - 0.3)

    bar_height = 0.62
    for y, (_, row) in zip(y_pos, df_plot.iterrows()):
        h = row["Hours"]
        std = row["StdHours"]
        is_reprompted = bool(row["Reprompted"])
        radius = min(bar_height * 0.18, h * 0.04)

        rounded_bar = mpatches.FancyBboxPatch(
            (0, y - bar_height / 2), h, bar_height,
            boxstyle=f"round,pad=0,rounding_size={radius}",
            facecolor=COLORS["accent_primary"],
            edgecolor=COLORS["accent_primary"],
            linewidth=1.5,
            mutation_aspect=0.35,
            zorder=3,
        )
        ax.add_patch(rounded_bar)

        if is_reprompted:
            hatch_overlay = mpatches.Rectangle(
                (0, y - bar_height / 2), h, bar_height,
                facecolor="none",
                edgecolor="#ffffff",
                linewidth=0,
                hatch="/////",
                alpha=0.55,
                zorder=4,
            )
            ax.add_patch(hatch_overlay)

        # Horizontal error bar at the bar end (if std is available)
        label_x = h
        if pd.notna(std) and std > 0:
            ax.errorbar(
                h, y, xerr=std,
                fmt="none",
                ecolor="#704028",
                elinewidth=1.5,
                capsize=4,
                capthick=1.5,
                zorder=4,
            )
            label_x = h + std

        # Value label to the right of the bar (past the error cap when present)
        ax.text(
            label_x + x_right * 0.012, y,
            f"{h:.1f} h",
            ha="left", va="center",
            fontsize=FONT_SIZES["bar_label"],
            color=COLORS["text_primary"],
            fontweight="bold",
            zorder=5,
        )

    # Two-line left labels: bold agent name + grey scaffold subtitle.
    ax.set_yticks([])
    for y, (_, row) in zip(y_pos, df_plot.iterrows()):
        dagger = "$^\\dagger$" if bool(row["Reprompted"]) else ""
        name = f"{row['Label']}{dagger}"
        ax.text(
            -x_right * 0.015, y + 0.14, name,
            ha="right", va="center",
            fontsize=FONT_SIZES["name_label"],
            color=COLORS["text_primary"],
            fontweight="bold",
            zorder=5,
        )
        ax.text(
            -x_right * 0.015, y - 0.20, row["Scaffold"],
            ha="right", va="center",
            fontsize=FONT_SIZES["scaffold_label"],
            color=COLORS["text_secondary"],
            alpha=0.8,
            zorder=5,
        )

    # X axis: hour ticks with dashed vertical gridlines
    x_ticks = list(range(0, x_right + 1, 2))
    ax.set_xticks(x_ticks)
    ax.set_xticklabels([f"{t}h" for t in x_ticks], color=COLORS["text_secondary"])
    ax.xaxis.grid(True, color=COLORS["border_color"], linestyle="--", linewidth=0.9, zorder=1)
    ax.yaxis.grid(False)
    ax.set_axisbelow(True)

    for spine in ax.spines.values():
        spine.set_visible(False)

    ax.tick_params(axis="x", colors=COLORS["text_secondary"], length=0, pad=6)
    ax.tick_params(axis="y", length=0)

    # Footnote (only if there is a reprompted run in the data)
    if df_plot["Reprompted"].any():
        fig.text(
            0.02, 0.01,
            "$\\dagger$Reprompted run after agent gives up",
            ha="left", va="bottom",
            fontsize=FONT_SIZES["footnote"],
            color=COLORS["text_secondary"],
            fontstyle="italic",
        )

    plt.tight_layout(rect=(0, 0.03, 1, 1))

    for fmt in ["pdf", "png"]:
        output_path = save_path.with_suffix(f".{fmt}")
        fig.savefig(str(output_path), facecolor=bg_color, edgecolor="none")
        print(f"Saved: {output_path}")

    plt.close(fig)


def main():
    print(f"Loading data from: {DATA_PATH}")
    df = load_data(DATA_PATH)
    print(f"Loaded {len(df)} agents")
    print(df.to_string(index=False))
    print(f"\nBackground style: {BACKGROUND}")
    print()

    output_path = OUTPUT_DIR / "fig_time_taken"
    create_figure(df, output_path, background=BACKGROUND)

    print("\nDone!")


if __name__ == "__main__":
    main()
