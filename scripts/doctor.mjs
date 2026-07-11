import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = process.env.WECHAT_CODEX_DATA_DIR || process.env.WCC_DATA_DIR || join(homedir(), '.wechat-codex');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

const major = Number.parseInt(process.versions.node.split('.')[0], 10);
add('Node.js >= 18', major >= 18, process.version);
add('package.json', existsSync(join(root, 'package.json')), join(root, 'package.json'));
add('dependencies', existsSync(join(root, 'node_modules')), 'npm install');
add('Codex CLI', existsSync(join(root, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')), 'bundled @openai/codex');
add('compiled bridge', existsSync(join(root, 'dist', 'main.js')), 'npm run build');

const accountsDir = join(dataDir, 'accounts');
let accountBound = false;
try {
  const { readdirSync } = await import('node:fs');
  accountBound = readdirSync(accountsDir).some((name) => name.endsWith('.json'));
} catch { /* not bound */ }
add('WeChat account', accountBound, accountBound ? 'bound' : 'run npm run setup');

const authPath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json');
add('Codex auth', existsSync(authPath) || !!process.env.CODEX_API_KEY, existsSync(authPath) ? 'saved login found' : (process.env.CODEX_API_KEY ? 'CODEX_API_KEY is set' : 'login required'));

const pidFile = join(dataDir, 'wechat-codex.pid');
let pid;
let running = false;
if (existsSync(pidFile)) {
  pid = Number.parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
  try { process.kill(pid, 0); running = true; } catch (err) { running = err?.code === 'EPERM'; }
}
add('daemon', running, running ? `PID ${pid}` : 'not running');

for (const check of checks) {
  console.log(`${check.ok ? '[OK]' : '[--]'} ${check.name}: ${check.detail}`);
}
console.log(`Data directory: ${dataDir}`);
