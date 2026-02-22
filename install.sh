#!/bin/sh
# mobile-terminal hook installer
# Configures AI coding agents on the remote server to send completion
# signals back to the mobile-terminal terminal UI via OSC escape sequences.
# Safe to re-run — idempotent.

set -e

INSTALL_DIR="$HOME/.local/bin"
NOTIFY_SCRIPT="$INSTALL_DIR/mobile-notify"

# ── Help / list mode ──────────────────────────────────────────────────────────
# Running with no arguments (or --list / --help) shows all available options
# without installing anything.
if [ "$1" = "--list" ] || [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "mobile-terminal hook installer"
  echo "=============================="
  echo ""
  echo "Configures AI coding agents to send completion signals to mobile-terminal."
  echo "Signals travel through the existing SSH connection — no additional API required."
  echo ""
  # echo "Usage:"
  # echo "  curl -fsSL <relay-url>/install.sh | bash"
  # echo ""
  echo "Available integrations:"
  echo ""
  echo "  Claude Code     — adds Stop hook to ~/.claude/settings.json"
  echo "                    use 'claude' as normal"
  echo ""
  echo "  Codex CLI       — enables OSC 9 notifications in ~/.codex/config.toml"
  echo "                    use 'codex' as normal"
  echo ""
  echo "  Gemini CLI      — adds AfterAgent hook to ~/.gemini/settings.json"
  echo "                    use 'gemini' as normal"
  echo ""
  echo "  OpenCode        — installs a plugin in ~/.config/opencode/plugins/"
  echo "                    use 'opencode' as normal"
  echo ""
  echo "The script detects which tools are installed and configures only those."
  echo "Safe to re-run — idempotent."
  echo ""
  exit 0
fi

echo "mobile-terminal hook installer"
echo "=============================="
echo ""

# ── 1. Install mobile-notify ────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"
cat > "$NOTIFY_SCRIPT" << 'EOF'
#!/bin/sh
# mobile-notify: emit an OSC 9999 signal readable by mobile-terminal
# Usage: mobile-notify --type=stop --tool=claude
TYPE="stop"
TOOL=""

for arg in "$@"; do
  case "$arg" in
    --type=*) TYPE="${arg#--type=}" ;;
    --tool=*) TOOL="${arg#--tool=}" ;;
  esac
done

if [ -n "$TOOL" ]; then
  PAYLOAD="{\"type\":\"$TYPE\",\"tool\":\"$TOOL\"}"
else
  PAYLOAD="{\"type\":\"$TYPE\"}"
fi

# When running inside tmux, wrap in a DCS passthrough so tmux forwards
# the sequence to the outer terminal instead of silently dropping it.
if [ -n "$TMUX" ]; then
  printf '\033Ptmux;\033\033]9999;%s\007\033\\' "$PAYLOAD" > /dev/tty 2>/dev/null || printf '\033Ptmux;\033\033]9999;%s\007\033\\' "$PAYLOAD"
else
  printf '\033]9999;%s\007' "$PAYLOAD" > /dev/tty 2>/dev/null || printf '\033]9999;%s\007' "$PAYLOAD"
fi
EOF
chmod +x "$NOTIFY_SCRIPT"
echo "  [success] Installed mobile-notify → $NOTIFY_SCRIPT"

# ── 2. Ensure ~/.local/bin is on PATH ────────────────────────────────────────
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
      [ -f "$rc" ] || continue
      grep -qF "$INSTALL_DIR" "$rc" && continue
      echo "" >> "$rc"
      echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$rc"
    done
    export PATH="$INSTALL_DIR:$PATH"
    echo "  [success] Added $INSTALL_DIR to PATH"
    ;;
esac

# ── 3. Claude Code ───────────────────────────────────────────────────────────
if command -v claude > /dev/null 2>&1; then
  CLAUDE_SETTINGS="$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude"
  [ -f "$CLAUDE_SETTINGS" ] || echo '{}' > "$CLAUDE_SETTINGS"

  python3 - "$CLAUDE_SETTINGS" << 'PYEOF'
import json, sys

path = sys.argv[1]
with open(path) as f:
    cfg = json.load(f)

hooks = cfg.setdefault("hooks", {})

stop_cmd = "mobile-notify --type=stop --tool=claude"

# Remove any old JSON-format commands from previous installs
old_cmds = {
    "mobile-notify '{\"type\":\"stop\",\"tool\":\"claude\"}'",
    "mobile-notify '{\"type\":\"notify\",\"tool\":\"claude\"}'",
}
for event in ("Stop", "Notification"):
    if event in hooks:
        hooks[event] = [
            e for e in hooks[event]
            if not any(h.get("command", "") in old_cmds for h in e.get("hooks", []))
        ]
        if not hooks[event]:
            del hooks[event]

# Configure Stop hook only (task completion)
entries = hooks.setdefault("Stop", [])
already = any(
    h.get("command", "") == stop_cmd
    for entry in entries
    for h in entry.get("hooks", [])
)
if not already:
    entries.append({"hooks": [{"type": "command", "command": stop_cmd}]})

with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF
  echo "  [success] Claude Code hooks configured → $CLAUDE_SETTINGS"
fi

# ── 4. Codex CLI ─────────────────────────────────────────────────────────────
if command -v codex > /dev/null 2>&1; then
  CODEX_CONFIG="$HOME/.codex/config.toml"
  mkdir -p "$HOME/.codex"
  touch "$CODEX_CONFIG"
  if ! grep -q "notification_method" "$CODEX_CONFIG"; then
    # Append [tui] section if missing, or add key under existing section
    if grep -q "^\[tui\]" "$CODEX_CONFIG"; then
      # Insert after the [tui] header line
      sed -i '/^\[tui\]/a notification_method = "osc9"' "$CODEX_CONFIG"
    else
      printf '\n[tui]\nnotification_method = "osc9"\n' >> "$CODEX_CONFIG"
    fi
    echo "  [success] Codex CLI configured (OSC 9 notifications enabled) → $CODEX_CONFIG"
  else
    echo "  [success] Codex CLI already configured"
  fi
fi

# ── 5. Gemini CLI native AfterAgent hook ────────────────────────────────────
if command -v gemini > /dev/null 2>&1; then
  GEMINI_SETTINGS="$HOME/.gemini/settings.json"
  mkdir -p "$HOME/.gemini"
  [ -f "$GEMINI_SETTINGS" ] || echo '{}' > "$GEMINI_SETTINGS"

  python3 - "$GEMINI_SETTINGS" << 'PYEOF'
import json, sys

path = sys.argv[1]
try:
    with open(path) as f:
        cfg = json.load(f)
except (ValueError, IOError):
    cfg = {}

hooks = cfg.setdefault("hooks", {})
cmd = "mobile-notify --type=stop --tool=gemini"
old_cmd = "mobile-notify '{\"type\":\"stop\",\"tool\":\"gemini\"}'"
entries = hooks.setdefault("AfterAgent", [])
# Migrate old JSON-format command
entries[:] = [e for e in entries if e.get("command", "") != old_cmd]
already = any(e.get("command", "") == cmd for e in entries)
if not already:
    entries.append({"command": cmd})

with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
PYEOF
  echo "  [success] Gemini CLI AfterAgent hook configured → $GEMINI_SETTINGS"
fi

# ── 6. OpenCode plugin ────────────────────────────────────────────────────────
if command -v opencode > /dev/null 2>&1; then
  OPENCODE_PLUGIN_DIR="$HOME/.config/opencode/plugins"
  mkdir -p "$OPENCODE_PLUGIN_DIR"
  cat > "$OPENCODE_PLUGIN_DIR/mobile-terminal.js" << 'EOF'
export const MobileTerminal = async ({ $ }) => {
  return {
    // Fires when the agent finishes a task and becomes idle
    "session.idle": async () => {
      await $`mobile-notify --type=stop --tool=opencode`
    },
    // Fires when the agent asks for user permission
    "permission.asked": async () => {
      await $`mobile-notify --type=notify --tool=opencode`
    },
    "command.executed": async ({ command }) => {
      await $`mobile-notify --type=notify --tool=opencode --command="${command}"`
  }
}
EOF
  echo "  [success] OpenCode plugin installed → $OPENCODE_PLUGIN_DIR/mobile-terminal.js"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "Done. Restart your shell or run:"
echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
echo ""
echo "Available integrations:"
if command -v claude > /dev/null 2>&1; then
  echo "  claude          — hooks configured, use as normal"
else
  echo "  claude          — not detected (install Claude Code to enable)"
fi
if command -v codex > /dev/null 2>&1; then
  echo "  codex           — OSC notifications enabled, use as normal"
else
  echo "  codex           — not detected (install Codex CLI to enable)"
fi
if command -v gemini > /dev/null 2>&1; then
  echo "  gemini          — AfterAgent hook configured, use as normal"
else
  echo "  gemini          — not detected (install Gemini CLI to enable)"
fi
if command -v opencode > /dev/null 2>&1; then
  echo "  opencode        — plugin installed, use as normal"
else
  echo "  opencode        — not detected (install OpenCode to enable)"
fi
