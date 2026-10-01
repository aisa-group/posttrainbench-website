// v1.1 → v1.2 leaderboard order, computed from the site's score bundles so the
// chart always matches the leaderboard. Only agents on both leaderboards are
// ranked, so new arrivals don't push everyone down and each line shows a real
// reordering.
(function () {
    const root = document.getElementById('leaderboard-change');
    const previous = window.SCORES_DATA;
    const current = window.SCORES_DATA_V12;
    if (!root || !previous || !current) return;

    const score = (data, key) => data.aggregatedScores?.[key]?.avg;

    // Effort is left out of the visible names but kept for screen readers,
    // where it tells apart runs of the same model (e.g. Opus 4.8 High / Max).
    function accessibleName(agentKey) {
        const info = agentInfo[agentKey];
        const effort = (info.reasoningEffort || '').split(',').map(p => p.trim()).find(p => p && p !== 'Reprompted');
        return effort ? `${info.name} ${effort}` : info.name;
    }

    const agentKeys = Object.keys(current.modelBenchmarkData)
        .filter(key => agentInfo[key] && !agentInfo[key].isBaseline && Number.isFinite(score(current, key)));
    const ranked = agentKeys
        .filter(key => Number.isFinite(score(previous, key)))
        .map(key => ({ key, name: agentInfo[key].name, before: score(previous, key), after: score(current, key) }));
    const newCount = agentKeys.length - ranked.length;
    if (ranked.length === 0) return;

    const byBefore = [...ranked].sort((a, b) => b.before - a.before);
    const byAfter = [...ranked].sort((a, b) => b.after - a.after);
    byBefore.forEach((a, i) => { a.rankBefore = i + 1; });
    byAfter.forEach((a, i) => { a.rankAfter = i + 1; });

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    };

    const ROW = 28;
    const figure = el('div', 'rank-change');
    const left = el('ol', 'rank-column rank-column-before');
    const right = el('ol', 'rank-column rank-column-after');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'rank-links');
    svg.setAttribute('viewBox', `0 0 100 ${ranked.length * ROW}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.height = `${ranked.length * ROW}px`;

    const row = (a, side) => {
        const li = el('li', 'rank-row');
        li.dataset.agent = a.key;
        const rank = side === 'before' ? a.rankBefore : a.rankAfter;
        const value = side === 'before' ? a.before : a.after;
        const name = el('span', 'rank-name', a.name);
        const scoreText = el('span', 'rank-score', value.toFixed(1));
        const number = el('span', 'rank-number', String(rank));
        if (side === 'before') li.append(name, scoreText, number);
        else li.append(number, name, scoreText);
        li.setAttribute('aria-label', side === 'before'
            ? `v1.1 rank ${rank}: ${accessibleName(a.key)}, ${value.toFixed(1)} percent`
            : `v1.2 rank ${rank}: ${accessibleName(a.key)}, ${value.toFixed(1)} percent, was rank ${a.rankBefore} in v1.1`);
        return li;
    };

    byBefore.forEach(a => left.append(row(a, 'before')));
    byAfter.forEach(a => right.append(row(a, 'after')));
    byBefore.forEach(a => {
        const y1 = (a.rankBefore - 0.5) * ROW;
        const y2 = (a.rankAfter - 0.5) * ROW;
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', `M0 ${y1} C 50 ${y1}, 50 ${y2}, 100 ${y2}`);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.setAttribute('class', `rank-link${a.rankAfter < a.rankBefore ? ' is-up' : a.rankAfter > a.rankBefore ? ' is-down' : ''}`);
        path.dataset.agent = a.key;
        svg.append(path);
    });
    figure.append(left, svg, right);

    // Hovering a name highlights that agent on both sides.
    const setActive = (key) => figure.querySelectorAll('[data-agent]').forEach(node => {
        node.classList.toggle('is-active', node.dataset.agent === key);
    });
    figure.addEventListener('mouseover', e => {
        const target = e.target.closest('[data-agent]');
        figure.classList.toggle('has-active', Boolean(target));
        setActive(target?.dataset.agent);
    });
    figure.addEventListener('mouseleave', () => {
        figure.classList.remove('has-active');
        setActive(null);
    });

    const head = el('div', 'rank-head');
    head.append(el('span', '', 'v1.1'), el('span'), el('span', '', 'v1.2'));

    const note = el('p', 'rank-note');
    note.append(`Ranked among the ${ranked.length} agents on both leaderboards. The ${newCount} new agents are listed under `);
    const link = el('a', '', 'New agents');
    link.href = '#new-agents';
    note.append(link, '.');

    root.append(head, figure, note);
})();
