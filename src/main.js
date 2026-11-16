import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/inter-tight/wght.css';
import '@fontsource/la-belle-aurore/400.css';
import './styles/main.css';

import { filmGrain } from './hero/fx.js';
import { Hero } from './hero/hero.js';
import { ScrollTrigger, fontsReady, lockScroll, startSmoothScroll } from './lib/motion.js';
import { initMenu } from './sections/menu.js';
import { initReserve } from './sections/reserve.js';
import { initVisit } from './sections/visit.js';
import { initClosingRain, initEdition, initFooter, initLinks, initMagnetic, initNav, initReveals } from './ui/ui.js';

async function start() {
  scrollTo(0, 0);
  startSmoothScroll();
  lockScroll(true);
  // film.json says where each stop falls in the opening film; it is written by `npm run media`.
  const plan = await fetch('media/hero/film.json').then((response) => response.json());
  const hero = new Hero(document.querySelector('[data-hero]'), plan);
  if (import.meta.env.DEV) window.morrow = hero;
  await fontsReady();

  filmGrain();
  initEdition();
  initMenu(document.querySelector('#menu'));
  initReserve(document.querySelector('#reserve'));
  initVisit(document.querySelector('#visit'));
  initLinks();
  initNav();
  initMagnetic();
  initReveals();
  initFooter();
  initClosingRain();
  ScrollTrigger.refresh();

  await hero.intro(document.querySelector('[data-intro]'));
  lockScroll(false);
  ScrollTrigger.refresh();
}

start();
