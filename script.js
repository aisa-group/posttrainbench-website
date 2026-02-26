
// Register Chart.js datalabels plugin (if available)
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Global chart instances
let performanceChart = null;
let detailedChart = null;

// Hamburger Menu Toggle
const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks = document.getElementById('nav-links');

hamburgerBtn.addEventListener('click', () => {
    hamburgerBtn.classList.toggle('active');
    navLinks.classList.toggle('active');
});

// Close menu when clicking a link
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        hamburgerBtn.classList.remove('active');
        navLinks.classList.remove('active');
    });
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!hamburgerBtn.contains(e.target) && !navLinks.contains(e.target)) {
        hamburgerBtn.classList.remove('active');
        navLinks.classList.remove('active');
    }
});

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Load saved theme or default to light
const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Recreate charts with new theme colors
    if (performanceChart) {
        performanceChart.destroy();
        createSimpleChart(currentSelectedModel);
    }
    if (detailedChart) {
        detailedChart.destroy();
        createDetailedChart(currentSelectedModel, currentSelectedBenchmark);
    }
    if (timeSpentChart) {
        timeSpentChart.destroy();
        createTimeSpentChart();
    }
});

// Map dropdown display values to actual model names in data
const modelNameMap = {
    "Qwen3-1.7B": "Qwen3-1.7B-Base",
    "Qwen3-4B": "Qwen3-4B-Base",
    "SmolLM3-3B": "SmolLM3-3B-Base",
    "Gemma-3-4B": "gemma-3-4b-pt"
};

// Get leaderboard data for specific model or average
function getLeaderboardDataForModel(modelName) {
    if (modelName === "average") {
        return leaderboardData;
    }

    // Map display name to actual model name
    const actualModelName = modelNameMap[modelName] || modelName;

    // Create data for specific model
    const modelData = leaderboardData.map(entry => {
        const modelScores = modelBenchmarkData[entry.agentKey][actualModelName];
        // Convert to the expected format with values and fallback types
        const benchmarkScoresForDisplay = {};
        Object.keys(modelScores).forEach(key => {
            benchmarkScoresForDisplay[key] = {
                value: modelScores[key].value.toFixed(2),
                fallbackType: modelScores[key].fallbackType
            };
        });
        return {
            agentKey: entry.agentKey,
            agent: entry.agent,
            averageScore: calculateWeightedAverageForModel(entry.agentKey, actualModelName),
            stdDev: entry.stdDev,
            benchmarkScores: benchmarkScoresForDisplay,
            description: entry.description,
            isBaseline: entry.isBaseline,
            isOpenCode: entry.isOpenCode,
            scaffold: entry.scaffold,
            showInChart: entry.showInChart
        };
    });

    // Sort and rank
    return modelData
        .sort((a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore))
        .map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));
}

// Get heatmap color based on normalized value (0-1 scale)
// Uses site's terracotta accent color (#c17d5a) with varying intensity
function getHeatmapColor(normalizedValue) {
    const currentTheme = html.getAttribute('data-theme');
    const value = Math.max(0, Math.min(1, normalizedValue));

    // Site accent color: #c17d5a (193, 125, 90)
    const r = 193;
    const g = 125;
    const b = 90;

    // Vary opacity based on value - low scores subtle, high scores prominent
    const alpha = currentTheme === 'dark'
        ? 0.1 + (0.5 * value)   // 0.1 → 0.6
        : 0.08 + (0.42 * value); // 0.08 → 0.5

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper to get value from benchmark score (handles both old and new format)
function getBenchmarkValue(score) {
    if (typeof score === 'object' && score !== null) {
        return parseFloat(score.value);
    }
    return parseFloat(score);
}

// Helper to get fallback type from benchmark score
function getFallbackType(score) {
    if (typeof score === 'object' && score !== null) {
        return score.fallbackType || false;
    }
    return false;
}

// Helper to get std value from benchmark score
function getBenchmarkStd(score) {
    if (typeof score === 'object' && score !== null && score.std !== undefined) {
        return score.std;
    }
    return null;
}

// Helper to format benchmark value with fallback marker (only in model-specific view)
function formatBenchmarkValue(score, showMarkers = false, showStd = false) {
    const value = getBenchmarkValue(score);
    const std = getBenchmarkStd(score);

    let valueStr = `${value.toFixed(2)}%`;

    if (showMarkers) {
        const fallbackType = getFallbackType(score);
        if (fallbackType === 'not_stored') {
            valueStr += '<sup>*</sup>';
        } else if (fallbackType === 'error') {
            valueStr += '<sup>†</sup>';
        }
    }

    // Add std display if available and requested
    if (showStd && std !== null) {
        valueStr += `<span class="std-value">± ${std}%</span>`;
    }

    return valueStr;
}

// Populate Leaderboard
function populateLeaderboard(modelName = "average") {
    const tbody = document.getElementById('leaderboard-data');
    tbody.innerHTML = ''; // Clear existing data

    const data = getLeaderboardDataForModel(modelName);

    // Only show markers in model-specific view, not average
    const showMarkers = modelName !== "average";

    // Collect all values for each column to find min/max
    const columns = {
        average: data.map(e => parseFloat(e.averageScore)),
        aime2025: data.map(e => getBenchmarkValue(e.benchmarkScores.aime2025)),
        arenahardwriting: data.map(e => getBenchmarkValue(e.benchmarkScores.arenahardwriting)),
        bfcl: data.map(e => getBenchmarkValue(e.benchmarkScores.bfcl)),
        gpqamain: data.map(e => getBenchmarkValue(e.benchmarkScores.gpqamain)),
        gsm8k: data.map(e => getBenchmarkValue(e.benchmarkScores.gsm8k)),
        healthbench: data.map(e => getBenchmarkValue(e.benchmarkScores.healthbench)),
        humaneval: data.map(e => getBenchmarkValue(e.benchmarkScores.humaneval))
    };

    // Find min and max for each column
    const ranges = {};
    for (const [key, values] of Object.entries(columns)) {
        ranges[key] = {
            min: Math.min(...values),
            max: Math.max(...values)
        };
    }

    // Normalize value within column range
    const normalize = (value, column) => {
        const range = ranges[column];
        if (range.max === range.min) return 0.5; // All same values
        return (value - range.min) / (range.max - range.min);
    };

    data.forEach(entry => {
        const row = document.createElement('tr');

        // Handle null ranks for baselines
        const rankDisplay = entry.rank !== null ? entry.rank : '-';
        const rankClass = entry.rank !== null && entry.rank <= 3 ? `rank-${entry.rank}` : 'rank-other';

        // Create cells with heatmap colors normalized per column
        const avgValue = parseFloat(entry.averageScore);
        const aimeValue = getBenchmarkValue(entry.benchmarkScores.aime2025);
        const arenaValue = getBenchmarkValue(entry.benchmarkScores.arenahardwriting);
        const bfclValue = getBenchmarkValue(entry.benchmarkScores.bfcl);
        const gpqaValue = getBenchmarkValue(entry.benchmarkScores.gpqamain);
        const gsmValue = getBenchmarkValue(entry.benchmarkScores.gsm8k);
        const healthValue = getBenchmarkValue(entry.benchmarkScores.healthbench);
        const humanValue = getBenchmarkValue(entry.benchmarkScores.humaneval);

        const avgColor = getHeatmapColor(normalize(avgValue, 'average'));
        const aimeColor = getHeatmapColor(normalize(aimeValue, 'aime2025'));
        const arenaColor = getHeatmapColor(normalize(arenaValue, 'arenahardwriting'));
        const bfclColor = getHeatmapColor(normalize(bfclValue, 'bfcl'));
        const gpqaColor = getHeatmapColor(normalize(gpqaValue, 'gpqamain'));
        const gsmColor = getHeatmapColor(normalize(gsmValue, 'gsm8k'));
        const healthColor = getHeatmapColor(normalize(healthValue, 'healthbench'));
        const humanColor = getHeatmapColor(normalize(humanValue, 'humaneval'));

        // Format std display (only show if available)
        const stdDisplay = entry.stdDev ? `<span class="std-value">± ${entry.stdDev}%</span>` : '';
        // Show std for benchmarks in average view (when showMarkers is false)
        const showStd = !showMarkers;

        // Format agent name - put scaffold name on separate line with smaller styling
        let agentNameHtml = entry.agent;
        if (entry.scaffold) {
            agentNameHtml = `${entry.agent}<span class="scaffold-label">${entry.scaffold}</span>`;
        }

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
            <td><strong>${agentNameHtml}</strong></td>
            <td style="background-color: ${avgColor}"><strong>${entry.averageScore}%</strong>${stdDisplay}</td>
            <td class="benchmark-col" style="background-color: ${aimeColor}">${formatBenchmarkValue(entry.benchmarkScores.aime2025, showMarkers, showStd)}</td>
            <td class="benchmark-col" style="background-color: ${arenaColor}">${formatBenchmarkValue(entry.benchmarkScores.arenahardwriting, showMarkers, showStd)}</td>
            <td class="benchmark-col" style="background-color: ${bfclColor}">${formatBenchmarkValue(entry.benchmarkScores.bfcl, showMarkers, showStd)}</td>
            <td class="benchmark-col" style="background-color: ${gpqaColor}">${formatBenchmarkValue(entry.benchmarkScores.gpqamain, showMarkers, showStd)}</td>
            <td class="benchmark-col" style="background-color: ${gsmColor}">${formatBenchmarkValue(entry.benchmarkScores.gsm8k, showMarkers, showStd)}</td>
            <td class="benchmark-col" style="background-color: ${healthColor}">${formatBenchmarkValue(entry.benchmarkScores.healthbench, showMarkers, showStd)}</td>
            <td class="benchmark-col" style="background-color: ${humanColor}">${formatBenchmarkValue(entry.benchmarkScores.humaneval, showMarkers, showStd)}</td>
        `;

        tbody.appendChild(row);
    });
}

// Populate Task Grid
function populateTasks() {
    const grid = document.getElementById('task-grid');

    taskData.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';

        const versionBadge = task.version
            ? `<span class="task-version">${task.version}</span>`
            : '';

        card.innerHTML = `
            <div class="task-header">
                <h3 class="task-title">${task.title}${versionBadge}</h3>
            </div>
            <p class="task-description">${task.description}</p>
            <div class="task-meta">
                <span class="task-tag">${task.category}</span>
            </div>
        `;

        grid.appendChild(card);
    });
}

// Populate Statistics
function populateStatistics() {
    // Check if elements exist before updating (in case stats section is removed)
    const benchmarksEl = document.getElementById('total-benchmarks');
    const agentsEl = document.getElementById('total-agents');
    const modelsEl = document.getElementById('total-models');
    const timeLimitEl = document.getElementById('time-limit');

    if (benchmarksEl) benchmarksEl.textContent = statistics.totalBenchmarks;
    if (agentsEl) agentsEl.textContent = statistics.totalAgents;
    if (modelsEl) modelsEl.textContent = statistics.totalModels;
    if (timeLimitEl) timeLimitEl.textContent = statistics.timeLimit;
}

// Calculate adaptive font sizes based on chart dimensions
function calculateFontSizes(canvas) {
    const width = canvas.offsetWidth || canvas.width;
    const height = canvas.offsetHeight || canvas.height;

    // Use width for better scaling on desktop, min(width, height) for mobile
    const isMobile = window.innerWidth <= 768;
    const baseSize = isMobile ? Math.min(width, height) : width;

    // Desktop scales up for better readability
    const scale = isMobile ? 1 : 2.0;

    // Calculate sizes - mobile gets good base sizes, desktop scales up more
    return {
        tooltipTitle: Math.max(14, Math.round(baseSize * 0.028 * scale)),
        tooltipBody: Math.max(13, Math.round(baseSize * 0.026 * scale)),
        axisTitle: Math.max(13, Math.round(baseSize * 0.026 * scale)),
        axisTicks: Math.max(11, Math.round(baseSize * 0.020 * scale)),
        legend: Math.max(12, Math.round(baseSize * 0.022 * scale))
    };
}

// Create Simple Performance Chart (average view)
function createSimpleChart(modelName = "average") {
    const ctx = document.getElementById('performanceChart');

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Set wrapper dimensions based on screen size
    const wrapper = document.querySelector('.leaderboard-chart-wrapper');
    const footnotes = wrapper.parentElement.querySelectorAll('.chart-footnote');
    if (isMobile) {
        // Fit chart on mobile screen without horizontal scroll
        wrapper.style.minWidth = '';
        wrapper.style.height = '320px';
        footnotes.forEach(fn => fn.style.width = '');
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
        footnotes.forEach(fn => fn.style.width = '');
    }

    // Get data for selected model
    const allData = getLeaderboardDataForModel(modelName);

    // Filter to only show agents that should appear in chart
    const data = allData.filter(d => d.showInChart !== false);

    // Reverse order for chart (ascending - lowest to highest)
    const reversedData = [...data].reverse();

    // Update labels - use shorter names on mobile, split on desktop
    const chartLabels = reversedData.map(d => {
        if (isMobile) {
            // Abbreviated labels for mobile
            if (d.agent === 'Base Model') return 'Base Model';
            if (d.agent === 'Instruction Tuned') return 'Instruct Tuned';
            if (d.agent === 'GPT 5.1 Codex Max') return 'GPT 5.1 Codex';
            if (d.agent === 'GPT 5.2 Codex') return 'GPT 5.2 Codex';
            if (d.agent === 'GPT 5.3 Codex') return 'GPT 5.3 Codex';
            if (d.agent === 'GPT-5.2') return 'GPT-5.2';
            if (d.agent === 'Gemini 3 Pro') return 'Gemini 3';
            if (d.agent === 'Opus 4.5') return 'Opus 4.5';
            if (d.agent === 'Sonnet 4.5') return 'Sonnet 4.5';
            if (d.agent === 'MiniMax M2.1') return 'MiniMax';
            return d.agent;
        }
        // Desktop: split long names into two lines
        if (d.agent === 'Base Model') {
            return ['Base Model', '(baseline)'];
        }
        if (d.agent === 'Instruction Tuned') {
            return ['Instruction', 'Tuned'];
        }
        const words = d.agent.split(' ');
        if (words.length >= 3) {
            const midpoint = Math.ceil(words.length / 2);
            return [words.slice(0, midpoint).join(' '), words.slice(midpoint).join(' ')];
        }
        return d.agent;
    });

    const chartColors = reversedData.map(d => {
        if (d.agent === 'Base Model') return '#9a9590';
        if (d.agent === 'Instruction Tuned') return '#6b655a';
        return accentPrimary;
    });

    // Get error bar data (std deviations)
    const errorBars = reversedData.map(d => d.stdDev ? parseFloat(d.stdDev) : null);

    // Calculate max value dynamically - round up to nearest 10
    const maxScore = Math.max(...data.map(d => parseFloat(d.averageScore)));
    const yAxisMax = Math.ceil(maxScore / 10) * 10;

    // Calculate adaptive font sizes
    const fontSizes = calculateFontSizes(ctx);

    // Custom plugin for error bars
    const errorBarPlugin = {
        id: 'errorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { x, y } } = chart;
            const dataset = chart.data.datasets[0];

            ctx.save();
            ctx.strokeStyle = '#704028'; // Dark terracotta for error bars
            ctx.lineWidth = isMobile ? 1 : 1.5;

            dataset.data.forEach((value, index) => {
                const error = errorBars[index];
                if (error !== null && error > 0) {
                    const xPos = x.getPixelForValue(index);
                    const yPos = y.getPixelForValue(value);
                    const errorTop = y.getPixelForValue(value + error);
                    const errorBottom = y.getPixelForValue(value - error);
                    const capWidth = isMobile ? 3 : 6;

                    // Vertical line
                    ctx.beginPath();
                    ctx.moveTo(xPos, errorTop);
                    ctx.lineTo(xPos, errorBottom);
                    ctx.stroke();

                    // Top cap
                    ctx.beginPath();
                    ctx.moveTo(xPos - capWidth, errorTop);
                    ctx.lineTo(xPos + capWidth, errorTop);
                    ctx.stroke();

                    // Bottom cap
                    ctx.beginPath();
                    ctx.moveTo(xPos - capWidth, errorBottom);
                    ctx.lineTo(xPos + capWidth, errorBottom);
                    ctx.stroke();
                }
            });
            ctx.restore();
        }
    };

    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Average Score (%)',
                data: reversedData.map(d => parseFloat(d.averageScore)),
                backgroundColor: chartColors,
                borderColor: chartColors,
                borderWidth: isMobile ? 1 : 2,
                borderRadius: isMobile ? 2 : 4,
                barPercentage: isMobile ? 0.7 : 0.8,
                categoryPercentage: isMobile ? 0.8 : 0.9
            }]
        },
        plugins: [errorBarPlugin],
        options: {
            responsive: true,
            maintainAspectRatio: !isMobile,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        family: "'JetBrains Mono', monospace",
                        size: fontSizes.tooltipTitle
                    },
                    bodyFont: {
                        family: "'JetBrains Mono', monospace",
                        size: fontSizes.tooltipBody
                    },
                    borderColor: accentPrimary,
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const std = errorBars[context.dataIndex];
                            const stdText = std ? ` ± ${std}%` : '';
                            return `Average Score: ${context.parsed.y.toFixed(1)}%${stdText}`;
                        }
                    }
                },
                datalabels: {
                    display: !isMobile,
                    color: '#ffffff',
                    anchor: 'start',
                    align: 'end',
                    offset: 4,
                    font: {
                        family: "'JetBrains Mono', monospace",
                        size: fontSizes.axisTicks,
                        weight: 500
                    },
                    formatter: function(value) {
                        return value.toFixed(1) + '%';
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 65,
                    title: {
                        display: !isMobile,
                        text: 'Average benchmark performance¹',
                        color: textPrimary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: fontSizes.axisTitle,
                            weight: 500
                        }
                    },
                    grid: {
                        color: borderColor
                    },
                    ticks: {
                        color: textSecondary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 9 : fontSizes.axisTicks
                        },
                        stepSize: isMobile ? 20 : 10,
                        callback: function(value) {
                            if (value === 65) return null;
                            return value + '%';
                        }
                    }
                },
                x: {
                    title: {
                        display: !isMobile,
                        text: 'LLM powering the CLI agent',
                        color: textPrimary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: fontSizes.axisTitle,
                            weight: 500
                        }
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: textSecondary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 9 : fontSizes.axisTicks
                        },
                        maxRotation: isMobile ? 55 : 0,
                        minRotation: isMobile ? 55 : 0,
                        autoSkip: false
                    }
                }
            }
        }
    });
}

// Current selected benchmark for mobile view
let currentSelectedBenchmark = 'bfcl';

// Benchmark display names
const benchmarkDisplayNames = {
    'aime2025': 'AIME 2025',
    'arenahardwriting': 'Arena Hard',
    'bfcl': 'BFCL',
    'gpqamain': 'GPQA Main',
    'gsm8k': 'GSM8K',
    'healthbench': 'HealthBench',
    'humaneval': 'HumanEval'
};

// Create Detailed Chart (grouped by benchmark on desktop, single benchmark on mobile)
function createDetailedChart(modelName = "average", benchmarkKey = null) {
    const ctx = document.getElementById('detailedChart');

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Set wrapper dimensions based on screen size
    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    if (isMobile) {
        wrapper.style.minWidth = '';
        wrapper.style.height = '300px';
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
    }

    const agentColors = {
        'Instruction Tuned': '#6b655a',
        'Base Model': '#9a9590',
        'GPT 5.1 Codex Max': '#6a7a5a',
        'GPT-5.2': '#7a8a6a',
        'GPT 5.2 Codex': '#8a9a7a',
        'GPT 5.3 Codex': '#5a6a4a',
        'Opus 4.5': '#c17d5a',
        'Opus 4.6': '#d48a60',
        'Sonnet 4.5': '#a66b4f',
        'Gemini 3 Pro': '#6a7a85',
        'GLM 4.7': '#6a8078',
        'GLM 5': '#5a7068',
        'MiniMax M2.1': '#8a7078'
    };

    const allData = getLeaderboardDataForModel(modelName);
    const data = allData.filter(d => d.showInChart !== false);

    const fontSizes = calculateFontSizes(ctx);

    if (isMobile) {
        // Mobile: Single benchmark, agents on X-axis
        const selectedBenchmark = benchmarkKey || currentSelectedBenchmark;

        // Sort by the selected benchmark score ascending (lowest to highest)
        const orderedData = [...data].sort((a, b) => {
            const scoreA = getBenchmarkValue(a.benchmarkScores[selectedBenchmark]);
            const scoreB = getBenchmarkValue(b.benchmarkScores[selectedBenchmark]);
            return scoreA - scoreB;
        });

        const scores = orderedData.map(entry => getBenchmarkValue(entry.benchmarkScores[selectedBenchmark]));
        const labels = orderedData.map(d => d.agent);
        const colors = orderedData.map(d => {
            if (d.agent === 'Base Model') return '#9a9590';
            if (d.agent === 'Instruction Tuned') return '#6b655a';
            return accentPrimary;
        });

        const maxScore = Math.max(...scores);
        const yAxisMax = Math.ceil(maxScore / 10) * 10 + 10;

        detailedChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: benchmarkDisplayNames[selectedBenchmark],
                    data: scores,
                    backgroundColor: colors,
                    borderColor: colors,
                    borderWidth: 1,
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.85
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 8,
                        titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
                        bodyFont: { family: "'JetBrains Mono', monospace", size: 10 },
                        borderColor: accentPrimary,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    },
                    datalabels: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: yAxisMax,
                        title: { display: false },
                        grid: { color: borderColor },
                        ticks: {
                            color: textSecondary,
                            font: { family: "'JetBrains Mono', monospace", size: 9 },
                            stepSize: 20,
                            callback: value => value + '%'
                        }
                    },
                    x: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: textSecondary,
                            font: { family: "'JetBrains Mono', monospace", size: 9 },
                            maxRotation: 55,
                            minRotation: 55
                        }
                    }
                }
            }
        });
    } else {
        // Desktop: Grouped bar chart - benchmarks on X-axis, agents as different bars
        const benchmarks = ['AIME 2025', 'Arena Hard', 'BFCL', 'GPQA Main', 'GSM8K', 'HealthBench', 'HumanEval'];
        const benchmarkKeys = ['aime2025', 'arenahardwriting', 'bfcl', 'gpqamain', 'gsm8k', 'healthbench', 'humaneval'];

        // Sort by average score ascending (lowest to highest, like main chart)
        const orderedData = [...data].sort((a, b) => parseFloat(a.averageScore) - parseFloat(b.averageScore));

        const datasets = orderedData.map(entry => ({
            label: entry.agent,
            data: benchmarkKeys.map(key => getBenchmarkValue(entry.benchmarkScores[key])),
            backgroundColor: agentColors[entry.agent] || accentPrimary,
            borderColor: agentColors[entry.agent] || accentPrimary,
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.8,
            categoryPercentage: 0.9
        }));

        const maxScore = Math.max(...orderedData.flatMap(entry =>
            benchmarkKeys.map(key => getBenchmarkValue(entry.benchmarkScores[key]))
        ));
        const yAxisMax = Math.ceil(maxScore / 10) * 10;

        detailedChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: benchmarks,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        align: 'center',
                        labels: {
                            color: textPrimary,
                            font: { family: "'JetBrains Mono', monospace", size: fontSizes.legend },
                            padding: 15,
                            boxWidth: 14,
                            boxHeight: 14
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { family: "'JetBrains Mono', monospace", size: fontSizes.tooltipTitle },
                        bodyFont: { family: "'JetBrains Mono', monospace", size: fontSizes.tooltipBody },
                        borderColor: accentPrimary,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    },
                    datalabels: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: yAxisMax,
                        title: {
                            display: true,
                            text: 'Benchmark Score (%)',
                            color: textPrimary,
                            font: { family: "'JetBrains Mono', monospace", size: fontSizes.axisTitle, weight: 500 }
                        },
                        grid: { color: borderColor },
                        ticks: {
                            color: textSecondary,
                            font: { family: "'JetBrains Mono', monospace", size: fontSizes.axisTicks },
                            stepSize: 10,
                            callback: value => value + '%'
                        }
                    },
                    x: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: textSecondary,
                            font: { family: "'JetBrains Mono', monospace", size: fontSizes.axisTicks },
                            maxRotation: 0,
                            minRotation: 0
                        }
                    }
                }
            }
        });
    }
}

// Create Time Spent Chart
let timeSpentChart = null;

function createTimeSpentChart() {
    const ctx = document.getElementById('timeSpentChart');

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Sort by hours (descending), filter out baselines
    const sortedData = [...timeSpentData]
        .filter(d => !d.isBaseline && timeChartAgentKeys.includes(d.agentKey))
        .sort((a, b) => b.hours - a.hours);

    // Set wrapper dimensions based on screen size
    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    if (isMobile) {
        // Fit on mobile, smaller height per agent
        const dynamicHeight = Math.max(250, sortedData.length * 38);
        wrapper.style.minWidth = '';
        wrapper.style.height = `${dynamicHeight}px`;
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
    }

    // Calculate adaptive font sizes
    const fontSizes = calculateFontSizes(ctx);

    const timeErrorBarPlugin = {
        id: 'timeErrorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales } = chart;
            const dataset = chart.data.datasets[0];

            ctx.save();

            dataset.data.forEach((value, index) => {
                const dataItem = sortedData[index];
                const meta = chart.getDatasetMeta(0);
                const bar = meta.data[index];
                const yPos = bar.y;
                const barHeight = bar.height;

                let labelX;

                if (dataItem.stdHours) {
                    ctx.strokeStyle = '#704028';
                    ctx.lineWidth = isMobile ? 1 : 2;

                    const capSize = Math.min(barHeight * 0.3, isMobile ? 4 : 6);
                    const xMin = scales.x.getPixelForValue(value - dataItem.stdHours);
                    const xMax = scales.x.getPixelForValue(value + dataItem.stdHours);

                    ctx.beginPath();
                    ctx.moveTo(xMin, yPos);
                    ctx.lineTo(xMax, yPos);
                    ctx.moveTo(xMin, yPos - capSize);
                    ctx.lineTo(xMin, yPos + capSize);
                    ctx.moveTo(xMax, yPos - capSize);
                    ctx.lineTo(xMax, yPos + capSize);
                    ctx.stroke();

                    labelX = xMax + (isMobile ? 4 : 8);
                } else {
                    labelX = scales.x.getPixelForValue(value) + (isMobile ? 4 : 8);
                }

                ctx.fillStyle = textSecondary;
                ctx.font = `500 ${isMobile ? 9 : fontSizes.axisTicks}px 'JetBrains Mono', monospace`;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                // On mobile, show shorter time labels
                const labelText = isMobile
                    ? dataItem.time
                    : (dataItem.stdHours ? `${dataItem.time} ± ${dataItem.stdTime}` : dataItem.time);
                ctx.fillText(labelText, labelX, yPos);
            });

            ctx.restore();
        }
    };

    const getScaffold = (agentKey) => agentInfo[agentKey]?.scaffold || null;

    const labels = sortedData.map(d => {
        const scaffold = getScaffold(d.agentKey);
        return d.agent.length > (scaffold?.length || 0) ? d.agent : scaffold;
    });

    // Adjust font sizes for mobile
    const labelFontSize = isMobile ? 9 : fontSizes.axisTicks;
    const scaffoldFontSize = isMobile ? 7 : Math.round(fontSizes.axisTicks * 0.8);

    const customLabelsPlugin = {
        id: 'customLabels',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart;
            const meta = chart.getDatasetMeta(0);

            ctx.save();
            ctx.textAlign = 'right';
            const xPos = chartArea.left - (isMobile ? 6 : 10);

            sortedData.forEach((dataItem, index) => {
                const bar = meta.data[index];
                const yPos = bar.y;
                const scaffold = getScaffold(dataItem.agentKey);

                if (isMobile) {
                    // On mobile: show only agent name, single line
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(dataItem.agent, xPos, yPos);
                } else if (scaffold) {
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(dataItem.agent, xPos, yPos - 1);

                    ctx.globalAlpha = 0.55;
                    ctx.font = `400 ${scaffoldFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(scaffold, xPos, yPos + 1);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(dataItem.agent, xPos, yPos);
                }
            });

            ctx.restore();
        }
    };

    timeSpentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time Spent (hours)',
                data: sortedData.map(d => d.hours),
                backgroundColor: accentPrimary,
                borderColor: accentPrimary,
                borderWidth: isMobile ? 1 : 2,
                borderRadius: isMobile ? 2 : 4,
                barPercentage: isMobile ? 0.6 : 0.8,
                categoryPercentage: isMobile ? 0.8 : 0.9,
                datalabels: { display: false }
            }]
        },
        plugins: [timeErrorBarPlugin, customLabelsPlugin],
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: !isMobile,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: isMobile ? 8 : 12,
                    titleFont: {
                        family: "'JetBrains Mono', monospace",
                        size: isMobile ? 11 : fontSizes.tooltipTitle
                    },
                    bodyFont: {
                        family: "'JetBrains Mono', monospace",
                        size: isMobile ? 10 : fontSizes.tooltipBody
                    },
                    borderColor: accentPrimary,
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const dataItem = sortedData[context.dataIndex];
                            let label = `Time: ${dataItem.time} (${context.parsed.x.toFixed(2)} hours)`;
                            if (dataItem.stdHours) {
                                label += ` ± ${dataItem.stdTime}`;
                            }
                            return label;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 10,
                    title: {
                        display: !isMobile,
                        text: 'Time (hours)',
                        color: textPrimary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: fontSizes.axisTitle,
                            weight: 500
                        }
                    },
                    grid: {
                        color: borderColor
                    },
                    ticks: {
                        color: textSecondary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 9 : fontSizes.axisTicks
                        },
                        stepSize: isMobile ? 5 : 2
                    }
                },
                y: {
                    title: {
                        display: false
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: 'transparent',
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 9 : fontSizes.axisTicks
                        }
                    }
                }
            }
        }
    });
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

document.getElementById('paper-btn').addEventListener('click', (e) => {
    e.preventDefault();
    e.target.blur();
});

let resizeTimeout;
let lastWindowWidth = window.innerWidth;
window.addEventListener('resize', () => {
    // Only recreate charts if width changed (ignore height changes from mobile address bar)
    if (window.innerWidth === lastWindowWidth) {
        return;
    }
    lastWindowWidth = window.innerWidth;

    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (performanceChart) {
            performanceChart.destroy();
            createSimpleChart(currentSelectedModel);
        }
        if (detailedChart) {
            detailedChart.destroy();
            createDetailedChart(currentSelectedModel, currentSelectedBenchmark);
        }
        if (timeSpentChart) {
            timeSpentChart.destroy();
            createTimeSpentChart();
        }
    }, 250);
});

// Copy citation to clipboard
document.getElementById('copy-citation').addEventListener('click', function() {
    const citationText = document.querySelector('.citation-text').textContent;
    navigator.clipboard.writeText(citationText).then(() => {
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Copied!`;
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    });
});

// Custom dropdown functionality
let currentSelectedModel = 'average';

const dropdownDisplay = document.getElementById('model-select-display');
const dropdownOptions = document.getElementById('model-select-options');
const modelDropdown = dropdownDisplay.closest('.custom-dropdown');

// Toggle dropdown
dropdownDisplay.addEventListener('click', (e) => {
    e.stopPropagation();
    modelDropdown.classList.toggle('open');
});

// Handle option selection
dropdownOptions.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-option')) {
        const selectedValue = e.target.getAttribute('data-value');
        const selectedText = e.target.textContent;

        // Update display
        dropdownDisplay.textContent = selectedText;

        // Update active state
        dropdownOptions.querySelectorAll('.dropdown-option').forEach(opt => {
            opt.classList.remove('active');
        });
        e.target.classList.add('active');

        // Close dropdown
        modelDropdown.classList.remove('open');

        // Update model if changed
        if (selectedValue !== currentSelectedModel) {
            currentSelectedModel = selectedValue;
            populateLeaderboard(selectedValue);

            // Update charts based on selected model
            if (performanceChart) {
                performanceChart.destroy();
                createSimpleChart(selectedValue);
            }
            if (detailedChart) {
                detailedChart.destroy();
                createDetailedChart(selectedValue, currentSelectedBenchmark);
            }
        }
    }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!modelDropdown.contains(e.target)) {
        modelDropdown.classList.remove('open');
    }
});

// Benchmark dropdown functionality (mobile only)
const benchmarkDropdownDisplay = document.getElementById('benchmark-select-display');
const benchmarkDropdownOptions = document.getElementById('benchmark-select-options');
const benchmarkDropdown = benchmarkDropdownDisplay?.closest('.custom-dropdown');

if (benchmarkDropdownDisplay && benchmarkDropdownOptions && benchmarkDropdown) {
    benchmarkDropdownDisplay.addEventListener('click', (e) => {
        e.stopPropagation();
        benchmarkDropdown.classList.toggle('open');
    });

    benchmarkDropdownOptions.addEventListener('click', (e) => {
        if (e.target.classList.contains('dropdown-option')) {
            const selectedValue = e.target.getAttribute('data-value');
            const selectedText = e.target.textContent;

            benchmarkDropdownDisplay.textContent = selectedText;

            benchmarkDropdownOptions.querySelectorAll('.dropdown-option').forEach(opt => {
                opt.classList.remove('active');
            });
            e.target.classList.add('active');

            benchmarkDropdown.classList.remove('open');

            if (selectedValue !== currentSelectedBenchmark) {
                currentSelectedBenchmark = selectedValue;
                if (detailedChart) {
                    detailedChart.destroy();
                    createDetailedChart(currentSelectedModel, selectedValue);
                }
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!benchmarkDropdown.contains(e.target)) {
            benchmarkDropdown.classList.remove('open');
        }
    });
}

// Mobile table toggle - show/hide benchmark columns
const toggleTableBtn = document.getElementById('toggle-full-table');
const leaderboardTable = document.querySelector('.leaderboard-table');
const mobileTableNotice = document.querySelector('.mobile-table-notice');

if (toggleTableBtn && leaderboardTable && mobileTableNotice) {
    toggleTableBtn.addEventListener('click', () => {
        leaderboardTable.classList.toggle('show-full');
        mobileTableNotice.classList.toggle('show-full');
    });
}

// Navbar logo visibility based on hero section
const navbar = document.querySelector('.navbar');
const logo = document.querySelector('.logo');
const heroSection = document.querySelector('.hero');

function handleNavbarLogoVisibility() {
    if (!heroSection || !logo) return;

    const heroRect = heroSection.getBoundingClientRect();
    const heroBottom = heroRect.bottom;

    // If hero section is still visible in viewport, hide logo
    if (heroBottom > 0) {
        logo.style.opacity = '0';
        logo.style.visibility = 'hidden';
    } else {
        logo.style.opacity = '1';
        logo.style.visibility = 'visible';
    }
}

// Add scroll listener for navbar logo visibility
window.addEventListener('scroll', handleNavbarLogoVisibility);

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Load scores data from JSON
    const loaded = await loadScoresData();
    if (!loaded) {
        console.error('Failed to initialize: could not load scores data');
        return;
    }

    // Initialize UI
    populateLeaderboard();
    populateTasks();
    populateStatistics();
    createSimpleChart();
    createDetailedChart();
    createTimeSpentChart();
    handleNavbarLogoVisibility(); // Check initial state

    // Changelog expand/collapse animation
    const changelog = document.querySelector('details.changelog');
    if (changelog) {
        const content = changelog.querySelector('.changelog-content');
        changelog.addEventListener('click', (e) => {
            e.preventDefault();
            if (changelog.open) {
                // Closing: animate out, then remove open
                content.classList.remove('open');
                content.addEventListener('transitionend', () => {
                    changelog.open = false;
                }, { once: true });
            } else {
                // Opening: set open, then animate in
                changelog.open = true;
                requestAnimationFrame(() => content.classList.add('open'));
            }
        });
    }
});
