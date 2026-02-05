# PostTrainBench Website


## Local dev

```bash
# Start local server
python3 -m http.server 8000

# Open in browser
open http://localhost:8000
```


## Project Structure

```
post-train-bench-website/
├── index.html              # Main HTML page
├── styles.css              # Styling 
├── config.js               # Static configuration (agent names, display settings)
├── data.js                 # Data loading logic and computations
├── script.js               # UI logic 
├── scores.json             # Generated benchmark data (from CSVs)
├── generate_data.py        # Script to generate scores.json from CSVs
├── data/                   # Source CSV data files
│   ├── factors.json               # Benchmark weights
│   ├── aggregated_baseline.csv    # Base model & instruction-tuned scores
│   ├── aggregated_avg_*.csv       # Agent average scores
│   ├── aggregated_std_*.csv       # Agent standard deviations
│   ├── aggregated_opencode_*.csv  # OpenCode agent raw data
│   ├── final_opencode_*.csv       # OpenCode agent final values
│   ├── time_aggregated.csv        # Time data with std (multiple runs)
│   └── aggregated_time_overview.csv  # Time data (single run)
└── README.md
```

## Updating Data

When you have new benchmark results:

1. **Update CSV files** in `data/`

2. **Regenerate scores.json:**
   ```bash
   python3 generate_data.py
   ```


### CSV File Formats

**Baseline data** (`aggregated_baseline.csv`):
```csv
model,aime2025,arenahardwriting,bfcl,gpqamain,gsm8k,healthbench,humaneval
Qwen3-1.7B,0.266,0.5,0.94,0.354,0.884,0.449,0.689
Qwen3-1.7B-Base,0.0,0.009,0.0,0.140,0.126,0.075,0.079
...
```

**Agent scores** (`aggregated_avg_*.csv`):
```csv
model,aime2025,arenahardwriting,bfcl,gpqamain,gsm8k,healthbench,humaneval
Qwen3-1.7B-Base,0.022,0.004,0.293,0.174,0.509,0.093,0.327
...
```

**Per-model standard deviations** (`aggregated_std_*.csv`):
- Same format as agent scores, values are standard deviations per benchmark
- Used for model-specific view in the table dropdown

**Pre-calculated aggregated scores** (`single_metrics_aggregated.csv`):
```csv
agent,avg,std,n
GPT-5.2,0.2148,0.0253,3
Opus-4.5,0.1711,0.0458,3
...
```
- `avg`: Overall average score across all models (0-1 scale)
- `std`: Standard deviation of the average score
- `n`: Number of runs
- Used for main chart error bars and table display

**OpenCode agents** - Two files per agent:
- `aggregated_opencode_*.csv` - Raw data with "not stored" or "ERR" for missing/failed
- `final_opencode_*.csv` - Final values with base model fallbacks filled in

**Benchmark weights** (`factors.json`):
```json
{
    "aime2025": 0.2265,
    "arenahardwriting": 0.0903,
    ...
}
```

## Adding a New Agent

### 1. Add CSV files

Place the agent's CSV files in `data/`:
- For proprietary agents: `aggregated_avg_AgentName.csv` and `aggregated_std_AgentName.csv`
- For OpenCode agents: `aggregated_opencode_*.csv` and `final_opencode_*.csv`

### 2. Update generate_data.py

Add the CSV filename mapping:

```python
# For proprietary agents with std data
CSV_TO_AGENT = {
    ...
    "aggregated_avg_NewAgent.csv": "new-agent",
}

STD_CSV_TO_AGENT = {
    ...
    "aggregated_std_NewAgent.csv": "new-agent",
}

# For OpenCode agents
OPENCODE_CSV_TO_AGENT = {
    ...
    "opencode_new-agent_10h": "new-agent-opencode",
}
```

### 3. Update config.js

Add agent configuration:

```javascript
// Add to allAgentKeys array
const allAgentKeys = [
    ...
    "new-agent",
];

// Add to chartAgentKeys if it should appear in the main chart
const chartAgentKeys = [
    ...
    "new-agent",  // Only add if you want it in the chart
];

// Add agent info
const agentInfo = {
    ...
    "new-agent": {
        name: "New Agent",
        description: "Description here",
        scaffold: "scaffold name",  // CLI tool name (e.g., "codex cli", "opencode")
        // Optional flags:
        // isBaseline: true,  // For baseline models
        // isOpenCode: true,  // For OpenCode variants
    },
};
```

### 4. Regenerate data

```bash
python3 generate_data.py
```
## Development

### File Responsibilities

| File | Purpose |
|------|---------|
| `config.js` | Static config that rarely changes |
| `data.js` | Data loading and computation functions |
| `scores.json` | Generated benchmark data (don't edit manually) |
| `script.js` | UI rendering and interactions |
| `generate_data.py` | Converts CSVs to scores.json |


