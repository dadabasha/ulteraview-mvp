# Production Deployment

This MVP can be tested across systems by hosting one public signaling server and pointing every desktop client to it.

## What You Need

- A VPS or cloud VM with a public IP.
- A domain or subdomain, for example `signaling.example.com`.
- Open inbound ports:
  - `80` and `443` for HTTPS/WSS
  - `8787` only if testing without Nginx/TLS
  - `3478/tcp` and `3478/udp` for TURN
  - a UDP relay range such as `49160-49200/udp`
- TLS certificate, usually from Let's Encrypt.

## Deploy The Signaling Server

Copy the project to the server, then run:

```bash
cd deploy
cp ../.env.production.example .env
docker compose --env-file .env up -d --build
```

Health check:

```bash
curl http://SERVER_IP:8787/health
```

## Deploy On Render

Render can deploy this repo from the included `Dockerfile` or from `render.yaml`.

1. Push this project to GitHub.
2. Open Render.
3. Click **New > Blueprint**.
4. Select the GitHub repository.
5. Render will detect `render.yaml`.
6. Deploy the `ulteraview-signaling` web service.
7. After deployment, open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/health
```

8. In the Windows app, set **Signaling URL** to:

```text
wss://YOUR-RENDER-SERVICE.onrender.com
```

Render assigns the actual public URL after deployment.

## Add TLS / WSS

Put Nginx in front of the signaling server and proxy WebSocket traffic to `127.0.0.1:8787`.

The starter config is in:

```text
deploy/nginx.conf
```

After TLS is active, the desktop app should use:

```text
wss://signaling.example.com
```

For quick private testing without TLS, use:

```text
ws://SERVER_IP:8787
```

## Desktop Client Setup

Open the app and set **Signaling URL** to the public server:

```text
wss://signaling.example.com
```

Then click **Use Signaling URL**.

Both the host computer and helper computer must use the same signaling URL.

## TURN Setup

The included `docker-compose.yml` runs coturn. Production WebRTC across different networks often needs TURN, especially behind strict NATs or corporate firewalls.

The current desktop app has a public STUN server configured. For production, replace `ICE_SERVERS` in `src/desktop/renderer/app.js` with your TURN details:

```js
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  {
    urls: 'turn:YOUR_DOMAIN:3478',
    username: 'TURN_USER',
    credential: 'TURN_PASSWORD'
  }
];
```

## Production Gaps Before Real Customers

- Add real Google authentication. See `PRODUCTION_AUTH.md`.
- Store audit logs in PostgreSQL.
- Rate-limit session code attempts per IP.
- Add signed Windows input helper for real keyboard/mouse injection.
- Code-sign the Windows executable.
- Add crash reporting and update delivery.
- Add proper TURN credentials, preferably time-limited credentials.
- Add privacy/legal consent screens.
