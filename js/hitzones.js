// Edge-triggered ellipse pads: fire on entry, re-arm only after the tip exits
// the ellipse grown by ZONE_HYSTERESIS (clean rolls, no edge-jitter retriggers).

import { TIP_INDEX, ZONE_HYSTERESIS } from "./config.js";

const pts = (hand) => {
  const v = hand && hand[TIP_INDEX];
  if (!v) return null;
  const x = Array.isArray(v) ? v[0] : v.x;
  const y = Array.isArray(v) ? v[1] : v.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x: 1 - x, y }; // flip X: camera space → mirrored display space
};

export function extractTips(landmarks) {
  const tips = [];
  for (const hand of landmarks || []) {
    const p = pts(hand);
    if (p) tips.push(p);
  }
  return tips;
}

export class HitZones {
  constructor(defs) {
    this.zones = defs.map((def) => ({ def, held: false, flashAt: 0 }));
    this.onStrike = null;
  }

  update(tips, now) {
    for (const z of this.zones) {
      if (!z.held) {
        if (tips.some((p) => this._in(z.def, p, 0))) {
          z.held = true;
          z.flashAt = now;
          if (this.onStrike) this.onStrike(z.def);
        }
      } else if (!tips.some((p) => this._in(z.def, p, ZONE_HYSTERESIS))) {
        z.held = false;
      }
    }
  }

  _in(def, p, margin) {
    const rx = def.rx + margin;
    const ry = def.ry + margin;
    if (!rx || !ry) return false;
    const dx = (p.x - def.cx) / rx;
    const dy = (p.y - def.cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
}