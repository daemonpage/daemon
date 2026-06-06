#!/usr/bin/env node
// ============================================================================
// daemon hatch — deterministic bookkeeping for the 50/50 loop.
//
// The user's own Claude (via the daemon skill) does ALL verbalization:
// proposing candidate questions, predicting answers per persona-particle,
// minting claims. This script does the math that must be honest and
// reproducible: particle weights, EIG selection, sealed commits (hash
// BEFORE the user answers), surprisal, axis derivation, drift timeline.
//
// No network. No dependencies. Plain files in ~/.daemon (or $DAEMON_HOME).
//
// The algorithm is sequential Bayesian Experimental Design (BED-LLM,
// arXiv:2508.21184; OPEN, arXiv:2403.05534): persona posterior = weighted
// particles; pick the question maximizing Expected Information Gain
//   EIG(q) = H[ marginal answer dist ] - E_particles[ H[ per-particle dist ] ]
// A perfect 50/50 split = 1 bit = the optimum the daemon hunts for.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const ROOT = process.env.DAEMON_HOME || path.join(os.homedir(), ".daemon");
const HATCH_DIR = path.join(ROOT, "hatch");
const STATE_FILE = path.join(HATCH_DIR, "state.json");
const COMMITS_FILE = path.join(HATCH_DIR, "commits.jsonl"); // append-only, sealed pre-answer
const CLAIMS_DIR = path.join(ROOT, "claims");
const CLAIMS_FILE = path.join(CLAIMS_DIR, "claims.jsonl");

const AXES = [
  { key: "H", name: "Honesty-Humility", low: "status-seeking, willing to bend things", high: "sincere, modest, fair" },
  { key: "E", name: "Emotionality", low: "tough, detached, self-contained", high: "sensitive, sentimental, needs closeness" },
  { key: "X", name: "eXtraversion", low: "reserved, recharges alone", high: "outgoing, energized by people" },
  { key: "A", name: "Agreeableness", low: "critical, combative, holds the line", high: "gentle, forgiving, accommodating" },
  { key: "C", name: "Conscientiousness", low: "spontaneous, improvises, many open loops", high: "organized, disciplined, finishes" },
  { key: "O", name: "Openness", low: "practical, concrete, conventional", high: "curious, imaginative, ideas-driven" },
  { key: "V", name: "Self-Transcendence vs Self-Enhancement", low: "achievement, power, winning for me", high: "others, meaning, giving power away" },
];
const AXIS_KEYS = AXES.map((a) => a.key);
const EPS = 1e-6;

// ── io helpers ──
const ensure = () => { for (const d of [ROOT, HATCH_DIR, CLAIMS_DIR]) fs.mkdirSync(d, { recursive: true }); };
const readJSON = (f, fb) => { try { return JSON.parse(fs.readFileSync(f, "utf-8")); } catch { return fb; } };
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
const fail = (msg) => { out({ error: msg }); process.exit(1); };
const readStdin = () => { try { return fs.readFileSync(0, "utf-8"); } catch { return ""; } };
const stdinJSON = () => { const raw = readStdin().trim(); if (!raw) fail("expected JSON on stdin"); try { return JSON.parse(raw); } catch (e) { fail("bad JSON on stdin: " + e.message); } };

function emptyState() {
  return { particles: [], history: [], asked: [], pending: null, axesTimeline: [], createdAt: new Date().toISOString() };
}
const loadState = () => readJSON(STATE_FILE, emptyState());
function saveState(s) { ensure(); s.updatedAt = new Date().toISOString(); fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

// ── math ──
const clampAx = (x) => Math.max(-1, Math.min(1, Number.isFinite(+x) ? +x : 0));
const log2 = (x) => Math.log(x) / Math.LN2;
const entropy = (ps) => ps.reduce((h, p) => (p > EPS ? h - p * log2(p) : h), 0);

function normalizeDist(dist, options) {
  // dist: {optionText: prob} possibly partial / unnormalized → aligned array
  const vals = options.map((o) => Math.max(0, Number(dist?.[o]) || 0) + EPS);
  const sum = vals.reduce((a, b) => a + b, 0);
  return vals.map((v) => v / sum);
}

function deriveAxes(particles) {
  const res = {};
  const wsum = particles.reduce((a, p) => a + p.weight, 0) || 1;
  for (const k of AXIS_KEYS) {
    const mean = particles.reduce((a, p) => a + p.weight * clampAx(p.axes[k]), 0) / wsum;
    const varr = particles.reduce((a, p) => a + p.weight * (clampAx(p.axes[k]) - mean) ** 2, 0) / wsum;
    const std = Math.sqrt(varr);
    // std over particles spread across [-1,1] starts ~0.6 (conf low) and
    // shrinks as the posterior converges (conf high). Floor keeps it honest.
    res[k] = { value: +mean.toFixed(3), confidence: +Math.max(0.05, Math.min(0.95, 1 - std / 0.7)).toFixed(3) };
  }
  return res;
}

const ess = (particles) => { const s2 = particles.reduce((a, p) => a + p.weight * p.weight, 0); return s2 > 0 ? 1 / s2 : 0; };

function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

function systematicResample(particles) {
  const K = particles.length;
  const cum = []; let acc = 0;
  for (const p of particles) { acc += p.weight; cum.push(acc); }
  const picks = []; const u0 = Math.random() / K;
  for (let i = 0, j = 0; i < K; i++) { const u = u0 + i / K; while (cum[j] < u && j < K - 1) j++; picks.push(particles[j]); }
  return picks.map((p) => ({
    sketch: p.sketch,
    axes: Object.fromEntries(AXIS_KEYS.map((k) => [k, clampAx(clampAx(p.axes[k]) + gauss() * 0.04)])),
    weight: 1 / K,
  }));
}

function validParticles(arr) {
  if (!Array.isArray(arr) || arr.length < 6 || arr.length > 24) fail("need 6-24 particles");
  return arr.map((p) => ({
    sketch: String(p.sketch || "").slice(0, 300) || fail("each particle needs a sketch"),
    axes: Object.fromEntries(AXIS_KEYS.map((k) => [k, clampAx(p.axes?.[k] ?? 0)])),
    weight: 0, // set uniform by caller
  }));
}

// ── commands ──
const cmds = {
  // status → everything Claude needs to decide the next move
  status() {
    const s = loadState();
    const axes = s.particles.length ? deriveAxes(s.particles) : null;
    out({
      home: ROOT,
      seeded: s.particles.length > 0,
      particleCount: s.particles.length,
      ess: s.particles.length ? +ess(s.particles).toFixed(2) : 0,
      answered: s.history.filter((h) => h.type === "qa").length,
      warmups: s.history.filter((h) => h.type === "warmup").length,
      pendingQuestion: s.pending ? { question: s.pending.question, options: s.pending.options, commitHash: s.pending.hash } : null,
      axes: axes && Object.fromEntries(AXES.map((a) => [a.key, { name: a.name, low: a.low, high: a.high, ...axes[a.key] }])),
      probeNext: axes ? AXIS_KEYS.sort((x, y) => axes[x].confidence - axes[y].confidence).slice(0, 3) : AXIS_KEYS.slice(0, 3),
      topParticles: [...s.particles].sort((a, b) => b.weight - a.weight).slice(0, 3).map((p) => ({ sketch: p.sketch, weight: +p.weight.toFixed(3) })),
      askedQuestions: s.asked.slice(-14),
      claims: fs.existsSync(CLAIMS_FILE) ? fs.readFileSync(CLAIMS_FILE, "utf-8").trim().split("\n").filter(Boolean).length : 0,
    });
  },

  // seed ← stdin {warmup:[{q,answer}], particles:[{sketch,axes:{H..V}}]}
  seed() {
    const inp = stdinJSON();
    const s = loadState();
    if (s.particles.length) fail("already seeded — use 'particles' to replace the population");
    const ps = validParticles(inp.particles);
    ps.forEach((p) => (p.weight = 1 / ps.length));
    s.particles = ps;
    for (const w of inp.warmup || []) s.history.push({ type: "warmup", q: String(w.q), answer: String(w.answer), ts: new Date().toISOString() });
    s.axesTimeline.push({ ts: new Date().toISOString(), n: 0, axes: deriveAxes(ps) });
    saveState(s);
    out({ ok: true, particleCount: ps.length, axes: deriveAxes(ps) });
  },

  // select ← stdin {candidates:[{id,question,options[],axis?,field?}],
  //                 passes:[ {candId: [perParticleDist x K]} , optional 2nd pass ]}
  // Computes EIG per candidate, picks max, SEALS the commit before the user answers.
  select() {
    const inp = stdinJSON();
    const s = loadState();
    if (!s.particles.length) fail("not seeded — run seed first");
    if (s.pending) fail("a question is already pending — call answer (or abandon) first");
    const K = s.particles.length;
    const cands = inp.candidates || [];
    const passes = inp.passes || [];
    if (!cands.length || !passes.length) fail("need candidates + at least one prediction pass");
    const scored = [];
    for (const c of cands) {
      if (!c.id || !c.question || !Array.isArray(c.options) || c.options.length < 2) continue;
      if (s.asked.includes(c.question)) continue;
      const per = []; // averaged per-particle dists, aligned to options
      let ok = true;
      for (let i = 0; i < K; i++) {
        const ds = passes.map((p) => p?.[c.id]?.[i]).filter(Boolean);
        if (!ds.length) { ok = false; break; }
        const norms = ds.map((d) => normalizeDist(d, c.options));
        per.push(c.options.map((_, oi) => norms.reduce((a, n) => a + n[oi], 0) / norms.length));
      }
      if (!ok) continue;
      const marginal = c.options.map((_, oi) => per.reduce((a, d, pi) => a + s.particles[pi].weight * d[oi], 0));
      const hMarg = entropy(marginal);
      const hCond = per.reduce((a, d, pi) => a + s.particles[pi].weight * entropy(d), 0);
      scored.push({ c, per, marginal, eig: hMarg - hCond, hMarg, hCond });
    }
    if (!scored.length) fail("no scorable candidates (every candidate needs a per-particle dist for all K particles)");
    scored.sort((a, b) => b.eig - a.eig);
    const top = scored[0];
    const salt = crypto.randomBytes(8).toString("hex");
    const predictedIdx = top.marginal.indexOf(Math.max(...top.marginal));
    const sealed = {
      question: top.c.question, options: top.c.options,
      marginal: top.marginal.map((p) => +p.toFixed(4)), salt,
    };
    const hash = crypto.createHash("sha256").update(JSON.stringify(sealed)).digest("hex").slice(0, 16);
    const qid = "q" + (s.history.filter((h) => h.type === "qa").length + 1) + "-" + salt.slice(0, 4);
    s.pending = { qid, ...sealed, axis: AXIS_KEYS.includes(top.c.axis) ? top.c.axis : null, field: top.c.field || "", per: top.per, predictedIdx, eig: top.eig, hash, ts: new Date().toISOString() };
    fs.appendFileSync(COMMITS_FILE, JSON.stringify({ ts: s.pending.ts, qid, hash }) + "\n"); // sealed BEFORE the user sees the question
    s.asked.push(top.c.question);
    saveState(s);
    out({
      qid, question: top.c.question, options: top.c.options, commitHash: hash,
      eigBits: +top.eig.toFixed(3),
      allCandidates: scored.map(({ c, eig }) => ({ id: c.id, eig: +eig.toFixed(3) })),
      note: "Show the user the question, the options, and the commit hash. NEVER reveal the predicted answer before they answer.",
    });
  },

  // answer ← stdin {answer:"option text or 1-based index"}
  answer() {
    const inp = stdinJSON();
    const s = loadState();
    const p = s.pending;
    if (!p) fail("no pending question");
    const raw = String(inp.answer ?? "").trim();
    let idx = p.options.findIndex((o) => o.toLowerCase() === raw.toLowerCase());
    if (idx < 0 && /^\d+$/.test(raw)) idx = +raw - 1;
    if (idx < 0) idx = p.options.findIndex((o) => o.toLowerCase().startsWith(raw.toLowerCase().slice(0, 24)));
    if (idx < 0 || idx >= p.options.length) fail("answer didn't match an option; pass exact option text or its 1-based index");
    const prob = Math.max(EPS, p.marginal[idx]);
    const surprisal = -log2(prob);
    // Bayes: weight_i *= p_i(answer)
    s.particles.forEach((pt, i) => (pt.weight = pt.weight * Math.max(EPS, p.per[i][idx])));
    const wsum = s.particles.reduce((a, x) => a + x.weight, 0);
    s.particles.forEach((pt) => (pt.weight = pt.weight / wsum));
    let resampled = false;
    if (ess(s.particles) < s.particles.length / 2) { s.particles = systematicResample(s.particles); resampled = true; }
    const uniq = new Set(s.particles.map((x) => x.sketch)).size;
    const needRegen = uniq < s.particles.length * 0.6;
    const axes = deriveAxes(s.particles);
    const n = s.history.filter((h) => h.type === "qa").length + 1;
    s.history.push({ type: "qa", qid: p.qid, q: p.question, options: p.options, answer: p.options[idx], predicted: p.options[p.predictedIdx], marginal: p.marginal, salt: p.salt, hash: p.hash, axis: p.axis, field: p.field, surprisal: +surprisal.toFixed(3), ts: new Date().toISOString() });
    s.axesTimeline.push({ ts: new Date().toISOString(), n, axes });
    s.pending = null;
    saveState(s);
    out({
      reveal: {
        predicted: p.options[p.predictedIdx],
        confidence: +p.marginal[p.predictedIdx].toFixed(2),
        fullDist: Object.fromEntries(p.options.map((o, i) => [o, +p.marginal[i].toFixed(2)])),
        commitHash: p.hash, salt: p.salt,
        verify: "sha256({question,options,marginal,salt}) — anyone can recheck the guess was sealed first",
      },
      yourAnswer: p.options[idx],
      surprisalBits: +surprisal.toFixed(2),
      surprised: prob < 0.35,
      mintClaim: prob < 0.25, // strong surprise → Claude should mint a sourced claim
      resampled, needRegen,
      axes,
      answered: n,
    });
  },

  // abandon — drop the pending question (user skipped)
  abandon() {
    const s = loadState();
    if (!s.pending) fail("nothing pending");
    s.history.push({ type: "skipped", q: s.pending.question, ts: new Date().toISOString() });
    s.pending = null; saveState(s); out({ ok: true });
  },

  // particles ← stdin {particles:[...]} — replace population (after Claude's
  // sample-then-filter regen: generate candidates, keep only those consistent
  // with the FULL history). Weights reset uniform.
  particles() {
    const inp = stdinJSON();
    const s = loadState();
    const ps = validParticles(inp.particles);
    ps.forEach((p) => (p.weight = 1 / ps.length));
    s.particles = ps; saveState(s);
    out({ ok: true, particleCount: ps.length, axes: deriveAxes(ps) });
  },

  // claim ← stdin {text, source} — durable, sourced claim minted from surprise
  claim() {
    const inp = stdinJSON();
    if (!inp.text) fail("claim needs text");
    ensure();
    const rec = { ts: new Date().toISOString(), text: String(inp.text).slice(0, 600), source: String(inp.source || "").slice(0, 400) };
    fs.appendFileSync(CLAIMS_FILE, JSON.stringify(rec) + "\n");
    out({ ok: true, claim: rec });
  },

  history() { const s = loadState(); out({ history: s.history, asked: s.asked }); },

  // changes — how the person is drifting (Arthur: "you can monitor changes")
  changes() {
    const s = loadState();
    if (s.axesTimeline.length < 2) { out({ note: "not enough history yet", points: s.axesTimeline.length }); return; }
    const first = s.axesTimeline[0].axes, last = s.axesTimeline[s.axesTimeline.length - 1].axes;
    const recent = s.axesTimeline.slice(-5), prior = s.axesTimeline.slice(-10, -5);
    const avg = (arr, k) => (arr.length ? arr.reduce((a, t) => a + t.axes[k].value, 0) / arr.length : null);
    const axes = AXES.map((a) => {
      const drift = +(last[a.key].value - first[a.key].value).toFixed(3);
      const pa = avg(prior, a.key), ra = avg(recent, a.key);
      return { axis: a.key, name: a.name, now: last[a.key].value, confidence: last[a.key].confidence, totalDrift: drift, recentTrend: pa === null ? null : +(ra - pa).toFixed(3) };
    }).sort((x, y) => Math.abs(y.totalDrift) - Math.abs(x.totalDrift));
    const surprises = s.history.filter((h) => h.type === "qa" && h.surprisal > 1.5).map((h) => ({ q: h.q, expected: h.predicted, got: h.answer, bits: h.surprisal }));
    out({ points: s.axesTimeline.length, axes, biggestSurprises: surprises.slice(-5) });
  },

  // verify ← stdin {qid} — recompute a sealed commit from the revealed record
  verify() {
    const inp = stdinJSON();
    const s = loadState();
    const h = s.history.find((x) => x.qid === inp.qid);
    if (!h) fail("qid not found in history");
    const recomputed = crypto.createHash("sha256").update(JSON.stringify({ question: h.q, options: h.options, marginal: h.marginal, salt: h.salt })).digest("hex").slice(0, 16);
    const commits = fs.existsSync(COMMITS_FILE) ? fs.readFileSync(COMMITS_FILE, "utf-8").trim().split("\n").map((l) => JSON.parse(l)) : [];
    const sealed = commits.find((c) => c.qid === inp.qid);
    out({ qid: inp.qid, sealedAt: sealed?.ts, sealedHash: sealed?.hash, recomputedHash: recomputed, honest: sealed?.hash === recomputed && recomputed === h.hash });
  },

  axes() { out({ axes: AXES }); },
};

const cmd = process.argv[2];
if (!cmd || !cmds[cmd]) fail("usage: hatch.mjs <status|seed|select|answer|abandon|particles|claim|history|changes|verify|axes>");
cmds[cmd]();
