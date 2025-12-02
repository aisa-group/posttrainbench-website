// Per-model benchmark data (values are percentages already multiplied by 100)
const modelBenchmarkData = {
    "base-model": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 14.0625,
            gsm8k: 12.66,
            humaneval: 7.93
        },
        "Qwen3-4B": {
            aime2025: 3.33,
            bfcl: 0.0,
            gpqamain: 13.39,
            gsm8k: 41.85,
            humaneval: 36.59
        },
        "SmolLM3-3B": {
            aime2025: 3.33,
            bfcl: 0.0,
            gpqamain: 4.91,
            gsm8k: 21.08,
            humaneval: 6.10
        },
        "Gemma-3-4B-IT": {
            aime2025: 0.0,
            bfcl: 6.0,
            gpqamain: 1.56,
            gsm8k: 6.14,
            humaneval: 0.61
        }
    },
    "sonnet-4.5": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 14.0625,
            gsm8k: 2.81,
            humaneval: 7.93
        },
        "Qwen3-4B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 4.91,
            gsm8k: 38.51,
            humaneval: 36.59
        },
        "SmolLM3-3B": {
            aime2025: 3.33,
            bfcl: 0.0,
            gpqamain: 4.91,
            gsm8k: 21.08,
            humaneval: 4.88
        },
        "Gemma-3-4B-IT": {
            aime2025: 0.0,
            bfcl: 6.0,
            gpqamain: 0.0,
            gsm8k: 36.85,
            humaneval: 0.61
        }
    },
    "codex-5.1": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 14.0625,
            gsm8k: 9.10,
            humaneval: 35.98
        },
        "Qwen3-4B": {
            aime2025: 0.0,
            bfcl: 86.0,
            gpqamain: 30.36,
            gsm8k: 47.16,
            humaneval: 49.39
        },
        "SmolLM3-3B": {
            aime2025: 3.33,
            bfcl: 95.0,
            gpqamain: 28.35,
            gsm8k: 52.24,
            humaneval: 25.61
        },
        "Gemma-3-4B-IT": {
            aime2025: 0.0,
            bfcl: 39.0,
            gpqamain: 14.96,
            gsm8k: 6.14,
            humaneval: 0.61
        }
    },
    "human": {
        "Qwen3-1.7B": {
            aime2025: 26.67,
            bfcl: 94.0,
            gpqamain: 35.49,
            gsm8k: 88.48,
            humaneval: 68.90
        },
        "Qwen3-4B": {
            aime2025: 53.33,
            bfcl: 95.0,
            gpqamain: 44.64,
            gsm8k: 93.78,
            humaneval: 76.83
        },
        "SmolLM3-3B": {
            aime2025: 26.67,
            bfcl: 84.0,
            gpqamain: 33.26,
            gsm8k: 82.18,
            humaneval: 70.12
        },
        "Gemma-3-4B-IT": {
            aime2025: 10.0,
            bfcl: 67.0,
            gpqamain: 31.47,
            gsm8k: 83.55,
            humaneval: 69.51
        }
    }
};

// Calculate average scores across all models for each agent
function calculateAverageAcrossModels(agentKey) {
    const models = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "Gemma-3-4B-IT"];
    const benchmarks = ["aime2025", "bfcl", "gpqamain", "gsm8k", "humaneval"];

    let totalSum = 0;
    let count = 0;

    models.forEach(model => {
        benchmarks.forEach(benchmark => {
            totalSum += modelBenchmarkData[agentKey][model][benchmark];
            count++;
        });
    });

    return (totalSum / count).toFixed(2);
}

// Calculate average for a specific model across all benchmarks
function calculateAverageForModel(agentKey, modelName) {
    const scores = modelBenchmarkData[agentKey][modelName];
    const values = Object.values(scores);
    return (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2);
}

// Calculate average across all models for each benchmark
function getAverageBenchmarkScores(agentKey) {
    const models = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "Gemma-3-4B-IT"];
    const benchmarks = ["aime2025", "bfcl", "gpqamain", "gsm8k", "humaneval"];
    const avgScores = {};

    benchmarks.forEach(benchmark => {
        const sum = models.reduce((acc, model) => {
            return acc + modelBenchmarkData[agentKey][model][benchmark];
        }, 0);
        avgScores[benchmark] = (sum / models.length).toFixed(2);
    });

    return avgScores;
}

// Leaderboard data
const leaderboardDataRaw = [
    {
        agent: "Human Post-Trained",
        averageScore: calculateAverageAcrossModels("human"),
        benchmarkScores: getAverageBenchmarkScores("human"),
        description: "Reference implementation"
    },
    {
        agent: "Base Model",
        averageScore: calculateAverageAcrossModels("base-model"),
        benchmarkScores: getAverageBenchmarkScores("base-model"),
        description: "No post-training (baseline)"
    },
    {
        agent: "Codex 5.1",
        averageScore: calculateAverageAcrossModels("codex-5.1"),
        benchmarkScores: getAverageBenchmarkScores("codex-5.1"),
        description: "Codex 5.1 agent"
    },
    {
        agent: "Sonnet 4.5",
        averageScore: calculateAverageAcrossModels("sonnet-4.5"),
        benchmarkScores: getAverageBenchmarkScores("sonnet-4.5"),
        description: "Claude Sonnet 4.5 agent"
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
    },
    {
        title: "HumanEval",
        difficulty: "medium",
        description: "Evaluates code generation capabilities through hand-written programming problems.",
        category: "Coding"
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
