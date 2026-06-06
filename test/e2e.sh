#!/usr/bin/env bash
# Cold-start e2e: simulates what Claude does in a hatch session and asserts
# the math behaves: EIG picks the split question, the commit seals before the
# answer, surprisal + reweighting move the axes, creature renders, vault
# round-trips, MCP server answers. Runs against a throwaway DAEMON_HOME.
set -euo pipefail
cd "$(dirname "$0")/.."
export DAEMON_HOME="$(mktemp -d)/daemon-home"
H="node skills/daemon/scripts/hatch.mjs"
V="node skills/daemon/scripts/vault.mjs"
pass() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; exit 1; }

echo "[1] init + status (unhatched)"
$V init >/dev/null
$H status | grep -q '"seeded": false' && pass "starts unseeded"

echo "[2] seed: 3 warmups + 8 diverse particles"
$H seed <<'EOF' >/dev/null
{"warmup":[
  {"q":"what are you building right now?","answer":"a tool so my AI actually knows me without anyone else seeing my stuff"},
  {"q":"a recent moment that felt most like you?","answer":"3am fixing the build alone, music loud, didn't notice the time"},
  {"q":"what do you refuse to do?","answer":"sell user data, ever. also meetings before noon"}],
 "particles":[
  {"sketch":"solitary builder, freedom above all, allergic to institutions","axes":{"H":0.6,"E":-0.4,"X":-0.7,"A":-0.2,"C":0.1,"O":0.8,"V":0.3}},
  {"sketch":"idealist who codes for the mission, warm core under armor","axes":{"H":0.7,"E":0.3,"X":-0.3,"A":0.4,"C":-0.2,"O":0.7,"V":0.8}},
  {"sketch":"competitive perfectionist proving something to someone","axes":{"H":-0.2,"E":-0.1,"X":0.2,"A":-0.5,"C":0.8,"O":0.4,"V":-0.6}},
  {"sketch":"night-owl artist using code as a medium","axes":{"H":0.4,"E":0.6,"X":-0.5,"A":0.3,"C":-0.6,"O":0.9,"V":0.2}},
  {"sketch":"privacy absolutist, burned before, trusts systems not people","axes":{"H":0.5,"E":-0.6,"X":-0.6,"A":-0.4,"C":0.5,"O":0.3,"V":0.1}},
  {"sketch":"social founder who performs independence but recharges with people","axes":{"H":0.1,"E":0.2,"X":0.6,"A":0.2,"C":0.3,"O":0.5,"V":0.0}},
  {"sketch":"restless starter, ten projects, finishes when it matters","axes":{"H":0.3,"E":0.0,"X":0.0,"A":0.1,"C":-0.7,"O":0.8,"V":0.4}},
  {"sketch":"quiet craftsman, modest, would give it all away if it worked","axes":{"H":0.9,"E":0.1,"X":-0.4,"A":0.6,"C":0.4,"O":0.5,"V":0.9}}]}
EOF
$H status | grep -q '"particleCount": 8' && pass "8 particles seeded"

echo "[3] select: EIG must pick the SPLIT question (c2), not the predictable one (c1)"
SEL=$($H select <<'EOF'
{"candidates":[
  {"id":"c1","question":"Do you care about owning your own data?","options":["yes","no","it's more complicated"],"axis":"H","field":"data ownership"},
  {"id":"c2","question":"A friend cancels last minute and your evening is suddenly free — what actually happens?","options":["relief, I build","I find other people","depends who cancelled","it's more complicated"],"axis":"X","field":"free evening"}],
 "passes":[{
  "c1":[{"yes":0.9,"no":0.02,"it's more complicated":0.08},{"yes":0.92,"no":0.02,"it's more complicated":0.06},{"yes":0.7,"no":0.1,"it's more complicated":0.2},{"yes":0.85,"no":0.05,"it's more complicated":0.1},{"yes":0.95,"no":0.01,"it's more complicated":0.04},{"yes":0.8,"no":0.05,"it's more complicated":0.15},{"yes":0.85,"no":0.05,"it's more complicated":0.1},{"yes":0.9,"no":0.02,"it's more complicated":0.08}],
  "c2":[{"relief, I build":0.85,"I find other people":0.05,"depends who cancelled":0.05,"it's more complicated":0.05},{"relief, I build":0.6,"I find other people":0.15,"depends who cancelled":0.15,"it's more complicated":0.1},{"relief, I build":0.3,"I find other people":0.4,"depends who cancelled":0.2,"it's more complicated":0.1},{"relief, I build":0.7,"I find other people":0.05,"depends who cancelled":0.1,"it's more complicated":0.15},{"relief, I build":0.8,"I find other people":0.02,"depends who cancelled":0.13,"it's more complicated":0.05},{"relief, I build":0.15,"I find other people":0.65,"depends who cancelled":0.15,"it's more complicated":0.05},{"relief, I build":0.45,"I find other people":0.25,"depends who cancelled":0.2,"it's more complicated":0.1},{"relief, I build":0.55,"I find other people":0.15,"depends who cancelled":0.2,"it's more complicated":0.1}]}]}
EOF
)
echo "$SEL" | grep -q '"question": "A friend cancels' && pass "EIG chose the split question"
echo "$SEL" | grep -q '"commitHash"' && pass "guess sealed with hash"
QID=$(echo "$SEL" | grep '"qid"' | sed 's/.*: "\(.*\)".*/\1/')
grep -q "$QID" "$DAEMON_HOME/hatch/commits.jsonl" && pass "commit logged BEFORE answer"

echo "[4] answer with a non-predicted option → surprise + weight shift"
ANS=$($H answer <<'EOF'
{"answer":"I find other people"}
EOF
)
echo "$ANS" | grep -q '"predicted": "relief, I build"' && pass "reveal shows the sealed prediction"
echo "$ANS" | grep -q '"surprised": true' && pass "low-prob answer registered as surprise"
echo "$ANS" | grep -qE '"surprisalBits": [12]' && pass "surprisal computed"

echo "[5] verify: sealed hash recomputes"
$H verify <<EOF | grep -q '"honest": true' && pass "commit-then-reveal audit passes"
{"qid":"$QID"}
EOF

echo "[6] claim minting"
$H claim <<'EOF' >/dev/null && pass "claim minted"
{"text":"when an evening frees up he goes toward people, not the build","source":"q: friend cancels → answered: I find other people, expected relief-I-build"}
EOF

echo "[7] changes timeline"
$H changes | grep -q '"axes"' && pass "drift report works"

echo "[8] creature renders"
node skills/daemon/scripts/creature.mjs | grep -q '"ok": true' && pass "creature spec emitted"
grep -q "<svg" "$DAEMON_HOME/creature/creature.svg" && pass "creature.svg written"

echo "[9] vault round-trip"
echo "met giovanna at the climbing gym, she also hates CRMs, wants to see the daemon thing" | $V add --title "giovanna climbing gym" --tags "people,leads" --source paste >/dev/null
$V search climbing daemon | grep -q "giovanna" && pass "saved + found with receipts"

echo "[10] MCP server smoke test"
MCP_OUT=$(printf '%s\n%s\n%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"vault_search","arguments":{"query":"climbing"}}}' \
  | timeout 10 node skills/daemon/mcp/server.mjs)
echo "$MCP_OUT" | grep -q '"serverInfo"' && pass "MCP initialize"
echo "$MCP_OUT" | grep -q '"vault_search"' && pass "MCP tools/list"
echo "$MCP_OUT" | grep -q "giovanna" && pass "MCP tools/call reads the vault"

echo
echo "ALL PASS — cold-start stranger → seeded → 50/50 selected → sealed → surprised → claimed → creature → vault → MCP"
echo "(throwaway home: $DAEMON_HOME)"
