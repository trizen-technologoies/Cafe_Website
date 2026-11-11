import { SplitText, ScrollTrigger, gsap, reducedMotion, scrollToTarget, wait } from '../lib/motion.js';
import { MenuCard } from './card.js';
import { Film } from './film.js';
import { Flare, Mist, Motes, Rain, pointerDepth } from './fx.js';
import { Ink, londonHour, longDate, nextSlot, spokenTime } from './ink.js';
import { PageTurn } from './turn.js';

// The open book in the last frame of its shot, as fractions of the frame (clockwise from top left).
const BOOK_PAGES = [
  [[0.181, 0.367], [0.431, 0.347], [0.531, 0.822], [0.219, 0.883]],
  [[0.4375, 0.347], [0.678, 0.296], [0.853, 0.728], [0.547, 0.824]],
];

// How far you scroll, in screen heights (×100), for each second of film and at each stop.
const SCROLL_PER_SECOND = 26;
const STOP_LENGTH = [34, 46, 46, 50, 42, 50, 80, 50, 18];
const TURN_LENGTH = 110;
const CARD_LENGTH = 150;
const END_LENGTH = 40;

function greeting() {
  const hour = londonHour();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// Words for each stop on the way in, from the sky to the table.
const COPY = [
  { kicker: 'Morrow · London', title: 'Somewhere above<br /><em>the evening rain,</em>' },
  { title: 'there’s a corner that<br /><em>glows a little warmer.</em>' },
  { kicker: 'Since 2014', title: 'Coffee, bakes<br /><em>&amp; kind company.</em>' },
  { title: 'Come in out<br /><em>of the rain.</em>' },
  { kicker: 'Welcome to Morrow', title: '<em>Mind</em> the step.' },
  () => ({ kicker: 'We’ve been expecting you', title: `${greeting()}.`, place: 'top', size: 'small' }),
  { kicker: 'The book', title: '<em>Ah,</em> there you are.', place: 'top' },
  { title: 'Your table,<br /><em>by the window.</em>' },
  null,
];

const lerp = (a, b, t) => a + (b - a) * t;

/** Reads a value off a list of [time, value] points. */
function curve(points, t) {
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [t1, v1] = points[i];
    if (t <= t1) {
      const [t0, v0] = points[i - 1];
      return lerp(v0, v1, (t - t0) / (t1 - t0 || 1));
    }
  }
  return points[points.length - 1][1];
}

const bell = (t, centre, width) => Math.max(0, 1 - Math.abs(t - centre) / width);

export class Hero {
  constructor(root, plan) {
    this.root = root;
    this.plan = plan;
    this.frame = root.querySelector('[data-frame]');
    this.poster = root.querySelector('[data-poster]');
    this.copy = root.querySelector('[data-copy]');
    this.count = root.querySelector('[data-count]');
    this.inkLayer = root.querySelector('[data-ink]');
    const stage = root.querySelector('[data-stage]');
    this.film = new Film(root.querySelector('[data-videos]'), plan.fps);
    const size = this.film.size;
    this.rain = new Rain(root.querySelector('[data-rain]'));
    this.motes = new Motes(root.querySelector('[data-motes]'));
    this.mist = new Mist(root.querySelector('[data-mist]'));
    this.flare = new Flare(root.querySelector('[data-flare]'));
    this.depth = pointerDepth(stage, this.frame, [this.rain, this.motes]);
    this.ink = new Ink(this.inkLayer, BOOK_PAGES);
    this.turn = new PageTurn(root.querySelector('[data-turn]'), `media/hero/rest-6${size}.webp`, `media/hero/turn-next${size}.webp`);
    this.card = new MenuCard(root.querySelector('[data-card]'), this.frame, root.querySelector('[data-shade]'));

    this.seconds = plan.stops.map((frame) => frame / plan.fps);
    this.turnTime = plan.turn / plan.fps;
    this.cloudTime = plan.joins.cloud / plan.fps;
    this.lightTime = plan.joins.light / plan.fps;
    this.track = this.buildTrack();
    this.length = this.track.at(-1).end;
    root.style.setProperty('--hero-length', this.length);
    root.querySelector('[data-total]').textContent = String(this.seconds.length).padStart(2, '0');

    const s = this.seconds;
    this.rainCurve = [[0, 0.35], [s[1], 0.5], [s[2], 0.75], [s[3], 0.9], [this.lightTime - 0.6, 0.6], [this.lightTime, 0]];
    this.moteCurve = [[this.lightTime, 0], [s[4], 0.5], [s[5], 0.8], [s[6], 0.6], [s[7], 0.8], [s[8], 0.4]];

    this.shown = -1;
    this.stop = 0;
    this.started = false;
    gsap.set(this.frame, { scale: 1.03 });
    gsap.set(this.inkLayer, { opacity: 0 });
    this.writeBook();
    this.bindUi();
  }

  /** Lays the film, the stops, the page turn and the menu card end to end along the scroll. */
  buildTrack() {
    const track = [];
    let at = 0;
    const add = (part) => {
      track.push({ ...part, start: at, end: at + part.length });
      at += part.length;
    };
    const s = this.seconds;
    // A stretch of film between two different shots that should be passed through quickly,
    // never rested on: the street dissolving into the walk to the door (frames 15 to 31 after
    // the shopfront stop, as built by scripts/prepare_media.py).
    const fps = this.plan.fps;
    const quick = [[s[2] + 14 / fps, s[2] + 32 / fps]];
    const addFilm = (index, from, to) => {
      let at = from;
      for (const [a, b] of quick) {
        if (b <= from || a >= to) continue;
        if (a > at) add({ kind: 'film', index, from: at, to: a, length: (a - at) * SCROLL_PER_SECOND, of: [from, to] });
        add({ kind: 'film', index, from: Math.max(a, at), to: Math.min(b, to), length: 2, of: [from, to] });
        at = Math.min(b, to);
      }
      if (to > at) add({ kind: 'film', index, from: at, to, length: (to - at) * SCROLL_PER_SECOND, of: [from, to] });
    };
    s.forEach((time, index) => {
      add({ kind: 'stop', index, time, length: STOP_LENGTH[index] });
      if (index === 6) {
        add({ kind: 'turn', index, length: TURN_LENGTH });
        addFilm(index, this.turnTime, s[7]);
      } else if (index < s.length - 1) {
        addFilm(index, time, s[index + 1]);
      }
    });
    add({ kind: 'card', index: 8, length: CARD_LENGTH });
    add({ kind: 'stop', index: 8, time: s[8], length: END_LENGTH, open: true });
    return track;
  }

  writeBook() {
    const { weekday, date } = longDate(new Date());
    const slot = nextSlot();
    this.ink.set([
      [{ text: weekday }, { text: date }, { rule: true }, { text: 'Evening service', small: true }],
      [{ text: 'A table by' }, { text: 'the window,' }, { text: slot ? `at ${spokenTime(slot)}.` : 'first thing tomorrow.' }, { text: '~ M.', indent: 200 }],
    ]);
  }

  /* ---------- Arrival ---------- */

  /** Shows the loader until the film can play, then opens on the sky. */
  async intro(element) {
    const bar = element.querySelector('[data-intro-bar]');
    const word = element.querySelector('[data-intro-word]');
    const letters = SplitText.create(word, { type: 'chars' }).chars;
    gsap.from(letters, { opacity: 0, filter: 'blur(14px)', yPercent: 30, duration: 1.6, stagger: 0.07, ease: 'power2.out' });

    const started = performance.now();
    await new Promise((resolve) => {
      const check = () => {
        const loaded = this.film.progress();
        const elapsed = performance.now() - started;
        gsap.to(bar, { scaleX: Math.max(Math.min(loaded / 0.25, 1), Math.min(elapsed / 7000, 0.9)), duration: 0.4, overwrite: true });
        if ((this.film.forward.readyState >= 3 && (loaded > 0.25 || elapsed > 3500)) || elapsed > 10000) resolve();
        else setTimeout(check, 120);
      };
      check();
    });
    await wait(Math.max(0, 1900 - (performance.now() - started)));

    gsap
      .timeline()
      .to(bar, { scaleX: 1, duration: 0.3 })
      .to(letters, { opacity: 0, filter: 'blur(18px)', yPercent: -20, duration: 1.1, stagger: { each: 0.05, from: 'center' }, ease: 'power2.in' })
      .to(element.querySelectorAll('.intro__note, .intro__bar'), { opacity: 0, duration: 0.5 }, '<')
      .to(element, { opacity: 0, duration: 1.4, ease: 'power2.inOut' }, '-=0.6')
      .set(element, { display: 'none' });
    await wait(1300);
    this.started = true;
    document.documentElement.classList.remove('is-loading');
    ScrollTrigger.create({
      trigger: this.root,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => this.update(self.progress * this.length),
      onRefresh: (self) => this.update(self.progress * this.length),
    });
    this.update(0);
  }

  /* ---------- Following the scroll ---------- */

  update(position) {
    const part = this.track.find((p) => position < p.end) || this.track.at(-1);
    const q = Math.min(1, Math.max(0, (position - part.start) / part.length));
    const before = (kind) => this.track.findIndex((p) => p.kind === kind) > this.track.indexOf(part);

    let time;
    let along = q; // how far through the whole move between two stops
    if (part.kind === 'film') {
      time = lerp(part.from, part.to, q);
      along = (time - part.of[0]) / (part.of[1] - part.of[0]);
    }
    else if (part.kind === 'turn') time = q > 0 ? this.turnTime : this.seconds[6];
    else if (part.kind === 'card') time = this.seconds[8];
    else time = part.time;

    if (reducedMotion) this.showPoster(part.index);
    else this.film.seek(time);

    this.rain.level = reducedMotion ? 0 : curve(this.rainCurve, time);
    this.motes.level = reducedMotion ? 0 : time > this.lightTime ? curve(this.moteCurve, time) : 0;
    this.mist.set(reducedMotion ? 0 : Math.min(1, bell(time, this.cloudTime, 0.75) * 1.15) * 0.75);
    this.flare.set(reducedMotion ? 0 : bell(time, this.lightTime, 0.55));

    // The page turn and the menu card follow the scroll exactly.
    const turning = part.kind === 'turn' ? q : before('turn') ? 0 : 1;
    const atBook = (part.kind === 'stop' && part.index === 6) || (part.kind === 'film' && part.index === 5 && along > 0.92);
    this.setInk(atBook, turning > 0 && turning < 1);
    this.turn.set(turning, this.inkLayer);
    const card = part.kind === 'card' ? q : before('card') ? 0 : 1;
    this.depth.hold(time >= this.seconds[8] - 0.5);
    this.card.set(card);
    this.root.classList.toggle('is-menu-open', card > 0.6);

    // Words and handwriting arrive with each stop and leave once you move on.
    let stop = part.index;
    if (part.kind === 'film' && along > 0.5) stop = part.index + 1;
    if (part.kind === 'turn' && q > 0.5) stop = 7;
    if (stop !== this.stop) {
      this.stop = stop;
      this.count.textContent = String(stop + 1).padStart(2, '0');
    }
    let words = -1;
    if (part.kind === 'stop') words = part.index;
    else if (part.kind === 'film' && along < 0.25 && part.index !== 6) words = part.index;
    else if (part.kind === 'film' && along > 0.92) words = part.index + 1;
    this.setWords(words);
  }

  setWords(index) {
    if (index === this.shown) return;
    this.shown = index;
    const copy = COPY[index];
    if (!copy) this.hideCopy();
    else this.showCopy(typeof copy === 'function' ? copy() : copy);
  }

  /**
   * The host writes in the book the first time you reach it. The writing stays on the page
   * (the turning page carries a copy of it) and shows whenever you rest at the book.
   */
  setInk(atBook, turning) {
    if ((atBook || turning) && !this.inkWritten) {
      this.inkWritten = true;
      this.inkShown = true;
      if (turning) this.ink.show();
      else this.ink.write({ delay: 0.2 });
    }
    if (this.inkWritten && atBook !== this.inkShown) {
      this.inkShown = atBook;
      gsap.to(this.inkLayer, { opacity: atBook ? 1 : 0, duration: 0.3, overwrite: true });
    }
  }

  showPoster(index) {
    if (this.posterIndex === index) return;
    this.posterIndex = index;
    const next = this.poster.cloneNode();
    next.src = `media/hero/rest-${index}${this.film.size}.webp`;
    this.frame.insertBefore(next, this.poster.nextSibling);
    gsap.fromTo(next, { opacity: 0 }, {
      opacity: 1,
      duration: 0.6,
      onComplete: () => {
        this.poster.src = next.src;
        next.remove();
      },
    });
  }

  showCopy({ kicker, title, place = 'bottom', size = 'large' }) {
    this.copyTween?.kill();
    this.copy.dataset.place = place;
    this.copy.dataset.size = size;
    this.copy.innerHTML = `${kicker ? `<p class="label hero__kicker">${kicker}</p>` : ''}<h2 class="hero__title">${title}</h2>`;
    const heading = this.copy.querySelector('.hero__title');
    const lines = SplitText.create(heading, { type: 'lines', mask: 'lines' }).lines;
    gsap.set(this.copy, { autoAlpha: 1, y: 0 });
    this.copyTween = gsap.timeline({ delay: 0.05 });
    if (kicker) this.copyTween.from(this.copy.querySelector('.hero__kicker'), { opacity: 0, y: 10, duration: 0.8 }, 0);
    this.copyTween
      .from(lines, { yPercent: 110, duration: 1.1, stagger: 0.1, ease: 'power4.out' }, 0.05)
      .fromTo(heading, { '--soft': 100 }, { '--soft': 0, duration: 2.2, ease: 'power2.out' }, 0);
  }

  hideCopy() {
    this.copyTween?.kill();
    this.copyTween = gsap.to(this.copy, { autoAlpha: 0, y: -12, duration: 0.4, ease: 'power2.in' });
  }

  /* ---------- Buttons ---------- */

  /** The scroll position at which a stop begins. */
  scrollFor(index) {
    const part = this.track.find((p) => p.kind === 'stop' && p.index === index);
    const top = this.root.offsetTop;
    const travel = this.root.offsetHeight - innerHeight;
    return top + (part.start / this.length) * travel + 2;
  }

  bindUi() {
    this.root.querySelector('[data-next]').addEventListener('click', () => {
      const next = Math.min(this.stop + 1, this.seconds.length - 1);
      scrollToTarget(this.scrollFor(next), { duration: 2.4 });
    });
    this.root.querySelector('[data-skip-hero]').addEventListener('click', () => scrollToTarget('#menu', { duration: 2 }));
  }
}
