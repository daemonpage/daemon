# Daemon

**A database of you, that your Claude can read. With a small entity inside that tries to guess your answers — and grows when it's wrong.**

Daemon turns the Claude you already pay for into something that actually knows you. It lives in plain files on your machine, behind nothing but your filesystem. We never see anything; there is no server.

## What it does

- **Hatch** — your daemon asks you questions engineered to be 50/50: it *commits to a sealed guess before you answer* (hash logged, auditable), then reveals what it predicted. Every surprise teaches it who you actually are. You are the adversarial training signal.
- **Vault** — save anything (notes, links, pastes, exports). Ask "what did I save about X" and your Claude answers with receipts. One folder, plain markdown, yours.
- **Changes** — it watches how you drift over time: which traits are moving, where you keep surprising it.
- **Creature** — it has a form, rendered deterministically from what it currently believes about you. Blurry while it's unsure. It settles as it knows you.

## The three promises

1. **Runs on YOUR Claude.** This is a skill — it executes inside your own Claude session, on the subscription you already have. No API keys, no second bill, no approval flows.
2. **Your data never leaves.** Everything lives in `~/.daemon/` as plain files. No telemetry, no server, no account.
3. **Leaving is one command.** `vault.mjs export` packs everything — vault, claims, model, honesty log — into one archive. Delete the folder and the daemon is gone.

## Install

Requires [Claude Code](https://claude.com/claude-code) (any paid plan) and Node 18+.

```bash
git clone https://github.com/REPLACE_ME/daemon
cd daemon && ./install.sh
```

Then in Claude Code:

```
> hatch my daemon
```

### Connect other Claude surfaces (optional)

The bundled MCP server exposes your vault to Claude Desktop or any MCP client — same files, nothing copied, nothing uploaded:

```bash
claude mcp add daemon -- node ~/.claude/skills/daemon/mcp/server.mjs
```

## How the honesty works

Before you ever see a question, the daemon's predicted answer distribution is hashed and appended to `~/.daemon/hatch/commits.jsonl`. After you answer, it reveals the prediction and the salt — anyone can recompute the hash. The daemon cannot pretend it knew.

Under the hood the loop is sequential Bayesian experimental design: your daemon holds a population of hypotheses about who you are, and each question is chosen to maximally split that population ([BED-LLM](https://arxiv.org/abs/2508.21184), [OPEN](https://arxiv.org/abs/2403.05534)). A perfect 50/50 question carries exactly one bit about you. Claude does the words; a deterministic script does the math.

## What's coming

- **Live links** — feed your daemon the places you actually define yourself (WhatsApp export, notes folders, Claude history). See [docs/SOURCES.md](docs/SOURCES.md).
- **Phone vault** — the fingerprint-gated Android app as the vault's home.
- **Artist-drawn daemons** — the premium hatch.

---

Daemon is built by Daemons. It is not an Anthropic product; it is a harness that runs entirely inside your own Claude.
