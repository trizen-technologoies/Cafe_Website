/**
 * Turns the screen like the page of the reservation book, as far as the scroll has got.
 * The spine runs down the middle: the right half lifts and swings over to the left, carrying
 * the book on its front and the next shot's left half on its back, while the next shot shows
 * through underneath.
 */
export class PageTurn {
  constructor(container, bookSrc, nextSrc) {
    this.container = container;
    this.book = bookSrc;
    this.next = nextSrc;
    this.parts = null;
    // Fetch both pictures early so the first turn never waits on them.
    for (const src of [bookSrc, nextSrc]) new Image().src = src;
  }

  half(src, side, ink) {
    const half = document.createElement('div');
    half.className = `turn__half turn__half--${side}`;
    const inner = document.createElement('div');
    inner.className = 'turn__inner';
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    inner.append(image);
    if (ink) {
      const copy = ink.cloneNode(true);
      copy.style.opacity = 1;
      inner.append(copy);
    }
    half.append(inner);
    return half;
  }

  build(ink) {
    const still = this.half(this.book, 'left', ink);
    const leaf = document.createElement('div');
    leaf.className = 'turn__leaf';
    const front = this.half(this.book, 'right', ink);
    front.classList.add('turn__face');
    const back = this.half(this.next, 'left');
    back.classList.add('turn__face', 'turn__face--back');
    const shade = document.createElement('i');
    shade.className = 'turn__shade';
    const shadow = document.createElement('div');
    shadow.className = 'turn__shadow';
    front.append(shade);
    leaf.append(front, back);
    this.container.replaceChildren(still, shadow, leaf);
    this.parts = { still, leaf, shade, shadow, back };
  }

  /** 0 is the open book, 1 is the next shot. */
  set(progress, ink) {
    if (progress <= 0 || progress >= 1) {
      if (this.parts) this.clear();
      return;
    }
    if (!this.parts) this.build(ink);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
    const rotation = -180 * eased;
    const { still, leaf, shade, shadow, back } = this.parts;
    leaf.style.transform = `rotateY(${rotation}deg)`;
    shade.style.opacity = Math.min(1, Math.abs(rotation) / 120) * 0.55;
    back.style.filter = `brightness(${0.7 + 0.3 * eased})`;
    shadow.style.opacity = Math.sin(eased * Math.PI) * 0.6;
    still.style.visibility = eased > 0.995 ? 'hidden' : 'visible';
  }

  clear() {
    this.container.replaceChildren();
    this.parts = null;
  }
}
