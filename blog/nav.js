(function () {
    var hamburgerBtn = document.getElementById('hamburger-btn');
    var navLinks = document.getElementById('nav-links');

    if (!hamburgerBtn || !navLinks) return;

    function setMobileNavOpen(isOpen, instant) {
        if (instant) {
            hamburgerBtn.classList.add('no-motion');
            navLinks.classList.add('no-motion');
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    hamburgerBtn.classList.remove('no-motion');
                    navLinks.classList.remove('no-motion');
                });
            });
        }

        hamburgerBtn.classList.toggle('active', isOpen);
        navLinks.classList.toggle('active', isOpen);
        hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
        hamburgerBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    }

    hamburgerBtn.addEventListener('click', function (event) {
        setMobileNavOpen(!navLinks.classList.contains('active'), event.detail === 0);
    });

    navLinks.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function (event) {
            setMobileNavOpen(false, event.detail === 0);
        });
    });

    document.addEventListener('click', function (event) {
        if (!hamburgerBtn.contains(event.target) && !navLinks.contains(event.target)) {
            setMobileNavOpen(false, false);
        }
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && navLinks.classList.contains('active')) {
            setMobileNavOpen(false, true);
            hamburgerBtn.focus();
        }
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 768 && navLinks.classList.contains('active')) {
            setMobileNavOpen(false, true);
        }
    });
})();
