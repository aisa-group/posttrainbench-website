
// Global chart instances
let performanceChart = null;
let detailedChart = null;

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
    const selectedModel = document.getElementById('model-select').value;
    if (performanceChart) {
        performanceChart.destroy();
        createSimpleChart(selectedModel);
    }
    if (detailedChart) {
        detailedChart.destroy();
        createDetailedChart(selectedModel);
    }
});

// Get leaderboard data for specific model or average
function getLeaderboardDataForModel(modelName) {
    const agentKeyMap = {
        "Human Post-Trained": "human",
        "Base Model": "base-model",
        "Codex 5.1": "codex-5.1",
        "Sonnet 4.5": "sonnet-4.5"
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

// Populate Leaderboard
function populateLeaderboard(modelName = "average") {
    const tbody = document.getElementById('leaderboard-data');
    tbody.innerHTML = ''; // Clear existing data

    const data = getLeaderboardDataForModel(modelName);

    data.forEach(entry => {
        const row = document.createElement('tr');

        const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : 'rank-other';

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${entry.rank}</span></td>
            <td><strong>${entry.agent}</strong></td>
            <td><strong>${entry.averageScore}%</strong></td>
            <td>${entry.benchmarkScores.aime2025}%</td>
            <td>${entry.benchmarkScores.bfcl}%</td>
            <td>${entry.benchmarkScores.gpqamain}%</td>
            <td>${entry.benchmarkScores.gsm8k}%</td>
            <td>${entry.benchmarkScores.humaneval}%</td>
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

        card.innerHTML = `
            <div class="task-header">
                <h3 class="task-title">${task.title}</h3>
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
    if (isMobile) {
        wrapper.style.minWidth = '600px';
        wrapper.style.height = '300px';
    } else {
        wrapper.style.minWidth = '';
        wrapper.style.height = '';
    }

    // Get data for selected model
    const data = getLeaderboardDataForModel(modelName);

    // Reverse order for chart (ascending - lowest to highest)
    const reversedData = [...data].reverse();

    // Calculate max value dynamically - round up to nearest 10
    const maxScore = Math.max(...data.map(d => parseFloat(d.averageScore)));
    const yAxisMax = Math.ceil(maxScore / 10) * 10;

    performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: reversedData.map(d => d.agent),
            datasets: [{
                label: 'Average Score (%)',
                data: reversedData.map(d => parseFloat(d.averageScore)),
                backgroundColor: accentPrimary,
                borderColor: accentPrimary,
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
                        size: 14
                    },
                    bodyFont: {
                        family: 'monospace',
                        size: 13
                    },
                    borderColor: accentPrimary,
                    borderWidth: 1,
                    callbacks: {
                        label: function(context) {
                            return `Average Score: ${context.parsed.y.toFixed(2)}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: yAxisMax,
                    title: {
                        display: true,
                        text: 'Performance',
                        color: textPrimary,
                        font: {
                            family: 'monospace',
                            size: 12,
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
                            size: 11
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
                        text: 'Models',
                        color: textPrimary,
                        font: {
                            family: 'monospace',
                            size: 12,
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
                            size: 11
                        }
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
        'Codex 5.1': '#c88968',           // Softer terracotta
        'Sonnet 4.5': '#a87d60'           // Muted rust
    } : {
        'Human Post-Trained': '#c49558',  // Deep gold
        'Base Model': '#8a7965',          // Rich taupe
        'Codex 5.1': '#a66b4f',           // Burnt terracotta
        'Sonnet 4.5': '#6e5743'           // Dark coffee
    };

    // Grouped bar chart - benchmarks on X-axis, agents as different bars
        // Grouped bar chart - benchmarks on X-axis, agents as different bars
        const benchmarks = ['AIME 2025', 'BFCL', 'GPQA Main', 'GSM8K', 'HumanEval'];
        const benchmarkKeys = ['aime2025', 'bfcl', 'gpqamain', 'gsm8k', 'humaneval'];
        const data = getLeaderboardDataForModel(modelName);

        const datasets = data.map(entry => ({
            label: entry.agent,
            data: benchmarkKeys.map(key => parseFloat(entry.benchmarkScores[key])),
            backgroundColor: agentColors[entry.agent] || accentPrimary,
            borderColor: agentColors[entry.agent] || accentPrimary,
            borderWidth: 1,
            borderRadius: 4
        }));

        const maxScore = Math.max(...data.flatMap(entry =>
            benchmarkKeys.map(key => parseFloat(entry.benchmarkScores[key]))
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
                maintainAspectRatio: !isMobile,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: textPrimary,
                            font: {
                                family: 'monospace',
                                size: 11
                            },
                            padding: 10
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: {
                            family: 'monospace',
                            size: 14
                        },
                        bodyFont: {
                            family: 'monospace',
                            size: 13
                        },
                        borderColor: accentPrimary,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y.toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: yAxisMax,
                        title: {
                            display: true,
                            text: 'Score (%)',
                            color: textPrimary,
                            font: {
                                family: 'monospace',
                                size: 12,
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
                                size: 11
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
                                size: 12,
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
                                size: 11
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
        const selectedModel = document.getElementById('model-select').value;
        if (performanceChart) {
            performanceChart.destroy();
            createSimpleChart(selectedModel);
        }
        if (detailedChart) {
            detailedChart.destroy();
            createDetailedChart(selectedModel);
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

// Model selector change handler
document.getElementById('model-select').addEventListener('change', (e) => {
    const selectedModel = e.target.value;
    populateLeaderboard(selectedModel);

    // Update charts based on selected model
    if (performanceChart) {
        performanceChart.destroy();
        createSimpleChart(selectedModel);
    }
    if (detailedChart) {
        detailedChart.destroy();
        createDetailedChart(selectedModel);
    }
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    populateLeaderboard();
    populateTasks();
    populateStatistics();
    createSimpleChart();
    createDetailedChart();
});
