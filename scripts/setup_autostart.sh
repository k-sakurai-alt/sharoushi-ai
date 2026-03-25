#!/bin/bash
# ローカルランチャーをmacOSログイン時に自動起動する設定

PLIST_PATH="$HOME/Library/LaunchAgents/jp.sconnect.sharoushi-launcher.plist"
NODE_PATH=$(which node)
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/local_launcher.js"
LOG_PATH="$(cd "$(dirname "$0")" && pwd)/launcher.log"

cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>jp.sconnect.sharoushi-launcher</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_PATH</string>
    <string>$SCRIPT_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_PATH</string>
  <key>StandardErrorPath</key>
  <string>$LOG_PATH</string>
</dict>
</plist>
EOF

# 既存のサービスをアンロード（エラーは無視）
launchctl unload "$PLIST_PATH" 2>/dev/null

# 新しい設定をロード
launchctl load "$PLIST_PATH"

echo "✅ 自動起動の設定が完了しました"
echo "   Mac起動時に自動でローカルランチャーが立ち上がります"
echo "   今すぐ確認: http://localhost:3003/status"
