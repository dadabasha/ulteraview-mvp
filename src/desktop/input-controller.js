const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

let helperProcess;
let helperReady = false;
let helperQueue = [];

function helperScriptPath() {
  const sourcePath = path.join(__dirname, 'native-input-helper.ps1');
  const script = fs.readFileSync(sourcePath, 'utf8');
  const targetPath = path.join(os.tmpdir(), 'ulteraview-native-input-helper.ps1');
  fs.writeFileSync(targetPath, script, 'utf8');
  return targetPath;
}

function startHelper() {
  if (helperProcess && !helperProcess.killed) return;

  const scriptPath = helperScriptPath();
  helperReady = false;
  helperProcess = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }
  );

  helperProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    if (text.includes('READY')) {
      helperReady = true;
      for (const payload of helperQueue.splice(0)) {
        writeInput(payload);
      }
    }
  });

  helperProcess.stderr.on('data', (chunk) => {
    console.error('[native-input-helper]', chunk.toString());
  });

  helperProcess.on('exit', () => {
    helperProcess = null;
    helperReady = false;
    helperQueue = [];
  });
}

function writeInput(payload) {
  if (!helperProcess || helperProcess.killed || !helperProcess.stdin.writable) return;
  helperProcess.stdin.write(`${JSON.stringify(payload)}\n`);
}

function handleInput(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, message: 'Invalid input payload.' };
  }

  startHelper();

  if (!helperReady) {
    helperQueue.push(payload);
    return { ok: true, queued: true };
  }

  writeInput(payload);
  return { ok: true };
}

module.exports = { handleInput };
