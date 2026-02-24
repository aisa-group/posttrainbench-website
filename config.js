// Static configuration - edit this file to change agent names, display settings, etc.

// Models used in benchmarks
const baseModels = ["Qwen3-1.7B-Base", "Qwen3-4B-Base", "SmolLM3-3B-Base", "gemma-3-4b-pt"];
const humanModels = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "gemma-3-4b-it"];

// Display names for models in dropdown
const modelDisplayNames = {
    "Qwen3-1.7B-Base": "Qwen3-1.7B",
    "Qwen3-4B-Base": "Qwen3-4B",
    "SmolLM3-3B-Base": "SmolLM3-3B",
    "gemma-3-4b-pt": "Gemma-3-4B"
};

// Agents to show in main chart (others appear in table only)
const chartAgentKeys = [
    "human",
    "opus-4.6",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gemini-3-pro",
    "opus-4.5",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "sonnet-4.5",
    "sonnet-4.6",
    "gemini-3.1-pro",
    "glm-5",
    "base-model"
];

// Agents to show in time spent chart
const timeChartAgentKeys = [
    "opus-4.6",
    "opus-4.5",
    "opus-4.5-opencode",
    "gemini-3-pro",
    "gemini-3-pro-opencode",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-max-opencode",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "glm-5",
    "kimi-k2.5",
    "minimax-m2.5",
    "qwen3-max",
    "sonnet-4.6",
    "gemini-3.1-pro",
    "human",
];

// All agents (for table) - order determines display order before sorting by score
const allAgentKeys = [
    "human",
    "opus-4.6",
    "gpt-5.2",
    "gpt-5.1-codex-max",
    "gemini-3-pro",
    "opus-4.5",
    "gpt-5.2-codex",
    "gpt-5.3-codex",
    "sonnet-4.5",
    "sonnet-4.6",
    "minimax-m2.1",
    "glm-4.7",
    "base-model",
    "base-model-fewshot",
    "opus-4.5-opencode",
    "gemini-3-pro-opencode",
    "gpt-5.1-codex-max-opencode",
    "kimi-k2",
    "kimi-k2.5",
    "minimax-m2.5",
    "glm-5",
    "gemini-3.1-pro",
    "qwen3-max"
];

// Agent display names and metadata
const agentInfo = {
    "human": { name: "Instruction Tuned", description: "Reference implementation", isBaseline: true },
    "base-model": { name: "Base Model", description: "No post-training, zero-shot (baseline)", isBaseline: true, scaffold: "Zero Shot" },
    "base-model-fewshot": { name: "Base Model", description: "No post-training, few-shot (baseline)", isBaseline: true, scaffold: "Few Shot" },
    "gpt-5.2": { name: "GPT-5.2", description: "GPT-5.2 agent", scaffold: "Codex CLI" },
    "gpt-5.1-codex-max": { name: "GPT 5.1 Codex Max", description: "GPT 5.1 Codex Max agent", scaffold: "Codex CLI" },
    "gpt-5.2-codex": { name: "GPT 5.2 Codex", description: "GPT 5.2 Codex agent", scaffold: "Codex CLI" },
    "opus-4.5": { name: "Opus 4.5", description: "Claude Opus 4.5 agent", scaffold: "Claude Code" },
    "gemini-3-pro": { name: "Gemini 3 Pro", description: "Gemini 3 Pro agent", scaffold: "Gemini CLI" },
    "gemini-3.1-pro": { name: "Gemini 3.1 Pro", description: "Gemini 3.1 Pro agent", scaffold: "OpenCode" },
    "sonnet-4.5": { name: "Sonnet 4.5", description: "Claude Sonnet 4.5 agent", scaffold: "Claude Code" },
    "sonnet-4.6": { name: "Sonnet 4.6", description: "Claude Sonnet 4.6 agent", scaffold: "Claude Code" },
    "glm-4.7": { name: "GLM 4.7", description: "GLM 4.7 agent", scaffold: "OpenCode" },
    "minimax-m2.1": { name: "MiniMax M2.1", description: "MiniMax M2.1 agent", scaffold: "OpenCode" },
    "opus-4.5-opencode": { name: "Opus 4.5", description: "Claude Opus 4.5 with OpenCode", isOpenCode: true, scaffold: "OpenCode" },
    "gemini-3-pro-opencode": { name: "Gemini 3 Pro", description: "Gemini 3 Pro with OpenCode", isOpenCode: true, scaffold: "OpenCode" },
    "gpt-5.1-codex-max-opencode": { name: "GPT 5.1 Codex Max", description: "GPT 5.1 Codex Max with OpenCode", isOpenCode: true, scaffold: "OpenCode" },
    "kimi-k2": { name: "Kimi K2 Thinking", description: "Kimi K2 Thinking agent", isOpenCode: true, scaffold: "OpenCode" },
    "kimi-k2.5": { name: "Kimi K2.5", description: "Kimi K2.5 agent", isOpenCode: true, scaffold: "OpenCode" },
    "minimax-m2.5": { name: "MiniMax M2.5", description: "MiniMax M2.5 agent", isOpenCode: true, scaffold: "OpenCode" },
    "glm-5": { name: "GLM 5", description: "GLM 5 agent", isOpenCode: true, scaffold: "OpenCode" },
    "opus-4.6": { name: "Opus 4.6", description: "Claude Opus 4.6 agent", scaffold: "Claude Code" },
    "gpt-5.3-codex": { name: "GPT 5.3 Codex", description: "GPT 5.3 Codex agent", scaffold: "Codex CLI" },
    "qwen3-max": { name: "Qwen3 Max", description: "Qwen3 Max agent", isOpenCode: true, scaffold: "Claude Code" }
};

// Benchmark metadata (weights are loaded from scores.json)
const benchmarkInfo = {
    aime2025: { title: "AIME 2025", version: "", difficulty: "hard", category: "Mathematics", description: "American Invitational Mathematics Examination - tests advanced mathematical problem-solving and reasoning capabilities." },
    arenahardwriting: { title: "Arena Hard", version: "Writing", difficulty: "medium", category: "Writing", description: "Arena Hard Writing benchmark - evaluates writing quality and instruction following." },
    bfcl: { title: "BFCL", version: "V1", difficulty: "medium", category: "Function Calling", description: "Berkeley Function Calling Leaderboard - evaluates function calling and tool use capabilities." },
    gpqamain: { title: "GPQA", version: "Main", difficulty: "hard", category: "Knowledge", description: "Graduate-level Google-Proof Q&A - tests expert-level knowledge across science domains." },
    gsm8k: { title: "GSM8K", version: "", difficulty: "medium", category: "Mathematics", description: "Grade School Math 8K - evaluates mathematical reasoning and multi-step problem solving." },
    healthbench: { title: "HealthBench", version: "", difficulty: "hard", category: "Healthcare", description: "Health and medical knowledge benchmark - tests understanding of healthcare and medical concepts." },
    humaneval: { title: "HumanEval", version: "", difficulty: "medium", category: "Coding", description: "Evaluates code generation capabilities through hand-written programming problems." }
};

// Training setup information
const setupInfo = {
    models: ["Qwen3 1.7B", "Qwen3 4B", "SmolLM3 3B", "Gemma 3 4B"],
    hardware: "H100 GPU",
    timeLimit: "10 hours",
    modelsPerAgent: 4
};
