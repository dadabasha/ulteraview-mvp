function handleInput(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Invalid input payload.' };
  }

  // Production implementation point:
  // Replace this with a signed native Windows helper or trusted native module.
  // The rest of the app already enforces consent before events reach this layer.
  console.log('[remote-input]', payload);
  return { ok: true, simulated: true };
}

module.exports = { handleInput };
