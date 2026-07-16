// Shared light/dark toggle. Persists choice in localStorage as `theme`.
(function () {
  const root = document.documentElement;
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeTransition = null;

  const updateLabel = theme => {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  };

  const commitTheme = next => {
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateLabel(next);
    window.dispatchEvent(new CustomEvent('ptb:themechange', { detail: { theme: next } }));
  };

  updateLabel(root.getAttribute('data-theme') || 'light');
  btn.addEventListener('click', event => {
    const cur = root.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';

    if (event.detail !== 0 && !reducedMotion.matches && typeof document.startViewTransition === 'function') {
      activeTransition?.skipTransition();
      const transition = document.startViewTransition(() => commitTheme(next));
      activeTransition = transition;
      transition.finished
        .catch(() => {})
        .finally(() => {
          if (activeTransition === transition) activeTransition = null;
        });
    } else {
      commitTheme(next);
    }
  });
})();
