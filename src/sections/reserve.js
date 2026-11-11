import { Ink, longDate, nextSlot } from '../hero/ink.js';
import { ScrollTrigger } from '../lib/motion.js';

// The open book in the reservations photo, as fractions of the photo (clockwise from top left).
const PAGES = [
  [[0.16, 0.393], [0.414, 0.439], [0.531, 0.815], [0.244, 0.811]],
  [[0.416, 0.439], [0.715, 0.395], [0.846, 0.747], [0.54, 0.82]],
];

const timeLabel = (hours) => {
  const whole = Math.floor(hours);
  const twelve = whole % 12 || 12;
  return `${twelve}${hours % 1 ? '.30' : ''}${whole < 12 ? 'am' : 'pm'}`;
};

/** As the guest fills in the form, the host writes the booking into the book. */
export function initReserve(root) {
  const form = root.querySelector('[data-reserve-form]');
  const status = root.querySelector('[data-reserve-status]');
  const ink = new Ink(root.querySelector('[data-reserve-ink]'), PAGES);
  const { name, date, time, guests, seat } = form.elements;

  for (let hours = 8; hours <= 22; hours += 0.5) time.add(new Option(timeLabel(hours), String(hours)));
  time.value = String(nextSlot() || 19.5);
  date.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  date.min = date.value;

  const content = () => {
    const chosen = date.value ? new Date(`${date.value}T12:00:00Z`) : new Date();
    const { weekday, date: day } = longDate(chosen);
    const count = Number(guests.value);
    return [
      [{ text: weekday }, { text: day }, { rule: true }, { text: timeLabel(Number(time.value)), small: true }],
      [
        { text: name.value.trim() || 'Your name here' },
        { text: count === 1 ? 'a table for one,' : `a table for ${['', 'one', 'two', 'three', 'four', 'five', 'six'][count]},` },
        { text: seat.value.toLowerCase() },
        { text: '~ M.', indent: 230 },
      ],
    ];
  };

  let pending = null;
  const rewrite = (speed = 2.2) => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      ink.set(content());
      ink.write({ speed });
    }, 450);
  };

  ink.set(content());
  ScrollTrigger.create({ trigger: root, start: 'top 55%', once: true, onEnter: () => ink.write({ delay: 0.2 }) });
  form.addEventListener('input', () => rewrite());
  form.addEventListener('change', () => rewrite());

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!name.value.trim()) {
      status.textContent = 'Just your name, and we’ll write you in.';
      name.focus();
      return;
    }
    const first = name.value.trim().split(/\s+/)[0];
    status.textContent = `We’ve pencilled you in, ${first}. This is a demonstration, so no booking was made.`;
  });
}
