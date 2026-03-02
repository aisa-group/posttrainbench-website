"""
Figure 2: Time vs Performance Scatter Plot 
"""

import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
from adjustText import adjust_text
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
    "tick_label": 10,
    "annotation": 10.5,
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
    "baseline_color": "#6b655a",
}

FAMILY_COLORS = {
    "OpenAI": "#5a8f7a",
    "Anthropic": "#a66b4f",
    "Google": "#4a7a9a",
    "OpenCode": "#7a6a8a",
}

FAMILY_MARKERS = {
    "OpenAI": "s",
    "Anthropic": "D",
    "Google": "^",
    "OpenCode": "o",
}


def get_agent_family(agent_name: str) -> str:
    agent_lower = agent_name.lower()
    if "gpt" in agent_lower or "codex" in agent_lower:
        return "OpenAI"
    elif "opus" in agent_lower or "sonnet" in agent_lower or "claude" in agent_lower:
        return "Anthropic"
    elif "gemini" in agent_lower:
        return "Google"
    elif "glm" in agent_lower or "minimax" in agent_lower or "kimi" in agent_lower:
        return "OpenCode"
    return "Other"


SCRIPT_DIR = Path(__file__).parent
DATA_PATH = SCRIPT_DIR / "data" / "fig2_time_vs_performance.csv"
OUTPUT_DIR = SCRIPT_DIR / "figures"
OUTPUT_DIR.mkdir(exist_ok=True)


def time_to_hours(time_str: str) -> float:
    if pd.isna(time_str) or time_str == "":
        return np.nan
    parts = time_str.split(":")
    hours = int(parts[0])
    minutes = int(parts[1])
    seconds = int(parts[2])
    return hours + minutes / 60 + seconds / 3600


def load_data(filepath: Path) -> pd.DataFrame:
    df = pd.read_csv(filepath)
    df["AvgTimeHours"] = df["AvgTime"].apply(time_to_hours)
    df["StdTimeHours"] = df["StdTime"].apply(time_to_hours)
    df["StdPerf"] = pd.to_numeric(df["StdPerf"], errors="coerce")
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

    # Manual nudges applied AFTER adjustText (in data coordinates: dx_hours, dy_percent)
    # Edit these to fine-tune individual label positions
    MANUAL_NUDGES = {
        # "Agent Name": (dx, dy),
        "MiniMax M2.5": (0.0, -1.0),
        "Sonnet 4.6": (0.0, -1.5)
    }

    texts = []
    text_names = []
    for _, row in df.iterrows():
        x = row["AvgTimeHours"]
        y = row["AvgPerf"]
        family = get_agent_family(row["Agent"])
        color = FAMILY_COLORS.get(family, COLORS["accent_primary"])
        marker = FAMILY_MARKERS.get(family, "o")

        ax.scatter(
            x, y,
            s=100,
            color=color,
            edgecolor=color,
            marker=marker,
            linewidth=1.5,
            zorder=3,
        )

        texts.append(ax.text(
            x + 0.2, y + 0.4, row["Agent"],
            fontsize=FONT_SIZES["annotation"],
            color=COLORS["text_primary"],
        ))
        text_names.append(row["Agent"])

    x_points = df["AvgTimeHours"].tolist()
    y_points = df["AvgPerf"].tolist()

    adjust_text(
        texts, ax=ax,
        x=x_points, y=y_points,
        force_text=(0.8, 0.8),
        force_points=(1.5, 1.5),
        expand=(1.4, 1.4),
        expand_points=(2.5, 2.5),
        ensure_inside_axes=True,
    )

    # Print label positions for manual tweaking
    print("\nLabel positions after adjustText:")
    for text, name in zip(texts, text_names):
        tx, ty = text.get_position()
        # Find the original point
        idx = text_names.index(name)
        px, py = x_points[idx], y_points[idx]
        print(f"  {name:20s}  point=({px:.1f}h, {py:.1f}%)  label=({tx:.2f}h, {ty:.2f}%)")

    # Apply manual nudges after adjustText
    for text, name in zip(texts, text_names):
        if name in MANUAL_NUDGES:
            dx, dy = MANUAL_NUDGES[name]
            cur_x, cur_y = text.get_position()
            text.set_position((cur_x + dx, cur_y + dy))

    # Pareto frontier
    points = df[["AvgTimeHours", "AvgPerf"]].values
    pareto_mask = np.ones(len(points), dtype=bool)

    for i, (time_i, perf_i) in enumerate(points):
        for j, (time_j, perf_j) in enumerate(points):
            if i != j:
                if time_j <= time_i and perf_j >= perf_i and (time_j < time_i or perf_j > perf_i):
                    pareto_mask[i] = False
                    break

    pareto_points = points[pareto_mask]
    pareto_points = pareto_points[pareto_points[:, 0].argsort()]

    if len(pareto_points) > 0:
        x_min_data, x_max_data = df["AvgTimeHours"].min(), df["AvgTimeHours"].max()
        y_min_data, y_max_data = df["AvgPerf"].min(), df["AvgPerf"].max()
        x_padding = (x_max_data - x_min_data) * 0.15
        y_padding = (y_max_data - y_min_data) * 0.15

        x_right_edge = x_max_data + x_padding + 1.5
        y_bottom_edge = y_min_data - y_padding - 1

        x_frontier = [pareto_points[0, 0], pareto_points[0, 0]]
        y_frontier = [y_bottom_edge, pareto_points[0, 1]]

        for i in range(1, len(pareto_points)):
            x_frontier.append(pareto_points[i, 0])
            y_frontier.append(pareto_points[i, 1])

        x_frontier.append(x_right_edge)
        y_frontier.append(pareto_points[-1, 1])

        ax.plot(
            x_frontier, y_frontier,
            color=COLORS["text_secondary"],
            linestyle="--",
            linewidth=1.5,
            alpha=0.7,
            zorder=2,
            label="Pareto frontier",
        )

    ax.set_xlabel("Average Time (hours)", color=COLORS["text_primary"], fontweight="medium")
    ax.set_ylabel("Average Performance (%)", color=COLORS["text_primary"], fontweight="medium")

    x_min, x_max = df["AvgTimeHours"].min(), df["AvgTimeHours"].max()
    y_min, y_max = df["AvgPerf"].min(), df["AvgPerf"].max()
    x_padding = (x_max - x_min) * 0.15
    y_padding = (y_max - y_min) * 0.15
    ax.set_xlim(x_min - x_padding, x_max + x_padding + 1.5)
    ax.set_ylim(y_min - y_padding - 1, y_max + y_padding + 1)

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

    plt.tight_layout()

    for fmt in ["pdf", "png"]:
        output_path = save_path.with_suffix(f".{fmt}")
        fig.savefig(str(output_path), facecolor=bg_color, edgecolor="none")
        print(f"Saved: {output_path}")

    plt.close(fig)


def main():
    print(f"Loading data from: {DATA_PATH}")
    df = load_data(DATA_PATH)
    print(f"Loaded {len(df)} agents")
    print(df[["Agent", "AvgTimeHours", "AvgPerf"]].to_string(index=False))
    print(f"\nBackground style: {BACKGROUND}")
    print()

    output_path = OUTPUT_DIR / "fig2_time_vs_performance"
    create_figure(df, output_path, background=BACKGROUND)

    print("\nDone!")


if __name__ == "__main__":
    main()
