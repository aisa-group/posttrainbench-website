// Run detail page: fetch the per-run JSON, render all sections + mini charts.

const params = new URLSearchParams(window.location.search);
const RUN_ID = params.get('id');
// Base URL for the JSON data — local "./data/" by default, can be set to
// an external host (HF Datasets, R2, S3) by overriding window.PTB_DATA_BASE
// in config.js.
const DATA_BASE = (typeof window !== 'undefined' && window.PTB_DATA_BASE) || './data/';

const els = {
  topbarMeta: document.getElementById('topbar-meta'),
  tabNav: document.getElementById('tab-nav'),

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
  linkRaw: document.getElementById('link-raw'),

  summaryThemes: document.getElementById('summary-themes'),

  // Judge verdicts (in Judge section)
  judgeVerdicts: document.getElementById('judge-verdicts'),

  // Center sections
  trace: document.getElementById('trace'),
  judge: document.getElementById('judge'),
  wsTree: document.getElementById('ws-tree'),
  wsFile: document.getElementById('ws-file'),

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
};

let RECORD = null;
let WORKSPACE = null;
let WORKSPACE_LOADED = false;
let RAIL_CHARTS = [];           // Chart instances pinned to the right rail
let MODAL_CHARTS = [];          // Chart instances inside the show-all modal
let TRACE_START_MS = null;      // first event ts in ms, for elapsed formatting

async function load() {
  try {
    if (!RUN_ID) {
      els.trace.innerHTML = '<p class="muted">No run id in URL. Go back to the index.</p>';
      return;
    }
    const resp = await fetch(`${DATA_BASE}${encodeURIComponent(RUN_ID)}.json`, { cache: 'no-store' });
    if (!resp.ok) {
      els.trace.innerHTML = `<p class="muted">Could not fetch run ${escapeHtml(RUN_ID)}.</p>`;
      return;
    }
    RECORD = await resp.json();
    computeTraceStart();
    renderTopbar();
    renderSummary();
    renderTrace();
    renderJudge();
    whenChartReady(renderMiniCharts);
    renderMiniTokens();
    setupTabs();
    setupCopyId();
    setupTraceControls();
    setupMetricsModal();
  } finally {
    // Always tear down the loading shield — even if rendering errored,
    // showing the partially-rendered page is better than a stuck overlay.
    hidePageLoading();
  }
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
}

function whenChartReady(fn) {
  if (typeof Chart !== 'undefined') { fn(); return; }
  setTimeout(() => whenChartReady(fn), 80);
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

  // Title: friendly benchmark name. Sub: trained model + agent + time budget.
  els.summaryTitle.textContent = prettyBenchmark(m.benchmark) || m.run_name;
  const subBits = [];
  if (m.trained_model) subBits.push(prettyTrainedModel(m.trained_model));
  if (m.seed) subBits.push('seed ' + m.seed);
  els.summarySub.textContent = subBits.join(' · ');

  // Run ID with copy button
  els.runIdText.textContent = m.run_id;

  const scoreBarFill = document.getElementById('score-bar-fill');
  const scoreBar = document.getElementById('score-bar');
  const NO_EVAL_TITLE =
    "Agent didn't produce a final_model — the evaluation harness never " +
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
    if (scoreBarFill) scoreBarFill.style.width = Math.min(100, ix.accuracy * 100).toFixed(1) + '%';
  } else {
    // No metrics.json — render an explicit "not evaluated" state instead
    // of a bare em-dash. Hide the bar (irrelevant), dim the big number.
    els.scoreBig.textContent = '—';
    els.scoreBig.classList.add('score-big-empty');
    els.scoreSub.innerHTML =
      `<span class="no-eval-marker" data-tip="${escapeHtml(NO_EVAL_TITLE)}">not evaluated</span>`;
    if (scoreBar) scoreBar.style.display = 'none';
  }

  // Each stat is `[label, valueHtml]` — valueHtml is pre-escaped (or
  // intentional HTML for the cost-missing tooltip case). Keep the
  // template literal below from escaping so the cost tooltip survives.
  const COST_MISSING_TITLE =
    "Cost unknown — the trace doesn't include result events with token " +
    "cost. Common for runs killed early, older Claude Code containers, " +
    "or Codex/opencode traces.";
  const costHtml = (ix.total_cost_usd != null && ix.total_cost_usd > 0)
    ? '$' + Number(ix.total_cost_usd).toFixed(2)
    : `<span class="cost-missing" data-tip="${escapeHtml(COST_MISSING_TITLE)}">—</span>`;

  const agentPretty = escapeHtml(prettyAgentFromMeta((s.agent_models || [])[0], m) || '—');
  const harness = prettyHarness(m.trace_format);

  const stats = [
    ['agent',       agentPretty],
  ];
  // Harness on its own row so the agent value stays single-line and the
  // dl rhythm is consistent — previously "Claude Opus 4.7 Claude Code"
  // overflowed and wrapped, breaking alignment with the other stats.
  if (harness) stats.push(['harness', escapeHtml(harness)]);
  stats.push(
    ['time budget', escapeHtml(ix.time_budget_h ? ix.time_budget_h + 'h' : '—')],
    ['duration',    escapeHtml(humanDuration(ix.time_taken, ix.duration_ms))],
    ['turns',       escapeHtml((ix.num_turns != null && ix.num_turns > 0) ? String(ix.num_turns) : '—')],
    ['sessions',    escapeHtml(String(ix.session_count ?? '—'))],
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

// ---------- Pretty-name helpers ----------------------------------------

function prettyBenchmark(b) {
  if (!b) return '';
  const map = {
    healthbench: 'HealthBench', humaneval: 'HumanEval',
    aime2025: 'AIME 2025', aime2024: 'AIME 2024',
    gsm8k: 'GSM8K', bfcl: 'BFCL',
    math500: 'MATH-500', mmlu: 'MMLU', mbpp: 'MBPP',
    swebench: 'SWE-bench', arena_hard: 'Arena Hard', arenahard: 'Arena Hard',
    ifeval: 'IFEval', gpqa: 'GPQA', livecodebench: 'LiveCodeBench',
    minervamath: 'Minerva Math',
  };
  return map[b.toLowerCase()] || b;
}

function prettyTrainedModel(name) {
  if (!name) return '';
  // Org_Slug → Slug (we ship the org prefix; for display, drop it).
  // Then strip "-Base" / "-pt" suffixes and normalize separators.
  let s = name.replace(/^[^_]+_/, '');                 // drop org prefix
  s = s.replace(/-(Base|pt|PT|base)$/, '');
  // Qwen3-4B / Qwen3-1.7B / Qwen3-4B-Instruct ... → Qwen 3 4B
  s = s.replace(/^Qwen3-(\d+(?:\.\d+)?B)$/i, (_, sz) => `Qwen 3 ${sz}`);
  s = s.replace(/^Qwen3-(\d+(?:\.\d+)?B)/i, (_, sz) => `Qwen 3 ${sz}`);
  // SmolLM3-3B → SmolLM3 3B
  s = s.replace(/^SmolLM3-(\d+(?:\.\d+)?B)/i, (_, sz) => `SmolLM3 ${sz}`);
  // gemma-3-4b → Gemma 3 4B
  s = s.replace(/^gemma-(\d+)-(\d+(?:\.\d+)?)b/i, (_, gen, sz) => `Gemma ${gen} ${sz}B`);
  return s;
}

function prettyAgent(name) {
  if (!name) return '';
  let s = String(name);
  // Pull off bracketed annotations like "[1m]" → " (1M)".
  let annotation = '';
  s = s.replace(/\[([^\]]+)\]\s*$/, (_, a) => { annotation = ' (' + a.toUpperCase() + ')'; return ''; });
  // claude-opus-4-6 → Claude Opus 4.6
  s = s.replace(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)$/i,
    (_, fam, maj, min) => `Claude ${cap(fam)} ${maj}.${min}`);
  // gpt-5.3-codex → GPT 5.3 Codex; gpt-5.4 → GPT 5.4
  s = s.replace(/^gpt-([\d.]+)(?:-(.+))?$/i, (_, ver, tail) =>
    `GPT ${ver}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
  // gemini-2.5-pro → Gemini 2.5 Pro
  s = s.replace(/^gemini-([\d.]+)(?:-(.+))?$/i, (_, ver, tail) =>
    `Gemini ${ver}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
  return s + annotation;
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

// Map trace_format to the autonomous-agent harness that produced it.
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

// Variant annotations derived from the experiment name. "reprompted" =
// sessions were continued after the agent gave up. Surfaced alongside
// the [1m]-style annotation so the agent label tells the full story.
function prettyAgentFromMeta(name, meta) {
  const base = prettyAgent(name);
  const extras = [];
  const exp = ((meta && meta.experiment) || '').toLowerCase();
  if (/(?:^|[_/-])reprompt(?:ed)?(?:[_/-]|$)/.test(exp)) extras.push('reprompted');
  if (!extras.length) return base;
  const m = /^(.*?)\s+\(([^)]+)\)\s*$/.exec(base);
  if (m) return `${m[1]} (${m[2]}, ${extras.join(', ')})`;
  return `${base} (${extras.join(', ')})`;
}

// Re-render the trace when the expand-outputs toggle changes, and wire up
// the jump-to-turn input + click-on-marker permalink behavior.
function setupTraceControls() {
  els.expandOutputs.addEventListener('change', renderTrace);

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
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    url.hash = anchor;
    history.replaceState(null, '', url.toString());
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url.toString()).catch(() => {});
    marker.classList.add('linked');
    setTimeout(() => marker.classList.remove('linked'), 1200);
  });

  // If the URL already has a #turn-N or #ev-… hash on load, scroll to it.
  // (Wait a tick so the trace has rendered.)
  if (window.location.hash) {
    setTimeout(() => {
      const target = document.querySelector(window.location.hash);
      if (target) { target.scrollIntoView({ block: 'center' }); flashEvent(target); }
    }, 50);
  }
}

function flashEvent(el) {
  el.classList.add('event-flash');
  setTimeout(() => el.classList.remove('event-flash'), 1500);
}

function setupCopyId() {
  const copy = () => {
    const text = RECORD.meta.run_id;
    const finish = () => {
      // Triggers the CSS animation: border flash, icon swap (copy→check),
      // and the "copied" pill fading up. Remove the class after the
      // animation has run so a second click can re-trigger it.
      els.runIdBox.classList.remove('copied');
      void els.runIdBox.offsetWidth;     // force reflow so class re-add restarts
      els.runIdBox.classList.add('copied');
      setTimeout(() => els.runIdBox.classList.remove('copied'), 1300);
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

// Thinking and system events are always shown (no toggles for them);
// tool outputs are collapsed by default and reveal on the "expand outputs" toggle.
const SHOW_THINKING = true;
const SHOW_SYSTEM = true;

function renderTrace() {
  const events = RECORD.events;
  els.eventCount.textContent = `${events.length} events · ${RECORD.summary.session_count || 1} session(s)`;
  const wantSys = SHOW_SYSTEM;
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

  const out = [];
  let lastSession = -1;
  for (const ev of events) {
    if (ev.type === 'system' && !wantSys && ev.subtype !== 'init') continue;
    if (skipUserEv.has(ev)) continue;

    if (ev.session_idx !== lastSession && lastSession >= 0) {
      out.push(renderSessionBanner(ev));
    }
    lastSession = ev.session_idx;

    out.push(renderEvent(ev, resultByUseId, expandResults, turnNumByUuid.get(ev)));
  }
  els.trace.innerHTML = out.join('');
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

function renderEvent(ev, resultByUseId, expandResults, turnNum) {
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
    : `ev-${ev.session_idx ?? 0}-${ev.type}-${(ev.uuid || ev.ts || '').replace(/[^A-Za-z0-9_-]/g, '').slice(-8) || Math.random().toString(36).slice(2, 8)}`;
  // Marker: turn # (or role label) → relative time. The displayed time is
  // already trace-relative (first event = 00:00:00) so the redundant
  // "+elapsed" badge is gone. Wall-clock + date move to the hover tooltip.
  // Clicking the marker copies a permalink to this event.
  const tsTitle = tsParts
    ? `${tsParts.wall || ''}${tsParts.date ? ' · ' + tsParts.date : ''} (wall-clock)`
    : '';
  const marker = `<aside class="event-marker" data-anchor="${anchorId}" title="Copy link to this event">
    ${markerNum}${markerLabel}
    ${tsParts ? `<div class="ev-time" title="${escapeHtml(tsTitle)}">${escapeHtml(tsParts.time || '')}</div>` : ''}
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
      return `<div class="block-card agent-text">${escapeHtml(block.text || '')}</div>`;
    case 'thinking':
      return `<details class="block-card agent-thinking" ${SHOW_THINKING ? 'open' : ''}><summary>${ICON.thought} <span>Thought</span></summary><div class="thinking-body">${escapeHtml(block.thinking || '')}</div></details>`;
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
      return `<details class="block-card agent-thinking" ${SHOW_THINKING ? 'open' : ''}><summary>${ICON.thought} <span>Thought</span></summary><div class="thinking-body">${escapeHtml(item.text || '')}</div></details>`;
    case 'agent_message':
    case 'assistant_message':
      return `<div class="block-card agent-text">${escapeHtml(item.text || '')}</div>`;
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
    els.railEmpty.classList.remove('hidden');
    els.metricGridRail.classList.add('hidden');
    els.showAllBtn.classList.add('hidden');
    return;
  }
  setChartDefaults();
  const defs = getMetricDefs();

  els.metricGridRail.innerHTML = defs.map(d => metricCardHtml(d, 'rail')).join('');
  destroyCharts(RAIL_CHARTS);
  RAIL_CHARTS = defs.map(d => buildChart(`metric-rail-${d.key}`, d));

  // Reveal "Show all" only when the rail actually clips charts. Re-check on
  // resize because the rail max-height tracks the viewport.
  requestAnimationFrame(updateShowAllVisibility);
  window.addEventListener('resize', updateShowAllVisibility, { passive: true });
}

function updateShowAllVisibility() {
  const rail = els.metricGridRail.closest('.rail-right');
  if (!rail) return;
  // The rail is the scroll container (overflow-y: auto on .rail). It clips
  // when its content height exceeds its own client height by more than a
  // pixel — accept a tiny tolerance for sub-pixel rounding.
  const clipped = rail.scrollHeight > rail.clientHeight + 2;
  els.showAllBtn.classList.toggle('hidden', !clipped);
}

function setChartDefaults() {
  const css = getComputedStyle(document.documentElement);
  Chart.defaults.font.family = "'Die Grotesk', sans-serif";
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
  // Matches the screenshot: title centered at the top of the card, plot
  // below with its own muted y-tick labels and HH:MM x-axis. No extra
  // current-value / unit-title chrome — the axis ticks do the talking.
  return `<div class="metric-card-mini">
    <div class="metric-card-title">${escapeHtml(def.title)}</div>
    <canvas id="metric-${where}-${def.key}"></canvas>
  </div>`;
}

function buildChart(canvasId, def) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  const css = getComputedStyle(document.documentElement);
  const color = paletteColor(def.palette);
  const muted = css.getPropertyValue('--text-secondary').trim() || '#6b655a';
  const border = css.getPropertyValue('--border-color').trim() || '#d9d4c8';
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
      elements: { point: { radius: 0 }, line: { borderWidth: 1.4, tension: 0.25 } },
      layout: { padding: { top: 8, right: 10, bottom: 4, left: 4 } },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          border: { color: border },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 4,
            maxRotation: 0,
            callback: tickTime,
            padding: 6,
            font: { size: 10.5 },
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
            font: { size: 10.5 },
            // Unit is suffixed onto the value itself (e.g. "20G", "40°C") so
            // we don't need a separate axis title — matches the screenshot.
            callback: (v) => unitTick(v, def.unit),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          intersect: false,
          mode: 'index',
          titleFont: { size: 12 },
          bodyFont: { size: 12 },
          padding: 10,
          boxPadding: 4,
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

function openMetricsModal() {
  const defs = getMetricDefs();
  els.metricGridModal.innerHTML = defs.map(d => metricCardHtml(d, 'modal')).join('');
  els.metricsModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  // Chart.js needs the canvases to have layout dimensions before construction.
  // The modal is now visible, so we can build them.
  destroyCharts(MODAL_CHARTS);
  MODAL_CHARTS = defs.map(d => buildChart(`metric-modal-${d.key}`, d));
}

function closeMetricsModal() {
  els.metricsModal.classList.add('hidden');
  document.body.style.overflow = '';
  destroyCharts(MODAL_CHARTS);
}

function setupMetricsModal() {
  els.showAllBtn.addEventListener('click', openMetricsModal);
  // Primary entry point from the trace toolbar — visible at every width
  // so the metrics are always one click away, including when the
  // right rail is hidden on narrower viewports.
  const toolbarBtn = document.getElementById('open-metrics-btn');
  if (toolbarBtn) toolbarBtn.addEventListener('click', openMetricsModal);
  els.metricsModal.querySelectorAll('[data-modal-close]').forEach(el =>
    el.addEventListener('click', closeMetricsModal));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !els.metricsModal.classList.contains('hidden')) closeMetricsModal();
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
    els.judge.innerHTML = '<p class="muted">No judge_output.json for this run.</p>';
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
  els.judge.innerHTML = `<div class="judge-stream">${items.join('') || '<p class="muted">(no renderable judge items)</p>'}</div>`;
}

function renderJudgeVerdicts() {
  const ix = RECORD.index_row;
  const cards = [];
  const verdicts = [
    {
      label: 'Data contamination',
      text: ix.contamination || '(no judgement)',
      good: ix.contamination && /no contamination/i.test(ix.contamination),
      bad:  ix.contamination && !/no contamination/i.test(ix.contamination),
    },
    {
      label: 'Disallowed model use',
      text: ix.disallowed_model || '(no judgement)',
      good: ix.disallowed_model && /only allowed/i.test(ix.disallowed_model),
      bad:  ix.disallowed_model && !/only allowed/i.test(ix.disallowed_model),
    },
  ];
  for (const v of verdicts) {
    const cls = v.good ? 'good' : (v.bad ? 'bad' : '');
    const icon = v.good ? '✓' : (v.bad ? '!' : '?');
    cards.push(`<div class="verdict-card ${cls}">
      <span class="verdict-icon">${icon}</span>
      <div class="verdict-body">
        <span class="verdict-label">${escapeHtml(v.label)}</span>
        <span class="verdict-text">${escapeHtml(v.text)}</span>
      </div>
    </div>`);
  }
  els.judgeVerdicts.innerHTML = `<div class="verdict-row">${cards.join('')}</div>`;
}

// ---------- Workspace (lazy on tab activation) -------------------------

async function loadWorkspace() {
  if (WORKSPACE_LOADED) return;
  WORKSPACE_LOADED = true;
  const resp = await fetch(`${DATA_BASE}${encodeURIComponent(RUN_ID)}.workspace.json`, { cache: 'no-store' });
  if (!resp.ok) {
    els.wsTree.innerHTML = '<p class="muted">No workspace data.</p>';
    return;
  }
  WORKSPACE = await resp.json();
  renderWorkspace();
}

function renderWorkspace() {
  const files = WORKSPACE.files || [];
  const byDir = new Map();
  for (const f of files) {
    const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '.';
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(f);
  }
  const dirs = [...byDir.keys()].sort();
  const lines = [];
  for (const d of dirs) {
    lines.push(`<div class="ws-dir">${escapeHtml(d)}/</div>`);
    for (const f of byDir.get(d)) {
      const name = f.path.split('/').pop();
      const skipped = !f.inlined;
      lines.push(`<div class="ws-file ${skipped ? 'skipped' : ''}" data-path="${escapeHtml(f.path)}" title="${escapeHtml(f.skipped_reason || 'inlined')}">${escapeHtml(name)} <span class="size">${fmtBytes(f.size)}</span></div>`);
    }
  }
  els.wsTree.innerHTML = lines.join('');
  els.wsTree.querySelectorAll('.ws-file').forEach(el => {
    el.addEventListener('click', () => {
      const path = el.dataset.path;
      const f = files.find(x => x.path === path);
      if (!f) return;
      els.wsTree.querySelectorAll('.ws-file.active').forEach(x => x.classList.remove('active'));
      el.classList.add('active');
      showWorkspaceFile(f);
    });
  });
}

function showWorkspaceFile(f) {
  const header = `<h4>${escapeHtml(f.path)} <span class="muted" style="font-weight:400">(${fmtBytes(f.size)})</span></h4>`;
  if (!f.inlined) {
    els.wsFile.innerHTML = `${header}<p class="muted">Not inlined: ${escapeHtml(f.skipped_reason || '?')}</p>`;
    return;
  }
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
  els.wsFile.innerHTML = header + code;
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

  // Initial state from hash (?tab=judge or #tab=judge), else first tab.
  const hashTab = new URLSearchParams(location.hash.slice(1)).get('tab') || params.get('tab');
  let active = (hashTab && sections.has(hashTab)) ? hashTab : btns[0].dataset.tab;
  selectTab(active);

  els.tabNav.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    selectTab(btn.dataset.tab);
  });

  function selectTab(name) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    for (const [k, sec] of sections) sec?.classList.toggle('active', k === name);
    history.replaceState(null, '', '#tab=' + encodeURIComponent(name));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'workspace') loadWorkspace();
  }
}

// ---------- Trace control listeners ------------------------------------


// ---------- Utils ------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function fmtNum(v) {
  if (typeof v !== 'number') return escapeHtml(String(v));
  if (Math.abs(v) >= 1000) return v.toLocaleString();
  if (Math.abs(v) >= 100) return v.toFixed(0);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}
function fmt(v, decimals = 0) {
  if (v == null) return '—';
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
  if (ms == null) return '—';
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
  return '—';
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
