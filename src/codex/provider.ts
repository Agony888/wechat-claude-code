import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';

export interface QueryOptions {
  prompt: string;
  cwd: string;
  resume?: string;
  model?: string;
  systemPrompt?: string;
  images?: Array<{
    type: 'image';
    source: { type: 'base64'; media_type: string; data: string };
  }>;
  onText?: (text: string) => Promise<void> | void;
  onTurnEnd?: (stopReason: string) => Promise<void> | void;
  abortController?: AbortController;
}

export interface QueryResult {
  text: string;
  sessionId: string;
  error?: string;
}

const TEMP_DIR = join(tmpdir(), 'wechat-codex');
const PROJECT_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const BUNDLED_CODEX_JS = join(PROJECT_DIR, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

function saveImageTemp(images: NonNullable<QueryOptions['images']>): string[] {
  mkdirSync(TEMP_DIR, { recursive: true });
  return images.map((img) => {
    const ext = img.source.media_type.split('/')[1] || 'png';
    const filePath = join(TEMP_DIR, `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
    writeFileSync(filePath, Buffer.from(img.source.data, 'base64'));
    return filePath;
  });
}

function cleanupTempFiles(paths: string[]): void {
  for (const path of paths) {
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}

export interface StreamParserState {
  sessionId: string;
  textParts: string[];
  pendingAgentMessage?: string;
  errorMessage?: string;
}

export interface StreamParserCallbacks {
  onText?: (text: string) => void;
  onTurnEnd?: (stopReason: string) => void;
}

function emitPending(
  state: StreamParserState,
  callbacks: StreamParserCallbacks,
  stopReason: 'tool_use' | 'end_turn',
): void {
  const text = state.pendingAgentMessage;
  state.pendingAgentMessage = undefined;
  if (!text?.trim()) return;
  state.textParts.push(text);
  callbacks.onText?.(text);
  callbacks.onTurnEnd?.(stopReason);
}

/** Parse one Codex `exec --json` JSONL event. */
export function handleStreamLine(
  line: string,
  state: StreamParserState,
  callbacks: StreamParserCallbacks,
): void {
  if (!line.trim()) return;
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }

  switch (obj.type) {
    case 'thread.started':
      if (obj.thread_id) state.sessionId = String(obj.thread_id);
      break;
    case 'item.completed': {
      const item = obj.item;
      if (item?.type === 'agent_message' && typeof item.text === 'string' && item.text.trim()) {
        // Keep one message buffered. When another agent message arrives, the
        // previous one is known to be progress; the last one is finalized by
        // turn.completed as the user-facing answer.
        emitPending(state, callbacks, 'tool_use');
        state.pendingAgentMessage = item.text;
      }
      break;
    }
    case 'turn.completed':
      emitPending(state, callbacks, 'end_turn');
      break;
    case 'turn.failed':
      emitPending(state, callbacks, 'end_turn');
      state.errorMessage = obj.error?.message || obj.message || 'Codex turn failed.';
      break;
    case 'error':
      state.errorMessage = obj.message || obj.error?.message || 'Codex CLI reported an error.';
      break;
    default:
      break;
  }
}

export function finalizeStream(state: StreamParserState, callbacks: StreamParserCallbacks): void {
  emitPending(state, callbacks, 'end_turn');
}

function buildCodexCommand(options: QueryOptions, imagePaths: string[]): { command: string; args: string[] } {
  const cliArgs: string[] = options.resume
    ? ['exec', 'resume', options.resume]
    : ['exec'];

  cliArgs.push(
    '-c', 'approval_policy="never"',
    '-c', 'sandbox_mode="workspace-write"',
    '--json',
    '--skip-git-repo-check',
  );
  if (!options.resume) cliArgs.push('--sandbox', 'workspace-write', '--color', 'never');
  if (options.model) cliArgs.push('--model', options.model);
  for (const path of imagePaths) cliArgs.push('--image', path);
  cliArgs.push('-');

  if (process.env.WCC_CODEX_BIN) {
    return { command: process.env.WCC_CODEX_BIN, args: cliArgs };
  }
  if (!existsSync(BUNDLED_CODEX_JS)) {
    throw new Error(`Bundled Codex CLI not found: ${BUNDLED_CODEX_JS}. Run npm install in ${PROJECT_DIR}.`);
  }
  return { command: process.execPath, args: [BUNDLED_CODEX_JS, ...cliArgs] };
}

export async function codexQuery(options: QueryOptions): Promise<QueryResult> {
  const imagePaths = options.images?.length ? saveImageTemp(options.images) : [];
  let child: ChildProcess | undefined;
  let settled = false;
  const parserState: StreamParserState = { sessionId: '', textParts: [] };
  const callbacks: StreamParserCallbacks = {
    onText: options.onText,
    onTurnEnd: options.onTurnEnd,
  };

  let command: string;
  let args: string[];
  try {
    ({ command, args } = buildCodexCommand(options, imagePaths));
  } catch (err) {
    cleanupTempFiles(imagePaths);
    return { text: '', sessionId: '', error: err instanceof Error ? err.message : String(err) };
  }

  let fullPrompt = options.prompt;
  if (options.systemPrompt) {
    fullPrompt = `<system-guidance>\n${options.systemPrompt}\n</system-guidance>\n\n${fullPrompt}`;
  }

  logger.info('Starting Codex CLI query', {
    cwd: options.cwd,
    model: options.model,
    resume: !!options.resume,
    hasImages: imagePaths.length > 0,
  });

  return new Promise<QueryResult>((resolve) => {
    const finish = (result: QueryResult) => {
      if (settled) return;
      settled = true;
      cleanupTempFiles(imagePaths);
      resolve(result);
    };

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
        windowsHide: true,
      });
    } catch (err) {
      finish({ text: '', sessionId: '', error: `Failed to spawn Codex CLI: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }

    child.stdin!.write(fullPrompt);
    child.stdin!.end();

    const timeoutId = setTimeout(() => {
      logger.warn('Codex CLI query timed out, killing process');
      child!.kill('SIGTERM');
      finalizeStream(parserState, callbacks);
      const text = parserState.textParts.join('\n\n').trim();
      finish({ text, sessionId: parserState.sessionId, error: text ? undefined : 'Codex query timed out after 60 minutes' });
    }, 60 * 60 * 1000);

    const onAbort = () => {
      logger.info('Codex CLI query aborted');
      child!.kill('SIGTERM');
      finalizeStream(parserState, callbacks);
      finish({ text: parserState.textParts.join('\n\n').trim(), sessionId: parserState.sessionId });
    };
    options.abortController?.signal.addEventListener('abort', onAbort, { once: true });

    const stderrParts: string[] = [];
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (chunk: string) => stderrParts.push(chunk));

    const rl = createInterface({ input: child.stdout! });
    rl.on('line', (line) => handleStreamLine(line, parserState, callbacks));

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      options.abortController?.signal.removeEventListener('abort', onAbort);
      finalizeStream(parserState, callbacks);
      if (code !== 0 && code !== null && !parserState.errorMessage) {
        parserState.errorMessage = stderrParts.join('').trim() || `Codex exited with code ${code}`;
      }
      const text = parserState.textParts.join('\n\n').trim();
      if (!text && !parserState.errorMessage) parserState.errorMessage = 'Codex returned an empty response.';
      logger.info('Codex CLI query completed', {
        sessionId: parserState.sessionId,
        textLength: text.length,
        hasError: !!parserState.errorMessage,
      });
      finish({ text, sessionId: parserState.sessionId, error: parserState.errorMessage });
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      options.abortController?.signal.removeEventListener('abort', onAbort);
      finish({ text: '', sessionId: parserState.sessionId, error: `Failed to spawn Codex CLI: ${err.message}` });
    });
  });
}
