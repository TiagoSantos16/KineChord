// Orchestration: camera, continuous detect loop, watchdog, engine switch.
// Inference runs on a worker and ships one ImageBitmap per detect; at most one
// detect is in flight (frames drop rather than queue).

import {
  CAMERA_CONSTRAINTS,
  DETECT_TIMEOUT_MS,
  MAX_TRACKER_RESTARTS,
  HIT_ZONES,
  DEFAULT_VOLUME,
} from "./config.js";
import { Renderer } from "./renderer.js";
import { DetectionService } from "./detector.js";
import { HitZones, extractTips } from "./hitzones.js";
import { AudioFeedback } from "./audio.js";

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const statusEl = $("status");
const statusText = $("statusText");
const startBtn = $("startBtn");
const volumeEl = $("volume");
const engineCpu = $("engineCpu");
const engineGpu = $("engineGpu");

const renderer = new Renderer(canvas);
const service = new DetectionService();
const hitZones = new HitZones(HIT_ZONES);
const audio = new AudioFeedback();
hitZones.onStrike = (def) => {
  console.log(`[hit] ${def.id} (${def.voice})`);
  audio.play(def.voice);
};
service.onError = () => {
  if (running) manageFailure();
};

let running = false;
let degraded = false; // tracker finished; camera-only mode
let restarting = false;
let restartCount = 0;
let engineSwitching = false; // CPU/GPU switch in progress; stops watchdog interference

let lastVideoTime = -1;
let lastHands = [];
let lastHandCount = -1;

let pendingDetect = false;
let requestOut = false;
let requestSentAt = 0;

function setStatus(stateClass, message) {
  statusEl.className = "status " + stateClass;
  statusText.textContent = message;
}

const CAMERA_STAGES = [
  CAMERA_CONSTRAINTS,
  { video: { width: { ideal: 640 }, frameRate: { ideal: 30 }, facingMode: "user" }, audio: false },
  { video: true, audio: false },
];

async function startCamera() {
  let lastError;
  for (const constraints of CAMERA_STAGES) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastError = err;
      console.warn("getUserMedia failed, trying next stage:", constraints, err);
    }
  }
  throw lastError || new Error("Unable to access camera");
}

function updateHandPill(count) {
  if (engineSwitching) return; // keep the "Switching…" status visible
  if (count === lastHandCount) return;
  lastHandCount = count;
  statusText.textContent = count ? `Live · ${count} ${count === 1 ? "hand" : "hands"}` : "Live";
}

async function requestDetect() {
  pendingDetect = true;
  try {
    let bitmap;
    try {
      bitmap = await createImageBitmap(video, 0, 0, video.videoWidth, video.videoHeight);
    } catch {
      return; // frame not usable (Firefox quirk); retried on the next tick
    }

    if (!running) return;

    requestOut = true;
    requestSentAt = performance.now();

    let hands;
    try {
      hands = await service.detect(bitmap, performance.now());
    } catch (err) {
      requestOut = false;
      if (!running) return;
      console.error("Detect failed:", err);
      manageFailure();
      return;
    }

    requestOut = false;
    if (!running) return;
    lastHands = Array.isArray(hands) ? hands : [];
    updateHandPill(lastHands.length);
    hitZones.update(extractTips(lastHands), performance.now());
  } finally {
    pendingDetect = false;
  }
}

function manageFailure() {
  if (restarting || degraded) return;
  requestOut = false;

  if (restartCount >= MAX_TRACKER_RESTARTS) {
    degraded = true;
    lastHands = [];
    setStatus("", "Live (camera only)");
    return;
  }

  restartCount++;
  restarting = true;
  setStatus("busy", "Restarting tracker…");

  service
    .restart()
    .then(() => {
      setStatus("ready", "Live");
    })
    .catch((err) => {
      console.error("Tracker restart failed:", err);
      degraded = true;
      lastHands = [];
      setStatus("", "Live (camera only)");
    })
    .finally(() => {
      restarting = false;
    });
}

function onVideoReady() {
  renderer.setDimensions(video.videoWidth, video.videoHeight);
  running = true;
  setStatus("ready", "Live");
  startBtn.disabled = false;
  startBtn.textContent = "Stop Camera";
  startBtn.classList.add("btn--stop");
  requestAnimationFrame(loop);
}

function loop(now) {
  // Schedule next frame FIRST so an exception can never kill the loop.
  requestAnimationFrame(loop);
  if (!running) return;

  try {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      renderer.drawVideo(video);

      if (!degraded && !pendingDetect) {
        requestDetect();
      }

      renderer.drawZones(hitZones.zones, now);
      renderer.drawHands(lastHands);
    }

    if (requestOut && !restarting && !engineSwitching && now - requestSentAt > DETECT_TIMEOUT_MS) {
      manageFailure();
    }
  } catch (err) {
    console.error("Render loop error:", err);
  }
}

function stop() {
  running = false;
  degraded = false;
  restarting = false;
  restartCount = 0;
  lastVideoTime = -1;
  lastHands = [];
  lastHandCount = -1;
  pendingDetect = false;
  requestOut = false;

  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  renderer.clear();
  setStatus("", "Stopped");
  startBtn.disabled = false;
  startBtn.textContent = "Start Camera";
  startBtn.classList.remove("btn--stop");
}

async function start() {
  startBtn.disabled = true;

  try {
    setStatus("busy", "Loading hand-tracking model…");
    await service.init();
    audio.unlock(); // Start click is the user gesture that unlocks AudioContext

    setStatus("busy", "Requesting camera…");
    const stream = await startCamera();

    video.srcObject = stream;
    video.onloadeddata = onVideoReady;
    await video.play().catch((err) => console.warn("Auto-play blocked:", err));
  } catch (err) {
    console.error(err);
    setStatus("error", err.message || "Startup failed");
    startBtn.disabled = false;
  }
}

startBtn.addEventListener("click", () => {
  if (running) {
    stop();
  } else {
    start();
  }
});

// Volume slider: restore the persisted value, drive the master gain live.
volumeEl.value = localStorage.getItem("kinechord.volume") ?? String(DEFAULT_VOLUME);
audio.setVolume(Number(volumeEl.value));
volumeEl.addEventListener("input", () => {
  audio.setVolume(Number(volumeEl.value));
  localStorage.setItem("kinechord.volume", volumeEl.value);
});

function renderEngineControls() {
  engineCpu.classList.toggle("seg-btn--active", service.delegate === "CPU");
  engineGpu.classList.toggle("seg-btn--active", service.delegate === "GPU");
  engineCpu.disabled = engineSwitching;
  engineGpu.disabled = engineSwitching;
}

// Live CPU/GPU switch: rebuilds the landmarker inside the alive worker.
async function applyDelegate(delegate) {
  if (engineSwitching || delegate === service.delegate) return;
  engineSwitching = true;
  renderEngineControls();

  try {
    if (running) {
      setStatus("busy", "Switching compute engine…");
      try {
        if (service.ready) {
          await service.reconfigure(delegate);
        } else {
          // Degraded/camera-only: rebuild a fresh worker with the new engine.
          restarting = true;
          try {
            await service.restart();
          } finally {
            restarting = false;
          }
        }
        setStatus("ready", "Live");
      } catch (err) {
        console.error("Engine switch failed:", err);
        setStatus("error", err.message || "Engine switch failed");
      }
    }
  } finally {
    engineSwitching = false;
    renderEngineControls();
  }
  localStorage.setItem("kinechord.delegate", service.delegate);
}

const savedDelegate = localStorage.getItem("kinechord.delegate");
if (savedDelegate === "CPU" || savedDelegate === "GPU") {
  service.delegate = savedDelegate;
}
renderEngineControls();
engineCpu.addEventListener("click", () => applyDelegate("CPU"));
engineGpu.addEventListener("click", () => applyDelegate("GPU"));