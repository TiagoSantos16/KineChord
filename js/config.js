// Single source of truth for camera, tracking and tuning constants.

export const CAMERA_CONSTRAINTS = Object.freeze({
  video: {
    width: { ideal: 480 },
    height: { ideal: 360 },
    frameRate: { ideal: 30 },
    facingMode: "user",
  },
  audio: false,
});

// Classic UMD bundle: tasks-vision must boot its WASM via importScripts() in the worker.
export const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";

export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

export const WASM_DIR = `${VISION_CDN}/wasm`; // same version as VISION_CDN

export const DELEGATE = "GPU"; // GPU can hang some Windows drivers; use "CPU" if the tab freezes

export const DETECT_TIMEOUT_MS = 1500;
export const MAX_TRACKER_RESTARTS = 1;

// Upper bound for a live engine switch; fail rather than spin after a hung recompile.
export const RECONFIGURE_TIMEOUT_MS = 6000;

export const TIP_INDEX = 8; // index fingertip landmark

// Canonic 21-pair map; the CDN bundle's HAND_CONNECTIONS element shape varies by build.
export const HAND_CONNECTIONS = Object.freeze([
  [0, 1], [1, 2], [2, 3], [3, 4],   // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],   // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17],                             // palm base
]);

// Ellipse pads in display space (0..1); parts beyond the frame are clipped by the canvas.
export const HIT_ZONES = Object.freeze([
  { id: "kick",  voice: "kick",  cx: 0,    cy: 1,    rx: 0.25, ry: 0.25 },
  { id: "snare", voice: "snare", cx: 0,    cy: 0.5,  rx: 0.16, ry: 0.2  },
  { id: "hat",   voice: "hat",   cx: 1,    cy: 0.5,  rx: 0.16, ry: 0.2  },
  { id: "ride",  voice: "ride",  cx: 1,    cy: 1,    rx: 0.25, ry: 0.25 },
]);

// Re-arm only after the tip exits the ellipse grown by this margin (clean fast rolls).
export const ZONE_HYSTERESIS = 0.03;

export const HIT_ZONE_COLORS = Object.freeze({
  fill: "rgba(34,211,238,0.10)",
  border: "rgba(34,211,238,0.65)",
  flash: "rgba(255,255,255,0.85)",
});

export const FLASH_FADE_MS = 140;

// Synthesized voices: gain = envelope peak, decay = tail in seconds.
export const DRUM_VOICES = Object.freeze({
  kick: { kind: "kick", gain: 1.0, freq: 120, freqEnd: 45, decay: 0.28 },
  snare: { kind: "snare", gain: 0.7, freq: 190, decay: 0.18, noiseHP: 1700 },
  hat: { kind: "hat", gain: 0.5, decay: 0.06, noiseHP: 6200 },
  ride: { kind: "ride", gain: 0.45, decay: 0.14, noiseHP: 4600 },
});

export const HIT_GAIN = 1.0; // global pre-master strike gain

export const DEFAULT_VOLUME = 0.8; // UI slider overrides/persists this

export const SKELETON_COLORS = Object.freeze({
  line: "rgba(34,211,238,0.8)",
  joint: "#ffffff",
  tip: "#4ade80", // index fingertip highlight
});