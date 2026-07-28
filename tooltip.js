// Custom tooltips. Triggered by `data-tip="..."` on any element. A single
// floating div lives at the <body> level and gets repositioned on mouseover,
// so the tooltip ALWAYS escapes ancestor clipping contexts and pops up
// instantly (no native `title` hover delay).
// Adapted from traces/assets/tooltip.js.

(function () {
  let pop = null;
  let currentTrigger = null;

  function ensurePop() {
    if (pop) return pop;
    pop = document.createElement('div');
    pop.className = 'tt-pop';
    pop.setAttribute('role', 'tooltip');
    document.body.appendChild(pop);
    return pop;
  }

  function show(trigger) {
    const text = trigger.getAttribute('data-tip');
    if (!text) return;
    const el = ensurePop();
    el.textContent = text;
    position(trigger);
    // Positioning also sets the transform origin at the arrow before the
    // entrance starts, so the tooltip feels attached to its trigger.
    el.classList.add('tt-show');
  }

  function position(trigger) {
    if (!pop) return;
    const tRect = trigger.getBoundingClientRect();
    // Use layout dimensions rather than the transformed entrance box so
    // placement matches the tooltip's final size.
    const pRect = { width: pop.offsetWidth, height: pop.offsetHeight };
    const margin = 8;

    // Default: tooltip ABOVE the trigger (arrow points down).
    let top = tRect.top - pRect.height - margin;
    let arrowPos = 'below';     // arrow is on the bottom edge of the tooltip
    if (top < margin) {
      // Flip BELOW when there's no room above.
      top = tRect.bottom + margin;
      arrowPos = 'above';       // arrow on the top edge
    }

    // Horizontal: try to center on the trigger, but clamp to viewport.
    let left = tRect.left + tRect.width / 2 - pRect.width / 2;
    const minLeft = margin;
    const maxLeft = window.innerWidth - pRect.width - margin;
    if (maxLeft < minLeft) {
      // Viewport narrower than the tooltip — just stick to the left edge.
      left = minLeft;
    } else {
      left = Math.max(minLeft, Math.min(maxLeft, left));
    }

    // The arrow x-position is measured from the tooltip's left edge,
    // pointing at the trigger's horizontal center. Clamp inside the
    // tooltip body so the arrow stays visually attached even when the
    // trigger is at the screen edge.
    const triggerCenterX = tRect.left + tRect.width / 2;
    const rawArrowX = triggerCenterX - left;
    const arrowX = Math.max(14, Math.min(pRect.width - 14, rawArrowX));

    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    pop.dataset.arrowPos = arrowPos;
    pop.style.setProperty('--tt-arrow-x', arrowX + 'px');
  }

  function hide() {
    if (pop) pop.classList.remove('tt-show');
    currentTrigger = null;
  }

  document.addEventListener('mouseover', (e) => {
    const trigger = e.target.closest('[data-tip]');
    if (!trigger) return;
    if (trigger !== currentTrigger) {
      currentTrigger = trigger;
      show(trigger);
    }
  });

  document.addEventListener('mouseout', (e) => {
    const trigger = e.target.closest('[data-tip]');
    if (!trigger) return;
    // Don't hide if the cursor just moved between two descendants of
    // the same trigger.
    if (e.relatedTarget && trigger.contains(e.relatedTarget)) return;
    if (trigger === currentTrigger) hide();
  });

  // Hide on any scroll or resize — the trigger may have moved.
  window.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide, { passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
})();
