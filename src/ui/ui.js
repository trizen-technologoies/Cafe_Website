import { Rain } from '../hero/fx.js';
import { SplitText, ScrollTrigger, finePointer, fitText, gsap, reducedMotion, scrollToTarget } from '../lib/motion.js';

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
}

export function initCursor() {
  const cursor = document.querySelector('[data-cursor]');
  if (!finePointer || reducedMotion) {
    cursor.remove();
    return;
  }
  const label = cursor.querySelector('[data-cursor-label]');
  const moveX = gsap.quickTo(cursor, 'x', { duration: 0.35, ease: 'power3.out' });
  const moveY = gsap.quickTo(cursor, 'y', { duration: 0.35, ease: 'power3.out' });
  addEventListener('pointermove', (event) => {
    moveX(event.clientX);
    moveY(event.clientY);
    const target = event.target instanceof Element ? event.target : null;
    const hover = target?.closest('a, button, input, select, label, [data-cursor]');
    const text = target?.closest('[data-cursor]')?.dataset.cursor || '';
    cursor.classList.toggle('is-hover', Boolean(hover) && !text);
    cursor.classList.toggle('has-label', Boolean(text));
    label.textContent = text;
    cursor.classList.add('is-on');
  });
  document.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
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
    const lines = SplitText.create(heading, { type: 'lines', mask: 'lines' }).lines;
    gsap.from(lines, {
      yPercent: 110,
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
  const fit = () => fitText(word, word.parentElement.clientWidth - 2 * parseFloat(getComputedStyle(word.parentElement).paddingLeft));
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
