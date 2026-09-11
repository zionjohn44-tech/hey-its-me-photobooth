/* ═══════════════════════════════════════════════════════
   HEY IT'S ME PHOTOBOOTH — app.js
   Rich studio animations, audio synthesis & interactive effects
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────── */
const state = {
  selectedTemplate: 1,
  selectedTimer: 5,
  capturedPhotos: [],
  currentShot: 0,
  stream: null,
  isShooting: false,
  soundEnabled: true,
};

const TOTAL_SHOTS = 4;

/* ──────────────────────────────────────────────────────
   ELEMENT SELECTORS & SCREENS
────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const screens = {
  welcome:  $('screen-welcome'),
  template: $('screen-template'),
  timer:    $('screen-timer'),
  camera:   $('screen-camera'),
  finish:   $('screen-finish'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

/* ──────────────────────────────────────────────────────
   AUDIO FX SYNTHESIZER (Pure Web Audio API — No External Files)
────────────────────────────────────────────────────── */
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Warm countdown beep
function playBeep(isFinal = false) {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isFinal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFinal ? 880 : 520, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinal ? 0.22 : 0.08));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + (isFinal ? 0.24 : 0.1));
  } catch (e) {
    console.debug('Audio not allowed yet', e);
  }
}

// Realistic studio camera shutter sound (dual mechanical click + noise burst)
function playShutterSound() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Shutter front mechanical click
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.frequency.setValueAtTime(240, now);
    osc1.frequency.exponentialRampToValueAtTime(80, now + 0.03);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.035);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.04);

    // 2. White noise burst (mirror flip / shutter flutter)
    const bufferSize = ctx.sampleRate * 0.06;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(1.5, now);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now + 0.01);

    // 3. Shutter rear blade snap
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.frequency.setValueAtTime(420, now + 0.06);
    osc2.frequency.exponentialRampToValueAtTime(110, now + 0.09);
    gain2.gain.setValueAtTime(0.3, now + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.06);
    osc2.stop(now + 0.11);
  } catch (e) {
    console.debug('Audio error', e);
  }
}

// Warm celebration chime upon photostrip completion
function playSuccessChime() {
  if (!state.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (warm gold arpeggio)
    notes.forEach((freq, idx) => {
      const startTime = ctx.currentTime + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.55);
    });
  } catch (e) {
    console.debug('Chime error', e);
  }
}

// Sound toggle button handler
function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  const iconOn  = $('sound-icon-on');
  const iconOff = $('sound-icon-off');

  if (state.soundEnabled) {
    iconOn.classList.remove('hidden');
    iconOff.classList.add('hidden');
    playBeep(false);
  } else {
    iconOn.classList.add('hidden');
    iconOff.classList.remove('hidden');
  }
}

// Mobile haptic vibration helper
function triggerHaptic(pattern = [25]) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

/* ──────────────────────────────────────────────────────
   NAVIGATION
────────────────────────────────────────────────────── */
function goToWelcome() {
  stopCamera();
  showScreen('welcome');
}

function goToTemplate() {
  getAudioContext(); // Unlock audio on user interaction
  showScreen('template');
}

function goToTimer() {
  showScreen('timer');
  highlightTimer(state.selectedTimer);
}

function retake() {
  state.capturedPhotos = [];
  state.currentShot = 0;
  resetThumbnails();
  showScreen('timer');
}

/* ──────────────────────────────────────────────────────
   TEMPLATE SELECTION
────────────────────────────────────────────────────── */
function selectTemplate(v) {
  state.selectedTemplate = v;
  document.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
  const card = $(`tpl-card-${v}`);
  if (card) card.classList.add('selected');
  playBeep(false);
  triggerHaptic([20]);
}

// Init defaults
selectTemplate(1);

/* ──────────────────────────────────────────────────────
   TIMER SELECTION → AUTO-START
────────────────────────────────────────────────────── */
function highlightTimer(seconds) {
  document.querySelectorAll('.timer-tile').forEach(t => t.classList.remove('active-selection'));
  const tile = document.getElementById(`timer-tile-${seconds}`);
  if (tile) tile.classList.add('active-selection');
  state.selectedTimer = seconds;
}

async function selectTimerAndStart(seconds) {
  getAudioContext();
  highlightTimer(seconds);
  state.capturedPhotos = [];
  state.currentShot = 0;
  resetThumbnails();
  updateShotUI();

  playBeep(false);
  triggerHaptic([30]);

  // Spring animation on tile
  const tile = document.getElementById(`timer-tile-${seconds}`);
  if (tile) {
    tile.style.transform = 'scale(0.92)';
    await sleep(150);
    tile.style.transform = '';
  }

  showScreen('camera');
  await startCamera();
  await sleep(700);
  runAutoSession();
}

/* ──────────────────────────────────────────────────────
   CAMERA
────────────────────────────────────────────────────── */
async function startCamera() {
  const video = $('camera-feed');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false,
    });
    state.stream = stream;
    video.srcObject = stream;
    await new Promise(resolve => {
      video.onloadedmetadata = () => { video.play(); resolve(); };
    });
  } catch (err) {
    console.error('Camera error:', err);
    showCameraError();
  }
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach(t => t.stop());
    state.stream = null;
  }
  const video = $('camera-feed');
  if (video) video.srcObject = null;
  state.isShooting = false;
}

function showCameraError() {
  const screen = $('screen-camera');
  screen.innerHTML = `
    <div class="cam-error">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>Camera access denied or unavailable.<br>Please allow camera permission and reload the page.</p>
    </div>`;
}

/* ──────────────────────────────────────────────────────
   AUTO SESSION — takes all 4 photos automatically
────────────────────────────────────────────────────── */
async function runAutoSession() {
  if (state.isShooting) return;
  state.isShooting = true;

  for (let i = 0; i < TOTAL_SHOTS; i++) {
    state.currentShot = i;
    updateShotUI();

    await runCountdown(state.selectedTimer);
    await capturePhoto(i);

    if (i < TOTAL_SHOTS - 1) {
      await sleep(700);
    }
  }

  // Session complete
  await sleep(600);
  state.isShooting = false;
  showScreen('finish');
  await renderPhotostrip();

  // Celebration effects
  playSuccessChime();
  triggerHaptic([40, 40, 80]);
  fireConfetti();
  init3DTilt();
}

async function runCountdown(seconds) {
  const overlay = $('countdown-overlay');
  const numEl   = $('countdown-number');

  let count = seconds;

  overlay.classList.remove('hidden');
  setCountdownNum(numEl, count);
  playBeep(false);
  triggerHaptic([25]);

  await sleep(1000);

  return new Promise(resolve => {
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        playBeep(true);
        triggerHaptic([40]);
        overlay.classList.add('hidden');
        resolve();
      } else {
        setCountdownNum(numEl, count);
        playBeep(false);
        triggerHaptic([25]);
      }
    }, 1000);
  });
}

function setCountdownNum(el, n) {
  el.textContent = n;
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'countSpring 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
}

async function capturePhoto(index) {
  const video  = $('camera-feed');
  const canvas = $('snap-canvas');

  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 960;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0);
  ctx.restore();

  // Shutter sound + haptics + visual studio flash
  playShutterSound();
  triggerHaptic([30, 20, 50]);
  triggerFlash();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
  state.capturedPhotos[index] = dataUrl;

  // Animate thumbnail landing
  const slot = $(`thumb-${index + 1}`);
  slot.innerHTML = `<img src="${dataUrl}" alt="Photo ${index + 1}" />`;
  slot.classList.remove('filled');
  void slot.offsetHeight;
  slot.classList.add('filled');
}

function triggerFlash() {
  const flash = $('flash-overlay');
  flash.classList.remove('hidden', 'flashing');
  void flash.offsetHeight;
  flash.classList.add('flashing');
  setTimeout(() => flash.classList.add('hidden'), 400);
}

/* ──────────────────────────────────────────────────────
   UI HELPERS
────────────────────────────────────────────────────── */
function updateShotUI() {
  const shotNum = state.currentShot + 1;
  $('shot-num').textContent = shotNum;
  for (let i = 1; i <= TOTAL_SHOTS; i++) {
    const dot = $(`dot-${i}`);
    dot.classList.remove('done', 'active');
    if (i < shotNum)        dot.classList.add('done');
    else if (i === shotNum) dot.classList.add('active');
  }
}

function resetThumbnails() {
  for (let i = 1; i <= TOTAL_SHOTS; i++) {
    const slot = $(`thumb-${i}`);
    slot.innerHTML = `<span class="thumb-empty">${i}</span>`;
    slot.classList.remove('filled');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ──────────────────────────────────────────────────────
   PHOTOSTRIP RENDERING (Pixel-Perfect Slots)
────────────────────────────────────────────────────── */
const TEMPLATE_LAYOUTS = {
  1: {
    slots: [
      { top: 0.0345,  left: 0.05516, width: 0.88826, height: 0.177 },
      { top: 0.2225,  left: 0.05516, width: 0.88826, height: 0.177 },
      { top: 0.409,   left: 0.05658, width: 0.88826, height: 0.177 },
      { top: 0.5965,  left: 0.05516, width: 0.88826, height: 0.177 },
    ],
  },
  2: {
    slots: [
      { top: 0.02,    left: 0.05658, width: 0.88543, height: 0.1765 },
      { top: 0.21,    left: 0.05658, width: 0.88543, height: 0.1765 },
      { top: 0.6115,  left: 0.05658, width: 0.88543, height: 0.1765 },
      { top: 0.8015,  left: 0.05658, width: 0.88543, height: 0.1765 },
    ],
  },
};

async function renderPhotostrip() {
  const canvas = $('strip-canvas');
  const ctx    = canvas.getContext('2d');

  const templateSrc = `HEY ITS ME PHOTOSTRIP TEMPLATE/VERSION ${state.selectedTemplate}.png`;
  const template    = await loadImage(templateSrc);

  canvas.width  = template.naturalWidth;
  canvas.height = template.naturalHeight;

  ctx.drawImage(template, 0, 0);

  const layout = TEMPLATE_LAYOUTS[state.selectedTemplate];

  for (let i = 0; i < TOTAL_SHOTS; i++) {
    const slot  = layout.slots[i];
    const photo = await loadImage(state.capturedPhotos[i]);

    const dx = Math.round(slot.left   * canvas.width);
    const dy = Math.round(slot.top    * canvas.height);
    const dw = Math.round(slot.width  * canvas.width);
    const dh = Math.round(slot.height * canvas.height);

    const photoAR = photo.naturalWidth / photo.naturalHeight;
    const slotAR  = dw / dh;

    let sw, sh, sx, sy;
    if (photoAR > slotAR) {
      sh = photo.naturalHeight;
      sw = sh * slotAR;
      sx = (photo.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      sw = photo.naturalWidth;
      sh = sw / slotAR;
      sx = 0;
      sy = (photo.naturalHeight - sh) / 2;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(photo, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

/* ──────────────────────────────────────────────────────
   SAVE & TOAST FEEDBACK
────────────────────────────────────────────────────── */
function saveStrip() {
  const canvas = $('strip-canvas');
  const link   = document.createElement('a');
  const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  link.download = `hey-its-me-photostrip-${ts}.jpg`;
  link.href     = canvas.toDataURL('image/jpeg', 0.95);
  link.click();

  showToast();
  playBeep(true);
  triggerHaptic([30, 40, 60]);
}

let toastTimer = null;
function showToast() {
  const toast = $('toast');
  if (!toast) return;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

/* ──────────────────────────────────────────────────────
   INTERACTIVE 3D PERSPECTIVE TILT
────────────────────────────────────────────────────── */
function init3DTilt() {
  const container = $('strip-container');
  const canvas    = $('strip-canvas');
  if (!container || !canvas) return;

  container.onmousemove = (e) => {
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;

    const rotX = -y * 18;
    const rotY = x * 18;

    canvas.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  container.onmouseleave = () => {
    canvas.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  };
}

/* ──────────────────────────────────────────────────────
   CELEBRATION CONFETTI ENGINE (Pure Canvas Flakes)
────────────────────────────────────────────────────── */
function fireConfetti() {
  const canvas = $('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = [
    '#d4a847', // gold
    '#f2c968', // light gold
    '#ffffff', // white sparkle
    '#f5f0e8', // cream
    '#c9a96e', // tan
    '#a87c32', // dark gold
  ];

  const particles = [];
  const count = 75;

  for (let i = 0; i < count; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() * 200 - 100),
      y: canvas.height * 0.65,
      vx: (Math.random() - 0.5) * 16,
      vy: -(Math.random() * 14 + 10),
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 8,
      gravity: 0.38,
      opacity: 1,
      drag: 0.985,
    });
  }

  let animationFrame;
  const startTime = Date.now();

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let active = false;
    for (let p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= p.drag;
      p.vy *= p.drag;
      p.rotation += p.rotSpeed;

      if (p.y > canvas.height * 0.7) {
        p.opacity -= 0.015;
      }

      if (p.opacity > 0) {
        active = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
    }

    if (active && Date.now() - startTime < 4000) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(animationFrame);
    }
  }

  animate();
}
