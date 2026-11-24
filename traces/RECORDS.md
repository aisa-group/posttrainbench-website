# Trace records

The viewer reads one directory of JSON records (`PTB_DATA_BASE` in `config.js`).
Any pipeline that writes records in this format can be shown. Two do today:
- PostTrainBench's build (`ptb-traces-pipeline`, `build.py`);
- converters of verifiers traces (`trace_format: verifiers`).

This file is the format's specification. A pipeline that changes what it writes
changes this file in the same pull request as the viewer.

## Versions

`schema_version`, in `index.json` and in each record's `meta`, is the format's
version. Records without it are version 1, so PostTrainBench's current build is
version 1.

New optional fields keep the version. A field that is removed, renamed, or whose
meaning changes raises it, and the viewer then reads both versions until no
published record uses the old one.

**Version 1** is this file.

## Files

| File | Read by | Holds |
| --- | --- | --- |
| `index.json` | the run list | `runs` (one row per run), `experiments`, `benchmarks`, `build_ts`, `schema_version` |
| `<run_id>.json` | a run's page | the record below |
| `<run_id>.workspace.json` | its Workspace tab, when opened | `root`, `inlined_bytes`, and `files`: `{path, size, inlined, text?, skipped_reason?}`; small text files inlined |
| `<run_id>.judge.json` | its Judge tab, when opened (optional) | the judge's own trace: `{events, sessions, summary}` |

A pipeline that publishes the records must first take out credentials, and
anything that points at its accounts or machines. PostTrainBench's
`extract_traces.py` does this; every other pipeline must too.

## Index row (`index.json` → `runs[]`, and `index_row` in the record)

Required:
- `run_id`: the file name stem; unique.
- `run_name`
- `experiment`
- `benchmark`
- `trained_model`: the base model, with `/` written as `_`.
- `agent_model`
- `trace_format`: `claude_code`, `codex`, `opencode`, `cursor` or `verifiers`.

Score:
- `accuracy`: 0–1, or `null` when there's no score.
- `stderr`
- `num_seeds`
- `score_source`

Size:
- `duration_ms`
- `time_taken`: `H:MM:SS`.
- `time_budget_h`
- `num_turns`
- `session_count`
- `total_cost_usd`
- `api_usage`

Judge, all `null` when no judge ran:
- `contamination`
- `disallowed_model`
- `judge_version`
- `has_judge`

What the record has:
- `has_error_log`
- `has_system_monitor`

Optional:
- `seed`
- `v12`
- `ptb_lookup`
- `harness`: the harness that ran the agent (for `verifiers` records), shown in place of `trace_format`.
- `display_name`: shown as the run's name in the table.
- `started_at`: ISO 8601. Gives the "started" column and the newest-first order.
- `status`
- `reward_valid`

## Record (`<run_id>.json`)

Top-level fields:
- `index_row`: as above.
- `meta`: `run_id`, `run_name`, `experiment`, `benchmark`, `trained_model`, `seed`, `time_budget_h`, `trace_format`, plus, optionally, `harness`, `status`, `finished`, `build_ts` and `schema_version`.
- `summary`: `agent_models`, `num_turns`, `duration_ms`, `duration_api_ms`, `total_cost_usd`, `session_count`, `session_ids`, `stop_reasons`, `usage_total` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `tools_offered`, `permission_mode`, `cwd`, `final_result_text`, plus, optionally, `harness`, `harness_version` and `claude_code_version`.
- `sessions[]`: one per session segment: `session_idx`, `session_id`, `ts_start`, `model`, `cwd`, `tools`, …
- `events[]`: below.
- `costs` (optional): what was billed, never an estimate. `api_usd` is the model provider's own figure for the agent's calls, `prime` what the compute provider billed for the run's machines (`usd`, `items[]` with `what`, `usd`, `hours`, `billed_until`; `missing[]`; `read_at`), `total_usd` their sum; a part nobody reported is `null`. With it, the run page shows compute and API cost apart, and `total_cost_usd` is `total_usd`.
- `metrics`: the scores. `by_theme` (`{name: 0–1}`) is the breakdown; `breakdown_label` optionally names it (for example "Final benchmarks").
- `metrics_averaged`
- `score`
- `judgements`: `{contamination, disallowed_model, version}`, each `null` or `{flagged, justification}`. `null` altogether when no judge ran, and then there's no Judge tab.
- `judge_traces`
- `monitor`: below. `null` or absent when no monitor checked the agent's tool calls, and then there's no Monitor tab.
- `prompt`
- `time_taken`
- `error_log`
- `output_log`
- `final_eval`: trimmed text.
- `system_monitor[]`: below.

### Events

Each event has:
- `type`: `system`, `user`, `assistant` or `result`;
- `subtype`;
- `ts`: ISO 8601;
- `session_idx`.

`user` and `assistant` events have `blocks[]`, in the order the model wrote them:
- `{type: "text", text}`
- `{type: "thinking", thinking}`
- `{type: "tool_use", id, name, input}`
- `{type: "tool_result", tool_use_id, content, is_error}`

`assistant` events may also carry `model` and `usage`.

`system` events by `subtype`:
- `init`: a session starts;
- `system_prompt`: the system prompt, in `raw.text`;
- `harness_note`: a message the harness gave the agent between turns, in `raw.text`;
- anything else is shown as its `raw` JSON.

`result` events end a session: `stop_reason`, `result_text`, `duration_ms`, `total_cost_usd`.

### Monitor

`monitor` is the record of a monitor that checked each tool call of the agent before it ran. The Monitor tab shows it, and a tool call in the trace gets a chip when its decision is not a plain allow.

- `mode`: `enforce` (a call that was not allowed did not run) or `log` (nothing was blocked; a block is what would have happened);
- `judge_model`: the model that judged the calls no rule decided, or `null`;
- `rules_sha256`: the hash of the rules file;
- `counts`: `calls`, `allowed`, `flagged`, `blocked`, `results_withheld`, `judged`, and, when there were any, `errors` and `judge_errors`;
- `violations`: `{reason: blocked calls}`, a reason being a rule's id or `judge:<category>`, and `max_violations`, the count for one reason at which the run ends;
- `stopped`: `null`, or `{time, kind, count, call}` when the monitor ended the run;
- `errors[]`: what went wrong inside the monitor (the calls concerned ran);
- `all_decisions`: whether `decisions[]` has every decision; otherwise it has only those that are not a plain allow;
- `decisions[]`: below.

Each decision has:
- `time`: seconds since the epoch;
- `call`: the `id` of the `tool_use` block it is about, and `tool`, its name;
- `phase`: `call`, or `result` for a result that was kept from the agent;
- `verdict`: `allow`, `flag` or `block`;
- `source`: `rule`, `judge` or `none`, and `rule`, the id of the rule that matched;
- `enforced`: whether the block was applied;
- and, optionally, `category`, `reason`, `matched` (the text a rule matched), `excerpt` (the start of the call's arguments), `context` (the text around a match in a result), `suggestion`, and `judge`: `{seconds, model, usage: {prompt_tokens, completion_tokens, cached_input_tokens}, truncated, error, verdict}`.

### System monitor

`system_monitor[]` holds one snapshot every sampling interval, each with `ts` (ISO 8601) and any of the following.

GPUs:
- `gpus[]`, one entry per GPU: `{id, util_pct, mem_util_pct, mem_used_mib, mem_total_mib, temp_c, power_w}`;
- `gpu`: one such object (PostTrainBench samples one GPU); used when `gpus` is absent;
- `gpu_processes[]`: `{gpu, pid, mem_mib, name}`.

The machine:
- `cpu_count`
- `cpu_load_1m`, `cpu_load_5m`, `cpu_load_15m`
- `mem_used_gib`, `mem_total_gib`
- `disk_used_gib`, `disk_total_gib`

A metric no snapshot has gets no chart.
