#!/usr/bin/env node
// ============================================================================
// daemon MCP server — the connector between your daemon and any Claude.
// Exposes the vault + the daemon's model of you as MCP tools over stdio,
// so Claude surfaces beyond this machine's Claude Code (Claude Desktop,
// other agents) can read what your daemon knows — when you wire them in.
//
// Zero dependencies: speaks newline-delimited JSON-RPC 2.0 (MCP stdio).
// ============================================================================
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, "..", "scripts");
const run = (script, args, stdin) =>
  execFileSync("node", [path.join(SCRIPTS, script), ...args], { input: stdin || undefined, encoding: "utf-8" });

const TOOLS = [
  {
    name: "vault_search",
    description: "Search the user's personal vault (things they saved: notes, links, voice notes, imports). Returns scored hits with file paths and previews.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "what to look for" } }, required: ["query"] },
  },
  {
    name: "vault_add",
    description: "Save something to the user's personal vault. Use when the user asks to remember/save something.",
    inputSchema: { type: "object", properties: { text: { type: "string" }, title: { type: "string" }, tags: { type: "string", description: "comma-separated" }, source: { type: "string" } }, required: ["text"] },
  },
  {
    name: "daemon_status",
    description: "The daemon's current model of the user: character axes with confidence, how many questions answered, claims count, what it wants to probe next.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "daemon_changes",
    description: "How the user has been drifting over time: per-axis total drift, recent trend, biggest surprises (where the daemon guessed wrong).",
    inputSchema: { type: "object", properties: {} },
  },
];

function callTool(name, args) {
  switch (name) {
    case "vault_search": return run("vault.mjs", ["search", ...String(args.query || "").split(/\s+/)]);
    case "vault_add": {
      const a = ["add"];
      if (args.title) a.push("--title", args.title);
      if (args.tags) a.push("--tags", args.tags);
      a.push("--source", args.source || "mcp");
      return run("vault.mjs", a, String(args.text || ""));
    }
    case "daemon_status": return run("hatch.mjs", ["status"]);
    case "daemon_changes": return run("hatch.mjs", ["changes"]);
    default: throw new Error("unknown tool: " + name);
  }
}

const respond = (id, result, error) =>
  process.stdout.write(JSON.stringify(error ? { jsonrpc: "2.0", id, error } : { jsonrpc: "2.0", id, result }) + "\n");

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === "initialize") {
      respond(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "daemon", version: "0.1.0" },
      });
    } else if (method === "notifications/initialized" || String(method).startsWith("notifications/")) {
      // no reply to notifications
    } else if (method === "tools/list") {
      respond(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      const text = callTool(params.name, params.arguments || {});
      respond(id, { content: [{ type: "text", text }] });
    } else if (id !== undefined) {
      respond(id, null, { code: -32601, message: "method not found: " + method });
    }
  } catch (e) {
    if (id !== undefined) respond(id, null, { code: -32000, message: String(e.message || e) });
  }
});
