import { gsap } from '../lib/motion.js';

// Where the blank menu lies on the table in the last frame of the film, as fractions of the frame.
const ON_TABLE = { left: 0.444, top: 0.469, width: 0.134, height: 0.341 };
const PAGE_RATIO = 0.7;

/**
 * The blank menu on the table becomes a real one, as far as the scroll has got: Morrow's name
 * prints onto it, it lifts off the marble towards you and opens.
 */
export class MenuCard {
  constructor(root, frame, shade) {
    this.root = root;
    this.frame = frame;
    this.shade = shade;
    this.book = root.querySelector('[data-card-book]');
    this.cover = root.querySelector('[data-card-cover]');
    this.marks = root.querySelectorAll('[data-card-mark]');
    this.actions = root.querySelector('[data-card-actions]');
    this.progress = 0;
    this.timeline = null;
    gsap.set(root, { autoAlpha: 0 });
    addEventListener('resize', () => {
      this.timeline?.kill();
      this.timeline = null;
      if (this.progress > 0) this.set(this.progress);
    });
  }

  layout() {
    // On a narrow screen an open spread would be unreadably small, so the card lifts closed.
    this.single = innerWidth < 700;
    const pageWidth = this.single
      ? Math.min(innerWidth * 0.66, innerHeight * 0.56 * PAGE_RATIO)
      : Math.min(innerWidth * 0.46, innerHeight * 0.66 * PAGE_RATIO);
    const pageHeight = pageWidth / PAGE_RATIO;
    const left = this.single ? (innerWidth - pageWidth) / 2 : innerWidth / 2;
    const top = Math.max(16, (innerHeight - pageHeight) / 2 - 34);
    Object.assign(this.book.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${pageWidth}px`,
      height: `${pageHeight}px`,
    });
    gsap.set(this.actions, { top: top + pageHeight + 22 });
    return { left, top, width: pageWidth };
  }

  /** Where the card must start so it sits exactly over the menu in the film. */
  onTable(final) {
    const rect = this.frame.getBoundingClientRect();
    const left = rect.left + ON_TABLE.left * rect.width;
    const top = rect.top + ON_TABLE.top * rect.height;
    return { x: left - final.left, y: top - final.top, scale: (ON_TABLE.width * rect.width) / final.width };
  }

  build() {
    const final = this.layout();
    const start = this.onTable(final);
    const timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    timeline
      .set(this.root, { autoAlpha: 1 })
      .fromTo(this.book, { transformOrigin: '0 0', ...start, rotationX: 0, autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 })
      .fromTo(this.marks, { opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.8, stagger: 0.15 })
      .fromTo(this.shade, { opacity: 0 }, { opacity: this.single ? 0.8 : 0.62, duration: 1.4, ease: 'power1.inOut' })
      .to(this.book, { x: 0, y: 0, scale: 1, duration: 1.4, ease: 'power2.inOut' }, '<')
      .to(this.book, { keyframes: { rotationX: [0, 14, 0], ease: 'sine.inOut' }, duration: 1.4 }, '<')
      .fromTo(this.cover, { rotationY: 0 }, { rotationY: this.single ? 0 : -180, duration: 1.3, ease: 'power1.inOut' })
      .fromTo(this.actions, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5 });
    return timeline;
  }

  /** 0 is the blank menu on the table, 1 is the menu open in front of you. */
  set(progress) {
    this.progress = progress;
    if (progress <= 0) {
      if (this.timeline) this.timeline.progress(0);
      gsap.set(this.root, { autoAlpha: 0 });
      gsap.set(this.shade, { opacity: 0 });
      return;
    }
    if (!this.timeline) this.timeline = this.build();
    this.timeline.progress(progress);
  }
}
