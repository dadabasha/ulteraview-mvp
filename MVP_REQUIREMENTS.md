# Ultraview Windows MVP Requirements

## Goal

Build a Windows desktop remote support MVP that lets one user share their screen and optionally grant remote mouse/keyboard control to another user through a secure, consent-based session.

## MVP Scope

The first build should support:

- Windows host desktop app
- Windows helper/viewer desktop app, or a shared app with host/viewer modes
- Session code generation
- Session join by code
- Host consent prompt before viewing starts
- Host consent prompt before remote control starts
- WebRTC screen streaming
- WebSocket signaling
- Remote mouse and keyboard input
- End-session control for both users
- Basic audit logging

## User Roles

### Host

The host is the user whose desktop is being viewed or controlled.

Host requirements:

- Start a support session
- See a generated session code
- Approve or reject a viewer connection
- Grant or revoke remote control
- See clear "screen is being shared" status
- End the session immediately

### Helper

The helper is the remote user joining the host's session.

Helper requirements:

- Enter a session code
- Wait for host approval
- View the host screen after approval
- Request remote control
- Send mouse and keyboard events after control is approved
- End the session

## Core User Flows

### Start Session

1. Host opens the desktop app.
2. Host clicks "Start session".
3. App creates a session through the backend.
4. Backend returns a short session code.
5. Host shares the code with the helper.

### Join Session

1. Helper opens the app.
2. Helper enters the session code.
3. Backend validates the session.
4. Host receives a consent prompt.
5. If approved, WebRTC negotiation begins.
6. Helper sees the host screen.

### Request Control

1. Helper clicks "Request control".
2. Host receives a control permission prompt.
3. If approved, helper can send mouse and keyboard input.
4. Host can revoke control at any time.

### End Session

1. Either user clicks "End session".
2. WebRTC connection closes.
3. Backend marks the session ended.
4. Audit log stores session start/end times.

## Functional Requirements

### Desktop Client

- Capture the host screen.
- Stream screen frames through WebRTC.
- Handle WebRTC offer/answer and ICE candidate exchange.
- Send helper mouse and keyboard events to the host.
- Inject approved input events on the host machine.
- Show clear status for disconnected, waiting, connected, sharing, and controlled states.
- Display permission prompts before viewing/control begins.
- Prevent remote input unless the host explicitly grants control.

### Backend

- Create support sessions.
- Generate short, unique, expiring session codes.
- Validate join attempts.
- Manage session state.
- Relay WebRTC signaling messages over WebSocket.
- Store basic audit logs.
- Expire unused sessions.

### Signaling

- Use WebSocket for real-time signaling.
- Support message types:
  - `session.created`
  - `session.join.requested`
  - `session.join.approved`
  - `session.join.rejected`
  - `webrtc.offer`
  - `webrtc.answer`
  - `webrtc.ice_candidate`
  - `control.requested`
  - `control.approved`
  - `control.revoked`
  - `session.ended`

### WebRTC

- Use encrypted WebRTC media/data channels.
- Use STUN for direct connection discovery.
- Use TURN relay fallback for difficult networks.
- Use a WebRTC data channel for input/control messages.

## Security Requirements

- Session codes must expire.
- Session codes must not grant control automatically.
- Host must approve viewing.
- Host must separately approve remote control.
- Host must be able to revoke control instantly.
- Backend must rate-limit join attempts.
- WebSocket connections must use TLS in production.
- Desktop releases should be code-signed before public distribution.
- Audit logs should include session creation, join approval/rejection, control approval/revocation, and session end.

## Suggested Technical Stack

### Recommended MVP Stack

- Desktop: Electron
- Desktop language: TypeScript
- Native input/screen modules: Node native modules or a companion native helper
- Backend: Node.js with Fastify or Express
- Signaling: WebSocket
- Database: PostgreSQL
- Cache/session expiry: Redis
- WebRTC: Electron Chromium WebRTC APIs
- TURN/STUN: coturn

### Alternative Stack

- Desktop: .NET WPF or WinUI
- Backend: ASP.NET Core
- WebRTC: native WebRTC library
- Input injection: Windows APIs

Electron is faster for the first MVP because WebRTC and screen capture are already available through Chromium. A native helper may still be needed for reliable keyboard/mouse injection on Windows.

## Data Model

### User

- `id`
- `email`
- `display_name`
- `created_at`

### Session

- `id`
- `code`
- `host_user_id`
- `helper_user_id`
- `status`
- `control_granted`
- `created_at`
- `approved_at`
- `ended_at`
- `expires_at`

### Audit Log

- `id`
- `session_id`
- `actor_user_id`
- `event_type`
- `metadata`
- `created_at`

## MVP Milestones

### Milestone 1: Local Prototype

- Create desktop shell.
- Capture local screen.
- Show captured stream in another app window locally.
- Simulate session states without backend.

### Milestone 2: Signaling Server

- Add backend session creation.
- Add session code join flow.
- Add WebSocket signaling.
- Connect two desktop clients over WebRTC on the same network.

### Milestone 3: Consent and Control

- Add host approval prompt.
- Add control request prompt.
- Add WebRTC data channel for input events.
- Add Windows mouse/keyboard injection.

### Milestone 4: Reliability

- Add STUN/TURN configuration.
- Add reconnect handling.
- Add session expiry.
- Add basic audit logs.

### Milestone 5: Packaging

- Build Windows installer.
- Add auto-update plan.
- Add signing plan.
- Add production deployment checklist.

## Out of Scope for First MVP

- Mobile clients
- macOS/Linux clients
- File transfer
- Clipboard sharing
- Multi-monitor selection polish
- Admin dashboard
- Billing
- Team management
- Recording
- SSO
- Compliance certification

## Acceptance Criteria

- Host can start a session and receive a code.
- Helper can join by code.
- Host can approve or reject the helper.
- Helper can see the host screen after approval.
- Helper cannot control the host until separately approved.
- Helper can move mouse and type after control is approved.
- Host can revoke control immediately.
- Either user can end the session.
- Basic audit events are stored.
- Two Windows machines can connect across common home/office networks using STUN/TURN.
