/* ═══════════════════════════════════════════════════════
   HEY IT'S ME PHOTOBOOTH — app.js
   ═══════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────── */
const state = {
  selectedTemplate: 1,
  selectedTimer: 3,
  capturedPhotos: [],   // Array of dataURL strings
  currentShot: 0,
  stream: null,
  isShooting: false,
};

const TOTAL_SHOTS = 4;

/* ──────────────────────────────────────────────────────
   SCREENS
────────────────────────────────────────────────────── */
const screens = {
  welcome:  document.getElementById('screen-welcome'),
  template: document.getElementById('screen-template'),
  timer:    document.getElementById('screen-timer'),
  camera:   document.getElementById('screen-camera'),
  finish:   document.getElementById('screen-finish'),
};

const $ = id => document.getElementById(id);

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

/* ──────────────────────────────────────────────────────
   NAVIGATION
────────────────────────────────────────────────────── */
function goToWelcome() {
  stopCamera();
  showScreen('welcome');
}

function goToTemplate() {
  showScreen('template');
}

function goToTimer() {
  showScreen('timer');
  // Highlight the currently selected timer
  highlightTimer(state.selectedTimer);
}

function retake() {
  // Go back to timer screen so user can start again
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
  $(`tpl-card-${v}`).classList.add('selected');
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
  highlightTimer(seconds);
  state.capturedPhotos = [];
  state.currentShot = 0;
  resetThumbnails();
  updateShotUI();

  // Brief visual feedback on tile
  const tile = document.getElementById(`timer-tile-${seconds}`);
  if (tile) {
    tile.style.transform = 'scale(0.94)';
    await sleep(140);
    tile.style.transform = '';
  }

  showScreen('camera');
  await startCamera();
  await sleep(800);
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
    // Wait until stream is actually playing
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
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>Camera access denied or unavailable.<br>Please allow camera access and reload the page.</p>
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
      // Brief pause between shots
      await sleep(600);
    }
  }

  // All done — show finish after a moment
  await sleep(800);
  state.isShooting = false;
  showScreen('finish');
  renderPhotostrip();
}

async function runCountdown(seconds) {
  const overlay = $('countdown-overlay');
  const numEl   = $('countdown-number');

  let count = seconds;

  overlay.classList.remove('hidden');
  setCountdownNum(numEl, count);

  await sleep(1000); // wait for first tick

  return new Promise(resolve => {
    const interval = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(interval);
        overlay.classList.add('hidden');
        resolve();
      } else {
        setCountdownNum(numEl, count);
      }
    }, 1000);
  });
}

function setCountdownNum(el, n) {
  el.textContent = n;
  el.style.animation = 'none';
  void el.offsetHeight; // reflow
  el.style.animation = 'pulse-count 1s ease-in-out';
}

async function capturePhoto(index) {
  const video  = $('camera-feed');
  const canvas = $('snap-canvas');

  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 960;

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1); // mirror to match viewfinder
  ctx.drawImage(video, 0, 0);
  ctx.restore();

  triggerFlash();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.93);
  state.capturedPhotos[index] = dataUrl;

  // Update thumbnail
  const slot = $(`thumb-${index + 1}`);
  slot.innerHTML = `<img src="${dataUrl}" alt="Photo ${index + 1}" />`;
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
    if (i < shotNum)      dot.classList.add('done');
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
   PHOTOSTRIP RENDERING
   Pixel-perfect slot coordinates measured from actual images:
   Both templates are 707 × 2000 px

   VERSION 1 slots (all same width x=39–667):
     slot 1: y=69–423   (top=0.0345, h=0.177)
     slot 2: y=445–799  (top=0.2225, h=0.177)
     slot 3: y=818–1172 (top=0.409,  h=0.177)
     slot 4: y=1193–1547(top=0.5965, h=0.177)

   VERSION 2 slots (all same width x=40–666):
     slot 1: y=40–393   (top=0.02,   h=0.1765)
     slot 2: y=420–773  (top=0.21,   h=0.1765)
     slot 3: y=1223–1576(top=0.6115, h=0.1765)
     slot 4: y=1603–1956(top=0.8015, h=0.1765)
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

  canvas.width  = template.naturalWidth;  // 707
  canvas.height = template.naturalHeight; // 2000

  // 1. Draw the template as the base layer
  ctx.drawImage(template, 0, 0);

  const layout = TEMPLATE_LAYOUTS[state.selectedTemplate];

  // 2. For each slot, paint the photo first, then re-overlay the template on top
  //    This ensures the frame/border of the template sits ON TOP of the photos
  for (let i = 0; i < TOTAL_SHOTS; i++) {
    const slot  = layout.slots[i];
    const photo = await loadImage(state.capturedPhotos[i]);

    // Destination rect in canvas pixels
    const dx = Math.round(slot.left   * canvas.width);
    const dy = Math.round(slot.top    * canvas.height);
    const dw = Math.round(slot.width  * canvas.width);
    const dh = Math.round(slot.height * canvas.height);

    // Cover-fit: crop photo to fill slot exactly
    const photoAR = photo.naturalWidth / photo.naturalHeight;
    const slotAR  = dw / dh;

    let sw, sh, sx, sy;
    if (photoAR > slotAR) {
      // Photo wider than slot → crop left/right
      sh = photo.naturalHeight;
      sw = sh * slotAR;
      sx = (photo.naturalWidth - sw) / 2;
      sy = 0;
    } else {
      // Photo taller than slot → crop top/bottom
      sw = photo.naturalWidth;
      sh = sw / slotAR;
      sx = 0;
      sy = (photo.naturalHeight - sh) / 2;
    }

    // Draw photo into slot (destination-over the template)
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
   SAVE
────────────────────────────────────────────────────── */
function saveStrip() {
  const canvas = $('strip-canvas');
  const link   = document.createElement('a');
  const ts     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  link.download = `hey-its-me-photostrip-${ts}.jpg`;
  link.href     = canvas.toDataURL('image/jpeg', 0.95);
  link.click();
}
