// ─────────────────────────────────────────────────────────────────────────
// Photo / Debug mode — owner-only presentation aid for taking clean
// screenshots of the leaderboard (e.g. for Twitter).
//
// It is NOT advertised anywhere in the UI. Activate with any of:
//   • type the word "photo" anywhere on the page
//   • append ?photo to the URL (e.g. posttrainbench.com/?photo)
//   • append #photo to the URL
// Press Esc (or the Exit button) to leave.
//
// What it gives you:
//   • Click any leaderboard row to highlight it (click again to un-highlight).
//   • "Dim the rest" fades non-highlighted rows so the highlight pops.
//   • "Clean layout" strips navbar/hero/footnotes/charts down to just the
//     title + table + a posttrainbench.com caption — a tweet-ready frame.
//     Use your OS region-screenshot (Cmd+Shift+4 on Mac) to grab the table;
//     the floating control panel sits in the corner, out of the crop.
// ─────────────────────────────────────────────────────────────────────────
(function () {
    'use strict';

    const HL_CLASS = 'ptb-highlight';
    const highlighted = new Set(); // keyed by agent display name, survives re-renders
    let active = false;
    let cleanMode = false;
    let dimOthers = true;
    let panel = null;
    let observer = null;

    // ── helpers ──────────────────────────────────────────────────────────
    const tbody = () => document.getElementById('leaderboard-data');

    // The agent name lives in the 2nd cell's <strong>, before the
    // .scaffold-label span. Use its leading text node as a stable key.
    function rowKey(row) {
        const strong = row.children[1] && row.children[1].querySelector('strong');
        if (!strong) return '';
        const lead = strong.childNodes[0];
        return ((lead && lead.textContent) || strong.textContent || '').trim();
    }

    function applyHighlights() {
        const body = tbody();
        if (!body) return;
        body.querySelectorAll('tr').forEach((r) => {
            r.classList.toggle(HL_CLASS, highlighted.has(rowKey(r)));
        });
        document.documentElement.toggleAttribute(
            'data-photo-dim',
            dimOthers && highlighted.size > 0
        );
    }

    function onRowClick(e) {
        if (!active) return;
        const row = e.target.closest('#leaderboard-data tr');
        if (!row) return;
        const key = rowKey(row);
        if (!key) return;
        if (highlighted.has(key)) highlighted.delete(key);
        else highlighted.add(key);
        applyHighlights();
    }

    // ── caption (clean-mode branding under the table) ────────────────────
    function ensureCaption() {
        let cap = document.getElementById('ptb-photo-caption');
        if (cap) return cap;
        const table = document.querySelector('.leaderboard-table');
        if (!table) return null;
        cap = document.createElement('div');
        cap.id = 'ptb-photo-caption';
        cap.className = 'ptb-photo-caption';
        cap.textContent = 'posttrainbench.com';
        table.parentNode.insertBefore(cap, table.nextSibling);
        return cap;
    }

    // ── control panel ────────────────────────────────────────────────────
    function buildPanel() {
        panel = document.createElement('div');
        panel.className = 'ptb-photo-panel';
        panel.innerHTML = `
            <div class="ptb-photo-head">
                <span class="ptb-photo-title">Photo mode</span>
                <button class="ptb-photo-x" data-act="exit" title="Exit (Esc)">×</button>
            </div>
            <p class="ptb-photo-hint">Click rows to highlight them.</p>
            <label class="ptb-photo-row">
                <input type="checkbox" data-act="clean"> Clean layout
            </label>
            <label class="ptb-photo-row">
                <input type="checkbox" data-act="dim" checked> Dim the rest
            </label>
            <div class="ptb-photo-btns">
                <button data-act="clear">Clear highlights</button>
                <button data-act="theme">Toggle theme</button>
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('[data-act="exit"]').addEventListener('click', deactivate);
        panel.querySelector('[data-act="clear"]').addEventListener('click', () => {
            highlighted.clear();
            applyHighlights();
        });
        panel.querySelector('[data-act="theme"]').addEventListener('click', () => {
            const t = document.getElementById('theme-toggle');
            if (t) t.click();
        });
        panel.querySelector('[data-act="clean"]').addEventListener('change', (e) => {
            cleanMode = e.target.checked;
            document.documentElement.toggleAttribute('data-photo-clean', cleanMode);
            if (cleanMode) {
                ensureCaption();
                document.querySelector('#leaderboard')?.scrollIntoView();
            }
        });
        panel.querySelector('[data-act="dim"]').addEventListener('change', (e) => {
            dimOthers = e.target.checked;
            applyHighlights();
        });
    }

    // ── activation ───────────────────────────────────────────────────────
    function activate() {
        if (active) return;
        active = true;
        document.documentElement.setAttribute('data-photo', '');
        if (!panel) buildPanel();
        panel.style.display = '';

        // Re-apply highlights whenever the table re-renders (model filter etc.)
        observer = new MutationObserver(() => applyHighlights());
        observer.observe(tbody(), { childList: true });
        applyHighlights();
    }

    function deactivate() {
        if (!active) return;
        active = false;
        cleanMode = false;
        document.documentElement.removeAttribute('data-photo');
        document.documentElement.removeAttribute('data-photo-clean');
        document.documentElement.removeAttribute('data-photo-dim');
        if (panel) {
            panel.style.display = 'none';
            const cleanBox = panel.querySelector('[data-act="clean"]');
            if (cleanBox) cleanBox.checked = false;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    function toggle() {
        active ? deactivate() : activate();
    }

    // ── triggers ─────────────────────────────────────────────────────────
    let typed = '';
    document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;
        if (active && e.key === 'Escape') {
            deactivate();
            return;
        }
        if (e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            typed = (typed + e.key.toLowerCase()).slice(-5);
            if (typed === 'photo') toggle();
        }
    });

    // Delegated row-click highlighting (gated on `active` inside the handler).
    document.addEventListener('click', onRowClick);

    // URL-based activation.
    function maybeAutoActivate() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('photo') || window.location.hash === '#photo') {
            activate();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeAutoActivate);
    } else {
        maybeAutoActivate();
    }
})();
