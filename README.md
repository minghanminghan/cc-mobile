# mobile-terminal

Access coding agents from any browser or phone through SSH. Additional hooks available for download for Claude Code, Codex CLI, Gemini CLI, Opencode that send a push notification you when coding agents finish their tasks.

---

## Features

### Coding Agent Hooks

After installing custom hooks, mobile-terminal will send a push notification whenever the coding agent finishes a task as an OSC escape sequence through the existing SSH connection. When the agent sends a notification can be customized in settings.

<!-- TODO: figure out notification frequency (maybe add as settings)
When a task completes, a green **Task complete · claude** banner appears at the top of the terminal and auto-dismisses after five seconds. Notifications (mid-task pings) appear as a blue bell banner.
-->

Supported coding agents:

- **Claude Code**
- **Codex CLI**
- **Gemini CLI**
- **OpenCode**

### Session Continuity and Multiplexing with tmux

By default, the relay module uses `tmux new-session -A -D` to attach to existing sessions. This can be modified in settings.

### Tailscale Integration

When both the relay host and the SSH target have Tailscale installed, you can connect via Tailscale IPs (100.x.x.x) without opening any ports to the internet. No configuration needed on the relay — the OS routes Tailscale addresses directly.

### Mobile-Optimized UX

- **Virtual control row** -- scrollable bar with ESC, TAB, CTRL, ALT, SHIFT, DEL, and arrow keys
- **Long-press context menu** -- triggers tmux pane operations (split horizontal/vertical, swap, zoom, kill)
- **Native mouse mode** -- drag tmux pane borders to resize

### Voice Input

Tap the mic button in the virtual keyboard row to dictate. Transcription runs on-device via the browser's Web Speech API, and the result appears in an editable preview overlay before sending to terminal.

### Connection Profiles

Secrets (passwords, private keys) are hashed and stored in `sessionStorage` and never persisted on the relay server.

---

## SSH Host Requirements

### Required

**WSL (Windows only)**
```powershell
wsl --install
wsl
```

**tmux**
```bash
sudo apt install tmux
```

### Recommended

**Tailscale (required on both host and client devices)**
```bash
# bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
tailscale ip -4     # gives your Tailnet IP for Tailscale SSH
```

```powershell
# powershell

```

## Quick Start

### Cloning Repo

```bash
git clone https://github.com/minghanminghan/mobile-terminal.git
```

### Docker

```bash
docker build -t mobile-terminal .
docker run -p 3001:3001 mobile-terminal   # runs at localhost:3001
```

### Development

```bash
npm install
npm run dev -w web         # Vite dev server on :5173 with HMR
npm run dev -w relay       # relay on :3001 with ts watch
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Terminal | xterm.js (fit + web-links addons) |
| Relay | Node.js 22, Express, `ws`, `ssh2` |
| Mobile | React Native, Expo, WebView, expo-secure-store |
| Networking | Tailscale (optional), SOCKS5 proxy support |
| Deployment | Docker (Alpine Linux, Node.js 22) |
