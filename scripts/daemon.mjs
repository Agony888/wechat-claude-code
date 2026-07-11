import { existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = process.env.WECHAT_CODEX_DATA_DIR || process.env.WCC_DATA_DIR || join(homedir(), '.wechat-codex');
const LOG_DIR = join(DATA_DIR, 'logs');
const PID_FILE = join(DATA_DIR, 'wechat-codex.pid');
const ENTRY = join(PROJECT_DIR, 'dist', 'main.js');

function readPid() {
  if (!existsSync(PID_FILE)) return undefined;
  const pid = Number.parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  return Number.isFinite(pid) && pid > 0 ? pid : undefined;
}

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function start() {
  const existing = readPid();
  if (isRunning(existing)) {
    console.log(`Already running (PID: ${existing})`);
    return;
  }
  if (!existsSync(ENTRY)) throw new Error(`Build output not found: ${ENTRY}. Run npm install first.`);
  mkdirSync(LOG_DIR, { recursive: true });
  const stdout = openSync(join(LOG_DIR, 'stdout.log'), 'a');
  const stderr = openSync(join(LOG_DIR, 'stderr.log'), 'a');
  const child = spawn(process.execPath, [ENTRY, 'start'], {
    cwd: PROJECT_DIR,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', stdout, stderr],
    env: { ...process.env },
  });
  child.unref();
  writeFileSync(PID_FILE, `${child.pid}\n`, 'utf8');
  console.log(`Started WeChat Codex bridge (PID: ${child.pid})`);
  console.log(`Logs: ${LOG_DIR}`);
}

function stop() {
  const pid = readPid();
  if (!pid || !isRunning(pid)) {
    rmSync(PID_FILE, { force: true });
    console.log('Not running');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { process.kill(pid, 'SIGTERM'); }
  }
  rmSync(PID_FILE, { force: true });
  console.log(`Stopped (PID: ${pid})`);
}

function status() {
  const pid = readPid();
  if (isRunning(pid)) console.log(`Running (PID: ${pid})`);
  else console.log('Not running');
}

function tail(path, count = 100) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  console.log(`=== ${path} ===`);
  console.log(lines.slice(-count).join('\n'));
}

function logs() {
  if (!existsSync(LOG_DIR)) {
    console.log('No logs found');
    return;
  }
  const bridgeLogs = readdirSync(LOG_DIR)
    .filter((name) => /^bridge-.*\.log$/.test(name))
    .map((name) => join(LOG_DIR, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (bridgeLogs[0]) tail(bridgeLogs[0]);
  tail(join(LOG_DIR, 'stderr.log'), 50);
  tail(join(LOG_DIR, 'stdout.log'), 50);
}

const command = process.argv[2];
switch (command) {
  case 'start': start(); break;
  case 'stop': stop(); break;
  case 'restart':
    stop();
    await new Promise((resolve) => setTimeout(resolve, 750));
    start();
    break;
  case 'status': status(); break;
  case 'logs': logs(); break;
  default:
    console.error('Usage: node scripts/daemon.mjs {start|stop|restart|status|logs}');
    process.exitCode = 1;
}
