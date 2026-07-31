#!/usr/bin/env bash
# push-to-github.sh
# Uploads the entire fortnite-map-tracker project to a new GitHub repo.
# Works on Mac and Windows (Git Bash / WSL).
#
# Usage:
#   1. Fill in GITHUB_TOKEN and GITHUB_USER below.
#   2. Run this from INSIDE the fortnite-map-tracker folder:
#        bash push-to-github.sh
# -----------------------------------------------------------------------

GITHUB_TOKEN=""        # paste your token here (needs repo scope)
GITHUB_USER=""         # your GitHub username e.g. johndoe
REPO_NAME="fortnite-map-tracker"

# ---- sanity checks ----
if [[ -z "$GITHUB_TOKEN" || -z "$GITHUB_USER" ]]; then
  echo "❌  Fill in GITHUB_TOKEN and GITHUB_USER at the top of this script first."
  exit 1
fi
if [[ ! -f "package.json" ]]; then
  echo "❌  Run this from inside the fortnite-map-tracker folder (the one with package.json in it)."
  exit 1
fi

echo "→ Creating repo $GITHUB_USER/$REPO_NAME …"
curl -s -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"private\":true,\"auto_init\":false}" \
  | grep -E '"full_name"|"message"'

sleep 1

upload() {
  local file="$1"
  local content
  content=$(base64 < "$file" | tr -d '\n')
  local url="https://api.github.com/repos/$GITHUB_USER/$REPO_NAME/contents/$file"
  curl -s -X PUT \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "$url" \
    -d "{\"message\":\"add $file\",\"content\":\"$content\"}" \
    | grep -E '"path"|"message"' | head -2
  echo "  ✓ $file"
}

# gather every file we want (skip node_modules, .env, state.json)
FILES=$(find . -type f \
  ! -path './node_modules/*' \
  ! -name '.env' \
  ! -name 'state.json' \
  ! -name 'push-to-github.sh' \
  | sed 's|^\./||' | sort)

total=$(echo "$FILES" | wc -l | tr -d ' ')
echo "→ Uploading $total files …"

i=0
while IFS= read -r f; do
  i=$((i+1))
  echo -n "[$i/$total] "
  upload "$f"
done <<< "$FILES"

echo ""
echo "✅  Done! Repo: https://github.com/$GITHUB_USER/$REPO_NAME"
echo ""
echo "Next: go to Railway → New → Deploy from GitHub repo → pick $REPO_NAME"
echo "Then add DISCORD_WEBHOOK_URL in the Variables tab."
