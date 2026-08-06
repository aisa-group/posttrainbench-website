// Run detail page: fetch the per-run JSON, render all sections + mini charts.

const params = new URLSearchParams(window.location.search);
const RUN_ID = params.get('id');
const CATALOG = window.PTB_Catalog;
const {
  prettyAgentForRun,
  prettyBenchmark,
  prettyTrainedModel,
} = CATALOG;
// Base URL for the JSON data — local "./data/" by default, can be set to
// an external host (HF Datasets, R2, S3) by overriding window.PTB_DATA_BASE
// in config.js.
const DATA_BASE = (typeof window !== 'undefined' && window.PTB_DATA_BASE) || './data/';

const els = {
  topbarMeta: document.getElementById('topbar-meta'),
  tabNav: document.getElementById('tab-nav'),
  layout: document.getElementById('run-layout'),
  backLink: document.getElementById('back-link'),

  // Left rail summary
  summaryTitle: document.getElementById('summary-title'),
  summarySub: document.getElementById('summary-sub'),
  runIdText: document.getElementById('run-id-text'),
  runIdBox: document.getElementById('run-id-box'),
  copyIdBtn: document.getElementById('copy-id-btn'),
  copyFeedback: document.getElementById('copy-feedback'),
  scoreBig: document.getElementById('score-big'),
  scoreSub: document.getElementById('score-sub'),
  summaryStats: document.getElementById('summary-stats'),
  summaryQuick: document.getElementById('summary-quick'),
  summaryDetails: document.getElementById('summary-details'),
  summaryDetailsToggle: document.getElementById('summary-details-toggle'),
  linkRaw: document.getElementById('link-raw'),

  summaryThemes: document.getElementById('summary-themes'),

  // Judge verdicts (in Judge section)
  judgeVerdicts: document.getElementById('judge-verdicts'),

  // Center sections
  trace: document.getElementById('trace'),
  judge: document.getElementById('judge'),
  wsTree: document.getElementById('ws-tree'),
  wsFile: document.getElementById('ws-file'),
  wsFileContent: document.getElementById('ws-file-content'),
  wsBack: document.getElementById('ws-back'),
  workspaceLayout: document.getElementById('workspace-layout'),

  // Right rail
  metricGridRail: document.getElementById('metric-grid-rail'),
  metricGridModal: document.getElementById('metric-grid-modal'),
  metricsModal: document.getElementById('metrics-modal'),
  showAllBtn: document.getElementById('show-all-metrics'),
  railEmpty: document.getElementById('rail-empty'),

  // Token usage (now in the left rail summary card)
  summaryTokensBlock: document.getElementById('summary-tokens-block'),
  summaryTokens: document.getElementById('summary-tokens'),

  eventCount: document.getElementById('event-count'),
  expandOutputs: document.getElementById('expand-outputs'),
  jumpTurn: document.getElementById('jump-turn'),
  traceViewFocus: document.getElementById('trace-view-focus'),
  traceViewAll: document.getElementById('trace-view-all'),
};

let RECORD = null;
let WORKSPACE = null;
let WORKSPACE_LOADED = false;
let RAIL_CHARTS = [];           // Chart instances pinned to the right rail
let MODAL_CHARTS = [];          // Chart instances inside the show-all modal
let MODAL_CLOSE_TIMER = null;
let TRACE_START_MS = null;      // first event ts in ms, for elapsed formatting
let TRACE_VIEW = params.get('view') === 'all' ? 'all' : 'focus';
const DATA_REQUEST_TIMEOUT_MS = 30000;
const CHART_LOAD_TIMEOUT_MS = 8000;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');

function trackGoatCounterEvent(path, title) {
  if (typeof window.goatcounter?.count !== 'function') return;
  window.goatcounter.count({ path, title, event: true });
}

async function load() {
  try {
    if (!RUN_ID) {
      els.trace.innerHTML = '<p class="muted">No run id in URL. Go back to the index.</p>';
      return;
    }
    RECORD = await fetchJsonWithTimeout(`${DATA_BASE}${encodeURIComponent(RUN_ID)}.json`);
    if (!RECORD || !RECORD.meta || !RECORD.summary || !RECORD.index_row || !Array.isArray(RECORD.events)) {
      throw new Error('The trace data has an invalid format.');
    }
    computeTraceStart();
    renderTopbar();
    renderSummary();
    setupReturnContext();
    renderTrace();
    renderJudge();
    if ((RECORD.system_monitor || []).length) whenChartReady(renderMiniCharts);
    else renderMiniCharts();
    renderMiniTokens();
    setupTabs();
    setupCopyId();
    setupSummaryDetails();
    setupTraceControls();
    setupMetricsModal();
  } catch (error) {
    console.error(`Failed to load trace ${RUN_ID || '(missing id)'}:`, error);
    showRunLoadError(error);
  } finally {
    // Always tear down the loading shield — even if rendering errored,
    // showing the partially-rendered page is better than a stuck overlay.
    hidePageLoading();
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

function showRunLoadError(error) {
  const message = error.status === 404
    ? `Run ${RUN_ID} was not found.`
    : error.code === 'ETIMEDOUT'
      ? 'The trace request timed out.'
      : 'Could not load this trace. Check your connection and try again.';

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
  els.trace.replaceChildren(box);
}

function hidePageLoading() {
  const loader = document.getElementById('page-loading');
  if (!loader) return;
  // A short delay lets the layout and chart-initial-paint settle so the
  // reveal feels like one finished page rather than a snap-then-pop.
  requestAnimationFrame(() => {
    loader.classList.add('hidden');
    setTimeout(() => loader.remove(), 350);
  });
}

function computeTraceStart() {
  for (const ev of RECORD.events) {
    if (ev.ts) {
      const t = parseTraceTs(ev.ts);
      if (!isNaN(t)) { TRACE_START_MS = t; return; }
    }
  }
  // Some traces (e.g. codex stream-JSON) have events without timestamps —
  // every ev.ts is null. Without a start, the metric chart's labels would
  // fall back to raw ISO strings ("2026-04-06T14:30:05Z") jammed onto the
  // x-axis. Fall back to the first system_monitor sample's ts so the
  // chart still renders as HH:MM:SS relative time.
  const samples = RECORD.system_monitor || [];
  for (const s of samples) {
    if (s.ts) {
      const t = parseTraceTs(s.ts);
      if (!isNaN(t)) { TRACE_START_MS = t; return; }
    }
  }
}

function whenChartReady(fn, deadline = Date.now() + CHART_LOAD_TIMEOUT_MS) {
  if (typeof Chart !== 'undefined') {
    // Canvas text is rasterized at draw time and will not repaint itself
    // when a webfont arrives later. Wait for the chart's actual typeface so
    // its labels match the rest of the viewer instead of keeping a wider
    // fallback-monospace rendering.
    const fontReady = document.fonts?.load
      ? document.fonts.load('11px "JetBrains Mono"')
      : Promise.resolve();
    fontReady.catch(() => []).then(() => {
      try {
        fn();
      } catch (error) {
        console.error('Failed to render system metrics:', error);
        setMetricsUnavailable('System metrics could not be rendered.');
      }
    });
    return;
  }
  if (Date.now() >= deadline) {
    console.error('Chart.js did not load before the metrics timeout.');
    setMetricsUnavailable('System metrics are unavailable because the chart library did not load.');
    return;
  }
  setTimeout(() => whenChartReady(fn, deadline), 80);
}

// ---------- Topbar / left-rail summary -----------------------------------

function renderTopbar() {
  // Topbar-meta was previously showing "claude_code · built ...". The
  // build timestamp and trace format aren't useful at-a-glance — they
  // already live in the summary card and the URL — so the topbar stays
  // clean and reserves the right-hand space for the theme toggle.
  els.topbarMeta.textContent = '';
}

function renderSummary() {
  const m = RECORD.meta;
  const s = RECORD.summary;
  const ix = RECORD.index_row;

  // Lead with the actor. The benchmark and assigned base model are context,
  // not the identity of the run.
  const agentName = prettyAgentForRun({
    agent_model: (s.agent_models || [])[0],
    experiment: m.experiment,
  }) || '-';
  els.summaryTitle.textContent = agentName;
  const subBits = [];
  if (m.benchmark) subBits.push(prettyBenchmark(m.benchmark));
  if (m.trained_model) subBits.push(prettyTrainedModel(m.trained_model));
  if (m.seed) subBits.push('seed ' + m.seed);
  els.summarySub.textContent = subBits.join(' · ');

  // Run ID with copy button
  els.runIdText.textContent = m.run_id;

  const scoreBarFill = document.getElementById('score-bar-fill');
  const scoreBar = document.getElementById('score-bar');
  const NO_EVAL_TITLE =
    "Agent didn't produce a final_model. The evaluation harness never " +
    "ran, so this run has no metrics.json.";
  if (ix.accuracy != null) {
    els.scoreBig.textContent = (ix.accuracy * 100).toFixed(1);
    els.scoreBig.classList.remove('score-big-empty');
    // Drop the redundant "accuracy" word — the big % already signals
    // what it is. Just show statistical context.
    const sub = [];
    if (ix.stderr != null) sub.push('± ' + (ix.stderr * 100).toFixed(2));
    if (RECORD.metrics?.n_examples) sub.push(RECORD.metrics.n_examples + ' samples');
    els.scoreSub.textContent = sub.join(' · ');
    // Bar is sized to the absolute 0–100% scale; gives instant visual
    // anchor of where this score sits without external context.
    if (scoreBar) scoreBar.style.display = '';
    if (scoreBarFill) {
      scoreBarFill.style.setProperty('--score-scale', String(Math.min(1, Math.max(0, ix.accuracy))));
    }
  } else {
    // No metrics.json — render an explicit "not evaluated" state instead
    // of a bare em-dash. Hide the bar (irrelevant), dim the big number.
    els.scoreBig.textContent = '-';
    els.scoreBig.classList.add('score-big-empty');
    els.scoreSub.innerHTML =
      `<span class="no-eval-marker" data-tip="${escapeHtml(NO_EVAL_TITLE)}">not evaluated</span>`;
    if (scoreBar) scoreBar.style.display = 'none';
  }

  // Each stat is `[label, valueHtml]` — valueHtml is pre-escaped (or
  // intentional HTML for the cost-missing tooltip case). Keep the
  // template literal below from escaping so the cost tooltip survives.
  const COST_MISSING_TITLE =
    "Cost unknown. The trace doesn't include result events with token " +
    "cost. Common for runs killed early, older Claude Code containers, " +
    "or Codex/opencode traces.";
  const costHtml = (ix.total_cost_usd != null && ix.total_cost_usd > 0)
    ? '$' + Number(ix.total_cost_usd).toFixed(2)
    : `<span class="cost-missing" data-tip="${escapeHtml(COST_MISSING_TITLE)}">-</span>`;

  const harness = prettyHarness(m.trace_format);
  const quickBits = [humanDuration(ix.time_taken, ix.duration_ms)];
  if (ix.num_turns != null && ix.num_turns > 0) quickBits.push(`${ix.num_turns} turns`);
  els.summaryQuick.textContent = quickBits.join(' · ');

  const stats = [];
  // Harness on its own row so the agent value stays single-line and the
  // dl rhythm is consistent — previously "Claude Opus 4.7 Claude Code"
  // overflowed and wrapped, breaking alignment with the other stats.
  if (harness) stats.push(['harness', escapeHtml(harness)]);
  stats.push(
    ['time budget', escapeHtml(ix.time_budget_h ? ix.time_budget_h + 'h' : '-')],
    ['duration',    escapeHtml(humanDuration(ix.time_taken, ix.duration_ms))],
    ['turns',       escapeHtml((ix.num_turns != null && ix.num_turns > 0) ? String(ix.num_turns) : '-')],
    ['sessions',    escapeHtml(String(ix.session_count ?? '-'))],
    ['cost',        costHtml],
  );
  els.summaryStats.innerHTML = stats.map(([k, v]) =>
    `<dt>${k}</dt><dd>${v}</dd>`).join('');

  // Per-theme accuracy: collapsed by default. Only HealthBench-style
  // benchmarks emit `by_theme`, so we show the disclosure summary with a
  // theme count; users expand if they want to drill in.
  const themes = RECORD.metrics?.by_theme;
  const themesCount = document.getElementById('summary-themes-count');
  const themesBody = document.getElementById('summary-themes-body');
  if (themes && typeof themes === 'object' && Object.keys(themes).length) {
    const entries = Object.entries(themes).sort((a, b) => b[1] - a[1]);
    themesCount.textContent = `${entries.length} themes`;
    themesBody.innerHTML = entries.map(([k, v]) => {
      const pct = (v * 100).toFixed(1) + '%';
      const w = Math.min(100, v * 100).toFixed(1);
      return `<div class="theme-row"><span class="theme-name">${escapeHtml(k)}</span><span class="theme-pct">${pct}</span><div class="theme-bar"><div style="width:${w}%"></div></div></div>`;
    }).join('');
    els.summaryThemes.classList.remove('hidden');
  } else {
    themesBody.innerHTML = '';
    themesCount.textContent = '';
    els.summaryThemes.classList.add('hidden');
  }

  // "Download trace" target. In prod, PTB_RAW_BASE points at the HF
  // dataset's tree/main/ view — we link to the run's folder so the
  // visitor sees solve_out.txt + judge_output.json + system_monitor.log
  // + the task workspace alongside the parsed trace. Locally there's no
  // folder UI to link to, so we fall back to downloading the parsed JSON.
  const rawBase = (typeof window !== 'undefined' && window.PTB_RAW_BASE) || null;
  const externalIcon = `<svg class="btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;
  const downloadIcon = `<svg class="btn-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
  if (rawBase && m.experiment && m.run_name) {
    els.linkRaw.href = `${rawBase.replace(/\/+$/, '')}/${encodeURIComponent(m.experiment)}/${encodeURIComponent(m.run_name)}`;
    els.linkRaw.target = '_blank';
    els.linkRaw.rel = 'noopener';
    els.linkRaw.removeAttribute('download');
    els.linkRaw.innerHTML = `${externalIcon}<span>Browse run files</span>`;
  } else {
    els.linkRaw.href = `${DATA_BASE}${encodeURIComponent(RUN_ID)}.json`;
    els.linkRaw.setAttribute('download', `${RUN_ID}.json`);
    els.linkRaw.innerHTML = `${downloadIcon}<span>Download trace</span>`;
  }
}

function safeReturnUrl() {
  const value = params.get('return');
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    const landingPath = new URL('index.html', window.location.href).pathname;
    return url.origin === window.location.origin && url.pathname === landingPath ? url : null;
  } catch {
    return null;
  }
}

function setupReturnContext() {
  const returnUrl = safeReturnUrl();
  if (!returnUrl) return;
  els.backLink.href = returnUrl.href;
  els.backLink.lastChild.textContent = ' Back to results';
}

function setupSummaryDetails() {
  els.summaryDetailsToggle.addEventListener('click', () => {
    const open = !els.summaryDetails.classList.contains('mobile-open');
    els.summaryDetails.classList.toggle('mobile-open', open);
    els.summaryDetailsToggle.setAttribute('aria-expanded', String(open));
  });
}

// Map trace_format to the autonomous-agent harness that produced it.
function prettyHarness(fmt) {
  if (!fmt) return '';
  const map = {
    claude_code: 'Claude Code',
    'claude-code': 'Claude Code',
    claude: 'Claude Code',
    codex: 'Codex CLI',
    opencode: 'OpenCode',
    cursor: 'Cursor',
    cursor_cli: 'Cursor',
    'cursor-cli': 'Cursor',
  };
  return map[String(fmt).toLowerCase()] || fmt;
}

// Re-render the trace when the expand-outputs toggle changes, and wire up
// the jump-to-turn input + click-on-marker permalink behavior.
function setupTraceControls() {
  els.expandOutputs.addEventListener('change', () => renderTrace({ preservePosition: true }));

  const setTraceView = view => {
    if (TRACE_VIEW === view) return;
    TRACE_VIEW = view;
    const url = new URL(window.location.href);
    if (view === 'all') url.searchParams.set('view', 'all');
    else url.searchParams.delete('view');
    history.replaceState(null, '', url);
    renderTrace({ preservePosition: true });
  };
  els.traceViewFocus.addEventListener('click', () => setTraceView('focus'));
  els.traceViewAll.addEventListener('click', () => setTraceView('all'));

  // Per-block output expand: clicking a badged Output header toggles just
  // that card between the height-capped view and full height. Only cards
  // whose output actually overflows the cap get the badge + click handling
  // (see markClippedOutputs), so short outputs never present a dead toggle.
  // The global "expand outputs" checkbox re-renders and supersedes these.
  els.trace.addEventListener('click', e => {
    const head = e.target.closest('.tool-result-head');
    if (!head || !head.querySelector('.clip-more')) return;
    const card = head.closest('.tool-call');
    if (card) card.classList.toggle('expanded');
  });

  // Jump to turn N: Enter or input commit scrolls to that turn anchor.
  const jump = () => {
    const n = parseInt(els.jumpTurn.value, 10);
    if (!Number.isFinite(n) || n < 1) return;
    const target = document.getElementById('turn-' + n);
    if (!target) {
      els.jumpTurn.classList.add('jump-miss');
      setTimeout(() => els.jumpTurn.classList.remove('jump-miss'), 600);
      return;
    }
    target.scrollIntoView({ block: 'center' });
    flashEvent(target);
  };
  els.jumpTurn.addEventListener('change', jump);
  els.jumpTurn.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); jump(); }
  });

  // Click any event's marker column to copy a permalink to that event.
  els.trace.addEventListener('click', e => {
    const marker = e.target.closest('.event-marker');
    if (!marker) return;
    const anchor = marker.dataset.anchor;
    if (!anchor) return;
    const url = new URL(window.location.href);
    // Event anchors belong to the trace tab. Keep tab state in the query
    // string so it can never overwrite the #turn-… / #ev-… fragment.
    url.searchParams.delete('tab');
    url.hash = anchor;
    history.replaceState(null, '', url.toString());
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url.toString()).catch(() => {});
    marker.classList.add('linked');
    setTimeout(() => marker.classList.remove('linked'), 1200);
  });

  // If the URL already has a #turn-N or #ev-… hash on load, scroll to it.
  // (Wait a tick so the trace has rendered.)
  const initialAnchor = eventAnchorFromHash();
  if (initialAnchor) {
    setTimeout(() => {
      const target = document.getElementById(initialAnchor);
      if (target) { target.scrollIntoView({ block: 'center' }); flashEvent(target); }
    }, 50);
  }
}

// The URL fragment is reserved for event permalinks. Validate it before
// touching the DOM: tab state used to produce #tab=trace, which both
// clobbered event links and became an invalid querySelector expression.
function eventAnchorFromHash(hash = window.location.hash) {
  if (!hash || hash === '#') return null;
  let id;
  try {
    id = decodeURIComponent(hash.slice(1));
  } catch {
    return null;
  }
  return /^(?:turn-\d+|ev-[A-Za-z0-9_-]+)$/.test(id) ? id : null;
}

const eventFlashTimers = new WeakMap();
function flashEvent(el) {
  const currentTimer = eventFlashTimers.get(el);
  if (currentTimer) clearTimeout(currentTimer);
  el.classList.add('event-flash');
  const timer = setTimeout(() => {
    el.classList.remove('event-flash');
    eventFlashTimers.delete(el);
  }, 1200);
  eventFlashTimers.set(el, timer);
}

function setupCopyId() {
  let resetTimer = null;
  const copy = () => {
    const text = RECORD.meta.run_id;
    const finish = () => {
      // A repeated click simply extends the readable state. Transitions retarget
      // naturally, so no keyframe restart or forced layout is necessary.
      if (resetTimer !== null) clearTimeout(resetTimer);
      els.runIdBox.classList.add('copied');
      resetTimer = setTimeout(() => {
        els.runIdBox.classList.remove('copied');
        resetTimer = null;
      }, 1100);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(finish).catch(finish);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      ta.remove();
      finish();
    }
  };
  els.runIdBox.addEventListener('click', copy);
  els.copyIdBtn.addEventListener('click', e => { e.stopPropagation(); copy(); });
}

// ---------- Trace --------------------------------------------------------

// Focus keeps the narrative readable: initialization stays visible, noisy
// system records are omitted, and thoughts start closed. Full restores the
// forensic stream. Output height remains an independent choice.
function renderTrace({ preservePosition = false } = {}) {
  const anchor = preservePosition ? captureTraceAnchor() : null;
  const events = RECORD.events;
  const wantSys = TRACE_VIEW === 'all';
  const expandResults = els.expandOutputs.checked;

  // Pair tool_use → tool_result so they render together.
  const resultByUseId = new Map();
  for (const ev of events) {
    if (ev.type === 'user' && Array.isArray(ev.blocks)) {
      for (const b of ev.blocks) {
        if (b && b.type === 'tool_result' && b.tool_use_id) {
          resultByUseId.set(b.tool_use_id, { ev, block: b });
        }
      }
    }
  }
  const skipUserEv = new Set();
  for (const { ev } of resultByUseId.values()) {
    if (ev.blocks.every(b => b && b.type === 'tool_result' && resultByUseId.has(b.tool_use_id))) {
      skipUserEv.add(ev);
    }
  }

  // Pre-compute turn numbers for assistant-style events (the user's mental
  // model is "the agent's Nth move").
  let turnCounter = 0;
  const turnNumByUuid = new Map();
  for (const ev of events) {
    const isAgentTurn = ev.type === 'assistant' || (ev.type === 'codex_item' &&
      (ev.subtype === 'agent_message' || ev.subtype === 'assistant_message' ||
       ev.subtype === 'command_execution' || ev.subtype === 'file_change' ||
       ev.subtype === 'web_search'));
    if (isAgentTurn) {
      turnCounter++;
      turnNumByUuid.set(ev, turnCounter);
    }
  }

  const sessionCount = RECORD.summary.session_count || 1;
  const displayTurns = RECORD.index_row.num_turns ?? turnCounter;
  els.eventCount.innerHTML = `<span>${Number(displayTurns).toLocaleString()} turn${Number(displayTurns) === 1 ? '' : 's'} · ${sessionCount} session${sessionCount === 1 ? '' : 's'}</span><span class="trace-raw-count">${events.length.toLocaleString()} source events</span>`;
  els.eventCount.title = `${events.length.toLocaleString()} source events`;
  els.traceViewFocus.classList.toggle('active', TRACE_VIEW === 'focus');
  els.traceViewAll.classList.toggle('active', TRACE_VIEW === 'all');
  els.traceViewFocus.setAttribute('aria-pressed', String(TRACE_VIEW === 'focus'));
  els.traceViewAll.setAttribute('aria-pressed', String(TRACE_VIEW === 'all'));

  const out = [];
  let lastSession = -1;
  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const ev = events[eventIndex];
    if (ev.type === 'system' && !wantSys && ev.subtype !== 'init') continue;
    if (skipUserEv.has(ev)) continue;

    if (ev.session_idx !== lastSession && lastSession >= 0) {
      out.push(renderSessionBanner(ev));
    }
    lastSession = ev.session_idx;

    out.push(renderEvent(ev, resultByUseId, expandResults, turnNumByUuid.get(ev), eventIndex));
  }
  els.trace.innerHTML = out.join('');
  if (anchor) restoreTraceAnchor(anchor);
  markClippedOutputs();
}

function captureTraceAnchor() {
  const stickyBottom = Math.max(0, els.tabNav.getBoundingClientRect().bottom) + 8;
  const visible = [...els.trace.querySelectorAll('.event')]
    .find(event => event.getBoundingClientRect().bottom > stickyBottom);
  if (!visible) return null;
  return { id: visible.id, offset: visible.getBoundingClientRect().top - stickyBottom };
}

function restoreTraceAnchor(anchor) {
  requestAnimationFrame(() => {
    const target = document.getElementById(anchor.id);
    if (!target) return;
    const stickyBottom = Math.max(0, els.tabNav.getBoundingClientRect().bottom) + 8;
    const delta = target.getBoundingClientRect().top - stickyBottom - anchor.offset;
    if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, behavior: 'instant' });
  });
}

// Badge the tool cards whose output actually overflows the 280px height cap
// with a "show all" affordance in the Output header — short outputs get no
// badge and no toggle, so the affordance is never a dead control. Runs a
// frame after render so heights are measurable; a single read-only layout
// pass is cheap even on 2k-event traces. When the global "expand outputs"
// checkbox is on, nothing overflows and no badges appear — correct, since
// everything is already full height.
function markClippedOutputs() {
  requestAnimationFrame(() => {
    document.querySelectorAll('#trace .tool-call').forEach(card => {
      const body = card.querySelector('.tool-result-body');
      const head = card.querySelector('.tool-result-head');
      if (!body || !head) return;
      const clipped = body.scrollHeight > body.clientHeight + 4;
      const badge = head.querySelector('.clip-more');
      if (clipped && !badge) {
        card.classList.add('clipped');
        const b = document.createElement('span');
        b.className = 'clip-more';
        head.appendChild(b);
        head.setAttribute('data-tip', 'Toggle full output');
      } else if (!clipped && badge && !card.classList.contains('expanded')) {
        card.classList.remove('clipped');
        badge.remove();
        head.removeAttribute('data-tip');
      }
    });
  });
}

function renderSessionBanner(ev) {
  const sess = RECORD.sessions[ev.session_idx];
  const n = ev.session_idx + 1;
  const total = RECORD.summary.session_count;
  // Heavier visual break than the previous one-line banner — a numbered
  // chip flanked by horizontal rules so the eye lands on it.
  return `<div class="session-divider session-${ev.session_idx % 5}" id="session-${n}">
    <span class="session-rule"></span>
    <div class="session-chip">
      <span class="session-chip-n">Session ${n}</span>
      <span class="session-chip-total">of ${total}</span>
    </div>
    <div class="session-chip-meta">
      ${sess && sess.model ? `<span>${escapeHtml(sess.model)}</span>` : ''}
      ${sess && sess.ts_start ? `<span class="muted">${escapeHtml(formatEventTime(sess.ts_start).time || sess.ts_start)}</span>` : ''}
    </div>
    <span class="session-rule"></span>
  </div>`;
}

function renderEvent(ev, resultByUseId, expandResults, turnNum, eventIndex) {
  let roleClass = '';
  let markerLabel = '';
  let markerNum = '';
  if (turnNum != null) {
    markerNum = `<div class="turn-num">${turnNum}</div>`;
  } else if (ev.type === 'system' && ev.subtype === 'init') {
    markerLabel = '<div class="turn-role">start</div>';
    roleClass = 'role-system';
  } else if (ev.type === 'system') {
    // Map long subtypes to short marker labels — the role column is narrow.
    const short = ({
      task_started: 'task',
      task_notification: 'task',
    })[ev.subtype] || (ev.subtype || 'sys').slice(0, 6);
    markerLabel = `<div class="turn-role" title="${escapeHtml(ev.subtype || 'system')}">${escapeHtml(short)}</div>`;
    roleClass = 'role-system';
  } else if (ev.type === 'result') {
    markerLabel = '<div class="turn-role">end</div>';
    roleClass = 'role-end';
  } else if (ev.type === 'user') {
    markerLabel = '<div class="turn-role">user</div>';
    roleClass = 'role-user';
  } else {
    markerLabel = '<div class="turn-role">·</div>';
  }
  const cls = `event session-${(ev.session_idx ?? 0) % 5}${roleClass ? ' ' + roleClass : ''}`;
  const tsParts = ev.ts ? formatEventTime(ev.ts) : null;
  // Each event gets an anchor ID so users can share permalinks.
  // Agent turns use #turn-N; other events use a stable role-based ID.
  const anchorId = turnNum != null
    ? `turn-${turnNum}`
    : `ev-${ev.session_idx ?? 0}-${ev.type}-${(ev.uuid || ev.ts || eventIndex).toString().replace(/[^A-Za-z0-9_-]/g, '').slice(-8) || eventIndex}`;
  // Marker: turn # (or role label) → relative time. The displayed time is
  // already trace-relative (first event = 00:00:00) so the redundant
  // "+elapsed" badge is gone. Wall-clock + date move to the hover tooltip.
  // Clicking the marker copies a permalink to this event.
  const tsTitle = tsParts
    ? `${tsParts.wall || ''}${tsParts.date ? ' · ' + tsParts.date : ''} (wall-clock)`
    : '';
  const marker = `<aside class="event-marker" data-anchor="${anchorId}" title="Copy link to this event">
    ${markerNum}${markerLabel}
    ${tsParts ? `<div class="ev-time" title="${escapeHtml(tsTitle)}"><span class="ev-time-full">${escapeHtml(tsParts.time || '')}</span><span class="ev-time-short">${escapeHtml((tsParts.time || '').slice(0, 5))}</span></div>` : ''}
    ${ev.parent_tool_use_id ? `<div class="ev-sub-tag">sub-agent</div>` : ''}
  </aside>`;

  let body = '';
  if (ev.type === 'system' && ev.subtype === 'init') {
    const sess = RECORD.sessions[ev.session_idx] || {};
    // Orient the reader at the run's opening: who's running, where,
    // under what mode, with which tool set. This is the prime real
    // estate on the page — fill it.
    const facts = [];
    if (sess.model) facts.push(['agent', `<strong>${escapeHtml(sess.model)}</strong>`]);
    if (sess.cwd) facts.push(['cwd', `<code>${escapeHtml(sess.cwd)}</code>`]);
    if (sess.permission_mode) facts.push(['permission', `<code>${escapeHtml(sess.permission_mode)}</code>`]);
    const tools = Array.isArray(sess.tools) ? sess.tools : [];
    if (tools.length) facts.push(['tools', `${tools.length} <span class="muted">(${escapeHtml(tools.slice(0, 6).join(', '))}${tools.length > 6 ? ', …' : ''})</span>`]);
    body = `<div class="session-init-block">
      <div class="session-init-head">Session start</div>
      <dl class="session-init-grid">
        ${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
      </dl>
    </div>`;
  } else if (ev.type === 'system') {
    // Render the useful task_* fields inline rather than dumping raw JSON.
    if (ev.subtype === 'task_started') {
      const desc = ev.raw?.description || '(no description)';
      const ttype = ev.raw?.task_type ? ` <span class="muted">(${escapeHtml(ev.raw.task_type)})</span>` : '';
      body = `<div class="block-label">${ICON.tool} Sub-agent started${ttype}</div>
              <div class="block-card agent-text">${escapeHtml(desc)}</div>`;
    } else if (ev.subtype === 'task_notification') {
      const status = ev.raw?.status ? `<span class="chip ${ev.raw.status === 'completed' ? 'good' : 'accent'}">${escapeHtml(ev.raw.status)}</span>` : '';
      const summary = ev.raw?.summary || '(no summary)';
      body = `<div class="block-label">${ICON.output} Sub-agent update ${status}</div>
              <div class="block-card agent-text">${escapeHtml(summary)}</div>`;
    } else {
      body = `<details><summary class="muted" style="cursor:pointer;font-size:0.72rem">${escapeHtml(ev.subtype || 'system')}</summary><pre class="muted" style="font-size:0.72rem;margin-top:4px">${escapeHtml(JSON.stringify(ev.raw, null, 2))}</pre></details>`;
    }
  } else if (ev.type === 'result') {
    const meta = [
      ev.duration_ms ? msToHms(ev.duration_ms) : null,
      ev.num_turns != null ? ev.num_turns + ' turns' : null,
      ev.total_cost_usd != null ? '$' + Number(ev.total_cost_usd).toFixed(2) : null,
      ev.stop_reason || null,
    ].filter(Boolean);
    body = `
      <div class="block-label">${ICON.output} Session ended</div>
      ${meta.length ? `<div class="result-meta muted">${meta.map(escapeHtml).join(' · ')}</div>` : ''}
      ${ev.result_text ? `<div class="block-text">${escapeHtml(ev.result_text)}</div>` : ''}
    `;
  } else if (ev.type === 'codex_item') {
    body = renderCodexItem(ev.item, expandResults);
  } else if (Array.isArray(ev.blocks)) {
    body = ev.blocks.map(b => renderBlock(b, resultByUseId, expandResults)).join('');
  }

  if (!body.trim()) {
    if (TRACE_VIEW === 'focus') return '';
    body = `<details><summary class="muted" style="cursor:pointer;font-size:0.72rem">Raw ${escapeHtml(ev.type || 'event')}</summary><pre class="muted" style="font-size:0.72rem;margin-top:4px">${escapeHtml(JSON.stringify(ev.raw ?? ev, null, 2))}</pre></details>`;
  }

  return `<article id="${anchorId}" class="${cls}">${marker}<div class="event-body">${body}</div></article>`;
}

const ICON = {
  thought: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>',
  tool: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
  output: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  text: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

function renderBlock(block, resultByUseId, expandResults) {
  if (!block || typeof block !== 'object') return '';
  switch (block.type) {
    case 'text':
      // Agent message — bordered card, same shape as other blocks.
      return `<div class="block-card agent-text">${mdLite(block.text || '')}</div>`;
    case 'thinking':
      return `<details class="block-card agent-thinking" ${TRACE_VIEW === 'all' ? 'open' : ''}><summary>${ICON.thought} <span>Thought</span></summary><div class="thinking-body">${mdLite(block.thinking || '')}</div></details>`;
    case 'tool_use': {
      const pair = resultByUseId.get(block.id);
      return renderToolCall(block, pair, expandResults);
    }
    case 'tool_result':
      return `<div class="standalone-output"><div class="block-label">${ICON.output} Output${block.is_error ? ' · error' : ''}</div>${renderToolResultBody(block)}</div>`;
    case 'tool_reference':
      return `<div class="muted block">tool_reference: ${escapeHtml(block.tool_name || '')}</div>`;
    default:
      return `<div class="muted block" style="font-size:0.72rem">[block ${escapeHtml(block.type || 'unknown')}]</div>`;
  }
}

function renderToolCall(block, pair, expandResults) {
  const name = block.name || 'tool';
  let argsHtml = '';
  if (name === 'TodoWrite' && block.input && Array.isArray(block.input.todos)) {
    argsHtml = renderTodos(block.input.todos);
  } else if (name === 'Bash' && block.input && typeof block.input.command === 'string') {
    argsHtml = `<div class="bash-cmd">${escapeHtml(block.input.command)}</div>`;
    if (block.input.description) {
      argsHtml += `<div class="muted" style="font-size:0.72rem;margin-top:4px">${escapeHtml(block.input.description)}</div>`;
    }
  } else if (name === 'Read' && block.input && typeof block.input.file_path === 'string') {
    argsHtml = `<div>${escapeHtml(block.input.file_path)}</div>`;
  } else if (name === 'Write' && block.input && typeof block.input.file_path === 'string') {
    argsHtml = `<div>${escapeHtml(block.input.file_path)}</div>`;
    if (typeof block.input.content === 'string') {
      argsHtml += `<details style="margin-top:6px"><summary class="muted" style="font-size:0.7rem;cursor:pointer">content (${block.input.content.length} chars)</summary><pre style="margin-top:4px">${escapeHtml(block.input.content)}</pre></details>`;
    }
  } else if (name === 'Edit' && block.input && typeof block.input.file_path === 'string') {
    argsHtml = `<div>${escapeHtml(block.input.file_path)}</div>`
      + `<pre class="diff-remove">- ${escapeHtml(block.input.old_string || '')}</pre>`
      + `<pre class="diff-add">+ ${escapeHtml(block.input.new_string || '')}</pre>`;
  } else {
    argsHtml = `<pre>${escapeHtml(JSON.stringify(block.input ?? {}, null, 2))}</pre>`;
  }

  const idLabel = block.id ? `<span class="tool-id">${escapeHtml(block.id.slice(-8))}</span>` : '';
  const summary = `<summary>${ICON.tool} <span class="block-label-inline">Tool</span> <span class="tool-name">${escapeHtml(name)}</span>${idLabel}</summary>`;
  const result = pair ? renderToolResult(pair.block, expandResults) : '';
  const expanded = expandResults ? 'expanded' : '';
  const variant = name === 'Bash' ? 'tool-bash' : '';
  return `<details class="tool-call ${variant} ${expanded}" open>${summary}<div class="tool-args">${argsHtml}</div>${result}</details>`;
}

function renderToolResult(block, expandResults) {
  const head = [];
  head.push(`<span class="tool-result-label">${ICON.output} Output</span>`);
  if (block.is_error) head.push('<span class="chip bad">error</span>');
  if (block.content_truncated) head.push(`<span class="muted">truncated · ${fmtNum(block.content_full_len || 0)} chars</span>`);
  return `<div class="tool-result"><div class="tool-result-head">${head.join('')}</div>${renderToolResultBody(block)}</div>`;
}

function renderToolResultBody(block) {
  const c = block.content;
  let body = '';
  if (typeof c === 'string') {
    body = escapeHtml(c) + (block.content_truncated ? `\n\n[truncated; ${block.content_full_len} chars total]` : '');
  } else if (Array.isArray(c)) {
    body = c.map(sub => {
      if (sub && typeof sub.text === 'string') return escapeHtml(sub.text);
      if (sub && sub.type === 'tool_reference') return `[tool_reference ${escapeHtml(sub.tool_name)}]`;
      return escapeHtml(JSON.stringify(sub));
    }).join('\n');
  } else {
    body = '(no content)';
  }
  return `<div class="tool-result-body ${block.is_error ? 'error' : ''}">${body}</div>`;
}

function renderCodexItem(item, expandResults) {
  if (!item || typeof item !== 'object') return '';
  switch (item.type) {
    case 'reasoning':
    case 'agent_reasoning':
      return `<details class="block-card agent-thinking" ${TRACE_VIEW === 'all' ? 'open' : ''}><summary>${ICON.thought} <span>Thought</span></summary><div class="thinking-body">${mdLite(item.text || '')}</div></details>`;
    case 'agent_message':
    case 'assistant_message':
      return `<div class="block-card agent-text">${mdLite(item.text || '')}</div>`;
    case 'todo_list':
      return `<div class="standalone-output"><div class="block-label">Todo list</div>${renderTodos(item.items || [])}</div>`;
    case 'command_execution': {
      const out = item.aggregated_output || '';
      const truncated = out.length > 16384;
      const exitMeta = item.exit_code != null ? `<span class="tool-exit">exit ${item.exit_code}</span>` : '';
      const head = `<summary>${ICON.tool} <span class="block-label-inline">Tool</span> <span class="tool-name">${escapeHtml(item.shell || 'command')}</span>${exitMeta}</summary>`;
      const args = `<div class="tool-args"><div class="bash-cmd">${escapeHtml(item.command || '')}</div></div>`;
      const body = `<div class="tool-result"><div class="tool-result-head"><span class="tool-result-label">${ICON.output} Output</span>${item.status ? `<span class="muted">${escapeHtml(item.status)}</span>` : ''}${truncated ? '<span class="muted">truncated</span>' : ''}</div><div class="tool-result-body ${item.exit_code && item.exit_code !== 0 ? 'error' : ''}">${escapeHtml(out.slice(0, 16384))}${truncated ? '\n\n[... truncated]' : ''}</div></div>`;
      return `<details class="tool-call tool-bash ${expandResults ? 'expanded' : ''}" open>${head}${args}${body}</details>`;
    }
    case 'file_change': {
      const rows = (item.changes || []).map(c =>
        `<div class="todo-item"><span class="check">${c.kind === 'add' ? '＋' : c.kind === 'delete' ? '－' : '✎'}</span><span>${escapeHtml(c.path)}</span></div>`).join('');
      return `<div class="standalone-output"><div class="block-label">File change · ${escapeHtml(item.status || '')}</div>${rows}</div>`;
    }
    case 'web_search':
      return `<div class="standalone-output"><div class="block-label">Web search</div><div>${escapeHtml(item.query || '')}</div></div>`;
    default:
      return `<details><summary class="muted" style="font-size:0.7rem;cursor:pointer">${escapeHtml(item.type || 'item')}</summary><pre style="font-size:0.74rem;white-space:pre-wrap;margin-top:4px">${escapeHtml(JSON.stringify(item, null, 2))}</pre></details>`;
  }
}

function renderTodos(todos) {
  // NB: keep this on one line per item. The enclosing .tool-args has
  // `white-space: pre-wrap` (so bash commands preserve formatting), which
  // also renders template-literal newlines as visible breaks — what looks
  // like padding between todos is actually leaked newlines.
  return `<ul class="todo-list">${todos.map(t =>
    `<li class="todo-item ${t.completed ? 'done' : ''}"><span class="check">${t.completed ? '☑' : '☐'}</span><span>${escapeHtml(t.text || t.content || '')}</span></li>`
  ).join('')}</ul>`;
}

// ---------- Mini charts (right rail) -----------------------------------

// One chart per metric. Each metric has a definition that's used to render
// both the rail card and the matching larger modal card, so we keep them in
// sync without code duplication.
function getMetricDefs() {
  // Filter out pre-trace samples so the x-axis can run from 00:00 (first
  // event) to the trace's end without a flat compressed lead-in.
  const allSnaps = RECORD.system_monitor || [];
  const snaps = TRACE_START_MS == null
    ? allSnaps
    : allSnaps.filter(s => {
        if (!s.ts) return true;
        const t = parseTraceTs(s.ts);
        return isNaN(t) || t >= TRACE_START_MS - 1000;
      });
  // Pre-compute relative-time labels (HH:MM:SS from trace start) so the
  // chart's tickTime + tooltip pick them up directly.
  const labels = snaps.map(s => {
    if (!s.ts) return '';
    const t = parseTraceTs(s.ts);
    if (isNaN(t)) return s.ts;
    if (TRACE_START_MS == null) return s.ts;
    return fmtRelTime(Math.max(0, t - TRACE_START_MS));
  });
  const gpu = (k) => snaps.map(s => s.gpu ? s.gpu[k] : null);
  return [
    {
      key: 'gpu-util', title: 'GPU utilization', unit: '%',
      data: gpu('util_pct'), yMax: 100, palette: 'session-2',
      fmt: v => fmt(v, 0) + '%',
    },
    {
      key: 'gpu-mem', title: 'GPU memory used', unit: 'GiB',
      data: snaps.map(s => s.gpu ? s.gpu.mem_used_mib / 1024 : null),
      yMax: (snaps[0]?.gpu?.mem_total_mib || 81559) / 1024, palette: 'accent',
      fmt: v => fmt(v, 1) + ' GiB',
    },
    {
      key: 'gpu-temp', title: 'GPU temperature', unit: '°C',
      data: gpu('temp_c'), palette: 'session-4',
      fmt: v => fmt(v, 0) + '°C',
    },
    {
      key: 'gpu-power', title: 'GPU power', unit: 'W',
      data: gpu('power_w'), palette: 'session-1',
      fmt: v => fmt(v, 0) + ' W',
    },
    {
      key: 'cpu-load', title: 'CPU load (1m)', unit: 'load',
      data: snaps.map(s => s.cpu_load_1m), palette: 'session-2',
      fmt: v => fmt(v, 2),
    },
    {
      key: 'mem-used', title: 'System memory used', unit: 'GiB',
      data: snaps.map(s => s.mem_used_gib), palette: 'session-3',
      fmt: v => fmt(v, 0) + ' GiB',
    },
  ].map(m => ({ ...m, labels }));
}

function renderMiniCharts() {
  const snaps = RECORD.system_monitor || [];
  if (!snaps.length) {
    setMetricsUnavailable('No system monitor log for this run.');
    return;
  }
  setMetricsAvailable();
  setChartDefaults();
  const defs = getMetricDefs();

  els.metricGridRail.innerHTML = defs.map(d => metricCardHtml(d, 'rail')).join('');
  destroyCharts(RAIL_CHARTS);
  // The rail is one vertically aligned instrument. Repeating the same time
  // labels on every chart adds noise, so only the final chart carries the
  // shared horizontal axis. The modal keeps an axis on every chart because
  // its cards may flow into multiple columns.
  RAIL_CHARTS = defs.map((d, index) => buildChart(`metric-rail-${d.key}`, d, {
    showXAxis: index === defs.length - 1,
  }));
}

function setMetricsAvailable() {
  els.railEmpty.classList.add('hidden');
  els.metricGridRail.classList.remove('hidden');
  els.showAllBtn.classList.remove('hidden');
  const toolbarBtn = document.getElementById('open-metrics-btn');
  [els.showAllBtn, toolbarBtn].filter(Boolean).forEach(btn => {
    btn.disabled = false;
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('title');
  });
}

function setMetricsUnavailable(message) {
  els.railEmpty.textContent = message;
  els.railEmpty.classList.remove('hidden');
  els.metricGridRail.classList.add('hidden');
  els.showAllBtn.classList.add('hidden');
  const toolbarBtn = document.getElementById('open-metrics-btn');
  [els.showAllBtn, toolbarBtn].filter(Boolean).forEach(btn => {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.title = message;
  });
}

function setChartDefaults() {
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.font.family = css.getPropertyValue('--font-mono').trim()
    || "'JetBrains Mono', 'SF Mono', monospace";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = css.getPropertyValue('--text-secondary').trim() || '#6b655a';
  Chart.defaults.borderColor = css.getPropertyValue('--border-color').trim() || '#d9d4c8';
}

function paletteColor(palette) {
  const css = getComputedStyle(document.documentElement);
  const map = {
    accent:    css.getPropertyValue('--accent-primary').trim() || '#a66b4f',
    'session-1': css.getPropertyValue('--session-1').trim() || '#8a7240',
    'session-2': css.getPropertyValue('--session-2').trim() || '#6f7d45',
    'session-3': css.getPropertyValue('--session-3').trim() || '#80526a',
    'session-4': css.getPropertyValue('--session-4').trim() || '#97553a',
  };
  return map[palette] || map.accent;
}

function metricCardHtml(def, where) {
  // Compact title + plot. The rail presents these as one continuous stack;
  // the modal restores individual card surfaces through CSS.
  return `<div class="metric-card-mini">
    <div class="metric-card-title">${escapeHtml(def.title)}</div>
    <div class="metric-chart-frame"><canvas id="metric-${where}-${def.key}"></canvas></div>
  </div>`;
}

function buildChart(canvasId, def, { motion = 'initial', showXAxis = true } = {}) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const css = getComputedStyle(document.documentElement);
  const color = paletteColor(def.palette);
  const muted = css.getPropertyValue('--text-secondary').trim() || '#6b655a';
  const text = css.getPropertyValue('--text-primary').trim() || '#2d2a23';
  const border = css.getPropertyValue('--border-color').trim() || '#d9d4c8';
  const surface = css.getPropertyValue('--bg-tertiary').trim() || '#e8e4d9';
  // Labels are already HH:MM:SS strings (relative to trace start) —
  // strip the trailing :SS so the axis ticks show HH:MM.
  const tickTime = (_v, i) => {
    const ts = def.labels[i];
    if (!ts) return '';
    return /^\d{2}:\d{2}:\d{2}$/.test(ts) ? ts.slice(0, 5) : ts;
  };
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: def.labels,
      datasets: [{
        label: def.title,
        data: def.data,
        borderColor: color,
        backgroundColor: color + '22',
        fill: 'origin',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: REDUCED_MOTION.matches || motion === 'none'
        ? false
        : { duration: motion === 'initial' ? 450 : 190, easing: 'easeOutCubic' },
      interaction: { mode: 'index', axis: 'x', intersect: true },
      elements: {
        point: {
          radius: 0,
          hitRadius: 9,
          hoverRadius: 3,
          hoverBorderWidth: 1.5,
        },
        line: { borderWidth: 1.4, tension: 0.25 },
      },
      layout: { padding: { top: 8, right: 10, bottom: showXAxis ? 4 : 0, left: 4 } },
      scales: {
        x: {
          display: showXAxis,
          grid: { display: false },
          border: { color: border },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 4,
            maxRotation: 0,
            callback: tickTime,
            padding: 6,
            color: muted,
            font: { family: "'JetBrains Mono', monospace", size: 10.5 },
          },
        },
        y: {
          display: true,
          position: 'left',
          beginAtZero: true,
          suggestedMax: def.yMax,
          grid: { color: border + '66', drawTicks: false, drawBorder: false },
          border: { display: false },
          ticks: {
            color: muted,
            maxTicksLimit: 4,
            padding: 6,
            font: { family: "'JetBrains Mono', monospace", size: 10.5 },
            // Unit is suffixed onto the value itself (e.g. "20G", "40°C") so
            // we don't need a separate axis title — matches the screenshot.
            callback: (v) => unitTick(v, def.unit),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: surface,
          titleColor: text,
          bodyColor: text,
          borderColor: border,
          borderWidth: 1,
          cornerRadius: 6,
          displayColors: false,
          caretPadding: 10,
          caretSize: 6,
          intersect: true,
          mode: 'index',
          titleFont: { family: "'JetBrains Mono', monospace", size: 12, weight: 700 },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 12 },
          padding: 10,
          animation: { duration: 150, easing: 'easeOutQuart' },
          callbacks: {
            title: (items) => {
              const ts = def.labels[items[0]?.dataIndex];
              return ts || '';
            },
            label: (ctx) => `${def.title}: ${def.fmt(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

function unitTick(value, unit) {
  if (value == null || isNaN(value)) return '';
  // 0 is just "0" (no decimals) — otherwise it widens the y-axis gutter and
  // squashes the plot.
  let n;
  if (value === 0) n = '0';
  else if (Math.abs(value) >= 10) n = value.toFixed(0);
  else if (Math.abs(value) >= 1) n = value.toFixed(1).replace(/\.0$/, '');
  else n = value.toFixed(2);
  switch (unit) {
    case '%':    return n + '%';
    case 'GiB':  return n + 'G';
    case '°C':   return n + '°C';
    case 'W':    return n + 'W';
    case 'load': return n;
    default:     return unit ? n + ' ' + unit : n;
  }
}

function destroyCharts(arr) {
  for (const c of arr) { try { c?.destroy(); } catch {} }
  arr.length = 0;
}

function openMetricsModal(event) {
  if (typeof Chart === 'undefined' || !(RECORD.system_monitor || []).length) return;
  if (MODAL_CLOSE_TIMER) {
    clearTimeout(MODAL_CLOSE_TIMER);
    MODAL_CLOSE_TIMER = null;
  }
  const defs = getMetricDefs();
  els.metricGridModal.innerHTML = defs.map(d => metricCardHtml(d, 'modal')).join('');
  els.metricsModal.classList.remove('modal-hidden');
  document.body.style.overflow = 'hidden';
  // Chart.js needs the canvases to have layout dimensions before construction.
  // The modal is now visible, so we can build them.
  destroyCharts(MODAL_CHARTS);
  const motion = event?.detail === 0 ? 'none' : 'interaction';
  MODAL_CHARTS = defs.map(d => buildChart(`metric-modal-${d.key}`, d, { motion }));
}

function closeMetricsModal() {
  els.metricsModal.classList.add('modal-hidden');
  document.body.style.overflow = '';
  if (MODAL_CLOSE_TIMER) clearTimeout(MODAL_CLOSE_TIMER);
  const finish = () => {
    MODAL_CLOSE_TIMER = null;
    if (!els.metricsModal.classList.contains('modal-hidden')) return;
    destroyCharts(MODAL_CHARTS);
    els.metricGridModal.innerHTML = '';
  };
  if (REDUCED_MOTION.matches) finish();
  else MODAL_CLOSE_TIMER = setTimeout(finish, 190);
}

function setupMetricsModal() {
  els.showAllBtn.addEventListener('click', openMetricsModal);
  // The rail header owns the desktop affordance. This toolbar entry point is
  // revealed only when responsive CSS hides the rail.
  const toolbarBtn = document.getElementById('open-metrics-btn');
  if (toolbarBtn) toolbarBtn.addEventListener('click', openMetricsModal);
  if ((RECORD.system_monitor || []).length && typeof Chart === 'undefined') {
    [els.showAllBtn, toolbarBtn].filter(Boolean).forEach(btn => {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.title = 'Loading chart library…';
    });
  }
  els.metricsModal.querySelectorAll('[data-modal-close]').forEach(el =>
    el.addEventListener('click', closeMetricsModal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.metricsModal.classList.contains('modal-hidden')) closeMetricsModal();
  });
}

function renderMiniTokens() {
  const u = RECORD.summary.usage_total || {};
  const rows = [
    ['input',       u.input_tokens],
    ['output',      u.output_tokens],
    ['cache write', u.cache_creation_input_tokens],
    ['cache read',  u.cache_read_input_tokens],
  ].filter(([, v]) => v != null && v > 0);
  if (!rows.length) {
    els.summaryTokensBlock.classList.add('hidden');
    return;
  }
  els.summaryTokensBlock.classList.remove('hidden');
  els.summaryTokens.innerHTML = rows.map(([k, v]) =>
    `<dt>${k}</dt><dd>${fmtNum(v)}</dd>`).join('');
}

// ---------- Judge -------------------------------------------------------

function renderJudge() {
  renderJudgeVerdicts();
  if (!RECORD.judge || !RECORD.judge.events || !RECORD.judge.events.length) {
    els.judge.innerHTML = '<p class="muted">No detailed judge report is available for this run.</p>';
    return;
  }
  // Re-use the trace renderer's codex-item path so the judge gets exactly
  // the same terminal-style command panels, italicized "Thought" blocks,
  // todo lists, etc. as the main trace.
  const items = [];
  for (const e of RECORD.judge.events) {
    if (e.type !== 'codex_item' || e.phase !== 'completed') continue;
    const html = renderCodexItem(e.item || {}, /*expandResults*/ false);
    if (html) items.push(`<div class="judge-item">${html}</div>`);
  }
  if (!items.length) {
    els.judge.innerHTML = '<p class="muted">No renderable judge trace items.</p>';
    return;
  }
  els.judge.innerHTML = `<details class="judge-details">
    <summary>View judge trace <span>· ${items.length.toLocaleString()} item${items.length === 1 ? '' : 's'}</span></summary>
    <div class="judge-stream">${items.join('')}</div>
  </details>`;
}

// Minimal markdown renderer for judge verdicts. The judge frequently
// wraps identifiers in `backticks`, occasionally emphasises with *foo* /
// **foo**, and uses newlines between paragraphs. Escapes HTML FIRST so
// the input can never inject markup, then applies the four transforms
// on the already-escaped text.
function renderJudgeMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(String(text));
  // Inline code: `foo` — do this before bold/italic since a lot of
  // judge code snippets contain * that would otherwise be misparsed.
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold: **text** (non-greedy, no nesting).
  html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text* — require the preceding char to not be a * so we
  // don't chew into an adjacent bold run.
  html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // Preserve line breaks so multi-paragraph justifications stay legible.
  html = html.replace(/\n/g, '<br>');
  return html;
}

function renderJudgeVerdicts() {
  // The per-run RECORD.judgements holds the full {flagged, justification}
  // per axis; index_row only carries the flag bool (justifications were
  // stripped from index.json to keep the initial payload small — see build.py).
  const jud = RECORD.judgements || {};
  const axes = [
    { label: 'Data contamination',   v: jud.contamination },
    { label: 'Disallowed model use', v: jud.disallowed_model },
  ];
  const verdicts = [];
  for (const {label, v} of axes) {
    const pending = v == null;
    const flagged = !pending && !!v.flagged;
    const cls  = pending ? '' : (flagged ? 'bad' : 'good');
    const icon = pending ? '?' : (flagged ? '!' : '✓');
    // The justification is the whole point of the new schema — surface it,
    // and only fall back to a generic phrase when the judge shipped an empty
    // string (or, for pending, when it never ran). Markdown-render the
    // real judge text; the placeholder strings pass through untouched.
    let text;
    if (pending) text = '(no judgement)';
    else if (v.justification) text = v.justification;
    else text = flagged ? 'flagged (no justification given)' : 'clean';
    const state = pending ? 'Pending' : (flagged ? 'Flagged' : 'Clean');
    verdicts.push(`<details class="verdict-item ${cls}"${flagged ? ' open' : ''}>
      <summary>
        <span class="verdict-icon" aria-hidden="true">${icon}</span>
        <span class="verdict-label">${escapeHtml(label)}</span>
        <span class="verdict-state">${state}</span>
        <span class="verdict-caret" aria-hidden="true">›</span>
      </summary>
      <div class="verdict-item-body"><div class="verdict-item-copy">${renderJudgeMarkdown(text)}</div></div>
    </details>`);
  }
  // Cell-level judge_version — same for both axes, since they come from the
  // same verdict file. v1.1 is the new post-2026-07 setting (rule-4,
  // failure-mode language); v1.0 is the pre-revamp free-text verdict.
  // Pill links to the home page since that's where the v1.1 release
  // blogpost lives.
  const ver = jud.version || RECORD.index_row?.judge_version;
  let head = '';
  if (ver) {
    const verCls = ver === 'v1.0' ? 'verdict-ver-legacy' : 'verdict-ver-current';
    const tip = ver === 'v1.0'
      ? 'Judged under the v1.0 setting (pre-revamp). Check the home page for details on the new v1.1.'
      : 'Judged under the new v1.1 setting. Check the home page for details.';
    head = `<a class="verdict-version ${verCls}" href="../" data-tip="${escapeHtml(tip)}">judged: ${ver}</a>`;
  }
  els.judgeVerdicts.innerHTML = `${head}<div class="verdict-list">${verdicts.join('')}</div>`;
}

// ---------- Workspace (lazy on tab activation) -------------------------

async function loadWorkspace() {
  if (WORKSPACE_LOADED) return;
  WORKSPACE_LOADED = true;
  els.wsTree.innerHTML = '<p class="muted">Loading workspace…</p>';
  try {
    WORKSPACE = await fetchJsonWithTimeout(`${DATA_BASE}${encodeURIComponent(RUN_ID)}.workspace.json`);
    if (!WORKSPACE || !Array.isArray(WORKSPACE.files)) {
      throw new Error('The workspace data has an invalid format.');
    }
    renderWorkspace();
  } catch (error) {
    console.error(`Failed to load workspace for ${RUN_ID}:`, error);
    WORKSPACE = null;
    if (error.status === 404) {
      els.wsTree.innerHTML = '<p class="muted">No workspace data.</p>';
      return;
    }

    // Network, timeout, server, and JSON failures can be transient. Reset the
    // guard and offer an in-place retry instead of permanently wedging the tab.
    WORKSPACE_LOADED = false;
    const message = error.code === 'ETIMEDOUT'
      ? 'The workspace request timed out.'
      : 'Could not load the workspace.';
    els.wsTree.innerHTML = `<p class="muted">${message}</p><button type="button" class="btn btn-secondary btn-small">Retry</button>`;
    els.wsTree.querySelector('button')?.addEventListener('click', loadWorkspace, { once: true });
  }
}

function renderWorkspace() {
  const files = WORKSPACE.files || [];
  const tree = buildWorkspaceTree(files);
  els.wsTree.innerHTML = `<div class="ws-root-label">
    <span class="ws-folder-mark" aria-hidden="true"></span>
    <span>task</span>
    <span class="ws-entry-count">${files.length.toLocaleString()}</span>
  </div>
  <div class="ws-branch ws-root-branch">${renderWorkspaceBranch(tree)}</div>`;

  const filesByPath = new Map(files.map(file => [file.path, file]));
  els.wsTree.querySelectorAll('.ws-file').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.dataset.path;
      const f = filesByPath.get(path);
      if (!f) return;
      els.wsTree.querySelectorAll('.ws-file.active').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      showWorkspaceFile(f);
    });
  });

  els.wsBack.onclick = () => {
    els.workspaceLayout.classList.remove('workspace-file-open');
    els.wsTree.querySelectorAll('.ws-file.active').forEach(x => x.classList.remove('active'));
    scrollSectionBelowTabs(document.getElementById('section-workspace'));
  };

  if (!window.matchMedia('(max-width: 900px)').matches && files.length) {
    const preferredNames = ['metrics_final.json', 'metrics.json', 'README.md'];
    const preferred = preferredNames
      .map(name => files.find(file => file.inlined && file.path.split('/').pop() === name))
      .find(Boolean);
    const initial = preferred || files.find(file => file.inlined) || files[0];
    const row = [...els.wsTree.querySelectorAll('.ws-file')]
      .find(item => item.dataset.path === initial.path);
    row?.classList.add('active');
    showWorkspaceFile(initial, { scroll: false });
  }
}

function buildWorkspaceTree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = String(file.path || '').split('/').filter(part => part && part !== '.');
    if (parts[0]?.toLowerCase() === 'task') parts.shift();
    const name = parts.pop() || file.path || 'unnamed';
    let node = root;
    for (const part of parts) {
      if (!node.dirs.has(part)) {
        node.dirs.set(part, { name: part, dirs: new Map(), files: [] });
      }
      node = node.dirs.get(part);
    }
    node.files.push({ file, name });
  }
  return root;
}

function renderWorkspaceBranch(node, depth = 0) {
  const directories = [...node.dirs.values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const files = node.files
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const directoryHtml = directories.map(directory => {
    const count = countWorkspaceEntries(directory);
    const open = depth < 1 ? ' open' : '';
    return `<details class="ws-folder"${open}>
      <summary>
        <span class="ws-folder-caret" aria-hidden="true">›</span>
        <span class="ws-folder-mark" aria-hidden="true"></span>
        <span class="ws-folder-name">${escapeHtml(directory.name)}</span>
        <span class="ws-entry-count">${count.toLocaleString()}</span>
      </summary>
      <div class="ws-branch">${renderWorkspaceBranch(directory, depth + 1)}</div>
    </details>`;
  }).join('');

  const fileHtml = files.map(({ file, name }) => {
    const skipped = !file.inlined;
    const reason = file.skipped_reason || (skipped ? 'Not available for preview' : 'Open file');
    return `<button type="button" class="ws-file ${skipped ? 'skipped' : ''}"
      data-path="${escapeHtml(file.path)}" title="${escapeHtml(reason)}">
      <span class="ws-file-main">
        <span class="ws-file-mark" aria-hidden="true"></span>
        <span class="ws-file-name">${escapeHtml(name)}</span>
      </span>
      <span class="size">${fmtBytes(file.size)}</span>
    </button>`;
  }).join('');

  return directoryHtml + fileHtml;
}

function countWorkspaceEntries(node) {
  let count = node.files.length;
  for (const directory of node.dirs.values()) count += countWorkspaceEntries(directory);
  return count;
}

function showWorkspaceFile(f, { scroll = true } = {}) {
  const pathParts = String(f.path || '').split('/').filter(Boolean);
  if (pathParts[0]?.toLowerCase() !== 'task') pathParts.unshift('task');
  const pathHtml = pathParts.map((part, index) =>
    `<span class="ws-path-part ${index === pathParts.length - 1 ? 'current' : ''}">${escapeHtml(part)}</span>`
  ).join('<span class="ws-path-separator" aria-hidden="true">/</span>');
  const header = `<div class="ws-file-head">
    <div class="ws-breadcrumb">${pathHtml}</div>
    <span class="ws-file-meta">${fmtBytes(f.size)}</span>
  </div>`;
  if (!f.inlined) {
    els.wsFileContent.innerHTML = `${header}<p class="muted">Not inlined: ${escapeHtml(f.skipped_reason || 'file is too large to preview')}</p>`;
  } else {
    const lang = guessLang(f.path);
    // Render with highlight.js if it's loaded and we recognize the language.
    let code;
    if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
      try {
        const res = hljs.highlight(f.text, { language: lang, ignoreIllegals: true });
        code = `<pre class="hljs language-${lang}"><code>${res.value}</code></pre>`;
      } catch {
        code = `<pre><code>${escapeHtml(f.text)}</code></pre>`;
      }
    } else {
      code = `<pre><code>${escapeHtml(f.text)}</code></pre>`;
    }
    els.wsFileContent.innerHTML = header + code;
  }
  if (window.matchMedia('(max-width: 900px)').matches) {
    els.workspaceLayout.classList.add('workspace-file-open');
    if (scroll) scrollSectionBelowTabs(els.wsFile);
  }
}

function guessLang(path) {
  const p = path.toLowerCase();
  const ext = p.includes('.') ? p.slice(p.lastIndexOf('.') + 1) : '';
  const base = p.includes('/') ? p.slice(p.lastIndexOf('/') + 1) : p;
  if (base === 'dockerfile' || base === 'makefile') return 'bash';
  return {
    py: 'python',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'javascript', tsx: 'javascript', jsx: 'javascript',
    json: 'json', jsonl: 'json', ipynb: 'json',
    yaml: 'yaml', yml: 'yaml',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
    md: 'markdown', markdown: 'markdown',
    txt: 'plaintext', log: 'plaintext',
  }[ext] || null;
}

// ---------- Tabs -------------------------------------------------------

function setupTabs() {
  const btns = [...els.tabNav.querySelectorAll('.tab-btn')];
  const sections = new Map();
  for (const b of btns) sections.set(b.dataset.tab, document.getElementById('section-' + b.dataset.tab));

  // Query params own tab state; accept the old #tab=judge form once and
  // migrate it so fragments remain available for trace event permalinks.
  const legacyHashTab = new URLSearchParams(location.hash.slice(1)).get('tab');
  const hashTab = params.get('tab') || legacyHashTab;
  let active = (hashTab && sections.has(hashTab)) ? hashTab : btns[0].dataset.tab;
  selectTab(active, { initial: true });

  els.tabNav.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    selectTab(btn.dataset.tab);
  });

  function selectTab(name, { initial = false } = {}) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    for (const [k, sec] of sections) sec?.classList.toggle('active', k === name);
    if (els.layout) els.layout.dataset.activeTab = name;

    const url = new URL(window.location.href);
    if (name === 'trace') url.searchParams.delete('tab');
    else url.searchParams.set('tab', name);

    // Remove a legacy tab fragment. Event fragments are meaningful only on
    // the trace tab, so clear one when navigating to another section.
    const currentHashHasLegacyTab = new URLSearchParams(url.hash.slice(1)).has('tab');
    if (currentHashHasLegacyTab || (name !== 'trace' && eventAnchorFromHash(url.hash))) {
      url.hash = '';
    }
    history.replaceState(null, '', url.toString());
    if (!initial) {
      trackGoatCounterEvent(`trace-tab/${name}`, `Trace tab: ${name}`);
    }
    if (!initial) {
      if (window.matchMedia('(max-width: 900px)').matches) {
        requestAnimationFrame(() => scrollSectionBelowTabs(sections.get(name)));
      } else {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
    if (name === 'workspace') loadWorkspace();
    // If the trace rendered while its section was hidden (page opened on
    // ?tab=judge), every output measured 0×0 and got no "show all" badge —
    // re-measure now that it's visible.
    if (name === 'trace') markClippedOutputs();
  }
}

function scrollSectionBelowTabs(element) {
  if (!element) return;
  const topbarHeight = document.querySelector('.topbar')?.offsetHeight || 48;
  const tabHeight = els.tabNav.offsetHeight || 44;
  const top = element.getBoundingClientRect().top + window.scrollY - topbarHeight - tabHeight - 8;
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
}

// Canvas colors are captured when each chart is constructed. Rebuild in place
// during the root theme snapshot, without replaying entrance motion.
window.addEventListener('ptb:themechange', () => {
  if (!RECORD || typeof Chart === 'undefined' || !(RECORD.system_monitor || []).length) return;
  setChartDefaults();
  const defs = getMetricDefs();

  if (els.metricGridRail.querySelector('canvas')) {
    destroyCharts(RAIL_CHARTS);
    RAIL_CHARTS = defs.map((d, index) => buildChart(`metric-rail-${d.key}`, d, {
      motion: 'none',
      showXAxis: index === defs.length - 1,
    }));
  }

  if (!els.metricsModal.classList.contains('modal-hidden')) {
    destroyCharts(MODAL_CHARTS);
    MODAL_CHARTS = defs.map(d => buildChart(`metric-modal-${d.key}`, d, { motion: 'none' }));
  }
});

// ---------- Trace control listeners ------------------------------------


// ---------- Utils ------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Minimal markdown for agent prose (thought + message cards). Agents emit
// **bold** and `code` constantly; showing the raw asterisks/backticks reads
// as a rendering bug, but a full markdown parser is overkill (and risky on
// untrusted trace text). Escape first, then upgrade just those two forms.
// Code spans are converted before bold so `**args` inside backticks stays
// literal.
function mdLite(s) {
  return escapeHtml(s)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
}
function fmtNum(v) {
  if (typeof v !== 'number') return escapeHtml(String(v));
  if (Math.abs(v) >= 1000) return v.toLocaleString();
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}
function fmt(v, decimals = 0) {
  if (v == null) return '-';
  if (typeof v !== 'number') return String(v);
  return v.toFixed(decimals);
}
function fmtBytes(n) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
function msToHms(ms) {
  if (ms == null) return '-';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Parse "04:45:01" → "4h 45m 1s", or fall back to msToHms.
function humanDuration(timeTakenStr, durationMs) {
  if (timeTakenStr && /^\d+:\d{1,2}:\d{1,2}$/.test(timeTakenStr.trim())) {
    const [h, m, s] = timeTakenStr.trim().split(':').map(Number);
    const parts = [];
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    if (s || !parts.length) parts.push(s + 's');
    return parts.join(' ');
  }
  if (durationMs) return msToHms(durationMs);
  return '-';
}

// Convert ISO timestamp like "2026-04-30T23:24:24Z" into a compact split:
//   { date: "Apr 30", time: "01:23:45" (relative HH:MM:SS from trace start),
//     wall: "23:24:24" (original wall-clock) }
// The PRIMARY display value is `time` — relative to the first event in
// the trace — so the timeline reads "what the agent did at 5h in" rather
// than the absolute clock time. Wall-clock + date survive in `wall` /
// `date` for tooltip context.
const _MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatEventTime(iso) {
  const t = parseTraceTs(iso);
  if (isNaN(t)) return { date: '', time: iso, wall: iso };
  const d = new Date(t);
  const pad = n => String(n).padStart(2, '0');
  const date = `${_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  const wall = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  let time = wall;
  if (TRACE_START_MS != null) {
    time = fmtRelTime(Math.max(0, t - TRACE_START_MS));
  }
  return { date, time, wall };
}

// Parse a trace-source timestamp robustly. The agent traces use proper
// ISO ("2026-04-22T14:09:35Z") but the system_monitor logs a naive
// "YYYY-MM-DD HH:MM:SS" form — those need to be treated as UTC, not
// local, because the launcher runs in UTC. Without this normalization
// the browser's local offset bakes in (e.g. -7200s on UTC+2) and the
// sample timestamps drift hours away from the event timestamps.
function parseTraceTs(ts) {
  if (!ts) return NaN;
  const s = String(ts);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(s) && !/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) {
    return Date.parse(s.replace(' ', 'T') + 'Z');
  }
  return Date.parse(s);
}

// Render a millisecond offset as HH:MM:SS — zero-padded so column widths
// stay stable. Used for event timestamps and chart x-axis labels.
function fmtRelTime(deltaMs) {
  if (deltaMs == null || isNaN(deltaMs)) return '';
  const s = Math.max(0, Math.floor(deltaMs / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

load();
