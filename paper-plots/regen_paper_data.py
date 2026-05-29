"""
Regenerate paper artifacts (fig1 CSV, fig2 CSV, table_leaderboard.tex)
from the re-judged data/ CSVs. Run from paper-plots/.
"""
import csv, json
from pathlib import Path

DATA = Path(__file__).parent.parent / "data"
OUT = Path(__file__).parent / "data"

W = json.load(open(DATA / "factors.json"))
BMS = ["aime2025", "arenahardwriting", "bfcl", "gpqamain", "gsm8k", "healthbench", "humaneval"]
BASE = ["Qwen3-1.7B-Base", "Qwen3-4B-Base", "SmolLM3-3B-Base", "gemma-3-4b-pt"]


def read(fn):
    return {r["model"]: r for r in csv.DictReader(open(DATA / fn))}


def bm_mean(fn):
    d = read(fn)
    return {b: sum(float(d[m][b]) for m in BASE) / 4 * 100 for b in BMS}


def weighted_avg_from_avgfile(fn):
    d = read(fn)
    pm = [sum(float(d[m][b]) * W[b] for b in BMS) for m in BASE]
    return sum(pm) / 4 * 100


sm = {r["agent"]: r for r in csv.DictReader(open(DATA / "single_metrics_aggregated.csv"))}

# ---- Agent registry -------------------------------------------------------
# kind: "multi" (aggregated_avg/std + single_metrics) | "single" (final only) | "baseline"
# Each entry: display, scaffold, kind, avg_file, std_file, sm_key, dagger
AGENTS = [
    # display, scaffold, kind, avg_file, std_file, sm_key, dagger
    ("Claude Opus 4.7", "Claude Code", "multi", "aggregated_avg_Opus-4.7.csv", "aggregated_std_Opus-4.7.csv", "Opus-4.7", False),
    ("GPT 5.5 (xHigh)", "Codex CLI", "multi", "aggregated_avg_GPT-5.5-xHigh.csv", "aggregated_std_GPT-5.5-xHigh.csv", "GPT-5.5-xHigh", False),
    ("GPT 5.4 (High)", "Codex CLI", "single", "final_codex_non_api_high_reprompt_gpt-5.4_10h.csv", None, None, True),
    ("Gemini 3.1 Pro", "OpenCode", "multi", "aggregated_avg_Gemini-3.1-Pro.csv", "aggregated_std_Gemini-3.1-Pro.csv", "Gemini-3.1-Pro", False),
    ("GPT 5.5 (xHigh)", "Codex CLI", "single", "final_codex_non_api_xhigh_reprompt_gpt-5.5_10h.csv", None, None, True),
    ("GPT-5.2", "Codex CLI", "multi", "aggregated_avg_GPT-5.2.csv", "aggregated_std_GPT-5.2.csv", "GPT-5.2", False),
    ("GPT 5.1 Codex Max", "Codex CLI", "multi", "aggregated_avg_GPT-5.1-Codex-Max.csv", "aggregated_std_GPT-5.1-Codex-Max.csv", "GPT-5.1-Codex-Max", False),
    ("GPT 5.4 (High)", "Codex CLI", "multi", "aggregated_avg_GPT-5.4-High.csv", "aggregated_std_GPT-5.4-High.csv", "GPT-5.4-High", False),
    ("Gemini 3 Pro", "Gemini CLI", "multi", "aggregated_avg_Gemini-3-Pro.csv", "aggregated_std_Gemini-3-Pro.csv", "Gemini-3-Pro", False),
    ("Claude Opus 4.6 (1M)", "Claude Code", "multi", "aggregated_avg_Opus-4.6-1M.csv", "aggregated_std_Opus-4.6-1M.csv", "Opus-4.6-1M", False),
    ("GPT 5.3 Codex (High)", "Codex CLI", "multi", "aggregated_avg_GPT-5.3-Codex_High.csv", "aggregated_std_GPT-5.3-Codex_High.csv", "GPT-5.3-Codex_High", False),
    ("GPT 5.2 Codex", "Codex CLI", "multi", "aggregated_avg_GPT-5.2-Codex.csv", "aggregated_std_GPT-5.2-Codex.csv", "GPT-5.2-Codex", False),
    ("Claude Opus 4.5", "OpenCode", "single", "final_opencode_anthropic_claude-opus-4-5_10h.csv", None, None, False),
    ("Claude Opus 4.6", "Claude Code", "multi", "aggregated_avg_Opus-4.6.csv", "aggregated_std_Opus-4.6.csv", "Opus-4.6", False),
    ("Claude Opus 4.5", "Claude Code", "multi", "aggregated_avg_Opus-4.5.csv", "aggregated_std_Opus-4.5.csv", "Opus-4.5", False),
    ("Gemini 3 Pro", "OpenCode", "single", "final_opencode_opencode_gemini-3-pro_10h.csv", None, None, False),
    ("Claude Sonnet 4.6", "Claude Code", "single", "final_claude_non_api_claude-sonnet-4-6_10h.csv", None, None, False),
    ("GLM 5", "OpenCode", "single", "final_opencode_zai_glm-5_10h_run2.csv", None, None, False),
    ("GPT 5.3 Codex (Med)", "Codex CLI", "multi", "aggregated_avg_GPT-5.3-Codex_Med.csv", "aggregated_std_GPT-5.3-Codex_Med.csv", "GPT-5.3-Codex_Med", False),
    ("Kimi K2.5", "OpenCode", "single", "final_opencode_opencode_kimi-k2.5_10h_run2.csv", None, None, False),
    ("Claude Sonnet 4.5", "Claude Code", "single", "final_claude_claude-sonnet-4-5_10h_final_v3.csv", None, None, False),
    ("MiniMax M2.5", "OpenCode", "single", "final_opencode_opencode_minimax-m2.5-free_10h_run2.csv", None, None, False),
    ("MiniMax M2.1", "OpenCode", "single", "final_opencode_opencode_minimax-m2.1-free_10h.csv", None, None, False),
    ("GPT 5.1 Codex Max", "OpenCode", "single", "final_opencode_opencode_gpt-5.1-codex-max_10h.csv", None, None, False),
    ("GLM 4.7", "OpenCode", "single", "final_opencode_opencode_glm-4.7-free_10h.csv", None, None, False),
    ("Qwen3 Max", "Claude Code", "single", "final_qwen3max_qwen3-max-2026-01-23_10h.csv", None, None, False),
    ("Kimi K2 Thinking", "OpenCode", "single", "final_opencode_opencode_kimi-k2-thinking_10h.csv", None, None, False),
]


def compute(entry):
    display, scaffold, kind, avgf, stdf, smkey, dagger = entry
    means = bm_mean(avgf)
    if kind == "multi":
        avg = float(sm[smkey]["avg"]) * 100
        avgstd = float(sm[smkey]["std"]) * 100
        stds = bm_mean(stdf)
    else:
        avg = sum(means[b] * W[b] for b in BMS)
        avgstd = None
        stds = None
    return dict(display=display, scaffold=scaffold, kind=kind, dagger=dagger,
                avg=avg, avgstd=avgstd, means=means, stds=stds)


computed = [compute(e) for e in AGENTS]
computed.sort(key=lambda c: -c["avg"])


def _q(name):
    return f'"{name}"' if "," in name else name


def find(display, scaffold, dagger):
    for c in computed:
        if c["display"] == display and c["scaffold"] == scaffold and c["dagger"] == dagger:
            return c
    raise KeyError((display, scaffold, dagger))


# ============================ FIG 1 ========================================
# (fig1_method_name, std_in_csv, lookup(display, scaffold, dagger))
FIG1 = [
    ("Official Instruct Models", None, None),  # baseline literal 51.1 (human)
    ("Opus 4.7", True, ("Claude Opus 4.7", "Claude Code", False)),
    ("Opus 4.6", True, ("Claude Opus 4.6", "Claude Code", False)),
    ("Opus 4.6 (1M)", True, ("Claude Opus 4.6 (1M)", "Claude Code", False)),
    ("Opus 4.5", True, ("Claude Opus 4.5", "Claude Code", False)),
    ("GPT 5.3 Codex (High)", True, ("GPT 5.3 Codex (High)", "Codex CLI", False)),
    ("GPT 5.4 (High)", True, ("GPT 5.4 (High)", "Codex CLI", False)),
    ("GPT 5.4 (High, Reprompted)", False, ("GPT 5.4 (High)", "Codex CLI", True)),
    ("GPT 5.5 (xHigh)", True, ("GPT 5.5 (xHigh)", "Codex CLI", False)),
    ("GPT 5.5 (xHigh, Reprompted)", False, ("GPT 5.5 (xHigh)", "Codex CLI", True)),
    ("Sonnet 4.6", False, ("Claude Sonnet 4.6", "Claude Code", False)),
    ("Gemini 3.1 Pro", True, ("Gemini 3.1 Pro", "OpenCode", False)),
    ("GLM-5", False, ("GLM 5", "OpenCode", False)),
    ("Base Model", None, None),  # baseline literal 7.5
]
fig1_lines = ["Method,Avg,StdDev"]
for name, want_std, sel in FIG1:
    if sel is None:
        avg = 51.1 if name == "Official Instruct Models" else 7.5
        fig1_lines.append(f'{_q(name)},{avg},')
        continue
    c = find(*sel)
    std = f"{c['avgstd']:.1f}" if (want_std and c["avgstd"] is not None) else ""
    fig1_lines.append(f'{_q(name)},{c["avg"]:.1f},{std}')
(OUT / "fig1_leaderboard.csv").write_text("\n".join(fig1_lines) + "\n")

# ============================ FIG 2 ========================================
# (fig2_agent_name, AvgTime, StdTime, lookup)
FIG2 = [
    ("Opus 4.7", "7:34:13", "0:34:02", ("Claude Opus 4.7", "Claude Code", False)),
    ("GPT 5.5 (xHigh)", "4:58:44", "0:07:25", ("GPT 5.5 (xHigh)", "Codex CLI", False)),
    ("GPT 5.5 (xHigh Reprompted)", "9:14:31", "", ("GPT 5.5 (xHigh)", "Codex CLI", True)),
    ("Opus 4.6", "9:39:42", "0:22:15", ("Claude Opus 4.6", "Claude Code", False)),
    ("Opus 4.6 (1M)", "8:48:04", "0:56:28", ("Claude Opus 4.6 (1M)", "Claude Code", False)),
    ("Gemini 3.1 Pro", "4:03:04", "0:12:38", ("Gemini 3.1 Pro", "OpenCode", False)),
    ("GPT-5.2", "6:04:36", "0:49:37", ("GPT-5.2", "Codex CLI", False)),
    ("GPT-5.1 Codex Max", "4:03:12", "0:20:00", ("GPT 5.1 Codex Max", "Codex CLI", False)),
    ("Gemini 3 Pro", "6:35:47", "0:56:30", ("Gemini 3 Pro", "Gemini CLI", False)),
    ("Opus 4.5", "7:52:39", "0:28:02", ("Claude Opus 4.5", "Claude Code", False)),
    ("GPT-5.2 Codex", "2:25:36", "0:06:48", ("GPT 5.2 Codex", "Codex CLI", False)),
    ("GPT 5.3 Codex (High)", "1:39:07", "0:04:08", ("GPT 5.3 Codex (High)", "Codex CLI", False)),
    ("GPT 5.4 (High)", "1:46:26", "0:13:55", ("GPT 5.4 (High)", "Codex CLI", False)),
    ("GPT 5.4 (High Reprompted)", "8:19:05", "", ("GPT 5.4 (High)", "Codex CLI", True)),
    ("Sonnet 4.6", "6:50:01", "", ("Claude Sonnet 4.6", "Claude Code", False)),
    ("Sonnet 4.5", "4:11:11", "", ("Claude Sonnet 4.5", "Claude Code", False)),
    ("GLM-5", "3:33:43", "", ("GLM 5", "OpenCode", False)),
    ("Kimi K2.5", "2:32:49", "", ("Kimi K2.5", "OpenCode", False)),
    ("MiniMax M2.5", "2:59:00", "", ("MiniMax M2.5", "OpenCode", False)),
]
fig2_lines = ["Agent,AvgTime,StdTime,AvgPerf,StdPerf"]
for name, t, st, sel in FIG2:
    c = find(*sel)
    perfstd = f"{c['avgstd']:.1f}" if c["avgstd"] is not None else ""
    fig2_lines.append(f"{name},{t},{st},{c['avg']:.1f},{perfstd}")
(OUT / "fig2_time_vs_performance.csv").write_text("\n".join(fig2_lines) + "\n")

# ============================ TABLE ========================================
def bucket(v):
    return f"perf{min(int(v // 10) * 10, 80)}"


def cell(v, s=None):
    vs = (r"\phantom{0}" + f"{v:.1f}") if v < 10 else f"{v:.1f}"
    if s is None:
        tail = r"\phantom{\,\tiny{± 0.0}}"
    else:
        tail = r"\,\tiny{± " + f"{s:.1f}" + "}"
    return r"\cellcolor{" + bucket(v) + "}" + vs + tail


RANKCOL = {1: r"\textcolor{goldmedal}{\textbf{1}}",
           2: r"\textcolor{silvermedal}{\textbf{2}}",
           3: r"\textcolor{bronzemedal}{\textbf{3}}"}

table_rows = []
rank = 0
for c in computed:
    rank += 1
    rc = RANKCOL.get(rank, str(rank))
    name = c["display"] + (r"$^\dagger$" if c["dagger"] else "") + r" \scriptsize{(" + c["scaffold"] + ")}"
    avgcell = cell(c["avg"], c["avgstd"])
    if c["kind"] == "multi":
        bmcells = [cell(c["means"][b], c["stds"][b]) for b in BMS]
    else:
        bmcells = [cell(c["means"][b]) for b in BMS]
    table_rows.append((c["avg"], rank, "    " + rc + " & " + name + " & " + avgcell + " & " + " & ".join(bmcells) + r" \\"))

OFFICIAL = r"    -- & Official Instruct Models (baseline) & \cellcolor{perf50}51.1\phantom{\,\tiny{± 0.0}} & \cellcolor{perf20}29.2\phantom{\,\tiny{± 0.0}} & \cellcolor{perf70}70.2\phantom{\,\tiny{± 0.0}} & \cellcolor{perf80}85.0\phantom{\,\tiny{± 0.0}} & \cellcolor{perf30}36.2\phantom{\,\tiny{± 0.0}} & \cellcolor{perf80}87.0\phantom{\,\tiny{± 0.0}} & \cellcolor{perf40}43.3\phantom{\,\tiny{± 0.0}} & \cellcolor{perf70}71.5\phantom{\,\tiny{± 0.0}} \\"
FEWSHOT = "    \\rowcolor{gray!15}\n    -- & Base Model (Few-Shot) & 18.1\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}5.1\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}7.2\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}1.7\\phantom{\\,\\tiny{± 0.0}} & 22.6\\phantom{\\,\\tiny{± 0.0}} & 45.0\\phantom{\\,\\tiny{± 0.0}} & 19.1\\phantom{\\,\\tiny{± 0.0}} & 31.5\\phantom{\\,\\tiny{± 0.0}} \\\\"
ZEROSHOT = "    \\rowcolor{gray!15}\n    -- & Base Model (Zero-Shot) & \\phantom{0}7.5\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}1.7\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}1.3\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}1.5\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}8.5\\phantom{\\,\\tiny{± 0.0}} & 20.4\\phantom{\\,\\tiny{± 0.0}} & \\phantom{0}9.5\\phantom{\\,\\tiny{± 0.0}} & 12.8\\phantom{\\,\\tiny{± 0.0}} \\\\"

body = [OFFICIAL]
fewshot_done = zeroshot_done = False
for avg, rk, line in table_rows:
    if not fewshot_done and avg < 18.1:
        body.append(FEWSHOT)
        fewshot_done = True
    if not zeroshot_done and avg < 7.5:
        body.append(ZEROSHOT)
        zeroshot_done = True
    body.append(line)
body_str = "\n".join(body)

tex = (Path(__file__).parent / "table_leaderboard.tex").read_text()
head, _, rest = tex.partition("\\midrule\n")
_, _, tail = rest.partition("    \\bottomrule")
new_tex = head + "\\midrule\n" + body_str + "\n    \\bottomrule" + tail
(Path(__file__).parent / "table_leaderboard.tex").write_text(new_tex)

print("\nWrote: fig1_leaderboard.csv, fig2_time_vs_performance.csv, table_leaderboard.tex")
print("\n--- VERIFY GPT 5.2 Codex (unchanged; old table GPQA 4.7 was a rounding artifact, true=4.65->4.6) ---")
for avg, rk, line in table_rows:
    if "GPT 5.2 Codex" in line:
        print(line.strip())
