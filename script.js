
// Register Chart.js datalabels plugin (if available)
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Global chart instances
let performanceChart = null;
let paretoChart = null;
let timeSpentChart = null;
let currentSelectedModel = 'average';
const LEADERBOARD_PREVIEW_LIMIT = 25;
let showAllLeaderboardAgents = false;
let isThemeTransitioning = false;
let activeThemeTransition = null;
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let resultsVersionContentAnimations = [];

const resultsVersionCopy = {
    'v1.1': {
        status: '<span aria-hidden="true">‡</span> Fable 5 uses Opus 4.8 (Max) scores for GPQA after Fable refused that benchmark.',
        methodology: '<sup>‡</sup> Fable 5 is aggregated over two seeds. Because Fable refused GPQA, its GPQA cells use Opus 4.8 (Max) scores; all other cells are Fable results.',
        tableFootnote: '<sup>*</sup> Model not submitted; base-model score shown. &nbsp;&nbsp; <sup>†</sup> Evaluation error; base-model score shown. &nbsp;&nbsp; <sup>‡</sup> Fable 5 GPQA cells use Opus 4.8 Max scores; see Methodology &amp; caveats.',
        efficiencyNote: ''
    },
    'v1': {
        status: '<span aria-hidden="true">‡</span> Archived v1 results use the original single-judge pipeline. Fable 5 results are preliminary.',
        methodology: '<sup>‡</sup> Fable 5 results come from its initial limited-availability period, when rate limits and refusals caused several SmolLM3-3B runs to fail. Those cells use Opus 4.8 (Max) results.',
        tableFootnote: '<sup>*</sup> Model not submitted; base-model score shown. &nbsp;&nbsp; <sup>†</sup> Evaluation error; base-model score shown. &nbsp;&nbsp; <sup>‡</sup> Preliminary Fable 5 cell; see Methodology &amp; caveats.',
        efficiencyNote: 'Fable 5 runtime is from its preliminary v1 run.'
    }
};

function trackGoatCounterEvent(path, title) {
    if (typeof window.goatcounter?.count !== 'function') return;
    window.goatcounter.count({ path, title, event: true });
}

function updateResultsVersionUI({ instant = false } = {}) {
    const version = normalizeResultsVersion(activeResultsVersion);
    const toggle = document.querySelector('.results-version-toggle');
    if (instant && toggle) {
        toggle.classList.add('is-instant');
        requestAnimationFrame(() => requestAnimationFrame(() => toggle.classList.remove('is-instant')));
    }
    toggle?.classList.toggle('is-v1', version === ARCHIVED_RESULTS_VERSION);

    document.querySelectorAll('[data-results-version]').forEach((button) => {
        const isActive = button.dataset.resultsVersion === version;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });

    document.documentElement.setAttribute('data-results-version', version);
    const copy = resultsVersionCopy[version];
    const status = document.getElementById('results-status');
    const methodology = document.getElementById('fable-methodology-note');
    const tableFootnote = document.getElementById('table-footnote');
    const efficiencyNote = document.getElementById('efficiency-version-note');
    if (status) status.innerHTML = copy.status;
    if (methodology) methodology.innerHTML = copy.methodology;
    if (tableFootnote) tableFootnote.innerHTML = copy.tableFootnote;
    if (efficiencyNote) efficiencyNote.textContent = copy.efficiencyNote;
}

function updateResultsVersionURL(version) {
    const url = new URL(window.location.href);
    if (version === CURRENT_RESULTS_VERSION) {
        url.searchParams.delete('version');
    } else {
        url.searchParams.set('version', version);
    }
    window.history.pushState({ ...window.history.state, resultsVersion: version }, '', url);
}

function animateResultsVersionContent(version) {
    if (reducedMotionQuery.matches || typeof Element.prototype.animate !== 'function') return;

    resultsVersionContentAnimations.forEach(animation => animation.cancel());
    resultsVersionContentAnimations = [
        document.querySelector('#leaderboard .results-status'),
        document.querySelector('#leaderboard .leaderboard-table'),
        document.querySelector('#time-spent .efficiency-grid'),
        document.querySelector('#time-spent .efficiency-note')
    ].filter(Boolean).map((element) => element.animate(
        [
            { opacity: 0.72, transform: `translateY(${version === ARCHIVED_RESULTS_VERSION ? 3 : -3}px)` },
            { opacity: 1, transform: 'translateY(0)' }
        ],
        {
            duration: 180,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
        }
    ));
}

function renderResultsVersion(version, { updateURL = true, animate = true, track = true } = {}) {
    const normalizedVersion = normalizeResultsVersion(version);
    if (normalizedVersion === activeResultsVersion) {
        updateResultsVersionUI({ instant: !animate });
        return false;
    }
    if (!applyResultsVersion(normalizedVersion)) return false;

    updateResultsVersionUI({ instant: !animate });
    populateLeaderboard(currentSelectedModel);

    if (performanceChart) {
        performanceChart.destroy();
        createSimpleChart(currentSelectedModel, { motion: 'none' });
    }
    if (paretoChart) paretoChart.destroy();
    createParetoChart({ motion: 'none' });
    if (timeSpentChart) timeSpentChart.destroy();
    createTimeSpentChart({ motion: 'none' });

    if (updateURL) updateResultsVersionURL(normalizedVersion);
    if (track) {
        trackGoatCounterEvent(
            `results-version/${encodeURIComponent(normalizedVersion)}`,
            `Results version: ${normalizedVersion}`
        );
    }
    if (animate) animateResultsVersionContent(normalizedVersion);
    return true;
}

// Hamburger Menu Toggle
const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks = document.getElementById('nav-links');

function setMobileNavOpen(isOpen, { instant = false } = {}) {
    if (instant) {
        hamburgerBtn.classList.add('no-motion');
        navLinks.classList.add('no-motion');
        requestAnimationFrame(() => requestAnimationFrame(() => {
            hamburgerBtn.classList.remove('no-motion');
            navLinks.classList.remove('no-motion');
        }));
    }
    hamburgerBtn.classList.toggle('active', isOpen);
    navLinks.classList.toggle('active', isOpen);
    hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
    hamburgerBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}

hamburgerBtn.addEventListener('click', (event) => {
    setMobileNavOpen(!navLinks.classList.contains('active'), { instant: event.detail === 0 });
});

// Close menu when clicking a link
navLinks.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', (event) => {
        setMobileNavOpen(false, { instant: event.detail === 0 });
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
        setMobileNavOpen(false, { instant: true });
        hamburgerBtn.focus();
    }
});

window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && navLinks.classList.contains('active')) {
        setMobileNavOpen(false, { instant: true });
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

themeToggle.addEventListener('click', (event) => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    if (event.detail !== 0 && !reducedMotionQuery.matches && typeof document.startViewTransition === 'function') {
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

function getChartAgentMeta(entry) {
    const effortParts = entry.reasoningEffort
        ? entry.reasoningEffort.split(',').map(part => part.trim())
        : [];
    const effort = effortParts.find(part => part !== 'Reprompted') || '';
    const footnote = agentInfo[entry.agentKey]?.footnoteMarker || '';

    return {
        name: `${entry.agent}${footnote}`,
        effort,
        effortLabel: effort
    };
}

function getAgentStatusNote(agentKey) {
    return agentInfo[agentKey]?.statusNote || '';
}

function getChartModelFamily(agentKey) {
    if (/^(opus|sonnet|fable)-/.test(agentKey)) return 'anthropic';
    if (/^gpt-/.test(agentKey)) return 'openai';
    if (/^gemini-/.test(agentKey)) return 'gemini';
    return 'other';
}

function getChartFamilyColors(style) {
    return {
        anthropic: style.getPropertyValue('--chart-family-anthropic').trim(),
        openai: style.getPropertyValue('--chart-family-openai').trim(),
        gemini: style.getPropertyValue('--chart-family-gemini').trim(),
        other: style.getPropertyValue('--chart-family-other').trim()
    };
}

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
                fallbackType: modelScores[key].fallbackType,
                sourceLabel: modelScores[key].sourceLabel || null
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

// Get heatmap color based on normalized value (0-1 scale). The summary
// column carries a little more contrast than the diagnostic benchmarks.
function getHeatmapColor(normalizedValue, emphasis = 'benchmark') {
    const currentTheme = html.getAttribute('data-theme');
    const value = Math.max(0, Math.min(1, normalizedValue));

    // Site accent color: #c17d5a (193, 125, 90)
    const r = 193;
    const g = 125;
    const b = 90;

    const isSummary = emphasis === 'summary';
    const alpha = currentTheme === 'dark'
        ? (isSummary ? 0.1 + (0.38 * value) : 0.07 + (0.3 * value))
        : (isSummary ? 0.07 + (0.31 * value) : 0.035 + (0.245 * value));

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

function getBenchmarkSourceLabel(score) {
    if (typeof score === 'object' && score !== null) {
        return score.sourceLabel || null;
    }
    return null;
}

// Helper to get std value from benchmark score
function getBenchmarkStd(score) {
    if (typeof score === 'object' && score !== null && score.std !== undefined) {
        return score.std;
    }
    return null;
}

function formatStdValue(std) {
    const value = Number.parseFloat(std);
    return Number.isFinite(value) ? value.toFixed(1) : std;
}

function formatSourceLabel(sourceLabel) {
    return sourceLabel?.replace(/\s+Max$/, '') || '';
}

function formatScoreProvenance(sourceLabel, standalone = false) {
    if (!sourceLabel) return '';
    const prefix = standalone ? 'via ' : '<span class="score-provenance-separator">·</span> ';
    return `<span class="score-provenance${standalone ? ' score-provenance-standalone' : ''}">${prefix}<span class="score-provenance-source">${formatSourceLabel(sourceLabel)}</span></span>`;
}

function formatStdDisplay(std, sourceLabel = null) {
    if (std === null || std === undefined) {
        return '';
    }
    return `<span class="std-value">± ${formatStdValue(std)}%${formatScoreProvenance(sourceLabel)}</span>`;
}

// Helper to format benchmark value with fallback marker (only in model-specific view)
function formatBenchmarkValue(score, showMarkers = false, showStd = false) {
    const value = getBenchmarkValue(score);
    const std = getBenchmarkStd(score);
    const sourceLabel = getBenchmarkSourceLabel(score);

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
    if (showStd) {
        valueStr += formatStdDisplay(std, sourceLabel);
    } else if (sourceLabel) {
        valueStr += formatScoreProvenance(sourceLabel, true);
    }

    return valueStr;
}

// Populate Leaderboard
function populateLeaderboard(modelName = "average", { animateReveal = false } = {}) {
    const tbody = document.getElementById('leaderboard-data');
    if (!tbody) return;
    tbody.innerHTML = ''; // Clear existing data
    document.querySelector('.leaderboard-table')?.classList.remove('has-expanded-row');

    const data = getLeaderboardDataForModel(modelName);

    // Only show markers in model-specific view, not average
    const showMarkers = modelName !== "average";

    // Reference models are context, not leaderboard entries. Excluding them
    // keeps the heatmap useful for comparing the ranked agents themselves.
    const rankedData = data.filter(entry => !entry.isBaseline);
    const heatmapData = rankedData.length > 0 ? rankedData : data;
    const previewEntries = new Set(rankedData.slice(0, LEADERBOARD_PREVIEW_LIMIT));
    const visibleData = showAllLeaderboardAgents
        ? data
        : data.filter(entry => entry.isBaseline || previewEntries.has(entry));
    const canToggleLeaderboard = rankedData.length > LEADERBOARD_PREVIEW_LIMIT;
    const disclosure = document.getElementById('leaderboard-disclosure');
    const disclosureButton = document.getElementById('leaderboard-disclosure-button');
    const disclosureLabel = document.getElementById('leaderboard-disclosure-label');

    if (disclosure) disclosure.hidden = !canToggleLeaderboard;
    if (disclosureButton) {
        disclosureButton.setAttribute('aria-expanded', String(showAllLeaderboardAgents));
    }
    if (disclosureLabel) {
        disclosureLabel.textContent = showAllLeaderboardAgents
            ? `Show top ${LEADERBOARD_PREVIEW_LIMIT}`
            : `Show all ${rankedData.length} agents`;
    }

    // Collect all ranked-agent values for each column to find min/max.
    const columns = {
        average: heatmapData.map(e => parseFloat(e.averageScore)),
        aime2025: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.aime2025)),
        arenahardwriting: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.arenahardwriting)),
        bfcl: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.bfcl)),
        gpqamain: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.gpqamain)),
        gsm8k: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.gsm8k)),
        healthbench: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.healthbench)),
        humaneval: heatmapData.map(e => getBenchmarkValue(e.benchmarkScores.humaneval))
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

    visibleData.forEach(entry => {
        const row = document.createElement('tr');
        row.className = `leaderboard-entry-row${entry.isBaseline ? ' reference-row' : ''}`;

        // Handle null ranks for baselines
        const rankDisplay = entry.rank !== null ? entry.rank : '-';
        const rankClass = entry.rank === null
            ? 'rank-ref'
            : (entry.rank <= 3 ? `rank-${entry.rank}` : 'rank-other');

        // Create cells with heatmap colors normalized per column
        const avgValue = parseFloat(entry.averageScore);
        const aimeValue = getBenchmarkValue(entry.benchmarkScores.aime2025);
        const arenaValue = getBenchmarkValue(entry.benchmarkScores.arenahardwriting);
        const bfclValue = getBenchmarkValue(entry.benchmarkScores.bfcl);
        const gpqaValue = getBenchmarkValue(entry.benchmarkScores.gpqamain);
        const gsmValue = getBenchmarkValue(entry.benchmarkScores.gsm8k);
        const healthValue = getBenchmarkValue(entry.benchmarkScores.healthbench);
        const humanValue = getBenchmarkValue(entry.benchmarkScores.humaneval);

        const avgColor = getHeatmapColor(normalize(avgValue, 'average'), 'summary');
        const aimeColor = getHeatmapColor(normalize(aimeValue, 'aime2025'));
        const arenaColor = getHeatmapColor(normalize(arenaValue, 'arenahardwriting'));
        const bfclColor = getHeatmapColor(normalize(bfclValue, 'bfcl'));
        const gpqaColor = getHeatmapColor(normalize(gpqaValue, 'gpqamain'));
        const gsmColor = getHeatmapColor(normalize(gsmValue, 'gsm8k'));
        const healthColor = getHeatmapColor(normalize(healthValue, 'healthbench'));
        const humanColor = getHeatmapColor(normalize(humanValue, 'humaneval'));

        // Format std display (only show if available)
        const stdDisplay = formatStdDisplay(entry.stdDev);
        // Show std for benchmarks in average view (when showMarkers is false)
        const showStd = !showMarkers;

        // Format agent name - put scaffold name on separate line with smaller styling
        let displayAgent = entry.agent;
        if (entry.agent === 'Official Instruct Models' && modelName !== 'average') {
            displayAgent = 'Official Instruct Model';
        }
        const footnoteMarker = agentInfo[entry.agentKey]?.footnoteMarker || '';
        const markerHtml = footnoteMarker ? `<sup>${footnoteMarker}</sup>` : '';
        const statusNote = getAgentStatusNote(entry.agentKey);
        const displayAgentHtml = statusNote
            ? `<span class="agent-name-status" data-tip="${statusNote}">${displayAgent}<span class="agent-status-dot" aria-hidden="true"></span></span>${markerHtml}`
            : `${displayAgent}${markerHtml}`;
        let agentNameHtml = displayAgentHtml;
        if (entry.scaffold) {
            const effortTag = entry.reasoningEffort ? entry.reasoningEffort.split(', ').map(t => `<span class="effort-tag">${t}</span>`).join('') : '';
            agentNameHtml = `${displayAgentHtml}<span class="scaffold-label"><span class="scaffold-name">${entry.scaffold}</span>${effortTag}</span>`;
        } else if (entry.agent === 'Official Instruct Models') {
            agentNameHtml = `${displayAgentHtml}<span class="scaffold-label reference-context">Reference · outside 10h budget</span>`;
        }

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
            <td class="method-cell"><strong>${agentNameHtml}</strong><span class="row-details-indicator"></span></td>
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

        if (
            animateReveal
            && !entry.isBaseline
            && !previewEntries.has(entry)
            && !reducedMotionQuery.matches
            && typeof row.animate === 'function'
        ) {
            row.animate(
                [{ opacity: 0.35 }, { opacity: 1 }],
                {
                    duration: 160,
                    easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
                }
            );
        }

        const detailScores = [
            ['AIME 2025', entry.benchmarkScores.aime2025, aimeColor],
            ['Arena Hard', entry.benchmarkScores.arenahardwriting, arenaColor],
            ['BFCL', entry.benchmarkScores.bfcl, bfclColor],
            ['GPQA Main', entry.benchmarkScores.gpqamain, gpqaColor],
            ['GSM8K', entry.benchmarkScores.gsm8k, gsmColor],
            ['HealthBench', entry.benchmarkScores.healthbench, healthColor],
            ['HumanEval', entry.benchmarkScores.humaneval, humanColor]
        ];
        const detailRow = document.createElement('tr');
        detailRow.className = `benchmark-detail-row${entry.isBaseline ? ' reference-detail-row' : ''}`;
        detailRow.hidden = true;
        detailRow.innerHTML = `
            <td colspan="3">
                <div class="benchmark-detail-panel">
                    <div class="benchmark-detail-grid">
                        ${detailScores.map(([label, score, color]) => `
                            <div class="benchmark-detail-item" style="background-color: ${color}">
                                <span class="benchmark-detail-label">${label}</span>
                                <strong>${formatBenchmarkValue(score, showMarkers, showStd)}</strong>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(detailRow);
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
            : '<span class="findings-empty">-</span>';

        tr.innerHTML = `
            <td data-label="Benchmark">${task.title}${versionBadge}</td>
            <td data-label="Category">${task.category}</td>
            <td data-label="Weight">${weightPct}</td>
            <td data-label="What it tests">${task.description}</td>
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
function createSimpleChart(modelName = "average", { motion = 'initial' } = {}) {
    const ctx = document.getElementById('performanceChart');

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();

    // Check if mobile
    const isMobile = window.innerWidth <= 768;
    const isCompactDesktop = !isMobile && window.innerWidth < 1250;
    // Desktop keeps the complete vertical ranking overview. Phones switch to a
    // shorter horizontal comparison so labels remain readable without rotation.
    const xLabelRotation = window.innerWidth < 1250 ? 45 : 0;

    // Set wrapper dimensions based on screen size
    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    const footnotes = wrapper.parentElement.querySelectorAll('.chart-footnote');
    if (isMobile) {
        wrapper.style.minWidth = '';
        wrapper.style.height = '476px';
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
    const baseReference = data.find(d => d.agent === 'Base Models');
    const officialReference = data.find(d => d.agent === 'Official Instruct Models');

    const plottedData = isMobile
        ? [
            officialReference,
            ...data.filter(d => !d.isBaseline).slice(0, 10),
            baseReference
        ].filter(Boolean)
        : [...data].reverse();

    // Mobile keeps the useful effort qualifier on one line; desktop splits long
    // names so the complete overview still scans as a vertical bar chart.
    const chartLabels = plottedData.map(d => {
        const isMax = d.reasoningEffort === 'Max';
        const note = agentInfo[d.agentKey]?.footnoteMarker || '';
        const maxSuffix = isMax ? ' (Max)' : '';
        const displayName = `${d.agent}${note}${maxSuffix}`;
        if (isMobile) {
            if (d.agent === 'Official Instruct Models') return 'Official Instruct²';
            if (d.agent === 'Base Models') return 'Base Models';
            const cleanEffort = d.reasoningEffort
                ? d.reasoningEffort.replace(', Reprompted', '').trim()
                : '';
            const effortSuffix = cleanEffort ? ` (${cleanEffort})` : '';
            return `${d.agent}${effortSuffix}${note}`;
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
            nameLines[nameLines.length - 1] += note;
            nameLines.push('(Max)');
            return nameLines;
        }
        const words = d.agent.split(' ');
        if (words.length >= 3) {
            const midpoint = Math.ceil(words.length / 2);
            const first = words.slice(0, midpoint).join(' ');
            const second = words.slice(midpoint).join(' ');
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

    const chartColors = plottedData.map(d => {
        if (d.agent === 'Base Models') return chartBarBaseline1;
        if (d.agent === 'Official Instruct Models') return chartBarBaseline2;
        if (d.reasoningEffort && d.reasoningEffort.includes('Reprompted')) return createStripePattern(chartBar);
        return chartBar;
    });

    // Get error bar data (std deviations)
    const errorBars = plottedData.map(d => d.stdDev ? parseFloat(d.stdDev) : null);

    // Preserve the same baseline comparison at every size, but round to the
    // next five points so the official reference does not force excess space.
    // Only regular 10/20-point ticks are labelled below.
    const maxScore = Math.max(...(isMobile ? plottedData : data).map(d => parseFloat(d.averageScore)));
    const yAxisMax = Math.ceil(maxScore / 5) * 5;
    const mobileTickStep = yAxisMax <= 60 ? 10 : 20;

    // Calculate adaptive font sizes
    const fontSizes = calculateFontSizes(ctx);

    // Custom plugin for error bars.
    // The caps ride each bar's animated top (rather than floating at the final
    // position while the bar is still growing) and fade in proportionally as the
    // bar reaches full height, so they build in together with the bars.
    const errorBarPlugin = {
        id: 'errorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales: { x, y } } = chart;
            const meta = chart.getDatasetMeta(0);
            const data = chart.data.datasets[0].data;

            ctx.save();
            ctx.strokeStyle = '#704028'; // Dark terracotta for error bars
            ctx.lineWidth = isMobile ? 1 : 1.5;

            meta.data.forEach((bar, index) => {
                const error = errorBars[index];
                if (error === null || !(error > 0)) return;

                if (isMobile) {
                    const errPx = Math.abs(x.getPixelForValue(error) - x.getPixelForValue(0));
                    const finalEnd = x.getPixelForValue(data[index]);
                    const span = finalEnd - bar.base;
                    const grow = span > 0 ? Math.min(1, Math.max(0, (bar.x - bar.base) / span)) : 1;
                    const errorLeft = bar.x - errPx;
                    const errorRight = bar.x + errPx;
                    const capHeight = 3;

                    ctx.globalAlpha = grow;
                    ctx.beginPath();
                    ctx.moveTo(errorLeft, bar.y);
                    ctx.lineTo(errorRight, bar.y);
                    ctx.moveTo(errorLeft, bar.y - capHeight);
                    ctx.lineTo(errorLeft, bar.y + capHeight);
                    ctx.moveTo(errorRight, bar.y - capHeight);
                    ctx.lineTo(errorRight, bar.y + capHeight);
                    ctx.stroke();
                } else {
                    const errPx = Math.abs(y.getPixelForValue(error) - y.getPixelForValue(0));
                    const finalTop = y.getPixelForValue(data[index]);
                    const span = bar.base - finalTop;
                    const grow = span > 0 ? Math.min(1, Math.max(0, (bar.base - bar.y) / span)) : 1;
                    const errorTop = bar.y - errPx;
                    const errorBottom = bar.y + errPx;
                    const capWidth = 6;

                    ctx.globalAlpha = grow;
                    ctx.beginPath();
                    ctx.moveTo(bar.x, errorTop);
                    ctx.lineTo(bar.x, errorBottom);
                    ctx.moveTo(bar.x - capWidth, errorTop);
                    ctx.lineTo(bar.x + capWidth, errorTop);
                    ctx.moveTo(bar.x - capWidth, errorBottom);
                    ctx.lineTo(bar.x + capWidth, errorBottom);
                    ctx.stroke();
                }
            });
            ctx.restore();
        }
    };

    const reduceMotion = reducedMotionQuery.matches || isThemeTransitioning;
    const chartScales = isMobile ? {
        x: {
            beginAtZero: true,
            max: yAxisMax,
            grid: { color: borderColor },
            ticks: {
                color: textSecondary,
                font: { family: "'JetBrains Mono', monospace", size: 10 },
                stepSize: mobileTickStep,
                callback: value => Number(value) % mobileTickStep === 0 ? value + '%' : null
            }
        },
        y: {
            grid: { display: false },
            ticks: {
                color: textSecondary,
                font: { family: "'JetBrains Mono', monospace", size: 10, weight: 500 },
                autoSkip: false
            }
        }
    } : {
        y: {
            beginAtZero: true,
            max: yAxisMax,
            title: {
                display: true,
                text: 'Average benchmark performance¹',
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
                font: { family: "'JetBrains Mono', monospace", size: fontSizes.axisTicks },
                stepSize: 10,
                callback: function(value) {
                    return Number(value) % 10 === 0 ? value + '%' : null;
                }
            }
        },
        x: {
            title: {
                display: true,
                text: 'LLM powering the CLI agent',
                color: textPrimary,
                font: {
                    family: "'JetBrains Mono', monospace",
                    size: fontSizes.axisTitle,
                    weight: 500
                }
            },
            grid: { display: false },
            ticks: {
                color: textSecondary,
                font: { family: "'JetBrains Mono', monospace", size: Math.max(8, fontSizes.axisTicks - 2) },
                maxRotation: xLabelRotation,
                minRotation: xLabelRotation,
                autoSkip: false
            }
        }
    };

    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Average Score (%)',
                data: plottedData.map(d => parseFloat(d.averageScore)),
                backgroundColor: chartColors,
                borderColor: chartColors,
                borderWidth: isMobile ? 1 : 2,
                borderRadius: isMobile ? 2 : 4,
                barPercentage: isMobile ? 0.62 : (isCompactDesktop ? 0.86 : 0.8),
                categoryPercentage: isMobile ? 0.82 : (isCompactDesktop ? 0.92 : 0.9)
            }]
        },
        plugins: [errorBarPlugin],
        options: {
            indexAxis: isMobile ? 'y' : 'x',
            responsive: true,
            maintainAspectRatio: !isMobile,
            animation: (reduceMotion || motion === 'none')
                ? { duration: 0 }
                : motion === 'initial'
                    ? {
                        duration: 300,
                        easing: 'easeOutQuart',
                        delay: (c) => (c.type === 'data' && c.mode === 'default') ? c.dataIndex * 20 : 0,
                    }
                    : { duration: 190, easing: 'easeOutCubic' },
            // Tooltip only while actually over a bar — intersect: false would
            // keep a tooltip active anywhere in the plot area, which reads as
            // "stuck" when sweeping across empty space.
            interaction: {
                mode: 'index',
                axis: isMobile ? 'y' : 'x',
                intersect: true
            },
            layout: {
                padding: { right: isMobile ? 2 : 0 }
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
                            const value = isMobile ? context.parsed.x : context.parsed.y;
                            return `Average score: ${value.toFixed(1)}%${stdText}`;
                        },
                        afterLabel: function(context) {
                            return getAgentStatusNote(plottedData[context.dataIndex].agentKey) || null;
                        }
                    }
                }),
                datalabels: {
                    display: true,
                    color: function(context) {
                        const value = Number(context.dataset.data[context.dataIndex]);
                        return isMobile && value < 12 ? textPrimary : '#ffffff';
                    },
                    anchor: isMobile ? 'end' : 'start',
                    align: function(context) {
                        const value = Number(context.dataset.data[context.dataIndex]);
                        if (isMobile && value < 12) return 'end';
                        return isMobile ? 'start' : 'end';
                    },
                    offset: 4,
                    // Size each label from the rendered bar width. Compact
                    // desktop bars reserve a stronger inset so values never
                    // appear pressed against their edges.
                    font: function(context) {
                        const value = Number(context.dataset.data[context.dataIndex]);
                        if (isMobile && value < 12) {
                            return { family: "'JetBrains Mono', monospace", size: fontSizes.axisTicks, weight: 500 };
                        }
                        const meta = context.chart.getDatasetMeta(context.datasetIndex);
                        const bar = meta && meta.data && meta.data[context.dataIndex];
                        const barWidth = (bar && bar.width) ? bar.width : 40;
                        const labelLength = `${value.toFixed(1)}%`.length;
                        const widthAllowance = isCompactDesktop ? 0.76 : 0.9;
                        const maxSize = fontSizes.axisTicks;
                        // JetBrains Mono characters are approximately 0.6em wide.
                        const fit = Math.floor((barWidth * widthAllowance) / (labelLength * 0.6));
                        const size = Math.max(8, Math.min(maxSize, fit));
                        return { family: "'JetBrains Mono', monospace", size: size, weight: 600 };
                    },
                    formatter: function(value) {
                        return value.toFixed(1) + '%';
                    }
                }
            },
            scales: chartScales
        }
    });
}

// Create Performance vs. Time scatter with Pareto frontier.
// One point per main-chart agent (baselines excluded); x = average time spent
// (hours), y = average benchmark performance (%). The dashed line steps along
// the Pareto frontier: down to the x-axis at the fastest frontier agent, and
// out to the right edge at the best-performing one.
function createParetoChart({ motion = 'initial' } = {}) {
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
    const familyColors = getChartFamilyColors(style);

    const isMobile = window.innerWidth <= 768;

    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    if (isMobile) {
        wrapper.style.minWidth = '';
        wrapper.style.height = '320px';
    } else {
        wrapper.style.minWidth = '';
    }

    const fontSizes = calculateFontSizes(ctx);

    // Join average score with time spent. Sorted by time so the entrance
    // animation cascades fastest-agent-first, left to right.
    const points = leaderboardData
        .filter(d => !d.isBaseline && d.showInChart && timeData[d.agentKey])
        .map(d => {
            const t = timeData[d.agentKey];
            const labelMeta = getChartAgentMeta(d);
            const modelFamily = getChartModelFamily(d.agentKey);
            return {
                x: t.hours,
                y: parseFloat(d.averageScore),
                label: labelMeta.name,
                reasoningEffort: labelMeta.effort,
                reasoningLabel: labelMeta.effortLabel,
                agentKey: d.agentKey,
                scaffold: d.scaffold,
                time: t.time,
                stdTime: t.stdHours ? t.stdTime : null,
                stdDev: d.stdDev ? parseFloat(d.stdDev) : null,
                statusNote: getAgentStatusNote(d.agentKey),
                modelFamily,
                familyColor: familyColors[modelFamily] || chartBar
            };
        })
        .sort((a, b) => a.x - b.x);

    if (points.length === 0) return;

    if (!isMobile) {
        wrapper.style.height = `${Math.max(480, points.length * 40)}px`;
    }

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
            const fontSize = isMobile ? 10 : Math.max(9, fontSizes.axisTicks - 1);
            const effortFontSize = Math.max(8, fontSize - 2);
            const nameFont = `500 ${fontSize}px 'JetBrains Mono', monospace`;
            const effortFont = `600 ${effortFontSize}px 'JetBrains Mono', monospace`;
            c.save();

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
                c.font = nameFont;
                const nameWidth = c.measureText(p.label).width;
                c.font = effortFont;
                const effortWidth = p.reasoningLabel ? c.measureText(p.reasoningLabel).width : 0;
                const w = Math.max(nameWidth, effortWidth);
                const h = fontSize + (p.reasoningLabel ? effortFontSize + 2 : 0);
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
                    c.textBaseline = 'top';
                    const textX = cand.align === 'left' ? rect.left
                        : cand.align === 'center' ? rect.left + w / 2 : rect.right;
                    // Surface-colored halo keeps labels readable where they
                    // cross gridlines or the dashed frontier/budget lines.
                    c.strokeStyle = bgPrimary;
                    c.lineWidth = 3;
                    c.lineJoin = 'round';
                    c.font = nameFont;
                    c.strokeText(p.label, textX, rect.top);
                    c.fillStyle = p.familyColor;
                    c.fillText(p.label, textX, rect.top);
                    if (p.reasoningLabel) {
                        const effortY = rect.top + fontSize + 2;
                        c.font = effortFont;
                        c.strokeText(p.reasoningLabel, textX, effortY);
                        c.globalAlpha = 0.82;
                        c.fillStyle = p.familyColor;
                        c.fillText(p.reasoningLabel, textX, effortY);
                        c.globalAlpha = 1;
                    }
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
            c.font = "600 10px 'JetBrains Mono', monospace";
            c.textAlign = 'center';
            c.textBaseline = 'bottom';
            c.fillText('10h budget', xPos, chartArea.top - 4);
            c.restore();
        }
    };

    const reduceMotion = reducedMotionQuery.matches || isThemeTransitioning || motion === 'none';
    const buildAnimation = reduceMotion
        ? { duration: 0 }
        : motion === 'initial'
            ? {
                duration: 450,
                easing: 'easeOutCubic',
                // Points pop in fastest-agent-first (data is sorted by time).
                delay: (c) => (c.type === 'data' && c.mode === 'default' && c.datasetIndex === 0)
                    ? c.dataIndex * 40 : 0,
            }
            : { duration: 190, easing: 'easeOutCubic' };

    paretoChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Agents',
                    data: points,
                    backgroundColor: points.map(p => p.familyColor),
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
            maintainAspectRatio: false,
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
                                `Runtime: ${formatRuntimeDuration(p.time)}${p.stdTime ? ` ± ${formatRuntimeDuration(p.stdTime)}` : ''}`
                            ];
                            if (p.reasoningEffort) lines.push(`Effort: ${p.reasoningEffort}`);
                            if (p.scaffold) lines.push(`Scaffold: ${p.scaffold}`);
                            if (p.statusNote) lines.push(p.statusNote);
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
                            size: isMobile ? 11 : fontSizes.axisTicks
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
                            size: isMobile ? 11 : fontSizes.axisTicks
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
let budgetMainRowPitch = null;
let budgetChartChromeHeight = null;
let budgetScopeContentAnimation = null;

function formatRuntimeDuration(time) {
    const [hoursPart, minutesPart] = String(time ?? '').split(':');
    const hours = Number.parseInt(hoursPart, 10);
    const minutes = Number.parseInt(minutesPart, 10);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return String(time ?? '');
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function updateTimeScopeControl() {
    document.querySelectorAll('.time-scope-toggle').forEach((toggle) => {
        toggle.classList.toggle('is-all', showAllTimeAgents);
    });
    document.querySelectorAll('[data-time-scope]').forEach((button) => {
        const isActive = button.dataset.timeScope === (showAllTimeAgents ? 'all' : 'main');
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    const scopeNote = document.getElementById('time-scope-note');
    if (scopeNote) {
        scopeNote.textContent = showAllTimeAgents
            ? 'All agents with recorded runtimes shown.'
            : 'Main-chart agents with recorded runtimes only.';
    }
}

function animateBudgetScopeContent(showAll) {
    const wrapper = document.querySelector('.budget-chart .leaderboard-chart-wrapper');
    if (!wrapper || reducedMotionQuery.matches) return;

    const currentStyle = budgetScopeContentAnimation ? getComputedStyle(wrapper) : null;
    const fromOpacity = currentStyle?.opacity || '0.72';
    const fromTransform = currentStyle?.transform && currentStyle.transform !== 'none'
        ? currentStyle.transform
        : `translateY(${showAll ? 3 : -3}px)`;

    budgetScopeContentAnimation?.cancel();
    const animation = wrapper.animate([
        { opacity: fromOpacity, transform: fromTransform },
        { opacity: 1, transform: 'translateY(0)' }
    ], {
        duration: 180,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
        fill: 'both'
    });
    budgetScopeContentAnimation = animation;
    animation.finished.then(() => {
        if (budgetScopeContentAnimation !== animation) return;
        animation.cancel();
        budgetScopeContentAnimation = null;
    }).catch(() => {});
}

function createTimeSpentChart({ motion = 'initial' } = {}) {
    const ctx = document.getElementById('timeSpentChart');

    // Get theme colors
    const style = getComputedStyle(document.documentElement);
    const textPrimary = style.getPropertyValue('--text-primary').trim();
    const textSecondary = style.getPropertyValue('--text-secondary').trim();
    const accentPrimary = style.getPropertyValue('--accent-primary').trim();
    const borderColor = style.getPropertyValue('--border-color').trim();
    const bgTertiary = style.getPropertyValue('--bg-tertiary').trim();

    // Check if mobile
    const isMobile = window.innerWidth <= 768;
    const mobileRuntimeGutter = 50;
    updateTimeScopeControl();

    // Sort by hours (descending), filter out baselines
    const agentFilter = showAllTimeAgents ? timeChartAgentKeys : chartAgentKeys;
    const sortedData = [...timeSpentData]
        .filter(d => !d.isBaseline && agentFilter.includes(d.agentKey))
        .sort((a, b) => b.hours - a.hours);

    // Set wrapper dimensions based on screen size and agent count
    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    const chartShell = ctx.closest('.budget-chart');
    const mainAgentCount = timeSpentData.filter(d =>
        !d.isBaseline && chartAgentKeys.includes(d.agentKey)).length;
    const mainDesktopHeight = Math.max(480, mainAgentCount * 40);
    chartShell?.style.setProperty('--budget-main-wrapper-height', `${mainDesktopHeight}px`);
    chartShell?.classList.toggle('is-all-agents', showAllTimeAgents);
    if (isMobile) {
        const dynamicHeight = Math.max(300, sortedData.length * 36 + 28);
        wrapper.style.minWidth = '';
        wrapper.style.height = `${dynamicHeight}px`;
    } else {
        const hasMainRowMetrics = showAllTimeAgents &&
            Number.isFinite(budgetMainRowPitch) && Number.isFinite(budgetChartChromeHeight);
        const dynamicHeight = hasMainRowMetrics
            ? budgetChartChromeHeight + budgetMainRowPitch * sortedData.length
            : Math.max(480, sortedData.length * 40);
        wrapper.style.minWidth = '';
        wrapper.style.height = `${dynamicHeight}px`;
    }

    // Calculate adaptive font sizes
    const fontSizes = calculateFontSizes(ctx);
    const labelFontSize = isMobile ? 10 : fontSizes.axisTicks;
    const labelGutterWidth = (() => {
        if (isMobile) return 0;
        const measureContext = ctx.getContext('2d');
        measureContext.save();
        measureContext.font = `600 ${labelFontSize}px 'JetBrains Mono', monospace`;
        const maxLabelWidth = timeSpentData
            .filter(d => !d.isBaseline && timeChartAgentKeys.includes(d.agentKey))
            .reduce((maxWidth, d) =>
                Math.max(maxWidth, measureContext.measureText(getChartAgentMeta(d).name).width), 0);
        measureContext.restore();
        return Math.ceil(maxLabelWidth + 18);
    })();

    const reduceMotion = reducedMotionQuery.matches || isThemeTransitioning || motion === 'none';
    const buildAnimation = reduceMotion
        ? { duration: 0 }
        : motion === 'initial'
            ? {
                duration: 450,
                easing: 'easeOutCubic',
                // Cascade the horizontal bars in from the top on first load only.
                delay: (c) => (c.type === 'data' && c.mode === 'default') ? c.dataIndex * 22 : 0,
            }
            : { duration: 190, easing: 'easeOutCubic' };

    const timeErrorBarPlugin = {
        id: 'timeErrorBars',
        afterDatasetsDraw(chart) {
            const { ctx, scales, chartArea } = chart;
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);

            ctx.save();

            dataset.data.forEach((value, index) => {
                const dataItem = sortedData[index];
                const bar = meta.data[index];
                const yPos = bar.y;
                const barHeight = bar.height;

                // The bar grows horizontally (bar.x animates from its base to the
                // final value). Keep the error caps attached to that animated end,
                // while the aligned runtime column fades in at the same pace.
                const finalX = scales.x.getPixelForValue(value);
                const grow = finalX !== bar.base
                    ? Math.min(1, Math.max(0, (bar.x - bar.base) / (finalX - bar.base)))
                    : 1;
                ctx.globalAlpha = grow;

                if (dataItem.stdHours) {
                    ctx.strokeStyle = textSecondary;
                    ctx.lineWidth = isMobile ? 1 : 1.5;
                    ctx.globalAlpha = grow * 0.62;

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
                    ctx.globalAlpha = grow;
                }

                ctx.fillStyle = textSecondary;
                ctx.font = `500 ${isMobile ? 10 : fontSizes.axisTicks}px 'JetBrains Mono', monospace`;
                if (isMobile) {
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(
                        formatRuntimeDuration(dataItem.time),
                        chart.width - 6,
                        yPos - Math.max(7, barHeight * 0.75)
                    );
                } else {
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(formatRuntimeDuration(dataItem.time), chart.width - 12, yPos);
                }
            });

            ctx.restore();
        }
    };

    const labels = sortedData.map(d => getChartAgentMeta(d).name);

    // Agent names carry the comparison; scaffold metadata remains available in
    // the table and tooltip instead of taking a second axis-label line.
    const customLabelsPlugin = {
        id: 'customLabels',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart;
            const meta = chart.getDatasetMeta(0);

            ctx.save();
            ctx.textAlign = isMobile ? 'left' : 'right';
            const xPos = isMobile ? chartArea.left : chartArea.left - 10;

            sortedData.forEach((dataItem, index) => {
                const bar = meta.data[index];
                const yPos = bar.y;
                const labelMeta = getChartAgentMeta(dataItem);
                const nameFont = `600 ${labelFontSize}px 'JetBrains Mono', monospace`;
                const effortFontSize = Math.max(8, labelFontSize - 2);
                const effortFont = `600 ${effortFontSize}px 'JetBrains Mono', monospace`;

                if (isMobile) {
                    ctx.fillStyle = textSecondary;
                    ctx.font = nameFont;
                    ctx.textBaseline = 'bottom';
                    const labelY = yPos - Math.max(7, bar.height * 0.75);
                    ctx.fillText(labelMeta.name, xPos, labelY);
                    if (labelMeta.effort) {
                        const nameWidth = ctx.measureText(labelMeta.name).width;
                        ctx.fillStyle = accentPrimary;
                        ctx.font = effortFont;
                        ctx.fillText(`· ${labelMeta.effort}`, xPos + nameWidth + 6, labelY);
                    }
                } else {
                    ctx.fillStyle = textSecondary;
                    ctx.font = nameFont;
                    ctx.textBaseline = labelMeta.effort ? 'bottom' : 'middle';
                    ctx.fillText(labelMeta.name, xPos, labelMeta.effort ? yPos - 1 : yPos);
                    if (labelMeta.effortLabel) {
                        ctx.fillStyle = accentPrimary;
                        ctx.font = effortFont;
                        ctx.textBaseline = 'top';
                        ctx.fillText(labelMeta.effortLabel, xPos, yPos + 1);
                    }
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

    // On phones, a subtle ten-hour track makes each row read as one compact
    // budget meter instead of a label floating above an unrelated bar.
    const budgetTrackPlugin = {
        id: 'budgetTracks',
        beforeDatasetsDraw(chart) {
            if (!isMobile) return;
            const { ctx: c, scales, chartArea } = chart;
            const meta = chart.getDatasetMeta(0);
            const trackLeft = scales.x.getPixelForValue(0);
            const trackRight = Math.min(chartArea.right, scales.x.getPixelForValue(10));

            c.save();
            c.fillStyle = bgTertiary;
            c.globalAlpha = 0.62;
            meta.data.forEach((bar) => {
                const height = Math.max(5, bar.height);
                c.fillRect(trackLeft, bar.y - height / 2, trackRight - trackLeft, height);
            });
            c.restore();
        }
    };

    // Vertical dashed line at x=10 to mark the budget. The chart's
    // x-axis extends beyond 10 so error bars and the aligned runtime
    // column have room past the budget line. Label sits ABOVE chartArea.top in the
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
            c.font = "600 10px 'JetBrains Mono', monospace";
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
                label: 'Average runtime',
                data: sortedData.map(d => d.hours),
                backgroundColor: timeBarColors,
                borderColor: chartBar,
                borderWidth: isMobile ? 0 : 2,
                borderRadius: isMobile ? 2 : 4,
                barPercentage: isMobile ? 0.28 : 0.64,
                categoryPercentage: isMobile ? 0.86 : 0.9,
                datalabels: { display: false }
            }]
        },
        plugins: [budgetTrackPlugin, timeErrorBarPlugin, customLabelsPlugin, budgetLinePlugin],
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
            // Padding gives the budget label room above the plotting area and
            // reserves a fixed gutter for the aligned runtime values.
            layout: {
                padding: {
                    top: isMobile ? 16 : 18,
                    right: isMobile ? mobileRuntimeGutter : 74,
                    left: isMobile ? 2 : 0
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
                            return getChartAgentMeta(d).name;
                        },
                        label: function(context) {
                            const dataItem = sortedData[context.dataIndex];
                            const lines = [`Average runtime: ${formatRuntimeDuration(dataItem.time)}`];
                            if (dataItem.stdHours) lines.push(`Variation: ±${formatRuntimeDuration(dataItem.stdTime)}`);
                            if (dataItem.n) lines.push(`Runs: ${dataItem.n}`);
                            return lines;
                        },
                        afterLabel: function(context) {
                            const dataItem = sortedData[context.dataIndex];
                            const labelMeta = getChartAgentMeta(dataItem);
                            const scaffold = agentInfo[dataItem.agentKey]?.scaffold;
                            return [
                                labelMeta.effort ? `Effort: ${labelMeta.effort}` : null,
                                scaffold ? `Scaffold: ${scaffold}` : null,
                                getAgentStatusNote(dataItem.agentKey) || null
                            ].filter(Boolean);
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
                    max: 10.2,
                    title: {
                        display: !isMobile,
                        text: 'Average runtime',
                        color: textPrimary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: fontSizes.axisTitle,
                            weight: 500
                        }
                    },
                    grid: {
                        display: !isMobile,
                        color: context => Number(context.tick.value) === 5 ? borderColor : 'transparent'
                    },
                    border: {
                        display: !isMobile
                    },
                    ticks: {
                        color: textSecondary,
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 10 : fontSizes.axisTicks
                        },
                        stepSize: 5,
                        includeBounds: false,
                        callback: function(value) {
                            if (![0, 5, 10].includes(Number(value))) return null;
                            return `${value}h`;
                        }
                    }
                },
                y: {
                    afterFit: scale => {
                        if (!isMobile) scale.width = labelGutterWidth;
                    },
                    title: {
                        display: false
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: !isMobile,
                        color: 'transparent',
                        font: {
                            family: "'JetBrains Mono', monospace",
                            size: isMobile ? 11 : fontSizes.axisTicks
                        }
                    }
                }
            }
        }
    });

    // All keeps Main's exact row rhythm. Without this, Chart.js divides the
    // larger canvas differently, making bars thicker and shifting every label.
    if (!isMobile && !showAllTimeAgents && timeSpentChart.chartArea) {
        budgetMainRowPitch = timeSpentChart.chartArea.height / sortedData.length;
        budgetChartChromeHeight = mainDesktopHeight - timeSpentChart.chartArea.height;
    }
}

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
            createSimpleChart(currentSelectedModel, { motion: 'none' });
        }
        if (paretoChart) {
            paretoChart.destroy();
            createParetoChart({ motion: 'none' });
        }
        if (timeSpentChart) {
            timeSpentChart.destroy();
            createTimeSpentChart({ motion: 'none' });
        }
        handleNavbarLogoVisibility();
    }, 250);
});

// Copy citation to clipboard
document.getElementById('copy-citation').addEventListener('click', function() {
    const citationText = document.querySelector('.citation-text').textContent;
    const label = document.getElementById('copy-citation-label');
    const btn = this;
    navigator.clipboard.writeText(citationText).then(() => {
        label.textContent = 'Copied';
        btn.classList.add('is-copied');
        setTimeout(() => {
            label.textContent = 'Copy';
            btn.classList.remove('is-copied');
        }, 2000);
    }).catch(() => {
        label.textContent = 'Copy failed';
        setTimeout(() => {
            label.textContent = 'Copy';
        }, 2000);
    });
});

// Custom model picker. It retains the original visual character while matching
// native-select basics: labelled state, arrow-key navigation, typeahead,
// Escape/Tab dismissal, and a single announced selected option.
const modelDropdown = document.getElementById('model-dropdown');
const dropdownDisplay = document.getElementById('model-select-display');
const dropdownValue = document.getElementById('model-select-value');
const dropdownOptions = document.getElementById('model-select-options');
const dropdownOptionButtons = [...(dropdownOptions?.querySelectorAll('.dropdown-option') || [])];

function setModelDropdownOpen(isOpen, optionToFocus = null, { instant = false } = {}) {
    if (!modelDropdown || !dropdownDisplay) return;
    if (instant) {
        modelDropdown.classList.add('no-motion');
        requestAnimationFrame(() => requestAnimationFrame(() => modelDropdown.classList.remove('no-motion')));
    }
    modelDropdown.classList.toggle('open', isOpen);
    dropdownDisplay.setAttribute('aria-expanded', String(isOpen));
    if (isOpen && optionToFocus) {
        requestAnimationFrame(() => optionToFocus.focus());
    }
}

function selectModelOption(option, returnFocus = true, { motion = 'interaction', instant = false } = {}) {
    if (!option || !dropdownValue) return;
    const selectedValue = option.dataset.value;

    dropdownValue.textContent = option.textContent.trim();
    dropdownOptionButtons.forEach((candidate) => {
        const isSelected = candidate === option;
        candidate.classList.toggle('active', isSelected);
        candidate.setAttribute('aria-selected', String(isSelected));
    });
    setModelDropdownOpen(false, null, { instant });

    if (selectedValue !== currentSelectedModel) {
        currentSelectedModel = selectedValue;
        trackGoatCounterEvent(
            `leaderboard-model/${encodeURIComponent(selectedValue)}`,
            `Leaderboard model: ${option.textContent.trim()}`
        );
        populateLeaderboard(selectedValue);
        if (performanceChart) {
            performanceChart.destroy();
            createSimpleChart(selectedValue, { motion });
        }
    }

    if (returnFocus) dropdownDisplay?.focus();
}

function moveDropdownFocus(currentOption, direction) {
    const currentIndex = dropdownOptionButtons.indexOf(currentOption);
    const nextIndex = (currentIndex + direction + dropdownOptionButtons.length) % dropdownOptionButtons.length;
    dropdownOptionButtons[nextIndex]?.focus();
}

if (modelDropdown && dropdownDisplay && dropdownOptions) {
    dropdownDisplay.addEventListener('click', (event) => {
        setModelDropdownOpen(!modelDropdown.classList.contains('open'), null, { instant: event.detail === 0 });
    });

    dropdownDisplay.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const activeOption = dropdownOptionButtons.find((option) => option.getAttribute('aria-selected') === 'true');
            const optionToFocus = event.key === 'ArrowUp'
                ? dropdownOptionButtons[dropdownOptionButtons.length - 1]
                : activeOption || dropdownOptionButtons[0];
            setModelDropdownOpen(true, optionToFocus, { instant: true });
        } else if (event.key === 'Escape') {
            setModelDropdownOpen(false, null, { instant: true });
        }
    });

    dropdownOptionButtons.forEach((option) => {
        option.addEventListener('click', () => selectModelOption(option));
        option.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                moveDropdownFocus(option, event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const edgeOption = event.key === 'Home'
                    ? dropdownOptionButtons[0]
                    : dropdownOptionButtons[dropdownOptionButtons.length - 1];
                edgeOption?.focus();
            } else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectModelOption(option, true, { motion: 'none', instant: true });
            } else if (event.key === 'Escape') {
                event.preventDefault();
                setModelDropdownOpen(false, null, { instant: true });
                dropdownDisplay.focus();
            } else if (event.key === 'Tab') {
                setModelDropdownOpen(false, null, { instant: true });
            } else if (event.key.length === 1 && /\S/.test(event.key)) {
                const searchFrom = dropdownOptionButtons.indexOf(option) + 1;
                const orderedOptions = dropdownOptionButtons
                    .slice(searchFrom)
                    .concat(dropdownOptionButtons.slice(0, searchFrom));
                const match = orderedOptions.find((candidate) =>
                    candidate.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()));
                match?.focus();
            }
        });
    });

    modelDropdown.addEventListener('focusout', (event) => {
        if (!modelDropdown.contains(event.relatedTarget)) setModelDropdownOpen(false, null, { instant: true });
    });

    document.addEventListener('click', (event) => {
        if (!modelDropdown.contains(event.target)) setModelDropdownOpen(false);
    });
}

// Mobile leaderboard rows reveal their benchmark detail in place. The wide
// matrix remains the desktop view; phones get one compact, anchored disclosure
// per agent instead of a second table hidden off-screen.
const leaderboardTable = document.querySelector('.leaderboard-table');
const leaderboardBody = document.getElementById('leaderboard-data');
const leaderboardDisclosureButton = document.getElementById('leaderboard-disclosure-button');

if (leaderboardDisclosureButton) {
    leaderboardDisclosureButton.addEventListener('click', (event) => {
        const isCollapsing = showAllLeaderboardAgents;
        const previousButtonTop = isCollapsing
            ? leaderboardDisclosureButton.getBoundingClientRect().top
            : null;

        showAllLeaderboardAgents = !showAllLeaderboardAgents;
        populateLeaderboard(currentSelectedModel, {
            animateReveal: !isCollapsing && event.detail !== 0
        });

        trackGoatCounterEvent(
            showAllLeaderboardAgents
                ? 'leaderboard/show-all'
                : `leaderboard/show-top-${LEADERBOARD_PREVIEW_LIMIT}`,
            showAllLeaderboardAgents
                ? 'Leaderboard: show all agents'
                : `Leaderboard: show top ${LEADERBOARD_PREVIEW_LIMIT}`
        );

        // When collapsing a long table, keep the control anchored under the
        // pointer instead of dropping the reader much farther down the page.
        if (isCollapsing && previousButtonTop !== null) {
            requestAnimationFrame(() => {
                const nextButtonTop = leaderboardDisclosureButton.getBoundingClientRect().top;
                window.scrollBy({
                    top: nextButtonTop - previousButtonTop,
                    left: 0,
                    behavior: 'auto'
                });
            });
        }
    });
}

function setLeaderboardRowExpanded(row, shouldExpand) {
    const detailRow = row.nextElementSibling;
    const panel = detailRow?.querySelector('.benchmark-detail-panel');
    if (!detailRow?.classList.contains('benchmark-detail-row') || !panel) return;

    const wasHidden = detailRow.hidden;
    const presentation = wasHidden ? null : getComputedStyle(panel);
    const currentOpacity = wasHidden
        ? 0
        : Number.parseFloat(presentation.opacity || '1');
    const currentTransform = wasHidden || presentation.transform === 'none'
        ? (shouldExpand ? 'translateY(-4px)' : 'none')
        : presentation.transform;
    detailRow._detailAnimation?.cancel();
    detailRow._detailAnimation = null;

    row.classList.toggle('details-open', shouldExpand);
    if (shouldExpand) detailRow.hidden = false;

    if (reducedMotionQuery.matches || typeof panel.animate !== 'function') {
        if (!shouldExpand) detailRow.hidden = true;
        panel.style.opacity = '';
        panel.style.transform = '';
    } else {
        const animation = panel.animate([
            {
                opacity: currentOpacity,
                transform: currentTransform
            },
            {
                opacity: shouldExpand ? 1 : 0,
                transform: shouldExpand ? 'none' : 'translateY(-3px)'
            }
        ], {
            duration: shouldExpand ? 180 : 140,
            easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
            fill: 'both'
        });
        detailRow._detailAnimation = animation;
        animation.onfinish = () => {
            if (detailRow._detailAnimation !== animation) return;
            detailRow._detailAnimation = null;
            if (!shouldExpand) detailRow.hidden = true;
            panel.style.opacity = '';
            panel.style.transform = '';
            animation.cancel();
        };
    }

    leaderboardTable?.classList.toggle(
        'has-expanded-row',
        Boolean(leaderboardBody?.querySelector('.leaderboard-entry-row.details-open'))
    );
}

if (leaderboardBody) {
    leaderboardBody.addEventListener('click', (event) => {
        if (!window.matchMedia('(max-width: 768px)').matches) return;
        const row = event.target.closest('.leaderboard-entry-row');
        if (!row || !leaderboardBody.contains(row)) return;
        setLeaderboardRowExpanded(row, !row.classList.contains('details-open'));
    });
}

// Navbar logo visibility based on hero section.
// While the hero is on screen, the giant "PostTrainBench" title IS the
// brand mark — repeating it in the desktop navbar would be visual duplication.
// Phones keep the compact logo visible for wayfinding; desktop fades it in
// after the hero scrolls off, so it picks up where the hero left off.
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
    updateResultsVersionUI({ instant: true });

    // Wait specifically for the chart face instead of every page font. This
    // avoids a blank chart card on slow connections while still preventing its
    // labels from reflowing halfway through the entrance build.
    if (document.fonts && document.fonts.load) {
        try {
            await Promise.race([
                document.fonts.load("500 16px 'JetBrains Mono'"),
                new Promise((resolve) => setTimeout(resolve, 600)),
            ]);
        } catch (e) { /* render anyway */ }
    }

    // The leaderboard chart is explanatory motion, so reveal it once when the
    // chart is actually in view. Rebuilds caused by resizing, theme changes, or
    // keyboard filtering remain instant elsewhere in this file.
    const performanceChartPanel = document.getElementById('performanceChart')?.closest('.leaderboard-chart');
    const renderInitialPerformanceChart = () => {
        if (!performanceChart) createSimpleChart(currentSelectedModel);
    };

    if (performanceChartPanel && 'IntersectionObserver' in window && !reducedMotionQuery.matches) {
        const chartObserver = new IntersectionObserver((entries) => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            chartObserver.disconnect();
            renderInitialPerformanceChart();
        }, { threshold: 0.12 });
        chartObserver.observe(performanceChartPanel);
    } else {
        renderInitialPerformanceChart();
    }
    createParetoChart();
    createTimeSpentChart();
    handleNavbarLogoVisibility(); // Set initial state based on scroll position

    document.querySelectorAll('[data-results-version]').forEach((versionButton) => {
        versionButton.addEventListener('click', (event) => {
            const shouldAnimate = event.detail !== 0 && !reducedMotionQuery.matches;
            renderResultsVersion(versionButton.dataset.resultsVersion, {
                animate: shouldAnimate
            });
        });
    });

    window.addEventListener('popstate', () => {
        renderResultsVersion(getInitialResultsVersion(), {
            updateURL: false,
            animate: !reducedMotionQuery.matches,
            track: false
        });
    });

    // Switch the budget chart's scope without changing the surrounding layout.
    document.querySelectorAll('[data-time-scope]').forEach((scopeButton) => {
        scopeButton.addEventListener('click', (event) => {
            const nextShowAll = scopeButton.dataset.timeScope === 'all';
            if (nextShowAll === showAllTimeAgents) return;
            const scopeToggle = scopeButton.closest('.time-scope-toggle');
            const shouldAnimate = event.detail !== 0 && !reducedMotionQuery.matches;
            if (!shouldAnimate) scopeToggle?.classList.add('is-instant');
            showAllTimeAgents = nextShowAll;
            trackGoatCounterEvent(
                `budget-scope/${showAllTimeAgents ? 'all' : 'main'}`,
                `Budget scope: ${showAllTimeAgents ? 'All agents' : 'Main agents'}`
            );
            updateTimeScopeControl();
            if (!shouldAnimate && scopeToggle) {
                scopeToggle.getBoundingClientRect();
                scopeToggle.classList.remove('is-instant');
            }
            document.querySelector('.budget-chart')?.scrollTo({ top: 0 });
            if (timeSpentChart) {
                timeSpentChart.destroy();
            }
            createTimeSpentChart({ motion: 'none' });
            if (shouldAnimate) animateBudgetScopeContent(showAllTimeAgents);
        });
    });

    // Foldables: wrap the body so a small opacity/translation cue can bridge
    // the otherwise abrupt <details> change without animating layout. Rapid
    // clicks reverse from the live presentation state, exits stay faster than
    // entrances, and reduced motion toggles instantly.
    document.querySelectorAll('details.hack-category, details.evidence-fold, details.compact-disclosure').forEach((fold) => {
        const summary = fold.querySelector(':scope > summary');
        if (!summary) return;
        const body = document.createElement('div');
        body.className = 'fold-anim';
        [...fold.children].filter((el) => el !== summary).forEach((el) => body.appendChild(el));
        fold.appendChild(body);

        const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
        let expanded = fold.open;
        let activeAnimation = null;
        let fallbackTimer = null;
        let animationVersion = 0;
        fold.dataset.expanded = String(expanded);

        const clearInlineState = () => {
            body.style.opacity = '';
            body.style.transform = '';
            delete fold.dataset.animating;
        };

        const cancelActiveAnimation = () => {
            if (fallbackTimer !== null) {
                clearTimeout(fallbackTimer);
                fallbackTimer = null;
            }
            if (activeAnimation) {
                try { activeAnimation.cancel(); } catch (err) { /* already finished */ }
                activeAnimation = null;
            }
        };

        const setInstantly = () => {
            animationVersion += 1;
            cancelActiveAnimation();
            fold.open = expanded;
            clearInlineState();
        };

        const animateTo = (shouldExpand) => {
            const version = ++animationVersion;

            const wasRendered = fold.open;
            const presentation = wasRendered ? getComputedStyle(body) : null;
            const computedOpacity = wasRendered ? Number.parseFloat(presentation.opacity) : 0;
            const startOpacity = Number.isFinite(computedOpacity) ? computedOpacity : (wasRendered ? 1 : 0);
            const startTransform = !wasRendered || presentation.transform === 'none'
                ? (shouldExpand ? 'translateY(-4px)' : 'none')
                : presentation.transform;

            cancelActiveAnimation();
            if (shouldExpand && !fold.open) fold.open = true;
            fold.dataset.animating = '1';

            const duration = shouldExpand ? 180 : 140;

            const animation = body.animate(
                [
                    { opacity: startOpacity, transform: startTransform },
                    {
                        opacity: shouldExpand ? 1 : 0,
                        transform: shouldExpand ? 'none' : 'translateY(-3px)'
                    },
                ],
                { duration, easing: EASE, fill: 'both' }
            );
            activeAnimation = animation;

            const finish = () => {
                if (version !== animationVersion) return;
                if (fallbackTimer !== null) {
                    clearTimeout(fallbackTimer);
                    fallbackTimer = null;
                }
                fold.open = shouldExpand;
                try { animation.cancel(); } catch (err) { /* already finished */ }
                activeAnimation = null;
                clearInlineState();
            };

            animation.onfinish = finish;
            fallbackTimer = setTimeout(finish, duration + 100);
        };

        summary.addEventListener('click', (e) => {
            e.preventDefault();
            expanded = !expanded;
            fold.dataset.expanded = String(expanded);

            if (e.detail === 0 || reducedMotionQuery.matches || typeof body.animate !== 'function') {
                setInstantly();
                return;
            }
            animateTo(expanded);
        });
    });

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
    updateResultsVersionUI({ instant: true });
    document.documentElement.classList.remove('leaderboard-loading');
    window.__ptbDataReady = true;
}
