let benchmarkWeights = {};
let modelBenchmarkData = {};
let aggregatedScores = {};
let stdData = {};
let timeData = {};
let taskData = [];
let leaderboardData = [];
let timeSpentData = [];
let statistics = {};

function calculateWeightedAverage(agentKey) {
    const benchmarks = Object.keys(benchmarkWeights);
    let totalWeightedSum = 0;
    let modelCount = 0;

    baseModels.forEach(model => {
        let modelWeightedSum = 0;
        benchmarks.forEach(benchmark => {
            const score = modelBenchmarkData[agentKey][model][benchmark].value;
            modelWeightedSum += score * benchmarkWeights[benchmark];
        });
        totalWeightedSum += modelWeightedSum;
        modelCount++;
    });

    return (totalWeightedSum / modelCount).toFixed(2);
}

function calculateWeightedAverageForModel(agentKey, modelName) {
    const benchmarks = Object.keys(benchmarkWeights);
    let weightedSum = 0;

    benchmarks.forEach(benchmark => {
        const score = modelBenchmarkData[agentKey][modelName][benchmark].value;
        weightedSum += score * benchmarkWeights[benchmark];
    });

    return weightedSum.toFixed(2);
}

function calculateWeightedAverageStd(agentKey) {
    if (!stdData[agentKey]) return null;

    const benchmarks = Object.keys(benchmarkWeights);
    let totalVarianceSum = 0;
    let modelCount = 0;

    baseModels.forEach(model => {
        let modelVarianceSum = 0;
        benchmarks.forEach(benchmark => {
            const std = stdData[agentKey][model][benchmark];
            const weight = benchmarkWeights[benchmark];
            modelVarianceSum += (weight * weight) * (std * std);
        });
        totalVarianceSum += modelVarianceSum;
        modelCount++;
    });

    const avgVariance = totalVarianceSum / modelCount;
    return Math.sqrt(avgVariance).toFixed(2);
}

function getAverageBenchmarkScores(agentKey) {
    const benchmarks = Object.keys(benchmarkWeights);
    const avgScores = {};

    benchmarks.forEach(benchmark => {
        let sum = 0;
        let stdSum = 0;
        let hasStd = false;

        baseModels.forEach(model => {
            const entry = modelBenchmarkData[agentKey][model][benchmark];
            sum += entry.value;

            if (stdData[agentKey] && stdData[agentKey][model] && stdData[agentKey][model][benchmark] !== undefined) {
                stdSum += stdData[agentKey][model][benchmark];
                hasStd = true;
            }
        });

        avgScores[benchmark] = {
            value: (sum / baseModels.length).toFixed(2),
            std: hasStd ? (stdSum / baseModels.length).toFixed(2) : null,
            fallbackType: false
        };
    });

    return avgScores;
}

function getAverageScore(agentKey) {
    if (aggregatedScores[agentKey]) {
        return aggregatedScores[agentKey].avg.toFixed(2);
    }
    return calculateWeightedAverage(agentKey);
}

function getStdDev(agentKey) {
    if (aggregatedScores[agentKey]) {
        return aggregatedScores[agentKey].std.toFixed(2);
    }
    return calculateWeightedAverageStd(agentKey);
}

function buildLeaderboardData() {
    const leaderboardDataRaw = allAgentKeys
        .filter(key => modelBenchmarkData[key])
        .map(key => ({
            agentKey: key,
            agent: agentInfo[key].name,
            averageScore: getAverageScore(key),
            stdDev: getStdDev(key),
            benchmarkScores: getAverageBenchmarkScores(key),
            description: agentInfo[key].description,
            isBaseline: agentInfo[key].isBaseline || false,
            isOpenCode: agentInfo[key].isOpenCode || false,
            scaffold: agentInfo[key].scaffold || null,
            showInChart: chartAgentKeys.includes(key)
        }));

    const sorted = leaderboardDataRaw.sort((a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore));

    let agentRank = 1;
    leaderboardData = sorted.map(entry => {
        if (entry.isBaseline) return { ...entry, rank: null };
        return { ...entry, rank: agentRank++ };
    });
}

function buildTaskData() {
    taskData = Object.entries(benchmarkInfo).map(([key, info]) => ({
        ...info,
        weight: benchmarkWeights[key]
    }));
}

function buildStatistics() {
    statistics = {
        totalBenchmarks: taskData.length,
        totalAgents: leaderboardData.filter(e => !e.isBaseline && !e.isOpenCode).length,
        totalModels: setupInfo.models.length,
        timeLimit: setupInfo.timeLimit
    };
}

function buildTimeSpentData() {
    timeSpentData = Object.entries(timeData)
        .filter(([key]) => agentInfo[key])
        .map(([key, data]) => ({
            agentKey: key,
            agent: agentInfo[key].name,
            time: data.time,
            hours: data.hours,
            stdHours: data.stdHours,
            stdTime: data.stdTime,
            n: data.n,
            isBaseline: agentInfo[key].isBaseline || false
        }));
}

async function loadScoresData() {
    try {
        const response = await fetch('scores.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        benchmarkWeights = data.benchmarkWeights;
        modelBenchmarkData = data.modelBenchmarkData;
        aggregatedScores = data.aggregatedScores || {};
        stdData = data.stdData || {};
        timeData = data.timeData || {};

        buildLeaderboardData();
        buildTaskData();
        buildStatistics();
        buildTimeSpentData();

        return true;
    } catch (error) {
        console.error('Failed to load scores.json:', error);
        return false;
    }
}
