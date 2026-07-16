document.addEventListener('DOMContentLoaded', () => {
    // Mobile Menu Logic
    const mobileMenuBtn = document.querySelector('.css-ry0wm7'); // The hamburger button
    const mobileMenuOverlay = document.querySelector('.mobile-menu-overlay');

    if (mobileMenuBtn && mobileMenuOverlay) {
        mobileMenuBtn.addEventListener('click', () => {
            const isOpen = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
            const newState = !isOpen;

            // Toggle ARIA attributes
            mobileMenuBtn.setAttribute('aria-expanded', newState);
            mobileMenuBtn.setAttribute('data-state', newState ? 'open' : 'closed');

            // Toggle Classes for Animation
            mobileMenuBtn.classList.toggle('active');
            mobileMenuOverlay.classList.toggle('open');

            // Toggle Body Scroll
            if (newState) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });
    }

    // Desktop Dropdown Logic
    const dropdownTriggers = document.querySelectorAll('[aria-haspopup="menu"]');

    dropdownTriggers.forEach(trigger => {
        let timeoutId;

        const openMenu = () => {
            clearTimeout(timeoutId);
            trigger.setAttribute('data-state', 'open');
        };

        const closeMenu = () => {
            timeoutId = setTimeout(() => {
                trigger.setAttribute('data-state', 'closed');
            }, 150); // Small delay to allow moving mouse to the content
        };

        trigger.addEventListener('mouseenter', openMenu);
        trigger.addEventListener('mouseleave', closeMenu);
        
        // Also handle focus for keyboard accessibility
        trigger.addEventListener('focusin', openMenu);
        trigger.addEventListener('focusout', closeMenu);
    });
});

// Load and initialize Lenis smooth scrolling dynamically
(function() {
    const lenisScript = document.createElement('script');
    lenisScript.src = 'https://unpkg.com/@studio-freight/lenis@1.0.36/dist/lenis.min.js';
    lenisScript.defer = true;
    lenisScript.onload = () => {
        const initLenis = () => {
            const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth < 1024;
            if (isTouch) {
                // Bind native anchor links scroll fallback
                document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                    anchor.addEventListener('click', function(e) {
                        const targetId = this.getAttribute('href');
                        if (targetId === '#') return;
                        try {
                            const targetElement = document.querySelector(targetId);
                            if (targetElement) {
                                e.preventDefault();
                                targetElement.scrollIntoView({ behavior: 'smooth' });
                            }
                        } catch (err) {
                            // ignore invalid selectors
                        }
                    });
                });
                return;
            }

            const lenis = new Lenis({
                duration: 1.2,
                easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                direction: 'vertical',
                gestureDirection: 'vertical',
                smooth: true,
                mouseMultiplier: 1,
                smoothTouch: false,
                touchMultiplier: 2,
                infinite: false,
            });

            // Request animation frame loop
            function raf(time) {
                lenis.raf(time);
                requestAnimationFrame(raf);
            }
            requestAnimationFrame(raf);

            // Bind anchor links
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function(e) {
                    const targetId = this.getAttribute('href');
                    if (targetId === '#') return;
                    try {
                        const targetElement = document.querySelector(targetId);
                        if (targetElement) {
                            e.preventDefault();
                            lenis.scrollTo(targetElement);
                        }
                    } catch (err) {
                        // ignore invalid selectors
                    }
                });
            });

            window.lenis = lenis;
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initLenis);
        } else {
            initLenis();
        }
    };
    document.head.appendChild(lenisScript);
})();


