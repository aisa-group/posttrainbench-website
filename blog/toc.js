// Marks the contents link of the section being read (aria-current="location").
// A section becomes current once its top passes 30% of the viewport; at the
// very bottom of the page the last section wins, since a short final section
// may never reach that line.
(function () {
    const toc = document.querySelector('.release-toc');
    if (!toc) return;

    const entries = [...toc.querySelectorAll('a[href^="#"]')]
        .map(link => ({ link, target: document.getElementById(link.getAttribute('href').slice(1)) }))
        .filter(entry => entry.target);
    if (entries.length === 0) return;

    let frame = null;
    function update() {
        frame = null;
        const line = window.innerHeight * 0.3;
        let current = -1;
        entries.forEach((entry, index) => {
            if (entry.target.getBoundingClientRect().top <= line) current = index;
        });
        const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
        if (atBottom) current = entries.length - 1;
        entries.forEach((entry, index) => {
            if (index === current) entry.link.setAttribute('aria-current', 'location');
            else entry.link.removeAttribute('aria-current');
        });
    }

    const schedule = () => {
        if (frame === null) frame = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    update();
})();
