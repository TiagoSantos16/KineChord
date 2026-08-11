// All canvas drawing. Video is mirror-drawn; landmarks/normalized coords flip X
// the same way. Defensive reads only: points may be {x, y} objects or [x, y]
// arrays and drawing must never throw (a throw equals a blank overlay).

import {
  TIP_INDEX,
  SKELETON_COLORS,
  HAND_CONNECTIONS,
  HIT_ZONE_COLORS,
  FLASH_FADE_MS,
} from "./config.js";

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.connections = HAND_CONNECTIONS;
    this.width = 0;
    this.height = 0;
  }

  setDimensions(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  drawVideo(video) {
    const { ctx, width: W, height: H } = this;
    if (!W || !H || !video.videoWidth) return;
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
  }

  drawHands(landmarks) {
    const { ctx, width: W, height: H, connections } = this;
    if (!W || !H || !Array.isArray(landmarks) || !landmarks.length) return;

    // Tolerates both {x, y} objects and [x, y] arrays from either bundle build.
    const pt = (p, i) => {
      const v = p && p[i];
      if (!v) return null;
      return Array.isArray(v) ? { x: v[0], y: v[1] } : { x: v.x, y: v.y };
    };
    const X = (v) => (1 - v.x) * W; // mirror-flip X to match the rotated video
    const Y = (v) => v.y * H;

    ctx.lineWidth = Math.max(1, W / 600);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const points of landmarks) {
      if (!Array.isArray(points) || points.length < 21) continue;

      ctx.strokeStyle = SKELETON_COLORS.line;
      ctx.beginPath();
      for (const pair of connections) {
        if (!Array.isArray(pair)) continue;
        const a = pt(points, pair[0]);
        const b = pt(points, pair[1]);
        if (!a || !b) continue;
        ctx.moveTo(X(a), Y(a));
        ctx.lineTo(X(b), Y(b));
      }
      ctx.stroke();

      ctx.fillStyle = SKELETON_COLORS.joint;
      for (let i = 0; i < points.length; i++) {
        const v = pt(points, i);
        if (!v) continue;
        ctx.beginPath();
        ctx.arc(X(v), Y(v), Math.max(2, W / 160), 0, Math.PI * 2);
        ctx.fill();
      }

      const tip = pt(points, TIP_INDEX);
      if (!tip) continue;
      ctx.fillStyle = SKELETON_COLORS.tip;
      ctx.beginPath();
      ctx.arc(X(tip), Y(tip), Math.max(4, W / 90), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Zones live in display space, so cx/cy map 1:1 to canvas pixels — the mirror
  // flip is NOT repeated here. Ellipses past the edge clip naturally.
  drawZones(zones, now) {
    const { ctx, width: W, height: H } = this;
    if (!W || !H || !Array.isArray(zones) || !zones.length) return;

    for (const z of zones) {
      const d = z.def;
      const cx = d.cx * W;
      const cy = d.cy * H;
      const rx = d.rx * W;
      const ry = d.ry * H;

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = HIT_ZONE_COLORS.fill;
      ctx.fill();
      ctx.strokeStyle = HIT_ZONE_COLORS.border;
      ctx.lineWidth = 2;
      ctx.stroke();

      const age = now - z.flashAt;
      if (age >= 0 && age < FLASH_FADE_MS) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 1 - age / FLASH_FADE_MS;
        ctx.fillStyle = HIT_ZONE_COLORS.flash;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  clear() {
    const { ctx, width: W, height: H } = this;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
  }
}