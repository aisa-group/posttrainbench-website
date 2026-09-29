#!/usr/bin/env python3
import argparse
import csv
import json
import os
from pathlib import Path

ROOT_DATA_DIR = Path("data")
DATA_DIR = ROOT_DATA_DIR
OUTPUT_FILE = Path("scores.json")
SCORES_GLOBAL = "SCORES_DATA"

BASE_MODELS = ["Qwen3-1.7B-Base", "Qwen3-4B-Base", "SmolLM3-3B-Base", "gemma-3-4b-pt"]
HUMAN_MODELS = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "gemma-3-4b-it"]

# Only these entries are published in the current v1.1 results. The archived
# v1 data is stored separately in scores-v1.js and is not affected by this
# generator.
V11_AGENT_KEYS = {
    "human",
    "base-model",
    "locus",
    "fable-5",
    "gpt-5.6-sol",
    "grok-4.5-high",
    "opus-5",
    "opus-4.8",
    "opus-4.8-max",
    "glm-5.2",
    "kimi-k3",
    "opus-4.7",
    "gpt-5.5-xhigh",
    "gemini-3.1-pro",
    "gpt-5.4-high",
}

# Filled when the v1.2 roster is locked. Keeping this explicit prevents every
# historical CSV in a full aggregation export from appearing automatically.
V12_AGENT_KEYS = {
    *V11_AGENT_KEYS,
    "fable-5.1",
    "glm-5.3",
    "glm-5.3-flash",
    "gpt-6-astra",
    "opus-5.5-max",
}

AGGREGATED_NAME_TO_KEY = {
    "Locus": "locus",
    "Fable 5.1 (Max)": "fable-5.1",
    "GLM 5.3": "glm-5.3",
    "GLM 5.3 Flash": "glm-5.3-flash",
    "GPT-6-Astra": "gpt-6-astra",
    "Opus-5.5 (Max)": "opus-5.5-max",
    "GPT-5.2": "gpt-5.2",
    "GPT-5.1-Codex-Max": "gpt-5.1-codex-max",
    "GPT-5.2-Codex": "gpt-5.2-codex",
    "Opus-4.5": "opus-4.5",
    "Gemini-3-Pro": "gemini-3-pro",
    "GPT-5.3-Codex_High": "gpt-5.3-codex-high",
    "GPT-5.3-Codex_Med": "gpt-5.3-codex-med",
    "Opus-4.6": "opus-4.6",
    "Gemini-3.1-Pro": "gemini-3.1-pro",
    "GPT-5.4-High": "gpt-5.4-high",
    "Opus-4.6-1M": "opus-4.6-1m",
    "Opus-4.7": "opus-4.7",
    "GPT-5.5-xHigh": "gpt-5.5-xhigh",
    "Opus-4.8": "opus-4.8",
    "Opus-4.8 (Max)": "opus-4.8-max",
    "GLM 5.2": "glm-5.2",
    "Fable 5 (Max)": "fable-5",
    "GPT-5.6-Sol": "gpt-5.6-sol",
    "Kimi K3": "kimi-k3",
    "Grok 4.5": "grok-4.5-high",
    "Opus-5": "opus-5",
}

CSV_TO_AGENT = {
    "external/intology-locus/aggregated_avg_locus.csv": "locus",
    "aggregated_avg_Locus.csv": "locus",
    "aggregated_avg_Fable_5.1_(Max).csv": "fable-5.1",
    "aggregated_avg_GLM_5.3.csv": "glm-5.3",
    "aggregated_avg_GLM_5.3_Flash.csv": "glm-5.3-flash",
    "aggregated_avg_GPT-6-Astra.csv": "gpt-6-astra",
    "aggregated_avg_Opus-5.5_(Max).csv": "opus-5.5-max",
    "aggregated_avg_GPT-5.2.csv": "gpt-5.2",
    "aggregated_avg_GPT-5.1-Codex-Max.csv": "gpt-5.1-codex-max",
    "aggregated_avg_GPT-5.2-Codex.csv": "gpt-5.2-codex",
    "aggregated_avg_Opus-4.5.csv": "opus-4.5",
    "aggregated_avg_Gemini-3-Pro.csv": "gemini-3-pro",
    "aggregated_avg_GPT-5.3-Codex_High.csv": "gpt-5.3-codex-high",
    "aggregated_avg_GPT-5.3-Codex_Med.csv": "gpt-5.3-codex-med",
    "aggregated_avg_Opus-4.6.csv": "opus-4.6",
    "aggregated_avg_Gemini-3.1-Pro.csv": "gemini-3.1-pro",
    "aggregated_avg_GPT-5.4-High.csv": "gpt-5.4-high",
    "aggregated_avg_Opus-4.6-1M.csv": "opus-4.6-1m",
    "aggregated_avg_Opus-4.7.csv": "opus-4.7",
    "aggregated_avg_GPT-5.5-xHigh.csv": "gpt-5.5-xhigh",
    "aggregated_avg_Opus-4.8.csv": "opus-4.8",
    "aggregated_avg_Opus-4.8_(Max).csv": "opus-4.8-max",
    "aggregated_avg_GLM_5.2.csv": "glm-5.2",
    "aggregated_avg_Fable_5_(Max).csv": "fable-5",
    "aggregated_avg_GPT-5.6-Sol.csv": "gpt-5.6-sol",
    "aggregated_avg_Kimi_K3.csv": "kimi-k3",
    "aggregated_avg_Grok_4.5.csv": "grok-4.5-high",
    "aggregated_avg_Opus-5.csv": "opus-5",
}

STD_CSV_TO_AGENT = {
    "external/intology-locus/aggregated_std_locus.csv": "locus",
    "aggregated_std_Locus.csv": "locus",
    "aggregated_std_Fable_5.1_(Max).csv": "fable-5.1",
    "aggregated_std_GLM_5.3.csv": "glm-5.3",
    "aggregated_std_GLM_5.3_Flash.csv": "glm-5.3-flash",
    "aggregated_std_GPT-6-Astra.csv": "gpt-6-astra",
    "aggregated_std_Opus-5.5_(Max).csv": "opus-5.5-max",
    "aggregated_std_GPT-5.2.csv": "gpt-5.2",
    "aggregated_std_GPT-5.1-Codex-Max.csv": "gpt-5.1-codex-max",
    "aggregated_std_GPT-5.2-Codex.csv": "gpt-5.2-codex",
    "aggregated_std_Opus-4.5.csv": "opus-4.5",
    "aggregated_std_Gemini-3-Pro.csv": "gemini-3-pro",
    "aggregated_std_GPT-5.3-Codex_High.csv": "gpt-5.3-codex-high",
    "aggregated_std_GPT-5.3-Codex_Med.csv": "gpt-5.3-codex-med",
    "aggregated_std_Opus-4.6.csv": "opus-4.6",
    "aggregated_std_Gemini-3.1-Pro.csv": "gemini-3.1-pro",
    "aggregated_std_GPT-5.4-High.csv": "gpt-5.4-high",
    "aggregated_std_Opus-4.6-1M.csv": "opus-4.6-1m",
    "aggregated_std_Opus-4.7.csv": "opus-4.7",
    "aggregated_std_GPT-5.5-xHigh.csv": "gpt-5.5-xhigh",
    "aggregated_std_Opus-4.8.csv": "opus-4.8",
    "aggregated_std_Opus-4.8_(Max).csv": "opus-4.8-max",
    "aggregated_std_GLM_5.2.csv": "glm-5.2",
    "aggregated_std_Fable_5_(Max).csv": "fable-5",
    "aggregated_std_GPT-5.6-Sol.csv": "gpt-5.6-sol",
    "aggregated_std_Kimi_K3.csv": "kimi-k3",
    "aggregated_std_Grok_4.5.csv": "grok-4.5-high",
    "aggregated_std_Opus-5.csv": "opus-5",
}

# Single-run variants: per-model scores from a final_*.csv,
# time from aggregated_time_overview.csv. No std data, no aggregatedScores entry.
SINGLE_RUN_FINAL_TO_KEY = {
    "final_codex_non_api_high_reprompt_gpt-5.4_10h.csv": "gpt-5.4-high-reprompted",
    "final_codex_non_api_xhigh_reprompt_gpt-5.5_10h.csv": "gpt-5.5-xhigh-reprompted",
}

# Optional cell-level substitutions for unpatched source data. Fable's GPQA
# fallback is already included in its aggregated CSVs.
SUBSTITUTIONS = []

# Provenance labels describe values already patched in the source CSVs. They do
# not copy or otherwise change scores.
CELL_PROVENANCE = [
    {
        "agent": "fable-5.1",
        "benchmarks": ["gpqamain"],
        "sourceLabel": "Opus 5",
    },
    {
        "agent": "fable-5",
        "benchmarks": ["gpqamain"],
        "sourceLabel": "Opus 4.8 Max",
    },
]

AGGREGATED_METRICS_FILES = [
    "single_metrics_aggregated.csv",
    "external/intology-locus/single_metrics_aggregated.csv",
]

TIME_AGGREGATED_FILES = [
    "time_aggregated.csv",
    "external/intology-locus/time_aggregated.csv",
]

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
}

QWEN3MAX_KEY = "qwen3-max"
SONNET_KEY = "sonnet-4.5"
SONNET46_KEY = "sonnet-4.6"

# Populated from the selected version's factors file. Keeping this as the
# single source of truth lets v1.2 omit BFCL while archived versions retain it.
BENCHMARKS = []

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
    "codex_non_api_high_reprompt_gpt-5.4_10h": "gpt-5.4-high-reprompted",
    "codex_non_api_xhigh_reprompt_gpt-5.5_10h": "gpt-5.5-xhigh-reprompted",
}

TIME_AGGREGATED_TO_KEY = {
    "Locus": "locus",
    "Fable 5.1 (Max)": "fable-5.1",
    "GLM 5.3": "glm-5.3",
    "GLM 5.3 Flash": "glm-5.3-flash",
    "GPT-6-Astra": "gpt-6-astra",
    "Opus-5.5 (Max)": "opus-5.5-max",
    "Opus-4.5": "opus-4.5",
    "GPT-5.1-Codex-Max": "gpt-5.1-codex-max",
    "GPT-5.2-Codex": "gpt-5.2-codex",
    "GPT-5.2": "gpt-5.2",
    "Gemini-3-Pro": "gemini-3-pro",
    "GPT-5.3-Codex_High": "gpt-5.3-codex-high",
    "GPT-5.3-Codex_Med": "gpt-5.3-codex-med",
    "Opus-4.6": "opus-4.6",
    "Gemini-3.1-Pro": "gemini-3.1-pro",
    "GPT-5.4-High": "gpt-5.4-high",
    "Opus-4.6-1M": "opus-4.6-1m",
    "Opus-4.7": "opus-4.7",
    "GPT-5.5-xHigh": "gpt-5.5-xhigh",
    "Opus-4.8": "opus-4.8",
    "Opus-4.8 (Max)": "opus-4.8-max",
    "GLM 5.2": "glm-5.2",
    "Fable 5 (Max)": "fable-5",
    "GPT-5.6-Sol": "gpt-5.6-sol",
    "Kimi K3": "kimi-k3",
    "Grok 4.5": "grok-4.5-high",
    "Opus-5": "opus-5",
}


def read_csv(filepath):
    data = {}
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        required_columns = {"model", *BENCHMARKS}
        missing_columns = sorted(required_columns - set(reader.fieldnames or []))
        if missing_columns:
            raise RuntimeError(
                f"{filepath} is missing columns required by this results version: "
                f"{', '.join(missing_columns)}"
            )
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

    for relative_path in TIME_AGGREGATED_FILES:
        time_agg_file = DATA_DIR / relative_path
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
    if not time_overview_file.exists():
        time_overview_file = DATA_DIR / "time_overview.csv"
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


def configure_version(version, input_dir=None, output_file=None):
    global DATA_DIR, OUTPUT_FILE, SCORES_GLOBAL, BENCHMARKS

    if version == "v1.2":
        DATA_DIR = Path(input_dir) if input_dir else ROOT_DATA_DIR / "v1.2"
        OUTPUT_FILE = Path(output_file) if output_file else Path("scores-v1.2.json")
        SCORES_GLOBAL = "SCORES_DATA_V12"
        factors_file = ROOT_DATA_DIR / "factors-v1.2.json"
    else:
        DATA_DIR = Path(input_dir) if input_dir else ROOT_DATA_DIR
        OUTPUT_FILE = Path(output_file) if output_file else Path("scores.json")
        SCORES_GLOBAL = "SCORES_DATA"
        factors_file = ROOT_DATA_DIR / "factors.json"

    weights = read_json(factors_file)
    weight_sum = sum(weights.values())
    if abs(weight_sum - 1.0) > 1e-9:
        raise RuntimeError(
            f"Weights in {factors_file} sum to {weight_sum:.12f}, expected 1.0"
        )
    BENCHMARKS = list(weights.keys())
    return weights


def get_published_agent_keys(version):
    if version == "v1.1":
        return set(V11_AGENT_KEYS)
    return set(V12_AGENT_KEYS)


def generate_scores_json(version="v1.1", input_dir=None, output_file=None):
    weights = configure_version(version, input_dir, output_file)
    published_agent_keys = get_published_agent_keys(version)

    if version == "v1.2" and len(published_agent_keys) == 2:
        raise RuntimeError(
            "No v1.2 competitors are configured. Add the final roster to "
            "V12_AGENT_KEYS and map any new filenames/names before generating."
        )

    # Baseline source data is shared. read_csv selects only the benchmarks
    # listed by the active version's factors file.
    baseline_data = read_csv(ROOT_DATA_DIR / "aggregated_baseline.csv")
    baseline_fewshot_data = read_csv(ROOT_DATA_DIR / "aggregated_baseline_fewshot.csv")

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

    for csv_file, agent_key in SINGLE_RUN_FINAL_TO_KEY.items():
        filepath = DATA_DIR / csv_file
        if filepath.exists():
            agent_data = read_csv(filepath)
            model_benchmark_data[agent_key] = {}
            for model in BASE_MODELS:
                model_benchmark_data[agent_key][model] = {}
                for bm in BENCHMARKS:
                    val = to_percentage(agent_data[model][bm])
                    model_benchmark_data[agent_key][model][bm] = {"value": val, "fallbackType": False}

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

    # Apply failed-run substitutions (after all agents are built so the source exists).
    for sub in SUBSTITUTIONS:
        agent_key, source, model = sub["agent"], sub["source"], sub["model"]
        if agent_key in model_benchmark_data and source in model_benchmark_data:
            for bm in sub["benchmarks"]:
                model_benchmark_data[agent_key][model][bm] = {
                    "value": model_benchmark_data[source][model][bm]["value"],
                    "fallbackType": "substituted",
                }

    # Attach provenance to upstream-patched cells without mutating their values.
    for annotation in CELL_PROVENANCE:
        agent_key = annotation["agent"]
        if agent_key not in model_benchmark_data:
            continue
        for model in BASE_MODELS:
            for bm in annotation["benchmarks"]:
                model_benchmark_data[agent_key][model][bm]["sourceLabel"] = annotation["sourceLabel"]

    aggregated_scores = {}
    for relative_path in AGGREGATED_METRICS_FILES:
        aggregated_file = DATA_DIR / relative_path
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

    missing_agents = sorted(published_agent_keys - model_benchmark_data.keys())
    if missing_agents:
        raise RuntimeError(f"Missing {version} score data for: {', '.join(missing_agents)}")

    competitor_keys = published_agent_keys - {"human", "base-model"}
    single_run_keys = set(SINGLE_RUN_FINAL_TO_KEY.values())
    missing_aggregates = sorted(competitor_keys - single_run_keys - aggregated_scores.keys())
    if missing_aggregates:
        raise RuntimeError(
            f"Missing {version} overall aggregate rows for: {', '.join(missing_aggregates)}"
        )
    missing_stds = sorted(competitor_keys - single_run_keys - std_data.keys())
    if missing_stds:
        raise RuntimeError(
            f"Missing {version} per-benchmark std data for: {', '.join(missing_stds)}"
        )
    missing_runtimes = sorted(competitor_keys - time_data.keys())
    if missing_runtimes:
        raise RuntimeError(f"Missing {version} runtime data for: {', '.join(missing_runtimes)}")

    model_benchmark_data = {
        key: value for key, value in model_benchmark_data.items()
        if key in published_agent_keys
    }
    aggregated_scores = {
        key: value for key, value in aggregated_scores.items()
        if key in published_agent_keys
    }
    std_data = {
        key: value for key, value in std_data.items()
        if key in published_agent_keys
    }
    time_data = {
        key: value for key, value in time_data.items()
        if key in published_agent_keys
    }

    output = {
        "resultsVersion": version,
        "benchmarkKeys": BENCHMARKS,
        "benchmarkWeights": weights,
        "modelBenchmarkData": model_benchmark_data,
        "aggregatedScores": aggregated_scores,
        "stdData": std_data,
        "timeData": time_data
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"Generated {OUTPUT_FILE}")

    # Also emit an inlined JS version so the site can render the leaderboard
    # synchronously (before first paint) instead of fetching scores.json after
    # load, which caused a brief empty-table flash on reload.
    js_file = OUTPUT_FILE.with_suffix(".js")
    with open(js_file, 'w') as f:
        f.write("// Auto-generated by generate_data.py from the data/ CSVs. Do not edit.\n")
        f.write(f"window.{SCORES_GLOBAL} = ")
        json.dump(output, f, indent=2)
        f.write(";\n")

    print(f"Generated {js_file}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a versioned PostTrainBench score bundle.")
    parser.add_argument(
        "--version",
        choices=("v1.1", "v1.2"),
        default="v1.1",
        help="Results version to generate (default: v1.1).",
    )
    parser.add_argument(
        "--input-dir",
        help="Override the version's input directory (useful for validating a staged export).",
    )
    parser.add_argument(
        "--output",
        help="Override the generated JSON path; the JS bundle uses the same basename.",
    )
    args = parser.parse_args()

    os.chdir(Path(__file__).parent)
    generate_scores_json(args.version, args.input_dir, args.output)
