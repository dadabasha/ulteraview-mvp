# Ultraview MVP

A Windows-first remote support MVP with:

- Electron desktop client
- WebSocket signaling server
- Session code create/join flow
- Host approval before viewing
- Separate approval before remote control
- WebRTC screen sharing
- WebRTC data channel for remote input events
- Session end/revoke controls

## Run Locally

Install dependencies:

```powershell
npm install
```

Start the signaling server:

```powershell
npm run start:server
```

Open two desktop clients in separate terminals:

```powershell
npm run start:app
```

In one client, click **Host Session** and then **Start Session**. In the other client, click **Join Session**, enter the code, and connect.

## Remote Control Note

The app includes consent-gated Windows mouse/keyboard injection through `src/desktop/native-input-helper.ps1`, launched by `src/desktop/input-controller.js`.

Current support:

- Mouse move on the host primary screen
- Left, middle, and right mouse click
- Common keyboard keys, letters, digits, arrows, Enter, Tab, Backspace, Escape, Delete, Home, End, PageUp, and PageDown

Production recommendation: replace the PowerShell helper with a signed native Windows helper executable before public release.

## Production Checklist

- Deploy the signaling server with `Dockerfile` or `deploy/docker-compose.yml`.
- Point both desktop clients to the same public signaling URL, for example `wss://signaling.example.com`.
- See `PRODUCTION.md` for the live deployment steps.
- Add real Windows input injection helper.
- Add authentication.
- Store audit logs in PostgreSQL.
- Add Redis-backed session expiry.
- Deploy behind HTTPS/WSS.
- Configure STUN/TURN with coturn.
- Code-sign Windows builds.
- Add packaging and auto-update.
