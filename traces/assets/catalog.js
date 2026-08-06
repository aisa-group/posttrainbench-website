// Shared catalog state, labels, filtering, and ordering for the traces pages.
// Keeping this logic in one place prevents model aliases from drifting between
// the landing table, filters, and individual run summaries.
(function () {
  const DEFAULT_STATE = Object.freeze({
    benchmark: '',
    model: '',
    agent: '',
    experiment: '',
    q: '',
    group: 'task',
    sort: 'accuracy-desc',
    open: '',
  });

  const BENCHMARK_ORDER = [
    'aime2025', 'aime2024',
    'gpqamain', 'gpqa_main', 'gpqa',
    'healthbench',
    'humaneval', 'mbpp', 'livecodebench', 'swebench',
    'arena_hard', 'arenahard', 'arenahardwriting',
    'gsm8k', 'math500', 'minervamath',
    'mmlu', 'ifeval',
    'bfcl',
  ];

  const MODEL_ORDER = [
    'Qwen_Qwen3-4B-Base',
    'google_gemma-3-4b-pt',
    'HuggingFaceTB_SmolLM3-3B-Base',
    'Qwen_Qwen3-1.7B-Base',
  ];

  function orderIndex(orderList, value) {
    if (!value) return Infinity;
    const normalized = String(value).toLowerCase();
    for (let i = 0; i < orderList.length; i++) {
      if (orderList[i].toLowerCase() === normalized) return i;
    }
    return Infinity;
  }

  function readState(input) {
    const params = input instanceof URLSearchParams
      ? input
      : new URLSearchParams(typeof input === 'string' ? input : window.location.search);
    const group = ['task-model', 'task', 'experiment', 'none'].includes(params.get('group'))
      ? params.get('group')
      : DEFAULT_STATE.group;
    const sort = ['accuracy-desc', 'accuracy-asc', 'cost-desc', 'turns-desc', 'duration-desc'].includes(params.get('sort'))
      ? params.get('sort')
      : DEFAULT_STATE.sort;
    return {
      benchmark: params.get('benchmark') || '',
      model: params.get('model') || '',
      agent: params.get('agent') || '',
      experiment: params.get('experiment') || '',
      q: params.get('q') || '',
      group,
      sort,
      open: params.get('open') || '',
    };
  }

  function writeState(url, state) {
    const next = new URL(url.toString());
    for (const key of Object.keys(DEFAULT_STATE)) next.searchParams.delete(key);
    for (const [key, value] of Object.entries(state)) {
      if (value == null || value === '' || value === DEFAULT_STATE[key]) continue;
      next.searchParams.set(key, value);
    }
    return next;
  }

  function prettyBenchmark(value) {
    if (!value) return '';
    const map = {
      healthbench: 'HealthBench', humaneval: 'HumanEval',
      aime2025: 'AIME 2025', aime2024: 'AIME 2024',
      gsm8k: 'GSM8K', bfcl: 'BFCL',
      math500: 'MATH-500', mmlu: 'MMLU', mbpp: 'MBPP',
      swebench: 'SWE-bench', arena_hard: 'Arena Hard', arenahard: 'Arena Hard',
      arenahardwriting: 'Arena Hard (writing)',
      ifeval: 'IFEval', gpqa: 'GPQA', gpqamain: 'GPQA', gpqa_main: 'GPQA',
      livecodebench: 'LiveCodeBench', minervamath: 'Minerva Math',
    };
    return map[String(value).toLowerCase()] || value;
  }

  function prettyTrainedModel(name) {
    if (!name) return '';
    let value = name.replace(/^[^_]+_/, '');
    value = value.replace(/-(Base|pt|PT|base)$/, '');
    value = value.replace(/^Qwen3-(\d+(?:\.\d+)?B)$/i, (_, size) => `Qwen 3 ${size}`);
    value = value.replace(/^Qwen3-(\d+(?:\.\d+)?B)/i, (_, size) => `Qwen 3 ${size}`);
    value = value.replace(/^SmolLM3-(\d+(?:\.\d+)?B)/i, (_, size) => `SmolLM3 ${size}`);
    value = value.replace(/^gemma-(\d+)-(\d+(?:\.\d+)?)b/i, (_, generation, size) => `Gemma ${generation} ${size}B`);
    return value;
  }

  function cap(value) {
    return value ? value[0].toUpperCase() + value.slice(1) : value;
  }

  function prettyAgent(name) {
    if (!name) return '';
    let value = String(name);
    let annotation = '';
    value = value.replace(/\[([^\]]+)\]\s*$/, (_, item) => {
      annotation = ` (${item.toUpperCase()})`;
      return '';
    });
    // Strip an OpenCode-style provider prefix (`opencode/...`, `zai/...`) —
    // the model portion below carries the identity; experiment name already
    // encodes provider.
    value = value.replace(/^(?:opencode|zai)\//i, '');
    // Claude family — opus/sonnet/haiku/fable; minor version optional
    // (Opus 5 / Fable 5 ship as major-only).
    value = value.replace(/^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?$/i,
      (_, family, major, minor) => `Claude ${cap(family)} ${major}${minor ? '.' + minor : ''}`);
    value = value.replace(/^gpt-([\d.]+)(?:-(.+))?$/i, (_, version, tail) =>
      `GPT ${version}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
    value = value.replace(/^gemini-([\d.]+)(?:-(.+))?$/i, (_, version, tail) =>
      `Gemini ${version}${tail ? ' ' + tail.split('-').map(cap).join(' ') : ''}`);
    // Non-family model IDs whose raw form isn't friendly on the page.
    // Keep this list conservative — only aliases that ship in the corpus.
    value = value.replace(/^kismet-\d+$/i,                             'Kimi K3');
    value = value.replace(/^kimi-k([\d.]+)(-thinking)?$/i,
                          (_, ver, th) => `Kimi K${ver}${th ? ' Thinking' : ''}`);
    value = value.replace(/^glm-([\d.]+)(?:-free|-preview)?$/i,        (_, ver) => `GLM ${ver}`);
    value = value.replace(/^minimax-m([\d.]+)(?:-free)?$/i,            (_, ver) => `MiniMax M${ver}`);
    value = value.replace(/^qwen3-max(?:-\d{4}-\d{2}-\d{2})?$/i,       'Qwen3 Max');
    // Match both kebab (from experiment names) and "Cursor Grok 4.5 High"
    // (spaced title-case, what Cursor CLI itself reports).
    value = value.replace(/^(?:cursor[\s-])?grok[\s-]4\.5(?:[\s-]high)?$/i, 'Grok 4.5');
    return value + annotation;
  }

  function prettyAgentForRun(run) {
    if (!run) return '';
    const base = prettyAgent(run.agent_model);
    const experiment = String(run.experiment || '').toLowerCase();
    if (!/(?:^|[_/-])reprompt(?:ed)?(?:[_/-]|$)/.test(experiment)) return base;
    const match = /^(.*?)\s+\(([^)]+)\)\s*$/.exec(base);
    return match ? `${match[1]} (${match[2]}, reprompted)` : `${base} (reprompted)`;
  }

  function filterRuns(runs, state) {
    const query = String(state.q || '').trim().toLowerCase();
    return runs.filter(run => {
      if (state.experiment && run.experiment !== state.experiment) return false;
      if (state.benchmark && run.benchmark !== state.benchmark) return false;
      if (state.model && run.trained_model !== state.model) return false;
      if (state.agent && run.agent_model !== state.agent) return false;
      if (!query) return true;
      const haystack = [
        run.run_id, run.experiment, run.benchmark, run.trained_model,
        run.seed, run.agent_model, prettyAgent(run.agent_model),
        prettyAgentForRun(run), prettyTrainedModel(run.trained_model),
        prettyBenchmark(run.benchmark),
        // index_row now carries only {flagged} — justification is on the per-run
        // page. Expose the flag state as text so "flagged" / "clean" still match.
        run.contamination && (run.contamination.flagged ? 'contamination flagged' : 'contamination clean'),
        run.disallowed_model && (run.disallowed_model.flagged ? 'disallowed model flagged' : 'disallowed model clean'),
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(query);
    });
  }

  function sorter(sort) {
    switch (sort) {
      case 'accuracy-asc': return (a, b) => (a.accuracy ?? Infinity) - (b.accuracy ?? Infinity);
      case 'cost-desc': return (a, b) => (b.total_cost_usd ?? 0) - (a.total_cost_usd ?? 0);
      case 'turns-desc': return (a, b) => (b.num_turns ?? 0) - (a.num_turns ?? 0);
      case 'duration-desc': return (a, b) => (b.duration_ms ?? 0) - (a.duration_ms ?? 0);
      case 'accuracy-desc':
      default: return (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1);
    }
  }

  function groupKey(run, mode) {
    switch (mode) {
      case 'task-model': return `${run.benchmark || '?'}|${run.trained_model || '?'}`;
      case 'task': return run.benchmark || '?';
      case 'experiment': return run.experiment || '?';
      default: return '';
    }
  }

  function groupSorter(mode, a, b) {
    if (mode === 'task' || mode === 'task-model') {
      const [aBenchmark, aModel] = a.key.split('|');
      const [bBenchmark, bModel] = b.key.split('|');
      const aBenchmarkIndex = orderIndex(BENCHMARK_ORDER, aBenchmark);
      const bBenchmarkIndex = orderIndex(BENCHMARK_ORDER, bBenchmark);
      if (aBenchmarkIndex !== bBenchmarkIndex) return aBenchmarkIndex - bBenchmarkIndex;
      if (mode === 'task-model') {
        const aModelIndex = orderIndex(MODEL_ORDER, aModel);
        const bModelIndex = orderIndex(MODEL_ORDER, bModel);
        if (aModelIndex !== bModelIndex) return aModelIndex - bModelIndex;
      }
      return a.key.localeCompare(b.key);
    }
    const aBest = a.best ?? -1;
    const bBest = b.best ?? -1;
    if (aBest !== bBest) return bBest - aBest;
    if (a.rows.length !== b.rows.length) return b.rows.length - a.rows.length;
    return a.key.localeCompare(b.key);
  }

  function buildGroups(rows, mode) {
    const groups = new Map();
    for (const run of rows) {
      const key = groupKey(run, mode);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(run);
    }
    return [...groups.entries()].map(([key, groupRows]) => {
      let best = null;
      for (const run of groupRows) {
        if (run.accuracy != null && (best == null || run.accuracy > best)) best = run.accuracy;
      }
      return { key, rows: groupRows, best };
    }).sort((a, b) => groupSorter(mode, a, b));
  }

  function orderedRuns(runs, state) {
    const rows = filterRuns(runs, state).slice().sort(sorter(state.sort));
    if (state.group === 'none') return rows;
    return buildGroups(rows, state.group).flatMap(group => group.rows);
  }

  window.PTB_Catalog = {
    DEFAULT_STATE,
    BENCHMARK_ORDER,
    MODEL_ORDER,
    orderIndex,
    readState,
    writeState,
    prettyBenchmark,
    prettyTrainedModel,
    prettyAgent,
    prettyAgentForRun,
    filterRuns,
    sorter,
    groupKey,
    buildGroups,
    orderedRuns,
  };
})();
