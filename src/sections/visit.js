import { HOURS } from '../data/menu.js';
import { londonHour } from '../hero/ink.js';
import { gsap, ScrollTrigger } from '../lib/motion.js';

const clock = (hours) => (hours === 12 ? 'noon' : `${hours % 12 || 12}${hours < 12 ? 'am' : 'pm'}`);

function londonDay(date = new Date()) {
  const name = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'Europe/London' }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Opening hours, and whether the café is open right now in London. */
export function initVisit(root) {
  const body = root.querySelector('[data-hours] tbody');
  const status = root.querySelector('[data-open-status]');
  body.innerHTML = HOURS.map((row) => `<tr><th scope="row">${row.days}</th><td>${clock(row.open)} – ${clock(row.close)}</td></tr>`).join('');

  const update = () => {
    const day = londonDay();
    const hour = londonHour();
    const today = HOURS.find((row) => row.match.includes(day));
    const open = hour >= today.open && hour < today.close;
    const tomorrow = HOURS.find((row) => row.match.includes((day + 1) % 7));
    status.classList.toggle('is-open', open);
    if (open) status.innerHTML = `<i></i>Open now, until ${clock(today.close)}`;
    else if (hour < today.open) status.innerHTML = `<i></i>Closed, opens at ${clock(today.open)}`;
    else status.innerHTML = `<i></i>Closed, opens at ${clock(tomorrow.open)} tomorrow`;
  };
  update();
  setInterval(update, 60000);

  const route = root.querySelector('.map__route');
  const length = route.getTotalLength();
  gsap.set(route, { strokeDasharray: length, strokeDashoffset: length });
  ScrollTrigger.create({
    trigger: root,
    start: 'top 65%',
    once: true,
    onEnter: () => gsap.to(route, { strokeDashoffset: 0, duration: 2.4, ease: 'power2.inOut' }),
  });
}
