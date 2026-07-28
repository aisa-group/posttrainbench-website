(function () {
    const rowsRoot = document.getElementById('score-comparison-rows');
    const axisRoot = document.getElementById('score-comparison-axis');
    const v1 = window.SCORES_DATA_V1;
    const v11 = window.SCORES_DATA;

    if (!rowsRoot || !axisRoot || !v1 || !v11) return;

    function aggregateScore(data, agentKey) {
        const aggregate = data.aggregatedScores?.[agentKey]?.avg;
        if (Number.isFinite(aggregate)) return aggregate;

        const modelData = data.modelBenchmarkData?.[agentKey];
        if (!modelData) return null;
        const models = Object.values(modelData);
        if (models.length === 0) return null;

        const total = models.reduce((modelSum, scores) => {
            const weighted = Object.entries(data.benchmarkWeights).reduce((sum, [benchmark, weight]) => {
                const value = scores[benchmark]?.value;
                return Number.isFinite(value) ? sum + value * weight : sum;
            }, 0);
            return modelSum + weighted;
        }, 0);

        return total / models.length;
    }

    function agentLabel(agentKey) {
        const info = agentInfo[agentKey];
        if (!info) return agentKey;
        const effortParts = (info.reasoningEffort || '')
            .split(',')
            .map(part => part.trim())
            .filter(Boolean);
        const reprompted = effortParts.includes('Reprompted');
        const effort = effortParts.find(part => part !== 'Reprompted');
        return `${info.name}${effort ? ` (${effort})` : ''}${reprompted ? '†' : ''}`;
    }

    const comparison = chartAgentKeys
        .filter(agentKey => !agentInfo[agentKey]?.isBaseline)
        .map(agentKey => {
            const oldScore = aggregateScore(v1, agentKey);
            const newScore = aggregateScore(v11, agentKey);
            return {
                agentKey,
                label: agentLabel(agentKey),
                oldScore,
                newScore,
                delta: newScore - oldScore
            };
        })
        .filter(item => Number.isFinite(item.oldScore) && Number.isFinite(item.newScore))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 6);

    if (comparison.length === 0) return;

    const highestScore = Math.max(...comparison.flatMap(item => [item.oldScore, item.newScore]));
    const axisMax = Math.max(40, Math.ceil(highestScore / 10) * 10);
    const toPosition = score => `${Math.max(0, Math.min(100, score / axisMax * 100)).toFixed(3)}%`;

    comparison.forEach(item => {
        const row = document.createElement('div');
        const low = Math.min(item.oldScore, item.newScore);
        const high = Math.max(item.oldScore, item.newScore);
        row.className = 'comparison-row';
        row.style.setProperty('--v1-position', toPosition(item.oldScore));
        row.style.setProperty('--v11-position', toPosition(item.newScore));
        row.style.setProperty('--range-start', toPosition(low));
        row.style.setProperty('--range-width', `${((high - low) / axisMax * 100).toFixed(3)}%`);
        row.setAttribute(
            'aria-label',
            `${item.label}: ${item.oldScore.toFixed(1)} percent in v1, ${item.newScore.toFixed(1)} percent in v1.1`
        );

        const label = document.createElement('span');
        label.className = 'comparison-label';
        label.textContent = item.label;

        const track = document.createElement('div');
        track.className = 'comparison-track';
        track.setAttribute('aria-hidden', 'true');

        const range = document.createElement('span');
        range.className = 'comparison-range';
        const oldMarker = document.createElement('i');
        oldMarker.className = 'comparison-marker comparison-marker-v1';
        const newMarker = document.createElement('i');
        newMarker.className = 'comparison-marker comparison-marker-v11';
        track.append(range, oldMarker, newMarker);

        const values = document.createElement('span');
        values.className = 'comparison-values';
        const oldValue = document.createElement('strong');
        oldValue.textContent = item.oldScore.toFixed(1);
        const arrow = document.createElement('span');
        arrow.textContent = '→';
        const newValue = document.createElement('strong');
        newValue.textContent = item.newScore.toFixed(1);
        values.append(oldValue, arrow, newValue);

        row.append(label, track, values);
        rowsRoot.appendChild(row);
    });

    const axisSpacer = document.createElement('span');
    const axisScale = document.createElement('div');
    axisScale.className = 'comparison-axis-scale';
    for (let value = 0; value <= axisMax; value += 10) {
        const tick = document.createElement('span');
        tick.textContent = `${value}%`;
        axisScale.appendChild(tick);
    }
    axisRoot.append(axisSpacer, axisScale, document.createElement('span'));
})();
