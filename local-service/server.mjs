import http from 'node:http';
import { pathToFileURL } from 'node:url';

import { createStoreRepository } from './store.mjs';

const DEFAULT_PORT = 8788;
const HOST = '127.0.0.1';
const AUTH_HEADER = 'x-opx-local-store-token';

export function createLocalStoreServer(options = {}) {
  const repo = options.repo || createStoreRepository(options);
  const idleTimeoutMs = Number(options.idleTimeoutMs || 0);
  const authToken = String(options.authToken || options.env?.OPX_LOCAL_STORE_TOKEN || process.env.OPX_LOCAL_STORE_TOKEN || '');
  let idleTimer = null;

  const server = http.createServer(async (req, res) => {
    scheduleIdleClose();
    try {
      await routeRequest(req, res, repo, authToken);
    } catch (error) {
      sendJson(req, res, error instanceof HttpError ? error.statusCode : 500, {
        ok: false,
        message: safeErrorMessage(error),
      }, authToken);
    } finally {
      scheduleIdleClose();
    }
  });

  server.on('listening', scheduleIdleClose);
  server.on('close', clearIdleTimer);
  return server;

  function scheduleIdleClose() {
    if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
      return;
    }
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      if (server.listening) {
        server.close();
      }
    }, idleTimeoutMs);
    idleTimer.unref?.();
  }

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }
}

async function routeRequest(req, res, repo, authToken = '') {
  const url = new URL(req.url || '/', `http://${HOST}`);
  const method = req.method || 'GET';
  const path = decodeURIComponent(url.pathname);

  if (method === 'OPTIONS') {
    if (authToken && !isAllowedExtensionOrigin(req.headers.origin)) {
      sendJson(req, res, 403, { ok: false, message: 'Origin is not allowed' }, authToken);
      return;
    }
    sendJson(req, res, 204, {}, authToken);
    return;
  }

  if (method === 'GET' && path === '/health') {
    sendJson(req, res, 200, { ok: true, version: 1 }, authToken);
    return;
  }

  if (!isAuthorizedLocalStoreRequest(req, authToken)) {
    sendJson(req, res, 401, { ok: false, message: 'Local store token is required' }, authToken);
    return;
  }

  if (method === 'GET' && path === '/v1/store') {
    sendJson(req, res, 200, { ok: true, store: await repo.load() }, authToken);
    return;
  }

  if (method === 'PUT' && path === '/v1/store') {
    const body = await readJsonBody(req);
    sendJson(req, res, 200, { ok: true, store: await repo.save(body) }, authToken);
    return;
  }

  if (method === 'POST' && path === '/v1/import/accounts') {
    const body = await readJsonBody(req);
    if (!isAccountImportPayload(body)) {
      throw new HttpError(400, 'Account import payload must be an account array or { accounts: [...] }');
    }
    const result = await repo.importAccounts(body.accounts ?? body);
    sendJson(req, res, 200, { ok: true, ...result }, authToken);
    return;
  }

  if (method === 'POST' && path === '/v1/accounts/session') {
    const body = await readJsonBody(req);
    const store = await repo.upsertSessionAccount(body.account ?? body);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }

  const accountId = matchPath(path, /^\/v1\/accounts\/(.+)$/);
  if (accountId && method === 'PATCH') {
    const body = await readJsonBody(req);
    const result = await repo.patchAccount(accountId, body);
    sendJson(req, res, result.account ? 200 : 404, { ok: Boolean(result.account), ...result }, authToken);
    return;
  }
  if (accountId && method === 'DELETE') {
    const result = await repo.deleteAccount(accountId);
    sendJson(req, res, 200, { ok: true, ...result }, authToken);
    return;
  }

  if (method === 'POST' && path === '/v1/register-email-items') {
    const body = await readJsonBody(req);
    const store = await repo.upsertRegisterEmailItems(body.items ?? body);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }

  const emailItemId = matchPath(path, /^\/v1\/register-email-items\/(.+)$/);
  if (emailItemId && method === 'DELETE') {
    const store = await repo.deleteRegisterEmailItem(emailItemId);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }
  if (emailItemId && method === 'PATCH') {
    const body = await readJsonBody(req);
    const current = await repo.load();
    const existing = current.registerEmailItems.find((item) => item.id === emailItemId);
    const store = await repo.upsertRegisterEmailItems([{ ...existing, ...body, id: emailItemId }]);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }

  if (method === 'POST' && path === '/v1/sms-targets') {
    const body = await readJsonBody(req);
    const store = await repo.upsertSmsTargets(body.targets ?? body);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }

  const smsTargetId = matchPath(path, /^\/v1\/sms-targets\/(.+)$/);
  if (smsTargetId && method === 'DELETE') {
    const store = await repo.deleteSmsTarget(smsTargetId);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }

  if (method === 'PATCH' && path === '/v1/sms-relay') {
    const body = await readJsonBody(req);
    const store = await repo.patchSmsRelay(body);
    sendJson(req, res, 200, { ok: true, store }, authToken);
    return;
  }

  sendJson(req, res, 404, { ok: false, message: 'Not found' }, authToken);
}

async function readJsonBody(req) {
  if (!hasJsonContentType(req.headers['content-type'])) {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function isAuthorizedLocalStoreRequest(req, authToken) {
  if (!authToken) {
    return true;
  }
  return req.headers[AUTH_HEADER] === authToken;
}

function corsHeaders(req, authToken) {
  if (!authToken) {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }

  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (!isAllowedExtensionOrigin(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, ${AUTH_HEADER}`,
    Vary: 'Origin',
  };
}

function isAllowedExtensionOrigin(origin) {
  return typeof origin === 'string' && /^chrome-extension:\/\/[a-z]{32}\/?$/i.test(origin.replace(/\/$/, ''));
}

function sendJson(req, res, statusCode, payload, authToken = '') {
  res.writeHead(statusCode, {
    ...corsHeaders(req, authToken),
    'Content-Type': 'application/json; charset=utf-8',
  });
  if (statusCode === 204) {
    res.end();
    return;
  }
  res.end(`${JSON.stringify(payload)}\n`);
}

function hasJsonContentType(value) {
  return typeof value === 'string' && value.toLowerCase().includes('application/json');
}

function matchPath(path, regex) {
  const match = path.match(regex);
  return match?.[1] || '';
}

function isAccountImportPayload(value) {
  return Array.isArray(value) || Array.isArray(value?.accounts);
}

function safeErrorMessage(error) {
  if (error instanceof HttpError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Internal error';
}

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.OPX_LOCAL_STORE_PORT || DEFAULT_PORT);
  const idleTimeoutMs = Number(process.env.OPX_LOCAL_STORE_AUTO_EXIT_MS || 0);
  const server = createLocalStoreServer({ idleTimeoutMs });
  server.listen(port, HOST, () => {
    if (process.env.OPX_LOCAL_STORE_QUIET !== '1') {
      console.log(`[OPX] Local account service listening on http://${HOST}:${port}`);
    }
  });
}
