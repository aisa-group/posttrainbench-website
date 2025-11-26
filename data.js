// Raw benchmark results (from CSV)
const rawBenchmarkData = {
    "base-model": {
        aime2025: 1.67,
        arenahard: 0.0,
        bfcl: 1.5,
        gpqamain: 8.48,
        gsm8k: 20.43
    },
    "claude-post-trained": {
        aime2025: 0.0,
        arenahard: 0.0,
        bfcl: 0.0,
        gpqamain: 7.59,
        gsm8k: 0.0
    },
    "codex-post-trained": {
        aime2025: 0.0,
        arenahard: 0.0,
        bfcl: 0.0,
        gpqamain: 25.0,
        gsm8k: 0.0
    },
    "gemini-post-trained": {
        aime2025: 2.22,
        arenahard: 0.0,
        bfcl: 0.0,
        gpqamain: 21.21,
        gsm8k: 16.41
    },
    "post-trained-model": {
        aime2025: 27.5,
        arenahard: 11.78,
        bfcl: 85.25,
        gpqamain: 37.0,
        gsm8k: 86.98
    }
};

function calculateAverage(scores) {
    const values = Object.values(scores);
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

// Leaderboard data 
const leaderboardDataRaw = [
    {
        agent: "Human Post-Trained",
        averageScore: calculateAverage(rawBenchmarkData["post-trained-model"]),
        benchmarkScores: rawBenchmarkData["post-trained-model"],
        description: "Reference implementation"
    },
    {
        agent: "Gemini Post-Trained",
        averageScore: calculateAverage(rawBenchmarkData["gemini-post-trained"]),
        benchmarkScores: rawBenchmarkData["gemini-post-trained"],
        description: "Gemini CLI agent"
    },
    {
        agent: "Base Model",
        averageScore: calculateAverage(rawBenchmarkData["base-model"]),
        benchmarkScores: rawBenchmarkData["base-model"],
        description: "No post-training (baseline)"
    },
    {
        agent: "Codex Post-Trained",
        averageScore: calculateAverage(rawBenchmarkData["codex-post-trained"]),
        benchmarkScores: rawBenchmarkData["codex-post-trained"],
        description: "Codex CLI agent"
    },
    {
        agent: "Claude Post-Trained",
        averageScore: calculateAverage(rawBenchmarkData["claude-post-trained"]),
        benchmarkScores: rawBenchmarkData["claude-post-trained"],
        description: "Claude Code agent"
    }
];

// Sort by average score (descending) and assign ranks automatically
const leaderboardData = leaderboardDataRaw
    .sort((a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore))
    .map((entry, index) => ({
        ...entry,
        rank: index + 1
    }));

const taskData = [
    {
        title: "AIME 2025",
        difficulty: "hard",
        description: "American Invitational Mathematics Examination - tests advanced mathematical problem-solving and reasoning capabilities.",
        category: "Mathematics"
    },
    {
        title: "Arena Hard",
        difficulty: "hard",
        description: "Challenging benchmark for instruction-following and complex task completion across diverse domains.",
        category: "General"
    },
    {
        title: "BFCL",
        difficulty: "medium",
        description: "Berkeley Function Calling Leaderboard - evaluates function calling and tool use capabilities.",
        category: "Function Calling"
    },
    {
        title: "GPQA Main",
        difficulty: "hard",
        description: "Graduate-level Google-Proof Q&A - tests expert-level knowledge across science domains.",
        category: "Knowledge"
    },
    {
        title: "GSM8K",
        difficulty: "medium",
        description: "Grade School Math 8K - evaluates mathematical reasoning and multi-step problem solving.",
        category: "Mathematics"
    }
];

// Training setup information (unused rn)
const setupInfo = {
    models: ["Qwen 3.1 7B", "Qwen 3 4B", "SmolLM3-3B", "Gemma 3 4B IT"],
    hardware: "H100 GPU",
    timeLimit: "10 hours",
    modelsPerAgent: 4
};

// Statistics (unused rn)
const statistics = {
    totalBenchmarks: taskData.length,
    totalAgents: leaderboardData.length - 1, // excluding base model
    totalModels: setupInfo.models.length,
    timeLimit: setupInfo.timeLimit
};
