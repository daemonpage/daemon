# Daemon — narrative and business model

*v2, 2026-06-06. Replaces the March hardware-era canvas in the daemon mothership repo. One product, one spine.*

## The one sentence

**A database of you, that your Claude can read.**

## The story (why)

You already pay for the smartest AI on earth. It just doesn't know you.

Every session starts from zero, or from a vendor memory you can't see, edit, or take with you. Daemon fixes that. It is a database of you, in plain files on your machine, that your Claude reads.

It fills itself two ways. You feed it: notes, exports, links, anything you share. And it asks: the hatching game, where it seals a guess about you before every question, shows you what it predicted, and grows when you surprise it. It cannot pretend it knew. The seal is a hash, logged before you answer.

Yours means yours. Your files. Your subscription. Leave with one command.

## Who (in order of pain)

1. **Beachhead: Claude Code power users on Max.** They re-explain themselves every session. They already hack around this with CLAUDE.md files and memory MCPs, which proves the pain. Sell: never re-explain yourself, memory that is yours and portable. Install is one command. Every daemon user is a developer for now, and that is fine.
2. **Wave 2: AI self-explorers.** The sealed-guess reveal is an emotional hook no journal has. Sell: it guessed me, watch it learn me. Arrives when the reveal is screenshot-beautiful on a phone.
3. **Premium: the subset that falls in love.** Deep Hatch ritual, artist-drawn daemon, fingerprint phone vault.

## Lean canvas

| Box | Answer |
|---|---|
| Problem | The smartest AI you pay for forgets you; what it does remember is not yours |
| Solution | Owned plain-file memory + a hatching loop that actively fills its own gaps |
| Unique value | Never re-explain yourself, and the memory is yours |
| Unfair advantage | The intersection: owned + AI-readable + actively self-improving. Zero marginal inference cost (runs on the user's sub) while every competitor pays per user |
| Customer segments | Claude Code Max users → AI self-explorers → premium lovers |
| Channels | Skill store + GitHub, one Show HN, one X demo thread, r/ClaudeAI, the share card |
| Revenue | Free OSS core. Deep Hatch one-time ritual (€29-49: long precision interview + artist daemon). Phone vault app later. Company touches Stripe and bits, never the data plane |
| Costs | Near-zero marginal. Dev time, art, landing page |
| Metrics | Stars/installs, hatches completed, MCP connects to daily Claude, real conversations. No telemetry by promise, so metrics come from talking to people |

## Riskiest assumption

Not "will people install." It is: **will people finish a hatch and connect it to their daily Claude.** That connect event is retention. Ten real users through that funnel beats any launch number.

## Reaching the first 100

1. Publish the repo + marketplace manifest (built; needs org/name).
2. One 60-second demo capture: card → sealed hash → answer → reveal → creature re-renders. That clip is the marketing.
3. Show HN / X thread in Arthur's voice: "I built a database of me that my Claude reads."
4. Hair-on-fire list: people complaining in memory-MCP issue trackers (mem0, Letta, basic-memory). Standing rule: nothing sends without explicit go; Turin-meetable people first.
5. Wave 2 waits for the phone-pretty reveal.

## What we deliberately do not lead with

EIG, Bayesian experimental design, particles, axes (that is the engine room, link the research for the curious). The creature (delight, not pitch, for wave 1). "Spiritual journey" (wave 2 language, tested later). Privacy as fear (we state ownership as a fact, not a scare).

## The three promises (unchanged, load-bearing)

1. Runs on YOUR Claude, the subscription you already have.
2. Your data never leaves your machine. No server, no account, no telemetry.
3. Leaving is one command, and we make it easy on purpose.
