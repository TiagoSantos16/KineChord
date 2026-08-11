// Window into the tracker worker; survives Stop/Start so the model loads once.

import { VISION_CDN, MODEL_URL, WASM_DIR, DELEGATE, RECONFIGURE_TIMEOUT_MS } from "./config.js";

export class DetectionService {
  constructor() {
    this.worker = null;
    this.ready = false;
    this.readyPromise = null;
    this.delegate = DELEGATE;
    this.onError = null; // app hooks here for the watchdog

    this.seq = 0;
    this.pending = new Map();
    this._initResolve = null;
    this._initReject = null;
    this._switchTimer = null;
  }

  init() {
    if (this.ready) return Promise.resolve();
    if (this.readyPromise) return this.readyPromise;

    this.readyPromise = new Promise((resolve, reject) => {
      this.worker = new Worker(new URL("tracker.worker.js", import.meta.url));
      this.worker.onmessage = (event) => this._onMessage(event.data || {});
      this.worker.onerror = (event) => {
        this._failAll(new Error(event.message || "Tracker worker crashed"));
        if (this.onError) this.onError();
      };

      this._initResolve = resolve;
      this._initReject = reject;
      this.worker.postMessage({
        type: "init",
        visionBundleUrl: `${VISION_CDN}/vision_bundle.js`,
        wasmDir: WASM_DIR,
        modelAssetPath: MODEL_URL,
        delegate: this.delegate,
      });
    });
    return this.readyPromise;
  }

  detect(image, timestamp) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: "detect", id, image, timestamp }, [image]);
    });
  }

  // Recycle a wedged worker: terminate, discard state, start fresh.
  async restart() {
    const old = this.worker;
    this.ready = false;
    this.readyPromise = null;
    this._rejectAll(new Error("Tracker restarting"));
    this._clearInitHandlers();
    if (old) {
      old.onmessage = null;
      old.onerror = null;
      old.terminate();
    }
    await this.init();
  }

  // Live engine switch: rebuilds the landmarker in the alive worker (no
  // re-download). If not started yet, the value applies on the next init().
  reconfigure(delegate) {
    this.delegate = delegate;
    if (!this.worker || !this.ready) return Promise.resolve();

    this.ready = false;
    return new Promise((resolve, reject) => {
      this._initResolve = resolve;
      this._initReject = reject;
      this._switchTimer = setTimeout(() => {
        if (this._initReject) {
          this._initReject(new Error("Engine switch timed out"));
          this._clearInitHandlers();
        }
      }, RECONFIGURE_TIMEOUT_MS);
      this.worker.postMessage({ type: "reinit", delegate });
    });
  }

  _onMessage(msg) {
    switch (msg.type) {
      case "ready":
        this.ready = true;
        if (this._initResolve) {
          this._initResolve();
          this._clearInitHandlers();
        }
        break;

      case "hands": {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          p.resolve(Array.isArray(msg.hands) ? msg.hands : []);
        }
        break;
      }

      case "error": {
        const err = new Error(msg.message || "Tracker error");
        const p = msg.id != null ? this.pending.get(msg.id) : null;
        if (p) {
          this.pending.delete(msg.id);
          p.reject(err);
        } else if (this._initReject) {
          this._initReject(err);
          this._clearInitHandlers();
        } else if (this.onError) {
          this.onError(err);
        }
        break;
      }
    }
  }

  _failAll(err) {
    this.ready = false;
    this.readyPromise = null;
    this._rejectAll(err);
    if (this._initReject) {
      this._initReject(err);
      this._clearInitHandlers();
    }
  }

  _rejectAll(err) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  _clearInitHandlers() {
    if (this._switchTimer) {
      clearTimeout(this._switchTimer);
      this._switchTimer = null;
    }
    this._initResolve = null;
    this._initReject = null;
  }
}