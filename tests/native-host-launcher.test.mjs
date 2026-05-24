import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeNativeMessageBuffer,
  encodeNativeMessage,
  ensureLocalStoreRunning,
} from '../native-host/launcher.mjs';

test('encodes and decodes Chrome native messaging frames', () => {
  const encoded = encodeNativeMessage({ ok: true, command: 'ensure-local-store' });
  assert.equal(encoded.readUInt32LE(0), encoded.length - 4);

  const decoded = decodeNativeMessageBuffer(encoded);
  assert.deepEqual(decoded, { ok: true, command: 'ensure-local-store' });
});

test('starts the local store service when health check is unavailable', async () => {
  const spawns = [];
  let fetchCount = 0;
  const result = await ensureLocalStoreRunning({
    baseUrl: 'http://127.0.0.1:18788',
    authToken: 'native-test-token',
    nodePath: 'node-test',
    serverPath: 'local-service/server.mjs',
    retryDelayMs: 0,
    maxAttempts: 2,
    autoExitMs: 600_000,
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        throw new Error('offline');
      }
      return {
        ok: true,
        json: async () => ({ ok: true, version: 1 }),
      };
    },
    spawnImpl: (command, args, options) => {
      spawns.push({ command, args, options });
      return { unref() {} };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(fetchCount, 2);
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].command, 'node-test');
  assert.deepEqual(spawns[0].args, ['local-service/server.mjs']);
  assert.equal(spawns[0].options.detached, true);
  assert.equal(spawns[0].options.env.OPX_LOCAL_STORE_PORT, '18788');
  assert.equal(spawns[0].options.env.OPX_LOCAL_STORE_AUTO_EXIT_MS, '600000');
  assert.equal(spawns[0].options.env.OPX_LOCAL_STORE_TOKEN, 'native-test-token');
});
