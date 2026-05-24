import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAccountRecordFromSession,
  createAccountsExportFileName,
  getAccountRuntimeStatus,
  serializeAccountsForExport,
} from '../.tmp-test/src/features/accounts/session.js';

function tokenWithPayload(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${encoded}.signature`;
}

test('builds an account record from ChatGPT session and token expiry', () => {
  const accessToken = tokenWithPayload({
    exp: 1780209099,
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_123',
      chatgpt_plan_type: 'plus',
    },
    'https://api.openai.com/profile': {
      email: 'user+plus@gmail.com',
    },
  });
  const idToken = tokenWithPayload({
    email: 'user+plus@gmail.com',
  });

  const record = buildAccountRecordFromSession({
    ok: true,
    message: 'ok',
    session: {
      email: 'user+plus@gmail.com',
      planType: 'plus',
      accessToken,
      idToken,
      refreshToken: '',
      accountId: 'acct_123',
      planExpiresAt: '2026-06-21T00:00:00.000Z',
      sessionExpiredAt: '',
      fetchedAt: Date.parse('2026-05-21T08:00:00.000Z'),
    },
    raw: {},
  });

  assert.equal(record.email, 'user+plus@gmail.com');
  assert.equal(record.planType, 'plus');
  assert.equal(record.accountId, 'acct_123');
  assert.equal(record.sessionExpiredAt, '2026-05-31T06:31:39.000Z');
  assert.equal(record.planExpiresAt, '2026-06-21T00:00:00.000Z');
});

test('uses access token expiry before longer ChatGPT session expiry', () => {
  const accessToken = tokenWithPayload({
    exp: 1780309136,
    'https://api.openai.com/profile': {
      email: 'huangwei201811+test@gmail.com',
    },
  });

  const record = buildAccountRecordFromSession({
    ok: true,
    message: 'ok',
    session: {
      email: 'huangwei201811+test@gmail.com',
      planType: '',
      accessToken,
      idToken: '',
      refreshToken: '',
      accountId: '',
      planExpiresAt: '',
      sessionExpiredAt: '2026-08-20T10:19:12.693Z',
      fetchedAt: Date.parse('2026-05-22T10:19:10.379Z'),
    },
    raw: {},
  });

  assert.equal(record.sessionExpiredAt, '2026-06-01T10:18:56.000Z');
});

test('normalizes maintained accounts using access token expiry before stored session expiry', async () => {
  const { normalizeAccountRecords } = await import('../.tmp-test/src/features/accounts/session.js');
  const accessToken = tokenWithPayload({
    exp: 1780309136,
    'https://api.openai.com/profile': {
      email: 'huangwei201811+test@gmail.com',
    },
  });

  const [record] = normalizeAccountRecords([
    {
      email: 'huangwei201811+test@gmail.com',
      accessToken,
      sessionExpiredAt: '2026-08-20T10:19:12.693Z',
    },
  ]);

  assert.equal(record.sessionExpiredAt, '2026-06-01T10:18:56.000Z');
});

test('normalizes imported accounts with plan metadata from id token before access token', async () => {
  const { normalizeAccountRecords } = await import('../.tmp-test/src/features/accounts/session.js');
  const idToken = tokenWithPayload({
    email: 'id-plan@example.com',
    'https://api.openai.com/auth': {
      chatgpt_plan_type: 'plus',
      account_id: 'acct_from_id',
    },
  });
  const accessToken = tokenWithPayload({
    exp: 1780209099,
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_from_access',
      chatgpt_plan_type: 'free',
    },
  });

  const [record] = normalizeAccountRecords([
    {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: 'refresh.token',
      email: 'id-plan@example.com',
      type: 'codex',
    },
  ]);

  assert.equal(record.planType, 'plus');
  assert.equal(record.accountId, 'acct_from_access');
  assert.equal(record.sessionExpiredAt, '2026-05-31T06:31:39.000Z');
});

test('normalizes access-token-only imported accounts with Cockpit Tools claims', async () => {
  const { normalizeAccountRecords } = await import('../.tmp-test/src/features/accounts/session.js');
  const accessToken = tokenWithPayload({
    exp: 1780209099,
    email: 'access-only@example.com',
    'https://api.openai.com/auth': {
      chatgpt_account_id: 'acct_access_only',
      chatgpt_plan_type: 'team',
    },
  });

  const [record] = normalizeAccountRecords([
    {
      access_token: accessToken,
      refresh_token: 'refresh.token',
      email: 'access-only@example.com',
      type: 'codex',
    },
  ]);

  assert.equal(record.planType, 'team');
  assert.equal(record.accountId, 'acct_access_only');
});

test('reports plan and session expiry independently', () => {
  const record = buildAccountRecordFromSession({
    ok: true,
    message: 'ok',
    session: {
      email: 'expired@gmail.com',
      planType: 'plus',
      accessToken: tokenWithPayload({ exp: 1779350400 }),
      idToken: '',
      refreshToken: '',
      accountId: 'acct_expired',
      planExpiresAt: '2026-05-20T00:00:00.000Z',
      sessionExpiredAt: '',
      fetchedAt: Date.parse('2026-05-21T08:00:00.000Z'),
    },
    raw: {},
  });

  const status = getAccountRuntimeStatus(record, Date.parse('2026-05-21T08:00:00.000Z'));

  assert.equal(status.planExpired, true);
  assert.equal(status.sessionExpired, true);
});

test('serializes selected accounts using codex account JSON format', () => {
  const first = buildAccountRecordFromSession({
    ok: true,
    message: 'ok',
    session: {
      email: 'first@gmail.com',
      planType: 'plus',
      accessToken: tokenWithPayload({ exp: 1780209099 }),
      idToken: 'id.first.token',
      refreshToken: '',
      accountId: 'acct_first',
      planExpiresAt: '',
      sessionExpiredAt: '',
      fetchedAt: Date.parse('2026-05-21T08:00:00.000Z'),
    },
    raw: {},
  });
  const second = buildAccountRecordFromSession({
    ok: true,
    message: 'ok',
    session: {
      email: 'second@gmail.com',
      planType: 'free',
      accessToken: tokenWithPayload({ exp: 1780209099 }),
      idToken: 'id.second.token',
      refreshToken: '',
      accountId: 'acct_second',
      planExpiresAt: '',
      sessionExpiredAt: '',
      fetchedAt: Date.parse('2026-05-21T09:00:00.000Z'),
    },
    raw: {},
  });

  const exported = serializeAccountsForExport([first, second], new Set([first.id]));
  const parsed = JSON.parse(exported);

  assert.equal(parsed.length, 1);
  assert.deepEqual(Object.keys(parsed[0]), [
    'id_token',
    'access_token',
    'refresh_token',
    'account_id',
    'checkout_url',
    'subscription_status',
    'subscription_type',
    'last_refresh',
    'email',
    'type',
    'expired',
  ]);
  assert.equal(parsed[0].email, 'first@gmail.com');
  assert.equal(parsed[0].type, 'codex');
  assert.equal(parsed[0].expired, '2026-05-31T06:31:39.000Z');
});

test('creates account export file names with account count and local minute timestamp', () => {
  const fileName = createAccountsExportFileName(12, new Date(2026, 4, 22, 21, 35, 49));

  assert.equal(fileName, 'codex_accounts_12_accounts_202605222135.json');
});
