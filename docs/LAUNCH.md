# Launch plan — live by Wed June 10, settled before June 15

June 15 = Anthropic's Agent SDK credit-pool launch (subscription-powered third-party apps become official). We launch BEFORE it so daemon is the existing example, not a reaction.

## MUST — launch blockers

### Day 0 — Sun June 7 (today)
- [ ] **Name + publish.** `daemons` is taken, "hq" rejected. Default if no org decision today: ship under `Camaraarthur/daemon` (GitHub redirects survive a later transfer). Org candidates still free: `getdaemons`, `daemonpage`, `daemons-ai`.
- [ ] **LICENSE file** (missing). MIT. Trust promise needs a license, and registries require one.
- [ ] **README**: ~~replace placeholder URL~~ DONE 2026-06-10; add FAQ (Is this allowed by Anthropic's ToS? → yes, runs inside your own Claude, here's why. What leaves my machine? → nothing. How do I leave? → one command).
- [ ] **Clean-machine e2e.** Fresh Linux user / container with nothing of Arthur's: `git clone → ./install.sh → claude → "hatch my daemon" → full question turn → reveal → creature`. The scripts are tested; the *skill-in-a-real-session* is not. This is the actual "people can use it" gate.
- [ ] **`/plugin marketplace add` flow tested** — manifests parse, install works via the plugin path too.
- [ ] **Privacy/claims audit**: grep for anything that could phone home (should be nothing), no secrets in repo, every README claim true.

### Day 1 — Mon June 8
- [ ] **Arthur dogfoods a REAL hatch** — 10+ questions, fresh state, on his own machine. Fix everything that feels wrong (question quality, reveal tone, pacing). This is the product-quality gate; scripts passing ≠ magic landing.
- [ ] **One outside human** (Turin-meetable dev friend) does install+hatch while Arthur watches. Every stumble = a fix or a README line.
- [ ] **daemon.page** points at the repo with the install command. (my.daemon.page stays Arthur's private instance.)

### Day 2 — Tue June 9
- [ ] **The 60-second clip**: question card → 🔒 sealed hash → answer → reveal → creature re-renders. Terminal capture + creature SVG. This is the entire marketing budget.
- [ ] **README header GIF** from the same capture.
- [ ] **Show HN draft** + first-comment (the "why I built this" comment matters more than the post). Arthur's voice, zero em dashes, short.

### Day 3 — Wed June 10 — LAUNCH
- [ ] Show HN, morning US East. Title candidate: "Show HN: Daemon — a database of you that your Claude can read".
- [ ] X thread with the clip.
- [ ] r/ClaudeAI post.
- [ ] **Be present all day** — answer every comment/issue fast. Speed of response IS the second impression.

### Day 5 + June 15 — the handshake
- [ ] **June 15: file the third-party approval inquiry with Anthropic** (the "apps that authenticate with your Claude subscription" program). Walking in with a launched, compliant product = the meeting.
- [ ] **Arthur's own metering check**: June 15 makes his nightly `claude -p` automation (dream pass, vault refresh, persona mining) draw from the credit pool. Audit what runs nightly, decide overage on/off. Not launch-related; same deadline.

## SHOULD — compounding, not blocking

- [ ] **Claude-history importer** (`vault.mjs import-claude` reading `~/.claude/projects/*.jsonl`) — the single highest-value feature for wave 1: instant day-one vault, zero effort. Ship in launch week if Day 0-1 goes clean; otherwise v0.2 within days (announce as coming in the README).
- [ ] **The pipes essay** ("when intelligence is free, what stays: pipes, water, valves") — daemon.page/blog, launch-day companion or day after. Stakes the territory.
- [ ] **Technical writeup**: the sealed-guess BED loop (commit-then-reveal + EIG + particles, with the research citations). Second attention wave, ~June 12-14. Nobody has shipped this as a working artifact.
- [ ] Submit to community skill registries / awesome-claude-code lists.
- [ ] GitHub hygiene: Discussions on, issue template, CONTRIBUTING stub.
- [ ] Hatch quality upgrades from dogfood findings (VCSC second pass as "deep hatch" default, question-tone tuning).
- [ ] Share-card PNG export (creature + one reveal) — wave-2 fuel, only if trivial.
- [ ] Drafts (NOT sent without explicit go): intro notes to Claude Relations / relevant Anthropic folks, post-launch with numbers.

## Explicitly NOT before launch
Artist daemons, Deep Hatch paid tier, phone/fingerprint vault, WhatsApp live link, relay/connector for claude.ai mobile, any telemetry (never).

## Launch-day definition of done
A stranger with Claude Code and Node can go from the HN post to a sealed reveal in **under 5 minutes**, and nothing they create leaves their machine.
