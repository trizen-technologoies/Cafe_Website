import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, SplitText);
gsap.defaults({ ease: 'power3.out' });

export { gsap, ScrollTrigger, SplitText };

export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
export const smallScreen = () => innerWidth < 900 || innerHeight < 560;

let lenis = null;

export function startSmoothScroll() {
  history.scrollRestoration = 'manual';
  if (reducedMotion) return;
  lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function lockScroll(locked) {
  document.documentElement.classList.toggle('is-locked', locked);
  if (!lenis) return;
  if (locked) lenis.stop();
  else lenis.start();
}

/** Glides to an element, a selector or a scroll position in pixels. */
export function scrollToTarget(target, { immediate = false, duration = 1.6 } = {}) {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (element == null) return;
  if (lenis) lenis.scrollTo(element, { immediate, duration, easing: (t) => 1 - (1 - t) ** 4, force: true });
  else if (typeof element === 'number') scrollTo({ top: element, behavior: immediate ? 'auto' : 'smooth' });
  else element.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' });
}

export const scrollY = () => (lenis ? lenis.scroll : window.scrollY);

/** Sizes one line of text so it fills `width` pixels exactly, but no larger than `maxSize` pixels. */
export function fitText(element, width, maxSize = Infinity) {
  element.style.fontSize = '100px';
  const measured = element.getBoundingClientRect().width;
  element.style.fontSize = `${Math.min((100 * width) / measured, maxSize)}px`;
}

export function fontsReady(limit = 2500) {
  return Promise.race([document.fonts.ready, wait(limit)]);
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A promise wrapper for a GSAP tween or timeline. */
export const done = (animation) => new Promise((resolve) => animation.eventCallback('onComplete', resolve));
