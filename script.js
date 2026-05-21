
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
            reasoningEffort: entry.reasoningEffort,
            showInChart: entry.showInChart
        };
    });

    // Sort and rank (baselines get no rank)
    let agentRank = 1;
    return modelData
        .sort((a, b) => parseFloat(b.averageScore) - parseFloat(a.averageScore))
        .map(entry => ({
            ...entry,
            rank: entry.isBaseline ? null : agentRank++
        }));
}

// Get heatmap color from the displayed percentage.
// Example: 51.14% renders as sky blue at 51.14% opacity.
function getHeatmapColor(percentage) {
    const alpha = Math.max(0, Math.min(100, percentage)) / 100;
    return `rgba(86, 180, 233, ${alpha.toFixed(4)})`;
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

    data.forEach(entry => {
        const row = document.createElement('tr');

        // Handle null ranks for baselines
        const rankDisplay = entry.rank !== null ? entry.rank : '-';
        const rankClass = entry.rank !== null && entry.rank <= 3 ? `rank-${entry.rank}` : 'rank-other';

        // Create cells with heatmap opacity directly tied to the displayed percentage.
        const avgValue = parseFloat(entry.averageScore);
        const aimeValue = getBenchmarkValue(entry.benchmarkScores.aime2025);
        const arenaValue = getBenchmarkValue(entry.benchmarkScores.arenahardwriting);
        const bfclValue = getBenchmarkValue(entry.benchmarkScores.bfcl);
        const gpqaValue = getBenchmarkValue(entry.benchmarkScores.gpqamain);
        const gsmValue = getBenchmarkValue(entry.benchmarkScores.gsm8k);
        const healthValue = getBenchmarkValue(entry.benchmarkScores.healthbench);
        const humanValue = getBenchmarkValue(entry.benchmarkScores.humaneval);

        const avgColor = getHeatmapColor(avgValue);
        const aimeColor = getHeatmapColor(aimeValue);
        const arenaColor = getHeatmapColor(arenaValue);
        const bfclColor = getHeatmapColor(bfclValue);
        const gpqaColor = getHeatmapColor(gpqaValue);
        const gsmColor = getHeatmapColor(gsmValue);
        const healthColor = getHeatmapColor(healthValue);
        const humanColor = getHeatmapColor(humanValue);

        // Format std display (only show if available)
        const stdDisplay = entry.stdDev ? `<span class="std-value">± ${entry.stdDev}%</span>` : '';
        // Show std for benchmarks in average view (when showMarkers is false)
        const showStd = !showMarkers;

        // Format agent name - put scaffold name on separate line with smaller styling
        let displayAgent = entry.agent;
        if (entry.agent === 'Official Instruct Models' && modelName !== 'average') {
            displayAgent = 'Official Instruct Model';
        }
        let agentNameHtml = displayAgent;
        if (entry.scaffold) {
            const effortTag = entry.reasoningEffort ? entry.reasoningEffort.split(', ').map(t => `<span class="effort-tag">${t}</span>`).join('') : '';
            agentNameHtml = `${displayAgent}<span class="scaffold-label">${entry.scaffold}${effortTag}</span>`;
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

// Populate benchmark table — one row per benchmark with category, weight
// (its share of the weighted average), and a short description.
function populateTasks() {
    const tbody = document.getElementById('benchmark-table-body');
    if (!tbody) return;

    taskData.forEach(task => {
        const tr = document.createElement('tr');
        const versionBadge = task.version
            ? ` <span class="task-version">${task.version}</span>`
            : '';
        const weightPct = (typeof task.weight === 'number')
            ? `${(task.weight * 100).toFixed(1)}%`
            : '<span class="findings-empty">—</span>';

        tr.innerHTML = `
            <td>${task.title}${versionBadge}</td>
            <td>${task.category}</td>
            <td>${weightPct}</td>
            <td>${task.description}</td>
        `;

        tbody.appendChild(tr);
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
    const chartFont = style.getPropertyValue('--font-sans').trim() || "'Die Grotesk', sans-serif";
    const chartTooltipBg = style.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(31, 30, 28, 0.88)';
    const chartLabelOnBar = style.getPropertyValue('--chart-label-on-bar').trim() || '#ffffff';
    const chartError = style.getPropertyValue('--chart-error').trim() || '#5F5C56';

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
    // Reasoning effort is not shown in the main bar chart (only the dagger for reprompted)
    const chartLabels = reversedData.map(d => {
        const isReprompted = d.reasoningEffort && d.reasoningEffort.includes('Reprompted');
        const dagger = isReprompted ? '†' : '';
        const displayName = `${d.agent}${dagger}`;
        if (isMobile) {
            // Abbreviated labels for mobile
            if (d.agent === 'Base Models') return 'Base Models';
            if (d.agent === 'Official Instruct Models') return 'Official Instruct²';
            if (d.agent === 'GPT 5.1 Codex Max') return 'GPT 5.1 Codex';
            if (d.agent === 'GPT 5.2 Codex') return 'GPT 5.2 Codex';
            if (d.agent === 'GPT-5.2') return 'GPT-5.2';
            if (d.agent === 'Gemini 3 Pro') return 'Gemini 3';
            if (d.agent === 'Opus 4.5') return 'Opus 4.5';
            if (d.agent === 'Sonnet 4.5') return 'Sonnet 4.5';
            if (d.agent === 'MiniMax M2.1') return 'MiniMax';
            return displayName;
        }
        // Desktop: split long names into two lines
        if (d.agent === 'Base Models') {
            return ['Base Models', '(baseline)'];
        }
        if (d.agent === 'Official Instruct Models') {
            return ['Official', 'Instruct', 'Models²'];
        }
        const words = d.agent.split(' ');
        if (words.length >= 3) {
            const midpoint = Math.ceil(words.length / 2);
            const first = words.slice(0, midpoint).join(' ');
            const second = words.slice(midpoint).join(' ') + dagger;
            return [first, second];
        }
        return displayName;
    });

    // Create stripe pattern for reprompted agents
    const createStripePattern = (color) => {
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = 10;
        patternCanvas.height = 10;
        const pctx = patternCanvas.getContext('2d');
        pctx.fillStyle = color;
        pctx.fillRect(0, 0, 10, 10);
        pctx.strokeStyle = 'rgba(255,255,255,0.35)';
        pctx.lineWidth = 2;
        pctx.beginPath();
        pctx.moveTo(0, 10);
        pctx.lineTo(10, 0);
        pctx.stroke();
        pctx.beginPath();
        pctx.moveTo(-2, 2);
        pctx.lineTo(2, -2);
        pctx.stroke();
        pctx.beginPath();
        pctx.moveTo(8, 12);
        pctx.lineTo(12, 8);
        pctx.stroke();
        return ctx.getContext('2d').createPattern(patternCanvas, 'repeat');
    };

    const chartBar = style.getPropertyValue('--chart-bar').trim() || accentPrimary;
    const chartBarBaseline1 = style.getPropertyValue('--chart-bar-baseline-1').trim() || '#9a9590';
    const chartBarBaseline2 = style.getPropertyValue('--chart-bar-baseline-2').trim() || '#6b655a';

    const chartColors = reversedData.map(d => {
        if (d.agent === 'Base Models') return chartBarBaseline1;
        if (d.agent === 'Official Instruct Models') return chartBarBaseline2;
        if (d.reasoningEffort && d.reasoningEffort.includes('Reprompted')) return createStripePattern(chartBar);
        return chartBar;
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
            ctx.strokeStyle = chartError;
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
                    backgroundColor: chartTooltipBg,
                    padding: 12,
                    titleFont: {
                        family: chartFont,
                        size: fontSizes.tooltipTitle
                    },
                    bodyFont: {
                        family: chartFont,
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
                    color: chartLabelOnBar,
                    anchor: 'start',
                    align: 'end',
                    offset: 4,
                    font: {
                        family: chartFont,
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
                    max: yAxisMax,
                    title: {
                        display: !isMobile,
                        text: 'Average benchmark performance¹',
                        color: textPrimary,
                        font: {
                            family: chartFont,
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
                            family: chartFont,
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
                            family: chartFont,
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
                            family: chartFont,
                            size: isMobile ? 9 : Math.max(9, fontSizes.axisTicks - 1)
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
    const chartFont = style.getPropertyValue('--font-sans').trim() || "'Die Grotesk', sans-serif";
    const chartTooltipBg = style.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(31, 30, 28, 0.88)';

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
        'human': '#5F5C56',
        'base-model': '#9E9B94',
        'gpt-5.1-codex-max': '#0072B2',
        'gpt-5.2': '#56B4E9',
        'gpt-5.2-codex': '#00A889',
        'gpt-5.3-codex-high': '#0072B2',
        'gpt-5.3-codex-med': '#56B4E9',
        'gpt-5.4-high': '#00A889',
        'opus-4.5': '#E69F00',
        'opus-4.6': '#E55F3F',
        'opus-4.6-1m': '#CC79A7',
        'opus-4.7': '#F5C710',
        'sonnet-4.5': '#E69F00',
        'sonnet-4.6': '#E55F3F',
        'gemini-3-pro': '#56B4E9',
        'gemini-3.1-pro': '#0072B2',
        'glm-4.7': '#00A889',
        'glm-5': '#00A889',
        'minimax-m2.1': '#CC79A7',
        'minimax-m2.5': '#CC79A7',
        'kimi-k2.5': '#F5C710',
        'gpt-5.5-xhigh': '#0072B2',
        'gpt-5.5-xhigh-reprompted': '#56B4E9'
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
        const chartBar = style.getPropertyValue('--chart-bar').trim() || accentPrimary;
        const chartBarBaseline1 = style.getPropertyValue('--chart-bar-baseline-1').trim() || '#9a9590';
        const chartBarBaseline2 = style.getPropertyValue('--chart-bar-baseline-2').trim() || '#6b655a';

        const colors = orderedData.map(d => {
            if (d.agentKey === 'base-model') return chartBarBaseline1;
            if (d.agentKey === 'human') return chartBarBaseline2;
            return chartBar;
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
                        backgroundColor: chartTooltipBg,
                        padding: 8,
                        titleFont: { family: chartFont, size: 11 },
                        bodyFont: { family: chartFont, size: 10 },
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
                            font: { family: chartFont, size: 9 },
                            stepSize: 20,
                            callback: value => value + '%'
                        }
                    },
                    x: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: textSecondary,
                            font: { family: chartFont, size: 9 },
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
            label: entry.reasoningEffort ? `${entry.agent} (${entry.reasoningEffort})` : entry.agent,
            data: benchmarkKeys.map(key => getBenchmarkValue(entry.benchmarkScores[key])),
            backgroundColor: agentColors[entry.agentKey] || accentPrimary,
            borderColor: agentColors[entry.agentKey] || accentPrimary,
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
                            font: { family: chartFont, size: fontSizes.legend },
                            padding: 15,
                            boxWidth: 14,
                            boxHeight: 14
                        }
                    },
                    tooltip: {
                        backgroundColor: chartTooltipBg,
                        padding: 12,
                        titleFont: { family: chartFont, size: fontSizes.tooltipTitle },
                        bodyFont: { family: chartFont, size: fontSizes.tooltipBody },
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
                            font: { family: chartFont, size: fontSizes.axisTitle, weight: 500 }
                        },
                        grid: { color: borderColor },
                        ticks: {
                            color: textSecondary,
                            font: { family: chartFont, size: fontSizes.axisTicks },
                            stepSize: 10,
                            callback: value => value + '%'
                        }
                    },
                    x: {
                        title: { display: false },
                        grid: { display: false },
                        ticks: {
                            color: textSecondary,
                            font: { family: chartFont, size: fontSizes.axisTicks },
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
let showAllTimeAgents = false;

function createTimeSpentChart() {
    const ctx = document.getElementById('timeSpentChart');

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();
    const chartFont = style.getPropertyValue('--font-sans').trim() || "'Die Grotesk', sans-serif";
    const chartTooltipBg = style.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(31, 30, 28, 0.88)';
    const chartError = style.getPropertyValue('--chart-error').trim() || '#5F5C56';

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Sort by hours (descending), filter out baselines
    const agentFilter = showAllTimeAgents ? timeChartAgentKeys : chartAgentKeys;
    const sortedData = [...timeSpentData]
        .filter(d => !d.isBaseline && agentFilter.includes(d.agentKey))
        .sort((a, b) => b.hours - a.hours);

    // Set wrapper dimensions based on screen size and agent count
    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    if (isMobile) {
        const dynamicHeight = Math.max(250, sortedData.length * 38);
        wrapper.style.minWidth = '';
        wrapper.style.height = `${dynamicHeight}px`;
    } else {
        const dynamicHeight = Math.max(400, sortedData.length * 45);
        wrapper.style.minWidth = '';
        wrapper.style.height = `${dynamicHeight}px`;
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
                    ctx.strokeStyle = chartError;
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
                ctx.font = `500 ${isMobile ? 9 : fontSizes.axisTicks}px ${chartFont}`;
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
        const isReprompted = d.reasoningEffort && d.reasoningEffort.includes('Reprompted');
        const cleanEffort = isReprompted ? d.reasoningEffort.replace(', Reprompted', '').trim() : d.reasoningEffort;
        const dagger = isReprompted ? '†' : '';
        const displayName = cleanEffort ? `${d.agent} (${cleanEffort})${dagger}` : d.agent;
        return displayName.length > (scaffold?.length || 0) ? displayName : scaffold;
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
                const isReprompted = dataItem.reasoningEffort && dataItem.reasoningEffort.includes('Reprompted');
                const cleanEffort = isReprompted ? dataItem.reasoningEffort.replace(', Reprompted', '').trim() : dataItem.reasoningEffort;
                const dagger = isReprompted ? '†' : '';
                const displayName = cleanEffort ? `${dataItem.agent} (${cleanEffort})${dagger}` : dataItem.agent;

                if (isMobile) {
                    // On mobile: show only agent name, single line
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px ${chartFont}`;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(displayName, xPos, yPos);
                } else if (scaffold) {
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px ${chartFont}`;
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(displayName, xPos, yPos - 1);

                    ctx.globalAlpha = 0.55;
                    ctx.font = `400 ${scaffoldFontSize}px ${chartFont}`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(scaffold, xPos, yPos + 1);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px ${chartFont}`;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(displayName, xPos, yPos);
                }
            });

            ctx.restore();
        }
    };

    // Create stripe pattern for reprompted bars in time chart
    const createTimeStripePattern = (color) => {
        const pc = document.createElement('canvas');
        pc.width = 10; pc.height = 10;
        const p = pc.getContext('2d');
        p.fillStyle = color;
        p.fillRect(0, 0, 10, 10);
        p.strokeStyle = 'rgba(255,255,255,0.35)';
        p.lineWidth = 2;
        p.beginPath(); p.moveTo(0, 10); p.lineTo(10, 0); p.stroke();
        p.beginPath(); p.moveTo(-2, 2); p.lineTo(2, -2); p.stroke();
        p.beginPath(); p.moveTo(8, 12); p.lineTo(12, 8); p.stroke();
        return ctx.getContext('2d').createPattern(pc, 'repeat');
    };

    const chartBar = style.getPropertyValue('--chart-bar').trim() || accentPrimary;

    const timeBarColors = sortedData.map(d => {
        if (d.reasoningEffort && d.reasoningEffort.includes('Reprompted')) return createTimeStripePattern(chartBar);
        return chartBar;
    });

    // Vertical dashed line at x=10 to mark the budget. The chart's
    // x-axis goes to 11 (not 10) so error bars on the top agents
    // (Opus 4.6 at ~9h with ±std) and their text labels have room
    // past the budget line. Label sits ABOVE chartArea.top in the
    // layout's top padding, so it never collides with the top bar's
    // right-side data label.
    const budgetLinePlugin = {
        id: 'budgetLine',
        afterDatasetsDraw(chart) {
            const { ctx: c, scales, chartArea } = chart;
            const xPos = scales.x.getPixelForValue(10);
            c.save();
            c.strokeStyle = accentPrimary;
            c.lineWidth = 1.5;
            c.setLineDash([4, 4]);
            c.beginPath();
            c.moveTo(xPos, chartArea.top);
            c.lineTo(xPos, chartArea.bottom);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = accentPrimary;
            c.font = `600 ${isMobile ? 9 : 10}px ${chartFont}`;
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillText('10h budget', xPos, chartArea.top - 4);
            c.restore();
        }
    };

    timeSpentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time Spent (hours)',
                data: sortedData.map(d => d.hours),
                backgroundColor: timeBarColors,
                borderColor: chartBar,
                borderWidth: isMobile ? 1 : 2,
                borderRadius: isMobile ? 2 : 4,
                barPercentage: isMobile ? 0.6 : 0.8,
                categoryPercentage: isMobile ? 0.8 : 0.9,
                datalabels: { display: false }
            }]
        },
        plugins: [timeErrorBarPlugin, customLabelsPlugin, budgetLinePlugin],
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            // Padding gives the budget label (top) and right-side data
            // labels (e.g. "9:39 ± 0:53") room without colliding with
            // the chart's own canvas edges.
            layout: {
                padding: {
                    top: isMobile ? 14 : 18,
                    right: isMobile ? 55 : 80
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: chartTooltipBg,
                    padding: isMobile ? 8 : 12,
                    titleFont: {
                        family: chartFont,
                        size: isMobile ? 11 : fontSizes.tooltipTitle
                    },
                    bodyFont: {
                        family: chartFont,
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
                    max: 11,
                    title: {
                        display: !isMobile,
                        text: 'Time (hours)',
                        color: textPrimary,
                        font: {
                            family: chartFont,
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
                            family: chartFont,
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
                            family: chartFont,
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

    // Toggle time chart between main agents and all agents
    const toggleBtn = document.getElementById('toggleTimeAgents');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            showAllTimeAgents = !showAllTimeAgents;
            toggleBtn.textContent = showAllTimeAgents ? 'Show main agents' : 'Show all agents';
            if (timeSpentChart) {
                timeSpentChart.destroy();
            }
            createTimeSpentChart();
        });
    }

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
