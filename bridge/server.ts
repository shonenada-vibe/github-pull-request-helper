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
 *       AGENT_TIMEOUT_MS (default 240000)
 *
 * In the extension options pick provider "Local agent", agent claude/codex.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { composePrompt, commandFor, extractGroupingJson } from './agent';

const PORT = Number(process.env.PORT ?? 8765);
const TOKEN = process.env.BRIDGE_TOKEN ?? '';
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_MS ?? 240_000);

function runAgent(model: string, prompt: string): Promise<string> {
  const { argv, stdin } = commandFor(model, prompt);
  return new Promise((resolve, reject) => {
    const proc = spawn(argv[0]!, argv.slice(1), {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
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
    send(res, 200, { ok: true, agents: ['claude', 'codex'] });
    return;
  }
  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    send(res, 404, { error: { message: 'not found' } });
    return;
  }
  if (TOKEN && req.headers.authorization !== `Bearer ${TOKEN}`) {
    send(res, 401, { error: { message: 'unauthorized' } });
    return;
  }

  try {
    const body = JSON.parse(await readBody(req)) as {
      model?: string;
      messages?: Array<{ role: string; content: string }>;
    };
    const model = body.model || 'claude';
    const prompt = composePrompt(body.messages ?? []);
    console.log(`[bridge] ${model}: analyzing (${prompt.length} chars)…`);
    const started = Date.now();
    const stdout = await runAgent(model, prompt);
    const content = extractGroupingJson(stdout);
    console.log(`[bridge] ${model}: done in ${Date.now() - started}ms`);
    send(res, 200, { choices: [{ message: { role: 'assistant', content } }] });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[bridge] error: ${message}`);
    send(res, 500, { error: { message } });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bridge] listening on http://127.0.0.1:${PORT} (v1/chat/completions)`);
  console.log(
    TOKEN
      ? '[bridge] bearer auth enabled'
      : '[bridge] no BRIDGE_TOKEN set — any local process may call this server',
  );
});
