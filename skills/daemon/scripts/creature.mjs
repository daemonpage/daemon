#!/usr/bin/env node
// ============================================================================
// daemon creature — deterministic form from the current axis estimates.
// The entity is a pure function of who the daemon currently believes you are:
// same axes → same creature. It re-settles as estimates update; while
// uncertainty is high it stays blurry and half-formed (that's honest).
// Reads ~/.daemon/hatch/state.json, writes ~/.daemon/creature/creature.svg.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const ROOT = process.env.DAEMON_HOME || path.join(os.homedir(), ".daemon");
const STATE_FILE = path.join(ROOT, "hatch", "state.json");
const OUT_DIR = path.join(ROOT, "creature");
const AXIS_KEYS = ["H", "E", "X", "A", "C", "O", "V"];
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function deriveAxes(particles) {
  const res = {}; const wsum = particles.reduce((a, p) => a + p.weight, 0) || 1;
  for (const k of AXIS_KEYS) {
    const mean = particles.reduce((a, p) => a + p.weight * (p.axes[k] || 0), 0) / wsum;
    const varr = particles.reduce((a, p) => a + p.weight * ((p.axes[k] || 0) - mean) ** 2, 0) / wsum;
    res[k] = { value: mean, confidence: Math.max(0.05, Math.min(0.95, 1 - Math.sqrt(varr) / 0.7)) };
  }
  return res;
}

// seeded PRNG so identical axes always render identical bodies
function mulberry32(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildSpec(axes) {
  const v = Object.fromEntries(AXIS_KEYS.map((k) => [k, axes[k].value]));
  const settle = AXIS_KEYS.reduce((m, k) => m + axes[k].confidence, 0) / AXIS_KEYS.length;
  // bouba/kiki: agreeable+honest+transcendent → rounder/warmer; combative/self-enhancing → angular/sharper
  const roundness = clamp01(0.5 + (v.A + v.H + v.V) / 6);
  const hue = Math.round(((v.O + 1) / 2) * 180 + ((v.V + 1) / 2) * 120) % 360;
  const sat = Math.round(40 + ((v.X + 1) / 2) * 50);
  const light = Math.round(38 + ((v.V + 1) / 2) * 22);
  return {
    roundness,
    size: clamp01(0.4 + (v.X + 1) / 4),
    ornamentation: clamp01((v.O + 1) / 2),
    color: { hue, sat, light },
    posture: v.X > 0 ? "open" : "coiled",
    texture: v.E > 0 ? "downy" : "armored",
    settle: +settle.toFixed(3),
  };
}

function render(spec, axes) {
  const W = 480, H = 480, cx = W / 2, cy = H / 2 + 20;
  const seed = parseInt(crypto.createHash("sha256").update(AXIS_KEYS.map((k) => axes[k].value.toFixed(2)).join(",")).digest("hex").slice(0, 8), 16);
  const rnd = mulberry32(seed);
  const R = 90 + spec.size * 70;
  const jag = (1 - spec.roundness) * 0.35; // radius wobble = angularity
  const N = 14;
  const pts = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const r = R * (1 + (rnd() - 0.5) * 2 * jag) * (1 + 0.08 * Math.sin(a * 2)); // slightly egg-shaped
    pts.push([cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r]);
  }
  // smooth closed path through midpoints (quadratic)
  let d = "";
  for (let i = 0; i < N; i++) {
    const p = pts[i], q = pts[(i + 1) % N];
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    d += i === 0 ? `M ${mx} ${my} ` : "";
    const r2 = pts[(i + 1) % N], s = pts[(i + 2) % N];
    d += `Q ${q[0]} ${q[1]} ${(r2[0] + s[0]) / 2} ${(r2[1] + s[1]) / 2} `;
  }
  d += "Z";
  const { hue, sat, light } = spec.color;
  const body = `hsl(${hue} ${sat}% ${light}%)`, glow = `hsl(${hue} ${sat}% ${Math.min(85, light + 25)}%)`, dark = `hsl(${hue} ${Math.max(20, sat - 20)}% ${Math.max(12, light - 22)}%)`;
  const tilt = spec.posture === "open" ? -4 : 7;
  const blur = (1 - spec.settle) * 4.5;

  let texture = "";
  if (spec.texture === "downy") {
    for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, rr = R * (0.95 + rnd() * 0.18); texture += `<circle cx="${cx + Math.cos(a) * rr * 0.9}" cy="${cy + Math.sin(a) * rr}" r="${2 + rnd() * 3}" fill="${glow}" opacity="0.5"/>`; }
  } else {
    for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.85 + (i / 9) * Math.PI * 0.7, rr = R * 1.0; const x = cx + Math.cos(a) * rr * 0.9, y = cy + Math.sin(a) * rr; texture += `<path d="M ${x - 7} ${y + 4} L ${x} ${y - 16 - rnd() * 8} L ${x + 7} ${y + 4} Z" fill="${dark}" opacity="0.85"/>`; }
  }
  let orn = "";
  const nOrn = Math.round(spec.ornamentation * 7);
  for (let i = 0; i < nOrn; i++) { const a = rnd() * Math.PI * 2, rr = R * (0.25 + rnd() * 0.5); orn += `<circle cx="${cx + Math.cos(a) * rr * 0.8}" cy="${cy + Math.sin(a) * rr * 0.8}" r="${3 + rnd() * 5}" fill="${glow}" opacity="${0.35 + rnd() * 0.4}"/>`; }
  const eyeY = cy - R * 0.25, eyeDX = R * 0.32, eyeR = 7 + spec.size * 5;
  const pupil = spec.posture === "open" ? 0 : 2; // coiled looks sideways
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="65%"><stop offset="0%" stop-color="#16161e"/><stop offset="100%" stop-color="#0a0a0f"/></radialGradient>
    <radialGradient id="bodyg" cx="42%" cy="35%" r="80%"><stop offset="0%" stop-color="${glow}"/><stop offset="70%" stop-color="${body}"/><stop offset="100%" stop-color="${dark}"/></radialGradient>
    <filter id="settle"><feGaussianBlur stdDeviation="${blur.toFixed(2)}"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="${cx}" cy="${cy + R + 18}" rx="${R * 0.8}" ry="${R * 0.14}" fill="#000" opacity="0.45"/>
  <g transform="rotate(${tilt} ${cx} ${cy})" filter="filter: none">
    <g filter="${blur > 0.4 ? "url(#settle)" : "none"}">
      <path d="${d}" fill="url(#bodyg)"/>
      ${texture}${orn}
      <circle cx="${cx - eyeDX}" cy="${eyeY}" r="${eyeR}" fill="#f5f2ea"/>
      <circle cx="${cx + eyeDX}" cy="${eyeY}" r="${eyeR}" fill="#f5f2ea"/>
      <circle cx="${cx - eyeDX + pupil}" cy="${eyeY}" r="${eyeR * 0.45}" fill="#101014"/>
      <circle cx="${cx + eyeDX + pupil}" cy="${eyeY}" r="${eyeR * 0.45}" fill="#101014"/>
    </g>
  </g>
  <text x="${cx}" y="${H - 18}" text-anchor="middle" font-family="monospace" font-size="12" fill="#6a6a78">settle ${(spec.settle * 100).toFixed(0)}%</text>
</svg>`;
}

const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
if (!state.particles?.length) { process.stdout.write(JSON.stringify({ error: "not hatched yet — no particles" }) + "\n"); process.exit(1); }
const axes = deriveAxes(state.particles);
const spec = buildSpec(axes);
fs.mkdirSync(OUT_DIR, { recursive: true });
const file = path.join(OUT_DIR, "creature.svg");
fs.writeFileSync(file, render(spec, axes));
// keep a small history of forms so change is visible over time
fs.copyFileSync(file, path.join(OUT_DIR, `creature-${new Date().toISOString().slice(0, 10)}.svg`));
process.stdout.write(JSON.stringify({ ok: true, file, spec }, null, 2) + "\n");
