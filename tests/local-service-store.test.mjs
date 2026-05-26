import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createStoreRepository } from '../local-service/store.mjs';

async function withTempStore(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'opx-local-store-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('loads an empty store and creates store.json on first use', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });
    const store = await repo.load();

    assert.equal(store.version, 1);
    assert.deepEqual(store.accounts, []);

    const raw = JSON.parse(await readFile(join(dir, 'store.json'), 'utf8'));
    assert.equal(raw.version, 1);
  });
});

test('persists imported accounts and creates a backup on later writes', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });

    const imported = await repo.importAccounts([
      {
        id_token: 'id.token',
        access_token: 'access.token',
        refresh_token: '',
        account_id: 'acct_123',
        email: 'user@example.com',
        expired: '2026-05-23T00:00:00.000Z',
      },
    ]);
    assert.equal(imported.importedCount, 1);

    const deleted = await repo.deleteAccount('acct_123');
    assert.equal(deleted.deleted, true);

    const backupFiles = await readdir(join(dir, 'backups'));
    assert.equal(backupFiles.length, 2);

    const finalStore = await repo.load();
    assert.equal(finalStore.accounts.length, 0);
  });
});

test('patches SMS relay state while preserving existing targets', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });

    const first = await repo.upsertSmsTargets([
      { phone: '+14642649811', url: 'https://example.com/a' },
    ]);
    assert.equal(first.smsRelay.targets.length, 1);

    const patched = await repo.patchSmsRelay({
      selectedTargetId: '+14642649811|https://example.com/a',
      history: [
        { phone: '+14642649811', code: '123456', message: 'ok', receivedAt: 1779400000000 },
      ],
    });

    assert.equal(patched.smsRelay.targets.length, 1);
    assert.equal(patched.smsRelay.history.length, 1);
    assert.equal(patched.smsRelay.history[0].code, '123456');
  });
});

test('selects and deletes SMS targets with normalized nested API URLs', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });
    const url = 'http://a.62-us.com/api/get_sms?key=secret';

    const first = await repo.upsertSmsTargets([
      { phone: '4642204493', url },
      { phone: '4484490880', url: 'http://a.62-us.com/api/get_sms?key=other' },
    ]);

    assert.equal(first.smsRelay.targets.length, 2);
    assert.equal(first.smsRelay.targets[0].id, '+1:4642204493|http://a.62-us.com/api/get_sms?key=secret');

    const patched = await repo.patchSmsRelay({
      selectedTargetId: '+1:4484490880|http://a.62-us.com/api/get_sms?key=other',
    });

    assert.equal(patched.smsRelay.selectedTargetId, '+1:4484490880|http://a.62-us.com/api/get_sms?key=other');

    const deleted = await repo.deleteSmsTarget('+1:4484490880|http://a.62-us.com/api/get_sms?key=other');

    assert.equal(deleted.smsRelay.targets.length, 1);
    assert.equal(deleted.smsRelay.targets[0].phone, '4642204493');
    assert.equal(deleted.smsRelay.selectedTargetId, '+1:4642204493|http://a.62-us.com/api/get_sms?key=secret');
  });
});

test('deletes SMS targets when the panel sends a legacy target id', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });
    const url = 'http://a.62-us.com/api/get_sms?key=secret';

    await repo.upsertSmsTargets([{ phone: '+14642204493', url }]);
    const deleted = await repo.deleteSmsTarget(`4642204493|${url}`);

    assert.equal(deleted.smsRelay.targets.length, 0);
    assert.equal(deleted.smsRelay.selectedTargetId, '');
  });
});

test('selects SMS targets when the panel sends a legacy target id', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });
    const url = 'http://a.62-us.com/api/get_sms?key=secret';

    await repo.upsertSmsTargets([
      { phone: '+14642204493', url },
      { phone: '+14484490880', url: 'http://a.62-us.com/api/get_sms?key=other' },
    ]);
    const patched = await repo.patchSmsRelay({
      selectedTargetId: `4484490880|http://a.62-us.com/api/get_sms?key=other`,
    });

    assert.equal(patched.smsRelay.selectedTargetId, '+1:4484490880|http://a.62-us.com/api/get_sms?key=other');
  });
});

test('mirrors register email items into codex_accounts.json', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });

    await repo.upsertRegisterEmailItems([
      {
        id: 'email:origin@gmail.com',
        email: 'origin@gmail.com',
        accountLine: '',
        inputMode: 'email',
        selected: true,
        expanded: false,
        aliases: [
          {
            id: 'plus-gmail:origin+paypal1@gmail.com',
            email: 'origin+paypal1@gmail.com',
            category: 'plus-gmail',
            createdAt: 1779400000000,
          },
        ],
      },
    ]);

    const index = JSON.parse(await readFile(join(dir, 'codex', 'codex_accounts.json'), 'utf8'));
    assert.equal(index.version, 1);
    assert.equal(index.baseEmails.length, 1);
    assert.equal(index.baseEmails[0].email, 'origin@gmail.com');
    assert.equal(index.baseEmails[0].generated.length, 1);
    assert.equal(index.baseEmails[0].generated[0].email, 'origin+paypal1@gmail.com');
    assert.equal(index.baseEmails[0].generated[0].subscriptionStatus, 'unknown');
    assert.equal(index.baseEmails[0].generated[0].subscriptionType, 'unknown');
  });
});

test('mirrors saved session into codex account index and per-email session file', async () => {
  await withTempStore(async (dir) => {
    const repo = createStoreRepository({ storeDir: dir });

    await repo.upsertRegisterEmailItems([
      {
        id: 'email:origin@gmail.com',
        email: 'origin@gmail.com',
        accountLine: '',
        inputMode: 'email',
        selected: true,
        expanded: false,
        aliases: [
          {
            id: 'plus-gmail:origin+paypal1@gmail.com',
            email: 'origin+paypal1@gmail.com',
            category: 'plus-gmail',
            createdAt: 1779400000000,
          },
        ],
      },
    ]);

    await repo.upsertSessionAccount({
      id: 'acct_123',
      email: 'origin+paypal1@gmail.com',
      selected: true,
      idToken: 'id.token',
      accessToken: 'access.token',
      refreshToken: 'refresh.token',
      accountId: 'acct_123',
      planType: 'plus',
      planExpiresAt: '2026-06-24T00:00:00.000Z',
      sessionExpiredAt: '2026-05-25T00:00:00.000Z',
      lastRefreshAt: '2026-05-24T00:00:00.000Z',
      createdAt: 1779400000000,
      updatedAt: 1779400000000,
    });

    const index = JSON.parse(await readFile(join(dir, 'codex', 'codex_accounts.json'), 'utf8'));
    const generated = index.baseEmails[0].generated[0];
    assert.equal(generated.email, 'origin+paypal1@gmail.com');
    assert.equal(generated.subscriptionStatus, 'active');
    assert.equal(generated.subscriptionType, 'plus');
    assert.equal(generated.sessionFile, 'accounts/origin+paypal1@gmail.com.json');

    const session = JSON.parse(await readFile(join(dir, 'codex', 'accounts', 'origin+paypal1@gmail.com.json'), 'utf8'));
    assert.equal(session.email, 'origin+paypal1@gmail.com');
    assert.equal(session.access_token, 'access.token');
    assert.equal(session.type, 'codex');
  });
});

test('loads accounts and register email items from existing codex account mirror', async () => {
  await withTempStore(async (dir) => {
    await mkdir(join(dir, 'codex', 'accounts'), { recursive: true });
    await writeFile(join(dir, 'codex', 'codex_accounts.json'), JSON.stringify({
      version: 1,
      baseEmails: [
        {
          email: 'origin@gmail.com',
          accountLine: '',
          inputMode: 'email',
          selected: true,
          generated: [
            {
              email: 'origin+paypal1@gmail.com',
              category: 'plus-gmail',
              sessionFile: 'accounts/origin+paypal1@gmail.com.json',
              createdAt: 1779400000000,
            },
          ],
        },
      ],
    }, null, 2), 'utf8');
    await writeFile(join(dir, 'codex', 'accounts', 'origin+paypal1@gmail.com.json'), JSON.stringify({
      id_token: 'id.token',
      access_token: 'access.token',
      refresh_token: 'refresh.token',
      account_id: 'acct_123',
      email: 'origin+paypal1@gmail.com',
      type: 'codex',
      expired: '2026-05-25T00:00:00.000Z',
    }, null, 2), 'utf8');

    const repo = createStoreRepository({ storeDir: dir });
    const store = await repo.load();

    assert.equal(store.registerEmailItems.length, 1);
    assert.equal(store.registerEmailItems[0].email, 'origin@gmail.com');
    assert.equal(store.registerEmailItems[0].aliases[0].email, 'origin+paypal1@gmail.com');
    assert.equal(store.accounts.length, 1);
    assert.equal(store.accounts[0].email, 'origin+paypal1@gmail.com');
    assert.equal(store.accounts[0].accessToken, 'access.token');
  });
});
