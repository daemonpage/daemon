#!/usr/bin/env node
// ============================================================================
// daemon vault — the database of a person, as plain files you own.
// ~/.daemon/vault/items/*.md  (one item per file, YAML-ish frontmatter)
// ~/.daemon/vault/index.jsonl (append-only index for fast search)
// Export = the folder itself. No lock-in by construction.
// ============================================================================
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = process.env.DAEMON_HOME || path.join(os.homedir(), ".daemon");
const VAULT = path.join(ROOT, "vault");
const ITEMS = path.join(VAULT, "items");
const INDEX = path.join(VAULT, "index.jsonl");
const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
const fail = (m) => { out({ error: m }); process.exit(1); };
const readStdin = () => { try { return fs.readFileSync(0, "utf-8"); } catch { return ""; } };

const ensure = () => fs.mkdirSync(ITEMS, { recursive: true });
const readIndex = () => (fs.existsSync(INDEX) ? fs.readFileSync(INDEX, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "item";
const tokens = (s) => String(s).toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((t) => t.length > 2);
const hashOf = (s) => crypto.createHash("sha256").update(s.replace(/\s+/g, " ").trim().toLowerCase()).digest("hex").slice(0, 12);

function getFlag(name) { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : undefined; }

// Shared write path. Returns {id,file} or null if a content-duplicate (by hash).
function addItem({ body, title, tags = [], source = "chat", ts, hash, existingHashes }) {
  ensure();
  const h = hash || hashOf(body);
  if (existingHashes && existingHashes.has(h)) return null;
  const stamp = ts || new Date().toISOString();
  const ttl = (title || body.slice(0, 60)).replace(/\s+/g, " ").trim();
  const id = stamp.slice(0, 10) + "-" + slug(ttl) + "-" + crypto.randomBytes(2).toString("hex");
  const file = path.join(ITEMS, id + ".md");
  fs.writeFileSync(file, `---\nid: ${id}\ntitle: ${ttl}\ndate: ${stamp}\nsource: ${source}\ntags: [${tags.join(", ")}]\n---\n\n${body}\n`);
  fs.appendFileSync(INDEX, JSON.stringify({ id, ts: stamp, title: ttl, tags, source, file, h, preview: body.replace(/\s+/g, " ").slice(0, 160) }) + "\n");
  if (existingHashes) existingHashes.add(h);
  return { id, file };
}

// Pull the user's first-person text out of one Claude Code transcript line.
function userTextFromLine(line) {
  let o; try { o = JSON.parse(line); } catch { return null; }
  if (o.type !== "user" || !o.message || o.message.role !== "user") return null;
  const c = o.message.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) text = c.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n");
  // strip Claude Code's injected attachment markers, keep the real words after them
  text = text.replace(/\[\d+\]\s*You sent an attachment\.?/gi, "").replace(/\[Image #\d+\]/gi, "").trim();
  // keep genuine first-person input; drop noise
  if (text.length < 80) return null;                         // too short to be identity signal
  if (text.startsWith("/")) return null;                     // slash command
  if (text.startsWith("<")) return null;                     // injected reminder / xml block
  if (/tool_use_id|tool_result|"type":\s*"tool/.test(text)) return null;
  if (/^Caveat: The messages below/.test(text)) return null;            // CC system preamble
  if (/^This session is being continued/.test(text)) return null;       // CC continuation summary
  if (/^Your task is to create a detailed summary/.test(text)) return null;
  if (/^You are (building|tasked|an? |the )/.test(text)) return null;    // skill/system prompt to Claude, not Arthur
  if (/Research question:|## (Source Extractor|Adversarial Claim|Synthesizer)/.test(text)) return null; // workflow leakage
  if (/^(Claude|Assistant):/.test(text)) return null;        // assistant-prefixed bleed
  return { text, ts: o.timestamp || undefined };
}

// Only the top-level session transcripts are the HUMAN talking. Nested
// subagent/workflow transcripts are agent scaffolding, not the user — skip them.
const SKIP_DIRS = new Set(["subagents", "workflows", "tasks", "shell-snapshots", "todos"]);
function walkJsonl(dir, acc = []) {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walkJsonl(p, acc); }
    else if (e.isFile() && e.name.endsWith(".jsonl")) acc.push(p);
  }
  return acc;
}

const cmds = {
  init() {
    ensure();
    fs.mkdirSync(path.join(ROOT, "hatch"), { recursive: true });
    fs.mkdirSync(path.join(ROOT, "claims"), { recursive: true });
    fs.mkdirSync(path.join(ROOT, "creature"), { recursive: true });
    const readme = path.join(ROOT, "README.md");
    if (!fs.existsSync(readme)) fs.writeFileSync(readme, [
      "# Your daemon lives here",
      "",
      "Everything in this folder is yours, in plain files:",
      "- `vault/items/` — what you've saved, one markdown file each",
      "- `claims/claims.jsonl` — what your daemon believes about you, each with its source",
      "- `hatch/state.json` — its current working model of you (particles + axes)",
      "- `hatch/commits.jsonl` — every guess it sealed BEFORE you answered (honesty log)",
      "- `creature/creature.svg` — its current form",
      "",
      "Export = copy this folder. Delete = delete this folder. That's the whole contract.",
    ].join("\n"));
    out({ ok: true, home: ROOT });
  },

  // add --title "..." --tags "a,b" --source "whatsapp|paste|..."  (body on stdin)
  add() {
    const body = readStdin().trim();
    if (!body) fail("item body expected on stdin");
    const r = addItem({
      body,
      title: getFlag("title"),
      tags: (getFlag("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
      source: getFlag("source") || "chat",
    });
    out({ ok: true, ...r });
  },

  // import-claude [--limit N] — the passive on-ramp. Reads the user's OWN
  // Claude Code history (~/.claude/projects/**/*.jsonl), pulls their first-person
  // messages into the vault, deduped + capped. Nothing leaves the machine.
  "import-claude"() {
    const dir = process.env.CLAUDE_HISTORY_DIR || path.join(os.homedir(), ".claude", "projects");
    if (!fs.existsSync(dir)) { out({ ok: false, reason: "no Claude Code history found", lookedIn: dir }); return; }
    const limit = Math.max(1, parseInt(getFlag("limit") || "300", 10));
    const existing = new Set(readIndex().map((e) => e.h).filter(Boolean));
    // gather candidate user messages across all transcripts
    const found = new Map(); // hash -> {text, ts}
    for (const file of walkJsonl(dir)) {
      let lines = []; try { lines = fs.readFileSync(file, "utf-8").split("\n"); } catch { continue; }
      for (const line of lines) {
        if (!line.trim()) continue;
        const u = userTextFromLine(line);
        if (!u) continue;
        const h = hashOf(u.text);
        if (existing.has(h) || found.has(h)) continue;
        found.set(h, u);
      }
    }
    // most recent first, cap, then import oldest→newest so index reads chronologically
    const all = [...found.entries()].sort((a, b) => String(b[1].ts || "").localeCompare(String(a[1].ts || "")));
    const take = all.slice(0, limit).reverse();
    const dropped = all.length - take.length;
    let imported = 0;
    for (const [h, u] of take) {
      if (addItem({ body: u.text, source: "claude-history", ts: u.ts, hash: h, existingHashes: existing })) imported++;
    }
    out({
      ok: true, imported, candidatesFound: all.length, dropped,
      note: dropped > 0
        ? `Imported the ${imported} most recent of ${all.length} first-person messages (capped at ${limit}; raise with --limit). Now read a diverse sample of the newest items and tell the user what you already notice about them — in their words, with receipts.`
        : `Imported ${imported} first-person messages. Now read a diverse sample and tell the user what you already notice about them — in their words, with receipts.`,
    });
  },

  // search <query terms...> — cheap lexical scoring; Claude reads the winning files
  search() {
    const q = process.argv.slice(3).join(" ").trim();
    if (!q) fail("usage: vault.mjs search <query>");
    const qt = new Set(tokens(q));
    const now = Date.now();
    const scored = readIndex().map((e) => {
      const et = tokens(e.title + " " + e.preview + " " + (e.tags || []).join(" "));
      const overlap = et.filter((t) => qt.has(t)).length;
      const days = (now - Date.parse(e.ts)) / 86400000;
      return { e, score: overlap + Math.max(0, 1 - days / 365) * 0.4 };
    }).filter((x) => x.score > 0.3).sort((a, b) => b.score - a.score).slice(0, 8);
    out({ query: q, hits: scored.map(({ e, score }) => ({ score: +score.toFixed(2), id: e.id, title: e.title, source: e.source, ts: e.ts, file: e.file, preview: e.preview })), note: "Read the files of the best hits for full content." });
  },

  // sample [--n N] [--source S] — a diverse spread for the daemon to read (on-ramp + hatch seeding)
  sample() {
    const n = Math.max(1, parseInt(getFlag("n") || "12", 10));
    const src = getFlag("source");
    let idx = readIndex();
    if (src) idx = idx.filter((e) => e.source === src);
    if (!idx.length) { out({ items: [], note: "vault empty" }); return; }
    // even spread across the timeline so it's not all one day
    const step = idx.length / n;
    const picks = [];
    for (let i = 0; i < n && i * step < idx.length; i++) picks.push(idx[Math.floor(i * step)]);
    out({ count: picks.length, of: idx.length, items: picks.map((e) => ({ id: e.id, ts: e.ts, source: e.source, file: e.file, preview: e.preview })), note: "Read these files for full content; this is a timeline-spread sample." });
  },

  stats() {
    const idx = readIndex();
    const bySource = {};
    idx.forEach((e) => (bySource[e.source] = (bySource[e.source] || 0) + 1));
    out({ items: idx.length, bySource, oldest: idx[0]?.ts, newest: idx[idx.length - 1]?.ts, home: ROOT });
  },

  export() {
    const dest = getFlag("to") || path.join(os.homedir(), `daemon-export-${new Date().toISOString().slice(0, 10)}.tar.gz`);
    execFileSync("tar", ["-czf", dest, "-C", path.dirname(ROOT), path.basename(ROOT)]);
    out({ ok: true, archive: dest, note: "Your entire daemon — vault, claims, model, honesty log — in one archive." });
  },
};

const cmd = process.argv[2];
if (!cmd || !cmds[cmd]) fail("usage: vault.mjs <init|add|import-claude|search|sample|stats|export>");
cmds[cmd]();
