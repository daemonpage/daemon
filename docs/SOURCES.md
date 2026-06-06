# Live links — where people define themselves

The vault grows two ways: the hatching dialogue, and **linking the places you already are yourself**. Not all sources are equal — the ranking criterion is *identity density* (how much of YOU is in there per megabyte), not data volume. Browser history is huge and says little; your voice notes are tiny and say everything.

## The matrix

| Source | Identity density | Live link possible? | Best implementation | Friction | Notes / risk |
|---|---|---|---|---|---|
| **Claude / ChatGPT history** | ★★★★★ — what you think about, ask, build | ✅ (Claude Code: already local) | Claude Code: read `~/.claude/projects/*.jsonl` directly — zero setup, day-one win. ChatGPT: export zip import | none (CC) | The single best v0 source for this audience |
| **WhatsApp** | ★★★★★ — how you talk to the people closest to you | ✅ | v1: official chat export (.txt) → import. v2: whatsapp-web.js headless on the USER'S device, QR pair — session must never live on our side | low (export) / med (live) | Unofficial API; read-mostly is low-risk but the live link is user-hosted or nothing |
| **Voice notes / recorder** | ★★★★★ — thinking out loud, unguarded | ✅ | watch a folder; transcribe locally (whisper.cpp) or in-session | medium | On-device STT preferred; never lose raw audio |
| **Notes (Obsidian / Apple / Keep)** | ★★★★★ — the already-curated self | ✅ (Obsidian trivially) | Obsidian: folder watch — it's already plain markdown. Keep: Takeout import | minimal | Obsidian users are the perfect early adopters; basically vault-native already |
| **Email (Gmail/IMAP)** | ★★★★ — commitments, relationships, receipts | ✅ | IMAP with app password (user's creds, local keystore); Gmail API OAuth later | medium | OAuth app verification is a grind — IMAP first |
| **Calendar** | ★★★★ — where your time ACTUALLY goes (vs stated values — gold for the hatch) | ✅ | ICS URL / CalDAV pull | low | Cheap to build; powers "you say X matters, your calendar says Y" probes |
| **Photos / screenshots** | ★★★★ — what you point the camera at | ✅ | share-to-daemon + folder watch; OCR locally, overnight, never paid APIs | low | Phone-first feature; pairs with the Android vault |
| **Instagram / TikTok** | ★★★ — taste, aspiration, the performed self | ❌ (export only) | official data-export zip import | low | Exports lag days; still worth a one-shot import |
| **Spotify / music** | ★★★ — mood and identity badges | ✅ | official API, real OAuth | low | Easy, fun, shareable ("your daemon noticed your October sounded different") |
| **Google Takeout (search/YouTube/Maps)** | ★★★ — behavior, not persona | ❌ (periodic export) | import pipeline, provenance-only at ingest | medium | Huge; never judge at ingest, facts only |
| **Browser history** | ★★ | ✅ | extension or history-db read | low | Feels surveillant; strictly opt-in, late |
| **Location** | ★★ | ✅ | Takeout timeline / OwnTracks | high | Heaviest privacy weight; only with a clear payoff |

## Build order

1. **Claude Code history** — already on disk, this audience's densest stream, zero permission needed.
2. **Paste / "remember this"** — universal, already shipped (`vault.mjs add`).
3. **Notes folder watch** (Obsidian first) — plain files watching plain files.
4. **WhatsApp export import** — the .txt parser; live link only when it can run user-side end to end.
5. **Calendar + voice notes** — the receipts-vs-stated-values engine.

Everything ingests under one rule: **provenance facts only at ingest** — what, where from, when. What it *means* lives in claims, with sources, where the user can see and veto it.
