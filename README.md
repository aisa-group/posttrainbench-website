# PostTrainBench Website

Static site for [posttrainbench.com](https://posttrainbench.com): the leaderboard, the blog and the
trace viewer. There is no build step; GitHub Pages serves the repo as-is (custom domain in `CNAME`).

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Layout

| Path | What it is |
|------|------------|
| `index.html`, `script.js`, `styles.css` | The main page: leaderboard, charts, scoring, setup, observations |
| `config.js` | Agent display names and metadata, and which agents appear in each chart |
| `data.js` | Loads a score bundle and computes the leaderboard from it |
| `scores-v1.2.{js,json}` | **Current** results (v1.2), generated from `data/v1.2/` |
| `scores.{js,json}` | v1.1 results, generated from `data/` |
| `scores-v1.js` | Archived v1 results, frozen; never regenerated |
| `generate_data.py` | Builds the score bundles from the CSVs in `data/` |
| `blog/` | Blog index and posts |
| `traces/` | Trace viewer (see below) |
| `tooltip.js`, `photo-mode.js` | Leaderboard tooltips; a hidden screenshot mode (type `photo` or add `?photo`) |
| `paper-plots/` | Figures and tables for the paper; not used by the site |

The page shows v1.2 by default (`data-current-results-version` on `<html>` in `index.html`);
`?version=v1.1` or `?version=v1` shows an older leaderboard.

## Updating results

1. Put the aggregation outputs in `data/v1.2/`:
   - `aggregated_avg_<Agent>.csv` and `aggregated_std_<Agent>.csv`, one row per base model,
     scores in 0–1:
     ```csv
     model,aime2025,arenahardwriting,gpqamain,gsm8k,healthbench,humaneval
     Qwen3-1.7B-Base,0.022,0.004,0.174,0.509,0.093,0.327
     ```
   - `single_metrics_aggregated.csv` (`agent,avg,std,n`): the overall score shown on the leaderboard
   - `time_aggregated.csv` (`agent,avg_time,std_time,n`) and `aggregated_time_overview.csv` for runtimes

   Baselines (`data/aggregated_baseline*.csv`) are shared across versions. Benchmark weights are
   in `data/factors-v1.2.json`.
2. Regenerate the bundle:
   ```bash
   python3 generate_data.py --version v1.2
   ```
   This writes `scores-v1.2.json` and `scores-v1.2.js`. It stops with an error if a published agent
   is missing scores, standard deviations, an overall score or a runtime.
3. Commit the CSVs and both generated files. Never edit the generated files by hand.

## Adding an agent

1. **`generate_data.py`**: map the agent's names to a key (e.g. `opus-5.5-max`):
   - `CSV_TO_AGENT` and `STD_CSV_TO_AGENT`: its `aggregated_avg_*` / `aggregated_std_*` filenames
   - `AGGREGATED_NAME_TO_KEY`: its name in `single_metrics_aggregated.csv`
   - `TIME_AGGREGATED_TO_KEY`: its name in `time_aggregated.csv`
   - `V12_AGENT_KEYS`: add the key to publish it
   - Single-run agents use `SINGLE_RUN_FINAL_TO_KEY` and `TIME_OVERVIEW_TO_KEY` instead.
   - If some of its cells are fallbacks from another agent, add a `CELL_PROVENANCE` entry so the
     leaderboard labels them.
2. **`config.js`**:
   - `agentInfo`: display name, description, scaffold, optional `reasoningEffort`, and flags such as
     `isExternal` or `provenanceLabel`
   - `allAgentKeys`: table order before sorting
   - `chartAgentKeys` (and `chartAgentKeysByVersion` to hide it from one version's chart):
     include it in the main chart
   - `timeChartAgentKeys`: include it in the budget chart
3. Regenerate the bundle (above).

## Blog

Each post is a folder, `blog/<slug>/index.html`, listed by hand in `blog/index.html`.
Posts share `blog/posttrainbench-1-1/article.css` (plus an optional `article.css` of their own),
`blog/nav.js` (mobile menu), `blog/toc.js` (highlights the current section in the contents list)
and the theme toggle from `traces/assets/theme.js`. Copy an existing post to start a new one.

## Trace viewer

`traces/` is the viewer's code only. Run data is loaded from the Hugging Face dataset
[`aisa-group/PostTrainBench-Trajectories`](https://huggingface.co/datasets/aisa-group/PostTrainBench-Trajectories),
set in `traces/config.js`. Both are produced by the separate `ptb-traces-pipeline` repo, whose
`deploy.sh` uploads the data and copies the viewer code here. Data-only updates need no change to
this repo.
