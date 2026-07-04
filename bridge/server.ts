/**
 * github-differ local-agent bridge.
 *
 * A tiny localhost HTTP server exposing an OpenAI-compatible
 * `POST /v1/chat/completions` that answers by running a headless CLI agent —
 * Claude Code (`claude -p`) or Codex (`codex exec`) — so the extension can use
 * your existing agent login instead of a browser-held API key.
 *
 * Run:  bun bridge/server.ts          (or: make bridge)
 * Env:  PORT (default 8765), BRIDGE_TOKEN (optional bearer auth),
 *       AGENT_TIMEOUT_MS (default 240000),
 *       BRIDGE_VERBOSE=1 (dump prompts and raw agent output, truncated)
 *
 * In the extension options pick provider "Local agent", agent claude/codex.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { composePrompt, commandFor, extractGroupingJson } from './agent';

const PORT = Number(process.env.PORT ?? 8765);
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 240_000);
const VERBOSE = process.env.BRIDGE_VERBOSE === '1';

let nextRequestId = 1;

function ts(): string {
  return new Date().toTimeString().slice(0, 8);
}

function log(tag: string, message: string): void {
  console.log(`[${ts()}] [${tag}] ${message}`);
}

function truncate(text: string, max = 2000): string {
  return text.length <= max ? text : `${text.slice(0, max)}… (+${text.length - max} chars)`;
}

/** Startup probe: which agent CLIs are actually on PATH? */
function probeAgent(bin: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', (d: Buffer) => (out += d));
    proc.on('error', () => resolve(`${bin}: NOT FOUND on PATH`));
    proc.on('close', (code) =>
      resolve(
        code === 0
          ? `${bin}: ${out.trim().split('\n')[0]}`
          : `${bin}: found but --version exited ${code}`,
      ),
    );
  });
}

function runAgent(tag: string, model: string, prompt: string): Promise<string> {
  const { argv, stdin } = commandFor(model, prompt);
  // Never log the prompt as part of argv (codex receives it as an argument).
  log(tag, `spawning: ${argv.slice(0, 3).join(' ')} (prompt via ${stdin === undefined ? 'argv' : 'stdin'})`);
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const proc = spawn(argv[0]!, argv.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    log(tag, `agent pid ${proc.pid ?? '?'}, timeout ${TIMEOUT_MS}ms`);
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`${argv[0]} timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    proc.stdout.on('data', (d: Buffer) => (out += d));
    proc.stderr.on('data', (d: Buffer) => (err += d));
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(
        new Error(
          `could not start "${argv[0]}" — is the CLI installed and on PATH? (${e.message})`,
        ),
      );
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - startedAt;
      log(
        tag,
        `agent exited ${code} after ${elapsed}ms — stdout ${out.length} chars, stderr ${err.length} chars`,
      );
      if (err.trim() && (VERBOSE || code !== 0)) {
        log(tag, `stderr: ${truncate(err.trim(), 800)}`);
      }
      if (VERBOSE) log(tag, `stdout: ${truncate(out.trim())}`);
      if (code === 0) resolve(out);
      else reject(new Error(`${argv[0]} exited ${code}: ${err.slice(0, 500)}`));
    });
    if (stdin !== undefined) proc.stdin.write(stdin);
    proc.stdin.end();
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(payload));
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }
  if (req.method === 'GET' && req.url === '/healthz') {
    log('healthz', 'ok');
    send(res, 200, { ok: true, agents: ['claude', 'codex'] });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    log('http', `404 ${req.method} ${req.url}`);
    send(res, 404, { error: { message: 'not found' } });
    return;
  }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    log('auth', `401 — bearer token mismatch from ${req.socket.remoteAddress}`);
    send(res, 401, { error: { message: 'unauthorized' } });
    return;
  }

  const tag = `req#${nextRequestId++}`;
  const started = Date.now();
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const model = body.model || 'claude';
    const messages = body.messages ?? [];
    const prompt = composePrompt(messages);
    log(
      tag,
      `model=${model}, ${messages.length} messages, prompt ${prompt.length} chars, body ${raw.length} bytes`,
    );
    if (VERBOSE) log(tag, `prompt head: ${truncate(prompt, 400)}`);

    const stdout = await runAgent(tag, model, prompt);
    const content = extractGroupingJson(stdout);
    const groups = (JSON.parse(content) as { groups?: unknown[] }).groups;
    log(
      tag,
      `extracted grouping JSON: ${content.length} chars, ${Array.isArray(groups) ? groups.length : '?'} groups — total ${Date.now() - started}ms`,
    );
    send(res, 200, { choices: [{ message: { role: 'assistant', content } }] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(tag, `ERROR after ${Date.now() - started}ms: ${message}`);
    send(res, 500, { error: { message } });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  log('bridge', `listening on http://127.0.0.1:${PORT} (POST /v1/chat/completions)`);
  log(
    'bridge',
    `config: timeout ${TIMEOUT_MS}ms, verbose ${VERBOSE ? 'on' : 'off'}, auth ${TOKEN ? 'bearer token required' : 'OFF — any local process may call this server'}`,
  );
  for (const bin of ['claude', 'codex']) {
    log('bridge', await probeAgent(bin));
  }
});
