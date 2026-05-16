const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ulteraview', {
  listSources: () => ipcRenderer.invoke('sources:list'),
  sendInput: (payload) => ipcRenderer.invoke('input:event', payload),
  signInWithGoogle: () => ipcRenderer.invoke('auth:google'),
  getAuthSession: () => ipcRenderer.invoke('auth:session'),
  signOut: () => ipcRenderer.invoke('auth:logout'),
  onAuthSession: (callback) => {
    ipcRenderer.on('auth:session', (_event, session) => callback(session));
  }
});
