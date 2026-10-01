(function () {
    var hamburgerBtn = document.getElementById('hamburger-btn');
    var navLinks = document.getElementById('nav-links');

    if (!hamburgerBtn || !navLinks) return;

    // Scroll position when the menu opened; null while it is closed.
    var openScrollY = null;

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
        openScrollY = isOpen ? window.scrollY : null;
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

    // Scrolling the page means the reader has moved on: close the menu instead
    // of leaving it over the content. A small threshold ignores incidental drags.
    window.addEventListener('scroll', function () {
        if (openScrollY !== null && Math.abs(window.scrollY - openScrollY) > 12) {
            setMobileNavOpen(false, false);
        }
    }, { passive: true });

    // The hamburger layout applies up to 950px; close the menu once the full
    // nav bar takes over.
    window.addEventListener('resize', function () {
        if (window.innerWidth > 950 && navLinks.classList.contains('active')) {
            setMobileNavOpen(false, true);
        }
    });
})();
