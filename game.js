"use strict";

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const frame = document.getElementById("gameFrame");
const startOverlay = document.getElementById("startOverlay");
const deathOverlay = document.getElementById("deathOverlay");
const winOverlay = document.getElementById("winOverlay");
const progressFill = document.getElementById("progressFill");
const attemptLabel = document.getElementById("attempt");
const deathPercent = document.getElementById("deathPercent");
const playButton = document.getElementById("playButton");
const retryButton = document.getElementById("retryButton");
const againButton = document.getElementById("againButton");
const soundControl = document.getElementById("soundControl");
const soundState = document.getElementById("soundState");
const gemCount = document.getElementById("gemCount");
const themeControl = document.getElementById("themeControl");
const themeState = document.getElementById("themeState");
const levelNumber = document.getElementById("levelNumber");
const nextLevelButton = document.getElementById("nextLevelButton");

let width = 0;
let height = 0;
let groundY = 0;
let scale = 1;
let running = false;
let won = false;
let attempt = 1;
let soundEnabled = true;
let lastTime = 0;
let cameraX = 0;
let worldWidth = 7200;
let audioContext = null;
let gems = 700;
let minecraftMode = false;
let currentLevel = 1;

try {
  const savedLevel = Number(localStorage.getItem("neonDashLevel"));
  if (Number.isInteger(savedLevel) && savedLevel >= 1 && savedLevel <= 700) {
    currentLevel = savedLevel;
  }
} catch (_) {
  currentLevel = 1;
}

try {
  const savedGems = localStorage.getItem("neonDashGems");
  if (savedGems !== null && Number.isFinite(Number(savedGems)) && Number(savedGems) >= 0) {
    gems = Number(savedGems);
  }
} catch (_) {
  gems = 700;
}

const player = {
  x: 230,
  y: 0,
  size: 42,
  vy: 0,
  angle: 0,
  grounded: false,
};

const baseSpikes = [
  [930, 1], [970, 1], [1120, 1], [1160, 1], [1200, 1],
  [1510, 1], [1550, 1], [1590, 1], [1810, 2],
  [2200, 1], [2240, 1], [2500, 2], [2540, 1],
  [2880, 1], [2920, 1], [2960, 1], [3160, 2],
  [3500, 1], [3540, 1], [3810, 1], [3850, 1],
  [4140, 1], [4180, 1], [4220, 1], [4480, 2],
  [4780, 1], [4820, 1], [5100, 2], [5140, 1],
  [5500, 1], [5540, 1], [5580, 1], [5860, 2], [5900, 1],
];

const baseBlocks = [
  [1370, 88], [1412, 88], [1980, 88], [2022, 88], [2064, 88],
  [2320, 88], [2362, 88], [2700, 88], [2742, 88],
  [3260, 88], [3302, 88], [3344, 88], [3650, 88],
  [3950, 88], [3992, 88], [4300, 88], [4342, 88],
  [4580, 88], [4622, 88], [4664, 88], [4920, 88],
  [5200, 88], [5242, 88], [5660, 88], [5702, 88],
];

const basePads = [
  [1800, 64], [2488, 64], [3148, 64], [4468, 64], [5848, 64],
];

const baseGemsOnLevel = [
  [760, 115], [1040, 115], [1470, 190], [1870, 190], [2370, 115],
  [2600, 200], [3060, 115], [3370, 190], [3720, 115], [4050, 190],
  [4400, 115], [4700, 190], [5000, 115], [5340, 190], [5740, 115], [6100, 115],
];

let spikes = baseSpikes;
let blocks = baseBlocks;
let pads = basePads;
let gemsOnLevel = baseGemsOnLevel;

const particles = [];
const collectedGems = new Set();
const LEVEL_COUNT = 700;

function buildLevel(level) {
  levelNumber.textContent = level;
  collectedGems.clear();
  if (level === 1) {
    spikes = baseSpikes;
    blocks = baseBlocks;
    pads = basePads;
    gemsOnLevel = baseGemsOnLevel;
    return;
  }

  let seed = (level * 0x9e3779b1) >>> 0;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  spikes = [];
  blocks = [];
  pads = [];
  gemsOnLevel = [];
  let x = 850;
  while (x < 6200) {
    const isBlock = random() < 0.26;
    const spikeCount = random() < 0.24 ? 2 : 1;
    if (isBlock) {
      blocks.push([x, 88]);
    } else {
      spikes.push([x, spikeCount]);
    }

    if (random() < 0.8) {
      gemsOnLevel.push([x - 110, random() < 0.55 ? 110 : 175]);
    }
    x += (isBlock ? 88 : spikeCount * 42) + 300 + Math.floor(random() * 100);
  }
}

function saveUnlockedLevel(level) {
  try {
    const savedLevel = Number(localStorage.getItem("neonDashLevel")) || 1;
    localStorage.setItem("neonDashLevel", String(Math.max(savedLevel, level)));
  } catch (_) {
    // The current session can still progress if storage is unavailable.
  }
}

function advanceLevel() {
  if (currentLevel >= LEVEL_COUNT) return;
  currentLevel += 1;
  buildLevel(currentLevel);
  resetGame(false);
}

function resize() {
  const rect = frame.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = rect.width;
  height = rect.height;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scale = Math.max(0.78, Math.min(1.15, height / 620));
  groundY = height - 118 * scale;
  player.size = 42 * scale;
  if (!running) player.y = groundY - player.size;
}

function resetGame(nextAttempt = false) {
  if (nextAttempt) attempt += 1;
  attemptLabel.textContent = attempt;
  cameraX = 0;
  player.x = 230;
  player.y = groundY - player.size;
  player.vy = 0;
  player.angle = 0;
  player.grounded = true;
  won = false;
  particles.length = 0;
  collectedGems.clear();
  progressFill.style.width = "0%";
  deathOverlay.classList.remove("visible");
  winOverlay.classList.remove("visible");
  startOverlay.classList.remove("visible");
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function startGame() {
  ensureAudio();
  resetGame(false);
}

function retryGame() {
  ensureAudio();
  resetGame(true);
}

function ensureAudio() {
  if (!soundEnabled) return;
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function tone(frequency, duration, type = "square", volume = 0.025) {
  if (!soundEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function jump() {
  if (!running) return;
  if (player.grounded) {
    player.vy = -860 * scale;
    player.grounded = false;
    tone(170, 0.09, "square", 0.018);
  }
}

function crash() {
  if (!running) return;
  running = false;
  tone(75, 0.32, "sawtooth", 0.06);
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24;
    particles.push({
      x: player.x + player.size / 2,
      y: player.y + player.size / 2,
      vx: Math.cos(angle) * (120 + Math.random() * 180),
      vy: Math.sin(angle) * (120 + Math.random() * 180),
      life: 0.65 + Math.random() * 0.25,
      size: 5 + Math.random() * 9,
    });
  }
  const progress = Math.min(100, Math.floor((cameraX / (worldWidth - 650)) * 100));
  deathPercent.textContent = `${progress}%`;
  setTimeout(() => deathOverlay.classList.add("visible"), 380);
}

function finish() {
  if (won) return;
  won = true;
  running = false;
  saveUnlockedLevel(Math.min(currentLevel + 1, LEVEL_COUNT));
  nextLevelButton.style.display = currentLevel < LEVEL_COUNT ? "" : "none";
  winOverlay.querySelector(".eyebrow").textContent =
    currentLevel < LEVEL_COUNT ? `LEVEL ${currentLevel} COMPLETE` : "ALL 700 LEVELS COMPLETE";
  progressFill.style.width = "100%";
  tone(440, 0.12, "square", 0.03);
  setTimeout(() => tone(660, 0.18, "square", 0.03), 120);
  setTimeout(() => winOverlay.classList.add("visible"), 300);
}

function update(dt) {
  if (!running) {
    updateParticles(dt);
    return;
  }

  const speed = 390 * scale;
  cameraX += speed * dt;
  player.vy += 1900 * scale * dt;
  player.y += player.vy * dt;

  const floor = groundY - player.size;
  if (player.y >= floor) {
    const wasAirborne = !player.grounded;
    player.y = floor;
    player.vy = 0;
    player.grounded = true;
    if (wasAirborne) tone(95, 0.025, "sine", 0.008);
  } else {
    player.grounded = false;
  }

  if (!player.grounded) {
    player.angle += 4.8 * dt;
  } else {
    player.angle = Math.round(player.angle / (Math.PI / 2)) * (Math.PI / 2);
  }

  const worldPlayerX = cameraX + player.x;
  const left = worldPlayerX + 7 * scale;
  const right = worldPlayerX + player.size - 7 * scale;
  const top = player.y + 5 * scale;
  const bottom = player.y + player.size - 4 * scale;

  for (const [x, count] of spikes) {
    if (x + 42 * count < cameraX - 50 || x > cameraX + width + 50) continue;
    for (let i = 0; i < count; i++) {
      const sx = x + i * 42 * scale;
      if (right > sx + 7 * scale && left < sx + 35 * scale &&
          bottom > groundY - 38 * scale && top < groundY - 2 * scale) {
        crash();
        break;
      }
    }
  }
  if (!running) return;

  for (const [x, blockWidth] of blocks) {
    if (x + blockWidth < cameraX - 50 || x > cameraX + width + 50) continue;
    const by = groundY - 88 * scale;
    if (right > x && left < x + blockWidth * scale &&
        bottom > by && top < by + blockWidth * scale) {
      if (bottom - by < 16 * scale && player.vy >= 0) {
        player.y = by - player.size;
        player.vy = 0;
        player.grounded = true;
      } else {
        crash();
        break;
      }
    }
    if (!running) return;
  }

  for (const [x, padWidth] of pads) {
    if (worldPlayerX + player.size > x && worldPlayerX < x + padWidth &&
        bottom >= groundY - 8 * scale && bottom < groundY + 12 * scale) {
      player.vy = -980 * scale;
      player.grounded = false;
      tone(220, 0.12, "square", 0.025);
    }
  }

  for (const [x, heightAboveGround] of gemsOnLevel) {
    if (collectedGems.has(x)) continue;
    const gemY = groundY - heightAboveGround * scale;
    if (right > x - 16 * scale && left < x + 16 * scale &&
        bottom > gemY - 16 * scale && top < gemY + 16 * scale) {
      collectedGems.add(x);
      gems += 1;
      gemCount.textContent = gems;
      try {
        localStorage.setItem("neonDashGems", String(gems));
      } catch (_) {}
      tone(520, 0.08, "square", 0.018);
    }
  }

  progressFill.style.width = `${Math.min(100, (cameraX / (worldWidth - 650)) * 100)}%`;
  if (cameraX >= worldWidth - 650) finish();
  updateParticles(dt);
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.vy += 500 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  if (minecraftMode) {
    gradient.addColorStop(0, "#77b7df");
    gradient.addColorStop(0.58, "#70a96a");
    gradient.addColorStop(1, "#3c672f");
  } else {
    gradient.addColorStop(0, "#172a56");
    gradient.addColorStop(0.58, "#162448");
    gradient.addColorStop(1, "#0b1833");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = "#43a6d8";
  ctx.lineWidth = 1;
  const grid = 54 * scale;
  const offsetX = -(cameraX * 0.18) % grid;
  for (let x = offsetX; x < width; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, groundY);
    ctx.stroke();
  }
  const offsetY = -(cameraX * 0.05) % grid;
  for (let y = offsetY + groundY - 350 * scale; y < groundY; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#8ad8ff";
  const farOffset = -(cameraX * 0.09) % 260;
  for (let x = farOffset - 260; x < width + 260; x += 260) {
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x + 95, groundY - 150 * scale);
    ctx.lineTo(x + 190, groundY);
    ctx.fill();
  }
  ctx.restore();
}

function drawGround() {
  ctx.fillStyle = minecraftMode ? "#3f2d20" : "#090e23";
  ctx.fillRect(0, groundY, width, height - groundY);

  ctx.fillStyle = minecraftMode ? "#68a84b" : "#22b9d2";
  ctx.fillRect(0, groundY - 5 * scale, width, 5 * scale);
  ctx.fillStyle = "#c0f5ff";
  ctx.fillRect(0, groundY - 7 * scale, width, 2 * scale);

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = "#27708a";
  ctx.lineWidth = 1;
  for (let x = -(cameraX % 48); x < width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 18);
    ctx.lineTo(x - 30, height);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpikes() {
  for (const [x, count] of spikes) {
    for (let i = 0; i < count; i++) {
      const sx = x + i * 42 * scale - cameraX;
      if (sx < -50 || sx > width + 50) continue;
      const top = groundY - 40 * scale;
      ctx.save();
      ctx.shadowColor = "#ff3daf";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ff77bd";
      ctx.strokeStyle = "#ffe0ef";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, groundY);
      ctx.lineTo(sx + 21 * scale, top);
      ctx.lineTo(sx + 42 * scale, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

function drawBlocks() {
  for (const [x, blockWidth] of blocks) {
    const bx = x - cameraX;
    if (bx < -100 || bx > width + 100) continue;
    const by = groundY - 88 * scale;
    const bw = blockWidth * scale;
    ctx.save();
    ctx.shadowColor = "#20e3ff";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "#0f6a91";
    ctx.strokeStyle = "#73ecff";
    ctx.lineWidth = 2;
    ctx.fillRect(bx, by, bw, 88 * scale);
    ctx.strokeRect(bx, by, bw, 88 * scale);
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#b9f7ff";
    ctx.beginPath();
    ctx.moveTo(bx + 8, by + 8);
    ctx.lineTo(bx + bw - 8, by + 8);
    ctx.lineTo(bx + bw - 8, by + 88 * scale - 8);
    ctx.stroke();
    ctx.restore();
  }
}

function drawPads() {
  for (const [x, padWidth] of pads) {
    const px = x - cameraX;
    if (px < -100 || px > width + 100) continue;
    ctx.save();
    ctx.shadowColor = "#ffe44d";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#ffe44d";
    ctx.beginPath();
    ctx.moveTo(px, groundY);
    ctx.lineTo(px + 10 * scale, groundY - 18 * scale);
    ctx.lineTo(px + padWidth * scale - 10 * scale, groundY - 18 * scale);
    ctx.lineTo(px + padWidth * scale, groundY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawGems() {
  for (const [x, heightAboveGround] of gemsOnLevel) {
    if (collectedGems.has(x)) continue;
    const gemX = x - cameraX;
    if (gemX < -30 || gemX > width + 30) continue;
    const gemY = groundY - heightAboveGround * scale;
    ctx.save();
    ctx.translate(gemX, gemY);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = minecraftMode ? "#77ff77" : "#55ffae";
    ctx.shadowBlur = 16;
    ctx.fillStyle = minecraftMode ? "#55aa55" : "#55ffae";
    ctx.strokeStyle = "#dfffee";
    ctx.lineWidth = 2;
    ctx.fillRect(-10 * scale, -10 * scale, 20 * scale, 20 * scale);
    ctx.strokeRect(-10 * scale, -10 * scale, 20 * scale, 20 * scale);
    ctx.restore();
  }
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x + player.size / 2, player.y + player.size / 2);
  ctx.rotate(player.angle);
  ctx.shadowColor = "#20e3ff";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#35e0ff";
  ctx.strokeStyle = "#d8fbff";
  ctx.lineWidth = 3;
  ctx.fillRect(-player.size / 2, -player.size / 2, player.size, player.size);
  ctx.strokeRect(-player.size / 2, -player.size / 2, player.size, player.size);
  ctx.fillStyle = "#10182f";
  ctx.fillRect(-player.size * 0.24, -player.size * 0.14, player.size * 0.48, player.size * 0.28);
  ctx.fillStyle = "#ffe44d";
  ctx.beginPath();
  ctx.moveTo(player.size * 0.12, -player.size * 0.28);
  ctx.lineTo(player.size * 0.36, 0);
  ctx.lineTo(player.size * 0.12, player.size * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = Math.random() > 0.5 ? "#35e0ff" : "#ffe44d";
    ctx.fillRect(p.x - cameraX, p.y, p.size, p.size);
  }
  ctx.restore();
}

function draw() {
  drawBackground();
  drawGround();
  drawSpikes();
  drawBlocks();
  drawPads();
  drawGems();
  drawParticles();
  drawPlayer();
}

function loop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.032);
  lastTime = time;
  update(dt);
  draw();
  if (running || particles.length > 0) requestAnimationFrame(loop);
}

playButton.addEventListener("click", startGame);
retryButton.addEventListener("click", retryGame);
againButton.addEventListener("click", retryGame);
nextLevelButton.addEventListener("click", advanceLevel);

frame.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) return;
  ensureAudio();
  jump();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    if (!running && !startOverlay.classList.contains("visible") &&
        !deathOverlay.classList.contains("visible") && !winOverlay.classList.contains("visible")) {
      retryGame();
    } else {
      ensureAudio();
      jump();
    }
  }
  if (event.code === "KeyR") {
    retryGame();
  }
});

soundControl.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundState.textContent = soundEnabled ? "ON" : "OFF";
  if (soundEnabled) ensureAudio();
});

themeControl.addEventListener("click", () => {
  minecraftMode = !minecraftMode;
  document.body.classList.toggle("minecraft-mode", minecraftMode);
  themeState.textContent = minecraftMode ? "MC 1.21" : "NEON";
  tone(minecraftMode ? 260 : 520, 0.08, "square", 0.015);
});

window.addEventListener("resize", () => {
  resize();
  if (!running) player.y = groundY - player.size;
});

resize();
buildLevel(currentLevel);
gemCount.textContent = gems;
draw();
