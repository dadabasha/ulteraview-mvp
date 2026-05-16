const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { app, BrowserWindow, ipcMain, desktopCapturer, shell } = require('electron');
const inputController = require('./input-controller');
const { startSignalingServer } = require('../server');
const {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_AUTH_REDIRECT_URL
} = require('../shared/supabase-config');

let mainWindow;
const startupLog = path.join(app.getPath('userData'), 'startup.log');
let supabaseClientPromise;

function logStartup(message, error) {
  const line = `[${new Date().toISOString()}] ${message}${error ? ` ${error.stack || error.message || error}` : ''}\n`;
  try {
    fs.mkdirSync(path.dirname(startupLog), { recursive: true });
    fs.appendFileSync(startupLog, line);
  } catch {
    console.log(line);
  }
}

function createWindow() {
  logStartup('Creating main window');
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: '#101418',
    title: 'Ultraview MVP',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.webContents.on('did-finish-load', () => {
    logStartup('Renderer finished loading');
  });
  mainWindow.once('ready-to-show', () => {
    logStartup('Main window ready to show');
    mainWindow.show();
    mainWindow.focus();
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logStartup(`Renderer process gone: ${details.reason}`);
  });
}

async function getSupabase() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          flowType: 'implicit',
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storage: {
            getItem(key) {
              try {
                return fs.readFileSync(path.join(app.getPath('userData'), `${key}.json`), 'utf8');
              } catch {
                return null;
              }
            },
            setItem(key, value) {
              fs.mkdirSync(app.getPath('userData'), { recursive: true });
              fs.writeFileSync(path.join(app.getPath('userData'), `${key}.json`), value);
            },
            removeItem(key) {
              try {
                fs.unlinkSync(path.join(app.getPath('userData'), `${key}.json`));
              } catch {}
            }
          }
        }
      });
    });
  }
  return supabaseClientPromise;
}

async function handleAuthCallback(rawUrl) {
  const parsed = new URL(rawUrl);
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  if (!accessToken || !refreshToken) {
    logStartup('Auth callback missing tokens');
    return;
  }

  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });
  if (error) {
    logStartup('Failed to set Supabase session', error);
    return;
  }
  mainWindow?.webContents.send('auth:session', data.session);
}

function isSignalingServerRunning() {
  return new Promise((resolve) => {
    const request = http.get('http://localhost:8787/health', (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(500, () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.setAsDefaultProtocolClient('ulteraview');

app.on('second-instance', (_event, argv) => {
  const callbackUrl = argv.find((arg) => arg.startsWith('ulteraview://auth-callback'));
  if (callbackUrl) handleAuthCallback(callbackUrl);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  logStartup('Electron ready');
  createWindow();

  if (await isSignalingServerRunning()) {
    logStartup('Using existing signaling server on 8787');
    return;
  }

  startSignalingServer()
    .then((result) => {
      if (result.reused) {
        console.log(`Using existing signaling server on http://localhost:${result.port}`);
        logStartup(`Using existing signaling server on ${result.port}`);
      }
    })
    .catch((error) => {
      console.error('Failed to start signaling server:', error);
      logStartup('Failed to start signaling server', error);
    });
}).catch((error) => {
  logStartup('App startup failed', error);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('sources:list', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 480, height: 270 }
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

ipcMain.handle('input:event', async (_event, payload) => {
  return inputController.handleInput(payload);
});

ipcMain.handle('auth:google', async () => {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: SUPABASE_AUTH_REDIRECT_URL,
      skipBrowserRedirect: true
    }
  });
  if (error) return { ok: false, message: error.message };
  await shell.openExternal(data.url);
  return { ok: true };
});

ipcMain.handle('auth:session', async () => {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) return { ok: false, message: error.message };
  return { ok: true, session: data.session };
});

ipcMain.handle('auth:logout', async () => {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, message: error.message };
  return { ok: true };
});
