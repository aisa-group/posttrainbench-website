#!/usr/bin/env python3
import csv
import json
import os
from pathlib import Path

DATA_DIR = Path("data")
OUTPUT_FILE = Path("scores.json")

BASE_MODELS = ["Qwen3-1.7B-Base", "Qwen3-4B-Base", "SmolLM3-3B-Base", "gemma-3-4b-pt"]
HUMAN_MODELS = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "gemma-3-4b-it"]

AGGREGATED_NAME_TO_KEY = {
    "GPT-5.2": "gpt-5.2",
    "GPT-5.1-Codex-Max": "gpt-5.1-codex-max",
    "GPT-5.2-Codex": "gpt-5.2-codex",
    "Opus-4.5": "opus-4.5",
    "Gemini-3-Pro": "gemini-3-pro",
    "GPT-5.3-Codex": "gpt-5.3-codex",
    "Opus-4.6": "opus-4.6",
}

CSV_TO_AGENT = {
    "aggregated_avg_GPT-5.2.csv": "gpt-5.2",
    "aggregated_avg_GPT-5.1-Codex-Max.csv": "gpt-5.1-codex-max",
    "aggregated_avg_GPT-5.2-Codex.csv": "gpt-5.2-codex",
    "aggregated_avg_Opus-4.5.csv": "opus-4.5",
    "aggregated_avg_Gemini-3-Pro.csv": "gemini-3-pro",
    "aggregated_avg_GPT-5.3-Codex.csv": "gpt-5.3-codex",
    "aggregated_avg_Opus-4.6.csv": "opus-4.6",
}

STD_CSV_TO_AGENT = {
    "aggregated_std_GPT-5.2.csv": "gpt-5.2",
    "aggregated_std_GPT-5.1-Codex-Max.csv": "gpt-5.1-codex-max",
    "aggregated_std_GPT-5.2-Codex.csv": "gpt-5.2-codex",
    "aggregated_std_Opus-4.5.csv": "opus-4.5",
    "aggregated_std_Gemini-3-Pro.csv": "gemini-3-pro",
    "aggregated_std_GPT-5.3-Codex.csv": "gpt-5.3-codex",
    "aggregated_std_Opus-4.6.csv": "opus-4.6",
}

OPENCODE_CSV_TO_AGENT = {
    "opencode_glm-4.7-free_10h": "glm-4.7",
    "opencode_minimax-m2.1-free_10h": "minimax-m2.1",
    "anthropic_claude-opus-4-5_10h": "opus-4.5-opencode",
    "opencode_gemini-3-pro_10h": "gemini-3-pro-opencode",
    "opencode_gpt-5.1-codex-max_10h": "gpt-5.1-codex-max-opencode",
    "opencode_kimi-k2-thinking_10h": "kimi-k2",
    "opencode_kimi-k2.5_10h_run2": "kimi-k2.5",
    "opencode_minimax-m2.5-free_10h_run2": "minimax-m2.5",
    "zai_glm-5_10h_run2": "glm-5",
    "opencode_gemini-3.1-pro_10h_run2": "gemini-3.1-pro",
}

QWEN3MAX_KEY = "qwen3-max"
SONNET_KEY = "sonnet-4.5"
SONNET46_KEY = "sonnet-4.6"

BENCHMARKS = ["aime2025", "arenahardwriting", "bfcl", "gpqamain", "gsm8k", "healthbench", "humaneval"]

TIME_OVERVIEW_TO_KEY = {
    "baseline": "human",
    "opencode_anthropic_claude-opus-4-5_10h": "opus-4.5-opencode",
    "opencode_opencode_gemini-3-pro_10h": "gemini-3-pro-opencode",
    "opencode_opencode_glm-4.7-free_10h": "glm-4.7",
    "opencode_opencode_gpt-5.1-codex-max_10h": "gpt-5.1-codex-max-opencode",
    "opencode_opencode_kimi-k2-thinking_10h": "kimi-k2",
    "opencode_opencode_minimax-m2.1-free_10h": "minimax-m2.1",
    "qwen3max_qwen3-max-2026-01-23_10h": "qwen3-max",
    "opencode_opencode_kimi-k2.5_10h_run2": "kimi-k2.5",
    "opencode_opencode_minimax-m2.5-free_10h_run2": "minimax-m2.5",
    "opencode_zai_glm-5_10h_run2": "glm-5",
    "claude_non_api_claude-sonnet-4-6_10h": "sonnet-4.6",
    "opencode_opencode_gemini-3.1-pro_10h_run2": "gemini-3.1-pro",
}

TIME_AGGREGATED_TO_KEY = {
    "Opus-4.5": "opus-4.5",
    "GPT-5.1-Codex-Max": "gpt-5.1-codex-max",
    "GPT-5.2-Codex": "gpt-5.2-codex",
    "GPT-5.2": "gpt-5.2",
    "Gemini-3-Pro": "gemini-3-pro",
    "GPT-5.3-Codex": "gpt-5.3-codex",
    "Opus-4.6": "opus-4.6",
}


def read_csv(filepath):
    data = {}
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            model = row['model']
            data[model] = {bm: row[bm] for bm in BENCHMARKS}
    return data


def read_json(filepath):
    with open(filepath, 'r') as f:
        return json.load(f)


def to_percentage(val):
    return round(float(val) * 100, 2)


def parse_time_to_hours(time_str):
    parts = time_str.split(':')
    if len(parts) == 3:
        hours, minutes, seconds = map(int, parts)
        return round(hours + minutes/60 + seconds/3600, 3)
    elif len(parts) == 2:
        minutes, seconds = map(int, parts)
        return round(minutes/60 + seconds/3600, 3)
    return 0


def format_time_display(time_str):
    parts = time_str.split(':')
    if len(parts) == 3:
        hours, minutes, _ = parts
        return f"{int(hours)}:{minutes}"
    return time_str


def load_time_data():
    time_data = {}

    time_agg_file = DATA_DIR / "time_aggregated.csv"
    if time_agg_file.exists():
        with open(time_agg_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                agent_name = row['agent']
                if agent_name in TIME_AGGREGATED_TO_KEY:
                    agent_key = TIME_AGGREGATED_TO_KEY[agent_name]
                    time_data[agent_key] = {
                        "hours": parse_time_to_hours(row['avg_time']),
                        "time": format_time_display(row['avg_time']),
                        "stdHours": parse_time_to_hours(row['std_time']),
                        "stdTime": format_time_display(row['std_time']),
                        "n": int(row['n'])
                    }

    time_overview_file = DATA_DIR / "aggregated_time_overview.csv"
    if time_overview_file.exists():
        with open(time_overview_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                method = row['method']
                if method in TIME_OVERVIEW_TO_KEY:
                    agent_key = TIME_OVERVIEW_TO_KEY[method]
                    if agent_key not in time_data:
                        time_data[agent_key] = {
                            "hours": parse_time_to_hours(row['average_time']),
                            "time": format_time_display(row['average_time']),
                            "stdHours": None,
                            "stdTime": None,
                            "n": 1
                        }

    return time_data


def generate_scores_json():
    weights = read_json(DATA_DIR / "factors.json")
    baseline_data = read_csv(DATA_DIR / "aggregated_baseline.csv")
    baseline_fewshot_data = read_csv(DATA_DIR / "aggregated_baseline_fewshot.csv")

    model_benchmark_data = {}

    model_benchmark_data["base-model"] = {}
    for model in BASE_MODELS:
        model_benchmark_data["base-model"][model] = {}
        for bm in BENCHMARKS:
            val = to_percentage(baseline_data[model][bm])
            model_benchmark_data["base-model"][model][bm] = {"value": val, "fallbackType": False}

    model_benchmark_data["base-model-fewshot"] = {}
    for model in BASE_MODELS:
        model_benchmark_data["base-model-fewshot"][model] = {}
        for bm in BENCHMARKS:
            val = to_percentage(baseline_fewshot_data[model][bm])
            model_benchmark_data["base-model-fewshot"][model][bm] = {"value": val, "fallbackType": False}

    model_benchmark_data["human"] = {}
    for base_model, human_model in zip(BASE_MODELS, HUMAN_MODELS):
        model_benchmark_data["human"][base_model] = {}
        for bm in BENCHMARKS:
            val = to_percentage(baseline_data[human_model][bm])
            model_benchmark_data["human"][base_model][bm] = {"value": val, "fallbackType": False}

    for csv_file, agent_key in CSV_TO_AGENT.items():
        filepath = DATA_DIR / csv_file
        if filepath.exists():
            agent_data = read_csv(filepath)
            model_benchmark_data[agent_key] = {}
            for model in BASE_MODELS:
                model_benchmark_data[agent_key][model] = {}
                for bm in BENCHMARKS:
                    val = to_percentage(agent_data[model][bm])
                    model_benchmark_data[agent_key][model][bm] = {"value": val, "fallbackType": False}

    sonnet_files = list(DATA_DIR.glob("final_claude_claude-sonnet-*.csv"))
    if sonnet_files:
        sonnet_data = read_csv(sonnet_files[0])
        model_benchmark_data[SONNET_KEY] = {}
        for model in BASE_MODELS:
            model_benchmark_data[SONNET_KEY][model] = {}
            for bm in BENCHMARKS:
                val = to_percentage(sonnet_data[model][bm])
                model_benchmark_data[SONNET_KEY][model][bm] = {"value": val, "fallbackType": False}

    for suffix, agent_key in OPENCODE_CSV_TO_AGENT.items():
        agg_file = DATA_DIR / f"aggregated_opencode_{suffix}.csv"
        final_file = DATA_DIR / f"final_opencode_{suffix}.csv"

        if agg_file.exists() and final_file.exists():
            agg_data = read_csv(agg_file)
            final_data = read_csv(final_file)

            model_benchmark_data[agent_key] = {}
            for model in BASE_MODELS:
                model_benchmark_data[agent_key][model] = {}
                for bm in BENCHMARKS:
                    agg_val = agg_data[model][bm]
                    final_val = to_percentage(final_data[model][bm])

                    if agg_val == "not stored":
                        fallback_type = "not_stored"
                    elif agg_val == "ERR":
                        fallback_type = "error"
                    else:
                        fallback_type = False

                    model_benchmark_data[agent_key][model][bm] = {"value": final_val, "fallbackType": fallback_type}

    qwen3max_agg = DATA_DIR / "aggregated_qwen3max_qwen3-max-2026-01-23_10h.csv"
    qwen3max_final = DATA_DIR / "final_qwen3max_qwen3-max-2026-01-23_10h.csv"
    if qwen3max_agg.exists() and qwen3max_final.exists():
        agg_data = read_csv(qwen3max_agg)
        final_data = read_csv(qwen3max_final)
        model_benchmark_data[QWEN3MAX_KEY] = {}
        for model in BASE_MODELS:
            model_benchmark_data[QWEN3MAX_KEY][model] = {}
            for bm in BENCHMARKS:
                agg_val = agg_data[model][bm]
                final_val = to_percentage(final_data[model][bm])

                if agg_val == "not stored":
                    fallback_type = "not_stored"
                elif agg_val == "ERR":
                    fallback_type = "error"
                else:
                    fallback_type = False

                model_benchmark_data[QWEN3MAX_KEY][model][bm] = {"value": final_val, "fallbackType": fallback_type}

    sonnet46_agg = DATA_DIR / "aggregated_claude_non_api_claude-sonnet-4-6_10h.csv"
    sonnet46_final = DATA_DIR / "final_claude_non_api_claude-sonnet-4-6_10h.csv"
    if sonnet46_agg.exists() and sonnet46_final.exists():
        agg_data = read_csv(sonnet46_agg)
        final_data = read_csv(sonnet46_final)
        model_benchmark_data[SONNET46_KEY] = {}
        for model in BASE_MODELS:
            model_benchmark_data[SONNET46_KEY][model] = {}
            for bm in BENCHMARKS:
                agg_val = agg_data[model][bm]
                final_val = to_percentage(final_data[model][bm])

                if agg_val == "not stored":
                    fallback_type = "not_stored"
                elif agg_val == "ERR":
                    fallback_type = "error"
                else:
                    fallback_type = False

                model_benchmark_data[SONNET46_KEY][model][bm] = {"value": final_val, "fallbackType": fallback_type}

    aggregated_scores = {}
    aggregated_file = DATA_DIR / "single_metrics_aggregated.csv"
    if aggregated_file.exists():
        with open(aggregated_file, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                agent_name = row['agent']
                if agent_name in AGGREGATED_NAME_TO_KEY:
                    agent_key = AGGREGATED_NAME_TO_KEY[agent_name]
                    aggregated_scores[agent_key] = {
                        "avg": round(float(row['avg']) * 100, 2),
                        "std": round(float(row['std']) * 100, 2),
                        "n": int(row['n'])
                    }

    std_data = {}
    for csv_file, agent_key in STD_CSV_TO_AGENT.items():
        filepath = DATA_DIR / csv_file
        if filepath.exists():
            agent_std = read_csv(filepath)
            std_data[agent_key] = {}
            for model in BASE_MODELS:
                std_data[agent_key][model] = {}
                for bm in BENCHMARKS:
                    val = to_percentage(agent_std[model][bm])
                    std_data[agent_key][model][bm] = val

    time_data = load_time_data()

    output = {
        "benchmarkWeights": weights,
        "modelBenchmarkData": model_benchmark_data,
        "aggregatedScores": aggregated_scores,
        "stdData": std_data,
        "timeData": time_data
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"Generated {OUTPUT_FILE}")


if __name__ == "__main__":
    os.chdir(Path(__file__).parent)
    generate_scores_json()
