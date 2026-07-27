#!/bin/bash
#
# Install (or reinstall) the daily stock digest as a macOS launchd job.
# It runs scripts/daily-digest.mjs every day at the given time and emails you.
#
# Usage:
#   bash scripts/install-digest-cron.sh [HOUR] [MINUTE]
#   bash scripts/install-digest-cron.sh 9 0      # 09:00 every day (default)
#   bash scripts/install-digest-cron.sh 18 30    # 18:30 every day
#
# Remove it:
#   bash scripts/install-digest-cron.sh --uninstall
#
set -e

LABEL="com.stockanalytix.dailydigest"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NODE="$(command -v node)"
LOG="$ROOT/scripts/digest-output/cron.log"

if [ "$1" == "--uninstall" ]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "✅ Uninstalled daily digest job."
  exit 0
fi

HOUR="${1:-9}"
MINUTE="${2:-0}"

mkdir -p "$ROOT/scripts/digest-output"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/daily-digest.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$HOUR</integer>
    <key>Minute</key>
    <integer>$MINUTE</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>$LOG</string>
  <key>StandardErrorPath</key>
  <string>$LOG</string>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

printf '%02d:%02d' "$HOUR" "$MINUTE" > /dev/null
echo "✅ Daily digest scheduled every day at $(printf '%02d:%02d' "$HOUR" "$MINUTE")."
echo "   Script : $ROOT/scripts/daily-digest.mjs"
echo "   Log    : $LOG"
echo ""
echo "   Note: runs only while your Mac is powered on and logged in."
echo "   Test it now:  node scripts/daily-digest.mjs"
echo "   Remove it:    bash scripts/install-digest-cron.sh --uninstall"
