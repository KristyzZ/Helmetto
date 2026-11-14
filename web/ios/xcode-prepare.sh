#!/bin/zsh
# Runs before every build of the "Helmetto" scheme in Xcode, so pressing Run is enough:
#   1. pulls the latest code for this branch (skipped if git can't do it safely),
#   2. installs packages if they changed,
#   3. builds the web app for the server and copies it into the iOS project,
#   4. opens the local server in a Terminal window if it isn't running.
# Output goes to /tmp/helmetto-xcode.log; a macOS notification says if something failed.

LOG=/tmp/helmetto-xcode.log
exec > "$LOG" 2>&1
set -u
IOS_DIR="${0:A:h}"
REPO="${IOS_DIR:h:h}"
cd "$REPO" || exit 0

notify() { osascript -e "display notification \"$1\" with title \"Helmetto\"" >/dev/null 2>&1; }
fail() { echo "FAILED: $1"; notify "$1 Details: $LOG"; exit 0; }

# Xcode doesn't load your shell setup, so find node/npm the way Terminal would.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
command -v fnm >/dev/null && eval "$(fnm env)" >/dev/null 2>&1
command -v npm >/dev/null || fail "npm not found. Is Node installed?"
echo "node $(node -v), npm $(npm -v)"

# 1. Latest code. --ff-only never overwrites your own changes; if it can't pull, it builds what you have.
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git pull --ff-only || notify "Couldn't pull the latest code; building the version you have."
fi
echo "code: $(git log --oneline -1)"

# 2. Packages, only when package-lock.json changed.
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm install || fail "npm install failed."
fi

# 3. Server address: web/ios/server.local (one line, e.g. https://helmetto.onrender.com) or this Mac.
if [ -s "$IOS_DIR/server.local" ]; then
  SERVER="$(head -n 1 "$IOS_DIR/server.local" | tr -d '[:space:]')"
else
  SERVER="http://$(scutil --get LocalHostName).local:3000"
fi
echo "server: $SERVER"
VITE_API_URL="$SERVER" npm run build -w web || fail "Building the app failed."
(cd web && npx cap copy ios) || fail "Copying the app into Xcode failed."

# 4. The local server, in its own Terminal window, if it should run on this Mac and isn't.
if [[ "$SERVER" == *.local:3000 ]] && ! lsof -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  open -a Terminal "$IOS_DIR/start-server.command"
fi
echo "done"
