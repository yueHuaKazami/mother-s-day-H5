const card = document.querySelector("#card");
const blessing = document.querySelector("#blessing");
const particleCanvas = document.querySelector("#particleCanvas");
const bgMusic = document.querySelector("#bgMusic");
const musicToggle = document.querySelector("#musicToggle");

const ASSET_URLS = {
  heart: "assets/heart-ui.png",
  rose: "assets/rose-ui.png",
};

const random = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
const smoothStep = (from, to, value) => {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
};
const runWhenIdle = (task) => {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: 1200 });
    return;
  }

  window.setTimeout(task, 160);
};

class AssetStore {
  constructor(urls) {
    this.urls = urls;
    this.images = new Map();
    this.loading = new Map();
  }

  preload(names) {
    return Promise.all(names.map((name) => this.load(name)));
  }

  load(name) {
    if (this.images.has(name)) {
      return Promise.resolve(this.images.get(name));
    }

    if (this.loading.has(name)) {
      return this.loading.get(name);
    }

    const task = new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        this.images.set(name, image);
        resolve(image);
      };
      image.onerror = reject;
      image.src = this.urls[name];
    }).finally(() => this.loading.delete(name));

    this.loading.set(name, task);
    return task;
  }

  get(name) {
    return this.images.get(name);
  }
}

class ParticleEngine {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.assets = assets;
    this.particles = [];
    this.maxParticles = 88;
    this.frame = 0;
    this.rect = { width: 0, height: 0 };
    this.resize = this.resize.bind(this);
    this.tick = this.tick.bind(this);

    window.addEventListener("resize", this.resize, { passive: true });
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.rect = { width: rect.width, height: rect.height, ratio };
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  add(particle) {
    const now = performance.now();
    this.particles.push({ ...particle, start: now });

    this.fadeOverflowParticles(now);

    this.start();
  }

  fadeOverflowParticles(now) {
    const candidates = this.particles
      .filter((particle) => !particle.fadeStart)
      .sort((a, b) => a.start - b.start);
    const count = candidates.length - this.maxParticles;

    if (count <= 0) {
      return;
    }

    candidates.slice(0, count).forEach((particle) => {
      particle.fadeStart = now;
      particle.fadeDuration = random(300, 520);
    });
  }

  start() {
    if (!this.frame) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  tick(now) {
    this.frame = 0;
    const { width, height } = this.rect;
    this.ctx.clearRect(0, 0, width, height);
    this.particles = this.particles.filter((particle) => this.drawParticle(particle, now));

    if (this.particles.length) {
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  drawParticle(particle, now) {
    const progress = (now - particle.start) / particle.duration;
    const forcedFadeProgress = particle.fadeStart
      ? (now - particle.fadeStart) / particle.fadeDuration
      : 0;

    if (progress >= 1 || forcedFadeProgress >= 1) {
      return false;
    }

    const eased = easeOutCubic(progress);
    const fadeIn = smoothStep(0, 0.16, progress);
    const fadeOut = 1 - smoothStep(0.7, 1, progress);
    const softLimitFade = particle.fadeStart ? 1 - smoothStep(0, 1, forcedFadeProgress) : 1;
    const alpha = particle.alpha * fadeIn * fadeOut * softLimitFade;
    const x = particle.x + particle.dx * eased;
    const y = particle.y + particle.dy * eased;
    const scale = particle.scale + (particle.endScale - particle.scale) * eased;
    const rotation = particle.rotation + particle.rotationDelta * eased;

    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.scale(scale, scale);

    if (particle.kind === "rose") {
      this.drawImage("rose", particle.size * 1.12, particle.size);
    } else if (particle.kind === "heart") {
      this.drawHeart(particle.size);
    } else {
      this.drawPetal(particle.size);
    }

    this.ctx.restore();
    return true;
  }

  drawImage(name, width, height) {
    const image = this.assets.get(name);

    if (!image) {
      return;
    }

    this.ctx.drawImage(image, -width / 2, -height / 2, width, height);
  }

  drawHeart(size) {
    const image = this.assets.get("heart");

    if (image) {
      this.ctx.drawImage(image, -size / 2, -size / 2, size, size);
      return;
    }

    const s = size / 28;
    this.ctx.fillStyle = "#c4254b";
    this.ctx.beginPath();
    this.ctx.moveTo(0, 8 * s);
    this.ctx.bezierCurveTo(-16 * s, -4 * s, -11 * s, -18 * s, 0, -9 * s);
    this.ctx.bezierCurveTo(11 * s, -18 * s, 16 * s, -4 * s, 0, 8 * s);
    this.ctx.fill();
  }

  drawPetal(size) {
    this.ctx.fillStyle = "#df5577";
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, size * 0.52, size * 0.23, -0.35, 0, Math.PI * 2);
    this.ctx.fill();
  }

  burst(point) {
    this.burstHearts(point, 18);
    this.blessingHearts(point, 8);
    this.risingRoses(point.width, 5);
    this.fallingPetals(point.width, 13);
  }

  burstHearts(point, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = random(-160, -20) * (Math.PI / 180);
      const distance = random(64, Math.min(174, point.width * 0.38));
      this.add({
        kind: "heart",
        x: point.x,
        y: point.y,
        dx: Math.cos(angle) * distance + random(-28, 28),
        dy: Math.sin(angle) * distance - random(34, 112),
        size: random(22, 44),
        scale: 0.38,
        endScale: random(0.74, 1.12),
        rotation: 0,
        rotationDelta: random(-0.6, 0.6),
        duration: random(2050, 3350),
        alpha: 0.95,
      });
    }
  }

  blessingHearts(point, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + random(-0.32, 0.32);
      const distance = random(58, Math.min(138, point.width * 0.32));
      this.add({
        kind: "heart",
        x: point.x,
        y: point.y,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance - random(8, 48),
        size: random(20, 36),
        scale: 0.45,
        endScale: random(0.72, 1.06),
        rotation: 0,
        rotationDelta: random(-0.42, 0.42),
        duration: random(2200, 3300),
        alpha: 0.92,
      });
    }
  }

  risingRoses(width, count) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        kind: "rose",
        x: random(width * 0.1, width * 0.9),
        y: this.rect.height + random(22, 60),
        dx: random(-width * 0.14, width * 0.14),
        dy: -this.rect.height * random(0.54, 0.72),
        size: random(54, 86),
        scale: 0.64,
        endScale: random(0.86, 1.08),
        rotation: random(-0.25, 0.25),
        rotationDelta: random(-1.1, 1.1),
        duration: random(3250, 4250),
        alpha: 0.86,
      });
    }
  }

  fallingPetals(width, count) {
    for (let i = 0; i < count; i += 1) {
      this.add({
        kind: "petal",
        x: random(-width * 0.08, width * 1.08),
        y: random(-this.rect.height * 0.2, this.rect.height * 0.34),
        dx: random(-width * 0.22, width * 0.22),
        dy: this.rect.height * random(0.46, 0.78),
        size: random(16, 28),
        scale: random(0.7, 1),
        endScale: random(0.9, 1.1),
        rotation: random(-1, 1),
        rotationDelta: random(2.8, 8.2),
        duration: random(3000, 4600),
        alpha: 0.78,
      });
    }
  }
}

class BlessingView {
  constructor(cardElement, element) {
    this.card = cardElement;
    this.element = element;
    this.timer = 0;
  }

  moveTo(point) {
    const halfWidth = Math.min(point.width * 0.72, 306) / 2;
    const halfHeight = 58;
    const x = clamp(point.x, halfWidth + 10, point.width - halfWidth - 10);
    const y = clamp(point.y, halfHeight + 16, point.height - halfHeight - 16);

    this.element.style.setProperty("--blessing-x", `${x}px`);
    this.element.style.setProperty("--blessing-y", `${y}px`);
  }

  play(point) {
    window.clearTimeout(this.timer);
    this.moveTo(point);
    this.card.classList.add("is-playing");
    this.element.classList.remove("is-visible");
    this.element.setAttribute("aria-hidden", "false");

    void this.element.offsetWidth;
    this.element.classList.add("is-visible");

    this.timer = window.setTimeout(() => {
      this.element.classList.remove("is-visible");
      this.element.setAttribute("aria-hidden", "true");
      this.card.classList.remove("is-playing");
    }, 4300);
  }
}

class MusicController {
  constructor(audio, button) {
    this.audio = audio;
    this.button = button;
    this.userPaused = false;
    this.toggle = this.toggle.bind(this);
    this.resumeAfterGesture = this.resumeAfterGesture.bind(this);

    this.button.addEventListener("pointerdown", (event) => event.stopPropagation());
    this.button.addEventListener("click", this.toggle);
    this.audio.addEventListener("play", () => this.setState(true));
    this.audio.addEventListener("pause", () => this.setState(false));
  }

  setState(isPlaying) {
    this.button.classList.toggle("is-playing", isPlaying);
    this.button.classList.toggle("is-muted", !isPlaying);
    this.button.setAttribute("aria-pressed", String(isPlaying));
    this.button.setAttribute("aria-label", isPlaying ? "暂停背景音乐" : "播放背景音乐");
  }

  play() {
    const task = this.audio.play();

    if (!task) {
      this.setState(!this.audio.paused);
      return;
    }

    task.then(() => this.setState(true)).catch(() => this.setState(false));
  }

  pause() {
    this.audio.pause();
    this.setState(false);
  }

  resumeAfterGesture() {
    if (!this.userPaused && this.audio.paused) {
      this.play();
    }
  }

  toggle(event) {
    event.preventDefault();
    event.stopPropagation();

    if (this.audio.paused) {
      this.userPaused = false;
      this.play();
      return;
    }

    this.userPaused = true;
    this.pause();
  }
}

function cardPoint(event) {
  const rect = card.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
  };
}

const assets = new AssetStore(ASSET_URLS);
const particles = new ParticleEngine(particleCanvas, assets);
const blessingView = new BlessingView(card, blessing);
const music = new MusicController(bgMusic, musicToggle);

assets.preload(["heart"]);
runWhenIdle(() => assets.preload(["rose"]));
music.play();
document.addEventListener("WeixinJSBridgeReady", music.resumeAfterGesture, false);

card.addEventListener("pointerdown", (event) => {
  const point = cardPoint(event);
  blessingView.play(point);
  particles.burst(point);
  music.resumeAfterGesture();
});

card.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  const rect = card.getBoundingClientRect();
  const point = {
    x: rect.width / 2,
    y: rect.height / 2,
    width: rect.width,
    height: rect.height,
  };
  blessingView.play(point);
  particles.burst(point);
  music.resumeAfterGesture();
});

card.tabIndex = 0;

if (window.location.hash === "#preview") {
  window.setTimeout(() => {
    const rect = card.getBoundingClientRect();
    const point = {
      x: rect.width / 2,
      y: rect.height * 0.52,
      width: rect.width,
      height: rect.height,
    };
    blessingView.play(point);
    particles.burst(point);
  }, 360);
}
