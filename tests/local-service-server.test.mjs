import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createLocalStoreServer } from '../local-service/server.mjs';

async function withTestServer(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'opx-local-server-'));
  const server = createLocalStoreServer({ storeDir: dir });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
}

test('serves health and the normalized empty store', async () => {
  await withTestServer(async (baseUrl) => {
    const health = await requestJson(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { ok: true, version: 1 });

    const store = await requestJson(`${baseUrl}/v1/store`);
    assert.equal(store.status, 200);
    assert.equal(store.body.ok, true);
    assert.equal(store.body.store.version, 1);
    assert.deepEqual(store.body.store.accounts, []);
  });
});

test('protects store routes with a local extension token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opx-local-server-auth-'));
  const server = createLocalStoreServer({ storeDir: dir, authToken: 'test-token' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const rejected = await requestJson(`${baseUrl}/v1/store`, {
      headers: { Origin: 'https://example.com' },
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get('access-control-allow-origin'), null);

    const allowed = await requestJson(`${baseUrl}/v1/store`, {
      headers: {
        Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/',
        'X-OPX-Local-Store-Token': 'test-token',
      },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'chrome-extension://abcdefghijklmnopabcdefghijklmnop');
    assert.equal(allowed.body.ok, true);
    assert.equal(allowed.body.store.version, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('imports account JSON through the HTTP API', async () => {
  await withTestServer(async (baseUrl) => {
    const imported = await requestJson(`${baseUrl}/v1/import/accounts`, {
      method: 'POST',
      body: [
        {
          id_token: 'id.token',
          access_token: 'access.token',
          refresh_token: '',
          account_id: 'acct_123',
          email: 'user@example.com',
          expired: '2026-05-23T00:00:00.000Z',
        },
      ],
    });

    assert.equal(imported.status, 200);
    assert.equal(imported.body.ok, true);
    assert.equal(imported.body.importedCount, 1);
    assert.equal(imported.body.store.accounts[0].id, 'acct_123');
  });
});

test('rejects account imports when the payload has no account array', async () => {
  await withTestServer(async (baseUrl) => {
    const imported = await requestJson(`${baseUrl}/v1/import/accounts`, {
      method: 'POST',
      body: { source: 'manual-json', nope: true },
    });

    assert.equal(imported.status, 400);
    assert.equal(imported.body.ok, false);
    assert.match(imported.body.message, /account/i);
  });
});

test('selects and deletes SMS targets through the HTTP API', async () => {
  await withTestServer(async (baseUrl) => {
    const first = await requestJson(`${baseUrl}/v1/sms-targets`, {
      method: 'POST',
      body: {
        targets: [
          { phone: '4642204493', url: 'http://a.62-us.com/api/get_sms?key=secret' },
          { phone: '4484490880', url: 'http://a.62-us.com/api/get_sms?key=other' },
        ],
      },
    });

    assert.equal(first.status, 200);
    assert.equal(first.body.store.smsRelay.targets.length, 2);

    const selectedId = '+1:4484490880|http://a.62-us.com/api/get_sms?key=other';
    const patched = await requestJson(`${baseUrl}/v1/sms-relay`, {
      method: 'PATCH',
      body: { selectedTargetId: selectedId },
    });

    assert.equal(patched.status, 200);
    assert.equal(patched.body.store.smsRelay.selectedTargetId, selectedId);

    const deleted = await requestJson(`${baseUrl}/v1/sms-targets/${encodeURIComponent(selectedId)}`, {
      method: 'DELETE',
    });

    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.store.smsRelay.targets.length, 1);
    assert.equal(deleted.body.store.smsRelay.selectedTargetId, '+1:4642204493|http://a.62-us.com/api/get_sms?key=secret');
  });
});

test('closes automatically after the configured idle timeout', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'opx-local-server-idle-'));
  const server = createLocalStoreServer({ storeDir: dir, idleTimeoutMs: 30 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const closed = new Promise((resolve) => server.once('close', resolve));
    const health = await requestJson(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    await Promise.race([
      closed,
      new Promise((_, reject) => setTimeout(() => reject(new Error('server did not close after idle timeout')), 300)),
    ]);
  } finally {
    if (server.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await rm(dir, { recursive: true, force: true });
  }
});

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: await response.json(),
  };
}
