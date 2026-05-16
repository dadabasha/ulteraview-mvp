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

## Important MVP Note

The app includes the full consent, WebRTC, signaling, and control-message path. The actual Windows keyboard/mouse injection is isolated in `src/desktop/input-controller.js`. It currently logs incoming control events and is ready to be replaced by a native Windows input implementation such as a signed helper executable or a native Node module.

That separation is intentional: real remote input injection on Windows should be implemented carefully, signed, permissioned, and tested outside the renderer process.

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
