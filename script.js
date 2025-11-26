
// Global chart instance
let performanceChart = null;

// Theme Toggle
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

// Load saved theme or default to dark
const savedTheme = localStorage.getItem('theme') || 'dark';
html.setAttribute('data-theme', savedTheme);

themeToggle.addEventListener('click', () => {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Recreate chart with new theme colors
    if (performanceChart) {
        performanceChart.destroy();
        createChart();
    }
});

// Populate Leaderboard
function populateLeaderboard() {
    const tbody = document.getElementById('leaderboard-data');

    leaderboardData.forEach(entry => {
        const row = document.createElement('tr');

        const rankClass = entry.rank <= 3 ? `rank-${entry.rank}` : 'rank-other';

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${entry.rank}</span></td>
            <td><strong>${entry.agent}</strong></td>
            <td><strong>${entry.averageScore}%</strong></td>
            <td>${entry.benchmarkScores.aime2025}%</td>
            <td>${entry.benchmarkScores.arenahard}%</td>
            <td>${entry.benchmarkScores.bfcl}%</td>
            <td>${entry.benchmarkScores.gpqamain}%</td>
            <td>${entry.benchmarkScores.gsm8k}%</td>
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
                <span class="difficulty-badge difficulty-${task.difficulty}">${task.difficulty}</span>
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

// Create Performance Chart
function createChart() {
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

    // Reverse order for chart (ascending - lowest to highest)
    const reversedData = [...leaderboardData].reverse();

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
                    max: 60,
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

// View Leaderboard button - Smooth scroll
document.querySelectorAll('.hero-buttons a[href="#leaderboard"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('#leaderboard').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });
});

// Handle window resize for chart responsiveness
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (performanceChart) {
            performanceChart.destroy();
            createChart();
        }
    }, 250);
});

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    populateLeaderboard();
    populateTasks();
    populateStatistics();
    createChart();
});
