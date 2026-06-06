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

function getFlag(name) { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : undefined; }

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
    ensure();
    const body = readStdin().trim();
    if (!body) fail("item body expected on stdin");
    const title = getFlag("title") || body.slice(0, 60).replace(/\s+/g, " ");
    const tags = (getFlag("tags") || "").split(",").map((t) => t.trim()).filter(Boolean);
    const source = getFlag("source") || "chat";
    const ts = new Date().toISOString();
    const id = ts.slice(0, 10) + "-" + slug(title) + "-" + crypto.randomBytes(2).toString("hex");
    const file = path.join(ITEMS, id + ".md");
    fs.writeFileSync(file, `---\nid: ${id}\ntitle: ${title}\ndate: ${ts}\nsource: ${source}\ntags: [${tags.join(", ")}]\n---\n\n${body}\n`);
    fs.appendFileSync(INDEX, JSON.stringify({ id, ts, title, tags, source, file, preview: body.replace(/\s+/g, " ").slice(0, 160) }) + "\n");
    out({ ok: true, id, file });
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
if (!cmd || !cmds[cmd]) fail("usage: vault.mjs <init|add|search|stats|export>");
cmds[cmd]();
