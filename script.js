
// Register Chart.js datalabels plugin (if available)
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Global chart instances
let performanceChart = null;

// Hamburger Menu Toggle
const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks = document.getElementById('nav-links');
const navbar = document.querySelector('.navbar');

if (navbar) {
    const hideThreshold = 96;
    let lastScrollY = Math.max(window.scrollY, 0);
    let ticking = false;

    const updateNavbarVisibility = () => {
        const currentScrollY = Math.max(window.scrollY, 0);
        const scrollingUp = currentScrollY < lastScrollY;
        const scrollingDown = currentScrollY > lastScrollY;
        const pastThreshold = currentScrollY > hideThreshold;
        const menuOpen = hamburgerBtn?.classList.contains('active');

        if (!pastThreshold || scrollingUp || menuOpen) {
            navbar.classList.remove('navbar-hidden');
        } else if (scrollingDown) {
            navbar.classList.add('navbar-hidden');
        }

        lastScrollY = currentScrollY;
        ticking = false;
    };

    window.addEventListener('scroll', () => {
        if (!ticking) {
            window.requestAnimationFrame(updateNavbarVisibility);
            ticking = true;
        }
    }, { passive: true });
}

if (hamburgerBtn && navLinks) {
    const mobileNavQuery = window.matchMedia('(max-width: 767px)');

    const syncNavAccessibility = () => {
        if (mobileNavQuery.matches) {
            navLinks.setAttribute('aria-hidden', String(!hamburgerBtn.classList.contains('active')));
        } else {
            navLinks.removeAttribute('aria-hidden');
        }
    };

    const setNavOpen = (isOpen) => {
        hamburgerBtn.classList.toggle('active', isOpen);
        navLinks.classList.toggle('active', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        hamburgerBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
        syncNavAccessibility();
    };

    syncNavAccessibility();
    mobileNavQuery.addEventListener('change', syncNavAccessibility);

    hamburgerBtn.addEventListener('click', () => {
        setNavOpen(!hamburgerBtn.classList.contains('active'));
    });

    // Close menu when clicking a link
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => setNavOpen(false));
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!hamburgerBtn.contains(e.target) && !navLinks.contains(e.target)) {
            setNavOpen(false);
        }
    });
}

// Get heatmap color from the displayed percentage.
// Example: 51.14% renders as sky blue at 51.14% opacity.
function getHeatmapColor(percentage) {
    const alpha = Math.max(0, Math.min(100, percentage)) / 100;
    return `rgba(84, 193, 240, ${alpha.toFixed(4)})`;
}

// Helper to get value from benchmark score (handles both old and new format)
function getBenchmarkValue(score) {
    if (typeof score === 'object' && score !== null) {
        return parseFloat(score.value);
    }
    return parseFloat(score);
}

const colorProbe = document.createElement('span');

function getCssVar(style, name, fallback = '') {
    return style.getPropertyValue(name).trim() || fallback;
}

function resolveCssColor(rawColor, fallback) {
    colorProbe.style.color = '';
    colorProbe.style.color = rawColor || fallback;
    document.body.appendChild(colorProbe);
    const resolved = getComputedStyle(colorProbe).color;
    colorProbe.remove();
    return resolved || rawColor || fallback;
}

function getCssColor(style, name, fallback) {
    return resolveCssColor(getCssVar(style, name, fallback), fallback);
}

function getChartTheme() {
    const style = getComputedStyle(document.documentElement);
    const dataviz = Array.from({ length: 8 }, (_, index) =>
        getCssColor(style, `--color-dataviz-${index + 1}`, '#0072B2')
    );

    return {
        textPrimary: getCssColor(style, '--text-primary', '#2d2a23'),
        textSecondary: getCssColor(style, '--dl-text-tertiary', getCssVar(style, '--text-secondary', '#6b655a')),
        accentPrimary: getCssColor(style, '--accent-primary', '#0072B2'),
        borderColor: getCssColor(style, '--chart-grid-color', 'rgba(53, 52, 49, 0.14)'),
        chartFont: getCssVar(style, '--font-sans', "'Die Grotesk', sans-serif"),
        chartTooltipBg: getCssColor(style, '--chart-tooltip-bg', 'rgba(250, 248, 243, 0.96)'),
        chartTooltipText: getCssColor(style, '--chart-tooltip-text', '#2d2a23'),
        chartTooltipMuted: getCssColor(style, '--chart-tooltip-muted', '#57544f'),
        chartTooltipBorder: getCssColor(style, '--chart-tooltip-border', 'rgba(144, 141, 134, 0.32)'),
        chartLabelOnBar: getCssColor(style, '--chart-label-on-bar', '#ffffff'),
        chartError: getCssColor(style, '--chart-error', '#908d86'),
        chartStripe: getCssColor(style, '--chart-stripe', 'rgba(255, 255, 255, 0.42)'),
        chartBar: getCssColor(style, '--chart-bar', dataviz[0]),
        chartBarBaseline1: getCssColor(style, '--chart-bar-baseline-1', dataviz[7]),
        chartBarBaseline2: getCssColor(style, '--chart-bar-baseline-2', dataviz[7]),
        dataviz
    };
}

const REPROMPTED_TOOLTIP = 'Reprompted: manually prompted to continue after stopping early.';

function isReprompted(entry) {
    return Boolean(entry?.reasoningEffort?.includes('Reprompted'));
}

function withRepromptedTooltip(label, entry) {
    if (!isReprompted(entry)) return label;
    return Array.isArray(label)
        ? [...label, REPROMPTED_TOOLTIP]
        : [label, REPROMPTED_TOOLTIP];
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
function populateLeaderboard() {
    const tbody = document.getElementById('leaderboard-data');
    tbody.innerHTML = ''; // Clear existing data

    const data = leaderboardData;

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
        const showMarkers = false;
        const showStd = true;

        // Format agent name - put scaffold name on separate line with smaller styling
        let agentNameHtml = entry.agent;
        if (entry.scaffold) {
            const effortTag = entry.reasoningEffort ? entry.reasoningEffort.split(', ').map(t => `<span class="effort-tag">${t}</span>`).join('') : '';
            agentNameHtml = `${entry.agent}<span class="scaffold-label">${entry.scaffold}${effortTag}</span>`;
        }

        row.innerHTML = `
            <td><span class="rank-badge ${rankClass}">${rankDisplay}</span></td>
            <td><strong>${agentNameHtml}</strong></td>
            <td class="avg-col" style="background-color: ${avgColor}"><strong>${entry.averageScore}%</strong>${stdDisplay}</td>
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
        tooltipTitle: isMobile ? 11 : 12,
        tooltipBody: isMobile ? 10 : 11,
        axisTitle: Math.max(13, Math.round(baseSize * 0.026 * scale)),
        axisTicks: Math.max(11, Math.round(baseSize * 0.020 * scale)),
        legend: Math.max(12, Math.round(baseSize * 0.022 * scale))
    };
}

// Create Simple Performance Chart
function createSimpleChart() {
    const ctx = document.getElementById('performanceChart');

    // Get theme colors
    const {
        textPrimary,
        textSecondary,
        borderColor,
        chartFont,
        chartTooltipBg,
        chartTooltipText,
        chartTooltipMuted,
        chartTooltipBorder,
        chartLabelOnBar,
        chartError,
        chartStripe,
        chartBar,
        chartBarBaseline1,
        chartBarBaseline2
    } = getChartTheme();

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

    // Filter to only show agents that should appear in chart
    const data = leaderboardData.filter(d => d.showInChart !== false);

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
        pctx.strokeStyle = chartStripe;
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
                borderWidth: 0,
                borderRadius: Number.MAX_VALUE,
                borderSkipped: false,
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
                    titleColor: chartTooltipText,
                    bodyColor: chartTooltipMuted,
                    borderColor: chartTooltipBorder,
                    borderWidth: 1,
                    cornerRadius: 10,
                    displayColors: false,
                    padding: 12,
                    titleMarginBottom: 8,
                    titleFont: {
                        family: chartFont,
                        size: fontSizes.tooltipTitle,
                        weight: 500
                    },
                    bodyFont: {
                        family: chartFont,
                        size: fontSizes.tooltipBody
                    },
                    callbacks: {
                        label: function(context) {
                            const std = errorBars[context.dataIndex];
                            const stdText = std ? ` ± ${std}%` : '';
                            const label = `Average Score: ${context.parsed.y.toFixed(1)}%${stdText}`;
                            return withRepromptedTooltip(label, reversedData[context.dataIndex]);
                        }
                    }
                },
                datalabels: {
                    display: !isMobile,
                    color: textSecondary,
                    anchor: 'end',
                    align: 'end',
                    offset: function(context) {
                        // Sit above the upper error-bar cap (if any) with a
                        // small gap so the label never overlaps the whiskers.
                        const value = context.dataset.data[context.dataIndex];
                        const error = errorBars[context.dataIndex];
                        const yScale = context.chart.scales.y;
                        let errorOffset = 0;
                        if (error && error > 0 && yScale && typeof value === 'number') {
                            const barTopPx = yScale.getPixelForValue(value);
                            const errorTopPx = yScale.getPixelForValue(value + error);
                            errorOffset = Math.max(0, barTopPx - errorTopPx);
                        }
                        return errorOffset + 6;
                    },
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
                        color: borderColor,
                        drawTicks: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: textSecondary,
                        padding: 8,
                        font: {
                            family: chartFont,
                            size: isMobile ? 9 : fontSizes.axisTicks,
                            weight: 500
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
                        display: false,
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
                    border: {
                        display: false
                    },
                    ticks: {
                        color: textSecondary,
                        padding: 8,
                        font: {
                            family: chartFont,
                            size: isMobile ? 9 : Math.max(9, fontSizes.axisTicks - 1),
                            weight: 500
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

// Create Time Spent Chart
let timeSpentChart = null;

function createTimeSpentChart() {
    const ctx = document.getElementById('timeSpentChart');

    // Get theme colors
    const {
        textPrimary,
        textSecondary,
        borderColor,
        chartFont,
        chartTooltipBg,
        chartTooltipText,
        chartTooltipMuted,
        chartTooltipBorder,
        chartError,
        chartStripe,
        chartBar
    } = getChartTheme();

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Sort by hours (descending), filter out baselines
    const sortedData = [...timeSpentData]
        .filter(d => !d.isBaseline && timeChartAgentKeys.includes(d.agentKey))
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

                    ctx.globalAlpha = 0.82;
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
        p.strokeStyle = chartStripe;
        p.lineWidth = 2;
        p.beginPath(); p.moveTo(0, 10); p.lineTo(10, 0); p.stroke();
        p.beginPath(); p.moveTo(-2, 2); p.lineTo(2, -2); p.stroke();
        p.beginPath(); p.moveTo(8, 12); p.lineTo(12, 8); p.stroke();
        return ctx.getContext('2d').createPattern(pc, 'repeat');
    };

    const timeBarColors = sortedData.map(d => {
        if (d.reasoningEffort && d.reasoningEffort.includes('Reprompted')) return createTimeStripePattern(chartBar);
        return chartBar;
    });

    // Vertical dashed line at x=10 to mark the budget. The chart's
    // x-axis goes to 11 (not 10) so error bars on the top agents
    // (Opus 4.6 at ~9h with ±std) and their text labels have room
    // past the budget line.
    const budgetLinePlugin = {
        id: 'budgetLine',
        afterDatasetsDraw(chart) {
            const { ctx: c, scales, chartArea } = chart;
            const xPos = scales.x.getPixelForValue(10);
            c.save();
            c.strokeStyle = borderColor;
            c.lineWidth = 1;
            c.setLineDash([4, 4]);
            c.beginPath();
            c.moveTo(xPos, chartArea.top);
            c.lineTo(xPos, chartArea.bottom);
            c.stroke();
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
                borderWidth: 0,
                borderRadius: Number.MAX_VALUE,
                borderSkipped: false,
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
            // Padding gives right-side data labels (e.g. "9:39 ± 0:53")
            // room without colliding with the chart's own canvas edges.
            layout: {
                padding: {
                    top: isMobile ? 6 : 8,
                    right: isMobile ? 55 : 80
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: chartTooltipBg,
                    titleColor: chartTooltipText,
                    bodyColor: chartTooltipMuted,
                    borderColor: chartTooltipBorder,
                    borderWidth: 1,
                    cornerRadius: 10,
                    displayColors: false,
                    padding: isMobile ? 8 : 12,
                    titleMarginBottom: 8,
                    titleFont: {
                        family: chartFont,
                        size: isMobile ? 10 : fontSizes.tooltipTitle,
                        weight: 500
                    },
                    bodyFont: {
                        family: chartFont,
                        size: isMobile ? 9 : fontSizes.tooltipBody
                    },
                    callbacks: {
                        label: function(context) {
                            const dataItem = sortedData[context.dataIndex];
                            let label = `Time: ${dataItem.time} (${context.parsed.x.toFixed(2)} hours)`;
                            if (dataItem.stdHours) {
                                label += ` ± ${dataItem.stdTime}`;
                            }
                            return withRepromptedTooltip(label, dataItem);
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
                        color: borderColor,
                        drawTicks: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: textSecondary,
                        padding: 8,
                        font: {
                            family: chartFont,
                            size: isMobile ? 9 : fontSizes.axisTicks,
                            weight: 500
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
                    border: {
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
            createSimpleChart();
        }
        if (timeSpentChart) {
            timeSpentChart.destroy();
            createTimeSpentChart();
        }
    }, 250);
});

// Copy citation to clipboard
document.getElementById('copy-citation')?.addEventListener('click', function() {
    const citationText = document.querySelector('.citation-text').textContent;
    const showCopiedState = () => {
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = `<svg class="icon-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>`;
        btn.setAttribute('aria-label', 'Citation copied');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.setAttribute('aria-label', 'Copy citation');
        }, 2000);
    };

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(citationText).then(showCopiedState).catch(showCopiedState);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = citationText;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } catch {}
    textarea.remove();
    showCopiedState();
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
    createSimpleChart();
    createTimeSpentChart();

    // Disclosure expand/collapse animation
    document.querySelectorAll('details.changelog, details.chart-footnotes').forEach((disclosure) => {
        const summary = disclosure.querySelector('summary');
        const content = disclosure.querySelector('.changelog-content, .chart-footnotes-content');
        if (!summary || !content) {
            return;
        }

        summary.addEventListener('click', (e) => {
            e.preventDefault();
            if (disclosure.open) {
                // Closing: animate out, then remove open
                content.classList.remove('open');
                content.addEventListener('transitionend', () => {
                    disclosure.open = false;
                }, { once: true });
            } else {
                // Opening: set open, then animate in
                disclosure.open = true;
                requestAnimationFrame(() => content.classList.add('open'));
            }
        });
    });
});
