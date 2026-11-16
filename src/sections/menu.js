import { ALLERGENS, FILTERS, MENU } from '../data/menu.js';
import { gsap } from '../lib/motion.js';

const price = (value) => value.toFixed(2);

/** The full menu: one section at a time, with a filter that sets aside anything you can't eat. */
export function initMenu(root) {
  const tabs = root.querySelector('[data-tabs]');
  const chips = root.querySelector('[data-chips]');
  const list = root.querySelector('[data-menu-list]');
  const avoiding = new Set();
  let current = MENU[0].id;

  tabs.replaceChildren(
    ...MENU.map((section, index) => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.role = 'tab';
      tab.className = 'menu__tab';
      tab.dataset.id = section.id;
      tab.textContent = section.title;
      // Numbered like the contents page of a magazine.
      const number = document.createElement('sup');
      number.setAttribute('aria-hidden', 'true');
      number.textContent = String(index + 1).padStart(2, '0');
      tab.append(number);
      tab.addEventListener('click', () => show(section.id));
      return tab;
    }),
  );

  chips.replaceChildren(
    ...FILTERS.map((key) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = ALLERGENS[key];
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => {
        if (avoiding.has(key)) avoiding.delete(key);
        else avoiding.add(key);
        chip.setAttribute('aria-pressed', String(avoiding.has(key)));
        mark();
      });
      return chip;
    }),
  );

  function render(section) {
    const head = document.createElement('div');
    head.className = 'menu__section-head';
    head.innerHTML = `<h3>${section.title}</h3><p>${section.note}</p><p class="menu__fit" data-fit></p>`;
    const items = section.items.map((item) => {
      const row = document.createElement('article');
      row.className = 'dish';
      row.dataset.allergens = item.allergens.join(' ');
      const contains = item.allergens.map((key) => ALLERGENS[key]).join(', ');
      row.innerHTML = `
        <div class="dish__line">
          <h4 class="dish__name">${item.name}${item.tag ? ` <span class="dish__tag">${item.tag}</span>` : ''}</h4>
          <span class="dish__dots" aria-hidden="true"></span>
          <span class="dish__price"><span class="visually-hidden">£</span>${price(item.price)}</span>
        </div>
        <p class="dish__note">${item.note}</p>
        <p class="dish__allergens">${contains ? `Contains ${contains.toLowerCase()}` : 'No major allergens'}</p>`;
      return row;
    });
    list.replaceChildren(head, ...items);
  }

  function mark() {
    const rows = list.querySelectorAll('.dish');
    let suits = 0;
    rows.forEach((row) => {
      const clash = row.dataset.allergens.split(' ').some((key) => avoiding.has(key));
      row.classList.toggle('is-set-aside', clash);
      if (!clash) suits += 1;
    });
    const fit = list.querySelector('[data-fit]');
    fit.textContent = avoiding.size ? `${suits} of ${rows.length} suit you` : '';
  }

  function show(id, instant = false) {
    current = id;
    tabs.querySelectorAll('.menu__tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.id === id)));
    const section = MENU.find((entry) => entry.id === id);
    const swap = () => {
      render(section);
      mark();
      // Clear the inline styles at the end so no row is ever left part-way through the fade.
      if (!instant) {
        gsap.fromTo(
          list.children,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.7, stagger: 0.05, ease: 'power3.out', clearProps: 'opacity,transform' },
        );
      }
    };
    // A quick second click takes over from whatever the first one started.
    gsap.killTweensOf(list.children);
    if (instant || !list.children.length) swap();
    else gsap.to(list.children, { opacity: 0, y: -10, duration: 0.25, stagger: 0.02, ease: 'power2.in', onComplete: swap });
  }

  show(current, true);
}
