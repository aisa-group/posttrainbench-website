// Landing page: fetch the corpus index, render a (benchmark × base-model)
// matrix that doubles as primary navigation, plus a filterable +
// groupable run table.

const DATA_BASE = (typeof window !== 'undefined' && window.PTB_DATA_BASE) || './data/';
const CATALOG = window.PTB_Catalog;

const els = {
  q: document.getElementById('q'),
  expFilter: document.getElementById('experiment-filter'),
  benchFilter: document.getElementById('benchmark-filter'),
  modelFilter: document.getElementById('trained-model-filter'),
  agentFilter: document.getElementById('agent-filter'),
  groupBy: document.getElementById('group-by'),
  sort: document.getElementById('sort'),
  runs: document.getElementById('runs'),
  empty: document.getElementById('empty'),
  loading: document.getElementById('loading'),
  resultCount: document.getElementById('result-count'),
  resetFilters: document.getElementById('reset-filters'),
  emptyReset: document.getElementById('empty-reset'),
  heroStats: document.getElementById('hero-stats'),
  matrix: document.getElementById('matrix'),
  matrixLegend: document.getElementById('matrix-legend'),
};

let DATA = { runs: [], experiments: [], benchmarks: [], build_ts: null };
const DATA_REQUEST_TIMEOUT_MS = 30000;
const TABLE_PAGE_SIZE = 50;
let OPEN_GROUP_KEY = '';
let APPLYING_URL_STATE = false;

function trackGoatCounterEvent(path, title) {
  if (typeof window.goatcounter?.count !== 'function') return;
  window.goatcounter.count({ path, title, event: true });
}

// Canonical display order for benchmarks and base models. Used to order
// matrix rows/columns and to sort groups so the page doesn't open on
// saturated cells. Benchmarks roughly: hard reasoning first → coding →
// writing/math → general → tool-calling (BFCL last because it saturates
// near 100% and reads as a flat block).
const BENCHMARK_ORDER = CATALOG.BENCHMARK_ORDER;
// Base models ordered by parameter count descending — largest first so
// the matrix's left-most column carries the model the eye anchors on.
const MODEL_ORDER = CATALOG.MODEL_ORDER;

async function load() {
  try {
    DATA = await fetchJsonWithTimeout(`${DATA_BASE}index.json`);
    if (!DATA || !Array.isArray(DATA.runs)) {
      throw new Error('The corpus index has an invalid format.');
    }

    populateFilters();
    applyUrlState();
    renderHeroStats();
    renderMatrix();
    els.loading.classList.add('hidden');
    render();
  } catch (error) {
    console.error('Failed to load the trace corpus index:', error);
    const detail = error.status
      ? `The data server returned HTTP ${error.status}.`
      : error.code === 'ETIMEDOUT'
        ? 'The data request timed out.'
        : 'Check your connection and try again.';
    showFatal(`Could not load the trace corpus. ${detail}`);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs = DATA_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!resp.ok) {
      const error = new Error(`HTTP ${resp.status}`);
      error.status = resp.status;
      throw error;
    }
    return await resp.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'ETIMEDOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function showFatal(message) {
  els.loading.classList.add('hidden');
  els.empty.classList.add('hidden');

  const box = document.createElement('div');
  box.className = 'empty-state';
  const text = document.createElement('p');
  text.className = 'muted';
  text.textContent = message;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'btn btn-secondary';
  retry.textContent = 'Retry';
  retry.addEventListener('click', () => window.location.reload());
  box.append(text, retry);
  els.runs.replaceChildren(box);
}

// ---------- Hero stats line --------------------------------------------

function renderHeroStats() {
  const nRuns = DATA.runs.length;
  const benchmarks = new Set(DATA.runs.map(r => r.benchmark).filter(Boolean));
  const models = new Set(DATA.runs.map(r => r.trained_model).filter(Boolean));
  const agents = new Set(DATA.runs.map(r => r.agent_model).filter(Boolean));
  const updated = relTime(DATA.build_ts);

  // Vertical stat tiles next to the matrix. Big number + small label.
  // The runs tile is the headline so it gets a primary modifier class.
  const tiles = [
    { n: nRuns.toLocaleString(), label: `run${nRuns === 1 ? '' : 's'}`, primary: true },
    { n: benchmarks.size,        label: `task${benchmarks.size === 1 ? '' : 's'}` },
    { n: models.size,            label: `base model${models.size === 1 ? '' : 's'}` },
    { n: agents.size,            label: `agent${agents.size === 1 ? '' : 's'}` },
  ];
  let html = tiles.map(t => `
    <div class="stat-tile${t.primary ? ' stat-tile-primary' : ''}">
      <span class="stat-num">${escapeHtml(String(t.n))}</span>
      <span class="stat-label">${escapeHtml(t.label)}</span>
    </div>`).join('');
  if (updated) {
    html += `<div class="stat-meta">updated ${escapeHtml(updated)}</div>`;
  }
  els.heroStats.innerHTML = html;
}

function relTime(ts) {
  if (!ts) return '';
  const t = typeof ts === 'number' ? ts * (ts < 1e12 ? 1000 : 1) : Date.parse(ts);
  if (!isFinite(t)) return '';
  const dt = (Date.now() - t) / 1000;
  if (dt < 60) return 'just now';
  if (dt < 3600) return `${Math.round(dt / 60)}m ago`;
  if (dt < 86400) return `${Math.round(dt / 3600)}h ago`;
  if (dt < 86400 * 30) return `${Math.round(dt / 86400)}d ago`;
  if (dt < 86400 * 365) return `${Math.round(dt / (86400 * 30))}mo ago`;
  return `${Math.round(dt / (86400 * 365))}y ago`;
}

// ---------- Matrix -----------------------------------------------------
// A (benchmark × base-model) grid. Each cell shows run count + best
// accuracy. Shade is normalized per row (per benchmark) since different
// benchmarks have wildly different accuracy ranges — what matters is
// "for THIS task, which base model got the best result." Cells are
// clickable; clicking sets the (benchmark, base-model) filter pair.

function renderMatrix() {
  const rows = uniqValuesOrdered(DATA.runs, 'benchmark', BENCHMARK_ORDER);
  const cols = uniqValuesOrdered(DATA.runs, 'trained_model', MODEL_ORDER);
  if (!rows.length || !cols.length) {
    els.matrix.innerHTML = '';
    return;
  }

  // Aggregate per cell.
  const cell = new Map();   // `${bench}|${model}` -> { count, bestAcc, bestRun }
  for (const r of DATA.runs) {
    if (!r.benchmark || !r.trained_model) continue;
    const key = `${r.benchmark}|${r.trained_model}`;
    let c = cell.get(key);
    if (!c) { c = { count: 0, bestAcc: null, bestRun: null }; cell.set(key, c); }
    c.count += 1;
    if (r.accuracy != null && (c.bestAcc == null || r.accuracy > c.bestAcc)) {
      c.bestAcc = r.accuracy;
      c.bestRun = r;
    }
  }

  // Per-row max accuracy (for shading within row).
  const rowMax = new Map();
  for (const b of rows) {
    let m = 0;
    for (const tm of cols) {
      const c = cell.get(`${b}|${tm}`);
      if (c && c.bestAcc != null) m = Math.max(m, c.bestAcc);
    }
    rowMax.set(b, m);
  }

  // Build grid. CSS grid: 1 header col + N model cols; 1 header row + M
  // benchmark rows. We render flat children with grid-area declarations.
  const grid = document.createElement('div');
  grid.className = 'matrix-grid';
  grid.style.gridTemplateColumns = `auto repeat(${cols.length}, minmax(0, 1fr))`;

  // Top-left blank.
  const corner = document.createElement('div');
  corner.className = 'matrix-corner';
  grid.appendChild(corner);

  // Column headers (base models).
  for (const tm of cols) {
    const h = document.createElement('div');
    h.className = 'matrix-colhead';
    h.textContent = prettyTrainedModel(tm);
    h.title = tm;
    grid.appendChild(h);
  }

  // Body rows.
  for (const b of rows) {
    const rh = document.createElement('div');
    rh.className = 'matrix-rowhead';
    const benchmarkLabel = prettyBenchmark(b);
    if (String(b).toLowerCase() === 'arenahardwriting') {
      const fullLabel = document.createElement('span');
      fullLabel.className = 'matrix-label-full';
      fullLabel.textContent = benchmarkLabel;
      const compactLabel = document.createElement('span');
      compactLabel.className = 'matrix-label-compact';
      compactLabel.textContent = 'Arena Hard';
      rh.append(fullLabel, compactLabel);
      rh.setAttribute('aria-label', benchmarkLabel);
    } else {
      rh.textContent = benchmarkLabel;
    }
    rh.title = benchmarkLabel;
    grid.appendChild(rh);

    const max = rowMax.get(b) || 0;
    for (const tm of cols) {
      const c = cell.get(`${b}|${tm}`);
      const cellEl = document.createElement('button');
      cellEl.type = 'button';
      cellEl.className = 'matrix-cell';
      if (!c) {
        cellEl.classList.add('matrix-cell-empty');
        cellEl.innerHTML = `<span class="matrix-empty">-</span>`;
        cellEl.disabled = true;
        cellEl.setAttribute('aria-label', `${prettyBenchmark(b)} · ${prettyTrainedModel(tm)}: no runs`);
      } else {
        const intensity = max > 0 && c.bestAcc != null ? c.bestAcc / max : 0;
        cellEl.style.setProperty('--cell-intensity', intensity.toFixed(3));
        const accLabel = c.bestAcc != null
          ? `${(c.bestAcc * 100).toFixed(1)}%`
          : '-';
        // Cell face shows only the best accuracy + shade — keeps a clean
        // heatmap read. Best agent name lives in the tooltip.
        cellEl.innerHTML = `<span class="matrix-acc">${accLabel}</span>`;
        const tip = c.bestAcc != null
          ? `best ${accLabel}${c.bestRun ? ' (' + prettyAgentForRun(c.bestRun) + ')' : ''}`
          : 'no accuracy data';
        cellEl.setAttribute('data-tip', tip);
        cellEl.setAttribute('aria-label',
          `${prettyBenchmark(b)} · ${prettyTrainedModel(tm)}: ${tip}`);
        cellEl.addEventListener('click', () => filterToCell(b, tm));
      }
      grid.appendChild(cellEl);
    }
  }

  els.matrix.innerHTML = '';
  els.matrix.appendChild(grid);

  // Legend.
  els.matrixLegend.innerHTML = `
    <span class="legend-label">Darker = higher within task</span>
    <span class="legend-scale" aria-hidden="true">
      <span class="legend-step" style="--cell-intensity:0.15"></span>
      <span class="legend-step" style="--cell-intensity:0.40"></span>
      <span class="legend-step" style="--cell-intensity:0.65"></span>
      <span class="legend-step" style="--cell-intensity:0.90"></span>
      <span class="legend-step" style="--cell-intensity:1"></span>
    </span>
    <span class="legend-label legend-label-right">low → high</span>`;
}

function filterToCell(benchmark, model) {
  trackGoatCounterEvent(
    `trace-matrix-filter/${encodeURIComponent(benchmark)}/${encodeURIComponent(model)}`,
    `Trace matrix: ${prettyBenchmark(benchmark)} · ${prettyTrainedModel(model)}`
  );
  APPLYING_URL_STATE = true;
  els.benchFilter.value = benchmark;
  els.modelFilter.value = model;
  // Sync custom-select triggers.
  els.benchFilter.dispatchEvent(new Event('change', { bubbles: true }));
  els.modelFilter.dispatchEvent(new Event('change', { bubbles: true }));
  APPLYING_URL_STATE = false;
  if (els.groupBy.value === 'task-model') OPEN_GROUP_KEY = `${benchmark}|${model}`;
  else if (els.groupBy.value === 'task') OPEN_GROUP_KEY = benchmark;
  else OPEN_GROUP_KEY = '';
  syncUrlState();
  render();
  document.querySelector('.filter-dock').scrollIntoView({ block: 'start' });
}

function uniqValuesSortedByCount(rows, key) {
  const counts = new Map();
  for (const r of rows) {
    const v = r[key];
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v]) => v);
}

// Like uniqValuesSortedByCount, but ordered by an explicit list first
// (values not in the list fall back to alpha after the list ends).
function uniqValuesOrdered(rows, key, orderList) {
  const seen = new Set();
  for (const r of rows) {
    const v = r[key];
    if (v) seen.add(v);
  }
  return [...seen].sort((a, b) => {
    const ai = CATALOG.orderIndex(orderList, a);
    const bi = CATALOG.orderIndex(orderList, b);
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

// ---------- Filter dropdowns -------------------------------------------

function populateFilters() {
  for (const exp of (DATA.experiments || [])) {
    addOpt(els.expFilter, exp, exp);
  }
  for (const b of (DATA.benchmarks || [])) {
    addOpt(els.benchFilter, b, prettyBenchmark(b));
  }
  const agents = [...new Set(DATA.runs.map(r => r.agent_model).filter(Boolean))].sort();
  for (const a of agents) addOpt(els.agentFilter, a, prettyAgent(a));
  const models = [...new Set(DATA.runs.map(r => r.trained_model).filter(Boolean))].sort();
  for (const m of models) addOpt(els.modelFilter, m, prettyTrainedModel(m));
}

function addOpt(select, value, label) {
  const opt = document.createElement('option');
  opt.value = value; opt.textContent = label;
  select.appendChild(opt);
}

// ---------- Main render ------------------------------------------------

function stateFromControls() {
  return {
    benchmark: els.benchFilter.value,
    model: els.modelFilter.value,
    agent: els.agentFilter.value,
    experiment: els.expFilter.value,
    q: els.q.value.trim(),
    group: els.groupBy.value,
    sort: els.sort.value,
    open: OPEN_GROUP_KEY,
  };
}

function applyUrlState() {
  const state = CATALOG.readState(window.location.search);
  APPLYING_URL_STATE = true;
  els.benchFilter.value = state.benchmark;
  els.modelFilter.value = state.model;
  els.agentFilter.value = state.agent;
  els.expFilter.value = state.experiment;
  els.q.value = state.q;
  els.groupBy.value = state.group;
  els.sort.value = state.sort;
  OPEN_GROUP_KEY = state.open;
  [els.benchFilter, els.modelFilter, els.agentFilter, els.expFilter, els.groupBy, els.sort]
    .forEach(select => select.dispatchEvent(new Event('change', { bubbles: true })));
  APPLYING_URL_STATE = false;
}

function syncUrlState() {
  const next = CATALOG.writeState(new URL(window.location.href), stateFromControls());
  history.replaceState(null, '', next);
}

function handleControlInput() {
  if (APPLYING_URL_STATE) return;
  OPEN_GROUP_KEY = '';
  syncUrlState();
  render();
}

function filterRows() {
  return CATALOG.filterRuns(DATA.runs, stateFromControls());
}

function render() {
  let rows = filterRows();
  const total = DATA.runs.length;
  const filtered = rows.length;
  const anyFilter = els.q.value || els.expFilter.value || els.benchFilter.value
                    || els.modelFilter.value || els.agentFilter.value;
  els.resultCount.textContent = anyFilter
    ? `${filtered.toLocaleString()} of ${total.toLocaleString()} runs`
    : '';
  els.resultCount.classList.toggle('hidden', !anyFilter);
  els.resetFilters.classList.toggle('hidden', !anyFilter);

  if (rows.length === 0) {
    els.runs.innerHTML = '';
    els.empty.classList.remove('hidden');
    return;
  }
  els.empty.classList.add('hidden');

  rows.sort(CATALOG.sorter(els.sort.value));

  // Corpus-wide accuracy max so bars share a scale.
  const accMax = Math.max(0.01, ...DATA.runs.map(r => r.accuracy ?? 0));

  const groupMode = els.groupBy.value;
  els.runs.innerHTML = '';
  if (groupMode === 'none') {
    els.runs.appendChild(buildPagedTable(rows, accMax, groupMode, ''));
    return;
  }

  const groups = CATALOG.buildGroups(rows, groupMode);
  const requestedGroupExists = groups.some(group => group.key === OPEN_GROUP_KEY);
  const effectiveOpenKey = requestedGroupExists
    ? OPEN_GROUP_KEY
    : (groups.length === 1 ? groups[0].key : '');
  for (const g of groups) {
    els.runs.appendChild(buildGroupDisclosure(g, groupMode, accMax, g.key === effectiveOpenKey));
  }
}

// ---------- Grouping ---------------------------------------------------

function buildGroupDisclosure(group, mode, accMax, initiallyOpen) {
  const details = document.createElement('details');
  details.className = 'exp-group';
  details.dataset.groupKey = group.key;
  details.open = initiallyOpen;
  details.appendChild(buildGroupHeader(group, mode));

  const body = document.createElement('div');
  body.className = 'exp-group-body';
  details.appendChild(body);
  let materialized = false;
  const materialize = () => {
    if (materialized) return;
    materialized = true;
    body.appendChild(buildPagedTable(group.rows, accMax, mode, group.key));
  };
  if (initiallyOpen) materialize();

  details.addEventListener('toggle', () => {
    if (details.open) {
      els.runs.querySelectorAll('.exp-group[open]').forEach(other => {
        if (other !== details) other.open = false;
      });
      OPEN_GROUP_KEY = group.key;
      materialize();
    } else if (OPEN_GROUP_KEY === group.key) {
      OPEN_GROUP_KEY = '';
    }
    syncUrlState();
  });
  return details;
}

function buildPagedTable(rows, accMax, mode, groupKey) {
  const wrap = document.createElement('div');
  wrap.className = 'paged-table';
  let visible = Math.min(TABLE_PAGE_SIZE, rows.length);

  const renderPage = () => {
    wrap.replaceChildren(buildTable(rows.slice(0, visible), accMax, mode, groupKey));
    if (visible >= rows.length) return;
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'load-more-btn';
    const remaining = rows.length - visible;
    more.textContent = `Show ${Math.min(TABLE_PAGE_SIZE, remaining)} more`;
    more.addEventListener('click', () => {
      visible = Math.min(rows.length, visible + TABLE_PAGE_SIZE);
      renderPage();
    });
    wrap.appendChild(more);
  };
  renderPage();
  return wrap;
}

function buildGroupHeader(g, mode) {
  const head = document.createElement('summary');
  head.className = 'exp-head';

  // Title: depends on mode.
  let title = '';
  if (mode === 'task-model') {
    const [b, m] = g.key.split('|');
    title = `<span class="exp-name">${escapeHtml(prettyBenchmark(b))}</span>
             <span class="exp-name-sep">·</span>
             <span class="exp-name exp-name-model">${escapeHtml(prettyTrainedModel(m))}</span>`;
  } else if (mode === 'task') {
    title = `<span class="exp-name">${escapeHtml(prettyBenchmark(g.key))}</span>`;
  } else {
    title = `<span class="exp-name">${escapeHtml(g.key)}</span>`;
  }

  // Headline stats: best accuracy + which agent, plus run count.
  let bestRun = null;
  const agents = new Set();
  const models = new Set();
  for (const r of g.rows) {
    agents.add(r.agent_model);
    if (r.trained_model) models.add(r.trained_model);
    if (r.accuracy != null && (!bestRun || r.accuracy > bestRun.accuracy)) bestRun = r;
  }
  const parts = [];
  if (mode === 'task') {
    parts.push(`${models.size} model${models.size === 1 ? '' : 's'}`);
  }
  parts.push(`${g.rows.length} run${g.rows.length === 1 ? '' : 's'}`);
  if (bestRun) {
    const agent = bestRun.agent_model ? ` (${prettyAgentForRun(bestRun)})` : '';
    parts.push(`best ${(bestRun.accuracy * 100).toFixed(1)}%${agent}`);
  }
  if (mode === 'experiment' && agents.size > 1) {
    parts.push(`${agents.size} agents`);
  }

  head.innerHTML = `
    <div class="exp-head-title">${title}</div>
    <div class="exp-head-meta">${escapeHtml(parts.join(' · '))}</div>
    <span class="exp-head-caret" aria-hidden="true">›</span>`;
  return head;
}

function buildTable(rows, accMax, mode, groupKey) {
  const t = document.createElement('table');
  t.className = 'runtable';
  const firstHeader = mode === 'task-model'
    ? 'seed'
    : mode === 'task' ? 'base model' : 'task';
  t.innerHTML = `
    <thead><tr>
      <th class="col-task">${firstHeader}</th>
      <th class="col-agent">agent</th>
      <th class="col-acc">accuracy</th>
      <th class="col-num">duration</th>
      <th class="col-num">turns</th>
      <th class="col-num">cost</th>
      <th class="col-verdict">judge</th>
    </tr></thead>
    <tbody></tbody>`;
  const tbody = t.querySelector('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    const href = runHref(r.run_id, groupKey);
    tr.addEventListener('click', event => {
      if (event.target.closest('a, button')) return;
      navigateRun(href);
    });
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateRun(href); }
    });
    tr.innerHTML = `
      <td class="col-task">${runIdentityCell(r, mode, href)}</td>
      <td class="col-agent">${agentCell(r)}</td>
      <td class="col-acc">${accCell(r, accMax)}</td>
      <td class="col-num">${durationCell(r)}</td>
      <td class="col-num">${(r.num_turns != null && r.num_turns > 0) ? r.num_turns.toLocaleString() : '<span class="muted">-</span>'}</td>
      <td class="col-num">${fmtCost(r.total_cost_usd)}</td>
      <td class="col-verdict">${verdictDots(r)}</td>`;
    tbody.appendChild(tr);
  }
  // Wrap in a horizontal scroller so the wide table scrolls within itself on
  // narrow screens instead of stretching the whole page past the viewport.
  const scroller = document.createElement('div');
  scroller.className = 'runtable-scroll';
  scroller.appendChild(t);
  return scroller;
}

function runHref(id, groupKey) {
  const returnUrl = CATALOG.writeState(new URL(window.location.href), {
    ...stateFromControls(),
    open: groupKey || OPEN_GROUP_KEY,
  });
  returnUrl.hash = '';
  const destination = new URL('run.html', window.location.href);
  destination.searchParams.set('id', id);
  destination.searchParams.set('return', `${returnUrl.pathname}${returnUrl.search}`);
  return destination.href;
}

function navigateRun(href) {
  window.location.href = href;
}

// ---------- Cell renderers --------------------------------------------

function runIdentityCell(r, mode, href) {
  const bench = prettyBenchmark(r.benchmark) || '?';
  const model = prettyTrainedModel(r.trained_model) || '?';
  const seedText = r.seed != null && r.seed !== '' ? String(r.seed) : '';
  let primary = bench;
  let secondary = model;
  if (mode === 'task-model') {
    primary = seedText ? `seed ${seedText}` : 'open run';
    secondary = '';
  } else if (mode === 'task') {
    primary = model;
    secondary = seedText ? `seed ${seedText}` : '';
  } else if (seedText) {
    secondary += ` · seed ${seedText}`;
  }
  return `<div class="task-cell">
    <div class="task-primary"><a class="run-primary-link" href="${escapeHtml(href)}">${escapeHtml(primary)}</a></div>
    ${secondary ? `<div class="task-secondary">${escapeHtml(secondary)}</div>` : ''}
  </div>`;
}

function agentCell(r) {
  if (!r.agent_model) return '<span class="muted">-</span>';
  const pretty = prettyAgentForRun(r);
  const m = /^(.*?)\s+\(([^)]+)\)\s*$/.exec(pretty);
  const nameHtml = m
    ? `<span class="agent-name">${escapeHtml(m[1])}</span> <span class="agent-tag">${escapeHtml(m[2])}</span>`
    : `<span class="agent-name">${escapeHtml(pretty)}</span>`;
  const harness = prettyHarness(r.trace_format);
  const harnessHtml = harness
    ? `<span class="agent-harness">${escapeHtml(harness)}</span>`
    : '';
  return `${nameHtml}${harnessHtml}`;
}

// Map a run's trace_format to the harness that produced it. The harness
// is the autonomous-agent shell that the LLM ran inside (claude-code CLI,
// codex CLI, opencode CLI). It's secondary to the model identity but
// useful when comparing strategies across runs.
function prettyHarness(fmt) {
  if (!fmt) return '';
  const map = {
    claude_code: 'Claude Code',
    'claude-code': 'Claude Code',
    claude: 'Claude Code',
    codex: 'Codex CLI',
    opencode: 'OpenCode',
  };
  return map[String(fmt).toLowerCase()] || fmt;
}

// Accuracy missing → no metrics.json → in practice, the agent didn't
// produce a `final_model/` so the eval harness never ran.
const NO_EVAL_TITLE =
  "Agent didn't produce a final_model. The evaluation harness never " +
  "ran, so this run has no metrics.json.";

function accCell(r, accMax) {
  if (r.accuracy == null) {
    return `<span class="no-eval-marker" data-tip="${NO_EVAL_TITLE}">not evaluated</span>`;
  }
  const pct = (r.accuracy * 100).toFixed(1);
  const w = Math.max(2, (r.accuracy / accMax) * 100);
  const stderr = r.stderr != null ? `<span class="acc-err">±${(r.stderr * 100).toFixed(1)}</span>` : '';
  return `<div class="acc-cell">
    <div class="acc-bar" aria-hidden="true"><div class="acc-fill" style="width:${w.toFixed(1)}%"></div></div>
    <span class="acc-num">${pct}%</span>${stderr}
  </div>`;
}

function durationCell(r) {
  if (r.time_taken && /^\d+:\d{1,2}:\d{1,2}$/.test(r.time_taken.trim())) {
    const [h, m] = r.time_taken.trim().split(':').map(Number);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${r.time_taken}`;
  }
  if (r.duration_ms) {
    const s = Math.floor(r.duration_ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m`;
    return `${s}s`;
  }
  return '<span class="muted">-</span>';
}

const COST_MISSING_TITLE =
  "Cost unknown. The trace doesn't include result events with token cost. " +
  "Common for runs killed early, older Claude Code containers, or Codex/opencode traces.";

function fmtCost(c) {
  if (c == null || c === 0) {
    return `<span class="muted cost-missing" data-tip="${COST_MISSING_TITLE}">-</span>`;
  }
  return '$' + Number(c).toFixed(2);
}

const WARN_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;
const CHECK_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

// Verdict — single combined badge collapsing both judge axes
// (contamination, disallowed-model use) into one read. PASS = clean,
// FAIL = flagged with which axis tripped, otherwise pending. Each axis is
// null when the judge didn't run, else {flagged: bool, justification: str}.
function verdictDots(r) {
  const cState = axisState(r.contamination);
  const mState = axisState(r.disallowed_model);

  const flags = [];
  if (cState === 'flag') flags.push('contam');
  if (mState === 'flag') flags.push('model');

  const tipParts = [
    `contamination: ${axisTip(r.contamination)}`,
    `disallowed model: ${axisTip(r.disallowed_model)}`,
  ];
  if (r.judge_version) tipParts.push(`judged: ${r.judge_version}`);
  const tip = escapeHtml(tipParts.join(' · '));

  if (flags.length) {
    return `<span class="vbadge vbadge-flag" data-tip="${tip}">${WARN_SVG}<span>flagged: ${flags.join(', ')}</span></span>`;
  }
  // Most rows are "clean" — render as a quiet glyph (no pill) so the
  // column scans for problems. Pending stays as a muted em-dash.
  if (cState === 'pending' || mState === 'pending') {
    return `<span class="vbadge vbadge-pending" data-tip="${tip}" aria-label="judge pending">-</span>`;
  }
  return `<span class="vbadge vbadge-ok" data-tip="${tip}" aria-label="judge clean">${CHECK_SVG}</span>`;
}

function axisState(v) {
  if (v == null) return 'pending';
  return v.flagged ? 'flag' : 'ok';
}

function axisTip(v) {
  // The listing tooltip only shows the flag — the full justification is
  // stripped from index.json (that stripped ~2 MB / ~60% off the payload).
  // Users see the reasoning by opening the run page.
  if (v == null) return 'no judgement';
  return v.flagged ? 'true' : 'false';
}

// ---------- Pretty-name helpers (mirror run.js) ------------------------

function prettyBenchmark(b) {
  if (!b) return '';
  const map = {
    healthbench: 'HealthBench', humaneval: 'HumanEval',
    aime2025: 'AIME 2025', aime2024: 'AIME 2024',
    gsm8k: 'GSM8K', bfcl: 'BFCL',
    math500: 'MATH-500', mmlu: 'MMLU', mbpp: 'MBPP',
    swebench: 'SWE-bench', arena_hard: 'Arena Hard', arenahard: 'Arena Hard',
    arenahardwriting: 'Arena Hard (writing)',
    ifeval: 'IFEval', gpqa: 'GPQA', gpqamain: 'GPQA', gpqa_main: 'GPQA',
    livecodebench: 'LiveCodeBench',
    minervamath: 'Minerva Math',
  };
  return map[b.toLowerCase()] || b;
}

function prettyTrainedModel(name) {
  if (!name) return '';
  let s = name.replace(/^[^_]+_/, '');
  s = s.replace(/-(Base|pt|PT|base)$/, '');
  s = s.replace(/^Qwen3-(\d+(?:\.\d+)?B)$/i, (_, sz) => `Qwen 3 ${sz}`);
  s = s.replace(/^Qwen3-(\d+(?:\.\d+)?B)/i, (_, sz) => `Qwen 3 ${sz}`);
  s = s.replace(/^SmolLM3-(\d+(?:\.\d+)?B)/i, (_, sz) => `SmolLM3 ${sz}`);
  s = s.replace(/^gemma-(\d+)-(\d+(?:\.\d+)?)b/i, (_, gen, sz) => `Gemma ${gen} ${sz}B`);
  return s;
}

function prettyAgent(name) {
  if (!name) return '';
  let s = String(name);
  let annotation = '';
  s = s.replace(/\[([^\]]+)\]\s*$/, (_, a) => { annotation = ' (' + a.toUpperCase() + ')'; return ''; });
  // Strip an OpenCode-style provider prefix (`opencode/...`, `zai/...`) —
  // the model portion below carries the identity; experiment name already
  // encodes provider.
  s = s.replace(/^(?:opencode|zai)\//i, '');
  // Claude family — opus/sonnet/haiku/fable; minor version optional
  // (Opus 5 / Fable 5 ship as major-only).
  s = s.replace(/^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?$/i,
    (_, fam, maj, min) => `Claude ${cap(fam)} ${maj}${min ? '.' + min : ''}`);
  s = s.replace(/^gpt-([\d.]+)(?:-(.+))?$/i, (_, ver, tail) =>
    `GPT ${ver}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
  s = s.replace(/^gemini-([\d.]+)(?:-(.+))?$/i, (_, ver, tail) =>
    `Gemini ${ver}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
  // Non-family model IDs whose raw form isn't friendly on the page.
  // Keep this list conservative — only aliases that ship in the corpus.
  s = s.replace(/^kismet-\d+$/i,                             'Kimi K3');
  s = s.replace(/^kimi-k([\d.]+)(-thinking)?$/i,
                (_, ver, th) => `Kimi K${ver}${th ? ' Thinking' : ''}`);
  s = s.replace(/^glm-([\d.]+)(?:-free|-preview)?$/i,        (_, ver) => `GLM ${ver}`);
  s = s.replace(/^minimax-m([\d.]+)(?:-free)?$/i,            (_, ver) => `MiniMax M${ver}`);
  s = s.replace(/^qwen3-max(?:-\d{4}-\d{2}-\d{2})?$/i,       'Qwen3 Max');
  // Match cursor-grok-4.5-high (kebab, from experiment names) AND
  // "Cursor Grok 4.5 High" (spaced title-case, what Cursor CLI itself
  // reports in its init event's model field).
  s = s.replace(/^(?:cursor[\s-])?grok[\s-]4\.5(?:[\s-]high)?$/i, 'Grok 4.5');
  return s + annotation;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Variant annotations derived from the run's experiment string. The
// agent_model alone doesn't tell you whether a run was reprompted (i.e.
// sessions continued after the agent gave up) — that signal lives in
// the experiment name. We surface it alongside the existing "(1M)"-style
// annotation so the cell tells the full story.
function agentVariantsFromRun(r) {
  const out = [];
  const exp = (r && r.experiment || '').toLowerCase();
  if (/(?:^|[_/-])reprompt(?:ed)?(?:[_/-]|$)/.test(exp)) out.push('reprompted');
  return out;
}

// Pretty agent name including run-derived variant annotations.
// Falls back to prettyAgent when no run context is available.
function prettyAgentForRun(r) {
  if (!r) return '';
  const base = prettyAgent(r.agent_model);
  const extras = agentVariantsFromRun(r);
  if (!extras.length) return base;
  // If prettyAgent already attached a "(X)" annotation (e.g. "(1M)"),
  // merge the extras into the same parens so we don't render double parens.
  const m = /^(.*?)\s+\(([^)]+)\)\s*$/.exec(base);
  if (m) return `${m[1]} (${m[2]}, ${extras.join(', ')})`;
  return `${base} (${extras.join(', ')})`;
}

// ---------- Misc -------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function clearFilters() {
  APPLYING_URL_STATE = true;
  els.q.value = '';
  els.expFilter.value = '';
  els.benchFilter.value = '';
  els.modelFilter.value = '';
  els.agentFilter.value = '';
  [els.expFilter, els.benchFilter, els.modelFilter, els.agentFilter]
    .forEach(s => s.dispatchEvent(new Event('change', { bubbles: true })));
  APPLYING_URL_STATE = false;
  OPEN_GROUP_KEY = '';
  syncUrlState();
  render();
}

[els.q, els.expFilter, els.benchFilter, els.modelFilter,
 els.agentFilter, els.groupBy, els.sort]
  .forEach(el => el.addEventListener('input', handleControlInput));
els.resetFilters.addEventListener('click', clearFilters);
els.emptyReset.addEventListener('click', clearFilters);
window.addEventListener('popstate', () => {
  applyUrlState();
  render();
});

// ---------- Custom dropdown (wraps each <select> in the filter dock) ---
// The underlying <select> stays as the source of truth (so existing
// listeners + keyboard accessibility + form behavior keep working). We
// just render a styled trigger button + popover on top.

function makeCustomSelect(selectEl) {
  if (!selectEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'cs';
  selectEl.parentNode.insertBefore(wrap, selectEl);
  wrap.appendChild(selectEl);
  selectEl.classList.add('cs-native');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'cs-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `
    <span class="cs-value"></span>
    <svg class="cs-caret" width="10" height="6" viewBox="0 0 12 8" fill="none" aria-hidden="true">
      <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  const menu = document.createElement('ul');
  menu.className = 'cs-menu';
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-hidden', 'true');
  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  const valueEl = trigger.querySelector('.cs-value');
  const syncTrigger = () => {
    const opt = selectEl.selectedOptions[0];
    valueEl.textContent = opt ? opt.textContent : '';
    // Mark the trigger as "active" when a non-default value is selected,
    // so the user can see which filters are engaged at a glance.
    const isActive = !!selectEl.value && selectEl.value !== '';
    wrap.classList.toggle('cs-active', isActive);
  };
  const rebuildMenu = () => {
    menu.innerHTML = '';
    for (const opt of selectEl.options) {
      const li = document.createElement('li');
      li.className = 'cs-option' + (opt.value === selectEl.value ? ' active' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', opt.value === selectEl.value ? 'true' : 'false');
      li.dataset.value = opt.value;
      li.tabIndex = -1;
      li.textContent = opt.textContent;
      menu.appendChild(li);
    }
  };
  const setInstant = instant => {
    if (!instant) return;
    wrap.classList.add('cs-no-motion');
    requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.remove('cs-no-motion')));
  };
  const open = ({ instant = false } = {}) => {
    setInstant(instant);
    rebuildMenu();
    wrap.classList.add('cs-open');
    trigger.setAttribute('aria-expanded', 'true');
    menu.setAttribute('aria-hidden', 'false');
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
  };
  const close = ({ instant = false } = {}) => {
    setInstant(instant);
    wrap.classList.remove('cs-open');
    trigger.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-hidden', 'true');
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('keydown', onKey);
    trigger.focus();
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close({ instant: true }); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...menu.querySelectorAll('.cs-option')];
      if (!items.length) return;
      const cur = items.findIndex(li => li.classList.contains('focused'));
      const next = e.key === 'ArrowDown'
        ? Math.min(items.length - 1, cur + 1)
        : Math.max(0, cur === -1 ? items.length - 1 : cur - 1);
      items.forEach(li => li.classList.remove('focused'));
      items[next].classList.add('focused');
      items[next].scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const focused = menu.querySelector('.cs-option.focused') || menu.querySelector('.cs-option.active');
      if (focused) selectValue(focused.dataset.value, { instant: true });
    }
  };
  const selectValue = (v, { instant = false } = {}) => {
    if (selectEl.value === v) { close({ instant }); return; }
    selectEl.value = v;
    const selectedLabel = selectEl.selectedOptions[0]?.textContent || v || 'all';
    trackGoatCounterEvent(
      `trace-control/${encodeURIComponent(selectEl.id)}/${encodeURIComponent(v || 'all')}`,
      `Trace control: ${selectEl.id} · ${selectedLabel}`
    );
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    syncTrigger();
    close({ instant });
  };

  trigger.addEventListener('click', event => {
    const options = { instant: event.detail === 0 };
    if (wrap.classList.contains('cs-open')) close(options);
    else open(options);
  });
  menu.addEventListener('click', e => {
    const li = e.target.closest('.cs-option');
    if (li) selectValue(li.dataset.value);
  });

  new MutationObserver(syncTrigger).observe(selectEl, { childList: true });
  selectEl.addEventListener('change', syncTrigger);

  syncTrigger();
}

[els.benchFilter, els.modelFilter, els.agentFilter, els.expFilter,
 els.groupBy, els.sort].forEach(makeCustomSelect);

els.q.addEventListener('change', () => {
  if (els.q.value.trim()) {
    trackGoatCounterEvent('trace-search-used', 'Trace search used');
  }
});

load();
