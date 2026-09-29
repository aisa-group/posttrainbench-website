# v1.2 result inputs

Drop the v1.2 aggregation outputs in this directory. Per-agent average and
standard-deviation CSVs use these columns:

```csv
model,aime2025,arenahardwriting,gpqamain,gsm8k,healthbench,humaneval
```

The directory also contains:

- `single_metrics_aggregated.csv` (`agent,avg,std,n`)
- `time_aggregated.csv` (`agent,avg_time,std_time,n`)
- optionally `time_overview.csv` or `aggregated_time_overview.csv` for
  single-run entries

The v1.2 roster is the complete v1.1 roster plus Fable 5.1, GLM 5.3,
GLM 5.3 Flash, GPT-6 Astra, and Opus 5.5. Locus is recomputed from
Intology's three original seed files after removing BFCL; its mean runtime
remains the submitted 9:38:12 across 84 runs.

Five underlying Fable 5.1 GPQA Main cells use Opus 5 fallback scores. The
generated bundle marks each aggregate GPQA Main value with that provenance.

Generate the isolated bundle with:

```bash
python3 generate_data.py --version v1.2
```

New filenames and aggregate agent names must be mapped in
`generate_data.py`, and published entries added to `V12_AGENT_KEYS`; display
metadata belongs in `config.js`.
