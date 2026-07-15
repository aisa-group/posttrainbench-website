
// Register Chart.js datalabels plugin (if available)
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Global chart instances
let performanceChart = null;
let paretoChart = null;
let timeSpentChart = null;
let currentSelectedModel = 'average';
let isThemeTransitioning = false;
let activeThemeTransition = null;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

// Hamburger Menu Toggle
const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks = document.getElementById('nav-links');

function setMobileNavOpen(isOpen) {
    hamburgerBtn.classList.toggle('active', isOpen);
    navLinks.classList.toggle('active', isOpen);
    hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
    hamburgerBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}

hamburgerBtn.addEventListener('click', () => {
    setMobileNavOpen(!navLinks.classList.contains('active'));
});

// Close menu when clicking a link
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
        setMobileNavOpen(false);
    });
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!hamburgerBtn.contains(e.target) && !navLinks.contains(e.target)) {
        setMobileNavOpen(false);
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navLinks.classList.contains('active')) {
        setMobileNavOpen(false);
        hamburgerBtn.focus();
    }
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && navLinks.classList.contains('active')) {
        setMobileNavOpen(false);
    }
});

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Load saved theme or default to light
const savedTheme = localStorage.getItem('theme') || 'light';
html.setAttribute('data-theme', savedTheme);
themeToggle.setAttribute('aria-label', savedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');

function commitTheme(newTheme) {
    isThemeTransitioning = true;
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    themeToggle.setAttribute('aria-label', newTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');

    // Recreate the canvases in their destination colors, but suppress their
    // normal entrance builds while the page-level theme crossfade is running.
    if (performanceChart) {
        performanceChart.destroy();
        createSimpleChart(currentSelectedModel);
    }
    if (paretoChart) {
        paretoChart.destroy();
        createParetoChart();
    }
    if (timeSpentChart) {
        timeSpentChart.destroy();
        createTimeSpentChart();
    }

    requestAnimationFrame(() => {
        isThemeTransitioning = false;
    });
}

themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    if (!reducedMotionQuery.matches && typeof document.startViewTransition === 'function') {
        // A second click should retarget immediately rather than waiting for
        // the previous crossfade to finish.
        activeThemeTransition?.skipTransition();
        const transition = document.startViewTransition(() => commitTheme(newTheme));
        activeThemeTransition = transition;
        transition.finished
            .catch(() => {})
            .finally(() => {
                if (activeThemeTransition === transition) activeThemeTransition = null;
            });
    } else {
        commitTheme(newTheme);
    }
});

// Map model-filter values to actual model names in data
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
        } else if (fallbackType === 'substituted') {
            valueStr += '<sup>‡</sup>';
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
        let displayAgent = entry.agent;
        if (entry.agent === 'Official Instruct Models' && modelName !== 'average') {
            displayAgent = 'Official Instruct Model';
        }
        const footnoteMarker = agentInfo[entry.agentKey]?.footnoteMarker || '';
        const markerHtml = footnoteMarker ? `<sup>${footnoteMarker}</sup>` : '';
        const prelim = agentInfo[entry.agentKey]?.preliminary;
        const prelimNote = agentInfo[entry.agentKey]?.preliminaryNote || 'Preliminary — these numbers will change soon.';
        const prelimBadge = prelim ? ` <span class="preliminary-badge" data-tip="${prelimNote}">Preliminary</span>` : '';
        let agentNameHtml = `${displayAgent}${markerHtml}${prelimBadge}`;
        if (entry.scaffold) {
            const effortTag = entry.reasoningEffort ? entry.reasoningEffort.split(', ').map(t => `<span class="effort-tag">${t}</span>`).join('') : '';
            agentNameHtml = `${displayAgent}${markerHtml}${prelimBadge}<span class="scaffold-label">${entry.scaffold}${effortTag}</span>`;
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

// Shared tooltip config for all charts. Themed like the site's DOM tooltip
// (.tt-pop) instead of Chart.js's default black box, no per-line color
// swatches (every chart here has one series), a fast 150ms fade so the
// tooltip feels attached to the cursor, and caret padding so it floats
// clear of the mark it describes.
// Sized to whisper, not headline: 12px pins it to the axis-tick/.tt-pop
// scale — transient reference UI should sit below the table's 14px, and
// the old "adaptive" fontSizes.tooltip* always computed ~17px anyway
// (calculateFontSizes runs before Chart.js sizes the canvas, so it reads
// the 300px <canvas> default).
function chartTooltipOptions(style, isMobile, overrides = {}) {
    return Object.assign({
        backgroundColor: style.getPropertyValue('--bg-tertiary').trim(),
        titleColor: style.getPropertyValue('--text-primary').trim(),
        bodyColor: style.getPropertyValue('--text-primary').trim(),
        borderColor: style.getPropertyValue('--border-color').trim(),
        borderWidth: 1,
        cornerRadius: 6,
        padding: isMobile ? 8 : 10,
        displayColors: false,
        caretPadding: 10,
        caretSize: 6,
        titleFont: {
            family: "'JetBrains Mono', monospace",
            size: isMobile ? 11 : 12,
            weight: 700
        },
        bodyFont: {
            family: "'JetBrains Mono', monospace",
            size: isMobile ? 10 : 12
        },
        animation: { duration: 150, easing: 'easeOutQuart' }
    }, overrides);
}

// Default tooltip title for category charts: multi-line axis labels are
// arrays, which Chart.js would otherwise join with a comma ("Fable 5‡,(Max)").
function chartTooltipTitle(items) {
    if (!items.length) return '';
    const labels = items[0].chart.data.labels;
    const raw = labels ? labels[items[0].dataIndex] : items[0].label;
    return Array.isArray(raw) ? raw.join(' ') : raw;
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
    // X-axis label rotation: horizontal on wide desktop, tilt 45° at narrower
    // widths so the ~15 labels don't collide, fixed 55° on mobile.
    const xLabelRotation = isMobile ? 55 : (window.innerWidth < 1250 ? 45 : 0);

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
        const isMax = d.reasoningEffort === 'Max';
        const dagger = isReprompted ? '†' : '';
        const note = agentInfo[d.agentKey]?.footnoteMarker || '';
        const maxSuffix = isMax ? ' (Max)' : '';
        const displayName = `${d.agent}${dagger}${note}${maxSuffix}`;
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
        // Max-reasoning variants: name first, then "(Max)" on the last line.
        // Split multi-word names (e.g. "Fable 5 (1M)") so a trailing "(1M)"
        // gets its own line instead of colliding with the neighbour.
        if (isMax) {
            const maxWords = d.agent.split(' ');
            const nameLines = maxWords.length >= 3
                ? [maxWords.slice(0, Math.ceil(maxWords.length / 2)).join(' '), maxWords.slice(Math.ceil(maxWords.length / 2)).join(' ')]
                : [d.agent];
            nameLines[nameLines.length - 1] += `${dagger}${note}`;
            nameLines.push('(Max)');
            return nameLines;
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

    // Custom plugin for error bars.
    // The caps ride each bar's animated top (rather than floating at the final
    // position while the bar is still growing) and fade in proportionally as the
    // bar reaches full height, so they build in together with the bars.
    const errorBarPlugin = {
        id: 'errorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { y } } = chart;
            const meta = chart.getDatasetMeta(0);
            const data = chart.data.datasets[0].data;

            ctx.save();
            ctx.strokeStyle = '#704028'; // Dark terracotta for error bars
            ctx.lineWidth = isMobile ? 1 : 1.5;

            meta.data.forEach((bar, index) => {
                const error = errorBars[index];
                if (error === null || !(error > 0)) return;

                // Pixels spanned by `error` units (the y scale is static during
                // the bar animation, so this conversion is constant per frame).
                const errPx = Math.abs(y.getPixelForValue(error) - y.getPixelForValue(0));
                const finalTop = y.getPixelForValue(data[index]);
                const span = bar.base - finalTop; // full bar height in px
                const grow = span > 0 ? Math.min(1, Math.max(0, (bar.base - bar.y) / span)) : 1;

                const xPos = bar.x;
                const errorTop = bar.y - errPx; // centered on the animated bar top
                const errorBottom = bar.y + errPx;
                const capWidth = isMobile ? 3 : 6;

                ctx.globalAlpha = grow; // fade the caps in as the bar grows

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
            });
            ctx.restore();
        }
    };

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
            // Staggered build: bars grow in rank order (data is ascending, so the
            // reveal climbs toward #1). Disabled when the user prefers reduced motion.
            animation: reduceMotion ? { duration: 0 } : {
                duration: 450,
                easing: 'easeOutCubic',
                delay: (c) => (c.type === 'data' && c.mode === 'default') ? c.dataIndex * 28 : 0,
            },
            // Tooltip only while actually over a bar — intersect: false would
            // keep a tooltip active anywhere in the plot area, which reads as
            // "stuck" when sweeping across empty space.
            interaction: {
                mode: 'index',
                intersect: true
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: chartTooltipOptions(style, isMobile, {
                    callbacks: {
                        title: chartTooltipTitle,
                        label: function(context) {
                            const std = errorBars[context.dataIndex];
                            const stdText = std ? ` ± ${std}%` : '';
                            return `Average score: ${context.parsed.y.toFixed(1)}%${stdText}`;
                        }
                    }
                }),
                datalabels: {
                    display: !isMobile,
                    color: '#ffffff',
                    anchor: 'start',
                    align: 'end',
                    offset: 4,
                    // Size each label off the ACTUAL rendered bar width so
                    // "XX.X%" fits inside its bar. Keeps the normal size on wide
                    // bars, shrinks only when a bar is too narrow to hold it.
                    font: function(context) {
                        const meta = context.chart.getDatasetMeta(context.datasetIndex);
                        const bar = meta && meta.data && meta.data[context.dataIndex];
                        const barWidth = (bar && bar.width) ? bar.width : 40;
                        // Monospace char ≈ 0.6em; "XX.X%" is 5 chars, keep within ~90% of the bar.
                        const fit = Math.floor((barWidth * 0.9) / (5 * 0.6));
                        const size = Math.max(8, Math.min(fontSizes.axisTicks, fit));
                        return { family: "'JetBrains Mono', monospace", size: size, weight: 500 };
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
                            size: isMobile ? 9 : Math.max(8, fontSizes.axisTicks - 2)
                        },
                        maxRotation: xLabelRotation,
                        minRotation: xLabelRotation,
                        autoSkip: false
                    }
                }
            }
        }
    });
}

// Create Performance vs. Time scatter with Pareto frontier.
// One point per main-chart agent (baselines excluded); x = average time spent
// (hours), y = average benchmark performance (%). The dashed line steps along
// the Pareto frontier: down to the x-axis at the fastest frontier agent, and
// out to the right edge at the best-performing one.
function createParetoChart() {
    const ctx = document.getElementById('paretoChart');
    if (!ctx) return;

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();
    const bgPrimary = style.getPropertyValue('--bg-primary').trim();
    const chartBar = style.getPropertyValue('--chart-bar').trim() || accentPrimary;

    const isMobile = window.innerWidth <= 768;

    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    if (isMobile) {
        wrapper.style.minWidth = '';
        wrapper.style.height = '320px';
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
    }

    const fontSizes = calculateFontSizes(ctx);

    // Join average score with time spent. Sorted by time so the entrance
    // animation cascades fastest-agent-first, left to right.
    const points = leaderboardData
        .filter(d => !d.isBaseline && d.showInChart && timeData[d.agentKey])
        .map(d => {
            const t = timeData[d.agentKey];
            const isReprompted = !!(d.reasoningEffort && d.reasoningEffort.includes('Reprompted'));
            const cleanEffort = isReprompted
                ? d.reasoningEffort.replace(', Reprompted', '').trim()
                : d.reasoningEffort;
            const label = (cleanEffort ? `${d.agent} (${cleanEffort})` : d.agent) + (isReprompted ? '†' : '');
            return {
                x: t.hours,
                y: parseFloat(d.averageScore),
                label: label,
                agentKey: d.agentKey,
                scaffold: d.scaffold,
                time: t.time,
                stdTime: t.stdHours ? t.stdTime : null,
                stdDev: d.stdDev ? parseFloat(d.stdDev) : null
            };
        })
        .sort((a, b) => a.x - b.x);

    if (points.length === 0) return;

    // Pareto frontier: points no other point beats on both time and score.
    const frontier = points
        .filter(p => !points.some(q =>
            q !== p && q.x <= p.x && q.y >= p.y && (q.x < p.x || q.y > p.y)))
        .sort((a, b) => a.x - b.x);
    const frontierKeys = new Set(frontier.map(p => p.agentKey));

    // Axis bounds: x runs to just past the 10h budget; y brackets the data.
    const xMax = 10.5;
    const perfs = points.map(p => p.y);
    const yMin = Math.max(0, Math.floor((Math.min(...perfs) - 3) / 5) * 5);
    const yMax = Math.ceil((Math.max(...perfs) + 3) / 5) * 5;

    // Frontier polyline with edge extensions (paper fig. 2 style).
    const frontierLine = [
        { x: frontier[0].x, y: yMin },
        ...frontier.map(p => ({ x: p.x, y: p.y })),
        { x: xMax, y: frontier[frontier.length - 1].y }
    ];

    const pointRadius = isMobile ? 4 : 5.5;

    // Direct labels with greedy collision avoidance: frontier points get
    // priority (and primary ink); a label that can't find a clear spot is
    // dropped — the tooltip still identifies its point.
    const labelPlugin = {
        id: 'paretoLabels',
        afterDatasetsDraw(chart) {
            const { ctx: c, chartArea, scales } = chart;
            const fontSize = isMobile ? 8 : Math.max(9, fontSizes.axisTicks - 1);
            c.save();
            c.font = `500 ${fontSize}px 'JetBrains Mono', monospace`;

            const pts = points.map(p => ({
                px: scales.x.getPixelForValue(p.x),
                py: scales.y.getPixelForValue(p.y),
                p: p
            }));

            // Points themselves are obstacles for label placement.
            const placed = pts.map(({ px, py }) => ({
                left: px - pointRadius - 2, right: px + pointRadius + 2,
                top: py - pointRadius - 2, bottom: py + pointRadius + 2
            }));

            const ordered = [...pts].sort((a, b) =>
                (frontierKeys.has(b.p.agentKey) ? 1 : 0) - (frontierKeys.has(a.p.agentKey) ? 1 : 0));

            ordered.forEach(({ px, py, p }) => {
                if (isMobile && !frontierKeys.has(p.agentKey)) return;
                const w = c.measureText(p.label).width;
                const h = fontSize;
                // Must clear the point's own obstacle rect (radius + 2px pad +
                // 3px separation margin), or every candidate self-collides.
                const gap = pointRadius + 8;
                const diag = gap * 0.8;
                const candidates = [
                    { x: px + gap, y: py, align: 'left', baseline: 'middle' },
                    { x: px, y: py - gap, align: 'center', baseline: 'bottom' },
                    { x: px, y: py + gap, align: 'center', baseline: 'top' },
                    { x: px - gap, y: py, align: 'right', baseline: 'middle' },
                    { x: px + diag, y: py - diag, align: 'left', baseline: 'bottom' },
                    { x: px - diag, y: py - diag, align: 'right', baseline: 'bottom' },
                    { x: px + diag, y: py + diag, align: 'left', baseline: 'top' },
                    { x: px - diag, y: py + diag, align: 'right', baseline: 'top' }
                ];
                for (const cand of candidates) {
                    const left = cand.align === 'left' ? cand.x
                        : cand.align === 'center' ? cand.x - w / 2 : cand.x - w;
                    const top = cand.baseline === 'top' ? cand.y
                        : cand.baseline === 'middle' ? cand.y - h / 2 : cand.y - h;
                    const rect = { left: left, right: left + w, top: top, bottom: top + h };
                    if (rect.left < chartArea.left || rect.right > chartArea.right ||
                        rect.top < chartArea.top || rect.bottom > chartArea.bottom) continue;
                    const collides = placed.some(o =>
                        !(rect.right < o.left - 3 || rect.left > o.right + 3 ||
                          rect.bottom < o.top - 3 || rect.top > o.bottom + 3));
                    if (collides) continue;
                    c.textAlign = cand.align;
                    c.textBaseline = cand.baseline;
                    // Surface-colored halo keeps labels readable where they
                    // cross gridlines or the dashed frontier/budget lines.
                    c.strokeStyle = bgPrimary;
                    c.lineWidth = 3;
                    c.lineJoin = 'round';
                    c.strokeText(p.label, cand.x, cand.y);
                    c.fillStyle = frontierKeys.has(p.agentKey) ? textPrimary : textSecondary;
                    c.fillText(p.label, cand.x, cand.y);
                    placed.push(rect);
                    break;
                }
            });
            c.restore();
        }
    };

    // Vertical dashed line at x=10 marking the budget, same motif as the
    // time chart. Drawn BEFORE the datasets so points and their labels sit
    // on top of it. Label sits in the top layout padding.
    const budgetLinePlugin = {
        id: 'paretoBudgetLine',
        beforeDatasetsDraw(chart) {
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
            c.font = `600 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillText('10h budget', xPos, chartArea.top - 4);
            c.restore();
        }
    };

    const reduceMotion = reducedMotionQuery.matches || isThemeTransitioning;
    const buildAnimation = reduceMotion ? { duration: 0 } : {
        duration: 450,
        easing: 'easeOutCubic',
        // Points pop in fastest-agent-first (data is sorted by time).
        delay: (c) => (c.type === 'data' && c.mode === 'default' && c.datasetIndex === 0)
            ? c.dataIndex * 40 : 0,
    };

    paretoChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Agents',
                    data: points,
                    backgroundColor: chartBar,
                    borderColor: bgPrimary,
                    borderWidth: 2,
                    pointRadius: pointRadius,
                    pointHoverRadius: pointRadius + 2,
                    pointHoverBorderWidth: 2,
                    // Small forgiveness margin around the 11px dot — enough to
                    // not demand pixel aim, small enough that the tooltip never
                    // fires while visibly off the point.
                    pointHitRadius: 4
                },
                {
                    label: 'Pareto frontier',
                    type: 'line',
                    data: frontierLine,
                    borderColor: textSecondary,
                    borderWidth: 1.5,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    pointHitRadius: 0,
                    fill: false,
                    tension: 0,
                    animation: false
                }
            ]
        },
        plugins: [labelPlugin, budgetLinePlugin],
        options: {
            responsive: true,
            maintainAspectRatio: !isMobile,
            animation: buildAnimation,
            layout: {
                padding: { top: isMobile ? 14 : 18 }
            },
            plugins: {
                legend: { display: false },
                tooltip: chartTooltipOptions(style, isMobile, {
                    callbacks: {
                        title: (items) => items[0].raw.label,
                        label: (item) => {
                            const p = item.raw;
                            const lines = [
                                `Avg score: ${p.y.toFixed(1)}%${p.stdDev ? ` ± ${p.stdDev.toFixed(1)}%` : ''}`,
                                `Time: ${p.time}${p.stdTime ? ` ± ${p.stdTime}` : ''}`
                            ];
                            if (p.scaffold) lines.push(`Scaffold: ${p.scaffold}`);
                            if (frontierKeys.has(p.agentKey)) lines.push('On the Pareto frontier');
                            return lines;
                        }
                    }
                }),
                datalabels: { display: false }
            },
            scales: {
                x: {
                    min: 0,
                    max: xMax,
                    title: {
                        display: !isMobile,
                        text: 'Average time spent (hours)',
                        color: textPrimary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: fontSizes.axisTitle,
                            weight: 500
                        }
                    },
                    grid: { color: borderColor },
                    ticks: {
                        color: textSecondary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 9 : fontSizes.axisTicks
                        },
                        stepSize: 2,
                        // Hide the bounds tick at 10.5 — the axis pads past the
                        // budget line, but "10.5h" is not a meaningful gridline.
                        callback: value => value === xMax ? null : value + 'h'
                    }
                },
                y: {
                    min: yMin,
                    max: yMax,
                    title: {
                        display: !isMobile,
                        text: 'Average benchmark performance (%)',
                        color: textPrimary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: fontSizes.axisTitle,
                            weight: 500
                        }
                    },
                    grid: { color: borderColor },
                    ticks: {
                        color: textSecondary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 9 : fontSizes.axisTicks
                        },
                        stepSize: 5,
                        callback: value => value + '%'
                    }
                }
            }
        }
    });
}

// Create Time Spent Chart
let showAllTimeAgents = false;

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

    const reduceMotion = reducedMotionQuery.matches || isThemeTransitioning;
    const buildAnimation = reduceMotion ? { duration: 0 } : {
        duration: 450,
        easing: 'easeOutCubic',
        // Cascade the horizontal bars in from the top.
        delay: (c) => (c.type === 'data' && c.mode === 'default') ? c.dataIndex * 22 : 0,
    };

    const timeErrorBarPlugin = {
        id: 'timeErrorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales } = chart;
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);

            ctx.save();

            dataset.data.forEach((value, index) => {
                const dataItem = sortedData[index];
                const bar = meta.data[index];
                const yPos = bar.y;
                const barHeight = bar.height;

                // The bar grows horizontally (bar.x animates from its base to the
                // final value). Ride the error caps and the time label on the
                // animated end and fade them in as the bar reaches full length, so
                // they build in with the bar instead of floating ahead of it.
                const finalX = scales.x.getPixelForValue(value);
                const grow = finalX !== bar.base
                    ? Math.min(1, Math.max(0, (bar.x - bar.base) / (finalX - bar.base)))
                    : 1;
                ctx.globalAlpha = grow;

                let labelX;

                if (dataItem.stdHours) {
                    ctx.strokeStyle = '#704028';
                    ctx.lineWidth = isMobile ? 1 : 2;

                    const capSize = Math.min(barHeight * 0.3, isMobile ? 4 : 6);
                    const stdRightPx = scales.x.getPixelForValue(value + dataItem.stdHours) - finalX;
                    const stdLeftPx = finalX - scales.x.getPixelForValue(value - dataItem.stdHours);
                    const xMax = bar.x + stdRightPx;
                    const xMin = bar.x - stdLeftPx;

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
                    labelX = bar.x + (isMobile ? 4 : 8);
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
                    ctx.font = `500 ${labelFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'middle';
                    ctx.fillText(displayName, xPos, yPos);
                } else if (scaffold) {
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(displayName, xPos, yPos - 1);

                    ctx.globalAlpha = 0.55;
                    ctx.font = `400 ${scaffoldFontSize}px 'JetBrains Mono', monospace`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(scaffold, xPos, yPos + 1);
                    ctx.globalAlpha = 1;
                } else {
                    ctx.fillStyle = textSecondary;
                    ctx.font = `500 ${labelFontSize}px 'JetBrains Mono', monospace`;
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
            c.font = `600 ${isMobile ? 9 : 10}px 'JetBrains Mono', monospace`;
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
            animation: buildAnimation,
            // Tooltip only while actually over a bar (see main chart note).
            interaction: {
                mode: 'index',
                axis: 'y',
                intersect: true
            },
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
                tooltip: chartTooltipOptions(style, isMobile, {
                    callbacks: {
                        // The axis labels are drawn by customLabelsPlugin (the
                        // built-in ticks are transparent and sometimes hold the
                        // scaffold name instead), so build the title from data.
                        title: function(items) {
                            const d = sortedData[items[0].dataIndex];
                            const isReprompted = d.reasoningEffort && d.reasoningEffort.includes('Reprompted');
                            const cleanEffort = isReprompted ? d.reasoningEffort.replace(', Reprompted', '').trim() : d.reasoningEffort;
                            const dagger = isReprompted ? '†' : '';
                            return cleanEffort ? `${d.agent} (${cleanEffort})${dagger}` : d.agent;
                        },
                        label: function(context) {
                            const dataItem = sortedData[context.dataIndex];
                            let label = `Time: ${dataItem.time} (${context.parsed.x.toFixed(2)} hours)`;
                            if (dataItem.stdHours) {
                                label += ` ± ${dataItem.stdTime}`;
                            }
                            return label;
                        }
                    }
                }),
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
        if (paretoChart) {
            paretoChart.destroy();
            createParetoChart();
        }
        if (timeSpentChart) {
            timeSpentChart.destroy();
            createTimeSpentChart();
        }
        handleNavbarLogoVisibility();
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

// Custom model picker. It retains the original visual character while matching
// native-select basics: labelled state, arrow-key navigation, typeahead,
// Escape/Tab dismissal, and a single announced selected option.
const modelDropdown = document.getElementById('model-dropdown');
const dropdownDisplay = document.getElementById('model-select-display');
const dropdownOptions = document.getElementById('model-select-options');
const dropdownOptionButtons = [...(dropdownOptions?.querySelectorAll('.dropdown-option') || [])];

function setModelDropdownOpen(isOpen, optionToFocus = null) {
    if (!modelDropdown || !dropdownDisplay) return;
    modelDropdown.classList.toggle('open', isOpen);
    dropdownDisplay.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && optionToFocus) {
        requestAnimationFrame(() => optionToFocus.focus());
    }
}

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

        // Update model if changed. The pareto chart is unaffected: time data
        // exists only as a per-agent aggregate, not per target model.
        if (selectedValue !== currentSelectedModel) {
            currentSelectedModel = selectedValue;
            populateLeaderboard(selectedValue);

            // Update charts based on selected model
            if (performanceChart) {
                performanceChart.destroy();
                createSimpleChart(selectedValue);
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

// Navbar logo visibility based on hero section.
// While the hero is on screen, the giant "PostTrainBench" title IS the
// brand mark — repeating it in the navbar would be visual duplication.
// We fade the nav logo in only after the hero scrolls off, so it picks
// up where the hero left off.
const logo = document.querySelector('.logo');
const heroSection = document.querySelector('.hero');

function handleNavbarLogoVisibility() {
    if (!heroSection || !logo) return;
    const heroBottom = heroSection.getBoundingClientRect().bottom;
    if (heroBottom > 0 && window.innerWidth > 768) {
        logo.style.opacity = '0';
        logo.style.visibility = 'hidden';
    } else {
        logo.style.opacity = '1';
        logo.style.visibility = 'visible';
    }
}

window.addEventListener('scroll', handleNavbarLogoVisibility);

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Load scores data from JSON
    // The leaderboard is normally rendered synchronously at the end of the body
    // (from the inlined scores.js), before first paint. Fall back to the async
    // path only if that didn't happen (e.g. scores.js missing).
    if (!window.__ptbDataReady) {
        const loaded = await loadScoresData();
        if (!loaded) {
            console.error('Failed to initialize: could not load scores data');
            document.documentElement.classList.remove('leaderboard-loading');
            return;
        }
        populateLeaderboard();
        populateTasks();
        populateStatistics();
        document.documentElement.classList.remove('leaderboard-loading');
    }

    // Wait for the chart font (JetBrains Mono) before drawing the charts so bar
    // labels don't render in a fallback face and reflow mid-animation. Cap the
    // wait so a slow font CDN never blocks the charts indefinitely.
    if (document.fonts && document.fonts.ready) {
        try {
            await Promise.race([
                document.fonts.ready,
                new Promise((resolve) => setTimeout(resolve, 1500)),
            ]);
        } catch (e) { /* render anyway */ }
    }

    createSimpleChart();
    createParetoChart();
    createTimeSpentChart();
    handleNavbarLogoVisibility(); // Set initial state based on scroll position

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

    // Observation foldables (.hack-category / .evidence-fold): animate the
    // HEIGHT, not just opacity — the box collapsing/growing is the visually
    // salient event, and a bare <details> snaps it instantly in both
    // directions. Non-summary children are wrapped in a .fold-anim div so
    // there is a single element whose height can animate (WAAPI keeps it
    // off the CSS cascade and hardware-friendly). Exits run faster than
    // entrances; reduced motion toggles instantly.
    document.querySelectorAll('details.hack-category, details.evidence-fold').forEach((fold) => {
        const summary = fold.querySelector(':scope > summary');
        if (!summary) return;
        const body = document.createElement('div');
        body.className = 'fold-anim';
        [...fold.children].filter((el) => el !== summary).forEach((el) => body.appendChild(el));
        fold.appendChild(body);

        const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
        summary.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                fold.open = !fold.open;
                return;
            }
            if (fold.dataset.animating) return; // ignore clicks mid-animation
            fold.dataset.animating = '1';
            // Finalization runs from BOTH onfinish and a timeout fallback
            // (idempotent) — animation events can be throttled or suppressed
            // (background tabs, headless), and depending on onfinish alone
            // would leave the fold stuck ignoring clicks.
            const settle = (fn, anim, ms) => {
                let settled = false;
                const run = () => {
                    if (settled) return;
                    settled = true;
                    try { anim.cancel(); } catch (err) { /* already finished */ }
                    fn();
                    delete fold.dataset.animating;
                    body.style.overflow = '';
                };
                anim.onfinish = run;
                setTimeout(run, ms);
            };
            if (fold.open) {
                const h = body.offsetHeight;
                body.style.overflow = 'hidden';
                const anim = body.animate(
                    [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }],
                    { duration: 200, easing: EASE }
                );
                settle(() => { fold.open = false; }, anim, 280);
            } else {
                fold.open = true;
                const h = body.offsetHeight;
                body.style.overflow = 'hidden';
                const anim = body.animate(
                    [{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }],
                    { duration: 260, easing: EASE }
                );
                settle(() => {}, anim, 340);
            }
        });
    });

    // Changelog expand/collapse animation
    const changelog = document.querySelector('details.changelog');
    if (changelog) {
        const summary = changelog.querySelector(':scope > summary');
        const content = changelog.querySelector('.changelog-content');
        summary?.addEventListener('click', (e) => {
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

// Render the leaderboard synchronously from the inlined data (scores.js) as soon
// as this script runs at the end of <body> — before first paint — so the table
// exists in its final position immediately. This removes the async fetch gap
// that flashed an empty table (and pulled the next section up) on reload. The
// charts and event listeners still initialize in the DOMContentLoaded handler.
if (typeof loadScoresDataSync === 'function' && loadScoresDataSync()) {
    populateLeaderboard();
    populateTasks();
    populateStatistics();
    document.documentElement.classList.remove('leaderboard-loading');
    window.__ptbDataReady = true;
}
