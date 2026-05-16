# Ultraview Production Roadmap

## Target App

A Windows desktop remote support application with a simple mobile-style interface:

- Google account login
- Join session with code
- Entire-screen sharing
- Works over the internet
- Chat during session
- Consent-based remote control
- Production signaling server
- TURN relay for difficult networks
- Audit logging

## Implemented In This Workspace

- Electron Windows desktop app
- Session-code signaling server
- Host approval flow
- WebRTC screen sharing
- Remote-control event channel
- Chat messages over the signaling server
- Configurable signaling URL for live servers
- Docker production signaling server
- Docker Compose with coturn
- Nginx WebSocket proxy starter config
- Production deployment docs

## Still Needed For A Real Production Release

- Real Google OAuth backend using your Google Cloud credentials
- PostgreSQL database for users, sessions, and audit logs
- Redis for session expiry and rate limiting
- Signed native Windows keyboard/mouse helper. The current build has a PowerShell-based helper for MVP testing.
- Code signing certificate for the Windows app
- HTTPS/WSS domain deployment
- TURN credentials and public relay testing
- Installer and auto-update channel
- Abuse prevention and session-code brute-force protection

## Recommended Build Order

1. Deploy the signaling server to a VPS.
2. Add HTTPS/WSS with a real domain.
3. Configure TURN and update `ICE_SERVERS`.
4. Add Google OAuth backend.
5. Add PostgreSQL audit/session persistence.
6. Add signed native Windows remote-input helper.
7. Build and sign the Windows installer.
