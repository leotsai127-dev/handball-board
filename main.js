// DOM Elements
const boardContainer = document.getElementById('board-container');
const zoomWrapper = document.getElementById('zoom-wrapper');
const tokensLayer = document.getElementById('tokens-layer');
const drawingLayer = document.getElementById('drawing-layer');
const ctx = drawingLayer.getContext('2d');

// Buttons
const btnToggleView = document.getElementById('btn-toggle-view');
const btnDrawMode = document.getElementById('btn-draw-mode');
const btnClearDraw = document.getElementById('btn-clear-draw');
const btnAddRed = document.getElementById('add-red');
const btnAddBlue = document.getElementById('add-blue');
const btnAddBall = document.getElementById('add-ball');
const btnClearTokens = document.getElementById('btn-clear-tokens');
const btnAddFrame = document.getElementById('btn-add-frame');
const btnPrevFrame = document.getElementById('btn-prev-frame');
const btnPlay = document.getElementById('btn-play');
const btnNextFrame = document.getElementById('btn-next-frame');
const btnClearFrames = document.getElementById('btn-clear-frames');
const btnDeleteFrame = document.getElementById('btn-delete-frame');
const btnExportVideo = document.getElementById('btn-export-video');
const btnExportJson = document.getElementById('btn-export-json');
const btnImportJson = document.getElementById('btn-import-json');
const fileImportJson = document.getElementById('file-import-json');
const presetSelect = document.getElementById('preset-select');
const btnLoadPreset = document.getElementById('btn-load-preset');

// State
let isDrawMode = false;
let isDrawing = false;
let isDragging = false;
let draggedToken = null;
let currentFrameCount = 0;
let frames = [];
let firstHalfCourtToggle = true;

let tokenCounter = 0;

// Setup Canvas properly
function resizeCanvas() {
  // We use fixed internal resolution mapping to the handball court ratio (2:1)
  // Let's use 800x400 for smooth lines
  drawingLayer.width = 800;
  drawingLayer.height = 400;

  // Set drawing stroke style
  ctx.strokeStyle = 'yellow';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // init

// Reverse-engineer coordinate systems
function getLocalCoords(e) {
  const rect = boardContainer.getBoundingClientRect();
  const screenX = e.clientX - rect.left - rect.width / 2;
  const screenY = e.clientY - rect.top - rect.height / 2;

  const zw = zoomWrapper.offsetWidth;
  const zh = zoomWrapper.offsetHeight;
  const isHalf = boardContainer.classList.contains('half-court');

  let lx, ly;
  if (isHalf) {
    const scale = Math.min(rect.width / zh, rect.height / zh);
    // transform was: scale(scale), rotate(-90deg), translateX(shiftX)
    // Reverse math: 
    // sx = screenX, sy = screenY
    const ty = screenX / scale;
    const tx = -screenY / scale;
    const shiftX = zw * (100 / 440);
    lx = tx - shiftX;
    ly = ty;
  } else {
    const scale = Math.min(rect.width / zw, rect.height / zh);
    lx = screenX / scale;
    ly = screenY / scale;
  }

  const x = lx + zw / 2;
  const y = ly + zh / 2;
  return {
    x, y,
    percentX: (x / zw) * 100,
    percentY: (y / zh) * 100
  };
}

// ==== DRAWING LOGIC ====
drawingLayer.addEventListener('pointerdown', (e) => {
  if (!isDrawMode) return;
  isDrawing = true;
  const { x, y } = getLocalCoords(e);

  // map wrapper coords to canvas coords (which are 800x400)
  const cx = (x / zoomWrapper.offsetWidth) * 800;
  const cy = (y / zoomWrapper.offsetHeight) * 400;

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  drawingLayer.setPointerCapture(e.pointerId);
});

drawingLayer.addEventListener('pointermove', (e) => {
  if (!isDrawing) return;
  const { x, y } = getLocalCoords(e);
  const cx = (x / zoomWrapper.offsetWidth) * 800;
  const cy = (y / zoomWrapper.offsetHeight) * 400;

  ctx.lineTo(cx, cy);
  ctx.stroke();
});

drawingLayer.addEventListener('pointerup', (e) => {
  isDrawing = false;
  drawingLayer.releasePointerCapture(e.pointerId);
});
drawingLayer.addEventListener('pointercancel', () => isDrawing = false);

// Toggle Draw Mode
btnDrawMode.addEventListener('click', () => {
  isDrawMode = !isDrawMode;
  if (isDrawMode) {
    btnDrawMode.innerText = "Pen: ON";
    btnDrawMode.classList.add('active');
    drawingLayer.classList.add('drawing-active');
  } else {
    btnDrawMode.innerText = "Pen: OFF";
    btnDrawMode.classList.remove('active');
    drawingLayer.classList.remove('drawing-active');
  }
});

// Clear Draw
btnClearDraw.addEventListener('click', () => {
  ctx.clearRect(0, 0, drawingLayer.width, drawingLayer.height);
});


// ==== TOKEN DRAG LOGIC ====
let dragOffsetX = 0, dragOffsetY = 0;

tokensLayer.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('token')) {
    isDragging = true;
    draggedToken = e.target;
    draggedToken.classList.remove('animated');

    const local = getLocalCoords(e);
    const tkX = (parseFloat(draggedToken.style.left || 50) / 100) * zoomWrapper.offsetWidth;
    const tkY = (parseFloat(draggedToken.style.top || 50) / 100) * zoomWrapper.offsetHeight;

    dragOffsetX = local.x - tkX;
    dragOffsetY = local.y - tkY;

    draggedToken.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});

tokensLayer.addEventListener('pointermove', (e) => {
  if (!isDragging || !draggedToken) return;
  const local = getLocalCoords(e);

  const targetX = local.x - dragOffsetX;
  const targetY = local.y - dragOffsetY;

  let newLeft = (targetX / zoomWrapper.offsetWidth) * 100;
  let newTop = (targetY / zoomWrapper.offsetHeight) * 100;

  draggedToken.style.left = `${Math.max(0, Math.min(100, newLeft))}%`;
  draggedToken.style.top = `${Math.max(0, Math.min(100, newTop))}%`;
});

tokensLayer.addEventListener('pointerup', (e) => {
  if (draggedToken) {
    draggedToken.releasePointerCapture(e.pointerId);
  }
  isDragging = false;
  draggedToken = null;
});
tokensLayer.addEventListener('pointercancel', () => {
  isDragging = false;
  draggedToken = null;
});


// ==== SPAWNING & CLEARING TOKENS ====
function createToken(type, icon) {
  const t = document.createElement('div');
  t.classList.add('token');
  t.dataset.type = type;
  t.dataset.number = icon;
  t.id = `token-${tokenCounter++}`;
  t.innerText = icon;

  // Spawn in middle
  t.style.left = '50%';
  t.style.top = '50%';

  tokensLayer.appendChild(t);
  return t;
}

btnAddRed.addEventListener('click', () => createToken('red', 'R'));
btnAddBlue.addEventListener('click', () => createToken('blue', 'B'));
btnAddBall.addEventListener('click', () => createToken('ball', ''));

btnClearTokens.addEventListener('click', () => {
  tokensLayer.innerHTML = '';
});


function updateZoom() {
  const cw = boardContainer.clientWidth;
  const ch = boardContainer.clientHeight;
  const zw = zoomWrapper.offsetWidth;
  const zh = zoomWrapper.offsetHeight;

  // Keep rigidly centered
  zoomWrapper.style.marginLeft = `${-zw / 2}px`;
  zoomWrapper.style.marginTop = `${-zh / 2}px`;

  if (boardContainer.classList.contains('half-court')) {
    // 90deg rotate means its visual width is zh, visual height is zh.
    const scale = Math.min(cw / zh, ch / zh);

    // Original center = 200. Left center = 100.
    // So we translate native X by +100 units.
    const shiftX = zw * (100 / 440);

    zoomWrapper.style.transform = `scale(${scale}) rotate(-90deg) translateX(${shiftX}px)`;
  } else {
    const scale = Math.min(cw / zw, ch / zh);
    zoomWrapper.style.transform = `scale(${scale})`;
  }
}

// ==== VIEWPORT TOGGLE ====
btnToggleView.addEventListener('click', () => {
  if (boardContainer.classList.contains('full-court')) {
    boardContainer.classList.remove('full-court');
    boardContainer.classList.add('half-court');
    btnToggleView.innerText = "Full Court";

    // Auto-move players to setup Half Court Array but only on the first toggle
    if (firstHalfCourtToggle) {
      const tokens = document.querySelectorAll('.token');

      // Phase 1: Defenders Retreat
      tokens.forEach(t => {
        let l = parseFloat(t.style.left);
        if (l <= 50 && t.dataset.number !== '5' && t.dataset.number !== '7') {
          t.classList.add('animated');
          let newLeft = Math.max(12, l - 8);
          t.style.left = `${newLeft}%`;

          if (t.dataset.number === '2' || t.dataset.number === '3') {
            let currentTop = parseFloat(t.style.top);
            t.style.top = currentTop < 50 ? `${currentTop - 6}%` : `${currentTop + 6}%`;
          }

          setTimeout(() => t.classList.remove('animated'), 500);
        }
      });

      // Phase 2: Attackers Approach (Delay by 600ms so defenders settle first)
      setTimeout(() => {
        tokens.forEach(t => {
          let l = parseFloat(t.style.left);
          if (l > 50 && t.dataset.number !== '7') {
            t.classList.add('animated');

            if (t.dataset.number === '5') {
              t.style.left = '20%';
              t.style.top = '45%';
            } else if (t.dataset.number === '4' || t.dataset.number === '6') {
              t.style.left = `${100 - l - 10}%`;
              // Push Wingers towards the sidelines
              let currentTop = parseFloat(t.style.top);
              t.style.top = currentTop < 50 ? `${Math.max(2, currentTop - 5)}%` : `${Math.min(98, currentTop + 5)}%`;
            } else {
              t.style.left = `${100 - l}%`;

              if (t.dataset.number === '2' || t.dataset.number === '3') {
                let currentTop = parseFloat(t.style.top);
                t.style.top = currentTop < 50 ? `${currentTop - 6}%` : `${currentTop + 6}%`;
              }
            }

            setTimeout(() => t.classList.remove('animated'), 500);
          }
        });

        // Hand the ball to Blue 1 (Center Back)
        const ball = document.querySelector('.token[data-type="ball"]');
        const blue1 = Array.from(tokens).find(t => t.dataset.type === 'blue' && t.dataset.number === '1');
        if (ball && blue1) {
          ball.classList.add('animated');
          // Put the ball slightly in front of Blue 1
          ball.style.left = `${parseFloat(blue1.style.left) - 2}%`;
          ball.style.top = blue1.style.top;
          setTimeout(() => ball.classList.remove('animated'), 500);
        }

      }, 600);

      firstHalfCourtToggle = false;
    }

  } else {
    boardContainer.classList.remove('half-court');
    boardContainer.classList.add('full-court');
    btnToggleView.innerText = "Half Court";
  }
  updateZoom(); // Apply math immediately
});


// ==== ANIMATION & EXPORT LOGIC ====
let isPlaying = false;
let currentPlayIndex = 0;

btnAddFrame.addEventListener('click', () => {
  const tokens = document.querySelectorAll('.token');
  const frameState = [];
  tokens.forEach(t => {
    frameState.push({
      id: t.id,
      left: t.style.left,
      top: t.style.top,
      type: t.dataset.type,     // Store type for robust import
      number: t.dataset.number  // Store number for robust import
    });
  });
  frames.push(frameState);
  currentFrameCount++;
  btnAddFrame.innerText = `Save Frame (${currentFrameCount})`;
});

btnClearFrames.addEventListener('click', () => {
  frames = [];
  currentFrameCount = 0;
  currentPlayIndex = 0;
  isPlaying = false;
  btnPlay.innerText = "Play Animation";
  btnPlay.classList.remove('bg-yellow');
  btnPlay.classList.add('success');
  btnAddFrame.innerText = "Save Frame";
});

btnDeleteFrame.addEventListener('click', () => {
  if (frames.length === 0) return;
  // Stop playback if active
  if (isPlaying) {
    isPlaying = false;
    btnPlay.innerText = "Play Animation";
    btnPlay.classList.remove('bg-yellow');
    btnPlay.classList.add('success');
  }
  // Remove the current frame
  frames.splice(currentPlayIndex, 1);
  currentFrameCount = frames.length;
  btnAddFrame.innerText = currentFrameCount > 0 ? `Save Frame (${currentFrameCount})` : "Save Frame";

  if (frames.length === 0) {
    currentPlayIndex = 0;
  } else {
    // Stay on same index (now pointing to next frame), or clamp to last
    currentPlayIndex = Math.min(currentPlayIndex, frames.length - 1);
    applyFrame(currentPlayIndex);
  }
});

// Helper: snap all tokens to a given frame index (no animation)
function applyFrame(index) {
  if (frames.length === 0) return;
  const frame = frames[index];
  document.querySelectorAll('.token').forEach(t => t.classList.remove('animated'));
  frame.forEach(state => {
    const el = document.getElementById(state.id);
    if (el) {
      el.style.left = state.left;
      el.style.top = state.top;
    }
  });
}

btnPrevFrame.addEventListener('click', () => {
  if (frames.length === 0) return;
  // If currently playing, stop first
  if (isPlaying) {
    isPlaying = false;
    btnPlay.innerText = "Play Animation";
    btnPlay.classList.remove('bg-yellow');
    btnPlay.classList.add('success');
  }
  currentPlayIndex = Math.max(0, currentPlayIndex - 1);
  applyFrame(currentPlayIndex);
});

btnNextFrame.addEventListener('click', () => {
  if (frames.length === 0) return;
  // If currently playing, stop first
  if (isPlaying) {
    isPlaying = false;
    btnPlay.innerText = "Play Animation";
    btnPlay.classList.remove('bg-yellow');
    btnPlay.classList.add('success');
  }
  currentPlayIndex = Math.min(frames.length - 1, currentPlayIndex + 1);
  applyFrame(currentPlayIndex);
});

// -- Option B: JSON Data Export/Import --
btnExportJson.addEventListener('click', async () => {
  if (frames.length === 0) {
    alert("No frames to export!");
    return;
  }

  const jsonData = JSON.stringify(frames);

  // Use the modern File System Access API to let users choose exactly where to save and rename.
  // This works on localhost or HTTPS contexts.
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'tactic_play.json',
        types: [{
          description: 'JSON File',
          accept: { 'application/json': ['.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonData);
      await writable.close();
      return; // Save completed
    } catch (err) {
      // User cancelled the prompt or some other error
      return;
    }
  }

  // Fallback for older browsers (downloads straight to default folder)
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonData);
  const a = document.createElement('a');
  a.setAttribute("href", dataStr);
  a.setAttribute("download", "tactic_play.json");
  document.body.appendChild(a);
  a.click();
  a.remove();
});

btnImportJson.addEventListener('click', () => {
  fileImportJson.click();
});

fileImportJson.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const importedFrames = JSON.parse(event.target.result);
      if (Array.isArray(importedFrames)) {
        frames = importedFrames;
        currentFrameCount = frames.length;
        currentPlayIndex = 0;
        isPlaying = false;
        btnPlay.innerText = "Play Animation";
        btnPlay.classList.remove('bg-yellow');
        btnPlay.classList.add('success');
        btnAddFrame.innerText = `Save Frame (${currentFrameCount})`;

        // Advance to first frame to visualize loaded state
        if (frames.length > 0) {
          const firstFrame = frames[0];
          firstFrame.forEach(state => {
            let el = document.getElementById(state.id);
            // Re-create token if it was missing 
            if (!el && state.type) {
              el = document.createElement('div');
              el.classList.add('token');
              el.dataset.type = state.type;
              el.dataset.number = state.number || '';
              el.id = state.id;
              el.innerText = state.number || '';
              tokensLayer.appendChild(el);

              // Safety check tokenCounter so we don't duplicate IDs later
              const numStr = state.id.split('-')[1];
              if (numStr && !isNaN(parseInt(numStr))) {
                tokenCounter = Math.max(tokenCounter, parseInt(numStr) + 1);
              }
            }
            if (el) {
              el.style.left = state.left;
              el.style.top = state.top;
            }
          });
        }
        alert(`Successfully loaded ${frames.length} frames.`);
      }
    } catch (err) {
      alert("Invalid play data file.");
    }
  };
  reader.readAsText(file);
});

// -- Option A: Video Recording --
let mediaRecorder;
let recordedChunks = [];

btnExportVideo.addEventListener('click', async () => {
  if (frames.length === 0) {
    alert("Please save some frames first to record an animation!");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      recordedChunks = [];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.href = url;
      a.download = 'handball_play.webm';
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();

      // Release capture
      stream.getTracks().forEach(track => track.stop());
    };

    // Start recording and instantly trigger playback
    mediaRecorder.start();
    btnPlay.click();

    // Stop recording automatically when the animation finishes
    const totalDurationMs = frames.length * 1000 + 500;
    setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }
    }, totalDurationMs);

  } catch (err) {
    console.error("Screen recording cancelled or failed.", err);
  }
});

btnPlay.addEventListener('click', async () => {
  if (frames.length === 0) return;

  if (isPlaying) {
    // Pause Action
    isPlaying = false;
    btnPlay.innerText = "Play Animation";
    btnPlay.classList.remove('bg-yellow');
    btnPlay.classList.add('success');
    // Snap to the end of the current frame and allow immediate dragging
    document.querySelectorAll('.token').forEach(t => t.classList.remove('animated'));
    return;
  }

  // Play Action
  isPlaying = true;
  btnPlay.innerText = "Pause";
  btnPlay.classList.remove('success');
  btnPlay.classList.add('bg-yellow');

  const tokens = document.querySelectorAll('.token');
  tokens.forEach(t => t.classList.add('animated'));

  while (isPlaying && currentPlayIndex < frames.length) {
    const frame = frames[currentPlayIndex];

    // Apply position
    frame.forEach(state => {
      const el = document.getElementById(state.id);
      if (el) {
        el.style.left = state.left;
        el.style.top = state.top;
      }
    });

    // Wait for transition duration (1s), check if paused frequently
    let elapsed = 0;
    while(elapsed < 1000 && isPlaying) {
      await new Promise(r => setTimeout(r, 100));
      elapsed += 100;
    }

    // Always increment index so next Play starts from the next frame 
    // (since if paused, we snap them to the end of this frame anyway)
    currentPlayIndex++;
  }

  // If finished naturally
  if (currentPlayIndex >= frames.length) {
    isPlaying = false;
    currentPlayIndex = 0; // Reset for next play
    btnPlay.innerText = "Play Animation";
    btnPlay.classList.remove('bg-yellow');
    btnPlay.classList.add('success');
    tokens.forEach(t => t.classList.remove('animated'));
  }
});

// Setup Initial Board Layout (Example players)
window.addEventListener('DOMContentLoaded', () => {
  // Red Team (Left side)
  const redPositions = [
    { n: '1', l: 35, t: 50 },   // CB
    { n: '2', l: 30, t: 25 },   // LB
    { n: '3', l: 30, t: 75 },   // RB
    { n: '4', l: 18, t: 15 },   // LW
    { n: '5', l: 20.5, t: 50 }, // Pivot (at 7m line)
    { n: '6', l: 18, t: 85 },   // RW
    { n: '7', l: 8, t: 50 }     // GK
  ];

  redPositions.forEach(p => {
    let t = createToken('red', p.n);
    t.style.left = `${p.l}%`;
    t.style.top = `${p.t}%`;
  });

  // Blue Team (Right side)
  const bluePositions = [
    { n: '1', l: 65, t: 50 },   // CB
    { n: '2', l: 70, t: 75 },   // LB (When facing left, LB is at the bottom)
    { n: '3', l: 70, t: 25 },   // RB
    { n: '4', l: 82, t: 85 },   // LW
    { n: '5', l: 79.5, t: 50 }, // Pivot (at 7m line)
    { n: '6', l: 82, t: 15 },   // RW
    { n: '7', l: 92, t: 50 }    // GK
  ];

  bluePositions.forEach(p => {
    let t = createToken('blue', p.n);
    t.style.left = `${p.l}%`;
    t.style.top = `${p.t}%`;
  });

  // Ball at center
  let ball = createToken('ball', '');
  ball.style.left = '50%';
  ball.style.top = '50%';

  updateZoom();
  window.addEventListener('resize', updateZoom);

  // ==== PRESET PLAYS LOADER ====
  // Fetch the manifest to populate the dropdown
  fetch('./plays/manifest.json')
    .then(r => r.json())
    .then(manifest => {
      manifest.forEach(play => {
        const opt = document.createElement('option');
        opt.value = play.file;
        opt.textContent = play.name;
        presetSelect.appendChild(opt);
      });
    })
    .catch(() => console.warn('No preset plays manifest found.'));

  btnLoadPreset.addEventListener('click', () => {
    const selectedFile = presetSelect.value;
    if (!selectedFile) return;

    fetch(`./plays/${selectedFile}`)
      .then(r => r.json())
      .then(importedFrames => {
        if (!Array.isArray(importedFrames)) return;

        frames = importedFrames;
        currentFrameCount = frames.length;
        currentPlayIndex = 0;
        isPlaying = false;
        btnPlay.innerText = "Play Animation";
        btnPlay.classList.remove('bg-yellow');
        btnPlay.classList.add('success');
        btnAddFrame.innerText = `Save Frame (${currentFrameCount})`;

        // Clear existing tokens and re-build from first frame
        tokensLayer.innerHTML = '';
        tokenCounter = 0;
        if (frames.length > 0) {
          frames[0].forEach(state => {
            const el = document.createElement('div');
            el.classList.add('token');
            el.dataset.type = state.type;
            el.dataset.number = state.number || '';
            el.id = state.id;
            el.innerText = state.number || '';
            el.style.left = state.left;
            el.style.top = state.top;
            tokensLayer.appendChild(el);
            const numStr = state.id.split('-')[1];
            if (numStr && !isNaN(parseInt(numStr))) {
              tokenCounter = Math.max(tokenCounter, parseInt(numStr) + 1);
            }
          });
        }
      })
      .catch(() => alert('無法載入此戰術檔！'));
  });
});
