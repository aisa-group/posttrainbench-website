// Landing page: fetch the corpus index, render aggregate stats, render
// a filterable + sortable run table that doubles as a leaderboard.

const DATA_BASE = (typeof window !== 'undefined' && window.PTB_DATA_BASE) || './data/';

const els = {
  q: document.getElementById('q'),
  expFilter: document.getElementById('experiment-filter'),
  benchFilter: document.getElementById('benchmark-filter'),
  agentFilter: document.getElementById('agent-filter'),
  sort: document.getElementById('sort'),
  runs: document.getElementById('runs'),
  empty: document.getElementById('empty'),
  loading: document.getElementById('loading'),
  resultCount: document.getElementById('result-count'),
  resetFilters: document.getElementById('reset-filters'),
  emptyReset: document.getElementById('empty-reset'),
};

let DATA = { runs: [], experiments: [], benchmarks: [], build_ts: null };

async function load() {
  let resp;
  try {
    resp = await fetch(`${DATA_BASE}index.json`, { cache: 'no-store' });
  } catch (e) {
    return showFatal(`Network error fetching the corpus index: ${e.message}`);
  }
  if (!resp.ok) {
    return showFatal(`Could not load <code>${DATA_BASE}index.json</code> (HTTP ${resp.status}). Run <code>build.py</code> first.`);
  }
  DATA = await resp.json();

  populateFilters();
  renderPageStats();
  els.loading.classList.add('hidden');
  render();
}

function showFatal(msg) {
  els.loading.classList.add('hidden');
  els.runs.innerHTML = `<p class="muted" style="padding:1rem 0">${msg}</p>`;
}

// ---------- Aggregate stats (hero) -------------------------------------

function renderPageStats() {
  const n = DATA.runs.length;
  const countEl = document.getElementById('page-head-count');
  if (countEl) countEl.textContent = `${n.toLocaleString()} ${n === 1 ? 'run' : 'runs'}`;
}

// ---------- Filter dropdowns -------------------------------------------

function populateFilters() {
  for (const exp of DATA.experiments) {
    const opt = document.createElement('option');
    opt.value = exp; opt.textContent = exp;
    els.expFilter.appendChild(opt);
  }
  for (const b of DATA.benchmarks) {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = prettyBenchmark(b);
    els.benchFilter.appendChild(opt);
  }
  const agents = [...new Set(DATA.runs.map(r => r.agent_model).filter(Boolean))].sort();
  for (const a of agents) {
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = prettyAgent(a);
    els.agentFilter.appendChild(opt);
  }
}

// ---------- Main render ------------------------------------------------

function filterAndSort() {
  const q = els.q.value.trim().toLowerCase();
  const expF = els.expFilter.value;
  const benchF = els.benchFilter.value;
  const agentF = els.agentFilter.value;
  const sort = els.sort.value;

  let rows = DATA.runs.filter(r => {
    if (expF && r.experiment !== expF) return false;
    if (benchF && r.benchmark !== benchF) return false;
    if (agentF && r.agent_model !== agentF) return false;
    if (q) {
      const hay = [r.run_id, r.experiment, r.benchmark, r.trained_model,
                   r.seed, r.agent_model, prettyAgent(r.agent_model),
                   prettyTrainedModel(r.trained_model), prettyBenchmark(r.benchmark),
                   r.contamination, r.disallowed_model]
                   .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  rows.sort(sorter(sort));
  return { rows, sort };
}

function render() {
  const { rows, sort } = filterAndSort();

  const total = DATA.runs.length;
  const filtered = rows.length;
  const anyFilter = els.q.value || els.expFilter.value || els.benchFilter.value || els.agentFilter.value;
  els.resultCount.textContent =
    anyFilter ? `${filtered.toLocaleString()} of ${total.toLocaleString()} runs` :
                `${total.toLocaleString()} runs`;
  els.resetFilters.classList.toggle('hidden', !anyFilter);

  if (rows.length === 0) {
    els.runs.innerHTML = '';
    els.empty.classList.remove('hidden');
    return;
  }
  els.empty.classList.add('hidden');

  // Compute a corpus-wide accuracy max so accuracy bars share a scale.
  const accMax = Math.max(0.01, ...DATA.runs.map(r => r.accuracy ?? 0));

  if (sort === 'experiment') {
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.experiment)) groups.set(r.experiment, []);
      groups.get(r.experiment).push(r);
    }
    els.runs.innerHTML = '';
    for (const [exp, list] of groups) {
      const section = document.createElement('section');
      section.className = 'exp-group';
      section.innerHTML = `
        <header class="exp-head">
          <span class="exp-name">${escapeHtml(exp)}</span>
          <span class="exp-meta">${list.length} run${list.length === 1 ? '' : 's'}</span>
        </header>`;
      section.appendChild(buildTable(list, accMax));
      els.runs.appendChild(section);
    }
  } else {
    els.runs.innerHTML = '';
    els.runs.appendChild(buildTable(rows, accMax));
  }
}

function buildTable(rows, accMax) {
  const t = document.createElement('table');
  t.className = 'runtable';
  t.innerHTML = `
    <thead><tr>
      <th class="col-task">task</th>
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
    tr.addEventListener('click', () => navigateRun(r.run_id));
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateRun(r.run_id); }
    });
    tr.innerHTML = `
      <td class="col-task">${taskCell(r)}</td>
      <td class="col-agent">${agentCell(r)}</td>
      <td class="col-acc">${accCell(r, accMax)}</td>
      <td class="col-num">${durationCell(r)}</td>
      <td class="col-num">${(r.num_turns != null && r.num_turns > 0) ? r.num_turns.toLocaleString() : '<span class="muted">—</span>'}</td>
      <td class="col-num">${fmtCost(r.total_cost_usd)}</td>
      <td class="col-verdict">${verdictDots(r)}</td>`;
    tbody.appendChild(tr);
  }
  return t;
}

function navigateRun(id) {
  window.location.href = `run.html?id=${encodeURIComponent(id)}`;
}

// ---------- Cell renderers --------------------------------------------

function taskCell(r) {
  const bench = prettyBenchmark(r.benchmark) || '?';
  const model = prettyTrainedModel(r.trained_model) || '';
  const seed = r.seed ? `<span class="seed-pill" title="seed">${escapeHtml(r.seed)}</span>` : '';
  return `<div class="task-cell">
    <div class="task-primary">${escapeHtml(bench)}</div>
    <div class="task-secondary">${escapeHtml(model)} ${seed}</div>
  </div>`;
}

function agentCell(r) {
  if (!r.agent_model) return '<span class="muted">—</span>';
  const pretty = prettyAgent(r.agent_model);
  // Pull out a trailing "(1M)" annotation so it can render as a small pill.
  const m = /^(.*?)\s+\(([^)]+)\)\s*$/.exec(pretty);
  if (m) {
    return `<span class="agent-name">${escapeHtml(m[1])}</span> <span class="agent-tag">${escapeHtml(m[2])}</span>`;
  }
  return `<span class="agent-name">${escapeHtml(pretty)}</span>`;
}

// Accuracy missing → no metrics.json → in practice, the agent didn't
// produce a `final_model/` so the eval harness never ran. Render an
// explicit "not evaluated" marker (with tooltip) rather than `—`, which
// would read as a generic missing value.
const NO_EVAL_TITLE =
  "Agent didn't produce a final_model — the evaluation harness never " +
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
  // The build script stores duration_ms (per-run sum) and time_taken (string).
  // Prefer time_taken (it's already formatted like "04:45:01"); fall back to ms.
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
  return '<span class="muted">—</span>';
}

// Cost is missing whenever a trace doesn't emit `result` events (older
// Claude Code container versions, runs killed mid-stream, Codex/opencode
// traces — they never include cost). Render as a help-cursor em-dash with
// a tooltip so the reader doesn't assume "$0 means free".
const COST_MISSING_TITLE =
  "Cost unknown — the trace doesn't include result events with token cost. " +
  "Common for runs killed early, older Claude Code containers, or Codex/opencode traces.";

function fmtCost(c) {
  if (c == null || c === 0) {
    return `<span class="muted cost-missing" data-tip="${COST_MISSING_TITLE}">—</span>`;
  }
  return '$' + Number(c).toFixed(2);
}

// Verdict rendering — designed for "scan for problems". Clean runs render
// as a near-invisible muted dot per axis; flagged runs render as a clay
// pill with a warning glyph + the axis name, so they jump out across a
// long table and you immediately see WHICH axis tripped (contam vs model).
const WARN_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`;

function verdictDots(r) {
  return `${verdictItem(r.contamination, /no contamination/i, 'contam', 'contamination')}${verdictItem(r.disallowed_model, /only allowed/i, 'model', 'disallowed model use')}`;
}

function verdictItem(text, okPattern, shortLabel, longLabel) {
  if (!text) {
    return `<span class="vdot unknown" title="${escapeHtml(longLabel)}: no judgement"></span>`;
  }
  if (okPattern.test(text)) {
    return `<span class="vdot ok" title="${escapeHtml(longLabel)}: ${escapeHtml(text)}"></span>`;
  }
  return `<span class="vflag" title="${escapeHtml(longLabel)}: ${escapeHtml(text)}">${WARN_SVG}<span>${shortLabel}</span></span>`;
}

// ---------- Sorting ----------------------------------------------------

function sorter(s) {
  switch (s) {
    case 'accuracy-desc': return (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1);
    case 'accuracy-asc':  return (a, b) => (a.accuracy ?? Infinity) - (b.accuracy ?? Infinity);
    case 'cost-desc':     return (a, b) => (b.total_cost_usd ?? 0) - (a.total_cost_usd ?? 0);
    case 'turns-desc':    return (a, b) => (b.num_turns ?? 0) - (a.num_turns ?? 0);
    case 'duration-desc': return (a, b) => (b.duration_ms ?? 0) - (a.duration_ms ?? 0);
    default: return (a, b) =>
      (a.experiment ?? '').localeCompare(b.experiment ?? '') ||
      (a.run_name ?? '').localeCompare(b.run_name ?? '');
  }
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
    ifeval: 'IFEval', gpqa: 'GPQA', livecodebench: 'LiveCodeBench',
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
  s = s.replace(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/i,
    (_, fam, maj, min) => `Claude ${cap(fam)} ${maj}.${min}`);
  s = s.replace(/^gpt-([\d.]+)(?:-(.+))?$/i, (_, ver, tail) =>
    `GPT ${ver}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
  s = s.replace(/^gemini-([\d.]+)(?:-(.+))?$/i, (_, ver, tail) =>
    `Gemini ${ver}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
  return s + annotation;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// ---------- Misc -------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function clearFilters() {
  els.q.value = '';
  els.expFilter.value = '';
  els.benchFilter.value = '';
  els.agentFilter.value = '';
  render();
}

[els.q, els.expFilter, els.benchFilter, els.agentFilter, els.sort]
  .forEach(el => el.addEventListener('input', render));
els.resetFilters.addEventListener('click', clearFilters);
els.emptyReset.addEventListener('click', clearFilters);

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
  selectEl.classList.add('cs-native');     // visually hidden, focusable

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
  menu.hidden = true;
  wrap.appendChild(trigger);
  wrap.appendChild(menu);

  const valueEl = trigger.querySelector('.cs-value');
  const syncTrigger = () => {
    const opt = selectEl.selectedOptions[0];
    valueEl.textContent = opt ? opt.textContent : '';
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
  const open = () => {
    rebuildMenu();
    menu.hidden = false;
    wrap.classList.add('cs-open');
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
  };
  const close = () => {
    menu.hidden = true;
    wrap.classList.remove('cs-open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onOutside);
    document.removeEventListener('keydown', onKey);
    trigger.focus();
  };
  const onOutside = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
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
      if (focused) selectValue(focused.dataset.value);
    }
  };
  const selectValue = (v) => {
    if (selectEl.value === v) { close(); return; }
    selectEl.value = v;
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    syncTrigger();
    close();
  };

  trigger.addEventListener('click', () => wrap.classList.contains('cs-open') ? close() : open());
  menu.addEventListener('click', e => {
    const li = e.target.closest('.cs-option');
    if (li) selectValue(li.dataset.value);
  });

  // Refresh whenever options are appended (filters populate after load).
  new MutationObserver(syncTrigger).observe(selectEl, { childList: true });
  // Keep the trigger in sync with programmatic value changes (clearFilters).
  selectEl.addEventListener('change', syncTrigger);

  syncTrigger();
}

[els.expFilter, els.benchFilter, els.agentFilter, els.sort].forEach(makeCustomSelect);

load();
