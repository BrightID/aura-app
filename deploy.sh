#!/bin/bash
# Publishes the app and its shared practice world: ./deploy.sh
# First run creates the Vercel project "aura-practice", gives it its own free
# Upstash Redis (its own, not shared with anything else), and sets the team code used by "Reset this room".
set -euo pipefail
cd "$(dirname "$0")"
# The room link and reset code are made on the first run and kept in local/
# (git-ignored). Anyone with the room link can play in it, so share it only on the call.
mkdir -p local
[ -f local/room ] || echo "interfold-$(openssl rand -hex 5)" > local/room
[ -f local/team-code ] || openssl rand -hex 4 > local/team-code
ROOM="$(cat local/room)"
TEAM_CODE_VALUE="$(cat local/team-code)"
step() { echo; echo "▸ $*"; }

step "1/6 Checking index.html"
[ -f index.html ] || { echo "✗ no index.html next to deploy.sh"; exit 1; }
echo "   ✓ index.html ($(wc -c < index.html | tr -d ' ') bytes)"

step "2/6 Testing the room store locally"
node test-store.mjs

step "3/6 Linking the Vercel project aura-practice"
if [ ! -f .vercel/project.json ]; then
  vercel project add aura-practice >/dev/null 2>&1 || true
  vercel link --yes --project aura-practice
fi
echo "   ✓ linked: $(grep -o '"projectName":"[^"]*"' .vercel/project.json)"

step "4/6 Making sure it has its own Redis"
if vercel integration list 2>&1 | grep -q "upstash-kv"; then echo "   ✓ already has one"
else
  echo "   ✗ no Redis yet. Vercel only creates it in the web dashboard:"
  echo "     project → Storage → Create Database → Upstash for Redis → connect it to this project."
  echo "     Then run ./deploy.sh again."
  exit 1
fi

step "5/6 Setting the team code for room resets"
if vercel env ls production 2>&1 | grep -q "TEAM_CODE"; then echo "   ✓ already set"
else printf "%s" "$TEAM_CODE_VALUE" | vercel env add TEAM_CODE production >/dev/null && echo "   ✓ set"; fi

step "6/6 Deploying (about a minute)"
vercel deploy --prod --yes >/dev/null 2>&1 || { echo "   ✗ deploy failed; run: vercel deploy --prod"; exit 1; }
P=$(grep -o '"projectId":"[^"]*"' .vercel/project.json | cut -d'"' -f4)
T=$(grep -o '"orgId":"[^"]*"' .vercel/project.json | cut -d'"' -f4)
# Vercel puts a login wall on new projects; a room link must open for anyone on the call.
vercel api "/v9/projects/$P?teamId=$T" -X PATCH -F 'ssoProtection=null' >/dev/null 2>&1 || true
HOST=$(vercel api "/v9/projects/$P?teamId=$T" 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['targets']['production']['alias'][0])")
echo "   ✓ deployed to $HOST"

step "Checking the live server"
CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://$HOST/api/world?room=$ROOM")
[ "$CODE" = 200 ] || { echo "   ✗ /api/world answered $CODE (500 means no Redis; 401 or 302 means the login wall is still on)"; exit 1; }
echo "   ✓ the room server answers"
echo
echo "✓ Live: https://$HOST/?room=$ROOM"
echo "  Reset code (side drawer → Reset this room): $TEAM_CODE_VALUE"
