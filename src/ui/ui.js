import { Rain } from '../hero/fx.js';
import { longDate } from '../hero/ink.js';
import { SplitText, ScrollTrigger, finePointer, fitText, gsap, reducedMotion, scrollToTarget } from '../lib/motion.js';

/** Today's date in London, printed like a magazine's issue date. */
export function initEdition() {
  const { weekday, date } = longDate(new Date());
  document.querySelectorAll('[data-edition]').forEach((element) => (element.textContent = `${weekday} ${date}`));
}

/** Links that lead somewhere on the page glide there. */
export function initLinks() {
  document.querySelectorAll('[data-go], [data-release], [data-skip], [data-home]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = link.getAttribute('href');
      if (!target?.startsWith('#')) return;
      event.preventDefault();
      scrollToTarget(target, { duration: target === '#top' ? 2.4 : 1.8 });
    });
  });
}

/** The nav reads light over dark scenes and dark over paper. */
export function initNav() {
  const nav = document.querySelector('[data-nav]');
  document.querySelectorAll('[data-tone]:not([data-nav])').forEach((section) => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top 40px',
      end: 'bottom 40px',
      onToggle: ({ isActive }) => isActive && (nav.dataset.tone = section.dataset.tone),
    });
  });
  ScrollTrigger.create({ trigger: '.hero', start: 'top top', end: 'bottom 40px', onToggle: ({ isActive }) => isActive && (nav.dataset.tone = 'light') });

  // Over the opening film the bar floats on a soft shade. Once the page begins it becomes a solid
  // bar in the colour of the section beneath, so it is readable everywhere and always there.
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'bottom 40px',
    onEnter: () => (nav.dataset.solid = 'true'),
    onLeaveBack: () => (nav.dataset.solid = 'false'),
  });
}

export function initMagnetic() {
  if (!finePointer || reducedMotion) return;
  document.querySelectorAll('[data-magnetic]').forEach((element) => {
    const moveX = gsap.quickTo(element, 'x', { duration: 0.5, ease: 'power3.out' });
    const moveY = gsap.quickTo(element, 'y', { duration: 0.5, ease: 'power3.out' });
    element.addEventListener('pointermove', (event) => {
      const box = element.getBoundingClientRect();
      moveX((event.clientX - box.left - box.width / 2) * 0.28);
      moveY((event.clientY - box.top - box.height / 2) * 0.35);
    });
    element.addEventListener('pointerleave', () => {
      moveX(0);
      moveY(0);
    });
  });
}

/** Headlines rise line by line, paragraphs drift up, photographs move against the scroll. */
export function initReveals() {
  if (reducedMotion) return;
  document.querySelectorAll('main section:not(.hero) [data-rise], .footer [data-rise]').forEach((heading) => {
    const lines = SplitText.create(heading, { type: 'lines', mask: 'lines', linesClass: 'line' }).lines;
    gsap.from(lines, {
      yPercent: 140,
      duration: 1.3,
      stagger: 0.1,
      ease: 'power4.out',
      scrollTrigger: { trigger: heading, start: 'top 85%', once: true },
    });
  });
  document.querySelectorAll('main section:not(.hero) [data-fade]').forEach((element) => {
    gsap.from(element, { opacity: 0, y: 28, duration: 1.1, scrollTrigger: { trigger: element, start: 'top 90%', once: true } });
  });
  document.querySelectorAll('[data-parallax]').forEach((image) => {
    const amount = Number(image.dataset.parallax);
    gsap.fromTo(
      image,
      { yPercent: -amount },
      { yPercent: amount, ease: 'none', scrollTrigger: { trigger: image.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });
  const room = document.querySelector('[data-room-media]');
  gsap.fromTo(
    room,
    { clipPath: 'inset(12% 18% 12% 18% round 4px)' },
    { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none', scrollTrigger: { trigger: room, start: 'top 85%', end: 'top 15%', scrub: true } },
  );
  gsap.from('.reserve__book', {
    rotationX: 18,
    y: 60,
    opacity: 0,
    duration: 1.6,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.reserve', start: 'top 70%', once: true },
  });
}

export function initFooter() {
  const word = document.querySelector('[data-footer-word]');
  // Full width, unless that would make it taller than half the screen (a wide, short window).
  const fit = () =>
    fitText(word, word.parentElement.clientWidth - 2 * parseFloat(getComputedStyle(word.parentElement).paddingLeft), (innerHeight * 0.5) / 0.8);
  fit();
  addEventListener('resize', fit);
  if (reducedMotion) return;
  const letters = SplitText.create(word, { type: 'chars' }).chars;
  gsap.from(letters, {
    yPercent: 100,
    duration: 1.4,
    stagger: 0.06,
    ease: 'power4.out',
    scrollTrigger: { trigger: word, start: 'top 95%', once: true },
  });
}

/** Rain keeps falling over the shopfront at the end of the page. */
export function initClosingRain() {
  const canvas = document.querySelector('[data-close-rain]');
  const rain = new Rain(canvas);
  rain.to(0.7, 0.1);
}
