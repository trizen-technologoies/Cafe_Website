import { gsap } from '../lib/motion.js';
import { placeOnQuad } from '../lib/quad.js';

/**
 * Handwriting that appears on the pages of a photographed book. Each page is a flat sheet of
 * text projected onto the page's corners, then written in line by line.
 */
export class Ink {
  constructor(container, pages, { width = 520, height = 600 } = {}) {
    this.container = container;
    this.pages = pages.map((quad) => {
      const sheet = document.createElement('div');
      sheet.className = 'ink__page';
      sheet.style.width = `${width}px`;
      sheet.style.height = `${height}px`;
      container.append(sheet);
      return { quad, sheet };
    });
    this.fit();
    new ResizeObserver(() => this.fit()).observe(container);
  }

  fit() {
    for (const { quad, sheet } of this.pages) placeOnQuad(sheet, this.container, quad);
  }

  /** Replaces the writing. `content` holds one list of lines per page. */
  set(content) {
    this.pages.forEach(({ sheet }, index) => {
      sheet.replaceChildren(
        ...(content[index] || []).map((line) => {
          const element = document.createElement('p');
          element.className = `ink__line${line.small ? ' ink__line--small' : ''}${line.rule ? ' ink__line--rule' : ''}`;
          element.textContent = line.text || '';
          if (line.indent) element.style.paddingLeft = `${line.indent}px`;
          return element;
        }),
      );
    });
    gsap.set(this.lines(), { clipPath: 'inset(-20% 100% -20% 0)' });
  }

  lines() {
    return this.pages.flatMap(({ sheet }) => [...sheet.children]);
  }

  /** Writes every line in, as if by hand. The second page starts soon after the first. */
  write({ delay = 0, speed = 1 } = {}) {
    gsap.set(this.container, { opacity: 1 });
    const timeline = gsap.timeline({ delay });
    this.pages.forEach(({ sheet }, page) => {
      let at = page * 0.7;
      for (const line of sheet.children) {
        const duration = (0.045 * Math.max(4, line.textContent.length) + 0.15) / speed;
        timeline.to(line, { clipPath: 'inset(-20% 0% -20% 0)', duration, ease: 'power1.inOut' }, at);
        at += duration * 0.92;
      }
    });
    return timeline;
  }

  /** Shows the writing at once, already finished. */
  show() {
    gsap.set(this.lines(), { clipPath: 'inset(-20% 0% -20% 0)' });
    gsap.set(this.container, { opacity: 1 });
  }

  hide(duration = 0.4) {
    return gsap.to(this.container, { opacity: 0, duration, ease: 'power2.out' });
  }
}

const LONDON = 'Europe/London';

function ordinal(day) {
  const rest = day % 100;
  if (rest >= 11 && rest <= 13) return `${day}th`;
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th'}`;
}

/** "Thursday" and "12th November", for a date in London. */
export function longDate(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: LONDON })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return { weekday: parts.weekday, date: `${ordinal(Number(parts.day))} ${parts.month}` };
}

export function londonHour(date = new Date()) {
  const [hour, minute] = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: LONDON })
    .format(date)
    .split(':')
    .map(Number);
  return hour + minute / 60;
}

const WORDS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];

/** The British way of saying a time: "half seven", "eight o'clock". */
export function spokenTime(hours) {
  const whole = Math.floor(hours);
  const word = WORDS[whole % 12];
  return hours % 1 ? `half ${word}` : `${word} o'clock`;
}

/** The next half hour the café could seat someone, as hours (e.g. 19.5). */
export function nextSlot(date = new Date()) {
  const now = londonHour(date);
  const slot = Math.ceil((now + 0.25) * 2) / 2;
  return slot < 7.5 || slot > 22 ? null : slot;
}
