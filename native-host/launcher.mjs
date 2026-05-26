import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8788';
const DEFAULT_AUTO_EXIT_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 20;
const DEFAULT_RETRY_DELAY_MS = 250;

const launcherDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(launcherDir, '..');
const defaultServerPath = resolve(repoRoot, 'local-service/server.mjs');

export function encodeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32LE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export function decodeNativeMessageBuffer(buffer) {
  if (buffer.length < 4) {
    throw new Error('Native message is missing the length header');
  }
  const length = buffer.readUInt32LE(0);
  if (buffer.length < length + 4) {
    throw new Error('Native message body is incomplete');
  }
  return JSON.parse(buffer.subarray(4, 4 + length).toString('utf8'));
}

export async function readNativeMessage(input = process.stdin) {
  const chunks = [];
  for await (const chunk of input) {
    chunks.push(chunk);
  }
  return decodeNativeMessageBuffer(Buffer.concat(chunks));
}

export function writeNativeMessage(message, output = process.stdout) {
  output.write(encodeNativeMessage(message));
}

export async function ensureLocalStoreRunning(options = {}) {
  const baseUrl = options.baseUrl || process.env.OPX_LOCAL_STORE_BASE || DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl || fetch;
  const spawnImpl = options.spawnImpl || spawn;
  const nodePath = options.nodePath || process.execPath;
  const serverPath = options.serverPath || defaultServerPath;
  const maxAttempts = Number(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryDelayMs = Number(options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  const autoExitMs = Number(options.autoExitMs ?? process.env.OPX_LOCAL_STORE_AUTO_EXIT_MS ?? DEFAULT_AUTO_EXIT_MS);
  const authToken = String(options.authToken || process.env.OPX_LOCAL_STORE_TOKEN || '');

  if (await isHealthy(baseUrl, fetchImpl)) {
    return { ok: true, started: false, message: '本地账号服务已在运行' };
  }

  const port = String(new URL(baseUrl).port || '8788');
  const child = spawnImpl(nodePath, [serverPath], {
    cwd: repoRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      OPX_LOCAL_STORE_PORT: port,
      OPX_LOCAL_STORE_AUTO_EXIT_MS: String(autoExitMs),
      ...(authToken ? { OPX_LOCAL_STORE_TOKEN: authToken } : {}),
    },
  });
  child.unref?.();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (await isHealthy(baseUrl, fetchImpl)) {
      return { ok: true, started: true, message: '本地账号服务已启动' };
    }
    await delay(retryDelayMs);
  }

  return { ok: false, started: true, message: '本地账号服务已尝试启动，但健康检查未通过' };
}

async function isHealthy(baseUrl, fetchImpl) {
  try {
    const response = await fetchImpl(`${baseUrl}/health`, { cache: 'no-store' });
    if (!response?.ok) {
      return false;
    }
    const payload = await response.json().catch(() => ({}));
    return payload?.ok === true;
  } catch {
    return false;
  }
}

function delay(ms) {
  if (!ms) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (process.argv.includes('--ensure-local-store-json')) {
    const response = await ensureLocalStoreRunning();
    process.stdout.write(JSON.stringify(response));
    process.exit(0);
    return;
  }

  let response;
  try {
    const message = await readNativeMessage();
    if (message?.command !== 'ensure-local-store') {
      response = { ok: false, message: 'Unsupported native host command' };
    } else {
      response = await ensureLocalStoreRunning({
        authToken: typeof message.token === 'string' ? message.token : '',
      });
    }
  } catch (error) {
    response = { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  writeNativeMessage(response);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
