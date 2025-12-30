// Per-model benchmark data
const modelBenchmarkData = {
    "base-model": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 14.06,
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
        "Gemma-3-4B": {
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
            gpqamain: 16.74,
            gsm8k: 12.66,
            humaneval: 0.61
        },
        "Qwen3-4B": {
            aime2025: 3.33,
            bfcl: 0.0,
            gpqamain: 13.39,
            gsm8k: 41.85,
            humaneval: 44.51
        },
        "SmolLM3-3B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 3.13,
            gsm8k: 21.08,
            humaneval: 12.20
        },
        "Gemma-3-4B": {
            aime2025: 0.0,
            bfcl: 6.0,
            gpqamain: 25.22,
            gsm8k: 57.92,
            humaneval: 34.76
        }
    },
    "opus-4.5": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 90.0,
            gpqamain: 14.73,
            gsm8k: 5.84,
            humaneval: 12.20
        },
        "Qwen3-4B": {
            aime2025: 3.33,
            bfcl: 0.0,
            gpqamain: 5.80,
            gsm8k: 5.53,
            humaneval: 36.59
        },
        "SmolLM3-3B": {
            aime2025: 10.0,
            bfcl: 0.0,
            gpqamain: 4.91,
            gsm8k: 60.50,
            humaneval: 9.76
        },
        "Gemma-3-4B": {
            aime2025: 0.0,
            bfcl: 71.0,
            gpqamain: 1.56,
            gsm8k: 34.80,
            humaneval: 35.37
        }
    },
    "codex-5.1": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 88.0,
            gpqamain: 28.79,
            gsm8k: 47.16,
            humaneval: 20.12
        },
        "Qwen3-4B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 26.12,
            gsm8k: 74.53,
            humaneval: 40.85
        },
        "SmolLM3-3B": {
            aime2025: 3.33,
            bfcl: 91.0,
            gpqamain: 30.58,
            gsm8k: 7.81,
            humaneval: 36.59
        },
        "Gemma-3-4B": {
            aime2025: 0.0,
            bfcl: 89.0,
            gpqamain: 33.04,
            gsm8k: 47.69,
            humaneval: 34.15
        }
    },
    "gpt-5.2": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 5.0,
            gpqamain: 16.74,
            gsm8k: 12.66,
            humaneval: 12.20
        },
        "Qwen3-4B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 14.06,
            gsm8k: 45.49,
            humaneval: 36.59
        },
        "SmolLM3-3B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 23.44,
            gsm8k: 41.47,
            humaneval: 6.10
        },
        "Gemma-3-4B": {
            aime2025: 0.0,
            bfcl: 49.0,
            gpqamain: 25.45,
            gsm8k: 38.13,
            humaneval: 23.17
        }
    },
    "gemini-3-pro": {
        "Qwen3-1.7B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 26.79,
            gsm8k: 12.66,
            humaneval: 6.10
        },
        "Qwen3-4B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 17.63,
            gsm8k: 41.85,
            humaneval: 34.15
        },
        "SmolLM3-3B": {
            aime2025: 0.0,
            bfcl: 0.0,
            gpqamain: 25.22,
            gsm8k: 21.08,
            humaneval: 9.76
        },
        "Gemma-3-4B": {
            aime2025: 3.33,
            bfcl: 66.0,
            gpqamain: 6.70,
            gsm8k: 47.38,
            humaneval: 42.07
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
            humaneval: 77.44
        },
        "SmolLM3-3B": {
            aime2025: 26.67,
            bfcl: 84.0,
            gpqamain: 33.26,
            gsm8k: 82.18,
            humaneval: 70.12
        },
        "Gemma-3-4B": {
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
    const models = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "Gemma-3-4B"];
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
    const models = ["Qwen3-1.7B", "Qwen3-4B", "SmolLM3-3B", "Gemma-3-4B"];
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
        agent: "GPT 5.1 Codex Max",
        averageScore: calculateAverageAcrossModels("codex-5.1"),
        benchmarkScores: getAverageBenchmarkScores("codex-5.1"),
        description: "GPT 5.1 Codex Max agent"
    },
    {
        agent: "Sonnet 4.5",
        averageScore: calculateAverageAcrossModels("sonnet-4.5"),
        benchmarkScores: getAverageBenchmarkScores("sonnet-4.5"),
        description: "Claude Sonnet 4.5 agent"
    },
    {
        agent: "Opus 4.5",
        averageScore: calculateAverageAcrossModels("opus-4.5"),
        benchmarkScores: getAverageBenchmarkScores("opus-4.5"),
        description: "Claude Opus 4.5 agent"
    },
    {
        agent: "GPT-5.2",
        averageScore: calculateAverageAcrossModels("gpt-5.2"),
        benchmarkScores: getAverageBenchmarkScores("gpt-5.2"),
        description: "GPT-5.2 agent"
    },
    {
        agent: "Gemini 3 Pro",
        averageScore: calculateAverageAcrossModels("gemini-3-pro"),
        benchmarkScores: getAverageBenchmarkScores("gemini-3-pro"),
        description: "Gemini 3 Pro agent"
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
        version: "",
        difficulty: "hard",
        description: "American Invitational Mathematics Examination - tests advanced mathematical problem-solving and reasoning capabilities.",
        category: "Mathematics"
    },
    {
        title: "BFCL",
        version: "V1",
        difficulty: "medium",
        description: "Berkeley Function Calling Leaderboard - evaluates function calling and tool use capabilities.",
        category: "Function Calling"
    },
    {
        title: "GPQA",
        version: "Main",
        difficulty: "hard",
        description: "Graduate-level Google-Proof Q&A - tests expert-level knowledge across science domains.",
        category: "Knowledge"
    },
    {
        title: "GSM8K",
        version: "",
        difficulty: "medium",
        description: "Grade School Math 8K - evaluates mathematical reasoning and multi-step problem solving.",
        category: "Mathematics"
    },
    {
        title: "HumanEval",
        version: "",
        difficulty: "medium",
        description: "Evaluates code generation capabilities through hand-written programming problems.",
        category: "Coding"
    }
];

// Training setup information (unused rn)
const setupInfo = {
    models: ["Qwen 3.1 7B", "Qwen 3 4B", "SmolLM3-3B", "Gemma 3 4B"],
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

// Time spent data (in hours:minutes format, converted to decimal hours)
const timeSpentData = [
    {
        agent: "Opus 4.5",
        time: "8:13",
        hours: 8.224
    },
    {
        agent: "Sonnet 4.5",
        time: "3:18",
        hours: 3.300
    },
    {
        agent: "GPT 5.1 Codex Max",
        time: "3:27",
        hours: 3.457
    },
    {
        agent: "GPT-5.2",
        time: "1:49",
        hours: 1.823
    },
    {
        agent: "Gemini 3 Pro",
        time: "6:49",
        hours: 6.816
    }
];