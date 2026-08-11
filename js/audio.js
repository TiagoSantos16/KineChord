// Web Audio percussion: each voice is synthesized from DRUM_VOICES and routed
// through a master GainNode so the volume slider stays effective.

import { DRUM_VOICES, HIT_GAIN, DEFAULT_VOLUME } from "./config.js";

export class AudioFeedback {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = DEFAULT_VOLUME;
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noiseBuffer = this.makeNoise(0.35);
    }
    this.setVolume(this.volume);
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  play(voice) {
    if (!this.ctx) return;
    const spec = DRUM_VOICES[voice];
    if (!spec) return;

    const t = this.ctx.currentTime;
    const out = this.env(this.ctx.createGain(), t, spec.gain * HIT_GAIN, spec.decay);
    out.connect(this.master);

    if (spec.kind === "kick") {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(spec.freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.freqEnd), t + spec.decay);
      osc.connect(out);
      osc.start(t);
      osc.stop(t + spec.decay + 0.02);
    } else if (spec.kind === "snare") {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = spec.noiseHP;
      bp.Q.value = 0.8;
      noise.connect(bp).connect(out);
      noise.start(t);
      noise.stop(t + spec.decay + 0.02);

      const body = this.ctx.createOscillator();
      body.type = "triangle";
      body.frequency.value = spec.freq;
      const bodyGain = this.env(this.ctx.createGain(), t, 0.4 * spec.gain, 0.12);
      body.connect(bodyGain).connect(out);
      body.start(t);
      body.stop(t + 0.16);
    } else {
      // hat / ride: high-passed noise; ride adds a short metallic partial.
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const hp = this.ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = spec.noiseHP;
      noise.connect(hp).connect(out);
      noise.start(t);
      noise.stop(t + spec.decay + 0.02);

      if (spec.kind === "ride") {
        const partial = this.ctx.createOscillator();
        partial.type = "square";
        partial.frequency.value = 880;
        const pGain = this.env(this.ctx.createGain(), t, 0.15 * spec.gain, 0.2);
        partial.connect(pGain).connect(out);
        partial.start(t);
        partial.stop(t + 0.24);
      }
    }
  }

  makeNoise(seconds) {
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * seconds), this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // 2 ms attack, exponential decay to silence over `decay` seconds.
  env(node, t, peak, decay) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.003);
    node.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    return node;
  }
}