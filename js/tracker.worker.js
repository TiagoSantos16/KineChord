// Classic worker: MediaPipe boots its WASM via importScripts() (module workers
// cannot use it), so the UMD bundle loads once and engine switches (reinit) just
// rebuild the landmarker with a new delegate while WASM + model stay in memory.

let landmarker = null;
let lastInit = null;

function ready() {
  self.postMessage({ type: "ready" });
}

async function buildLandmarker(payload) {
  const vision = globalThis.Vision;
  landmarker = await vision.HandLandmarker.createFromOptions(
    await vision.FilesetResolver.forVisionTasks(payload.wasmDir),
    {
      baseOptions: { modelAssetPath: payload.modelAssetPath, delegate: payload.delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.5,
    }
  );
}

async function init(payload) {
  lastInit = payload;
  importScripts(payload.visionBundleUrl); // synchronous; blocks until the bundle is ready

  const vision = globalThis.Vision;
  if (!vision) throw new Error("Vision globals missing after importScripts");

  await buildLandmarker(payload);
  ready();
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.type === "init") {
      await init(msg);
    } else if (msg.type === "reinit" && lastInit) {
      await buildLandmarker({ ...lastInit, delegate: msg.delegate });
      ready();
    } else if (msg.type === "detect" && landmarker && msg.image) {
      const results = landmarker.detectForVideo(msg.image, msg.timestamp);
      const hands = Array.isArray(results && results.landmarks) ? results.landmarks : [];
      self.postMessage({ type: "hands", id: msg.id, hands });
      msg.image.close();
    }
  } catch (err) {
    self.postMessage({ type: "error", id: msg.id, message: err.message || String(err) });
    if (msg.type === "detect" && msg.image) msg.image.close();
  }
};