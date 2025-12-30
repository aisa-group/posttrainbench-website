
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
        createDetailedChart(currentSelectedModel);
    }
    if (timeSpentChart) {
        timeSpentChart.destroy();
        createTimeSpentChart();
    }
});

// Get leaderboard data for specific model or average
function getLeaderboardDataForModel(modelName) {
    const agentKeyMap = {
        "Human Post-Trained": "human",
        "Base Model": "base-model",
        "GPT 5.1 Codex Max": "codex-5.1",
        "Sonnet 4.5": "sonnet-4.5",
        "Opus 4.5": "opus-4.5",
        "GPT-5.2": "gpt-5.2",
        "Gemini 3 Pro": "gemini-3-pro"
    };

    if (modelName === "average") {
        return leaderboardData;
    }

    // Create data for specific model
    const modelData = leaderboardDataRaw.map(entry => {
        const agentKey = agentKeyMap[entry.agent];
        const modelScores = modelBenchmarkData[agentKey][modelName];
        return {
            agent: entry.agent,
            averageScore: calculateAverageForModel(agentKey, modelName),
            benchmarkScores: modelScores,
            description: entry.description
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

// Populate Leaderboard
function populateLeaderboard(modelName = "average") {
    const tbody = document.getElementById('leaderboard-data');
    tbody.innerHTML = ''; // Clear existing data

    const data = getLeaderboardDataForModel(modelName);

    // Collect all values for each column to find min/max
    const columns = {
        average: data.map(e => parseFloat(e.averageScore)),
        aime2025: data.map(e => parseFloat(e.benchmarkScores.aime2025)),
        bfcl: data.map(e => parseFloat(e.benchmarkScores.bfcl)),
        gpqamain: data.map(e => parseFloat(e.benchmarkScores.gpqamain)),
        gsm8k: data.map(e => parseFloat(e.benchmarkScores.gsm8k)),
        humaneval: data.map(e => parseFloat(e.benchmarkScores.humaneval))
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

        const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : 'rank-other';

        // Create cells with heatmap colors normalized per column
        const avgValue = parseFloat(entry.averageScore);
        const aimeValue = parseFloat(entry.benchmarkScores.aime2025);
        const bfclValue = parseFloat(entry.benchmarkScores.bfcl);
        const gpqaValue = parseFloat(entry.benchmarkScores.gpqamain);
        const gsmValue = parseFloat(entry.benchmarkScores.gsm8k);
        const humanValue = parseFloat(entry.benchmarkScores.humaneval);

        const avgColor = getHeatmapColor(normalize(avgValue, 'average'));
        const aimeColor = getHeatmapColor(normalize(aimeValue, 'aime2025'));
        const bfclColor = getHeatmapColor(normalize(bfclValue, 'bfcl'));
        const gpqaColor = getHeatmapColor(normalize(gpqaValue, 'gpqamain'));
        const gsmColor = getHeatmapColor(normalize(gsmValue, 'gsm8k'));
        const humanColor = getHeatmapColor(normalize(humanValue, 'humaneval'));

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${entry.rank}</span></td>
            <td><strong>${entry.agent}</strong></td>
            <td style="background-color: ${avgColor}"><strong>${entry.averageScore}%</strong></td>
            <td style="background-color: ${aimeColor}">${entry.benchmarkScores.aime2025}%</td>
            <td style="background-color: ${bfclColor}">${entry.benchmarkScores.bfcl}%</td>
            <td style="background-color: ${gpqaColor}">${entry.benchmarkScores.gpqamain}%</td>
            <td style="background-color: ${gsmColor}">${entry.benchmarkScores.gsm8k}%</td>
            <td style="background-color: ${humanColor}">${entry.benchmarkScores.humaneval}%</td>
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
        wrapper.style.minWidth = '600px';
        wrapper.style.height = '300px';
        footnotes.forEach(fn => fn.style.width = '600px');
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
        footnotes.forEach(fn => fn.style.width = '');
    }

    // Get data for selected model
    const data = getLeaderboardDataForModel(modelName);

    // Reverse order for chart (ascending - lowest to highest)
    const reversedData = [...data].reverse();

    // Update labels to add (baseline) for Base Model and Human Post-Trained
    const chartLabels = reversedData.map(d => {
        if (d.agent === 'Base Model') {
            return [d.agent, '(baseline)'];
        }
        if (d.agent === 'Human Post-Trained') {
            return [d.agent, '(baseline)²'];
        }
        return d.agent;
    });

    // Set colors - baseline agents get different color
    const chartColors = reversedData.map(d => {
        if (d.agent === 'Base Model' || d.agent === 'Human Post-Trained') {
            return '#6b655a'; // Darker muted color for baselines
        }
        return accentPrimary;
    });

    // Calculate max value dynamically - round up to nearest 10
    const maxScore = Math.max(...data.map(d => parseFloat(d.averageScore)));
    const yAxisMax = Math.ceil(maxScore / 10) * 10;

    // Calculate adaptive font sizes
    const fontSizes = calculateFontSizes(ctx);

    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Average Score (%)',
                data: reversedData.map(d => parseFloat(d.averageScore)),
                backgroundColor: chartColors,
                borderColor: chartColors,
                borderWidth: 2,
                borderRadius: 4
            }]
        },
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
                        family: 'monospace',
                        size: fontSizes.tooltipTitle
                    },
                    bodyFont: {
                        family: 'monospace',
                        size: fontSizes.tooltipBody
                    },
                    borderColor: accentPrimary,
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return `Average Score: ${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 65,
                    title: {
                        display: true,
                        text: 'Average benchmark performance¹',
                        color: textPrimary,
                        font: {
                            family: 'monospace',
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
                            family: 'monospace',
                            size: fontSizes.axisTicks
                        },
                        stepSize: 10,
                        callback: function(value) {
                            if (value === 65) return null;
                            return value + '%';
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'LLM powering the CLI agent',
                        color: textPrimary,
                        font: {
                            family: 'monospace',
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
                            family: 'monospace',
                            size: fontSizes.axisTicks
                        },
                        maxRotation: 0
                    }
                }
            }
        }
    });
}

// Create Detailed Chart (grouped by benchmark)
function createDetailedChart(modelName = "average") {
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
        wrapper.style.minWidth = '600px';
        wrapper.style.height = '300px';
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
    }

    // Agent colors for grouped view - theme-adaptive
    const currentTheme = html.getAttribute('data-theme');
    const agentColors = currentTheme === 'dark' ? {
        'Human Post-Trained': '#deb070',  // Softer golden amber
        'Base Model': '#b89888',          // Muted dusty rose
        'GPT 5.1 Codex Max': '#c88968',   // Softer terracotta
        'Sonnet 4.5': '#a87d60',          // Muted rust
        'Opus 4.5': '#d4a373',            // Light terracotta
        'GPT-5.2': '#b8956e',             // Medium taupe
        'Gemini 3 Pro': '#9d8268'         // Dark taupe
    } : {
        'Human Post-Trained': '#c49558',  // Deep gold
        'Base Model': '#8a7965',          // Rich taupe
        'GPT 5.1 Codex Max': '#a66b4f',   // Burnt terracotta
        'Sonnet 4.5': '#6e5743',          // Dark coffee
        'Opus 4.5': '#c17d5a',            // Terracotta
        'GPT-5.2': '#a0917a',             // Warm taupe
        'Gemini 3 Pro': '#8a7561'         // Medium brown
    };

    // Grouped bar chart - benchmarks on X-axis, agents as different bars
        // Grouped bar chart - benchmarks on X-axis, agents as different bars
        const benchmarks = ['AIME 2025', 'BFCL', 'GPQA Main', 'GSM8K', 'HumanEval'];
        const benchmarkKeys = ['aime2025', 'bfcl', 'gpqamain', 'gsm8k', 'humaneval'];
        const data = getLeaderboardDataForModel(modelName);

        const agentOrder = ['Base Model', 'Gemini 3 Pro', 'GPT-5.2', 'Sonnet 4.5', 'Opus 4.5', 'GPT 5.1 Codex Max', 'Human Post-Trained'];
        const orderedData = agentOrder.map(agentName =>
            data.find(entry => entry.agent === agentName)
        ).filter(Boolean);

        const datasets = orderedData.map(entry => ({
            label: entry.agent,
            data: benchmarkKeys.map(key => parseFloat(entry.benchmarkScores[key])),
            backgroundColor: agentColors[entry.agent] || accentPrimary,
            borderColor: agentColors[entry.agent] || accentPrimary,
            borderWidth: 1,
            borderRadius: 4
        }));

        const maxScore = Math.max(...orderedData.flatMap(entry =>
            benchmarkKeys.map(key => parseFloat(entry.benchmarkScores[key]))
        ));
        const yAxisMax = Math.ceil(maxScore / 10) * 10;

        // Calculate adaptive font sizes
        const fontSizes = calculateFontSizes(ctx);

        detailedChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: benchmarks,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: !isMobile,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: textPrimary,
                            font: {
                                family: 'monospace',
                                size: fontSizes.legend
                            },
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            family: 'monospace',
                            size: fontSizes.tooltipTitle
                        },
                        bodyFont: {
                            family: 'monospace',
                            size: fontSizes.tooltipBody
                        },
                        borderColor: accentPrimary,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    },
                    datalabels: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: yAxisMax,
                        title: {
                            display: true,
                            text: 'Benchmark Score (%)',
                            color: textPrimary,
                            font: {
                                family: 'monospace',
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
                                family: 'monospace',
                                size: fontSizes.axisTicks
                            },
                            stepSize: 10,
                            callback: function(value) {
                                return value + '%';
                            }
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Benchmarks',
                            color: textPrimary,
                            font: {
                                family: 'monospace',
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
                                family: 'monospace',
                                size: fontSizes.axisTicks
                            }
                        }
                    }
                }
            }
        });
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

    // Set wrapper dimensions based on screen size
    const wrapper = ctx.closest('.leaderboard-chart-wrapper');
    if (isMobile) {
        wrapper.style.minWidth = '600px';
        wrapper.style.height = '300px';
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
    }

    // Sort by hours (descending) - longest time first
    const sortedData = [...timeSpentData].sort((a, b) => b.hours - a.hours);

    // Calculate adaptive font sizes
    const fontSizes = calculateFontSizes(ctx);

    timeSpentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedData.map(d => d.agent),
            datasets: [{
                label: 'Time Spent (hours)',
                data: sortedData.map(d => d.hours),
                backgroundColor: accentPrimary,
                borderColor: accentPrimary,
                borderWidth: 2,
                borderRadius: 4,
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'end',
                    color: textPrimary,
                    font: {
                        family: 'monospace',
                        size: fontSizes.legend,
                        weight: 600
                    },
                    formatter: function(_value, context) {
                        return sortedData[context.dataIndex].time;
                    },
                    padding: 4
                }
            }]
        },
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
                    padding: 12,
                    titleFont: {
                        family: 'monospace',
                        size: fontSizes.tooltipTitle
                    },
                    bodyFont: {
                        family: 'monospace',
                        size: fontSizes.tooltipBody
                    },
                    borderColor: accentPrimary,
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            const dataItem = sortedData[context.dataIndex];
                            return `Time: ${dataItem.time} (${context.parsed.x.toFixed(2)} hours)`;
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
                        display: true,
                        text: 'Time (hours)',
                        color: textPrimary,
                        font: {
                            family: 'monospace',
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
                            family: 'monospace',
                            size: fontSizes.axisTicks
                        },
                        stepSize: 2
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'LLM powering the CLI agent',
                        color: textPrimary,
                        font: {
                            family: 'monospace',
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
                            family: 'monospace',
                            size: fontSizes.axisTicks
                        }
                    }
                }
            }
        }
    });
}

// Smooth Scroll
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

// Paper button - Prevent default action, tooltip only on hover
document.getElementById('paper-btn').addEventListener('click', (e) => {
    e.preventDefault();
    // Remove focus to hide tooltip after click
    e.target.blur();
});

// Handle window resize for chart responsiveness
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (performanceChart) {
            performanceChart.destroy();
            createSimpleChart(currentSelectedModel);
        }
        if (detailedChart) {
            detailedChart.destroy();
            createDetailedChart(currentSelectedModel);
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
                createDetailedChart(selectedValue);
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
document.addEventListener('DOMContentLoaded', () => {
    populateLeaderboard();
    populateTasks();
    populateStatistics();
    createSimpleChart();
    createDetailedChart();
    createTimeSpentChart();
    handleNavbarLogoVisibility(); // Check initial state
});
