// Expand/collapse cue for the viewer's main disclosures (run-list groups,
// judge verdicts, the judge trace), matching the foldables on the main site.
// The body fades and settles 4px on open (180ms) and fades out faster on
// close (140ms); the <details> stays open until the exit finishes. Clicks
// reverse from the live state, keyboard and reduced motion toggle instantly.
// Frequent, fine-grained toggles (tool calls, thoughts, workspace folders)
// stay instant on purpose.
(function () {
  const SELECTOR = 'details.exp-group, details.verdict-item, details.judge-details';
  const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // Lazily wrap everything but the summary, so it can fade without animating
  // layout. Existing references to the moved children stay valid.
  function setup(fold, summary) {
    if (fold._fold) return fold._fold;
    const body = document.createElement('div');
    body.className = 'fold-anim';
    [...fold.children].filter(el => el !== summary).forEach(el => body.appendChild(el));
    fold.appendChild(body);

    const state = { body, expanded: fold.open, animation: null, timer: null, version: 0 };
    fold._fold = state;
    fold.dataset.expanded = String(state.expanded);

    // Opened or closed by code (e.g. the run list's one-group-at-a-time
    // accordion): follow along so the next click toggles the right way.
    fold.addEventListener('toggle', () => {
      if (fold.dataset.animating) return;
      state.expanded = fold.open;
      fold.dataset.expanded = String(fold.open);
    });
    return state;
  }

  function cancel(state) {
    if (state.timer !== null) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (state.animation) {
      try { state.animation.cancel(); } catch (err) { /* already finished */ }
      state.animation = null;
    }
  }

  function clearInline(fold, state) {
    state.body.style.opacity = '';
    state.body.style.transform = '';
    delete fold.dataset.animating;
  }

  function setInstantly(fold, state) {
    state.version += 1;
    cancel(state);
    fold.open = state.expanded;
    clearInline(fold, state);
  }

  function animateTo(fold, state, shouldExpand) {
    const version = ++state.version;
    const wasRendered = fold.open;
    const presentation = wasRendered ? getComputedStyle(state.body) : null;
    const computedOpacity = wasRendered ? Number.parseFloat(presentation.opacity) : 0;
    const startOpacity = Number.isFinite(computedOpacity) ? computedOpacity : (wasRendered ? 1 : 0);
    const startTransform = !wasRendered || presentation.transform === 'none'
      ? (shouldExpand ? 'translateY(-4px)' : 'none')
      : presentation.transform;

    cancel(state);
    fold.dataset.animating = '1';
    if (shouldExpand && !fold.open) fold.open = true;

    const duration = shouldExpand ? 180 : 140;
    const animation = state.body.animate([
      { opacity: startOpacity, transform: startTransform },
      { opacity: shouldExpand ? 1 : 0, transform: shouldExpand ? 'none' : 'translateY(-3px)' },
    ], { duration, easing: EASE, fill: 'both' });
    state.animation = animation;

    const finish = () => {
      if (version !== state.version) return;
      if (state.timer !== null) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      fold.open = shouldExpand;
      try { animation.cancel(); } catch (err) { /* already finished */ }
      state.animation = null;
      clearInline(fold, state);
    };
    animation.onfinish = finish;
    state.timer = setTimeout(finish, duration + 100);
  }

  document.addEventListener('click', (event) => {
    const summary = event.target.closest('summary');
    const fold = summary && summary.parentElement;
    if (!fold || !fold.matches(SELECTOR)) return;
    // Links and buttons inside a summary keep their own behaviour.
    const control = event.target.closest('a, button');
    if (control && summary.contains(control)) return;

    event.preventDefault();
    const state = setup(fold, summary);
    state.expanded = !state.expanded;
    fold.dataset.expanded = String(state.expanded);

    if (event.detail === 0 || reducedMotion.matches || typeof state.body.animate !== 'function') {
      setInstantly(fold, state);
      return;
    }
    animateTo(fold, state, state.expanded);
  });
})();
