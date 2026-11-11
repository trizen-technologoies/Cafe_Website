import { gsap, smallScreen } from '../lib/motion.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * The opening film, steered by scroll. Instead of jumping between frames (which stutters),
 * it plays towards wherever the scroll has got to: faster when far behind, slower as it
 * arrives, and from a reversed copy when the visitor scrolls back up.
 */
export class Film {
  constructor(holder, fps) {
    this.fps = fps;
    this.size = smallScreen() ? '-sm' : '';
    this.forward = this.make(`media/hero/film${this.size}.mp4`, 'auto');
    this.backward = this.make(`media/hero/film${this.size}-rev.mp4`, 'metadata');
    holder.append(this.forward, this.backward);
    this.active = this.forward;
    this.forward.classList.add('is-on');
    this.target = 0;
    this.busy = false;
    this.retryAt = 0;
    this.duration = 0;
    this.forward.addEventListener('loadedmetadata', () => (this.duration = this.forward.duration));
    // Start fetching the reversed copy once the forward one is well on its way.
    this.forward.addEventListener('canplaythrough', () => (this.backward.preload = 'auto'), { once: true });
    setTimeout(() => (this.backward.preload = 'auto'), 6000);
    gsap.ticker.add(() => this.tick());
  }

  make(src, preload) {
    const video = document.createElement('video');
    video.className = 'hero__video';
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    video.preload = preload;
    video.src = src;
    return video;
  }

  /** Where the film is now, in seconds from the start, whichever copy is playing. */
  get time() {
    return this.active === this.forward ? this.forward.currentTime : this.duration - this.backward.currentTime;
  }

  seek(seconds) {
    this.target = clamp(seconds, 0, Math.max(0, this.duration - 0.5 / this.fps));
  }

  /** How much of the forward film has downloaded, from 0 to 1. */
  progress() {
    const video = this.forward;
    if (!video.duration || !video.buffered.length) return 0;
    return video.buffered.end(video.buffered.length - 1) / video.duration;
  }

  ready() {
    if (this.forward.readyState >= 3) return Promise.resolve();
    return new Promise((resolve) => this.forward.addEventListener('canplay', resolve, { once: true }));
  }

  tick() {
    if (!this.duration || this.busy || document.hidden || performance.now() < this.retryAt) return;
    const gap = this.target - this.time;
    const distance = Math.abs(gap);
    if (distance < 0.5 / this.fps) {
      if (!this.active.paused) this.active.pause();
      return;
    }
    const want = gap > 0 ? this.forward : this.backward;
    if (want !== this.active || distance > 6) {
      this.switchTo(want, distance > 6);
      return;
    }
    const rate = clamp(distance * 2.6, 0.3, 4);
    if (Math.abs(want.playbackRate - rate) > 0.06) want.playbackRate = rate;
    if (want.paused) want.play().catch(() => {});
  }

  /** Swaps between the forward and reversed copies at the same moment of the film. */
  async switchTo(want, jump) {
    this.busy = true;
    const at = jump ? this.target : this.time;
    this.active.pause();
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, 1500);
      want.addEventListener('seeked', done, { once: true });
      want.currentTime = want === this.forward ? at : this.duration - at;
    });
    if (want.readyState < 2) {
      // That copy hasn't loaded enough to show a picture yet; stay put and try again shortly.
      this.retryAt = performance.now() + 400;
      this.busy = false;
      return;
    }
    want.classList.add('is-on');
    if (want !== this.active) {
      const previous = this.active;
      requestAnimationFrame(() => previous.classList.remove('is-on'));
    }
    this.active = want;
    this.busy = false;
  }
}
