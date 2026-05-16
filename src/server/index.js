const http = require('node:http');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = Number(process.env.PORT || 8787);
const DEFAULT_HOST = process.env.HOST || '0.0.0.0';
const SESSION_TTL_MS = 15 * 60 * 1000;

function createSignalingServer() {
  const sessions = new Map();
  const clients = new Map();

  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
      return;
    }

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Ultraview signaling server is running.\n');
  });

  const wss = new WebSocketServer({ server });

  function makeId() {
    return crypto.randomUUID();
  }

  function makeCode() {
    let code = '';
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
    } while ([...sessions.values()].some((session) => session.code === code));
    return code;
  }

  function send(ws, type, payload = {}) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type, ...payload }));
    }
  }

  function sendTo(clientId, type, payload = {}) {
    const client = clients.get(clientId);
    if (client) send(client.ws, type, payload);
  }

  function findSessionByCode(code) {
    for (const session of sessions.values()) {
      if (session.code === code) return session;
    }
    return null;
  }

  function audit(session, eventType, metadata = {}) {
    session.audit.push({
      id: makeId(),
      eventType,
      metadata,
      createdAt: new Date().toISOString()
    });
    console.log(`[audit] ${session.code} ${eventType}`, metadata);
  }

  function endSession(session, reason = 'ended') {
    session.status = 'ended';
    session.endedAt = new Date().toISOString();
    audit(session, 'session.ended', { reason });
    if (session.hostClientId) sendTo(session.hostClientId, 'session.ended', { reason });
    if (session.helperClientId) sendTo(session.helperClientId, 'session.ended', { reason });
  }

  setInterval(() => {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.status !== 'ended' && session.expiresAt <= now) {
        endSession(session, 'expired');
      }
      if (session.status === 'ended' && session.endedAt && Date.parse(session.endedAt) + 60_000 < now) {
        sessions.delete(id);
      }
    }
  }, 15_000);

  wss.on('connection', (ws) => {
    const clientId = makeId();
    clients.set(clientId, { ws, sessionId: null, role: null });
    send(ws, 'client.ready', { clientId });

    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        send(ws, 'error', { message: 'Invalid JSON message.' });
        return;
      }

      const client = clients.get(clientId);

      if (message.type === 'session.create') {
        const id = makeId();
        const code = makeCode();
        const session = {
          id,
          code,
          hostClientId: clientId,
          helperClientId: null,
          status: 'waiting',
          controlGranted: false,
          createdAt: new Date().toISOString(),
          approvedAt: null,
          endedAt: null,
          expiresAt: Date.now() + SESSION_TTL_MS,
          audit: []
        };
        sessions.set(id, session);
        client.sessionId = id;
        client.role = 'host';
        audit(session, 'session.created', { hostClientId: clientId });
        send(ws, 'session.created', { sessionId: id, code, expiresAt: session.expiresAt });
        return;
      }

      if (message.type === 'session.join') {
        const code = String(message.code || '').trim();
        const session = findSessionByCode(code);
        if (!session || session.status !== 'waiting') {
          send(ws, 'session.join.rejected', { reason: 'Session not found or no longer joinable.' });
          return;
        }
        session.helperClientId = clientId;
        client.sessionId = session.id;
        client.role = 'helper';
        audit(session, 'session.join.requested', { helperClientId: clientId });
        send(ws, 'session.join.pending', { sessionId: session.id, code });
        sendTo(session.hostClientId, 'session.join.requested', { helperClientId: clientId });
        return;
      }

      const session = client?.sessionId ? sessions.get(client.sessionId) : null;
      if (!session) {
        send(ws, 'error', { message: 'No active session.' });
        return;
      }

      if (message.type === 'session.join.approve') {
        if (client.role !== 'host') return;
        session.status = 'connected';
        session.approvedAt = new Date().toISOString();
        audit(session, 'session.join.approved', { helperClientId: session.helperClientId });
        sendTo(session.helperClientId, 'session.join.approved', { sessionId: session.id });
        sendTo(session.hostClientId, 'session.join.approved', { sessionId: session.id });
        return;
      }

      if (message.type === 'session.join.reject') {
        if (client.role !== 'host') return;
        audit(session, 'session.join.rejected', { helperClientId: session.helperClientId });
        sendTo(session.helperClientId, 'session.join.rejected', { reason: 'Host rejected the connection.' });
        session.helperClientId = null;
        return;
      }

      if (message.type === 'control.request') {
        if (client.role !== 'helper') return;
        audit(session, 'control.requested', {});
        sendTo(session.hostClientId, 'control.requested', {});
        return;
      }

      if (message.type === 'control.approve') {
        if (client.role !== 'host') return;
        session.controlGranted = true;
        audit(session, 'control.approved', {});
        sendTo(session.helperClientId, 'control.approved', {});
        sendTo(session.hostClientId, 'control.approved', {});
        return;
      }

      if (message.type === 'control.revoke') {
        if (client.role !== 'host') return;
        session.controlGranted = false;
        audit(session, 'control.revoked', {});
        sendTo(session.helperClientId, 'control.revoked', {});
        sendTo(session.hostClientId, 'control.revoked', {});
        return;
      }

      if (message.type === 'chat.message') {
        const text = String(message.text || '').trim().slice(0, 1000);
        if (!text) return;
        const chatMessage = {
          id: makeId(),
          senderRole: client.role,
          text,
          createdAt: new Date().toISOString()
        };
        audit(session, 'chat.message', { senderRole: client.role });
        sendTo(session.hostClientId, 'chat.message', chatMessage);
        sendTo(session.helperClientId, 'chat.message', chatMessage);
        return;
      }

      if (message.type === 'session.end') {
        endSession(session, 'user_ended');
        return;
      }

      if (message.type?.startsWith('webrtc.')) {
        const target = client.role === 'host' ? session.helperClientId : session.hostClientId;
        sendTo(target, message.type, { payload: message.payload });
      }
    });

    ws.on('close', () => {
      const client = clients.get(clientId);
      if (client?.sessionId) {
        const session = sessions.get(client.sessionId);
        if (session && session.status !== 'ended') {
          endSession(session, `${client.role}_disconnected`);
        }
      }
      clients.delete(clientId);
    });
  });

  return server;
}

function startSignalingServer(port = DEFAULT_PORT, host = DEFAULT_HOST) {
  const server = createSignalingServer();
  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve({ server: null, port, host, reused: true });
        return;
      }
      reject(error);
    });
    server.listen(port, host, () => {
      console.log(`Ultraview signaling server listening on http://${host}:${port}`);
      resolve({ server, port, host, reused: false });
    });
  });
}

if (require.main === module) {
  startSignalingServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { createSignalingServer, startSignalingServer };
