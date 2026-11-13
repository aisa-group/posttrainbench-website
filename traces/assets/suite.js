// Which runs the pages show. config.js sets PostTrainBench's; `?suite=<name>` picks
// another from window.PTB_SUITES, whose settings replace config.js's (only settings
// listed there: the URL picks a suite, never a value). posttrainbench.com/max/traces/
// forwards to ?suite=max. Links between the pages keep the suite (window.PTB_SUITE).
(function () {
  const name = new URLSearchParams(window.location.search).get('suite');
  const suites = window.PTB_SUITES || {};
  const suite = name && Object.prototype.hasOwnProperty.call(suites, name) ? suites[name] : null;
  if (!suite) return;
  window.PTB_SUITE = name;
  for (const [key, value] of Object.entries(suite.config || {})) window[key] = value;
  document.addEventListener('DOMContentLoaded', () => {
    const sub = document.querySelector('.logo-sub');
    if (sub && suite.label) {
      sub.textContent = `/ ${suite.label}`;
      sub.href = suite.home || `?suite=${encodeURIComponent(name)}`;
    }
    const back = document.getElementById('back-link');
    if (back && back.getAttribute('href') === 'index.html') {
      back.href = `index.html?suite=${encodeURIComponent(name)}`;
    }
  });
})();
