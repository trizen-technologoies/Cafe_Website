import { finePointer, gsap, reducedMotion } from '../lib/motion.js';

const DPR = Math.min(devicePixelRatio || 1, 1.5);

/** Shared resize and visibility handling for the canvas effects. */
class CanvasEffect {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.level = 0;
    this.visible = true;
    this.pointer = { x: 0, y: 0 };
    this.resize();
    addEventListener('resize', () => this.resize());
    new IntersectionObserver(([entry]) => (this.visible = entry.isIntersecting)).observe(canvas);
    gsap.ticker.add((time, delta) => this.tick(time, Math.min(delta, 50) / 1000));
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * DPR);
    this.canvas.height = Math.round(h * DPR);
    this.context.setTransform(DPR, 0, 0, DPR, 0, 0);
    this.seed?.();
  }

  /** Fades the effect to a strength between 0 and 1. */
  to(level, duration = 1.2) {
    return gsap.to(this, { level: reducedMotion ? 0 : level, duration, ease: 'sine.inOut', overwrite: true });
  }

  tick(time, step) {
    if (!this.visible || document.hidden) return;
    this.context.clearRect(0, 0, this.width, this.height);
    if (this.level > 0.01) this.draw(time, step);
  }
}

/** Fine London rain in front of the lens: thin streaks at several depths. */
export class Rain extends CanvasEffect {
  seed() {
    const count = Math.round(Math.min(340, (this.width * this.height) / 4200));
    this.drops = Array.from({ length: count }, () => this.drop(true));
  }

  drop(anywhere) {
    const depth = 0.25 + Math.random() ** 1.6 * 0.75;
    return {
      x: Math.random() * (this.width + 200) - 100,
      y: anywhere ? Math.random() * this.height : -40 - Math.random() * 200,
      depth,
      length: 10 + depth * 34,
      speed: 520 + depth * 980,
      order: Math.random(),
    };
  }

  draw(time, step) {
    const c = this.context;
    const wind = 0.12;
    c.lineCap = 'round';
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y += d.speed * step;
      d.x += d.speed * step * wind;
      if (d.y - d.length > this.height) Object.assign(d, this.drop(false));
      if (d.order > this.level) continue;
      const shift = this.pointer.x * 18 * d.depth;
      const x = d.x + shift;
      c.strokeStyle = `rgba(214, 224, 236, ${0.05 + d.depth * 0.22})`;
      c.lineWidth = 0.6 + d.depth * 0.9;
      c.beginPath();
      c.moveTo(x, d.y);
      c.lineTo(x - d.length * wind, d.y - d.length);
      c.stroke();
    }
  }
}

/** Dust drifting through warm lamplight, so a still room never looks frozen. */
export class Motes extends CanvasEffect {
  seed() {
    const count = Math.round(Math.min(70, (this.width * this.height) / 22000));
    this.motes = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      r: 0.6 + Math.random() * 1.8,
      drift: 6 + Math.random() * 16,
      phase: Math.random() * Math.PI * 2,
      order: Math.random(),
    }));
  }

  draw(time, step) {
    const c = this.context;
    for (const m of this.motes) {
      m.y -= m.drift * step;
      m.x += Math.sin(time * 0.4 + m.phase) * 6 * step;
      if (m.y < -10) {
        m.y = this.height + 10;
        m.x = Math.random() * this.width;
      }
      if (m.order > this.level) continue;
      const glow = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 0.9 + m.phase));
      const x = m.x + this.pointer.x * 10 * m.r;
      const y = m.y + this.pointer.y * 6 * m.r;
      const gradient = c.createRadialGradient(x, y, 0, x, y, m.r * 4);
      gradient.addColorStop(0, `rgba(255, 214, 160, ${glow})`);
      gradient.addColorStop(1, 'rgba(255, 214, 160, 0)');
      c.fillStyle = gradient;
      c.beginPath();
      c.arc(x, y, m.r * 4, 0, Math.PI * 2);
      c.fill();
    }
  }
}

/** Cloud drifting past the lens as the film passes through the cloud bank (0 to 1). */
export class Mist {
  constructor(element) {
    this.element = element;
    this.layers = [...element.querySelectorAll('i')];
    this.wash = element.querySelector('b');
    for (const layer of [...this.layers, this.wash]) layer.style.backgroundImage = 'url(media/fx/cloud.webp)';
    this.level = -1;
    this.set(0);
  }

  set(level) {
    if (Math.abs(level - this.level) < 0.002) return;
    this.level = level;
    this.element.style.visibility = level > 0.001 ? 'visible' : 'hidden';
    const [near, far] = this.layers;
    near.style.opacity = level;
    near.style.transform = `scale(${1 + level * 0.5}) translateX(${(1 - level) * 6}%)`;
    far.style.opacity = level * 0.85;
    far.style.transform = `scaleX(-1) scale(${1.2 + level * 0.6}) translateX(${(1 - level) * 8}%)`;
    this.wash.style.opacity = Math.max(0, level - 0.55) / 0.45;
  }
}

/** Warm light flooding the lens as the door opens (0 to 1). */
export class Flare {
  constructor(element) {
    this.element = element;
    this.glow = element.querySelector('i');
    this.wash = element.querySelector('b');
    this.level = -1;
    this.set(0);
  }

  set(level) {
    if (Math.abs(level - this.level) < 0.002) return;
    this.level = level;
    this.element.style.visibility = level > 0.001 ? 'visible' : 'hidden';
    this.glow.style.opacity = level;
    this.glow.style.transform = `scale(${0.7 + level * 1.1})`;
    this.wash.style.opacity = Math.max(0, level - 0.5) * 0.9;
  }
}

/** The pointer gently steers the shot, as if turning your head. */
export function pointerDepth(stage, frame, effects) {
  const pointer = { x: 0, y: 0 };
  let held = false;
  if (reducedMotion) return { pointer, hold() {} };
  const moveX = gsap.quickTo(frame, 'x', { duration: 1.4, ease: 'power3.out' });
  const moveY = gsap.quickTo(frame, 'y', { duration: 1.4, ease: 'power3.out' });
  if (finePointer) {
    stage.addEventListener('pointermove', (event) => {
      pointer.x = event.clientX / innerWidth - 0.5;
      pointer.y = event.clientY / innerHeight - 0.5;
      for (const effect of effects) Object.assign(effect.pointer, pointer);
      if (held) return;
      moveX(pointer.x * -12);
      moveY(pointer.y * -8);
    });
  }
  return {
    pointer,
    /** Holds the shot dead centre, for effects that must line up with it. */
    hold(on) {
      if (on === held) return;
      held = on;
      if (on) {
        moveX(0);
        moveY(0);
      } else {
        moveX(pointer.x * -12);
        moveY(pointer.y * -8);
      }
    },
  };
}

/** A fine moving film grain over the whole site. */
export function filmGrain() {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.random() * 255;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const grain = document.createElement('div');
  grain.className = 'grain';
  grain.setAttribute('aria-hidden', 'true');
  grain.style.backgroundImage = `url(${canvas.toDataURL('image/png')})`;
  document.body.append(grain);
}
