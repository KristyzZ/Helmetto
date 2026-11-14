#!/bin/zsh
# Opened by Xcode (via xcode-prepare.sh) when the Helmetto server isn't running.
# Double-clicking it in Finder works too. Close this window to stop the server.
cd "${0:A:h}/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && source "$HOME/.nvm/nvm.sh"
command -v fnm >/dev/null && eval "$(fnm env)"
printf '\e]0;Helmetto server\a'
echo "Helmetto server for the iPhone app. Keep this window open; close it to stop."
echo
# A full path: the server runs from api/, so a relative path would land in api/data.
DATABASE_PATH="$PWD/data/scooter.db" DEMO_MODE=true npm run dev -w @helmetto/api
