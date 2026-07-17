let benchmarkWeights = {};
let modelBenchmarkData = {};
let aggregatedScores = {};
let stdData = {};
let timeData = {};
let taskData = [];
let leaderboardData = [];
let timeSpentData = [];
let statistics = {};

const CURRENT_RESULTS_VERSION = 'v1.1';
const ARCHIVED_RESULTS_VERSION = 'v1';

function normalizeResultsVersion(version) {
    return version === ARCHIVED_RESULTS_VERSION
        ? ARCHIVED_RESULTS_VERSION
        : CURRENT_RESULTS_VERSION;
}

function getInitialResultsVersion() {
    if (typeof window === 'undefined') return CURRENT_RESULTS_VERSION;
    const requestedVersion = new URLSearchParams(window.location.search).get('version');
    return normalizeResultsVersion(requestedVersion);
}

let activeResultsVersion = getInitialResultsVersion();

function getInlinedScoresData(version = activeResultsVersion) {
    if (typeof window === 'undefined') return null;
    return version === ARCHIVED_RESULTS_VERSION
        ? window.SCORES_DATA_V1
        : window.SCORES_DATA;
}

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
        const sourceLabels = new Set();

        baseModels.forEach(model => {
            const entry = modelBenchmarkData[agentKey][model][benchmark];
            sum += entry.value;
            if (entry.sourceLabel) sourceLabels.add(entry.sourceLabel);

            if (stdData[agentKey] && stdData[agentKey][model] && stdData[agentKey][model][benchmark] !== undefined) {
                stdSum += stdData[agentKey][model][benchmark];
                hasStd = true;
            }
        });

        avgScores[benchmark] = {
            value: (sum / baseModels.length).toFixed(2),
            std: hasStd ? (stdSum / baseModels.length).toFixed(2) : null,
            fallbackType: false,
            sourceLabel: sourceLabels.size === 1 ? [...sourceLabels][0] : null
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
            reasoningEffort: agentInfo[key].reasoningEffort || null,
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
            isBaseline: agentInfo[key].isBaseline || false,
            reasoningEffort: agentInfo[key].reasoningEffort || null
        }));
}

function applyScoresData(data) {
    benchmarkWeights = data.benchmarkWeights;
    modelBenchmarkData = data.modelBenchmarkData;
    aggregatedScores = data.aggregatedScores || {};
    stdData = data.stdData || {};
    timeData = data.timeData || {};

    buildLeaderboardData();
    buildTaskData();
    buildStatistics();
    buildTimeSpentData();
}

function applyResultsVersion(version) {
    const normalizedVersion = normalizeResultsVersion(version);
    const data = getInlinedScoresData(normalizedVersion);
    if (!data) return false;

    activeResultsVersion = normalizedVersion;
    applyScoresData(data);
    return true;
}

// Synchronous init from the inlined scores.js (window.SCORES_DATA). Lets the
// leaderboard render before first paint. Returns false if the global is absent.
function loadScoresDataSync() {
    return applyResultsVersion(activeResultsVersion);
}

async function loadScoresData() {
    try {
        const inlinedData = getInlinedScoresData(activeResultsVersion);
        if (inlinedData) {
            applyScoresData(inlinedData);
            return true;
        }
        const response = await fetch('scores.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        applyScoresData(await response.json());
        return true;
    } catch (error) {
        console.error('Failed to load scores.json:', error);
        return false;
    }
}
