# KineChord

An air drum kit that runs in your browser. Your webcam feed is turned into a
musical instrument: MediaPipe hand tracking draws your hand's 21-point skeleton
on a mirrored live preview, and reaching into the drums on screen plays a
synthesized percussion hit.

No frameworks, no build step, no install — plain static files that open in any
modern browser.

## Try it

Play the live demo: <https://tiagosantos16.github.io/KineChord/>

Press **Start Camera**, allow webcam access, then strike the pads with your
index fingertips.

## What it does

- Mirrored live feed with a hand skeleton (21 landmarks per hand, up to 2 hands).
- Four ellipse drum pads peeking out of the frame — kick / snare / hat / ride.
- Each strike is edge-triggered with hysteresis: fire on entry, re-arm on exit,
  no double-trigger while holding — clean rolls.
- Synthesized percussion voices (kick pitch-drop, noise + body snare, filtered
  hat/ride), driven by a volume slider.
- Live GPU/CPU engine switch — camera and model keep running, no restart.

## How it's built

- **Worker-isolated inference.** MediaPipe runs on a classic worker
  (`importScripts`), so detection never blocks the UI. The model is downloaded
  once and survives Stop/Start.
- **Continuous detect loop.** At most one frame is in flight; the next ships the
  moment a result arrives. A bounded watchdog recycles a silent worker, then the
  app degrades to a live camera-only view instead of dying.
- **Edge-triggered strikes.** Pads fire once on entry and re-arm after leaving an
  enlarged ellipse, so fast two-hand rolls stay clean and jitter-free.
- **Config-driven.** Any tunable — camera, model URLs, thresholds, pad layout,
  drum voices — lives in `js/config.js`.
- **No build tools.** ES modules + static assets, deployable as-is to GitHub
  Pages.

Hand tracking uses [MediaPipe tasks-vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
for the landmark model; everything around it (orchestration, hit logic, audio)
is built from scratch on top of the raw keypoints.

## Status

First version — a working core, still being improved:

- **Visuals** — pad styling and hit feedback will get a polish pass.
- **Instruments & sounds** — more instruments (and sampled sounds) are planned.
- **Faster detection** — on-landmark AI work is coming: geometric gesture logic
  (finger flexion / pinch computed from the raw keypoints) and One-Euro
  filtering to smooth tracking jitter.

## Run locally

ES modules require HTTP (not `file://`). From the repo root:

```
python -m http.server 8000
```

Then open <http://localhost:8000> and press **Start Camera**. The hand-tracking
model (~7 MB) downloads from Google's CDN on first start.

## Project structure

```
index.html             Markup only
css/styles.css         All styling
js/
  config.js            Tuning constants — single source of truth
  app.js               Orchestration: start/stop, camera, render loop, status
  renderer.js          Canvas drawing: mirrored video, hand skeleton, zones
  detector.js          DetectionService — worker-backed inference facade
  tracker.worker.js    MediaPipe HandLandmarker on a classic worker (importScripts)
  hitzones.js          Ellipse pads + edge-triggered (hysteresis) strikes
  audio.js             WebAudio percussion voices
```