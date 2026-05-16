const DEFAULT_SIGNALING_URL = 'ws://localhost:8787';
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

const state = {
  mode: 'host',
  role: null,
  ws: null,
  pc: null,
  dataChannel: null,
  localStream: null,
  remoteStream: null,
  controlGranted: false,
  pendingJoin: false,
  sourceId: null,
  signalingUrl: localStorage.getItem('signalingUrl') || DEFAULT_SIGNALING_URL,
  account: JSON.parse(localStorage.getItem('account') || 'null')
};

const els = {
  connectionStatus: document.querySelector('#connectionStatus'),
  accountStatus: document.querySelector('#accountStatus'),
  googleLoginButton: document.querySelector('#googleLoginButton'),
  hostModeButton: document.querySelector('#hostModeButton'),
  joinModeButton: document.querySelector('#joinModeButton'),
  hostPanel: document.querySelector('#hostPanel'),
  joinPanel: document.querySelector('#joinPanel'),
  signalingUrlInput: document.querySelector('#signalingUrlInput'),
  saveSignalingUrlButton: document.querySelector('#saveSignalingUrlButton'),
  startSessionButton: document.querySelector('#startSessionButton'),
  sessionCode: document.querySelector('#sessionCode'),
  sourceSelect: document.querySelector('#sourceSelect'),
  refreshSourcesButton: document.querySelector('#refreshSourcesButton'),
  joinCodeInput: document.querySelector('#joinCodeInput'),
  joinSessionButton: document.querySelector('#joinSessionButton'),
  requestControlButton: document.querySelector('#requestControlButton'),
  approveJoinButton: document.querySelector('#approveJoinButton'),
  rejectJoinButton: document.querySelector('#rejectJoinButton'),
  approveControlButton: document.querySelector('#approveControlButton'),
  revokeControlButton: document.querySelector('#revokeControlButton'),
  endSessionButton: document.querySelector('#endSessionButton'),
  remoteVideo: document.querySelector('#remoteVideo'),
  localPreview: document.querySelector('#localPreview'),
  emptyState: document.querySelector('#emptyState'),
  activityLog: document.querySelector('#activityLog'),
  chatMessages: document.querySelector('#chatMessages'),
  chatForm: document.querySelector('#chatForm'),
  chatInput: document.querySelector('#chatInput')
};

function log(message) {
  const item = document.createElement('li');
  item.textContent = `${new Date().toLocaleTimeString()} - ${message}`;
  els.activityLog.prepend(item);
}

function setStatus(message) {
  els.connectionStatus.textContent = message;
}

function renderAccount() {
  els.accountStatus.textContent = state.account?.name || state.account?.email || 'Not signed in';
  els.googleLoginButton.textContent = state.account ? 'Sign out' : 'Sign in with Google';
}

async function loadAuthSession() {
  const result = await window.ulteraview.getAuthSession();
  if (!result.ok || !result.session) {
    state.account = null;
    localStorage.removeItem('account');
    renderAccount();
    return;
  }
  setAccountFromSession(result.session);
}

function setAccountFromSession(session) {
  const user = session?.user;
  state.account = user ? {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
    avatarUrl: user.user_metadata?.avatar_url
  } : null;
  if (state.account) {
    localStorage.setItem('account', JSON.stringify(state.account));
    log(`Signed in as ${state.account.name}.`);
  } else {
    localStorage.removeItem('account');
  }
  renderAccount();
}

async function toggleGoogleAuth() {
  if (state.account) {
    const result = await window.ulteraview.signOut();
    if (!result.ok) {
      log(`Sign out failed: ${result.message}`);
      return;
    }
    state.account = null;
    localStorage.removeItem('account');
    renderAccount();
    log('Signed out.');
    return;
  }

  const result = await window.ulteraview.signInWithGoogle();
  if (!result.ok) {
    log(`Google sign-in failed: ${result.message}`);
    return;
  }
  log('Google sign-in opened in your browser.');
}

function setMode(mode) {
  state.mode = mode;
  els.hostModeButton.classList.toggle('active', mode === 'host');
  els.joinModeButton.classList.toggle('active', mode === 'join');
  els.hostPanel.classList.toggle('hidden', mode !== 'host');
  els.joinPanel.classList.toggle('hidden', mode !== 'join');
}

function send(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    log('Signaling server is not connected.');
    return;
  }
  state.ws.send(JSON.stringify({ type, ...payload }));
}

function normalizeSignalingUrl(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return DEFAULT_SIGNALING_URL;
  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) return trimmed;
  return `ws://${trimmed}`;
}

function saveSignalingUrl() {
  const nextUrl = normalizeSignalingUrl(els.signalingUrlInput.value);
  if (state.ws && state.ws.readyState <= WebSocket.OPEN && nextUrl !== state.signalingUrl) {
    state.ws.close();
  }
  state.signalingUrl = nextUrl;
  els.signalingUrlInput.value = nextUrl;
  localStorage.setItem('signalingUrl', nextUrl);
  log(`Using signaling URL ${nextUrl}.`);
}

function connectSignaling() {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) return Promise.resolve();
  if (state.ws && state.ws.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve, reject) => {
      state.ws.addEventListener('open', resolve, { once: true });
      state.ws.addEventListener('error', reject, { once: true });
    });
  }

  state.ws = new WebSocket(state.signalingUrl);
  const ready = new Promise((resolve, reject) => {
    state.ws.addEventListener('open', () => {
      setStatus('Connected to signaling');
      log('Connected to signaling server.');
      resolve();
    }, { once: true });
    state.ws.addEventListener('error', reject, { once: true });
  });
  state.ws.addEventListener('close', () => {
    setStatus('Disconnected');
    log('Signaling connection closed.');
  });
  state.ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    handleSignal(message);
  });
  return ready;
}

async function handleSignal(message) {
  switch (message.type) {
    case 'client.ready':
      break;
    case 'session.created':
      state.role = 'host';
      els.sessionCode.textContent = message.code;
      els.endSessionButton.disabled = false;
      setStatus('Waiting for helper');
      log(`Session created with code ${message.code}.`);
      break;
    case 'session.join.requested':
      state.pendingJoin = true;
      els.approveJoinButton.classList.remove('hidden');
      els.rejectJoinButton.classList.remove('hidden');
      log('Helper is requesting to view this screen.');
      break;
    case 'session.join.pending':
      state.role = 'helper';
      els.endSessionButton.disabled = false;
      setStatus('Waiting for host approval');
      log('Join request sent. Waiting for approval.');
      break;
    case 'session.join.approved':
      setStatus('Session approved');
      log('Session approved.');
      els.requestControlButton.disabled = state.role !== 'helper';
      if (state.role === 'host') await startHostPeer();
      if (state.role === 'helper') await startHelperPeer();
      break;
    case 'session.join.rejected':
      log(message.reason || 'Join request rejected.');
      setStatus('Join rejected');
      break;
    case 'control.requested':
      els.approveControlButton.classList.remove('hidden');
      log('Helper requested remote control.');
      break;
    case 'control.approved':
      state.controlGranted = true;
      els.revokeControlButton.disabled = state.role !== 'host';
      log('Remote control approved.');
      break;
    case 'control.revoked':
      state.controlGranted = false;
      els.revokeControlButton.disabled = true;
      log('Remote control revoked.');
      break;
    case 'chat.message':
      renderChatMessage(message);
      break;
    case 'webrtc.offer':
      await receiveOffer(message.payload);
      break;
    case 'webrtc.answer':
      await state.pc.setRemoteDescription(message.payload);
      log('WebRTC answer received.');
      break;
    case 'webrtc.ice_candidate':
      if (message.payload) await state.pc.addIceCandidate(message.payload);
      break;
    case 'session.ended':
      log(`Session ended: ${message.reason || 'ended'}.`);
      resetSession();
      break;
    case 'error':
      log(message.message || 'Server error.');
      break;
  }
}

function renderChatMessage(message) {
  const bubble = document.createElement('div');
  bubble.className = `chat-message ${message.senderRole === state.role ? 'mine' : 'theirs'}`;
  const label = document.createElement('span');
  label.textContent = message.senderRole === state.role ? 'You' : message.senderRole || 'Peer';
  const text = document.createElement('p');
  text.textContent = message.text;
  bubble.append(label, text);
  els.chatMessages.appendChild(bubble);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

async function loadSources() {
  const sources = await window.ulteraview.listSources();
  els.sourceSelect.innerHTML = '';
  for (const source of sources) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    els.sourceSelect.appendChild(option);
  }
  state.sourceId = sources[0]?.id || null;
  log(`Loaded ${sources.length} screen/window sources.`);
}

async function captureSelectedSource() {
  state.sourceId = els.sourceSelect.value || state.sourceId;
  if (!state.sourceId) throw new Error('No screen source selected.');

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: state.sourceId,
        maxFrameRate: 30
      }
    }
  });

  state.localStream = stream;
  els.localPreview.srcObject = stream;
  return stream;
}

function createPeerConnection() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = (event) => {
    if (event.candidate) send('webrtc.ice_candidate', { payload: event.candidate });
  };
  pc.onconnectionstatechange = () => {
    setStatus(`WebRTC ${pc.connectionState}`);
    log(`WebRTC state: ${pc.connectionState}.`);
  };
  pc.ontrack = (event) => {
    state.remoteStream = event.streams[0];
    els.remoteVideo.srcObject = state.remoteStream;
    els.emptyState.classList.add('hidden');
    log('Remote screen stream received.');
  };
  state.pc = pc;
  return pc;
}

async function startHostPeer() {
  const stream = await captureSelectedSource();
  const pc = createPeerConnection();
  for (const track of stream.getTracks()) pc.addTrack(track, stream);

  pc.ondatachannel = (event) => {
    state.dataChannel = event.channel;
    state.dataChannel.onmessage = async (message) => {
      if (!state.controlGranted) return;
      const payload = JSON.parse(message.data);
      await window.ulteraview.sendInput(payload);
    };
    log('Control data channel opened.');
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send('webrtc.offer', { payload: pc.localDescription });
  log('WebRTC offer sent.');
}

async function startHelperPeer() {
  const pc = createPeerConnection();
  state.dataChannel = pc.createDataChannel('control');
  state.dataChannel.onopen = () => log('Control data channel ready.');
}

async function receiveOffer(offer) {
  if (!state.pc) await startHelperPeer();
  await state.pc.setRemoteDescription(offer);
  const answer = await state.pc.createAnswer();
  await state.pc.setLocalDescription(answer);
  send('webrtc.answer', { payload: state.pc.localDescription });
  log('WebRTC answer sent.');
}

function sendControlEvent(payload) {
  if (!state.controlGranted || state.role !== 'helper') return;
  if (!state.dataChannel || state.dataChannel.readyState !== 'open') return;
  state.dataChannel.send(JSON.stringify(payload));
}

function resetSession() {
  if (state.localStream) {
    for (const track of state.localStream.getTracks()) track.stop();
  }
  if (state.pc) state.pc.close();
  state.pc = null;
  state.dataChannel = null;
  state.localStream = null;
  state.remoteStream = null;
  state.controlGranted = false;
  state.pendingJoin = false;
  els.remoteVideo.srcObject = null;
  els.localPreview.srcObject = null;
  els.emptyState.classList.remove('hidden');
  els.sessionCode.textContent = '------';
  els.endSessionButton.disabled = true;
  els.requestControlButton.disabled = true;
  els.revokeControlButton.disabled = true;
  els.approveJoinButton.classList.add('hidden');
  els.rejectJoinButton.classList.add('hidden');
  els.approveControlButton.classList.add('hidden');
  setStatus('Disconnected');
}

els.hostModeButton.addEventListener('click', () => setMode('host'));
els.joinModeButton.addEventListener('click', () => setMode('join'));
els.googleLoginButton.addEventListener('click', toggleGoogleAuth);
els.signalingUrlInput.value = state.signalingUrl;
els.saveSignalingUrlButton.addEventListener('click', saveSignalingUrl);
els.refreshSourcesButton.addEventListener('click', loadSources);
els.sourceSelect.addEventListener('change', () => {
  state.sourceId = els.sourceSelect.value;
});

els.startSessionButton.addEventListener('click', async () => {
  await connectSignaling();
  await loadSources();
  send('session.create');
});

els.joinSessionButton.addEventListener('click', async () => {
  await connectSignaling();
  send('session.join', { code: els.joinCodeInput.value });
});

els.approveJoinButton.addEventListener('click', () => {
  els.approveJoinButton.classList.add('hidden');
  els.rejectJoinButton.classList.add('hidden');
  send('session.join.approve');
});

els.rejectJoinButton.addEventListener('click', () => {
  els.approveJoinButton.classList.add('hidden');
  els.rejectJoinButton.classList.add('hidden');
  send('session.join.reject');
});

els.requestControlButton.addEventListener('click', () => send('control.request'));
els.approveControlButton.addEventListener('click', () => {
  els.approveControlButton.classList.add('hidden');
  send('control.approve');
});
els.revokeControlButton.addEventListener('click', () => send('control.revoke'));
els.endSessionButton.addEventListener('click', () => send('session.end'));

els.chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = els.chatInput.value.trim();
  if (!text) return;
  send('chat.message', { text });
  els.chatInput.value = '';
});

els.remoteVideo.addEventListener('mousemove', (event) => {
  const rect = els.remoteVideo.getBoundingClientRect();
  sendControlEvent({
    kind: 'mouse.move',
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height
  });
});

els.remoteVideo.addEventListener('mousedown', (event) => {
  sendControlEvent({ kind: 'mouse.down', button: event.button });
});

els.remoteVideo.addEventListener('mouseup', (event) => {
  sendControlEvent({ kind: 'mouse.up', button: event.button });
});

window.addEventListener('keydown', (event) => {
  sendControlEvent({ kind: 'key.down', key: event.key, code: event.code });
});

window.addEventListener('keyup', (event) => {
  sendControlEvent({ kind: 'key.up', key: event.key, code: event.code });
});

loadSources().catch((error) => log(error.message));
connectSignaling().catch((error) => log(`Signaling unavailable: ${error.message}`));
renderAccount();
loadAuthSession().catch((error) => log(`Auth unavailable: ${error.message}`));
window.ulteraview.onAuthSession((session) => setAccountFromSession(session));
